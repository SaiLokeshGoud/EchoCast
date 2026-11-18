/**
 * Network interfaces, local IP resolution, and server runtime status
 */

export interface NetworkInterfaceInfo {
  name: string;        // e.g. "Wi-Fi", "eth0", "wlan0", "Hotspot"
  ip: string;          // IPv4 address e.g. "192.168.1.15" or "192.168.43.1"
  family: 'IPv4';
  isHotspot: boolean;  // Detected hotspot subnet (e.g. 192.168.43.x, 172.20.10.x, etc.)
  isWifi: boolean;     // Detected Wi-Fi adapter
  url: string;         // Fully qualified HTTP URL e.g. "http://192.168.1.15:4000"
  wsUrl: string;       // Fully qualified WS URL e.g. "ws://192.168.1.15:4000/ws"
}

export interface ServerRuntimeStatus {
  version: string;
  serverTime: number;
  httpPort: number;
  wsPort: number;
  activeInterfaces: NetworkInterfaceInfo[];
  primaryUrl: string;
  isHotspotDetected: boolean;
  connectedReceiversCount: number;
  senderConnected: boolean;
  activeTrackId: string | null;
  serverUptimeSec: number;
}
