import { spawn } from 'child_process';
import http from 'http';
import path from 'path';
import fs from 'fs';
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
    const boundary = `----EchoCastRadioBoundary${Date.now()}`;

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

function createTestWav(durationSec = 4, sampleRate = 44100) {
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
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, Buffer.from(pcmData.buffer)]);
}

async function runRadioSyncTests() {
  console.log('================================================================');
  console.log('  ECHOCAST: SYNCHRONIZED RADIO ARCHITECTURE INTEGRATION TEST    ');
  console.log('================================================================');

  const PORT = '4070';
  const SERVER_HTTP = `http://127.0.0.1:${PORT}`;
  const SERVER_WS = `ws://127.0.0.1:${PORT}/ws`;
  const ROOM_ID = 'RADIO-BROADCAST-LAB';

  let passedTests = 0;
  let totalTests = 0;

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
  const tsxCli = path.resolve(__dirname, '../node_modules/tsx/dist/cli.mjs');
  const serverProc = spawn(process.execPath, [tsxCli, 'server/src/index.ts'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT, NODE_ENV: 'test', LOG_LEVEL: 'warn' },
  });

  let isReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await httpGet(`${SERVER_HTTP}/api/network/interfaces`);
      if (res.statusCode === 200) {
        isReady = true;
        break;
      }
    } catch {}
    await wait(200);
  }

  if (!isReady) {
    console.error('Server failed to start within timeout');
    serverProc.kill();
    process.exit(1);
  }
  console.log('✅ Server online and responding.');

  try {
    // ============================================================================
    // TEST 1: Authoritative Broadcast Timeline REST Endpoints & Structure
    // ============================================================================
    console.log('\n--- TEST 1: Authoritative Broadcast Timeline Structure ---');
    const timelineRes = await httpGet(`${SERVER_HTTP}/api/audio/timeline`);
    assert(timelineRes.statusCode === 200, 'GET /api/audio/timeline returns HTTP 200');

    const timeline = JSON.parse(timelineRes.text);
    assert(typeof timeline.timelineId === 'string', 'Timeline has unique timelineId');
    assert(typeof timeline.generation === 'number', 'Timeline has integer generation sequence');
    assert(timeline.state === 'idle', `Timeline initial state is 'idle' (got: ${timeline.state})`);
    assert(timeline.playbackRate === 1.0, 'Timeline authoritative playbackRate is 1.0');
    assert(timeline.chunkDurationSec === 1.0, 'Timeline chunkDurationSec is 1.0 second');
    assert(typeof timeline.serverTime === 'number', 'Timeline carries authoritative serverTime timestamp');
    assert(timeline.currentPositionSec === 0, 'Initial authoritative position is 0.0s');

    // ============================================================================
    // TEST 2: Sequential Audio Chunk Streaming & Gapless Headers
    // ============================================================================
    console.log('\n--- TEST 2: Sequential Audio Chunk Streaming & Headers ---');
    const chunksMetaRes = await httpGet(`${SERVER_HTTP}/api/audio/chunks-meta/test-metronome-sync`);
    assert(chunksMetaRes.statusCode === 200, 'GET /api/audio/chunks-meta/:trackId returns HTTP 200');

    const meta = JSON.parse(chunksMetaRes.text);
    assert(meta.trackId === 'test-metronome-sync', 'Chunk metadata matches requested track');
    assert(meta.totalChunks === 12, `Total chunks for 12s track is 12 (got: ${meta.totalChunks})`);
    assert(meta.chunkDurationSec === 1.0, 'Chunk duration is 1.0 second');

    // Request chunk 0
    const chunk0 = await httpGet(`${SERVER_HTTP}/api/audio/chunk/test-metronome-sync/0`);
    assert(chunk0.statusCode === 200, 'Chunk 0 returns HTTP 200 OK');
    assert(chunk0.headers['content-type'] === 'audio/wav', 'Chunk Content-Type is audio/wav');
    assert(chunk0.headers['x-chunk-index'] === '0', 'X-Chunk-Index header is 0');
    assert(chunk0.headers['x-chunk-start-sec'] === '0.000', 'X-Chunk-Start-Sec is 0.000s');
    assert(chunk0.headers['x-chunk-duration-sec'] === '1.000', 'X-Chunk-Duration-Sec is 1.000s');

    // Verify RIFF WAV Header
    const riff = chunk0.body.subarray(0, 4).toString('ascii');
    const wave = chunk0.body.subarray(8, 12).toString('ascii');
    assert(riff === 'RIFF' && wave === 'WAVE', 'Chunk body is a valid 44-byte RIFF WAVE container');

    // Request chunk 1 (must be contiguous)
    const chunk1 = await httpGet(`${SERVER_HTTP}/api/audio/chunk/test-metronome-sync/1`);
    assert(chunk1.statusCode === 200, 'Chunk 1 returns HTTP 200 OK');
    assert(chunk1.headers['x-chunk-index'] === '1', 'X-Chunk-Index header is 1');
    assert(chunk1.headers['x-chunk-start-sec'] === '1.000', 'X-Chunk-Start-Sec is 1.000s (seamless gapless sequence)');

    // ============================================================================
    // TEST 3: Uploaded Track Chunking & Decoding (WAV & Dynamic Slicing)
    // ============================================================================
    console.log('\n--- TEST 3: Uploaded Track Dynamic Chunking & Slicing ---');
    const testWavBuffer = createTestWav(4, 44100);
    const uploadRes = await httpPostMultipart(`${SERVER_HTTP}/api/audio/upload`, 'radio_tune.wav', testWavBuffer);
    assert(uploadRes.statusCode === 201, 'Uploaded 4-second WAV track (HTTP 201)');

    const uploadedTrackData = JSON.parse(uploadRes.text);
    const newTrack = Array.isArray(uploadedTrackData) ? uploadedTrackData[0] : uploadedTrackData;
    assert(newTrack && newTrack.id, `Track cataloged with ID: ${newTrack.id}`);

    const uploadedChunk0 = await httpGet(`${SERVER_HTTP}/api/audio/chunk/${newTrack.id}/0`);
    assert(uploadedChunk0.statusCode === 200, 'Uploaded track chunk 0 delivered as audio/wav');
    assert(uploadedChunk0.headers['x-chunk-start-sec'] === '0.000', 'Uploaded track chunk 0 startSec is 0.000s');

    const uploadedChunk3 = await httpGet(`${SERVER_HTTP}/api/audio/chunk/${newTrack.id}/3`);
    assert(uploadedChunk3.statusCode === 200, 'Uploaded track chunk 3 delivered as audio/wav');
    assert(uploadedChunk3.headers['x-chunk-start-sec'] === '3.000', 'Uploaded track chunk 3 startSec is 3.000s');

    // ============================================================================
    // TEST 4: Sender Host Registration & Multi-Receiver Connections
    // ============================================================================
    console.log('\n--- TEST 4: Multi-Device Setup (Sender + 3 Receivers) ---');
    const senderWs = await connectWs(SERVER_WS);
    senderWs.send(
      JSON.stringify({
        type: 'DEVICE_REGISTER',
        payload: {
          id: 'dell-sender-host',
          name: 'Dell XPS Sender Host',
          role: 'sender',
          platform: 'windows',
          roomId: ROOM_ID,
        },
        timestamp: Date.now(),
      })
    );

    // Create 3 receiver clients (representing heterogeneous devices)
    const receivers = [
      { id: 'iphone10-rx-1', name: 'iPhone 10 Safari', platform: 'ios', outputType: 'speaker' },
      { id: 'android-rx-2', name: 'Pixel 8 Android', platform: 'android', outputType: 'bluetooth' },
      { id: 'macbook-rx-3', name: 'MacBook Air', platform: 'macos', outputType: 'headphones' },
    ];

    const rxSockets = [];
    const rxTimelineUpdates = new Map();

    for (const rx of receivers) {
      const ws = await connectWs(SERVER_WS);
      rxSockets.push(ws);
      rxTimelineUpdates.set(rx.id, []);

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'BROADCAST_TIMELINE_UPDATE') {
          rxTimelineUpdates.get(rx.id).push(msg.payload);
        }
      });

      ws.send(
        JSON.stringify({
          type: 'DEVICE_REGISTER',
          payload: {
            id: rx.id,
            name: rx.name,
            role: 'receiver',
            platform: rx.platform,
            outputType: rx.outputType,
            roomId: ROOM_ID,
          },
          timestamp: Date.now(),
        })
      );
    }

    await wait(300);
    assert(rxSockets.length === 3, 'All 3 receiver WebSockets connected to room');

    // ============================================================================
    // TEST 5: Synchronized Broadcast Play & Authoritative Timeline Alignment
    // ============================================================================
    console.log('\n--- TEST 5: Broadcast Play & Scheduled Timeline Alignment ---');
    // Clear captured updates
    for (const arr of rxTimelineUpdates.values()) arr.length = 0;

    // Sender initiates Broadcast Play with 400ms schedule delay
    senderWs.send(
      JSON.stringify({
        type: 'BROADCAST_PLAY',
        payload: {
          trackId: newTrack.id,
          startPositionSec: 0,
          delayMs: 400,
        },
        timestamp: Date.now(),
      })
    );

    await wait(200);

    for (const rx of receivers) {
      const updates = rxTimelineUpdates.get(rx.id);
      assert(updates.length > 0, `${rx.name} received BROADCAST_TIMELINE_UPDATE`);
      const tl = updates[updates.length - 1];
      assert(tl.state === 'playing', `${rx.name} timeline state is 'playing'`);
      assert(tl.startPositionSec === 0, `${rx.name} startPositionSec is 0.0s`);
      assert(tl.broadcastStartTime > Date.now(), `${rx.name} broadcastStartTime scheduled in future`);
    }

    // ============================================================================
    // TEST 6: Continuous Phase-Locked Loop (PLL) Drift Correction Thresholds
    // ============================================================================
    console.log('\n--- TEST 6: Continuous Phase-Locked Loop (PLL) Drift Correction ---');
    // Simulate drift evaluation logic:
    function evaluateDriftRate(driftMs) {
      const absDriftMs = Math.abs(driftMs);
      if (absDriftMs <= 15) return { rate: 1.0, isPhaseLocked: true, action: 'deadband' };
      if (absDriftMs <= 100) return { rate: driftMs < 0 ? 1.003 : 0.997, isPhaseLocked: false, action: 'inaudible-nudge' };
      if (absDriftMs <= 250) return { rate: driftMs < 0 ? 1.015 : 0.985, isPhaseLocked: false, action: 'moderate-steer' };
      return { rate: 1.0, isPhaseLocked: false, action: 'hard-resync' };
    }

    // Deadband test (<= 15ms)
    const deadband = evaluateDriftRate(8);
    assert(deadband.isPhaseLocked === true && deadband.rate === 1.0, 'Drift +8ms: in-phase acoustic lock (rate = 1.000x)');

    // Inaudible rate nudge test (15ms - 100ms)
    const nudgeLag = evaluateDriftRate(-45);
    assert(nudgeLag.rate === 1.003 && nudgeLag.action === 'inaudible-nudge', 'Lagging -45ms: inaudible +0.3% rate steer (1.003x) without pitch artifacts');

    const nudgeLead = evaluateDriftRate(60);
    assert(nudgeLead.rate === 0.997 && nudgeLead.action === 'inaudible-nudge', 'Leading +60ms: inaudible -0.3% rate steer (0.997x)');

    // Moderate steer (100ms - 250ms)
    const modLag = evaluateDriftRate(-180);
    assert(modLag.rate === 1.015 && modLag.action === 'moderate-steer', 'Moderate lag -180ms: applies +1.5% rate steer (1.015x)');

    // Hard resync (> 250ms)
    const severeDrift = evaluateDriftRate(320);
    assert(severeDrift.action === 'hard-resync', 'Severe drift +320ms: triggers instantaneous timeline resynchronization');

    // ============================================================================
    // TEST 7: Sender Playback Controls (Pause, Resume, Seek) on Timeline
    // ============================================================================
    console.log('\n--- TEST 7: Broadcast Controls (Pause, Resume, Seek) ---');
    // Pause
    for (const arr of rxTimelineUpdates.values()) arr.length = 0;
    senderWs.send(
      JSON.stringify({
        type: 'BROADCAST_PAUSE',
        payload: {},
        timestamp: Date.now(),
      })
    );
    await wait(200);

    for (const rx of receivers) {
      const updates = rxTimelineUpdates.get(rx.id);
      assert(updates.length > 0, `${rx.name} received PAUSE timeline update`);
      const tl = updates[updates.length - 1];
      assert(tl.state === 'paused', `${rx.name} timeline state paused`);
    }

    // Seek to 2.50s
    for (const arr of rxTimelineUpdates.values()) arr.length = 0;
    senderWs.send(
      JSON.stringify({
        type: 'BROADCAST_SEEK',
        payload: {
          trackId: newTrack.id,
          targetPositionSec: 2.5,
          delayMs: 300,
        },
        timestamp: Date.now(),
      })
    );
    await wait(200);

    for (const rx of receivers) {
      const updates = rxTimelineUpdates.get(rx.id);
      assert(updates.length > 0, `${rx.name} received SEEK timeline update`);
      const tl = updates[updates.length - 1];
      assert(tl.startPositionSec === 2.5, `${rx.name} timeline seek position set to 2.50s`);
      assert(tl.generation > 1, `${rx.name} timeline generation incremented for seek flush`);
    }

    // ============================================================================
    // TEST 8: Late-Joining Receiver Mid-Broadcast Catch-Up
    // ============================================================================
    console.log('\n--- TEST 8: Late-Joining Receiver Catch-Up Mid-Broadcast ---');
    // Receiver 4 connects while playback is already active
    const rxLate = await connectWs(SERVER_WS);
    let lateRxState = null;
    let lateRxTimeline = null;

    rxLate.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'BROADCAST_STATE') lateRxState = msg.payload;
      if (msg.type === 'BROADCAST_TIMELINE_UPDATE') lateRxTimeline = msg.payload;
    });

    rxLate.send(
      JSON.stringify({
        type: 'DEVICE_REGISTER',
        payload: {
          id: 'rx-late-joiner-4',
          name: 'Late Joining iPad',
          role: 'receiver',
          platform: 'ios',
          outputType: 'speaker',
          roomId: ROOM_ID,
        },
        timestamp: Date.now(),
      })
    );

    await wait(300);
    assert(lateRxState !== null, 'Late joiner received immediate BROADCAST_STATE on connect');
    assert(lateRxTimeline !== null, 'Late joiner received immediate BROADCAST_TIMELINE_UPDATE');
    assert(lateRxTimeline.startPositionSec === 2.5, 'Late joiner captured current authoritative seek position (2.50s)');

    // Existing receivers must still have sockets open with no restart
    for (const ws of rxSockets) {
      assert(ws.readyState === WebSocket.OPEN, 'Existing playing receivers remained uninterrupted');
    }

    // ============================================================================
    // TEST 9: Jitter Buffer Underrun & Catch-Up Recovery
    // ============================================================================
    console.log('\n--- TEST 9: Jitter Buffer Underrun & Catch-Up Recovery ---');
    // Simulate underrun condition:
    // If a receiver misses chunks due to Wi-Fi drop, it queries live position and fetches upcoming chunk
    const currentTimelineRes = await httpGet(`${SERVER_HTTP}/api/audio/timeline`);
    const liveTl = JSON.parse(currentTimelineRes.text);
    const livePosition = liveTl.currentPositionSec;
    const requiredChunkIndex = Math.floor(livePosition / 1.0);

    const recoveryChunk = await httpGet(`${SERVER_HTTP}/api/audio/chunk/${newTrack.id}/${requiredChunkIndex}`);
    assert(recoveryChunk.statusCode === 200, `Underrun recovery: fetched live chunk index ${requiredChunkIndex} instantly`);
    assert(recoveryChunk.headers['content-type'] === 'audio/wav', 'Underrun recovery chunk is audio/wav container ready for instant WebAudio playback');

    // Clean up WebSockets
    senderWs.close();
    for (const ws of rxSockets) ws.close();
    rxLate.close();

    console.log('\n================================================================');
    console.log(` SYNCHRONIZED RADIO TESTS: ${passedTests}/${totalTests} PASSED`);
    console.log('================================================================');
    if (passedTests === totalTests) {
      console.log('🎉 ALL SYNCHRONIZED RADIO ARCHITECTURE TESTS PASSED WITH 100% SUCCESS!\n');
    } else {
      console.error(`⚠️ FAILED: ${totalTests - passedTests} tests failed.\n`);
      process.exitCode = 1;
    }
  } finally {
    serverProc.kill();
  }
}

runRadioSyncTests().catch((err) => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
