# EchoCast – iOS Platform Architecture & Build Guide

This directory contains the iOS native project configuration for compiling EchoCast into an iOS application (.ipa) for iPhone and iPad.

---

## 1. Native Architectural Requirements & iOS Constraints

Synchronized audio playback on iOS has distinct operating system constraints:

### A. Local Network Access Permission (`NSLocalNetworkUsageDescription`)
- Starting in iOS 14, Apple restricts apps from probing or making socket/HTTP calls to other devices on the local Wi-Fi or Personal Hotspot (`192.168.x.x`, `172.20.10.x`).
- When the receiver attempts to connect to the sender's IP, iOS displays a system permission dialog asking:
  *"EchoCast would like to find and connect to devices on your local network."*
- **Configured In**:
  - `ios/App/App/Info.plist`: Key `NSLocalNetworkUsageDescription` with clear explanation.
  - `NSBonjourServices`: Declared `_echocast._tcp` and `_http._tcp`.

### B. App Transport Security (ATS) for Offline LAN
- iOS blocks cleartext `http://` traffic by default.
- In `Info.plist`, `NSAppTransportSecurity` specifies `NSAllowsLocalNetworking: true` and `NSAllowsArbitraryLoadsInWebContent: true` so receivers can stream from the sender's HTTP server over local IP addresses without requiring HTTPS certificates.

### C. Background Audio & WebKit Suspension
- **The Challenge**: When Safari or WKWebView is minimized or the screen turns off, iOS suspends `AudioContext` and pauses JavaScript timers (`setTimeout`, `requestAnimationFrame`).
- **The EchoCast Solution**:
  1. `UIBackgroundModes` with `audio` is set in `Info.plist`.
  2. The native bridge sets `AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)`.
  3. A silent HTML5 `<audio loop>` element or native audio node runs continuously in the background, signaling to iOS that media is active and preventing WebKit execution from freezing.

### D. AudioContext Autoplay & User Gesture Unlock
- iOS strictly prohibits audio playback until a direct user touch event occurs.
- EchoCast displays a prominent "Tap to Join & Enable Audio" button on the Receiver screen. When tapped, it initializes and resumes the Web Audio `AudioContext` inside the user gesture handler before network synchronization begins.

---

## 2. Compilation Instructions

### Prerequisites:
- macOS with Xcode 15+
- CocoaPods (`sudo gem install cocoapods`)
- Apple Developer Account (for device provisioning)

### Build Steps:
1. Build the production web bundle:
   ```bash
   npm run build -w client
   ```
2. Initialize and sync iOS Capacitor platform:
   ```bash
   npx cap add ios
   npx cap sync ios
   ```
3. Open Xcode project:
   ```bash
   npx cap open ios
   ```
4. In Xcode:
   - Select your Target -> Signing & Capabilities -> Select your Team.
   - Ensure `Background Modes -> Audio, AirPlay, and Picture in Picture` is checked.
   - Connect your iPhone or select a Simulator.
   - Click **Product -> Run** or **Product -> Archive** to build the `.ipa`.
