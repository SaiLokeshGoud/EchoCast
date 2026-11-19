# EchoCast – Android Platform Architecture & Build Guide

This directory contains the Android native configuration for packaging EchoCast as an Android APK or Android App Bundle (AAB).

---

## 1. Native Architectural Requirements

Synchronized local audio streaming on Android requires handling several platform-level restrictions:

### A. Cleartext HTTP Traffic (LAN / Offline Hotspot)
- Android 9 (API 28) and newer enforces HTTPS by default.
- Since EchoCast operates completely offline on local Wi-Fi and hotspots (using IPs such as `http://192.168.1.50:4000`), cleartext traffic must be explicitly permitted.
- **Configured In**:
  - `AndroidManifest.xml`: `android:usesCleartextTraffic="true"`
  - `res/xml/network_security_config.xml`: Configured to permit cleartext connections on LAN subnets (`192.168.0.0/16`, `10.0.0.0/8`, `172.16.0.0/12`).

### B. Background Audio & CPU WakeLock
- When the screen is turned off or the user switches apps, Android puts background threads to sleep and throttles network adapters.
- **Solution**:
  - `EchoCastMediaService.java`: Starts a Foreground Service with an ongoing notification (`FOREGROUND_SERVICE_MEDIA_PLAYBACK` in Android 14+).
  - Holds a `PowerManager.PARTIAL_WAKE_LOCK` to keep the audio decoding worker alive.
  - Holds a `WifiManager.WifiLock` (`WIFI_MODE_FULL_LOW_LATENCY`) to prevent Wi-Fi power-save packet drops.

### C. Bluetooth A2DP Latency Compensation
- Bluetooth audio on Android introduces between 120ms to 280ms of hardware buffering delay.
- The EchoCast Receiver provides an adjustable manual and preset latency offset (+160ms default for Bluetooth) which shifts the Web Audio scheduling timestamp backwards, aligning the acoustic output with phones using built-in speakers.

---

## 2. Compilation Instructions

To compile the Android APK:

### Prerequisites:
- Android Studio Hedgehog (2023.1.1) or newer
- Android SDK API 34
- JDK 17
- Node.js 18+

### Build Steps:
1. Build the production web assets:
   ```bash
   npm run build -w client
   ```
2. Add the Capacitor Android platform (if compiling fresh):
   ```bash
   npx cap add android
   npx cap sync android
   ```
3. Open in Android Studio or build via CLI:
   ```bash
   cd android
   ./gradlew assembleDebug
   ```
4. Output APK location:
   `android/app/build/outputs/apk/debug/app-debug.apk`
