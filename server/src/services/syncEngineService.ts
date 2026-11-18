import { SyncPingPayload, SyncPongPayload } from '@echocast/shared';
import { logger } from '../utils/logger';

const syncLogger = logger.forContext('SyncEngine');

export class SyncEngineService {
  private epochAnchor: number;
  private hrAnchor: bigint;

  constructor() {
    this.epochAnchor = Date.now();
    this.hrAnchor = process.hrtime.bigint();
    syncLogger.info(`SyncEngine initialized. Epoch anchor: ${this.epochAnchor}`);
  }

  /**
   * Returns current high-precision monotonic server timestamp in milliseconds
   */
  public getServerTime(): number {
    const elapsedNs = process.hrtime.bigint() - this.hrAnchor;
    const elapsedMs = Number(elapsedNs) / 1_000_000;
    return this.epochAnchor + elapsedMs;
  }

  /**
   * Process a client NTP ping and produce the pong payload
   */
  public processPing(payload: SyncPingPayload): SyncPongPayload {
    const serverReceiveTime = this.getServerTime();
    // Simulate instantaneous or tiny compute delta for serverSendTime
    const serverSendTime = this.getServerTime();

    return {
      clientTime: payload.clientTime,
      serverReceiveTime,
      serverSendTime,
    };
  }

  /**
   * Calculate future scheduled server time with safety broadcast window
   */
  public calculateScheduledTime(delayMs: number = 650): number {
    return this.getServerTime() + delayMs;
  }
}

export const syncEngine = new SyncEngineService();
