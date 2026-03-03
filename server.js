#!/usr/bin/env node
/**
 * SwiftDrop Signaling Server
 * Pure Node.js — zero npm dependencies
 * Uses raw WebSocket handshake (RFC 6455)
 *
 * Run: node server.js
 * Default port: 3000  (set PORT env var to change)
 */

'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// ── In-memory room store ──────────────────────────────
// rooms: Map<roomCode, Map<peerId, socket>>
const rooms = new Map();
const socketMeta = new Map(); // socket -> { peerId, roomCode }

// ── HTTP + WS Server ─────────────────────────────────
const server = http.createServer((req, res) => {
  // Serve the frontend HTML file
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    const filePath = path.join(__dirname, 'index.html');
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('index.html not found — place it next to server.js');
    }
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, sockets: socketMeta.size }));
    return;
  }

  res.writeHead(404);
  res.end();
});

// ── Raw WebSocket implementation (RFC 6455) ───────────
server.on('upgrade', (req, socket) => {
  if (req.headers['upgrade']?.toLowerCase() !== 'websocket') {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return;
  }

  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.end(); return; }

  // Handshake
  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  socket.isAlive = true;
  let frameBuffer = Buffer.alloc(0);

  socket.on('data', (data) => {
    frameBuffer = Buffer.concat([frameBuffer, data]);
    while (frameBuffer.length >= 2) {
      const frame = parseFrame(frameBuffer);
      if (!frame) break;
      frameBuffer = frameBuffer.slice(frame.consumed);
      if (frame.opcode === 0x8) { cleanupSocket(socket); socket.end(); break; }
      if (frame.opcode === 0x9) { sendFrame(socket, Buffer.alloc(0), 0xA); continue; } // pong
      if (frame.opcode === 0x1 || frame.opcode === 0x2) {
        handleMessage(socket, frame.payload.toString('utf8'));
      }
    }
  });

  socket.on('error', () => cleanupSocket(socket));
  socket.on('close', () => cleanupSocket(socket));
});

// ── Frame parser ──────────────────────────────────────
function parseFrame(buf) {
  if (buf.length < 2) return null;
  const fin = (buf[0] & 0x80) !== 0;
  const opcode = buf[0] & 0x0F;
  const masked = (buf[1] & 0x80) !== 0;
  let payloadLen = buf[1] & 0x7F;
  let offset = 2;

  if (payloadLen === 126) {
    if (buf.length < 4) return null;
    payloadLen = buf.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buf.length < 10) return null;
    payloadLen = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }

  const maskLen = masked ? 4 : 0;
  if (buf.length < offset + maskLen + payloadLen) return null;

  let payload = buf.slice(offset + maskLen, offset + maskLen + payloadLen);
  if (masked) {
    const mask = buf.slice(offset, offset + 4);
    payload = Buffer.from(payload);
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
  }

  return { opcode, payload, consumed: offset + maskLen + payloadLen };
}

// ── Frame sender ──────────────────────────────────────
function sendFrame(socket, payload, opcode = 0x1) {
  if (!socket.writable) return;
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  try {
    socket.write(Buffer.concat([header, Buffer.isBuffer(payload) ? payload : Buffer.from(payload)]));
  } catch (e) {}
}

function send(socket, obj) {
  sendFrame(socket, Buffer.from(JSON.stringify(obj)));
}

// ── Message handler ───────────────────────────────────
function handleMessage(socket, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }

  const meta = socketMeta.get(socket) || {};

  switch (msg.type) {

    case 'create-room': {
      const code = genCode();
      const peerId = genId();
      rooms.set(code, new Map([[peerId, socket]]));
      socketMeta.set(socket, { peerId, roomCode: code });
      send(socket, { type: 'room-created', roomCode: code, peerId });
      console.log(`[+] Room ${code} created by ${peerId}`);
      break;
    }

    case 'join-room': {
      const code = msg.roomCode?.toUpperCase();
      if (!rooms.has(code)) {
        send(socket, { type: 'error', message: 'Room not found. Check the code and try again.' });
        return;
      }
      const room = rooms.get(code);
      if (room.size >= 8) {
        send(socket, { type: 'error', message: 'Room is full (max 8 peers).' });
        return;
      }
      const peerId = genId();
      room.set(peerId, socket);
      socketMeta.set(socket, { peerId, roomCode: code });

      // Tell joiner who's already in the room
      const existingPeers = [...room.keys()].filter(id => id !== peerId);
      send(socket, { type: 'room-joined', roomCode: code, peerId, existingPeers });

      // Tell all existing peers about the new joiner
      for (const [existId, existSocket] of room) {
        if (existId !== peerId) {
          send(existSocket, { type: 'peer-joined', peerId });
        }
      }

      console.log(`[+] ${peerId} joined room ${code} (${room.size} peers)`);
      break;
    }

    // WebRTC signaling relay — forward to specific peer
    case 'offer':
    case 'answer':
    case 'ice-candidate': {
      const { roomCode, peerId } = meta;
      if (!roomCode || !peerId) return;
      const room = rooms.get(roomCode);
      if (!room) return;
      const targetSocket = room.get(msg.to);
      if (targetSocket) {
        send(targetSocket, { ...msg, from: peerId });
      }
      break;
    }

    case 'leave': {
      cleanupSocket(socket);
      break;
    }
  }
}

// ── Cleanup ───────────────────────────────────────────
function cleanupSocket(socket) {
  const meta = socketMeta.get(socket);
  if (!meta) return;
  const { peerId, roomCode } = meta;
  socketMeta.delete(socket);

  if (roomCode && rooms.has(roomCode)) {
    const room = rooms.get(roomCode);
    room.delete(peerId);

    // Notify remaining peers
    for (const [, s] of room) {
      send(s, { type: 'peer-left', peerId });
    }

    // Remove empty rooms
    if (room.size === 0) {
      rooms.delete(roomCode);
      console.log(`[-] Room ${roomCode} closed`);
    } else {
      console.log(`[-] ${peerId} left room ${roomCode} (${room.size} remaining)`);
    }
  }
}

// ── Utils ─────────────────────────────────────────────
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for (let i = 0; i < 6; i++) r += chars[Math.floor(Math.random() * chars.length)];
  // Ensure unique
  return rooms.has(r) ? genCode() : r;
}

function genId() {
  return crypto.randomBytes(6).toString('hex');
}

// ── Heartbeat — drop dead connections every 30s ───────
setInterval(() => {
  for (const [socket] of socketMeta) {
    if (!socket.writable) cleanupSocket(socket);
  }
}, 30000);

// ── Start ─────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ⚡ SwiftDrop Signaling Server');
  console.log('  ─────────────────────────────');
  console.log(`  Running at: http://0.0.0.0:${PORT}`);
  console.log('');
  console.log('  Open this URL on ALL devices (same WiFi):');

  // Print local IP for convenience
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        console.log(`  → http://${addr.address}:${PORT}`);
      }
    }
  }
  console.log('');
});