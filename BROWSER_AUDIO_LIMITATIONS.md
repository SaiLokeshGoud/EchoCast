# EchoCast – Browser Audio Capabilities & Platform Limitations Guide

This document provides a comprehensive technical overview of browser audio capabilities, mobile OS platform restrictions, autoplay policies, codec compatibility, and network behavior for **EchoCast Multi-Device Synchronized Audio Streaming**.

---

## 1. Browser Autoplay Policies & User Activation

### Modern Autoplay Constraints
Every modern web browser (Google Chrome, Apple Safari, Mozilla Firefox, Microsoft Edge, Opera, Samsung Internet) enforces strict autoplay policies to prevent unwanted audio playback without explicit user consent.

| Platform / Browser | AudioContext Initial State | Unlocking Mechanism | Priming Requirements |
| :--- | :--- | :--- | :--- |
| **iOS Safari / WebKit** | `suspended` | Direct touch gesture (`touchend` or `click`) | Must call `audioCtx.resume()` and play a silent micro-buffer within the same synchronous event loop tick. |
| **Android Chrome** | `suspended` | Pointer tap or button click | Calls `audioCtx.resume()`. Subsequent scheduled audio nodes trigger without further interaction. |
| **Desktop Chrome / Edge** | `suspended` or `running` (based on Media Engagement Index - MEI) | User interaction with the page domain | Direct click on "Activate Speaker" or playback control buttons immediately unlocks the AudioContext. |
| **Desktop Safari** | `suspended` | User interaction | Settings > Websites > Auto-Play can be set to "Allow All Auto-Play" for local LAN endpoints. |
| **Firefox (All Platforms)** | `suspended` | User click | Clean unmuting via `resume()`. |

### EchoCast Solution
EchoCast includes a dedicated **Audio Hardware Unlock Banner** and **Activate Speaker** modal:
- When a receiver joins a room, `WebAudioEngine.isUnlocked()` checks the underlying `AudioContext.state`.
- If suspended, a prominent amber action prompt appears requesting the user tap once to unlock audio.
- On user tap, EchoCast immediately executes:
  1. `audioContext.resume()`
  2. Submits a 1-sample silent micro-buffer to prime the mobile/desktop DAC (Digital-to-Analog Converter) hardware.
  3. Spins up an imperceptible, sub-audible oscillator (`-120dB` at `20Hz`) to prevent mobile OS power-savers from tearing down the audio render thread.

---

## 2. Background Audio & Screen Lock Behavior

### iOS Safari (WebKit Limitations)
- **Constraint**: iOS Safari suspends all Web Audio API render graphs (`AudioContext`) approximately 10 to 30 seconds after the screen locks or when the user switches to another app or browser tab.
- **Why**: Apple treats Web Audio API as an interactive web page feature rather than background media playback. Only native HTML `<audio>` elements or Native Apps (AVAudioSession category `AVAudioSessionCategoryPlayback`) have background execution entitlements in iOS.
- **EchoCast Mitigation**:
  - EchoCast integrates the **Screen Wake Lock API** (`navigator.wakeLock.request('screen')`) to keep the mobile display active while streaming, preventing iOS from sleeping.
  - EchoCast binds to the **Media Session API** (`navigator.mediaSession`), publishing active track title, artist, duration, and album artwork to the system Control Center and Lock Screen.
  - Receivers should keep the EchoCast browser tab in the foreground while streaming audio.

### Android Chrome / Firefox
- **Behavior**: Android allows Web Audio graphs to continue rendering in the background longer than iOS, but aggressively throttles timers (`setTimeout` / `setInterval`) when tabs are backgrounded.
- **EchoCast Mitigation**:
  - EchoCast uses high-precision hardware timestamps (`AudioContext.currentTime`) rather than JavaScript timers for audio scheduling. The Web Audio render thread executes independently of the main thread timer throttles.
  - The Screen Wake Lock API keeps the display on during active listening sessions.

---

## 3. Cross-Platform Codec Compatibility Matrix

Different browsers and operating systems bundle different audio decoders. EchoCast decodes incoming streams via Web Audio's native `decodeAudioData()` into uncompressed 32-bit floating point PCM buffers.

| Audio Format | MIME Type | Windows Chrome / Edge | macOS Safari | iOS Safari (iPhone / iPad) | Android Chrome | Linux Firefox |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MP3** (`.mp3`) | `audio/mpeg` | ✅ Supported | ✅ Supported | ✅ Supported | ✅ Supported | ✅ Supported |
| **WAV (PCM)** (`.wav`) | `audio/wav` | ✅ Supported | ✅ Supported | ✅ Supported | ✅ Supported | ✅ Supported |
| **AAC** (`.aac`, `.m4a`) | `audio/mp4`, `audio/aac` | ✅ Supported | ✅ Supported | ✅ Supported | ✅ Supported | ✅ Supported |
| **FLAC** (`.flac`) | `audio/flac` | ✅ Supported | ✅ Supported | ⚠️ Partial (iOS 11+) | ✅ Supported | ✅ Supported |
| **OGG Vorbis** (`.ogg`) | `audio/ogg; codecs="vorbis"` | ✅ Supported | ❌ WebKit Blocked | ❌ WebKit Blocked | ✅ Supported | ✅ Supported |
| **Opus** (`.opus`, `.ogg`) | `audio/ogg; codecs="opus"` | ✅ Supported | ⚠️ macOS 14+ | ❌ WebKit Blocked | ✅ Supported | ✅ Supported |

> [!TIP]
> **Best Universal Format**: Standard **MP3** (`44.1kHz / 320kbps`) or uncompressed **WAV** (`16-bit / 44.1kHz`) are guaranteed to decode flawlessly across 100% of Android, iOS, Windows, Mac, and Linux endpoints without transcoding or format errors.

---

## 4. Bluetooth Audio Latency & Compensation

When a receiver device (such as an iPhone or Android phone) routes audio output to a Bluetooth speaker, headphones, or soundbar, the Bluetooth A2DP audio stack introduces a noticeable transmission latency:

| Output Type | Typical Hardware / Buffer Latency | EchoCast Default Compensation |
| :--- | :--- | :--- |
| **Built-in Speaker** | 10ms – 25ms | `0 ms` manual offset |
| **Wired 3.5mm / USB DAC** | 5ms – 15ms | `0 ms – 10 ms` manual offset |
| **Bluetooth Standard (SBC / AAC)** | 140ms – 220ms | `+160 ms` preset compensation |
| **Bluetooth Low Latency (aptX LL)** | 40ms – 70ms | `+50 ms` manual offset |

### EchoCast Bluetooth Sync Features
- **Output Device Selector**: Receivers can select between **Device Speaker**, **Headphones**, or **Bluetooth Speaker** directly on the dashboard.
- Selecting **Bluetooth Speaker** automatically applies a `+160ms` offset compensation to the receiver's local playback schedule.
- **Manual Micro-Adjustment Slider**: Allows adjusting synchronization by `±1ms` to `±500ms` in real-time while listening to align acoustics precisely with room speakers.
- **Sync Calibration Beat**: The sender can broadcast the built-in rhythmic metronome track to align multiple physical speakers by ear until clicks merge into a single acoustic transient.

---

## 5. Local Wi-Fi & Hotspot Network Limitations

### Wi-Fi AP Client Isolation
- Some public or guest Wi-Fi networks (hotels, airports, universities, coffee shops) enable **Access Point (AP) Isolation** / **Client Isolation**. This security setting prevents devices connected to the same Wi-Fi from exchanging IP packets with each other.
- **Solution**:
  - Run the stream on a private home/office Wi-Fi router.
  - Or create a **Mobile Hotspot** on the sender phone or a **Wi-Fi Hotspot** on a laptop. Hotspots do not enforce AP client isolation.

### Mobile Hotspot Behavior Without Internet
- When an Android or iOS device turns on Mobile Hotspot without mobile data or internet, some connecting devices may display a prompt: *"Wi-Fi has no internet connection. Stay connected?"*
- Users must choose **"Yes / Keep Connected"** so the phone does not automatically disconnect or fall back to cellular data.

---

## 6. Memory Management & Multi-Receiver Scale

### Decoded AudioBuffer RAM Footprint
When compressed MP3 or WAV audio is decoded into a Web Audio `AudioBuffer`, it expands into raw 32-bit floating-point PCM audio in RAM:
$$\text{Memory} = \text{Sample Rate} \times \text{Channels} \times 4\text{ bytes} \times \text{Duration (seconds)}$$

For a typical 4-minute stereo song at 44.1kHz:
$$44,100 \times 2 \times 4 \times 240 \approx 84.6 \text{ MB RAM}$$

- If an application keeps 10 tracks cached in browser RAM simultaneously, a mobile browser tab will exceed memory quotas and crash.
- **EchoCast Solution**:
  - Implements an **LRU (Least Recently Used) Buffer Cache** limiting in-memory tracks to a configurable quota (default 3 tracks, ~150-200MB max).
  - Automatically evicts older decoded buffers when new tracks are streamed.
  - Provides an on-demand **"Clear Cache"** button in Settings for instant memory reclamation.
