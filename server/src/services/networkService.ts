import os from 'os';
import { NetworkInterfaceInfo } from '@echocast/shared';
import { config } from '../config/index';
import { logger } from '../utils/logger';

const netLogger = logger.forContext('NetworkService');

export type NetworkChangeListener = (primaryUrl: string, interfaces: NetworkInterfaceInfo[]) => void;

export class NetworkService {
  private lastPrimaryIp: string = '';
  private monitorInterval: NodeJS.Timeout | null = null;
  private changeListeners: Set<NetworkChangeListener> = new Set();

  /**
   * Discover and analyze all available non-internal IPv4 network interfaces
   */
  public getNetworkInterfaces(): NetworkInterfaceInfo[] {
    const interfaces = os.networkInterfaces();
    const result: NetworkInterfaceInfo[] = [];

    for (const [name, netList] of Object.entries(interfaces)) {
      if (!netList) continue;

      for (const net of netList) {
        // Skip internal loopback (127.0.0.1) and non-IPv4 addresses
        if (net.family !== 'IPv4' || net.internal) {
          continue;
        }

        const ip = net.address;
        const lowerName = name.toLowerCase();

        // Detect virtual adapters (Hyper-V, WSL, VirtualBox, VMware, Docker, VPNs)
        const isVirtual =
          lowerName.includes('vethernet') ||
          lowerName.includes('virtual') ||
          lowerName.includes('vbox') ||
          lowerName.includes('vmware') ||
          lowerName.includes('wsl') ||
          lowerName.includes('docker') ||
          lowerName.includes('tailscale') ||
          lowerName.includes('zerotier') ||
          lowerName.includes('tap') ||
          lowerName.includes('tun') ||
          ip.startsWith('172.17.') || // Docker default bridge
          ip.startsWith('172.18.') ||
          ip.startsWith('172.28.') || // WSL typical default
          ip.startsWith('172.29.');

        // Detect mobile and desktop hotspot subnets & interface naming
        const isAndroidHotspot = ip.startsWith('192.168.43.');
        const isIosHotspot = ip.startsWith('172.20.10.');
        const isWindowsHotspot = ip.startsWith('192.168.137.');
        const isMacHotspot = ip.startsWith('192.168.2.') || lowerName.includes('bridge100');
        const isNamedHotspot = lowerName.includes('hotspot') || lowerName.includes('softap');

        const isHotspot =
          isAndroidHotspot ||
          isIosHotspot ||
          isWindowsHotspot ||
          isMacHotspot ||
          isNamedHotspot;

        // Detect Wi-Fi interfaces
        const isWifi =
          lowerName.includes('wi-fi') ||
          lowerName.includes('wifi') ||
          lowerName.includes('wlan') ||
          lowerName.includes('wireless') ||
          isHotspot;

        // Label interface type
        let typeLabel = 'LAN Interface';
        if (isAndroidHotspot) typeLabel = 'Android Mobile Hotspot';
        else if (isIosHotspot) typeLabel = 'iPhone Personal Hotspot';
        else if (isWindowsHotspot) typeLabel = 'Windows Mobile Hotspot';
        else if (isMacHotspot) typeLabel = 'Mac Internet Sharing';
        else if (isNamedHotspot) typeLabel = 'Wi-Fi Hotspot';
        else if (isWifi) typeLabel = 'Wi-Fi Router LAN';
        else if (isVirtual) typeLabel = 'Virtual / Bridge Adapter';
        else if (lowerName.includes('eth') || lowerName.includes('ethernet')) typeLabel = 'Ethernet LAN';

        const port = config.port;
        const url = `http://${ip}:${port}`;
        const wsUrl = `ws://${ip}:${port}/ws`;

        result.push({
          name,
          ip,
          family: 'IPv4',
          isHotspot,
          isWifi,
          isVirtual,
          typeLabel,
          url,
          wsUrl,
        });
      }
    }

    // Sort priority:
    // 1. Non-virtual Hotspots first (Android, iOS, Windows Hotspot)
    // 2. Non-virtual Wi-Fi adapters
    // 3. Non-virtual Ethernet adapters
    // 4. Virtual adapters last
    result.sort((a, b) => {
      // Prioritize physical adapters over virtual
      if (!a.isVirtual && b.isVirtual) return -1;
      if (a.isVirtual && !b.isVirtual) return 1;

      // Prioritize hotspots
      if (a.isHotspot && !b.isHotspot) return -1;
      if (!a.isHotspot && b.isHotspot) return 1;

      // Prioritize Wi-Fi over wired/unknown
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
      isVirtual: false,
      typeLabel: 'Local Loopback (Offline)',
      url: `http://${fallbackIp}:${config.port}`,
      wsUrl: `ws://${fallbackIp}:${config.port}/ws`,
    };
  }

  /**
   * Start dynamic monitoring for network interface IP changes (e.g. user toggled mobile hotspot or changed Wi-Fi)
   */
  public startMonitoring(intervalMs: number = 4000) {
    if (this.monitorInterval) return;

    this.lastPrimaryIp = this.getPrimaryInterface().ip;

    this.monitorInterval = setInterval(() => {
      const current = this.getPrimaryInterface();
      if (current.ip !== this.lastPrimaryIp) {
        netLogger.warn(`Network IP change detected: ${this.lastPrimaryIp} -> ${current.ip} (${current.typeLabel})`);
        this.lastPrimaryIp = current.ip;
        const allIfaces = this.getNetworkInterfaces();
        for (const listener of this.changeListeners) {
          try {
            listener(current.url, allIfaces);
          } catch (e) {
            netLogger.error('Error notifying network change listener', e);
          }
        }
      }
    }, intervalMs);
  }

  public stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  public onChange(listener: NetworkChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /**
   * Manually broadcast network address update (used during tests or hotspot migration)
   */
  public triggerAddressChange(simulatedIp: string) {
    netLogger.warn(`Network IP change triggered: ${this.lastPrimaryIp} -> ${simulatedIp}`);
    this.lastPrimaryIp = simulatedIp;
    const allIfaces = this.getNetworkInterfaces();
    const primaryUrl = `http://${simulatedIp}:${config.port}`;
    for (const listener of this.changeListeners) {
      try {
        listener(primaryUrl, allIfaces);
      } catch (e) {
        netLogger.error('Error notifying network change listener', e);
      }
    }
  }

  public logDetectedInterfaces() {
    const ifaces = this.getNetworkInterfaces();
    netLogger.info(`Local network discovery complete. Detected ${ifaces.length} IPv4 interface(s):`);
    for (const iface of ifaces) {
      const tags = [
        iface.typeLabel,
        iface.isHotspot ? 'HOTSPOT' : null,
        iface.isWifi ? 'WI-FI' : null,
        iface.isVirtual ? 'VIRTUAL' : null,
      ]
        .filter(Boolean)
        .join(', ');

      netLogger.info(`  • [${iface.name}] ${iface.url} (${tags})`);
    }
  }
}

export const networkService = new NetworkService();
