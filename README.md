# EchoCast – Multi-Device Synchronized Audio Streaming

EchoCast is a zero-cloud, cross-platform, multi-device synchronized audio broadcasting system engineered for local Wi-Fi networks and mobile hotspots. It allows one **Sender** host device to stream high-fidelity audio to 5–10 **Receiver** devices (Android phones, iPhones, Windows laptops, Mac computers, tablets) in real-time with microsecond-level synchronization—without requiring internet connectivity or external cloud infrastructure.

---

## 📑 Project Documentation Index

- **[INSTALLATION.md](file:///c:/Users/Lokesh/Desktop/web%20echo%20cast/INSTALLATION.md)**: Prerequisites, step-by-step setup, production building, firewall rules, and deployment.
- **[USER_GUIDE.md](file:///c:/Users/Lokesh/Desktop/web%20echo%20cast/USER_GUIDE.md)**: Sender workflows, receiver onboarding, playlist management, group controls, and Bluetooth calibration.
- **[NETWORK_SETUP.md](file:///c:/Users/Lokesh/Desktop/web%20echo%20cast/NETWORK_SETUP.md)**: Home Wi-Fi, Android/iPhone/Windows mobile hotspots, offline operation, and router AP isolation fixes.
- **[TEST_REPORT.md](file:///c:/Users/Lokesh/Desktop/web%20echo%20cast/TEST_REPORT.md)**: Full verification results (96/96 automated tests passing across 4 comprehensive suites).
- **[KNOWN_LIMITATIONS.md](file:///c:/Users/Lokesh/Desktop/web%20echo%20cast/KNOWN_LIMITATIONS.md)**: Browser autoplay policies, mobile tab throttling, Bluetooth A2DP latency, and mitigation strategies.
- **[HOTSPOT_SETUP_GUIDE.md](file:///c:/Users/Lokesh/Desktop/web%20echo%20cast/HOTSPOT_SETUP_GUIDE.md)**: Dedicated quick-reference for hotspot streaming.

---

## 🎯 Key Capabilities

- **Zero-Internet Local Operation**: Operates 100% locally over standard Wi-Fi routers or mobile hotspots. Zero cloud servers, third-party APIs, or internet bandwidth needed.
- **Precision Clock Synchronization (SNTP over WebSocket)**: Continuously measures round-trip time (RTT), jitter variance, and device clock skew to maintain sub-10ms synchronization across heterogeneous hardware.
- **Hardware-Timed Audio Scheduling (Web Audio API)**: Avoids HTML5 `<audio>` latency and jitter by scheduling PCM buffers directly via `AudioContext.currentTime` with high-resolution monotonic timestamps.
- **Dynamic Drift Correction Engine**: Smoothly adjusts `playbackRate` (±1.5% to ±3.0%) when clocks drift, eliminating acoustic pitch fluttering while pulling devices back into lockstep.
- **Automatic Network Discovery**: Server auto-detects Wi-Fi adapters, Ethernet interfaces, and mobile hotspot subnets (`192.168.43.x`, `172.20.10.x`, `192.168.137.x`).
- **Instant QR Code Onboarding**: Receivers can join in seconds by pointing a phone camera at the dynamic QR code displayed on the sender screen.
- **Heterogeneous Audio Output Calibration**:
  - Independent output mode profiles for Built-in Speakers vs Bluetooth Speakers (+160ms A2DP buffer compensation).
  - Fine-grained interactive calibration slider (-250ms to +350ms in 5ms increments).
  - Integrated acoustic sync test pulse (1kHz synchronized pulse) to audibly verify and lock in multi-device alignment.
- **Multi-Device Roster & Group Controls**: Real-time connected receiver count, platform detection, master transport controls (Play All, Pause All, Stop All, Seek All, Next/Prev), master volume, mute all, and individual receiver volume/mute overrides.
- **Progressive Web App (PWA)**: Installable directly from the browser on iOS, Android, macOS, and Windows with offline shell caching.

---

## 🏛️ System Architecture

```
                      ┌─────────────────────────────────────────┐
                      │          Sender Console (Web)           │
                      │  - Audio Track Selector / File Upload   │
                      │  - Master Transport & Scrub Controls    │
                      │  - Receiver Roster & Latency Gauges     │
                      └────────────────────┬────────────────────┘
                                           │ WebSocket Commands
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                  EchoCast Local Server                                  │
│                                                                                        │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌────────────────────────────┐  │
│  │    Network Service    │  │   Sync Engine (SNTP)  │  │   Audio Streaming Service  │  │
│  │ - OS Network Resolver │  │ - Monotonic Clock     │  │ - HTTP 206 Byte-Range      │  │
│  │ - Hotspot/Wi-Fi Auto  │  │ - NTP Ping/Pong       │  │ - In-Memory WAV Generator  │  │
│  │ - QR Code Endpoint    │  │ - Future Event Sched. │  │ - Magic-Bytes File Check   │  │
│  └───────────────────────┘  └───────────────────────┘  └────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  ┌────────────────────────────┐  │
│  │               WebSocket Server (/ws)              │  │   Device Manager Service   │  │
│  │ - Real-time command bus & broadcast distribution │  │ - Receiver registry & RTT  │  │
│  │ - 64KB message guard & session deduplication     │  │ - Group & individual volume│  │
│  └──────────────────────────────────────────────────┘  └────────────────────────────┘  │
└───────────────────────────┬───────────────────────────────────┬────────────────────────┘
                            │ HTTP Audio Stream (206)           │ WebSocket Sync & State
                            ▼                                   ▼
        ┌───────────────────────────────────────────────────────────────┐
        │                 Receiver Nodes (5–10 Devices)                 │
        │     (Android Chrome, iPhone Safari, Windows, Mac, Linux)      │
        │                                                               │
        │   ┌─────────────────────┐       ┌─────────────────────────┐   │
        │   │   TimeSync Engine   │       │     Web Audio Engine    │   │
        │   │ - Offset estimation │──────▶│ - AudioContext Buffer   │   │
        │   │ - Outlier filtering │       │ - Hardware Latency Cal. │   │
        │   │ - Dynamic drift rate│       │ - Precise start at time │   │
        │   └─────────────────────┘       └────────────┬────────────┘   │
        │                                              ▼                │
        │                               ┌───────────────────────────┐   │
        │                               │   Built-in / Bluetooth    │   │
        │                               │      Speaker Output       │   │
        │                               └───────────────────────────┘   │
        └───────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend Framework** | React 18, Vite 6, TypeScript 5, Tailwind CSS 3 |
| **Icons & Visuals** | Lucide React, HTML5 Canvas 2D Spectrum Analyser |
| **Audio Processing** | Web Audio API (`AudioContext`, `AudioBufferSourceNode`, `AnalyserNode`, `GainNode`) |
| **Backend Runtime** | Node.js 18+ (verified on Node v20 LTS and Node v26) |
| **Networking & HTTP** | Express 4, HTTP 206 Partial Content Range Streaming, Multer |
| **Real-Time Messaging** | `ws` (RFC 6455 WebSocket Server & Client) |
| **Clock Synchronization** | SNTP (Simple Network Time Protocol) algorithm over WebSocket |
| **PWA & Mobile** | Web App Manifest, Service Worker (offline shell caching), Touch Icons |
| **Platform Scaffolding** | Android Studio / Capacitor (`android/`), iOS Xcode (`ios/`), Electron (`desktop/`) |

---

## 🚀 Quick Start Guide

### 1. Install Dependencies
```bash
npm install
```

### 2. Build for Production
```bash
npm run build
```

### 3. Start the Server
```bash
npm start
```
The server binds to `0.0.0.0:4000` and displays your local IP addresses:
```
========================================================
  EchoCast Production Server Active on port 4000
========================================================
  • [Wi-Fi] http://192.168.1.50:4000 (WI-FI)
  Primary Access URL: http://192.168.1.50:4000
  WebSocket Endpoint: ws://192.168.1.50:4000/ws
========================================================
```

### 4. Connect Devices
- **Sender**: Open `http://localhost:4000` on the host machine. Select **Start Streaming**.
- **Receivers**: Point the camera of phones, tablets, or laptops at the QR code, or open `http://<SENDER-IP>:4000`. Tap **Activate Audio Output**.
- Press **Play All** on the sender to begin synchronized playback across all devices!

---

## 🧪 Automated Test Verification

EchoCast includes a comprehensive automated test harness covering streaming, synchronization, device management, and failure recovery:

```bash
# Run all 96 automated tests across all 4 suites
npm run test:all
```

Individual test suites:
- `npm run test:streaming`: HTTP 206 partial content, ETags, 10-receiver concurrent streaming (31 tests).
- `npm run test:sync`: SNTP clock sync, skew compensation, future scheduled playback, dynamic drift correction (20 tests).
- `npm run test:devices`: Multi-device roster, group controls (Play All, Pause All, Seek All, Master Volume), individual volume isolation, duplicate session prevention (20 tests).
- `npm test`: 13 real-world scenarios (Wi-Fi, hotspot, dropouts, reconnections, buffer underruns, IP migrations) and security protections (25 tests).

**Result**: **96 / 96 Passed (100% Success Rate)**. See [TEST_REPORT.md](file:///c:/Users/Lokesh/Desktop/web%20echo%20cast/TEST_REPORT.md) for full benchmark logs.

---

## 📱 Platform Preparation Status

In accordance with strict deployment verification rules:
- **Web Application & PWA**: **100% Complete & Built**. Fully functional, responsive, and installable as a PWA directly from the browser on Android, iOS, Windows, and macOS.
- **Android Architecture (`android/`)**: **Fully Prepared**. Includes `AndroidManifest.xml` with cleartext network configuration, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` service, Wi-Fi low-latency lock, and build instructions. *(Architecture prepared; native .apk not compiled on this machine).*
- **iOS Architecture (`ios/`)**: **Fully Prepared**. Includes `Info.plist` with `NSLocalNetworkUsageDescription`, `UIBackgroundModes: audio`, ATS LAN allowances, and Xcode setup guide. *(Architecture prepared; native .ipa not compiled on this machine).*
- **Desktop Architecture (`desktop/`)**: **Fully Prepared**. Includes Electron main process (`main.js`), secure preload bridge (`preload.js`), system media keys integration, background unthrottling, and `electron-builder` packaging configs for Windows NSIS and macOS DMG.
