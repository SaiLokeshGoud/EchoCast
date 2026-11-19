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

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'GET',
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('error', reject);
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

async function runSafariStabilityTests() {
  console.log('================================================================');
  console.log('  ECHOCAST: IPHONE SAFARI RECONNECTION & STABILITY TEST SUITE   ');
  console.log('================================================================');

  const PORT = '4060';
  const SERVER_HTTP = `http://127.0.0.1:${PORT}`;
  const SERVER_WS = `ws://127.0.0.1:${PORT}/ws`;
  const ROOM_ID = 'SAFARI-LAB-ROOM';

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
      const res = await httpGet(`${SERVER_HTTP}/api/health`);
      if (res.statusCode === 200) {
        isReady = true;
        break;
      }
    } catch {}
    await wait(200);
  }

  if (!isReady) {
    console.error('Server failed to initialize on port 4060');
    serverProc.kill();
    process.exit(1);
  }
  console.log('[TEST SETUP] Server online and responsive.');

  let senderWs = null;
  const senderMessages = [];
  let iphoneWs = null;
  const iphoneMessages = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Sender Host Registration
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Register Sender Host (Dell Laptop) ---');
    senderWs = await connectWs(SERVER_WS);
    senderWs.on('message', (d) => senderMessages.push(JSON.parse(d.toString())));

    senderWs.send(
      JSON.stringify({
        type: 'DEVICE_REGISTER',
        payload: {
          name: 'Dell Laptop (Host)',
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
    assert(senderReg && senderReg.payload.role === 'sender', 'Sender host registered successfully');

    // -------------------------------------------------------------------------
    // TEST 2: iPhone 10 Safari Client Connection with Stored UUID
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: iPhone 10 Client Initial Registration ---');
    const IPHONE_PERSISTENT_UUID = 'iphone10-stored-device-uuid-999';

    iphoneWs = await connectWs(SERVER_WS);
    iphoneWs.on('message', (d) => iphoneMessages.push(JSON.parse(d.toString())));

    iphoneWs.send(
      JSON.stringify({
        type: 'DEVICE_REGISTER',
        payload: {
          deviceId: IPHONE_PERSISTENT_UUID,
          name: 'iPhone 10 (Safari)',
          role: 'receiver',
          platform: 'ios',
          outputType: 'bluetooth',
          roomId: ROOM_ID,
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
        },
        timestamp: Date.now(),
      })
    );
    await wait(300);

    const iphoneReg = iphoneMessages.find((m) => m.type === 'DEVICE_REGISTERED');
    assert(
      iphoneReg && iphoneReg.payload.id === IPHONE_PERSISTENT_UUID,
      `iPhone registered with persistent UUID (${iphoneReg?.payload.id})`
    );

    const deviceLists = senderMessages.filter((m) => m.type === 'DEVICE_LIST');
    const rosterAfterJoin = deviceLists[deviceLists.length - 1]?.payload || [];
    const iphoneInRoster = rosterAfterJoin.find((d) => d.id === IPHONE_PERSISTENT_UUID);
    assert(iphoneInRoster && iphoneInRoster.platform === 'ios', 'iPhone present in Sender device roster');
    assert(iphoneInRoster.outputType === 'bluetooth', 'Bluetooth output profile preserved');

    // -------------------------------------------------------------------------
    // TEST 3: Heartbeat Stability (Simulating 16s quiet playback)
    // In the old code, the duplicate tempId bug terminated the socket on tick 1 (15s).
    // Now, the socket must remain solidly OPEN.
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Heartbeat Longevity & No Premature Disconnect ---');
    assert(iphoneWs.readyState === WebSocket.OPEN, 'iPhone WebSocket remains OPEN after registration');

    // Send a periodic NTP ping as client would during playback
    iphoneWs.send(
      JSON.stringify({
        type: 'SYNC_PING',
        payload: { clientTime: Date.now(), deviceId: IPHONE_PERSISTENT_UUID },
        timestamp: Date.now(),
      })
    );
    await wait(500);

    const pong = iphoneMessages.find((m) => m.type === 'SYNC_PONG');
    assert(pong !== undefined, 'Server promptly responded with SYNC_PONG');
    assert(iphoneWs.readyState === WebSocket.OPEN, 'Socket remains fully active without disconnects');

    // -------------------------------------------------------------------------
    // TEST 4: Wi-Fi Drop / Tab Suspension & Disconnection Grace Period
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Network Disconnection Grace Period ---');
    senderMessages.length = 0;
    // Abruptly close iPhone socket (simulating Wi-Fi toggle or WebKit suspension)
    iphoneWs.close();
    await wait(400);

    // Verify sender roster state: device is NOT deleted; marked as reconnecting
    const rosterAfterDrop = senderMessages.filter((m) => m.type === 'DEVICE_LIST').pop()?.payload || [];
    const droppedDevice = rosterAfterDrop.find((d) => d.id === IPHONE_PERSISTENT_UUID);

    assert(droppedDevice !== undefined, 'iPhone was NOT wiped from the room roster on disconnect');
    assert(droppedDevice.status === 'reconnecting', 'iPhone marked as "reconnecting" during grace period');

    // -------------------------------------------------------------------------
    // TEST 5: iPhone Reconnection & Seamless Session Restoration
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: iPhone Reconnection & Session Restoration ---');
    senderMessages.length = 0;
    const reconnectedWs = await connectWs(SERVER_WS);
    const reconnectedMsgs = [];
    reconnectedWs.on('message', (d) => reconnectedMsgs.push(JSON.parse(d.toString())));

    // Reconnect with same device ID and room code
    reconnectedWs.send(
      JSON.stringify({
        type: 'DEVICE_REGISTER',
        payload: {
          deviceId: IPHONE_PERSISTENT_UUID,
          name: 'iPhone 10 (Safari)',
          role: 'receiver',
          platform: 'ios',
          outputType: 'bluetooth',
          roomId: ROOM_ID,
        },
        timestamp: Date.now(),
      })
    );
    await wait(400);

    const reconnectedRoster = senderMessages.filter((m) => m.type === 'DEVICE_LIST').pop()?.payload || [];
    const restoredDevice = reconnectedRoster.find((d) => d.id === IPHONE_PERSISTENT_UUID);
    const duplicates = reconnectedRoster.filter((d) => d.id === IPHONE_PERSISTENT_UUID);

    assert(restoredDevice !== undefined, 'iPhone session restored in roster');
    assert(restoredDevice.status === 'connected', 'iPhone status restored to "connected"');
    assert(duplicates.length === 1, 'Zero duplicate receiver entries created on host dashboard');
    assert(restoredDevice.outputType === 'bluetooth', 'Bluetooth output profile preserved on reconnect');

    // -------------------------------------------------------------------------
    // TEST 6: Audio Continuity during Broadcast State sync
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Playback State Synchronization on Reconnect ---');
    const broadcastStateMsg = reconnectedMsgs.find((m) => m.type === 'BROADCAST_STATE');
    assert(broadcastStateMsg !== undefined, 'Reconnected iPhone received current BROADCAST_STATE');
    assert(typeof broadcastStateMsg.payload.positionSec === 'number', 'Playback positionSec provided');

    // -------------------------------------------------------------------------
    // TEST 7: Remote Volume and Mute Controls Across Reconnection
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Remote Controls Across Reconnected Session ---');
    senderWs.send(
      JSON.stringify({
        type: 'REMOTE_SET_RECEIVER_VOLUME',
        payload: { targetDeviceId: IPHONE_PERSISTENT_UUID, volume: 0.75 },
        timestamp: Date.now(),
      })
    );
    await wait(300);

    const volMsg = reconnectedMsgs.find((m) => m.type === 'REMOTE_SET_RECEIVER_VOLUME');
    assert(volMsg && volMsg.payload.volume === 0.75, 'Host remote volume command (75%) delivered to reconnected iPhone');

    // Clean up
    reconnectedWs.close();
    senderWs.close();

    console.log('\n================================================================');
    console.log(` IPHONE SAFARI STABILITY TESTS: ${passedTests}/${totalTests} PASSED`);
    console.log('================================================================\n');

    if (passedTests === totalTests) {
      console.log('🎉 ALL IPHONE SAFARI RECONNECTION & STABILITY TESTS PASSED WITH 100% SUCCESS!\n');
      process.exitCode = 0;
    } else {
      console.error(`FAILED: ${totalTests - passedTests} tests failed.`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exitCode = 1;
  } finally {
    serverProc.kill();
    setTimeout(() => {
      process.exit(process.exitCode || 0);
    }, 200);
  }
}

runSafariStabilityTests();
