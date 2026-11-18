import os from 'os';
import { NetworkInterfaceInfo, ServerRuntimeStatus } from '@echocast/shared';
import { config } from '../config/index';
import { logger } from '../utils/logger';

const netLogger = logger.forContext('NetworkService');

export class NetworkService {
  /**
   * Discover and analyze all available non-internal IPv4 network interfaces
   */
  public getNetworkInterfaces(): NetworkInterfaceInfo[] {
    const interfaces = os.networkInterfaces();
    const result: NetworkInterfaceInfo[] = [];

    for (const [name, netList] of Object.entries(interfaces)) {
      if (!netList) continue;

      for (const net of netList) {
        // Skip internal (127.0.0.1) and non-IPv4 addresses
        if (net.family !== 'IPv4' || net.internal) {
          continue;
        }

        const ip = net.address;
        const lowerName = name.toLowerCase();

        // Detect mobile hotspot subnets or interface naming
        const isHotspot =
          ip.startsWith('192.168.43.') || // Common Android Hotspot default
          ip.startsWith('172.20.10.') ||  // Common iOS Hotspot default
          ip.startsWith('192.168.137.') ||// Windows Mobile Hotspot default
          lowerName.includes('hotspot') ||
          lowerName.includes('softap');

        // Detect Wi-Fi interfaces
        const isWifi =
          lowerName.includes('wi-fi') ||
          lowerName.includes('wifi') ||
          lowerName.includes('wlan') ||
          lowerName.includes('wireless') ||
          isHotspot;

        const port = config.port;
        const url = `http://${ip}:${port}`;
        const wsUrl = `ws://${ip}:${port}/ws`;

        result.push({
          name,
          ip,
          family: 'IPv4',
          isHotspot,
          isWifi,
          url,
          wsUrl,
        });
      }
    }

    // Sort to place Hotspot or Wi-Fi interfaces first
    result.sort((a, b) => {
      if (a.isHotspot && !b.isHotspot) return -1;
      if (!a.isHotspot && b.isHotspot) return 1;
      if (a.isWifi && !b.isWifi) return -1;
      if (!a.isWifi && b.isWifi) return 1;
      return 0;
    });

    return result;
  }

  /**
   * Determine the best primary URL for receivers to connect to
   */
  public getPrimaryInterface(): NetworkInterfaceInfo {
    const interfaces = this.getNetworkInterfaces();
    if (interfaces.length > 0) {
      return interfaces[0];
    }

    // Fallback if no network interface is found
    const fallbackIp = '127.0.0.1';
    return {
      name: 'Loopback',
      ip: fallbackIp,
      family: 'IPv4',
      isHotspot: false,
      isWifi: false,
      url: `http://${fallbackIp}:${config.port}`,
      wsUrl: `ws://${fallbackIp}:${config.port}/ws`,
    };
  }

  public logDetectedInterfaces() {
    const ifaces = this.getNetworkInterfaces();
    netLogger.info(`Local network discovery complete. Detected ${ifaces.length} IPv4 interface(s):`);
    for (const iface of ifaces) {
      const tags = [
        iface.isHotspot ? 'HOTSPOT' : null,
        iface.isWifi ? 'WI-FI' : null,
      ]
        .filter(Boolean)
        .join(', ');

      netLogger.info(`  • [${iface.name}] ${iface.url} ${tags ? `(${tags})` : ''}`);
    }
  }
}

export const networkService = new NetworkService();
