# EchoCast – Multi-Device Synchronized Audio Streaming

EchoCast is a zero-cloud, multi-device synchronized audio broadcasting platform engineered for local Wi-Fi networks and mobile hotspots. It allows one **Sender** device to stream high-fidelity audio to 5–10 **Receiver** devices (Android phones, iPhones, Windows laptops, Mac computers) in real-time with sub-10ms precision synchronization—without requiring internet connectivity.

---

## Key Features

- **Local-First & Offline**: Operates entirely over local Wi-Fi router or mobile hotspot. No external cloud servers, third-party APIs, or internet required.
- **Precision Clock Synchronization (NTP / PTP over WebSocket)**: Continuously aligns device hardware clocks with outlier rejection, low-RTT weighting, and jitter compensation.
- **Microsecond Audio Scheduling via Web Audio API**: Bypasses HTML5 `<audio>` element jitter by using native `AudioContext.currentTime` hardware timers and `AudioBufferSourceNode`.
- **Automatic Network Discovery**: Server auto-detects Wi-Fi adapters, Ethernet interfaces, and mobile hotspot subnets (`192.168.43.x`, `172.20.10.x`, `192.168.137.x`).
- **Instant QR Code Pairing**: Receivers can join in seconds by scanning the sender's dynamic QR code with any mobile camera.
- **Independent Hardware Output Calibration**:
  - Built-in speaker vs Bluetooth speaker compensation presets (+160ms A2DP buffer compensation).
  - Fine-grained interactive calibration slider (-250ms to +350ms in 5ms increments).
  - Integrated acoustic sync test pulse (1kHz synchronized pulse) to audibly verify and lock in multi-device alignment.
- **Built-in Calibration Metronome**: Pre-generates a rhythmic calibration WAV track on startup so the system can be tested immediately with zero configuration.
- **Live Visualizer & Remote Controls**: Real-time stereo frequency spectrum analyser, master broadcast controls, and per-receiver volume and mute control from the sender dashboard.

---

## Architectural Overview

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
│  │    Network Service    │  │   Sync Engine (PTP)   │  │   Audio Streaming Service  │  │
│  │ - OS Network Resolver │  │ - Monotonic Clock     │  │ - HTTP 206 Byte-Range      │  │
│  │ - Hotspot/Wi-Fi Auto  │  │ - NTP Ping/Pong       │  │ - Built-in WAV Generator   │  │
│  │ - QR Code Endpoint    │  │ - Future Event Sched. │  │ - Multer File Ingestion    │  │
│  └───────────────────────┘  └───────────────────────┘  └────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  ┌────────────────────────────┐  │
│  │               WebSocket Server (/ws)              │  │   Device Manager Service   │  │
│  │ - Real-time command bus & broadcast distribution │  │ - Receiver registry & RTT  │  │
│  └──────────────────────────────────────────────────┘  └────────────────────────────┘  │
└───────────────────────────┬───────────────────────────────────┬────────────────────────┘
                            │ HTTP Audio Stream                 │ WebSocket Sync & State
                            ▼                                   ▼
        ┌───────────────────────────────────────────────────────────────┐
        │                 Receiver Nodes (5–10 Devices)                 │
        │     (Android Chrome, iPhone Safari, Windows, Mac, Linux)      │
        │                                                               │
        │   ┌─────────────────────┐       ┌─────────────────────────┐   │
        │   │   TimeSync Engine   │       │     Web Audio Engine    │   │
        │   │ - Offset estimation │──────▶│ - AudioContext Buffer   │   │
        │   │ - Outlier filtering │       │ - Hardware Latency Cal. │   │
        │   │ - Continuous drift  │       │ - Precise start at time │   │
        │   └─────────────────────┘       └────────────┬────────────┘   │
        │                                              ▼                │
        │                               ┌───────────────────────────┐   │
        │                               │   Built-in / Bluetooth    │   │
        │                               │      Speaker Output       │   │
        │                               └───────────────────────────┘   │
        └───────────────────────────────────────────────────────────────┘
```

### Module Responsibilities

1. **Sender Interface (`client/src/components/sender`)**:
   - Master transport controls (Play, Pause, Seek, Stop, Loop, Volume).
   - Audio file drag-and-drop uploader (MP3, WAV, FLAC, OGG, AAC) + built-in sync beat selector.
   - Live roster of all connected receivers with RTT latency, clock offset, output mode, and remote volume control.
   - Synchronized test pulse broadcaster.

2. **Receiver Interface (`client/src/components/receiver`)**:
   - Synchronized playback engine with live audio visualizer.
   - Audio routing toggle (Built-in Speaker vs Bluetooth Speaker).
   - Real-time latency calibration slider and local sound check.
   - One-tap Web Audio unlock overlay for iOS Safari & Android Chrome.

3. **Time Synchronization Engine (`client/src/core/sync/timeSync.ts` & `server/src/services/syncEngineService.ts`)**:
   - High-resolution monotonic server clock (`process.hrtime.bigint`).
   - NTP round-trip time calculation:
     $$\text{RTT} = (t_3 - t_0) - (t_2 - t_1)$$
     $$\text{Clock Offset } \theta = \frac{(t_1 - t_0) + (t_2 - t_3)}{2}$$
   - Lowest-RTT sample weighting (rejects queuing delays) and standard deviation jitter tracking.

4. **Web Audio Playback Engine (`client/src/core/audio/webAudioEngine.ts`)**:
   - Pre-buffers decoded PCM audio data into memory.
   - Converts server scheduled timestamp to hardware audio clock:
     $$\text{Target Audio Time} = \text{currentTime} + \frac{\text{ScheduledTime} - \text{ServerNow} - \text{TotalLatency}}{1000}$$
   - Stereo `AnalyserNode` for responsive frequency visualization.

5. **Audio Streaming Service (`server/src/services/audioStreamService.ts`)**:
   - HTTP Range request support (`206 Partial Content`) for chunked audio delivery.
   - In-memory synthetic 12-second calibration WAV generator (120 BPM rhythmic pulses).
   - Multer file ingestion and local storage.

6. **Device Management Service (`server/src/services/deviceManagerService.ts`)**:
   - Tracks active connected devices, platforms, outputs, volumes, and pings.
   - Automatic dead socket reaping via WebSocket heartbeat interval.

---

## Installation & Execution

### Prerequisites
- Node.js 18+ (tested on Node v20+ and v26+)
- npm 9+

### 1. Install Dependencies
Run from the project root:
```bash
npm install
```

### 2. Development Mode
Run both frontend (Vite) and backend (Express + WebSocket) with live reload:
```bash
npm run dev
```
- Client runs on `http://localhost:3000`
- Server runs on `http://0.0.0.0:4000`

### 3. Production Build & Execution
Build both client and server:
```bash
npm run build
```

Run the unified production server (serves API, WebSocket, and static SPA):
```bash
npm start
```
The console will display the detected local IP addresses:
```
========================================================
  EchoCast Server Started on port 4000
========================================================
  • [Wi-Fi] http://192.168.1.30:4000 (WI-FI)
  Primary Access URL: http://192.168.1.30:4000
  WebSocket Endpoint: ws://192.168.1.30:4000/ws
========================================================
```

### 4. Type Checking
Verify all TypeScript types across client, server, and shared packages:
```bash
npm run typecheck
```

---

## How to Connect Multiple Devices (Wi-Fi or Hotspot)

### Option A: Local Wi-Fi Router
1. Connect the host computer and all phones/laptops to the same Wi-Fi network.
2. Start the server (`npm start`).
3. On the host computer, open the URL in Chrome or Edge: `http://localhost:4000` (select **Sender** mode).
4. Click **"Pair Devices"** in the top bar to display the QR Code.
5. On 5–10 other devices (phones, tablets, laptops), scan the QR code with the camera to open `http://<HOST-IP>:4000` (select **Receiver** mode).
6. Tap **"Activate Now"** on mobile devices to unlock Web Audio.
7. Click **"Play"** on the sender: all devices will start playing in tight sync!

### Option B: Mobile Hotspot (No Router & No Internet Required)
1. Turn on **Personal Hotspot / Portable Wi-Fi Hotspot** on any phone or laptop (cellular data can be switched off).
2. Connect all other devices to this hotspot Wi-Fi.
3. Start the server on one of the connected laptops or phones.
4. EchoCast automatically detects the hotspot subnet (`192.168.43.x` for Android, `172.20.10.x` for iPhone, `192.168.137.x` for Windows).
5. Open the highlighted IP on all receivers to stream audio synchronously.

---

## Bluetooth Speaker Latency Calibration

Bluetooth audio transmission introduces 120ms–220ms of hardware buffering (A2DP codec delay). When a receiver connects a Bluetooth speaker:
1. On the Receiver dashboard, toggle the output mode from **"Built-in Speaker"** to **"Bluetooth Speaker"**.
2. This automatically applies the `+160ms` latency compensation preset.
3. If necessary, use the **Manual Latency Adjustment slider** to fine-tune in 5ms steps.
4. The sender can also trigger the **"Broadcast 1kHz Sync Click"** to audibly confirm zero phase difference across all speakers.

---

## Native Mobile & Desktop Roadmap

The codebase architecture strictly decouples platform-independent core logic (`src/core/audio`, `src/core/sync`, `src/core/network`) from React views:
- **Android & iOS**: Can be packaged into native standalone apps using **Capacitor** (`@capacitor/core`) or **React Native**.
- **Windows & macOS**: Can be packaged as a lightweight desktop menu-bar / tray app using **Electron** or **Tauri**.
