# EchoCast – Local Network & Hotspot Setup Guide

EchoCast is designed from the ground up for zero-cloud local area network (LAN) operations. It functions with equal fidelity over a home Wi-Fi router, an Android or iPhone mobile hotspot, or an ad-hoc laptop hotspot—completely independent of the public internet.

---

## 1. Supported Network Topologies

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ TOPOLOGY 1: HOME WI-FI ROUTER (Standard)                                               │
│                                                                                        │
│                      ┌────────────────────────┐                                        │
│                      │     Wi-Fi Router       │ (DHCP Server: 192.168.1.1)             │
│                      └───────────┬────────────┘                                        │
│               ┌──────────────────┼──────────────────┐                                  │
│               ▼                  ▼                  ▼                                  │
│      [Sender Laptop]      [Receiver 1: Phone] [Receiver 2: Tablet]                     │
│       192.168.1.50          192.168.1.101      192.168.1.102                           │
└────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────────────┐
│ TOPOLOGY 2: MOBILE HOTSPOT (Completely Offline / Outdoor / Camping)                     │
│                                                                                        │
│               ┌──────────────────────────────────────┐                                 │
│               │ Android / iPhone / Laptop Hotspot    │ (No mobile data needed)         │
│               └──────────────────┬───────────────────┘                                 │
│               ┌──────────────────┼──────────────────┐                                  │
│               ▼                  ▼                  ▼                                  │
│      [Sender Device]      [Receiver Phone]    [Receiver Laptop]                        │
│       192.168.43.1 /       192.168.43.55 /     192.168.43.60 /                         │
│       172.20.10.1          172.20.10.4         172.20.10.8                             │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Common Hotspot Subnets & IP Auto-Discovery

EchoCast automatically inspects all active network interfaces on startup and maps them into human-readable network tags:

| Platform / Network Type | Typical Subnet Range | Gateway / Host IP | Network Mode Tag in EchoCast |
| :--- | :--- | :--- | :--- |
| **Android Portable Hotspot** | `192.168.43.0/24` | `192.168.43.1` | `ANDROID_HOTSPOT` |
| **iOS Personal Hotspot** | `172.20.10.0/28` | `172.20.10.1` | `IOS_HOTSPOT` |
| **Windows Mobile Hotspot** | `192.168.137.0/24` | `192.168.137.1` | `WINDOWS_HOTSPOT` |
| **Home Router (Class C)** | `192.168.0.0/24`, `192.168.1.0/24` | `192.168.1.1` | `WIFI_ROUTER` |
| **Corporate / Lab LAN** | `10.0.0.0/8`, `172.16.0.0/12` | Varied | `ETHERNET` / `ENTERPRISE_LAN` |

---

## 3. Step-by-Step Hotspot Setup (No Internet)

### Setup A: Android Mobile Hotspot
1. On your Android phone, swipe down and tap **Settings -> Network & internet -> Hotspot & tethering -> Wi-Fi hotspot**.
2. Set a network name (SSID) and password (or set Security to None for fastest connection).
3. Turn **Wi-Fi hotspot ON**.
   *(Optional: You may turn off Mobile Data; internet access is NOT needed for EchoCast).*
4. Connect all receiver devices and the sender laptop to this Wi-Fi hotspot.
5. Start EchoCast:
   - If running EchoCast on a laptop connected to this hotspot, it will receive an IP like `192.168.43.50`.
   - The QR code and URL on the sender will display `http://192.168.43.50:4000`.
6. All connected devices can join immediately.

### Setup B: Apple iPhone Personal Hotspot
1. On your iPhone, open **Settings -> Personal Hotspot**.
2. Turn **Allow Others to Join ON**.
3. Toggle **Maximize Compatibility** to ON (this enables 2.4 GHz Wi-Fi for maximum device compatibility).
4. Connect receiver devices to the iPhone's hotspot.
5. If running EchoCast on a Mac or laptop connected to the hotspot, the host will bind to `172.20.10.x`.
6. Receivers scan the QR code to connect.

### Setup C: Windows 10/11 Mobile Hotspot
1. Open **Settings -> Network & internet -> Mobile hotspot**.
2. Under "Share my internet connection from", select your active Wi-Fi or Ethernet (or leave disconnected).
3. Toggle **Mobile hotspot ON**.
4. Windows will host a local DHCP network on `192.168.137.1`.
5. Connect your mobile phones to the Windows hotspot and browse to `http://192.168.137.1:4000`.

---

## 4. Troubleshooting Common Local Network Issues

### Issue 1: "Devices cannot connect to the Sender's IP"
- **Cause A: AP / Client Isolation is enabled on your router**.
  - Many guest networks and some home routers have **"Client Isolation"** (or "AP Isolation" / "Station Isolation") enabled. This security feature prevents devices connected to the same Wi-Fi from talking to each other.
  - **Fix**: Log in to your router settings (typically `192.168.1.1`), go to Wireless Settings / Advanced, and **disable AP Isolation**, or switch devices to your primary home Wi-Fi instead of the Guest network. Alternatively, use a Mobile Hotspot where client isolation is disabled by default.
- **Cause B: Host Machine Firewall**.
  - The host OS is blocking inbound port 4000 connections.
  - **Fix**: Refer to [INSTALLATION.md](file:///c:/Users/Lokesh/Desktop/web%20echo%20cast/INSTALLATION.md) for Windows, macOS, or Linux firewall commands to permit port 4000.

### Issue 2: "Audio stutter or jitter on some receivers"
- **Cause: 2.4 GHz vs 5 GHz Wi-Fi Congestion**.
  - 2.4 GHz Wi-Fi is susceptible to interference from microwaves, Bluetooth, and neighboring networks, causing packet queuing jitter.
  - **Fix**:
    1. Connect devices to the **5 GHz Wi-Fi band** whenever possible.
    2. On the Sender, increase the stability buffer from **Low Latency (350ms)** to **Balanced (650ms)** or **High Stability (1000ms)**.
    3. Ensure receiver devices are within reasonable proximity of the Wi-Fi router or hotspot (within 10–15 meters).

### Issue 3: "Phone audio pauses when the screen locks"
- **Cause: Mobile OS Battery Optimization / Wi-Fi Sleep**.
  - Android and iOS aggressively put background network interfaces to sleep to conserve battery.
  - **Fix**:
    - Keep the EchoCast browser tab in the foreground, or set your screen timeout to "Never" during group listening.
    - On Android, disable "Battery Optimization" for your browser app.
    - If using the prepared Android native build, `EchoCastMediaService` holds a `WifiLock` and `WakeLock` to prevent the OS from sleeping.

---

## 5. Network Performance Benchmarks

EchoCast's streaming architecture is engineered for low network overhead:
- **Audio Delivery**: Uses chunked HTTP 206 byte-range transfer with client-side Web Audio memory caching. An audio track is loaded once in advance and cached in RAM, eliminating continuous streaming overhead during playback.
- **Synchronization Heartbeat**: SNTP ping/pong packets are tiny JSON payloads (<120 bytes) transmitted every 4–8 seconds per device.
- **Bandwidth Usage for 10 Devices**:
  - Initial 4-minute 320kbps MP3 load: ~9.6 MB per device spread over several seconds.
  - Active Synchronized Playback: < 2.5 KB/s aggregate bandwidth across all 10 devices!
  - Network airtime is preserved, ensuring virtually zero packet collision or Wi-Fi contention.
