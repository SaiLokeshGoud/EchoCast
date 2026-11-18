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

function connectWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

async function runMultiDeviceTest() {
  console.log('================================================================');
  console.log('   ECHOCAST: MULTI-DEVICE SENDER & RECEIVER INTEGRATION TEST    ');
  console.log('================================================================');

  const PORT = '4010';
  const SERVER_HTTP = `http://127.0.0.1:${PORT}`;
  const SERVER_WS = `ws://127.0.0.1:${PORT}/ws`;

  // Start real EchoCast server process
  const serverProcess = spawn('npx', ['tsx', 'server/src/index.ts'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT },
    stdio: 'pipe',
    shell: true,
  });

  serverProcess.stdout.on('data', (d) => {
    const str = d.toString().trim();
    if (str.includes('[INFO ]') || str.includes('Started')) {
      console.log(`[Server] ${str}`);
    }
  });
  serverProcess.stderr.on('data', (d) => console.error(`[Server Err] ${d}`));

  let serverStarted = false;
  for (let i = 0; i < 25; i++) {
    await wait(400);
    try {
      const res = await httpGet(`${SERVER_HTTP}/api/server/status`);
      if (res.statusCode === 200) {
        serverStarted = true;
        console.log('✓ EchoCast server is running on port ' + PORT);
        break;
      }
    } catch {}
  }

  if (!serverStarted) {
    serverProcess.kill();
    throw new Error('Server failed to initialize on port ' + PORT);
  }

  try {
    // ------------------------------------------------------------------------
    // Step 1: Pre-flight Room Verification REST API
    // ------------------------------------------------------------------------
    console.log('\n--- Step 1: Testing Pre-flight Room Verification API ---');
    const validVerify = await httpGet(`${SERVER_HTTP}/api/room/verify?roomId=CAST-842`);
    console.log(`✓ Verify CAST-842 status: ${validVerify.statusCode}`);
    const validData = JSON.parse(validVerify.text);
    if (!validData.valid || validData.roomId !== 'CAST-842') {
      throw new Error('Expected room CAST-842 to be valid');
    }

    const invalidVerify = await httpGet(`${SERVER_HTTP}/api/room/verify?roomId=INVALID-ROOM-999`);
    console.log(`✓ Verify INVALID-ROOM-999 status: ${invalidVerify.statusCode} (Expected 404)`);
    if (invalidVerify.statusCode !== 404) {
      throw new Error('Expected 404 for invalid room');
    }

    // ------------------------------------------------------------------------
    // Step 2: Connect Device 1 as SENDER
    // ------------------------------------------------------------------------
    console.log('\n--- Step 2: Registering Device 1 (Sender Laptop) ---');
    const senderWs = await connectWs(SERVER_WS);
    let senderRegistered = false;

    senderWs.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'DEVICE_REGISTERED') {
        senderRegistered = true;
        console.log(`✓ Sender registered with ID: ${msg.payload.id} (${msg.payload.name})`);
      }
    });

    senderWs.send(JSON.stringify({
      type: 'DEVICE_REGISTER',
      payload: {
        name: 'MacBook Pro Host',
        role: 'sender',
        platform: 'macos',
        outputType: 'speaker',
        roomId: 'CAST-842',
      },
      timestamp: Date.now(),
    }));

    await wait(500);
    if (!senderRegistered) throw new Error('Sender registration failed');

    // ------------------------------------------------------------------------
    // Step 3: Prevent Unauthorized / Invalid Room Connection on Receiver
    // ------------------------------------------------------------------------
    console.log('\n--- Step 3: Testing Unauthorized / Invalid Room Rejection ---');
    const rogueReceiverWs = await connectWs(SERVER_WS);
    let receivedInvalidRoomError = false;

    rogueReceiverWs.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'ERROR' && msg.payload.code === 'INVALID_ROOM_ID') {
        receivedInvalidRoomError = true;
        console.log(`✓ Server correctly rejected rogue receiver with code: ${msg.payload.code} ("${msg.payload.message}")`);
      }
    });

    rogueReceiverWs.send(JSON.stringify({
      type: 'DEVICE_REGISTER',
      payload: {
        name: 'Intruder Phone',
        role: 'receiver',
        platform: 'android',
        outputType: 'speaker',
        roomId: 'NON-EXISTENT-ROOM',
      },
      timestamp: Date.now(),
    }));

    await wait(500);
    rogueReceiverWs.close();
    if (!receivedInvalidRoomError) throw new Error('Server failed to reject invalid room ID');

    // ------------------------------------------------------------------------
    // Step 4: Connect Device 2 as RECEIVER (Android Phone)
    // ------------------------------------------------------------------------
    console.log('\n--- Step 4: Registering Device 2 (Android Receiver Phone) ---');
    const receiverWs = await connectWs(SERVER_WS);
    let receiverId = '';
    let receiverReceivedState = false;
    let receiverTrackTitle = '';

    receiverWs.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'DEVICE_REGISTERED') {
        receiverId = msg.payload.id;
        console.log(`✓ Receiver registered with ID: ${receiverId} (${msg.payload.name})`);
      }
      if (msg.type === 'BROADCAST_STATE') {
        receiverReceivedState = true;
        receiverTrackTitle = msg.payload.currentTrack?.title || '';
        console.log(`✓ Receiver received Broadcast State: room=${msg.payload.roomId}, track="${receiverTrackTitle}"`);
      }
    });

    receiverWs.send(JSON.stringify({
      type: 'DEVICE_REGISTER',
      payload: {
        name: 'Pixel 8 Pro (Receiver)',
        role: 'receiver',
        platform: 'android',
        outputType: 'bluetooth',
        roomId: 'CAST-842',
      },
      timestamp: Date.now(),
    }));

    await wait(600);
    if (!receiverId) throw new Error('Receiver registration failed');
    if (!receiverReceivedState) throw new Error('Receiver did not receive initial broadcast state');

    // ------------------------------------------------------------------------
    // Step 5: Test NTP Precision Time Sync on Receiver
    // ------------------------------------------------------------------------
    console.log('\n--- Step 5: Testing NTP Time Synchronization on Receiver ---');
    let syncPongReceived = false;
    let calculatedOffset = 0;

    const syncHandler = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'SYNC_PONG') {
        syncPongReceived = true;
        const now = Date.now();
        const rtt = now - msg.payload.clientTime;
        calculatedOffset = ((msg.payload.serverReceiveTime - msg.payload.clientTime) + (msg.payload.serverSendTime - now)) / 2;
        console.log(`✓ Receiver NTP Sync Pong received: RTT=${rtt}ms, ClockOffset=${calculatedOffset.toFixed(2)}ms`);
      }
    };
    receiverWs.on('message', syncHandler);

    receiverWs.send(JSON.stringify({
      type: 'SYNC_PING',
      payload: { clientTime: Date.now(), deviceId: receiverId },
      timestamp: Date.now(),
    }));

    await wait(400);
    if (!syncPongReceived) throw new Error('Receiver time sync failed');

    // ------------------------------------------------------------------------
    // Step 6: Test Actual Audio Receiving (HTTP Range Streaming)
    // ------------------------------------------------------------------------
    console.log('\n--- Step 6: Testing Actual Audio Receiving & Range Streaming ---');
    const audioStreamRes = await httpGet(`${SERVER_HTTP}/api/audio/stream/test-metronome-sync`, {
      Range: 'bytes=0-4095',
    });
    console.log(`✓ Audio Stream Response: HTTP ${audioStreamRes.statusCode}, Content-Type: ${audioStreamRes.headers['content-type']}, Range: ${audioStreamRes.headers['content-range']}, Chunk Size: ${audioStreamRes.body.length} bytes`);
    if (audioStreamRes.statusCode !== 206 || audioStreamRes.body.length !== 4096) {
      throw new Error('Failed to stream audio chunk');
    }

    // ------------------------------------------------------------------------
    // Step 7: Test Synchronized Playback Control (Sender Play, Seek, Pause)
    // ------------------------------------------------------------------------
    console.log('\n--- Step 7: Testing Synchronized Playback Commands ---');
    let playCommandReceived = false;
    let seekCommandReceived = false;
    let pauseCommandReceived = false;

    receiverWs.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'BROADCAST_PLAY') {
        playCommandReceived = true;
        console.log(`✓ Receiver received BROADCAST_PLAY: trackId=${msg.payload.trackId}, scheduledServerTime=${msg.payload.scheduledServerTime}, startPos=${msg.payload.startPositionSec}s`);
      }
      if (msg.type === 'BROADCAST_SEEK') {
        seekCommandReceived = true;
        console.log(`✓ Receiver received BROADCAST_SEEK: targetPositionSec=${msg.payload.targetPositionSec}s, scheduledServerTime=${msg.payload.scheduledServerTime}`);
      }
      if (msg.type === 'BROADCAST_PAUSE') {
        pauseCommandReceived = true;
        console.log(`✓ Receiver received BROADCAST_PAUSE: pausePos=${msg.payload.pausePositionSec}s`);
      }
    });

    // Sender commands Play
    senderWs.send(JSON.stringify({
      type: 'BROADCAST_PLAY',
      payload: {
        trackId: 'test-metronome-sync',
        scheduledServerTime: 0,
        startPositionSec: 0,
        generation: 1,
      },
      timestamp: Date.now(),
    }));
    await wait(400);

    // Sender commands Seek
    senderWs.send(JSON.stringify({
      type: 'BROADCAST_SEEK',
      payload: {
        trackId: 'test-metronome-sync',
        scheduledServerTime: 0,
        targetPositionSec: 4.5,
        generation: 2,
      },
      timestamp: Date.now(),
    }));
    await wait(400);

    // Sender commands Pause
    senderWs.send(JSON.stringify({
      type: 'BROADCAST_PAUSE',
      payload: {
        scheduledServerTime: 0,
        pausePositionSec: 4.5,
        generation: 3,
      },
      timestamp: Date.now(),
    }));
    await wait(400);

    if (!playCommandReceived) throw new Error('Receiver missed BROADCAST_PLAY');
    if (!seekCommandReceived) throw new Error('Receiver missed BROADCAST_SEEK');
    if (!pauseCommandReceived) throw new Error('Receiver missed BROADCAST_PAUSE');

    // ------------------------------------------------------------------------
    // Step 8: Test Remote Volume & Mute Controls on Receiver
    // ------------------------------------------------------------------------
    console.log('\n--- Step 8: Testing Remote Receiver Volume & Mute Controls ---');
    let remoteVolReceived = false;
    let remoteMuteReceived = false;

    receiverWs.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'REMOTE_SET_RECEIVER_VOLUME') {
        remoteVolReceived = true;
        console.log(`✓ Receiver received REMOTE_SET_RECEIVER_VOLUME: volume=${msg.payload.volume}`);
      }
      if (msg.type === 'REMOTE_MUTE_RECEIVER') {
        remoteMuteReceived = true;
        console.log(`✓ Receiver received REMOTE_MUTE_RECEIVER: isMuted=${msg.payload.isMuted}`);
      }
    });

    // Sender remotely sets receiver volume to 75%
    senderWs.send(JSON.stringify({
      type: 'REMOTE_SET_RECEIVER_VOLUME',
      payload: { targetDeviceId: receiverId, volume: 0.75 },
      timestamp: Date.now(),
    }));
    await wait(300);

    // Sender remotely mutes receiver
    senderWs.send(JSON.stringify({
      type: 'REMOTE_MUTE_RECEIVER',
      payload: { targetDeviceId: receiverId, isMuted: true },
      timestamp: Date.now(),
    }));
    await wait(300);

    if (!remoteVolReceived) throw new Error('Receiver did not receive remote volume command');
    if (!remoteMuteReceived) throw new Error('Receiver did not receive remote mute command');

    // ------------------------------------------------------------------------
    // Step 9: Test Receiver Leaving Room Cleanly
    // ------------------------------------------------------------------------
    console.log('\n--- Step 9: Testing Clean Receiver Disconnection / Leave Room ---');
    let senderNotifiedOfLeave = false;

    senderWs.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'DEVICE_DISCONNECTED' && msg.payload.deviceId === receiverId) {
        senderNotifiedOfLeave = true;
        console.log(`✓ Sender notified that receiver ${receiverId} disconnected`);
      }
    });

    receiverWs.send(JSON.stringify({
      type: 'RECEIVER_LEAVE_ROOM',
      payload: { deviceId: receiverId },
      timestamp: Date.now(),
    }));
    await wait(500);

    if (!senderNotifiedOfLeave) throw new Error('Sender was not notified of receiver departure');

    receiverWs.close();
    senderWs.close();

    console.log('\n================================================================');
    console.log('  SUCCESS: ALL RECEIVER & MULTI-DEVICE TESTS PASSED 100%');
    console.log('================================================================\n');
  } finally {
    serverProcess.kill('SIGINT');
  }
}

runMultiDeviceTest().catch((err) => {
  console.error('\n❌ MULTI-DEVICE TEST FAILED:', err);
  process.exit(1);
});
