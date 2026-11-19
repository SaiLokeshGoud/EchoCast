# EchoCast – Windows & macOS Desktop Architecture

This directory provides the Electron desktop packaging wrapper and background process runner for Windows (.exe installer / portable) and macOS (.dmg / .app).

---

## 1. Architectural Highlights

### Integrated Server Spawning
- In desktop mode, EchoCast can act either as a standalone Sender (hosting the room, serving audio HTTP chunks, and broadcasting WebSocket sync messages) or as a high-fidelity Receiver.
- The Electron main process (`main.js`) manages the Node.js backend lifecycle:
  - Spawns `server/dist/index.js` automatically on launch.
  - Passes environment variables (`PORT=4000`, local network configuration).
  - Ensures clean SIGINT termination when the app quits.

### Preventing Audio Throttling
- Standard desktop browsers throttle timer intervals and suspend background tabs when minimized.
- In `main.js`, `backgroundThrottling: false` is explicitly set in `webPreferences`. This guarantees uninterrupted Web Audio clock synchronization, buffer replenishment, and SNTP ping-pong measurements even when the EchoCast window is minimized or covered by other applications.

### Hardware Media Keys
- Integrates with system hardware media keys (`Play / Pause`, `Next Track`, `Previous Track`) via Electron's `globalShortcut` API, relaying commands directly to the Sender group controls.

---

## 2. Compilation & Packaging Instructions

### Prerequisites
- Node.js 18+
- npm 9+
- On macOS: Xcode Command Line Tools (for DMG signing)
- On Windows: Visual Studio C++ Build Tools (if native dependencies are added)

### Build Steps:
1. Build both client and server:
   ```bash
   npm run build
   ```
2. Navigate to `desktop/`:
   ```bash
   cd desktop
   npm install
   ```
3. Run locally in desktop mode:
   ```bash
   npm start
   ```
4. Package for Windows (NSIS executable):
   ```bash
   npm run build:win
   ```
5. Package for macOS (DMG image):
   ```bash
   npm run build:mac
   ```
   *Outputs are placed in `desktop/dist-electron/`.*
