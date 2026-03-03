# SwiftDrop — Instant File Transfer

A blazing-fast, peer-to-peer file transfer application that works directly on your local WiFi network. No cloud. No accounts. No installations required.

![SwiftDrop](https://img.shields.io/badge/Platform-WebRTC-blue) ![License](https://img.shields.io/badge/License-MIT-green)

## ✨ Features

- **Direct P2P Transfer** — Files go directly from device to device via WebRTC DataChannels
- **Zero Backend** — No servers, no cloud storage, no accounts needed
- **Local Network Only** — Your files never leave your WiFi network
- **Multi-file Support** — Transfer multiple files simultaneously
- **Real-time Progress** — Live transfer speed and progress indicators
- **Local Storage** — Received files saved to IndexedDB on your device
- **Offline Ready** — PWA with service worker support
- **Beautiful UI** — Modern dark theme with smooth animations

## 🚀 How It Works

1. **Create a Room** — One device creates a room and gets a 6-character code
2. **Share the Code** — Tell the code to other devices on the same WiFi network
3. **Join Room** — Other devices enter the code to connect
4. **Transfer Files** — Drag & drop files to send instantly to all connected peers

## 🛠 Technology Stack

- **WebRTC** — Peer-to-peer data channels for file transfer
- **IndexedDB** — Local browser storage for received files
- **BroadcastChannel API** — Local network signaling (within same origin)
- **Service Worker** — PWA offline capability
- **Pure HTML/CSS/JS** — No frameworks, no build steps

## 📋 Browser Compatibility

| Browser | Support |
|---------|---------|
| Chrome | ✅ Full |
| Firefox | ✅ Full |
| Edge | ✅ Full |
| Safari | ✅ Full |
| Mobile Chrome | ✅ Full |
| Mobile Safari | ✅ Full |

> **Note**: All devices must be on the same WiFi network. For cross-origin deployments, replace the BroadcastChannel signaling with a WebSocket server.

## 🔧 Technical Details

### Transfer Protocol
- **Chunk Size**: 64KB optimal chunks for WebRTC DataChannel
- **Buffer Management**: 256KB low watermark to prevent backpressure
- **Reliability**: Ordered, reliable mode (lossless)
- **ICE Servers**: Google STUN servers for NAT traversal

### Storage
- Files stored in IndexedDB (`SwiftDropDB`)
- Automatic storage quota management
- Support for files of any size

### Network Requirements
- All devices on same local network (LAN)
- UDP/TCP ports available for WebRTC
- STUN servers accessible for NAT traversal

## 📱 Usage

### Desktop
1. Open `swiftdrop.html` in a modern browser
2. Click "Create Room" to generate a room code
3. Share the 6-character code with other devices
4. Other devices click "Join Room" and enter the code
5. Drag and drop files to transfer

### Mobile
1. Open the page on your phone
2. Host creates a room on desktop, or vice versa
3. Enter the code on the joining device
4. Tap the drop zone to select files or use the share menu

## 🔐 Privacy

- Files are transferred directly between devices (P2P)
- Nothing is uploaded to any server
- No data leaves your local network
- No user accounts or tracking

## 🚨 Limitations

- All devices must be on the same WiFi network
- Some corporate networks block peer-to-peer connections
- Large files may take time depending on network speed
- Works best within same local network (LAN)

## 🎨 Customization

### Changing the Theme
Modify CSS variables in the `<style>` section:
```css
:root {
  --bg: #0a0a0f;           /* Background */
  --accent: #00f5c4;       /* Primary accent (teal) */
  --accent2: #7c3aed;      /* Secondary accent (purple) */
}
```

### Custom ICE Servers
Update the `ICE_SERVERS` array in the JavaScript:
```javascript
const ICE_SERVERS = [
  { urls: 'stun:your-stun-server.com:3478' },
  { urls: 'stun:another-stun.com:19302' }
];
```

## 📄 License

MIT License — Feel free to use, modify, and distribute.

## 🤝 Contributing

1. Fork the repository
2. Make your changes
3. Submit a pull request

---

**Made with ⚡ for fast, private file sharing**

