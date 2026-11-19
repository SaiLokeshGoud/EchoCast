# EchoCast – Installation & Deployment Guide

This guide provides instructions for installing, configuring, building, and deploying the **EchoCast** synchronized multi-device audio streaming system on local networks.

---

## 1. System Requirements

### Host Machine (Sender / Server)
- **Operating System**: Windows 10/11, macOS 12+ (Monterey or later), Linux (Ubuntu 20.04+, Debian 11+, Arch), or Raspberry Pi OS (64-bit).
- **Runtime**: Node.js 18.0.0 or higher (v20 LTS or v22+ recommended; verified on Node v26).
- **Package Manager**: npm 9.0.0 or higher (or yarn/pnpm).
- **Network Interface**: Active Wi-Fi card, Ethernet adapter, or Mobile Hotspot interface.

### Client Devices (Receivers)
- **Web Browsers**:
  - Google Chrome / Chromium 90+ (Android, Windows, macOS, Linux)
  - Apple Safari / WebKit 15+ (iOS, iPadOS, macOS)
  - Microsoft Edge 90+ (Windows, macOS)
  - Mozilla Firefox 95+ (Android, Windows, macOS, Linux)
- **Hardware**: Any device equipped with an internal speaker, 3.5mm headphone jack, or Bluetooth audio output (A2DP).

---

## 2. Step-by-Step Installation

### Step 1: Clone or Navigate to the Repository
```bash
git clone https://github.com/your-username/echocast.git
cd echocast
```

### Step 2: Install Dependencies
EchoCast is organized as an npm workspaces monorepo containing three packages (`shared`, `server`, and `client`):
```bash
npm install
```
This installs all root, client, and server dependencies.

### Step 3: Configure Environment Variables (Optional)
Copy the example environment configuration:
```bash
cp .env.example .env
```
Default parameters in `.env`:
```env
# Server listen port
PORT=4000

# Server listen host (0.0.0.0 listens across all LAN & hotspot adapters)
HOST=0.0.0.0

# WebSocket heartbeat interval (ms)
WS_HEARTBEAT_INTERVAL=15000

# Audio storage directory
AUDIO_STORAGE_PATH=./uploads
```

---

## 3. Development vs Production Modes

### Running in Development Mode
To start both the Express/WebSocket backend and the Vite frontend with hot-module replacement (HMR):
```bash
npm run dev
```
- **Backend**: Runs via `tsx watch` on `http://localhost:4000`
- **Frontend**: Runs via `vite` on `http://localhost:3000` (proxies `/api` and `/ws` to `localhost:4000`)

### Building for Production
Compile the TypeScript code and bundle production-optimized assets:
```bash
# Typecheck all packages
npm run typecheck

# Build both client and server
npm run build
```
This produces:
- `client/dist/`: Minified SPA bundle (HTML, CSS, JS, PWA assets).
- `server/dist/`: Compiled CommonJS/ESM Node.js backend.

### Running in Production Mode
Start the production server:
```bash
npm start
```
The server binds to `0.0.0.0:4000`, hosts the REST API and WebSocket endpoints, and serves the static React application. The terminal displays all detected LAN IPv4 addresses:
```
========================================================
  EchoCast Production Server Active on port 4000
========================================================
  • [Wi-Fi] http://192.168.1.50:4000 (WI-FI)
  Primary Access URL: http://192.168.1.50:4000
  WebSocket Endpoint: ws://192.168.1.50:4000/ws
========================================================
```

---

## 4. Local Network & Firewall Configuration

Because EchoCast operates offline over local IP addresses without public domain names or SSL certificates, ensure the host machine's firewall allows inbound TCP traffic on port `4000`.

### Windows Firewall Configuration
Run PowerShell as Administrator:
```powershell
New-NetFirewallRule -DisplayName "EchoCast Local Audio Server" -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow
```

### macOS Firewall Configuration
1. Open **System Settings -> Network -> Firewall**.
2. If Firewall is ON, click **Options...**
3. Ensure "Block all incoming connections" is **unchecked**.
4. Add Node.js or allow terminal incoming connections when prompted.

### Linux (`ufw`) Configuration
```bash
sudo ufw allow 4000/tcp comment "EchoCast Audio Streaming"
sudo ufw reload
```

---

## 5. PWA (Progressive Web App) Installation

EchoCast is configured as a standalone Progressive Web App. Receivers can install it directly onto their home screens or desktops for a full-screen, native application experience without an app store:

### iOS / iPadOS (Safari)
1. Open `http://<SENDER-IP>:4000` in Safari.
2. Tap the **Share** button (box with upward arrow).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add**. The EchoCast icon will appear on your iOS home screen.
5. Launching from the home screen opens the app in standalone mode (no browser URL bar or navigation buttons).

### Android (Chrome)
1. Open `http://<SENDER-IP>:4000` in Chrome.
2. Tap the **three-dots menu** in the top right.
3. Tap **Install app** or **Add to Home screen**.
4. Tap **Install**.

### Windows / macOS / Linux (Chrome & Edge)
1. In the address bar, click the **Install EchoCast** icon (monitor with down arrow).
2. Click **Install**.
3. EchoCast will launch in its own standalone desktop window and can be pinned to the taskbar/dock.

---

## 6. Desktop Packaging (Windows & macOS Electron Runner)

For users who want a packaged desktop runner with global media keys and no browser UI:
1. Ensure the project is built: `npm run build`
2. Enter the desktop directory:
   ```bash
   cd desktop
   npm install
   ```
3. Run locally:
   ```bash
   npm start
   ```
4. Package native installers:
   - **Windows**: `npm run build:win` (outputs NSIS installer in `desktop/dist-electron/`)
   - **macOS**: `npm run build:mac` (outputs DMG disk image in `desktop/dist-electron/`)

---

## 7. Automated Test Suite Verification

Verify the entire system before deploying to multiple devices:
```bash
# Run all 5 test suites (112 tests total)
npm run test:all
```
Individual test suites:
- `npm run test:streaming`: HTTP 206 range delivery, conditional ETags, 10-receiver concurrent streaming.
- `npm run test:sync`: NTP clock synchronization, scheduled playback, drift correction.
- `npm run test:devices`: Multi-device roster, group controls, duplicate session prevention.
- `npm test`: Comprehensive 25-scenario reliability, network failover, and security suite.
- `npm run test:safari`: iPhone Safari reconnection, grace period, and session recovery suite.
