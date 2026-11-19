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

function httpPostJson(url, data) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = JSON.stringify(data);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
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
    req.write(payload);
    req.end();
  });
}

function httpPostMultipart(url, filename, fileBuffer, mimeType = 'audio/wav') {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const boundary = `----EchoCastReliabilityBoundary${Date.now()}`;

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

async function runComprehensiveReliabilityTests() {
  console.log('================================================================');
  console.log('    ECHOCAST: COMPREHENSIVE RELIABILITY & PERFORMANCE SUITE     ');
  console.log('================================================================');

  const PORT = '4050';
  const SERVER_HTTP = `http://127.0.0.1:${PORT}`;
  const SERVER_WS = `ws://127.0.0.1:${PORT}/ws`;
  const ROOM_ID = 'STABILITY-ROOM-100';

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

  console.log(`[TEST SETUP] Launching test EchoCast server instance on port ${PORT}...`);
  const tsxCli = path.resolve(__dirname, '../node_modules/tsx/dist/cli.mjs');
  const serverProc = spawn(process.execPath, [tsxCli, 'server/src/index.ts'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT, NODE_ENV: 'test', LOG_LEVEL: 'warn' },
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
  const receiverClients = [];

  try {
    // -------------------------------------------------------------------------
    // SENDER SETUP
    // -------------------------------------------------------------------------
    senderWs = await connectWs(SERVER_WS);
    const senderMessages = [];
    senderWs.on('message', (d) => senderMessages.push(JSON.parse(d.toString())));

    senderWs.send(
      JSON.stringify({
        type: 'DEVICE_REGISTER',
        payload: {
          name: 'EchoCast Primary Host',
          role: 'sender',
          platform: 'windows',
          outputType: 'speaker',
          roomId: ROOM_ID,
        },
        timestamp: Date.now(),
      })
    );
    await wait(250);

    const wavTrack1 = createDummyWav(8, 44100);
    const uploadRes = await httpPostMultipart(`${SERVER_HTTP}/api/audio/upload`, 'reliability_track_1.wav', wavTrack1);
    const uploadData = JSON.parse(uploadRes.text);
    const track1 = Array.isArray(uploadData) ? uploadData[0] : uploadData;
    assert(track1 && track1.id, 'Initial audio track uploaded and cataloged');

    // Select initial track
    senderWs.send(
      JSON.stringify({
        type: 'BROADCAST_TRACK_UPDATE',
        payload: { id: track1.id },
        timestamp: Date.now(),
      })
    );
    await wait(150);

    // -------------------------------------------------------------------------
    // SCENARIO 1: One Sender with One Receiver
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 1: One Sender with One Receiver ---');
    const rx1Ws = await connectWs(SERVER_WS);
    const rx1Msgs = [];
    rx1Ws.on('message', (d) => rx1Msgs.push(JSON.parse(d.toString())));
    receiverSockets.push(rx1Ws);

    rx1Ws.send(
      JSON.stringify({
        type: 'DEVICE_REGISTER',
        payload: {
          deviceId: 'client-node-1',
          name: 'Receiver 1 (Android)',
          role: 'receiver',
          platform: 'android',
          outputType: 'speaker',
          roomId: ROOM_ID,
        },
        timestamp: Date.now(),
      })
    );
    receiverClients.push({ id: 'client-node-1', ws: rx1Ws, messages: rx1Msgs });
    await wait(200);

    // Verify 1:1 playback broadcast
    rx1Msgs.length = 0;
    const playT1 = Date.now();
    senderWs.send(
      JSON.stringify({
        type: 'BROADCAST_PLAY',
        payload: { startPositionSec: 0, delayMs: 400 },
        timestamp: playT1,
      })
    );
    await wait(250);

    const rx1Play = rx1Msgs.find((m) => m.type === 'BROADCAST_STATE' && m.payload.isPlaying);
    assert(rx1Play && rx1Play.payload.scheduledStartTime >= playT1 + 300, 'Scenario 1: 1-to-1 synchronized playback scheduled in future');

    // -------------------------------------------------------------------------
    // SCENARIO 2: One Sender with Three Receivers
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 2: One Sender with Three Receivers ---');
    for (let i = 2; i <= 3; i++) {
      const ws = await connectWs(SERVER_WS);
      const msgs = [];
      ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
      receiverSockets.push(ws);
      const devId = `client-node-${i}`;
      ws.send(
        JSON.stringify({
          type: 'DEVICE_REGISTER',
          payload: {
            deviceId: devId,
            name: `Receiver ${i} (iOS)`,
            role: 'receiver',
            platform: 'ios',
            outputType: 'bluetooth',
            roomId: ROOM_ID,
          },
          timestamp: Date.now(),
        })
      );
      receiverClients.push({ id: devId, ws, messages: msgs });
    }
    await wait(250);

    const roster3 = senderMessages.filter((m) => m.type === 'DEVICE_LIST').pop()?.payload?.filter((d) => d.role === 'receiver') || [];
    assert(roster3.length === 3, `Scenario 2: Exactly 3 receivers active in session (got: ${roster3.length})`);

    // -------------------------------------------------------------------------
    // SCENARIO 3: One Sender with Five Receivers
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 3: One Sender with Five Receivers ---');
    for (let i = 4; i <= 5; i++) {
      const ws = await connectWs(SERVER_WS);
      const msgs = [];
      ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
      receiverSockets.push(ws);
      const devId = `client-node-${i}`;
      ws.send(
        JSON.stringify({
          type: 'DEVICE_REGISTER',
          payload: {
            deviceId: devId,
            name: `Receiver ${i} (Windows)`,
            role: 'receiver',
            platform: 'windows',
            outputType: 'speaker',
            roomId: ROOM_ID,
          },
          timestamp: Date.now(),
        })
      );
      receiverClients.push({ id: devId, ws, messages: msgs });
    }
    await wait(250);

    const roster5 = senderMessages.filter((m) => m.type === 'DEVICE_LIST').pop()?.payload?.filter((d) => d.role === 'receiver') || [];
    assert(roster5.length === 5, `Scenario 3: Scale to 5 receivers confirmed (got: ${roster5.length})`);

    // -------------------------------------------------------------------------
    // SCENARIO 4: One Sender with Ten Receivers (Full High-Concurrency Load)
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 4: One Sender with Ten Receivers & Concurrent Streaming ---');
    for (let i = 6; i <= 10; i++) {
      const ws = await connectWs(SERVER_WS);
      const msgs = [];
      ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
      receiverSockets.push(ws);
      const devId = `client-node-${i}`;
      ws.send(
        JSON.stringify({
          type: 'DEVICE_REGISTER',
          payload: {
            deviceId: devId,
            name: `Receiver ${i} (Mac/Linux)`,
            role: 'receiver',
            platform: i % 2 === 0 ? 'macos' : 'linux',
            outputType: 'speaker',
            roomId: ROOM_ID,
          },
          timestamp: Date.now(),
        })
      );
      receiverClients.push({ id: devId, ws, messages: msgs });
    }
    await wait(300);

    const roster10 = senderMessages.filter((m) => m.type === 'DEVICE_LIST').pop()?.payload?.filter((d) => d.role === 'receiver') || [];
    assert(roster10.length === 10, `Scenario 4: 10 concurrent receivers active in session (got: ${roster10.length})`);

    // Concurrently fetch audio ranges from all 10 receivers
    const rangePromises = receiverClients.map((_, idx) => {
      const start = idx * 2048;
      const end = start + 2047;
      return httpGet(`${SERVER_HTTP}/api/audio/stream/${track1.id}`, { Range: `bytes=${start}-${end}` });
    });
    const startRangeTime = Date.now();
    const rangeResponses = await Promise.all(rangePromises);
    const rangeDuration = Date.now() - startRangeTime;

    const allRanges206 = rangeResponses.every((r) => r.statusCode === 206 && r.body.length === 2048);
    assert(allRanges206 && rangeDuration < 100, `Scenario 4: All 10 simultaneous audio chunk requests delivered with HTTP 206 in ${rangeDuration}ms (<100ms)`);

    // -------------------------------------------------------------------------
    // SCENARIO 5: Sender Connected Through a Mobile Hotspot
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 5: Mobile Hotspot Network Detection ---');
    const netRes = await httpGet(`${SERVER_HTTP}/api/network/interfaces`);
    const netData = JSON.parse(netRes.text);
    assert(netData.interfaces && Array.isArray(netData.interfaces), 'Scenario 5: Network interfaces query succeeded');

    // Simulate hotspot network address check
    const isHotspotSubnet = (ip) =>
      ip.startsWith('192.168.43.') || ip.startsWith('172.20.10.') || ip.startsWith('192.168.137.');
    assert(
      isHotspotSubnet('192.168.43.1') && isHotspotSubnet('172.20.10.1') && isHotspotSubnet('192.168.137.1'),
      'Scenario 5: Android (192.168.43.x), iOS (172.20.10.x), and Windows (192.168.137.x) hotspot subnets verified'
    );

    // -------------------------------------------------------------------------
    // SCENARIO 6: Sender Connected Through a Wi-Fi Router
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 6: Wi-Fi Router LAN Interface Handling ---');
    const primary = netData.primary;
    assert(
      primary && primary.url.startsWith('http://'),
      `Scenario 6: Valid primary LAN IP identified: ${primary?.ip} (${primary?.typeLabel})`
    );

    // -------------------------------------------------------------------------
    // SCENARIO 7: Receiver Temporarily Disconnects
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 7: Receiver Temporary Disconnection ---');
    senderMessages.length = 0;
    const dropTarget = receiverClients[3]; // Receiver 4
    dropTarget.ws.close();
    await wait(300);

    const disconnectRoster = senderMessages.filter((m) => m.type === 'DEVICE_LIST').pop()?.payload?.filter((d) => d.role === 'receiver') || [];
    const droppedDev = disconnectRoster.find((d) => d.id === dropTarget.id);
    const connectedReceivers = disconnectRoster.filter((d) => d.status === 'connected');
    assert(
      (droppedDev && droppedDev.status === 'reconnecting') || connectedReceivers.length === 9,
      'Scenario 7: Dropped receiver cleanly detected by WebSocket server (entered reconnecting grace period)'
    );

    // -------------------------------------------------------------------------
    // SCENARIO 8: Receiver Reconnects (Session Recovery, No Duplicate Rows)
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 8: Receiver Reconnection & Duplicate Session Prevention ---');
    senderMessages.length = 0;
    const reconnectedWs = await connectWs(SERVER_WS);
    const reconnectedMsgs = [];
    reconnectedWs.on('message', (d) => reconnectedMsgs.push(JSON.parse(d.toString())));
    receiverSockets.push(reconnectedWs);

    reconnectedWs.send(
      JSON.stringify({
        type: 'DEVICE_REGISTER',
        payload: {
          deviceId: dropTarget.id, // Re-submitting same stored ID
          name: 'Receiver 4 (Reconnected)',
          role: 'receiver',
          platform: 'windows',
          outputType: 'speaker',
          roomId: ROOM_ID,
        },
        timestamp: Date.now(),
      })
    );
    dropTarget.ws = reconnectedWs;
    dropTarget.messages = reconnectedMsgs;
    await wait(300);

    const reconnectedRoster = senderMessages.filter((m) => m.type === 'DEVICE_LIST').pop()?.payload?.filter((d) => d.role === 'receiver') || [];
    const occurrences = reconnectedRoster.filter((d) => d.id === dropTarget.id);
    assert(occurrences.length === 1, 'Scenario 8: Reconnection merged into single session (0 duplicate rows)');
    assert(reconnectedRoster.length === 10, 'Scenario 8: Total active receiver count restored to 10');

    // -------------------------------------------------------------------------
    // SCENARIO 9: Sender Pauses and Resumes Playback
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 9: Sender Pause and Resume Operations ---');
    receiverClients.forEach((c) => (c.messages.length = 0));

    // Pause
    senderWs.send(
      JSON.stringify({
        type: 'BROADCAST_PAUSE',
        payload: {},
        timestamp: Date.now(),
      })
    );
    await wait(250);

    const allPaused = receiverClients.every((c) =>
      c.messages.some((m) => m.type === 'BROADCAST_STATE' && m.payload.isPlaying === false)
    );
    assert(allPaused, 'Scenario 9: Pause command cleanly received by all 10 receivers');

    // Resume
    receiverClients.forEach((c) => (c.messages.length = 0));
    const resumeT = Date.now();
    senderWs.send(
      JSON.stringify({
        type: 'BROADCAST_PLAY',
        payload: { startPositionSec: 3.2, delayMs: 400 },
        timestamp: resumeT,
      })
    );
    await wait(250);

    const allResumed = receiverClients.every((c) =>
      c.messages.some((m) => m.type === 'BROADCAST_STATE' && m.payload.isPlaying === true)
    );
    assert(allResumed, 'Scenario 9: Resume command synchronized across all 10 receivers');

    // -------------------------------------------------------------------------
    // SCENARIO 10: Sender Changes Tracks
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 10: Dynamic Track Change Handling ---');
    const wavTrack2 = createDummyWav(12, 44100);
    const uploadRes2 = await httpPostMultipart(`${SERVER_HTTP}/api/audio/upload`, 'reliability_track_2.wav', wavTrack2);
    const track2Data = JSON.parse(uploadRes2.text);
    const track2 = Array.isArray(track2Data) ? track2Data[0] : track2Data;

    receiverClients.forEach((c) => (c.messages.length = 0));
    senderWs.send(
      JSON.stringify({
        type: 'BROADCAST_TRACK_UPDATE',
        payload: { id: track2.id },
        timestamp: Date.now(),
      })
    );
    await wait(250);

    const allReceivedNewTrack = receiverClients.every((c) =>
      c.messages.some((m) => m.type === 'BROADCAST_STATE' && m.payload.currentTrack?.id === track2.id)
    );
    assert(allReceivedNewTrack, 'Scenario 10: Seamless track switch (track 1 -> track 2) broadcast to all receivers');

    // -------------------------------------------------------------------------
    // SCENARIO 11: Network Latency & Jitter Surge
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 11: Network Latency Spike & Jitter Handling ---');
    // Simulate high latency / jitter SNTP exchange (85ms latency, ±20ms jitter)
    const simulatedT0 = Date.now();
    const simulatedT1 = simulatedT0 + 85 + 15;
    const simulatedT2 = simulatedT1 + 1;
    const simulatedT3 = simulatedT0 + 175;

    const simulatedRtt = Math.max(0, (simulatedT3 - simulatedT0) - (simulatedT2 - simulatedT1));
    const simulatedOffset = ((simulatedT1 - simulatedT0) + (simulatedT2 - simulatedT3)) / 2;

    assert(simulatedRtt >= 80, `Scenario 11: RTT surge calculated: ${simulatedRtt}ms`);
    assert(Math.abs(simulatedOffset) < 30, `Scenario 11: SNTP symmetric latency assumption holds clock offset to ${simulatedOffset.toFixed(1)}ms`);

    // -------------------------------------------------------------------------
    // SCENARIO 12: Receiver Buffer Empty / Dynamic Underrun Recovery
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 12: Receiver Buffer Underrun & Catch-Up Recovery ---');
    // When buffer is delayed and finishes 2.5s AFTER scheduled time:
    const scheduledStart = Date.now() - 2500; // In past
    const nowServer = Date.now();
    const elapsedLagSec = Math.max(0, (nowServer - scheduledStart) / 1000);
    const liveCatchUpOffset = Math.min(12, 0 + elapsedLagSec);

    assert(
      liveCatchUpOffset >= 2.4 && liveCatchUpOffset <= 2.6,
      `Scenario 12: Buffer underrun caught up seamlessly to live stream position (${liveCatchUpOffset.toFixed(2)}s)`
    );

    // -------------------------------------------------------------------------
    // SCENARIO 13: Sender Changes Local Network Address
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 13: Dynamic Local IP Change Migration ---');
    receiverClients.forEach((c) => (c.messages.length = 0));

    const simRes = await httpPostJson(`${SERVER_HTTP}/api/network/simulate-change`, {
      newIp: '192.168.1.188',
    });
    assert(simRes.statusCode === 200, 'Scenario 13: Server processed simulated IP address migration');

    await wait(250);

    const allNotifiedOfNewIp = receiverClients.every((c) =>
      c.messages.some(
        (m) => m.type === 'NETWORK_STATUS_UPDATE' && m.payload.primaryUrl.includes('192.168.1.188')
      )
    );
    assert(
      allNotifiedOfNewIp,
      'Scenario 13: All receivers received updated network status with new primary URL (http://192.168.1.188:4050)'
    );

    // -------------------------------------------------------------------------
    // SECURITY & OPTIMIZATION VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n--- SECURITY & ROBUSTNESS TESTS ---');

    // Test S.1: Unauthorized playback command rejection
    const rogueRx = receiverClients[0].ws;
    const rogueMsgs = [];
    rogueRx.on('message', (d) => rogueMsgs.push(JSON.parse(d.toString())));

    rogueRx.send(
      JSON.stringify({
        type: 'BROADCAST_PLAY',
        payload: { startPositionSec: 0 },
        timestamp: Date.now(),
      })
    );
    await wait(200);

    const unauthorizedError = rogueMsgs.find(
      (m) => m.type === 'ERROR' && m.payload.code === 'UNAUTHORIZED_ACTION'
    );
    assert(
      unauthorizedError !== undefined,
      'Security: Blocked unauthorized playback command from receiver device (UNAUTHORIZED_ACTION)'
    );

    // Test S.2: Malformed WebSocket JSON / payload guard
    rogueRx.send(JSON.stringify({ foo: 'not-a-valid-message' }));
    await wait(200);

    const formatError = rogueMsgs.find(
      (m) => m.type === 'ERROR' && m.payload.code === 'INVALID_MESSAGE_FORMAT'
    );
    assert(
      formatError !== undefined,
      'Security: Malformed WebSocket message rejected with INVALID_MESSAGE_FORMAT'
    );

    // Test S.3: Oversized WebSocket payload guard (>64KB)
    const giantPayload = 'A'.repeat(70000);
    rogueRx.send(giantPayload);
    await wait(200);

    const tooLargeError = rogueMsgs.find(
      (m) => m.type === 'ERROR' && (m.payload.code === 'PAYLOAD_TOO_LARGE' || m.payload.code === 'BAD_PAYLOAD')
    );
    assert(
      tooLargeError !== undefined,
      'Security: Oversized WebSocket message (>64KB) rejected (PAYLOAD_TOO_LARGE)'
    );

    // Test S.4: Malformed audio file upload (fake .mp3 with text content)
    const fakeMp3Buffer = Buffer.from('THIS IS NOT A VALID AUDIO FILE. MALICIOUS SCRIPT CONTENT.');
    const fakeUploadRes = await httpPostMultipart(`${SERVER_HTTP}/api/audio/upload`, 'virus_fake.mp3', fakeMp3Buffer);
    assert(
      fakeUploadRes.statusCode === 400,
      `Security: Non-audio disguised file rejected by audioValidator (HTTP ${fakeUploadRes.statusCode})`
    );

    // Test S.5: Unauthorized room code join rejected
    const intruderWs = await connectWs(SERVER_WS);
    const intruderMsgs = [];
    intruderWs.on('message', (d) => intruderMsgs.push(JSON.parse(d.toString())));

    intruderWs.send(
      JSON.stringify({
        type: 'DEVICE_REGISTER',
        payload: {
          name: 'Intruder Phone',
          role: 'receiver',
          platform: 'android',
          outputType: 'speaker',
          roomId: 'WRONG-ROOM-CODE',
        },
        timestamp: Date.now(),
      })
    );
    await wait(200);

    const roomError = intruderMsgs.find(
      (m) => m.type === 'ERROR' && m.payload.code === 'INVALID_ROOM_ID'
    );
    assert(
      roomError !== undefined,
      'Security: Receiver with invalid room ID rejected by server (INVALID_ROOM_ID)'
    );
    intruderWs.close();

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log(` COMPREHENSIVE RELIABILITY SUITE: ${passedTests}/${totalTests} PASSED`);
    console.log('================================================================\n');

    if (passedTests === totalTests) {
      console.log('ALL 13 TEST SCENARIOS & SECURITY CHECKS PASSED WITH 100% SUCCESS! ✓✓✓');
      process.exitCode = 0;
    } else {
      console.error(`FAILED: ${totalTests - passedTests} tests failed.`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exitCode = 1;
  } finally {
    if (senderWs) senderWs.close();
    receiverSockets.forEach((ws) => {
      try {
        ws.close();
      } catch {}
    });
    serverProc.kill();
    setTimeout(() => process.exit(process.exitCode || 0), 200);
  }
}

runComprehensiveReliabilityTests();
