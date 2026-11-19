# EchoCast – Comprehensive User Guide

Welcome to **EchoCast**, the local-network synchronized audio streaming system. EchoCast turns any collection of phones, laptops, and tablets into a coordinated, multi-room speaker array without requiring internet access or costly proprietary hardware.

---

## 1. Quick Concept Overview

EchoCast operates with two simple roles:
- **Sender (Host)**: The primary device (laptop, desktop, or tablet) that selects audio files, creates the streaming room, and controls master playback across the network.
- **Receiver (Listener)**: Any connected device (phone, laptop, iPad, or computer) that connects to the sender, downloads audio chunks in advance, and plays them through its built-in or Bluetooth speaker at the exact microsecond scheduled by the sender.

---

## 2. Sender Workflow: How to Host a Stream

### Step 1: Launch EchoCast
1. On your host computer, open a terminal in the project directory and run:
   ```bash
   npm start
   ```
2. Open your web browser (Chrome, Edge, Safari, or Firefox) and navigate to:
   `http://localhost:4000`
3. On the Welcome Screen, click **Start Streaming (Sender)**.

### Step 2: Set Up Your Room
1. In the top header bar, you will see your **Room ID** (e.g., `CAST-842` or `ROOM-101`). You can click the room ID to customize it.
2. Click the **Pair Devices** button (QR code icon) in the navigation bar.
3. A pairing modal will open displaying:
   - A high-contrast QR code for instant mobile phone scanning.
   - The direct LAN joining URL (e.g., `http://192.168.1.50:4000?room=CAST-842`).
   - A copy-link button.

### Step 3: Add Audio to the Playlist
1. On the Sender Dashboard, navigate to the **Playlist / Queue** section.
2. Drag and drop audio files into the dropzone, or click **Choose Files**.
   - **Supported Formats**: MP3, WAV, AAC, FLAC, OGG, M4A, OPUS.
   - The audio validator verifies valid audio magic bytes and metadata (track duration, sample rate, bit depth, channel count).
3. If no local music files are handy, the system automatically provides a **Built-in Calibration Metronome** track (120 BPM rhythmic pulses) ready to play immediately.
4. **Queue Management**:
   - Reorder tracks using the up/down arrows.
   - Remove tracks with the trash icon.
   - Toggle **Autoplay Next Track** to continuously play through your queue.

### Step 4: Choose Your Buffer & Stability Preset
Click the **Gear Icon** in the top bar to open Settings, or adjust the preset from the dashboard:
- **Low Latency (350ms delay)**: Best for responsive pause/seek controls on fast, uncongested 5GHz Wi-Fi networks.
- **Balanced (650ms delay - Recommended)**: Default optimal setting for home Wi-Fi and mobile hotspots with 5–8 connected devices.
- **High Stability (1000ms delay)**: Maximum buffer cushion. Best for crowded Wi-Fi, older phones, or distances over 15 meters from the router.

### Step 5: Master Group Controls
Once receivers are connected, control playback from the Sender dashboard:
- **Play All**: Broadcasts a future playback timestamp (scheduled ~650ms ahead). Every receiver downloads the audio and begins playing at the exact synchronized millisecond.
- **Pause All**: Halts playback synchronously on all devices.
- **Resume All**: Calculates the current track position and resumes playback synchronously.
- **Stop All**: Stops playback and resets the track position to 00:00.
- **Seek / Scrub**: Click or drag the waveform progress bar. All receivers immediately align to the target second.
- **Next / Previous Track**: Switches tracks seamlessly across the entire group.
- **Master Volume**: Scales the output volume across all connected devices simultaneously.
- **Mute All / Unmute All**: Instantly silences or restores audio across the room.

### Step 6: Verify Multi-Device Sync with Acoustic Test Pulse
EchoCast includes a dedicated acoustic alignment tool:
1. Click **Acoustic Sync Pulse** (or 1kHz Test Click) in the sender control panel.
2. The server broadcasts a synchronized 80ms 1kHz sine wave burst to all connected devices.
3. Listen carefully to your devices:
   - If perfectly aligned, you will hear a single, sharp, crisp "click".
   - If any device has a hollow echo or flanging sound, that device likely has Bluetooth A2DP delay that needs compensation (see Section 4).

---

## 3. Receiver Workflow: How to Join and Listen

### Step 1: Connect to the Sender
1. Connect your phone or laptop to the **same Wi-Fi or mobile hotspot** as the Sender.
2. **Scan the QR Code**:
   - Open your phone's Camera app.
   - Point the camera at the QR code displayed on the Sender screen.
   - Tap the link popup.
   *Or:*
   - Open your browser, type the Sender's IP address (e.g., `http://192.168.1.50:4000`), enter the Room ID, and click **Connect**.

### Step 2: Unlock Audio (Mobile Web Browser Requirement)
Mobile operating systems (iOS and Android) require user interaction before playing Web Audio:
1. When the Receiver screen loads, you will see a banner: **"Tap to Activate Audio Output"**.
2. Tap the button. The status will switch to **"Audio Engine Ready"**.

### Step 3: Listen & Adjust Individual Volume
- The receiver screen shows the currently playing track name, artist, elapsed time, and live frequency visualizer.
- Use the **Volume Slider** on your device to set your individual listening volume without affecting other devices.
- Tap **Mute** to temporarily silence your device.

---

## 4. Bluetooth Speaker Latency Calibration

Connecting a phone to an external Bluetooth speaker introduces an unavoidable hardware transmission delay (typically 120ms to 250ms) due to the Bluetooth A2DP audio codec.

EchoCast solves this with built-in hardware latency compensation:

```
[Sender Audio Clock]  ────────── Scheduled: T = 1000.000s ──────────
                                          │
   ┌──────────────────────────────────────┴──────────────────────────────────────┐
   ▼                                                                             ▼
[Receiver A: Built-in Speaker]                                [Receiver B: Bluetooth Speaker]
Internal DAC delay: ~15ms                                     Bluetooth A2DP delay: ~175ms
Effective Start: T + 15ms                                     Effective Start: T + 175ms (Lags by 160ms!)
                                                                                 │
                                                                                 ▼
                                                              [EchoCast Compensated Audio Clock]
                                                              Target Start = T - 160ms
                                                              Result: Acoustic Waves Reach Ear SIMULTANEOUSLY!
```

### How to Calibrate:
1. Connect your phone or laptop to your Bluetooth speaker via OS Bluetooth settings.
2. In the EchoCast Receiver UI, find the **Audio Output Profile** section.
3. Switch from **Built-in Speaker** to **Bluetooth Speaker**.
4. This immediately applies a **+160ms compensation offset**, scheduling your audio 160ms earlier to compensate for the Bluetooth buffer.
5. **Fine-Tuning**:
   - Have the Sender trigger the **Acoustic Sync Pulse**.
   - If your Bluetooth speaker still sounds slightly behind, slide the **Manual Latency Adjustment** slider to `+180ms` or `+200ms`.
   - If it plays slightly before the other speakers, slide it down to `+120ms` or `+140ms`.
   - Your preferred offset is automatically saved in your browser's `localStorage` for future sessions.

---

## 5. Device Management Dashboard

As the Sender host, click **Devices** in the navigation bar to access the full device roster:
- **Device List**: View all active receivers, their assigned names, operating systems (Android, iOS, Windows, Mac, Linux), and IP addresses.
- **Real-Time Telemetry**:
  - **RTT**: Round-Trip Time ping latency over Wi-Fi.
  - **Clock Offset**: Microsecond deviation between device clock and server clock.
  - **Buffer Health**: Download progress of current audio chunk.
  - **Output Mode**: Built-in speaker vs Bluetooth speaker badge.
- **Remote Adjustments**:
  - Adjust an individual receiver's volume remotely.
  - Mute an individual noisy or disruptive receiver.
  - Rename devices (e.g., "Living Room Phone", "Kitchen Speaker", "Patio Tablet").
- **Disconnect / Kick**: Tap the red disconnect button on any device card to politely remove it from the room.

---

## 6. Offline Hotspot Streaming (Zero Internet)

EchoCast does not require an active internet connection. You can use it in a park, campsite, beach, or road trip using a smartphone's Mobile Hotspot:
1. Turn on **Mobile Hotspot** on Phone A (Host).
2. Connect Phone B, Phone C, and Laptop D to Phone A's Wi-Fi hotspot.
3. Start EchoCast on the laptop or host device.
4. EchoCast detects the hotspot network (`192.168.43.x` or `172.20.10.x`).
5. All devices connect and stream high-quality audio with zero mobile data usage!
