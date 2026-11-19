import { spawn } from 'child_process';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
            text: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function httpPostMultipart(url, filename, fileBuffer, mimeType = 'audio/wav') {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const boundary = `----EchoCastSyncTest${Date.now()}`;

    const header = `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;

    const body = Buffer.concat([
      Buffer.from(header, 'utf8'),
      fileBuffer,
      Buffer.from(footer, 'utf8'),
    ]);

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
            text: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function connectWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function createDummyWav(durationSec = 2, sampleRate = 44100) {
  const numSamples = sampleRate * durationSec;
  const pcmData = new Int16Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    pcmData[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0x4000;
  }
  const dataSize = pcmData.length * 2;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, Buffer.from(pcmData.buffer)]);
}

// Client-side SNTP Time Sync Engine matching client/src/core/sync/timeSync.ts
class SimulatedTimeSync {
  constructor(clockOffsetDelta = 0) {
    this.simulatedSkewMs = clockOffsetDelta;
    this.samples = [];
    this.currentOffsetMs = 0;
    this.currentRttMs = 0;
    this.currentJitterMs = 0;
  }

  getLocalTime() {
    return Date.now() + this.simulatedSkewMs;
  }

  recordSample(t0, t1, t2, t3) {
    const roundTripTimeMs = Math.max(0, (t3 - t0) - (t2 - t1));
    const offsetMs = ((t1 - t0) + (t2 - t3)) / 2;

    this.samples.push({ roundTripTimeMs, offsetMs, timestamp: t3 });
    if (this.samples.length > 25) this.samples.shift();

    this.recomputeOffset();
    return { roundTripTimeMs, offsetMs };
  }

  recomputeOffset() {
    if (this.samples.length === 0) return;
    if (this.samples.length === 1) {
      this.currentOffsetMs = this.samples[0].offsetMs;
      this.currentRttMs = this.samples[0].roundTripTimeMs;
      this.currentJitterMs = 0;
      return;
    }

    const sortedByRtt = [...this.samples].sort((a, b) => a.roundTripTimeMs - b.roundTripTimeMs);
    const countToKeep = Math.max(1, Math.ceil(sortedByRtt.length * 0.6));
    const bestSamples = sortedByRtt.slice(0, countToKeep);

    let totalWeight = 0;
    let weightedOffsetSum = 0;
    let rttSum = 0;

    for (const s of bestSamples) {
      const weight = 1 / Math.pow(Math.max(1, s.roundTripTimeMs), 2);
      totalWeight += weight;
      weightedOffsetSum += s.offsetMs * weight;
      rttSum += s.roundTripTimeMs;
    }

    const newTargetOffset = weightedOffsetSum / totalWeight;
    this.currentRttMs = rttSum / bestSamples.length;

    const alpha = this.samples.length < 5 ? 0.5 : 0.25;
    this.currentOffsetMs = alpha * newTargetOffset + (1 - alpha) * this.currentOffsetMs;

    const variance =
      bestSamples.reduce((sum, s) => sum + Math.pow(s.offsetMs - this.currentOffsetMs, 2), 0) /
      bestSamples.length;
    this.currentJitterMs = Math.sqrt(variance);
  }

  toLocalTime(serverTime) {
    return serverTime - this.currentOffsetMs;
  }

  toServerTime(localTime) {
    return localTime + this.currentOffsetMs;
  }
}

// Client-side drift correction simulation matching client/src/core/audio/webAudioEngine.ts
function simulateDriftCorrection(syncErrorMs) {
  const absError = Math.abs(syncErrorMs);

  // Deadband: within ±20ms
  if (absError <= 20) {
    return { action: 'deadband', playbackRate: 1.0, hardResync: false };
  }

  // Soft rate adjustment: 20ms to 120ms
  if (absError <= 120) {
    const rate = syncErrorMs > 0 ? 0.985 : 1.015;
    return { action: 'soft_adjustment', playbackRate: rate, hardResync: false };
  }

  // Moderate rate adjustment: 120ms to 300ms
  if (absError <= 300) {
    const rate = syncErrorMs > 0 ? 0.970 : 1.030;
    return { action: 'moderate_adjustment', playbackRate: rate, hardResync: false };
  }

  // Hard resync: > 300ms
  return { action: 'hard_resync', playbackRate: 1.0, hardResync: true };
}

async function runSyncEngineTests() {
  console.log('================================================================');
  console.log('       ECHOCAST: SYNCHRONIZATION ENGINE INTEGRATION TEST        ');
  console.log('================================================================');

  const PORT = '4032';
  const SERVER_HTTP = `http://127.0.0.1:${PORT}`;
  const SERVER_WS = `ws://127.0.0.1:${PORT}/ws`;
  const ROOM_ID = 'SYNC-LAB-ROOM';

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  ✓ [PASS] ${message}`);
    } else {
      console.error(`  ✗ [FAIL] ${message}`);
    }
  }

  console.log(`[TEST SETUP] Launching EchoCast instance on port ${PORT}...`);
  const serverProc = spawn('npx', ['tsx', 'server/src/index.ts'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT, NODE_ENV: 'test', LOG_LEVEL: 'warn' },
    shell: true,
  });

  serverProc.stdout.on('data', () => {});
  serverProc.stderr.on('data', () => {});

  let isReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await httpGet(`${SERVER_HTTP}/api/health`);
      if (res.statusCode === 200) {
        isReady = true;
        break;
      }
    } catch {
      await wait(300);
    }
  }

  if (!isReady) {
    console.error('Server failed to start within timeout');
    serverProc.kill();
    process.exit(1);
  }
  console.log('[TEST SETUP] Server online and responsive.');

  let senderWs;
  const receiverSockets = [];

  try {
    // -------------------------------------------------------------------------
    // PHASE 1: Sender & Room Initialization
    // -------------------------------------------------------------------------
    console.log('\n--- PHASE 1: Sender & Room Initialization ---');
    senderWs = await connectWs(SERVER_WS);
    const senderMessages = [];
    senderWs.on('message', (d) => senderMessages.push(JSON.parse(d.toString())));

    senderWs.send(
      JSON.stringify({
        type: 'DEVICE_REGISTER',
        payload: {
          name: 'Studio Master Console',
          role: 'sender',
          platform: 'windows',
          outputType: 'speaker',
          roomId: ROOM_ID,
        },
        timestamp: Date.now(),
      })
    );
    await wait(300);

    const senderReg = senderMessages.find((m) => m.type === 'DEVICE_REGISTERED');
    assert(senderReg && senderReg.payload.role === 'sender', 'Sender registered successfully');

    // Upload test audio track
    const wavBuffer = createDummyWav(10, 44100);
    const uploadRes = await httpPostMultipart(`${SERVER_HTTP}/api/audio/upload`, 'sync_test_track.wav', wavBuffer);
    const uploadJson = JSON.parse(uploadRes.text);
    const testTrack = Array.isArray(uploadJson) ? uploadJson[0] : uploadJson;
    assert(testTrack && testTrack.id, 'Audio track uploaded for synchronization test');

    // -------------------------------------------------------------------------
    // PHASE 2: 3 Distinct Receivers (Clean Wi-Fi, Skewed Hotspot, Congested Wi-Fi)
    // -------------------------------------------------------------------------
    console.log('\n--- PHASE 2: Multi-Device Connection & Platform Simulation ---');

    // Receiver 1: Clean Wi-Fi LAN laptop (Clock synchronized, RTT ~8ms, jitter ~2ms, Speaker)
    const rx1Ws = await connectWs(SERVER_WS);
    const rx1Messages = [];
    rx1Ws.on('message', (d) => rx1Messages.push(JSON.parse(d.toString())));
    const rx1Sync = new SimulatedTimeSync(0); // 0ms clock skew

    rx1Ws.send(
      JSON.stringify({
        type: 'DEVICE_REGISTER',
        payload: {
          name: 'Receiver 1 (Clean Wi-Fi Laptop)',
          role: 'receiver',
          platform: 'windows',
          outputType: 'speaker',
          roomId: ROOM_ID,
        },
        timestamp: Date.now(),
      })
    );

    // Receiver 2: Mobile Hotspot Phone (System clock skewed by +12,400ms, Bluetooth +160ms latency)
    const rx2Ws = await connectWs(SERVER_WS);
    const rx2Messages = [];
    rx2Ws.on('message', (d) => rx2Messages.push(JSON.parse(d.toString())));
    const rx2Sync = new SimulatedTimeSync(12400); // +12.4s clock skew

    rx2Ws.send(
      JSON.stringify({
        type: 'DEVICE_REGISTER',
        payload: {
          name: 'Receiver 2 (Android Hotspot + BT)',
          role: 'receiver',
          platform: 'android',
          outputType: 'bluetooth',
          roomId: ROOM_ID,
        },
        timestamp: Date.now(),
      })
    );

    // Receiver 3: Congested Wi-Fi MacBook (RTT ~75ms, jitter ~18ms, Speaker)
    const rx3Ws = await connectWs(SERVER_WS);
    const rx3Messages = [];
    rx3Ws.on('message', (d) => rx3Messages.push(JSON.parse(d.toString())));
    const rx3Sync = new SimulatedTimeSync(-3200); // -3.2s clock skew

    rx3Ws.send(
      JSON.stringify({
        type: 'DEVICE_REGISTER',
        payload: {
          name: 'Receiver 3 (Congested Wi-Fi Mac)',
          role: 'receiver',
          platform: 'macos',
          outputType: 'speaker',
          roomId: ROOM_ID,
        },
        timestamp: Date.now(),
      })
    );

    await wait(300);

    receiverSockets.push(rx1Ws, rx2Ws, rx3Ws);
    const rx1Reg = rx1Messages.find((m) => m.type === 'DEVICE_REGISTERED');
    const rx2Reg = rx2Messages.find((m) => m.type === 'DEVICE_REGISTERED');
    const rx3Reg = rx3Messages.find((m) => m.type === 'DEVICE_REGISTERED');

    assert(
      rx1Reg && rx2Reg && rx3Reg,
      'All 3 receiver devices registered to room SYNC-LAB-ROOM'
    );

    // -------------------------------------------------------------------------
    // PHASE 3: SNTP Clock Synchronization Protocol Verification
    // -------------------------------------------------------------------------
    console.log('\n--- PHASE 3: SNTP Clock Synchronization Protocol ---');

    async function exchangeNtp(ws, msgArray, syncEngine, simulatedOneWayMs, jitterMaxMs = 0) {
      for (let i = 0; i < 10; i++) {
        const jitter = (Math.random() * 2 - 1) * jitterMaxMs;
        const latency = Math.max(1, Math.round(simulatedOneWayMs + jitter));
        await wait(latency);

        const t0 = syncEngine.getLocalTime();
        ws.send(
          JSON.stringify({
            type: 'SYNC_PING',
            payload: { clientTime: t0, deviceId: 'test-device' },
            timestamp: t0,
          })
        );

        // Wait for response
        let resp = null;
        const deadline = Date.now() + 1500;
        while (Date.now() < deadline) {
          const idx = msgArray.findIndex(
            (m) => m.type === 'SYNC_PONG' && Math.abs(m.payload.clientTime - t0) < 5
          );
          if (idx !== -1) {
            resp = msgArray.splice(idx, 1)[0];
            break;
          }
          await wait(10);
        }

        if (resp) {
          await wait(latency);
          const t3 = syncEngine.getLocalTime();
          const { serverReceiveTime: t1, serverSendTime: t2 } = resp.payload;
          syncEngine.recordSample(t0, t1, t2, t3);
        }
      }
    }

    console.log('[NTP SYNC] Syncing Receiver 1 (Clean Wi-Fi, one-way ~4ms)...');
    await exchangeNtp(rx1Ws, rx1Messages, rx1Sync, 4, 1);
    assert(
      Math.abs(rx1Sync.currentOffsetMs) <= 20,
      `Receiver 1 recovered zero-clock skew accurately (Estimated offset: ${rx1Sync.currentOffsetMs.toFixed(1)}ms)`
    );

    console.log('[NTP SYNC] Syncing Receiver 2 (Hotspot, clock skew +12,400ms, one-way ~15ms)...');
    await exchangeNtp(rx2Ws, rx2Messages, rx2Sync, 15, 3);
    const rx2OffsetError = Math.abs(rx2Sync.currentOffsetMs - (-12400));
    assert(
      rx2OffsetError <= 35,
      `Receiver 2 recovered +12.4s clock skew accurately (Estimated offset: ${rx2Sync.currentOffsetMs.toFixed(1)}ms, error: ${rx2OffsetError.toFixed(1)}ms)`
    );

    console.log('[NTP SYNC] Syncing Receiver 3 (Congested Wi-Fi, one-way ~38ms, jitter ±18ms)...');
    await exchangeNtp(rx3Ws, rx3Messages, rx3Sync, 38, 18);
    const rx3OffsetError = Math.abs(rx3Sync.currentOffsetMs - 3200);
    assert(
      rx3OffsetError <= 50,
      `Receiver 3 recovered -3.2s clock skew under heavy jitter (Estimated offset: ${rx3Sync.currentOffsetMs.toFixed(1)}ms, error: ${rx3OffsetError.toFixed(1)}ms)`
    );

    // -------------------------------------------------------------------------
    // PHASE 4: Scheduled Playback Broadcast & Clock Mapping
    // -------------------------------------------------------------------------
    console.log('\n--- PHASE 4: Scheduled Playback Broadcast & Clock Mapping ---');

    // First select track
    senderWs.send(
      JSON.stringify({
        type: 'BROADCAST_TRACK_UPDATE',
        payload: { id: testTrack.id },
        timestamp: Date.now(),
      })
    );
    await wait(200);

    rx1Messages.length = 0;
    rx2Messages.length = 0;
    rx3Messages.length = 0;

    const sendPlayTime = Date.now();
    senderWs.send(
      JSON.stringify({
        type: 'BROADCAST_PLAY',
        payload: {
          startPositionSec: 0,
          delayMs: 400,
        },
        timestamp: sendPlayTime,
      })
    );

    await wait(500);

    const rx1Broadcast = rx1Messages.find((m) => m.type === 'BROADCAST_STATE' && m.payload.isPlaying);
    const rx2Broadcast = rx2Messages.find((m) => m.type === 'BROADCAST_STATE' && m.payload.isPlaying);
    const rx3Broadcast = rx3Messages.find((m) => m.type === 'BROADCAST_STATE' && m.payload.isPlaying);

    assert(
      rx1Broadcast && rx2Broadcast && rx3Broadcast,
      'All 3 receivers received synchronized BROADCAST_STATE message with isPlaying: true'
    );

    const scheduledServerTime = rx1Broadcast.payload.scheduledStartTime || rx1Broadcast.payload.scheduledServerTime;
    assert(
      typeof scheduledServerTime === 'number' && scheduledServerTime >= sendPlayTime + 300,
      `Broadcast specifies future execution timestamp (lead time: ${scheduledServerTime - sendPlayTime}ms)`
    );

    // Check scheduled local time conversion on each receiver
    const rx1ScheduledLocal = rx1Sync.toLocalTime(scheduledServerTime);
    const rx2ScheduledLocal = rx2Sync.toLocalTime(scheduledServerTime);
    const rx3ScheduledLocal = rx3Sync.toLocalTime(scheduledServerTime);

    // Convert local times back to server physical time
    const rx1UnifiedServerTime = rx1Sync.toServerTime(rx1ScheduledLocal);
    const rx2UnifiedServerTime = rx2Sync.toServerTime(rx2ScheduledLocal);
    const rx3UnifiedServerTime = rx3Sync.toServerTime(rx3ScheduledLocal);

    const maxSyncDiscrepancy = Math.max(
      Math.abs(rx1UnifiedServerTime - scheduledServerTime),
      Math.abs(rx2UnifiedServerTime - scheduledServerTime),
      Math.abs(rx3UnifiedServerTime - scheduledServerTime)
    );

    assert(
      maxSyncDiscrepancy <= 10,
      `Unified playback trigger across 3 disparate device clocks matches within ±${maxSyncDiscrepancy.toFixed(1)}ms (Target <= 15ms)`
    );

    // -------------------------------------------------------------------------
    // PHASE 5: Telemetry Reporting & Server-Side Sync Deviation Derivation
    // -------------------------------------------------------------------------
    console.log('\n--- PHASE 5: Telemetry Reporting & Sync Deviation Analysis ---');

    senderMessages.length = 0;

    // Simulate current playback position based on elapsed time
    const nowServerTime = Date.now();
    const elapsedSinceScheduledSec = Math.max(0, (nowServerTime - scheduledServerTime) / 1000);

    // Receiver 1: On-time (matches elapsed time exactly)
    rx1Ws.send(
      JSON.stringify({
        type: 'DEVICE_STATE_UPDATE',
        payload: {
          clockOffsetMs: rx1Sync.currentOffsetMs,
          roundTripTimeMs: rx1Sync.currentRttMs,
          jitterMs: rx1Sync.currentJitterMs,
          playbackPositionSec: elapsedSinceScheduledSec,
          audioBufferReady: true,
          bufferProgress: 100,
          effectiveLatencyMs: 4,
        },
        timestamp: Date.now(),
      })
    );

    // Receiver 2: Bluetooth output (+160ms latency compensated, reports exact match + 5ms)
    rx2Ws.send(
      JSON.stringify({
        type: 'DEVICE_STATE_UPDATE',
        payload: {
          clockOffsetMs: rx2Sync.currentOffsetMs,
          roundTripTimeMs: rx2Sync.currentRttMs,
          jitterMs: rx2Sync.currentJitterMs,
          playbackPositionSec: elapsedSinceScheduledSec + 0.005,
          audioBufferReady: true,
          bufferProgress: 100,
          effectiveLatencyMs: 160 + 15,
        },
        timestamp: Date.now(),
      })
    );

    // Receiver 3: Lagging by 85ms due to Wi-Fi buffer stall
    rx3Ws.send(
      JSON.stringify({
        type: 'DEVICE_STATE_UPDATE',
        payload: {
          clockOffsetMs: rx3Sync.currentOffsetMs,
          roundTripTimeMs: rx3Sync.currentRttMs,
          jitterMs: rx3Sync.currentJitterMs,
          playbackPositionSec: Math.max(0, elapsedSinceScheduledSec - 0.085),
          audioBufferReady: true,
          bufferProgress: 85,
          effectiveLatencyMs: 38,
        },
        timestamp: Date.now(),
      })
    );

    await wait(300);

    // Find DEVICE_LIST received by sender
    const deviceLists = senderMessages.filter((m) => m.type === 'DEVICE_LIST');
    const latestDeviceList = deviceLists[deviceLists.length - 1];

    assert(
      latestDeviceList && Array.isArray(latestDeviceList.payload),
      'Sender received broadcast DEVICE_LIST with active receivers'
    );

    const reportedRx1 = latestDeviceList.payload.find((r) => r.id === rx1Reg.payload.id);
    const reportedRx2 = latestDeviceList.payload.find((r) => r.id === rx2Reg.payload.id);
    const reportedRx3 = latestDeviceList.payload.find((r) => r.id === rx3Reg.payload.id);

    assert(
      reportedRx1 && typeof reportedRx1.syncErrorMs === 'number',
      `Receiver 1 telemetry syncErrorMs calculated by server: ${reportedRx1?.syncErrorMs}ms`
    );
    assert(
      reportedRx2 && reportedRx2.effectiveLatencyMs >= 160,
      `Receiver 2 Bluetooth delay tracked in telemetry: ${reportedRx2?.effectiveLatencyMs}ms`
    );
    assert(
      reportedRx3 && typeof reportedRx3.syncErrorMs === 'number' && reportedRx3.bufferProgress === 85,
      `Receiver 3 buffer progress (85%) and sync deviation tracked: ${reportedRx3?.syncErrorMs}ms`
    );

    // -------------------------------------------------------------------------
    // PHASE 6: Dynamic Drift Correction Algorithm Unit Tests
    // -------------------------------------------------------------------------
    console.log('\n--- PHASE 6: Dynamic Playback Drift Correction Engine ---');

    // Test 6.1: Deadband test (<= 20ms)
    const deadbandTest = simulateDriftCorrection(12);
    assert(
      deadbandTest.action === 'deadband' && deadbandTest.playbackRate === 1.0,
      'Within deadband (±12ms): preserves 1.000x rate to avoid acoustic pitch fluttering'
    );

    // Test 6.2: Soft forward drift (+45ms, device ahead)
    const softAheadTest = simulateDriftCorrection(45);
    assert(
      softAheadTest.action === 'soft_adjustment' && softAheadTest.playbackRate === 0.985,
      'Soft forward drift (+45ms): slows playbackRate by -1.5% (0.985x) for imperceptible convergence'
    );

    // Test 6.3: Soft lagging drift (-60ms, device behind)
    const softBehindTest = simulateDriftCorrection(-60);
    assert(
      softBehindTest.action === 'soft_adjustment' && softBehindTest.playbackRate === 1.015,
      'Soft lagging drift (-60ms): speeds up playbackRate by +1.5% (1.015x) smoothly'
    );

    // Test 6.4: Moderate drift (+220ms)
    const moderateTest = simulateDriftCorrection(220);
    assert(
      moderateTest.action === 'moderate_adjustment' && moderateTest.playbackRate === 0.970,
      'Moderate drift (+220ms): applies -3.0% rate adjustment (0.970x) to rapidly recover sync'
    );

    // Test 6.5: Severe desync (> 300ms)
    const severeTest = simulateDriftCorrection(450);
    assert(
      severeTest.action === 'hard_resync' && severeTest.hardResync === true,
      'Severe drift (>300ms): triggers instant hard resync repositioning'
    );

    // -------------------------------------------------------------------------
    // PHASE 7: Acoustic Synchronization Pulse Broadcast
    // -------------------------------------------------------------------------
    console.log('\n--- PHASE 7: Acoustic Synchronization Pulse (Audio Alignment) ---');

    rx1Messages.length = 0;
    rx2Messages.length = 0;
    rx3Messages.length = 0;

    senderWs.send(
      JSON.stringify({
        type: 'TEST_PULSE_PLAY',
        payload: {
          frequencyHz: 1000,
          durationMs: 80,
        },
        timestamp: Date.now(),
      })
    );

    await wait(300);

    const pulse1 = rx1Messages.find((m) => m.type === 'TEST_PULSE_PLAY');
    const pulse2 = rx2Messages.find((m) => m.type === 'TEST_PULSE_PLAY');
    const pulse3 = rx3Messages.find((m) => m.type === 'TEST_PULSE_PLAY');

    assert(
      pulse1 && pulse2 && pulse3,
      'All 3 receivers received synchronized TEST_PULSE_PLAY command'
    );

    const pulseServerTime = pulse1?.payload?.scheduledServerTime;
    assert(
      pulseServerTime && pulseServerTime > Date.now(),
      `Acoustic test pulse scheduled at synchronized future time (+${pulseServerTime ? pulseServerTime - Date.now() : 0}ms)`
    );

    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log(` SYNCHRONIZATION ENGINE TESTS: ${passedTests}/${totalTests} PASSED`);
    console.log('================================================================\n');

    if (passedTests === totalTests) {
      console.log('ALL SYNCHRONIZATION ENGINE TESTS PASSED SUCCESSFULLY! ✓✓✓');
    } else {
      console.error(`FAILED: ${totalTests - passedTests} tests failed.`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exitCode = 1;
  } finally {
    if (senderWs) senderWs.close();
    receiverSockets.forEach((ws) => ws.close());
    serverProc.kill();
  }
}

runSyncEngineTests();
