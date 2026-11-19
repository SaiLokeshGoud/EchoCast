import {
  DeviceInfo,
  DeviceRegistrationPayload,
  DeviceStateUpdatePayload,
  DeviceStatus,
} from '@echocast/shared';
import { logger } from '../utils/logger';

const devLogger = logger.forContext('DeviceManager');

export type DeviceChangeCallback = (devices: DeviceInfo[]) => void;

export class DeviceManagerService {
  private devices: Map<string, DeviceInfo> = new Map();
  private changeListeners: Set<DeviceChangeCallback> = new Set();
  private graceTimers: Map<string, NodeJS.Timeout> = new Map();

  public subscribe(cb: DeviceChangeCallback): () => void {
    this.changeListeners.add(cb);
    return () => this.changeListeners.delete(cb);
  }

  private notify() {
    const list = this.getAllDevices();
    for (const listener of this.changeListeners) {
      try {
        listener(list);
      } catch (err) {
        devLogger.error('Error notifying device change listener', err);
      }
    }
  }

  /**
   * Register or update a device
   */
  public registerDevice(
    deviceId: string,
    payload: DeviceRegistrationPayload,
    ipAddress?: string
  ): DeviceInfo {
    const now = Date.now();

    // Cancel any pending disconnection grace timer for this device
    const pendingTimer = this.graceTimers.get(deviceId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.graceTimers.delete(deviceId);
      devLogger.info(`Cancelled disconnect grace timer for reconnecting device ${deviceId}`);
    }

    // Duplicate session mitigation: if another device with the same IP and name exists (e.g. from browser reload), clean it up
    if (ipAddress && payload.role === 'receiver') {
      for (const [id, d] of this.devices.entries()) {
        if (id !== deviceId && d.ipAddress === ipAddress && d.name === payload.name && d.role === payload.role) {
          devLogger.info(`Cleaning up stale duplicate session ${id} for device ${payload.name} (${ipAddress})`);
          this.removeDevice(id);
        }
      }
    }

    const existing = this.devices.get(deviceId);

    const device: DeviceInfo = {
      id: deviceId,
      name: (payload.name && payload.name.trim()) || existing?.name || `Device-${deviceId.substring(0, 4)}`,
      role: payload.role,
      platform: payload.platform || existing?.platform || 'other',
      outputType: payload.outputType || existing?.outputType || 'speaker',
      status: 'connected',
      roundTripTimeMs: existing?.roundTripTimeMs || 0,
      clockOffsetMs: existing?.clockOffsetMs || 0,
      manualAdjustmentMs: existing?.manualAdjustmentMs || 0,
      volume: existing?.volume ?? 1.0,
      isMuted: existing?.isMuted ?? false,
      batteryPercent: existing?.batteryPercent,
      connectedAt: existing?.connectedAt || now,
      lastPingAt: now,
      ipAddress: ipAddress || existing?.ipAddress,
      userAgent: payload.userAgent || existing?.userAgent,
      audioBufferReady: existing?.audioBufferReady ?? false,
      roomId: payload.roomId || existing?.roomId || 'ECHO-CAST',
    };

    this.devices.set(deviceId, device);
    devLogger.info(`Device registered: [${device.role}] ${device.name} (${device.id}) via ${device.ipAddress || 'unknown'}`);
    this.notify();
    return device;
  }

  /**
   * Mark a device as reconnecting with a grace period before permanently removing it.
   * Prevents premature device drops and roster fluttering on temporary Wi-Fi blips.
   */
  public markDeviceDisconnecting(deviceId: string, gracePeriodMs: number = 20000): void {
    const device = this.devices.get(deviceId);
    if (!device) return;

    // Clear any previous timer
    const prevTimer = this.graceTimers.get(deviceId);
    if (prevTimer) {
      clearTimeout(prevTimer);
    }

    device.status = 'reconnecting';
    devLogger.info(`Device [${device.name}] marked as reconnecting. Starting ${gracePeriodMs}ms grace period.`);
    this.notify();

    const timer = setTimeout(() => {
      this.graceTimers.delete(deviceId);
      const target = this.devices.get(deviceId);
      if (target && target.status === 'reconnecting') {
        this.devices.delete(deviceId);
        devLogger.info(`Grace period expired for device ${target.name} (${deviceId}). Removed from roster.`);
        this.notify();
      }
    }, gracePeriodMs);

    this.graceTimers.set(deviceId, timer);
  }

  /**
   * Update device metrics (RTT, offset, volume, status, etc.)
   */
  public updateDeviceState(
    deviceId: string,
    updates: DeviceStateUpdatePayload
  ): DeviceInfo | null {
    const device = this.devices.get(deviceId);
    if (!device) return null;

    if (updates.name !== undefined && updates.name.trim()) device.name = updates.name.trim();
    if (updates.status !== undefined) device.status = updates.status;
    if (updates.outputType !== undefined) device.outputType = updates.outputType;
    if (updates.roundTripTimeMs !== undefined) device.roundTripTimeMs = updates.roundTripTimeMs;
    if (updates.clockOffsetMs !== undefined) device.clockOffsetMs = updates.clockOffsetMs;
    if (updates.jitterMs !== undefined) device.jitterMs = updates.jitterMs;
    if (updates.manualAdjustmentMs !== undefined) device.manualAdjustmentMs = updates.manualAdjustmentMs;
    if (updates.effectiveLatencyMs !== undefined) device.effectiveLatencyMs = updates.effectiveLatencyMs;
    if (updates.syncErrorMs !== undefined) device.syncErrorMs = updates.syncErrorMs;
    if (updates.playbackPositionSec !== undefined) device.playbackPositionSec = updates.playbackPositionSec;
    if (updates.bufferHealth !== undefined) device.bufferHealth = updates.bufferHealth;
    if (updates.bufferProgress !== undefined) device.bufferProgress = updates.bufferProgress;
    if (updates.syncQuality !== undefined) device.syncQuality = updates.syncQuality;
    if (updates.volume !== undefined) device.volume = updates.volume;
    if (updates.isMuted !== undefined) device.isMuted = updates.isMuted;
    if (updates.batteryPercent !== undefined) device.batteryPercent = updates.batteryPercent;
    if (updates.audioBufferReady !== undefined) device.audioBufferReady = updates.audioBufferReady;
    if (updates.roomId !== undefined) device.roomId = updates.roomId;

    device.lastPingAt = Date.now();
    this.devices.set(deviceId, device);
    this.notify();
    return device;
  }

  /**
   * Record a ping from a device
   */
  public recordPing(deviceId: string) {
    const device = this.devices.get(deviceId);
    if (device) {
      device.lastPingAt = Date.now();
    }
  }

  /**
   * Remove a disconnected device immediately
   */
  public removeDevice(deviceId: string): boolean {
    const pendingTimer = this.graceTimers.get(deviceId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.graceTimers.delete(deviceId);
    }

    const device = this.devices.get(deviceId);
    if (device) {
      this.devices.delete(deviceId);
      devLogger.info(`Device removed: ${device.name} (${deviceId})`);
      this.notify();
      return true;
    }
    return false;
  }

  public getDevice(deviceId: string): DeviceInfo | undefined {
    return this.devices.get(deviceId);
  }

  public getAllDevices(): DeviceInfo[] {
    return Array.from(this.devices.values());
  }

  public getReceivers(): DeviceInfo[] {
    return this.getAllDevices().filter((d) => d.role === 'receiver');
  }

  public getSender(): DeviceInfo | undefined {
    return this.getAllDevices().find((d) => d.role === 'sender');
  }

  public setGroupVolume(volume: number) {
    const clamped = Math.max(0, Math.min(1, volume));
    for (const d of this.devices.values()) {
      if (d.role === 'receiver') {
        d.volume = clamped;
      }
    }
    this.notify();
  }

  public setGroupMute(isMuted: boolean) {
    for (const d of this.devices.values()) {
      if (d.role === 'receiver') {
        d.isMuted = isMuted;
      }
    }
    this.notify();
  }
}

export const deviceManager = new DeviceManagerService();
