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
    const boundary = `----EchoCastTestBoundary${Date.now()}`;

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

async function runStreamingEngineTests() {
  console.log('================================================================');
  console.log('      ECHOCAST: AUDIO STREAMING ENGINE INTEGRATION TEST         ');
  console.log('================================================================');

  const PORT = '4020';
  const SERVER_HTTP = `http://127.0.0.1:${PORT}`;
  const SERVER_WS = `ws://127.0.0.1:${PORT}/ws`;

  // Start real EchoCast server on port 4020
  console.log(`[TEST SETUP] Launching EchoCast test instance on port ${PORT}...`);
  const serverProc = spawn('npx', ['tsx', 'server/src/index.ts'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT, NODE_ENV: 'test', LOG_LEVEL: 'warn' },
    shell: true,
  });

  serverProc.stdout.on('data', (d) => {
    // console.log('[SERVER]', d.toString().trim());
  });
  serverProc.stderr.on('data', (d) => {
    // console.error('[SERVER ERR]', d.toString().trim());
  });

  let serverUp = false;
  for (let i = 0; i < 20; i++) {
    await wait(600);
    try {
      const res = await httpGet(`${SERVER_HTTP}/api/server/status`);
      if (res.statusCode === 200) {
        serverUp = true;
        break;
      }
    } catch {}
  }

  if (!serverUp) {
    console.error('FAILED: Server failed to start on port 4020.');
    serverProc.kill();
    process.exit(1);
  }
  console.log('✅ Server online and responding.');

  let testsPassed = 0;
  let testsFailed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      testsPassed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      testsFailed++;
    }
  }

  try {
    // TEST 1: Full Stream Delivery of Built-in Sync Track
    console.log('\n--- TEST 1: Full Stream Delivery (HTTP 200, ETag, MIME Type) ---');
    const fullRes = await httpGet(`${SERVER_HTTP}/api/audio/stream/test-metronome-sync`);
    assert(fullRes.statusCode === 200, `Status code is 200 (got ${fullRes.statusCode})`);
    assert(fullRes.headers['content-type'] === 'audio/wav', `Content-Type is audio/wav (got ${fullRes.headers['content-type']})`);
    assert(fullRes.headers['accept-ranges'] === 'bytes', `Accept-Ranges header is bytes`);
    assert(fullRes.headers['etag'] === '"test-metronome-sync-v1"', `ETag header present (${fullRes.headers['etag']})`);
    assert(fullRes.body.length > 1000000, `Full WAV stream body delivered (${(fullRes.body.length / 1024).toFixed(1)} KB)`);

    const totalTrackBytes = fullRes.body.length;

    // TEST 2: HTTP Byte-Range Streaming (Partial Content 206)
    console.log('\n--- TEST 2: HTTP Byte-Range Delivery (HTTP 206 Partial Content) ---');
    const range1 = await httpGet(`${SERVER_HTTP}/api/audio/stream/test-metronome-sync`, {
      Range: 'bytes=0-1023',
    });
    assert(range1.statusCode === 206, `Range 0-1023 returns HTTP 206 (got ${range1.statusCode})`);
    assert(range1.body.length === 1024, `Range chunk length is exactly 1024 bytes (got ${range1.body.length})`);
    assert(
      range1.headers['content-range'] === `bytes 0-1023/${totalTrackBytes}`,
      `Content-Range header correct: ${range1.headers['content-range']}`
    );

    const range2 = await httpGet(`${SERVER_HTTP}/api/audio/stream/test-metronome-sync`, {
      Range: 'bytes=2048-4095',
    });
    assert(range2.statusCode === 206, `Range 2048-4095 returns HTTP 206`);
    assert(range2.body.length === 2048, `Range chunk length is 2048 bytes`);
    assert(
      range2.headers['content-range'] === `bytes 2048-4095/${totalTrackBytes}`,
      `Content-Range header correct: ${range2.headers['content-range']}`
    );

    // TEST 3: Invalid Range Bounds (HTTP 416 Range Not Satisfiable)
    console.log('\n--- TEST 3: Invalid Range Bounds Handling (HTTP 416) ---');
    const invalidRange = await httpGet(`${SERVER_HTTP}/api/audio/stream/test-metronome-sync`, {
      Range: 'bytes=99999999-',
    });
    assert(invalidRange.statusCode === 416, `Out of bounds range returns HTTP 416 (got ${invalidRange.statusCode})`);
    assert(
      invalidRange.headers['content-range'] === `bytes */${totalTrackBytes}`,
      `416 Content-Range header: ${invalidRange.headers['content-range']}`
    );

    // TEST 4: Conditional Caching (ETag & HTTP 304 Not Modified)
    console.log('\n--- TEST 4: Conditional Caching (ETag -> HTTP 304 Not Modified) ---');
    const cacheRes = await httpGet(`${SERVER_HTTP}/api/audio/stream/test-metronome-sync`, {
      'If-None-Match': '"test-metronome-sync-v1"',
    });
    assert(cacheRes.statusCode === 304, `If-None-Match returns HTTP 304 Not Modified (got ${cacheRes.statusCode})`);
    assert(cacheRes.body.length === 0, `304 response transfers 0 body bytes (saves network bandwidth)`);

    // TEST 5: Upload Local Audio File & Range Stream from Disk
    console.log('\n--- TEST 5: File Upload & Disk Stream Range Requests ---');
    const dummyWav = createDummyWav(3, 44100);
    const uploadRes = await httpPostMultipart(`${SERVER_HTTP}/api/audio/upload`, 'engine_test_tune.wav', dummyWav);
    assert(uploadRes.statusCode === 201, `Uploaded test audio file (HTTP 201)`);
    const uploadedTrack = JSON.parse(uploadRes.text);
    assert(uploadedTrack && uploadedTrack.id, `Track metadata returned with id: ${uploadedTrack?.id}`);

    // Fetch uploaded stream full
    const uploadedStreamRes = await httpGet(`${SERVER_HTTP}/api/audio/stream/${uploadedTrack.id}`);
    assert(uploadedStreamRes.statusCode === 200, `Uploaded file streams via HTTP 200`);
    assert(uploadedStreamRes.headers['content-type'] === 'audio/wav', `Content-Type is audio/wav`);
    assert(!!uploadedStreamRes.headers['etag'], `ETag header generated for disk file: ${uploadedStreamRes.headers['etag']}`);

    // Fetch uploaded stream range
    const uploadedRangeRes = await httpGet(`${SERVER_HTTP}/api/audio/stream/${uploadedTrack.id}`, {
      Range: 'bytes=0-511',
    });
    assert(uploadedRangeRes.statusCode === 206, `Uploaded disk file range request returns 206`);
    assert(uploadedRangeRes.body.length === 512, `Chunk size is 512 bytes`);

    // Test 304 on uploaded disk file
    const diskEtag = uploadedStreamRes.headers['etag'];
    const uploadedCacheRes = await httpGet(`${SERVER_HTTP}/api/audio/stream/${uploadedTrack.id}`, {
      'If-None-Match': diskEtag,
    });
    assert(uploadedCacheRes.statusCode === 304, `Uploaded disk file returns HTTP 304 with matching ETag`);

    // TEST 6: High-Concurrency (10 Simultaneous Receiver Stream Requests)
    console.log('\n--- TEST 6: High Concurrency (10 Simultaneous Receiver Stream Requests) ---');
    const concurrentCount = 10;
    const startConcurrent = Date.now();
    const concurrentPromises = [];

    for (let i = 0; i < concurrentCount; i++) {
      const startByte = i * 4096;
      const endByte = startByte + 4095;
      concurrentPromises.push(
        httpGet(`${SERVER_HTTP}/api/audio/stream/test-metronome-sync`, {
          Range: `bytes=${startByte}-${endByte}`,
        })
      );
    }

    const concurrentResults = await Promise.all(concurrentPromises);
    const concurrentDuration = Date.now() - startConcurrent;

    const all206 = concurrentResults.every((r) => r.statusCode === 206 && r.body.length === 4096);
    assert(all206, `All 10 simultaneous receiver chunk requests succeeded with 206 in ${concurrentDuration}ms`);

    // TEST 7: Client Abort & Stream Disconnect Clean Handling
    console.log('\n--- TEST 7: Stream Disconnect & Abort Clean Handling ---');
    await new Promise((resolve) => {
      const parsed = new URL(`${SERVER_HTTP}/api/audio/stream/test-metronome-sync`);
      const req = http.request(
        {
          hostname: parsed.hostname,
          port: parsed.port,
          path: parsed.pathname,
          method: 'GET',
        },
        (res) => {
          res.on('data', () => {
            // Abort stream midway through first chunk
            req.destroy();
            resolve();
          });
        }
      );
      req.end();
    });
    await wait(200);
    // Server should remain completely healthy and responsive
    const healthCheck = await httpGet(`${SERVER_HTTP}/api/server/status`);
    assert(healthCheck.statusCode === 200, `Server remains completely healthy after client abrupt stream abort`);

    // TEST 8: WebSocket Synchronized Playback with Configurable Delay Window
    console.log('\n--- TEST 8: WebSocket Synchronized Playback with Configurable Delay ---');
    const senderWs = await connectWs(SERVER_WS);
    const receiverWs = await connectWs(SERVER_WS);

    // Register devices
    senderWs.send(
      JSON.stringify({
        type: 'DEVICE_REGISTER',
        payload: {
          name: 'Host Sender Studio',
          role: 'sender',
          platform: 'macos',
          outputType: 'speaker',
          userAgent: 'Sender/1.0',
          roomId: 'CAST-842',
        },
        timestamp: Date.now(),
      })
    );

    receiverWs.send(
      JSON.stringify({
        type: 'DEVICE_REGISTER',
        payload: {
          name: 'Receiver Phone 1',
          role: 'receiver',
          platform: 'android',
          outputType: 'bluetooth',
          userAgent: 'Receiver/1.0',
          roomId: 'CAST-842',
        },
        timestamp: Date.now(),
      })
    );

    await wait(400);

    // Test Play command with 350ms buffer delay preset
    let receivedPlayCommand = null;
    receiverWs.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'BROADCAST_PLAY') {
          receivedPlayCommand = msg.payload;
        }
      } catch {}
    });

    const playSendTime = Date.now();
    senderWs.send(
      JSON.stringify({
        type: 'BROADCAST_PLAY',
        payload: {
          trackId: 'test-metronome-sync',
          scheduledServerTime: 0,
          startPositionSec: 0,
          generation: 0,
          delayMs: 350, // Low Latency Preset
        },
        timestamp: playSendTime,
      })
    );

    await wait(300);

    assert(receivedPlayCommand !== null, `Receiver received BROADCAST_PLAY command`);
    assert(receivedPlayCommand?.delayMs === 350, `Scheduled lead time delayMs is 350ms (got ${receivedPlayCommand?.delayMs})`);
    assert(
      receivedPlayCommand?.scheduledServerTime >= playSendTime + 300,
      `scheduledServerTime was scheduled ~350ms in future (${receivedPlayCommand?.scheduledServerTime} >= ${playSendTime + 300})`
    );

    // Test Seek command with 1000ms buffer delay preset
    let receivedSeekCommand = null;
    receiverWs.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'BROADCAST_SEEK') {
          receivedSeekCommand = msg.payload;
        }
      } catch {}
    });

    senderWs.send(
      JSON.stringify({
        type: 'BROADCAST_SEEK',
        payload: {
          trackId: 'test-metronome-sync',
          scheduledServerTime: 0,
          targetPositionSec: 5.5,
          generation: 0,
          delayMs: 1000, // High Stability Preset
        },
        timestamp: Date.now(),
      })
    );

    await wait(500);

    assert(receivedSeekCommand !== null, `Receiver received BROADCAST_SEEK command`);
    assert(receivedSeekCommand?.targetPositionSec === 5.5, `Seek targetPositionSec is 5.5s`);
    assert(receivedSeekCommand?.delayMs === 1000, `Seek schedule delayMs is 1000ms (got ${receivedSeekCommand?.delayMs})`);

    senderWs.close();
    receiverWs.close();

    // Clean up uploaded test file
    await httpGet(`${SERVER_HTTP}/api/audio/tracks/${uploadedTrack.id}`, { method: 'DELETE' }).catch(() => {});
  } finally {
    console.log('\n[TEST CLEANUP] Shutting down test server...');
    serverProc.kill('SIGINT');
  }

  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${testsPassed + testsFailed} | PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
  console.log('================================================================');

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ALL AUDIO STREAMING ENGINE TESTS PASSED WITH 100% SUCCESS!\n');
    process.exit(0);
  }
}

runStreamingEngineTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
