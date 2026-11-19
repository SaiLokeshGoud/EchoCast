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

function connectWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

async function runDeviceManagementTests() {
  console.log('================================================================');
  console.log('      ECHOCAST: ADVANCED MULTI-DEVICE MANAGEMENT TEST           ');
  console.log('================================================================');

  const PORT = '4040';
  const SERVER_HTTP = `http://127.0.0.1:${PORT}`;
  const SERVER_WS = `ws://127.0.0.1:${PORT}/ws`;
  const ROOM_ID = 'DEVICE-LAB-ROOM';

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

  try {
    // -------------------------------------------------------------------------
    // PHASE 1: Sender Registration & Session Setup
    // -------------------------------------------------------------------------
    console.log('\n--- PHASE 1: Sender Registration & Room Setup ---');
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
    assert(senderReg && senderReg.payload.role === 'sender', 'Sender host registered successfully in room DEVICE-LAB-ROOM');

    // -------------------------------------------------------------------------
    // PHASE 2: Register 8 Heterogeneous Receiver Devices (5–10 receiver objective)
    // -------------------------------------------------------------------------
    console.log('\n--- PHASE 2: Registering 8 Heterogeneous Receivers (Android, iOS, Windows, Mac, Linux) ---');

    const receiverConfigs = [
      { name: 'Android Phone (Pixel 8 Pro)', platform: 'android', outputType: 'speaker' },
      { name: 'iPhone 15 Pro', platform: 'ios', outputType: 'bluetooth' },
      { name: 'Windows Laptop (Dell XPS)', platform: 'windows', outputType: 'speaker' },
      { name: 'MacBook Pro 16', platform: 'macos', outputType: 'headphones' },
      { name: 'Samsung Galaxy Tab S9', platform: 'android', outputType: 'bluetooth' },
      { name: 'iPad Air M2', platform: 'ios', outputType: 'speaker' },
      { name: 'Linux Audio Workstation', platform: 'linux', outputType: 'speaker' },
      { name: 'Office Desktop PC', platform: 'windows', outputType: 'bluetooth' },
    ];

    const receiverClients = [];

    for (let i = 0; i < receiverConfigs.length; i++) {
      const cfg = receiverConfigs[i];
      const ws = await connectWs(SERVER_WS);
      const msgs = [];
      ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
      receiverSockets.push(ws);

      const deviceId = `rx-device-uuid-${i + 1}`;
      ws.send(
        JSON.stringify({
          type: 'DEVICE_REGISTER',
          payload: {
            deviceId,
            name: cfg.name,
            role: 'receiver',
            platform: cfg.platform,
            outputType: cfg.outputType,
            roomId: ROOM_ID,
          },
          timestamp: Date.now(),
        })
      );

      receiverClients.push({
        id: deviceId,
        ws,
        messages: msgs,
        config: cfg,
      });
    }

    await wait(400);

    // Verify all 8 receivers registered
    const allRegistered = receiverClients.every((c) =>
      c.messages.some((m) => m.type === 'DEVICE_REGISTERED' && m.payload.role === 'receiver')
    );
    assert(allRegistered, 'All 8 receiver devices connected and received registration confirmations');

    // Verify Sender's DEVICE_LIST contains 8 receivers + 1 sender
    const latestDeviceList = senderMessages.filter((m) => m.type === 'DEVICE_LIST').pop();
    const activeReceivers = latestDeviceList?.payload?.filter((d) => d.role === 'receiver') || [];
    assert(
      activeReceivers.length === 8,
      `Sender device roster tracks exactly 8 concurrent receiver endpoints (got: ${activeReceivers.length})`
    );

    // Verify multi-platform coverage
    const platformsPresent = new Set(activeReceivers.map((r) => r.platform));
    assert(
      platformsPresent.has('android') &&
        platformsPresent.has('ios') &&
        platformsPresent.has('windows') &&
        platformsPresent.has('macos') &&
        platformsPresent.has('linux'),
      'Roster reflects all requested client platforms (Android, iOS, Windows, Mac, Linux)'
    );

    // Verify Bluetooth outputs are tracked
    const btReceivers = activeReceivers.filter((r) => r.outputType === 'bluetooth');
    assert(
      btReceivers.length === 3,
      `Bluetooth audio endpoints properly tagged in roster (${btReceivers.length} Bluetooth speakers)`
    );

    // -------------------------------------------------------------------------
    // PHASE 3: Group Controls (Play All, Pause All, Seek All, Stop All)
    // -------------------------------------------------------------------------
    console.log('\n--- PHASE 3: Room Group Playback Controls (Play, Pause, Seek, Stop) ---');

    receiverClients.forEach((c) => (c.messages.length = 0));

    // 3.1: Group Play All
    const playTimestamp = Date.now();
    senderWs.send(
      JSON.stringify({
        type: 'BROADCAST_PLAY',
        payload: {
          startPositionSec: 0,
          delayMs: 400,
        },
        timestamp: playTimestamp,
      })
    );
    await wait(300);

    const allReceivedPlay = receiverClients.every((c) =>
      c.messages.some((m) => m.type === 'BROADCAST_STATE' && m.payload.isPlaying === true)
    );
    assert(allReceivedPlay, 'Group "Play All" command broadcasted and received by all 8 receivers');

    // 3.2: Group Pause All
    receiverClients.forEach((c) => (c.messages.length = 0));
    senderWs.send(
      JSON.stringify({
        type: 'BROADCAST_PAUSE',
        payload: {},
        timestamp: Date.now(),
      })
    );
    await wait(300);

    const allReceivedPause = receiverClients.every((c) =>
      c.messages.some((m) => m.type === 'BROADCAST_STATE' && m.payload.isPlaying === false)
    );
    assert(allReceivedPause, 'Group "Pause All" command broadcasted and received by all 8 receivers');

    // 3.3: Group Seek All
    receiverClients.forEach((c) => (c.messages.length = 0));
    senderWs.send(
      JSON.stringify({
        type: 'BROADCAST_SEEK',
        payload: {
          targetPositionSec: 24.5,
          delayMs: 350,
        },
        timestamp: Date.now(),
      })
    );
    await wait(300);

    const allReceivedSeek = receiverClients.every((c) =>
      c.messages.some((m) => m.type === 'BROADCAST_SEEK' && m.payload.targetPositionSec === 24.5)
    );
    assert(allReceivedSeek, 'Group "Seek All" command (24.5s) broadcasted and received by all 8 receivers');

    // 3.4: Group Stop All
    receiverClients.forEach((c) => (c.messages.length = 0));
    senderWs.send(
      JSON.stringify({
        type: 'BROADCAST_STOP',
        payload: { generation: 0 },
        timestamp: Date.now(),
      })
    );
    await wait(300);

    const allReceivedStop = receiverClients.every((c) =>
      c.messages.some((m) => m.type === 'BROADCAST_STOP')
    );
    assert(allReceivedStop, 'Group "Stop All" command broadcasted and received by all 8 receivers');

    // -------------------------------------------------------------------------
    // PHASE 4: Group Audio Output Controls (Master Volume & Mute All)
    // -------------------------------------------------------------------------
    console.log('\n--- PHASE 4: Group Audio Output Controls (Master Volume & Mute All) ---');

    receiverClients.forEach((c) => (c.messages.length = 0));

    // 4.1: Group Volume All (set to 65%)
    senderWs.send(
      JSON.stringify({
        type: 'GROUP_VOLUME_ALL',
        payload: { volume: 0.65 },
        timestamp: Date.now(),
      })
    );
    await wait(300);

    const allReceivedGroupVolume = receiverClients.every((c) =>
      c.messages.some((m) => m.type === 'REMOTE_SET_RECEIVER_VOLUME' && m.payload.volume === 0.65)
    );
    assert(allReceivedGroupVolume, 'Group volume adjustment (65%) delivered to all 8 receivers');

    // 4.2: Group Mute All
    receiverClients.forEach((c) => (c.messages.length = 0));
    senderWs.send(
      JSON.stringify({
        type: 'GROUP_MUTE_ALL',
        payload: { isMuted: true },
        timestamp: Date.now(),
      })
    );
    await wait(300);

    const allReceivedGroupMute = receiverClients.every((c) =>
      c.messages.some((m) => m.type === 'REMOTE_MUTE_RECEIVER' && m.payload.isMuted === true)
    );
    assert(allReceivedGroupMute, 'Group "Mute All" command delivered to all 8 receivers');

    // 4.3: Group Unmute All
    receiverClients.forEach((c) => (c.messages.length = 0));
    senderWs.send(
      JSON.stringify({
        type: 'GROUP_MUTE_ALL',
        payload: { isMuted: false },
        timestamp: Date.now(),
      })
    );
    await wait(300);

    const allReceivedGroupUnmute = receiverClients.every((c) =>
      c.messages.some((m) => m.type === 'REMOTE_MUTE_RECEIVER' && m.payload.isMuted === false)
    );
    assert(allReceivedGroupUnmute, 'Group "Unmute All" command delivered to all 8 receivers');

    // -------------------------------------------------------------------------
    // PHASE 5: Individual Receiver Controls (Volume, Mute, Output Isolation)
    // -------------------------------------------------------------------------
    console.log('\n--- PHASE 5: Individual Receiver Control Isolation ---');

    const targetReceiver = receiverClients[1]; // iPhone 15 Pro
    const nonTargetReceiver = receiverClients[3]; // MacBook Pro

    targetReceiver.messages.length = 0;
    nonTargetReceiver.messages.length = 0;

    // Adjust volume ONLY on target receiver
    senderWs.send(
      JSON.stringify({
        type: 'REMOTE_SET_RECEIVER_VOLUME',
        payload: {
          targetDeviceId: targetReceiver.id,
          volume: 0.42,
        },
        timestamp: Date.now(),
      })
    );
    await wait(300);

    const targetGotVol = targetReceiver.messages.some(
      (m) => m.type === 'REMOTE_SET_RECEIVER_VOLUME' && m.payload.volume === 0.42
    );
    const nonTargetGotVol = nonTargetReceiver.messages.some(
      (m) => m.type === 'REMOTE_SET_RECEIVER_VOLUME'
    );

    assert(targetGotVol && !nonTargetGotVol, 'Individual volume (42%) isolated strictly to target receiver');

    // Mute ONLY target receiver
    targetReceiver.messages.length = 0;
    nonTargetReceiver.messages.length = 0;

    senderWs.send(
      JSON.stringify({
        type: 'REMOTE_MUTE_RECEIVER',
        payload: {
          targetDeviceId: targetReceiver.id,
          isMuted: true,
        },
        timestamp: Date.now(),
      })
    );
    await wait(300);

    const targetGotMute = targetReceiver.messages.some(
      (m) => m.type === 'REMOTE_MUTE_RECEIVER' && m.payload.isMuted === true
    );
    const nonTargetGotMute = nonTargetReceiver.messages.some(
      (m) => m.type === 'REMOTE_MUTE_RECEIVER'
    );

    assert(targetGotMute && !nonTargetGotMute, 'Individual mute toggle isolated strictly to target receiver');

    // -------------------------------------------------------------------------
    // PHASE 6: Update Receiver Information (Rename & Audio Output Profile)
    // -------------------------------------------------------------------------
    console.log('\n--- PHASE 6: Updating Receiver Information & Output Profiles ---');

    senderMessages.length = 0;
    const renameTarget = receiverClients[0]; // Android Phone
    renameTarget.messages.length = 0;

    senderWs.send(
      JSON.stringify({
        type: 'REMOTE_UPDATE_RECEIVER',
        payload: {
          targetDeviceId: renameTarget.id,
          name: 'Living Room Soundbar (Renamed)',
          outputType: 'bluetooth',
        },
        timestamp: Date.now(),
      })
    );
    await wait(300);

    const renameNotice = renameTarget.messages.find((m) => m.type === 'REMOTE_UPDATE_RECEIVER');
    assert(
      renameNotice && renameNotice.payload.name === 'Living Room Soundbar (Renamed)',
      'Receiver received remote name update notification'
    );

    const updatedRoster = senderMessages.filter((m) => m.type === 'DEVICE_LIST').pop();
    const updatedDevice = updatedRoster?.payload?.find((d) => d.id === renameTarget.id);
    assert(
      updatedDevice &&
        updatedDevice.name === 'Living Room Soundbar (Renamed)' &&
        updatedDevice.outputType === 'bluetooth',
      `Device roster correctly reflects updated name and Bluetooth output mode`
    );

    // -------------------------------------------------------------------------
    // PHASE 7: Handling Duplicate Sessions & Automatic Reconnection
    // -------------------------------------------------------------------------
    console.log('\n--- PHASE 7: Handling Duplicate Sessions & Client Reconnection ---');

    senderMessages.length = 0;
    const reconnectClient = receiverClients[2]; // Windows Laptop
    const previousDeviceId = reconnectClient.id;

    // Simulate socket disconnect (e.g. Wi-Fi blip or page reload)
    reconnectClient.ws.close();
    await wait(300);

    // Reconnect with same stored deviceId from client storage
    const newWs = await connectWs(SERVER_WS);
    const newMsgs = [];
    newWs.on('message', (d) => newMsgs.push(JSON.parse(d.toString())));
    receiverSockets.push(newWs);

    newWs.send(
      JSON.stringify({
        type: 'DEVICE_REGISTER',
        payload: {
          deviceId: previousDeviceId, // Re-submitting existing client ID
          name: reconnectClient.config.name,
          role: 'receiver',
          platform: reconnectClient.config.platform,
          outputType: reconnectClient.config.outputType,
          roomId: ROOM_ID,
        },
        timestamp: Date.now(),
      })
    );
    await wait(400);

    const reconnectedDeviceList = senderMessages.filter((m) => m.type === 'DEVICE_LIST').pop();
    const receiversAfterReconnect = reconnectedDeviceList?.payload?.filter((d) => d.role === 'receiver') || [];

    // Verify session was cleanly replaced and NO phantom duplicate row was created
    const occurrences = receiversAfterReconnect.filter((d) => d.id === previousDeviceId);
    assert(
      occurrences.length === 1,
      `Duplicate session prevented: exactly 1 entry exists for device ID ${previousDeviceId}`
    );
    assert(
      receiversAfterReconnect.length === 8,
      `Total receiver count remains stable at exactly 8 after reconnection (no duplicates created)`
    );

    // -------------------------------------------------------------------------
    // PHASE 8: Remove Receiver From Room (Host Disconnect Operation)
    // -------------------------------------------------------------------------
    console.log('\n--- PHASE 8: Remove Receiver From Room (Host Disconnect) ---');

    senderMessages.length = 0;
    const kickTarget = receiverClients[7]; // Office Desktop PC
    kickTarget.messages.length = 0;

    senderWs.send(
      JSON.stringify({
        type: 'REMOTE_DISCONNECT_RECEIVER',
        payload: {
          targetDeviceId: kickTarget.id,
          reason: 'Host closed session for this endpoint',
        },
        timestamp: Date.now(),
      })
    );
    await wait(400);

    const kickNotice = kickTarget.messages.find((m) => m.type === 'REMOTE_DISCONNECT_RECEIVER');
    assert(
      kickNotice && kickNotice.payload.reason === 'Host closed session for this endpoint',
      'Target receiver received host disconnection notice with reason'
    );

    const finalDeviceList = senderMessages.filter((m) => m.type === 'DEVICE_LIST').pop();
    const finalReceivers = finalDeviceList?.payload?.filter((d) => d.role === 'receiver') || [];
    assert(
      finalReceivers.length === 7 && !finalReceivers.some((d) => d.id === kickTarget.id),
      'Receiver cleanly purged from the active room roster (7 receivers remain)'
    );

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log(` ADVANCED DEVICE MANAGEMENT TESTS: ${passedTests}/${totalTests} PASSED`);
    console.log('================================================================\n');

    if (passedTests === totalTests) {
      console.log('ALL ADVANCED DEVICE MANAGEMENT TESTS PASSED WITH 100% SUCCESS! ✓✓✓');
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

runDeviceManagementTests();
