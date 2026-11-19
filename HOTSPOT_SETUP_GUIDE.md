# EchoCast – Local Network & Hotspot Setup Guide

EchoCast operates **100% locally** across standard Wi-Fi routers, mobile hotspots, and laptop-hosted ad-hoc networks without requiring an active internet connection or any external cloud services.

This guide provides step-by-step instructions for establishing low-latency local connections across different hardware and operating systems.

---

## 1. Connection Methods Overview

| Connection Type | Typical Subnet | Internet Required? | Setup Ease | Recommended For |
|---|---|---|---|---|
| **Wi-Fi Router (Home / Office)** | `192.168.1.x` / `192.168.0.x` | ❌ No | ⭐⭐⭐⭐⭐ Instant | Standard home setup with multi-room audio |
| **Android Mobile Hotspot** | `192.168.43.x` | ❌ No | ⭐⭐⭐⭐⭐ Easy | Outdoor, car, parties, camping, zero-router setups |
| **iPhone Personal Hotspot** | `172.20.10.x` | ❌ No | ⭐⭐⭐⭐ Easy | Apple ecosystem or outdoor portable streaming |
| **Windows Mobile Hotspot** | `192.168.137.x` | ❌ No | ⭐⭐⭐⭐⭐ Easy | Laptop sender hosting 5–10 phones directly |
| **Mac Internet Sharing** | `192.168.2.x` | ❌ No | ⭐⭐⭐⭐ Moderate | Mac laptop streaming to nearby iPhones and Androids |

---

## 2. Setup Scenarios

### Scenario A: Shared Wi-Fi Router
1. Ensure the Sender (laptop or desktop) and all Receivers (phones, tablets, laptops) are connected to the same Wi-Fi SSID.
2. Start EchoCast on the sender device (`npm start` or `npm run dev`).
3. The sender console and dashboard will display the LAN IPv4 address (e.g. `http://192.168.1.30:4000`).
4. Receiver devices scan the pairing QR code or open `http://<IP>:4000` in their mobile browser.

> **Important (Router AP Isolation)**:
> Some corporate, college, or hotel guest Wi-Fi networks enable **Client Isolation / AP Isolation**. This feature blocks devices on the same Wi-Fi from talking to each other. If receivers cannot reach `http://<IP>:4000` on public Wi-Fi, switch to **Mobile Hotspot** (Scenario B or C).

---

### Scenario B: Android Mobile Hotspot (Zero-Router Setup)
1. On your Android phone, go to **Settings > Network & Internet > Hotspot & Tethering > Wi-Fi Hotspot**.
2. Turn **On** the hotspot.
   * *Tip*: In Hotspot settings, set **AP Band** to **5 GHz** for lowest audio latency, or **2.4 GHz** for maximum physical range.
3. Turn **Off** Mobile Data if you want a strictly offline session (EchoCast does not need internet).
4. Connect the Sender laptop and other receiver phones to this Android hotspot.
5. Launch EchoCast on the Sender. EchoCast will automatically detect the hotspot subnet (`192.168.43.x`).
6. All connected phones open the URL or scan the QR code.

---

### Scenario C: iPhone Personal Hotspot
1. On your iPhone, open **Settings > Personal Hotspot**.
2. Enable **Allow Others to Join**.
3. Enable **Maximize Compatibility** (this enables 2.4GHz Wi-Fi for universal device compatibility).
4. Connect the Sender laptop and other receiver devices to your iPhone's hotspot.
5. EchoCast will detect the iOS subnet (`172.20.10.x`).
6. Scan the QR code or navigate to `http://172.20.10.x:4000`.

---

### Scenario D: Windows 10/11 Laptop Hotspot
1. On your Windows laptop, open **Settings > Network & Internet > Mobile Hotspot**.
2. Toggle Mobile Hotspot to **On**.
3. Under *Share over*, select **Wi-Fi**.
4. Connect your Android phones, iPhones, and tablets to the Windows Hotspot SSID.
5. Launch EchoCast. EchoCast will detect the Windows Hosted Network adapter (`192.168.137.1:4000`).
6. Scan the QR code displayed on the laptop screen from the phones.

---

### Scenario E: Mac Internet Sharing
1. On macOS, open **System Settings > General > Sharing**.
2. Click the info icon next to **Internet Sharing**.
3. Under *To devices using*, check **Wi-Fi**.
4. Configure Wi-Fi Options (Network Name and Security).
5. Turn on **Internet Sharing**.
6. Connect receiver devices to the Mac's Wi-Fi network.
7. Launch EchoCast. The primary URL will resolve to `http://192.168.2.1:4000`.

---

## 3. Firewall & Local Network Permissions

### Windows Defender Firewall
When running EchoCast for the first time on Windows, Windows Defender may show a security alert:
- Check **Private networks, such as my home or work network**.
- Click **Allow access**.

To manually open port 4000 in Windows PowerShell (Admin):
```powershell
New-NetFirewallRule -DisplayName "EchoCast Local Stream" -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow
```

### macOS Application Firewall
1. Open **System Settings > Network > Firewall**.
2. If Firewall is ON, click **Options**.
3. Ensure Node.js / EchoCast is set to **Allow incoming connections**.

### iOS Safari "Local Network" Permission
Starting with iOS 14+, iOS requires explicit permission for apps and web browsers to discover devices on the local network:
- When prompted: *"EchoCast / Safari would like to find and connect to devices on your local network"*, tap **Allow**.
- If denied accidentally: Open iOS **Settings > Safari / Chrome > Local Network** and toggle **ON**.

---

## 4. Diagnostics & Troubleshooting Checklist

| Issue | Root Cause | Solution |
|---|---|---|
| Phone shows `ERR_CONNECTION_REFUSED` | Receiver not connected to the same Wi-Fi/Hotspot | Confirm phone Wi-Fi settings show the exact same SSID as the sender. |
| Phone shows `ERR_CONNECTION_TIMED_OUT` | Windows Defender or host firewall blocking port 4000 | Add inbound firewall rule for TCP port 4000 or allow Node in firewall. |
| Page loads but audio doesn't play | Browser Web Audio autoplay policy requires interaction | Tap the prominent **"Activate Speaker"** button on the receiver screen. |
| Audio skips on Bluetooth speaker | Bluetooth A2DP packet buffer delay (~160ms) | Select the **"Bluetooth Speaker (+160ms)"** preset in Latency Calibration. |
| Cannot reach sender on college/office Wi-Fi | Router AP Client Isolation enabled by administrator | Use **Android Mobile Hotspot** or **Windows Mobile Hotspot** instead. |
