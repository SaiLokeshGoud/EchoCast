import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
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

function httpPostMultipart(url, filePath, fieldName = 'audio') {
  return new Promise((resolve, reject) => {
    const boundary = '----EchoCastBoundary' + Math.random().toString(36).substring(2);
    const filename = path.basename(filePath);
    const fileContent = fs.readFileSync(filePath);

    const prefix = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: audio/wav\r\n\r\n`
    );
    const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([prefix, fileContent, suffix]);

    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
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
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpSendJson(url, method, data) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body = JSON.stringify(data);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function generateSimpleWav(filePath, durationSec = 1) {
  const sampleRate = 44100;
  const numSamples = sampleRate * durationSec;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const val = Math.sin(2 * Math.PI * 440 * t) * 0.5;
    const sample = Math.max(-1, Math.min(1, val));
    buffer.writeInt16LE(sample < 0 ? sample * 0x8000 : sample * 0x7fff, 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
}

async function runTests() {
  console.log('--- Starting EchoCast Sender Integration Test ---');

  // Start the server process
  const serverProcess = spawn('npx', ['tsx', 'server/src/index.ts'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: '4005' },
    stdio: 'pipe',
    shell: true,
  });

  serverProcess.stdout.on('data', (d) => process.stdout.write(`[Server] ${d}`));
  serverProcess.stderr.on('data', (d) => process.stderr.write(`[Server Err] ${d}`));

  let serverStarted = false;
  for (let i = 0; i < 20; i++) {
    await wait(500);
    try {
      const res = await httpGet('http://127.0.0.1:4005/api/server/status');
      if (res.statusCode === 200) {
        serverStarted = true;
        console.log('✓ EchoCast server is reachable on port 4005');
        break;
      }
    } catch {
      // Waiting for server to bind
    }
  }

  if (!serverStarted) {
    serverProcess.kill();
    throw new Error('Server failed to start within timeout');
  }

  try {
    // 1. Test Network / Server Status Endpoint
    const netRes = await httpGet('http://127.0.0.1:4005/api/server/status');
    const netData = JSON.parse(netRes.text);
    console.log(`✓ Network detected primary IP: ${netData.primaryUrl}, Active Interfaces: ${netData.activeInterfaces?.length}`);

    // 2. Test Audio State & Built-in Track
    const stateRes = await httpGet('http://127.0.0.1:4005/api/audio/state');
    const state = JSON.parse(stateRes.text);
    console.log(`✓ Initial Broadcast State: room=${state.roomId}, isRoomActive=${state.isRoomActive}, currentTrack=${state.currentTrack?.title}`);
    if (!state.currentTrack) throw new Error('Expected built-in metronome track');

    // 3. Test HTTP Range Streaming of Built-in Track
    const streamRes = await httpGet(`http://127.0.0.1:4005/api/audio/stream/${state.currentTrack.id}`, {
      Range: 'bytes=0-1023',
    });
    console.log(`✓ Stream Range Request status: ${streamRes.statusCode}, Content-Range: ${streamRes.headers['content-range']}, Bytes: ${streamRes.body.length}`);
    if (streamRes.statusCode !== 206 || streamRes.body.length !== 1024) {
      throw new Error(`Range request failed: ${streamRes.statusCode}, bytes: ${streamRes.body.length}`);
    }

    // 4. Test Local File Upload (Audio Selection & Batch Upload)
    const tempWavPath = path.resolve(__dirname, 'test_upload_sample.wav');
    generateSimpleWav(tempWavPath, 2);
    console.log(`✓ Created test WAV file: ${tempWavPath} (${fs.statSync(tempWavPath).size} bytes)`);

    const uploadRes = await httpPostMultipart('http://127.0.0.1:4005/api/audio/upload', tempWavPath);
    console.log(`✓ Upload response (${uploadRes.statusCode}): ${uploadRes.body}`);
    const uploadedTrack = JSON.parse(uploadRes.body);
    if (!uploadedTrack.id) throw new Error('Upload failed to return track ID');

    // 5. Test Audio Byte Streaming of Uploaded File
    const uploadedStreamRes = await httpGet(`http://127.0.0.1:4005/api/audio/stream/${uploadedTrack.id}`, {
      Range: 'bytes=0-511',
    });
    console.log(`✓ Stream Uploaded File status: ${uploadedStreamRes.statusCode}, Content-Range: ${uploadedStreamRes.headers['content-range']}, Bytes: ${uploadedStreamRes.body.length}`);
    if (uploadedStreamRes.statusCode !== 206) {
      throw new Error(`Uploaded file streaming failed: ${uploadedStreamRes.statusCode}`);
    }

    // 6. Test Playlist Reordering
    const stateAfterUpload = JSON.parse((await httpGet('http://127.0.0.1:4005/api/audio/state')).text);
    const trackIds = stateAfterUpload.playlist.map((t) => t.id);
    const reversedIds = [...trackIds].reverse();
    const reorderRes = await httpSendJson('http://127.0.0.1:4005/api/audio/playlist', 'PUT', { trackIds: reversedIds });
    console.log(`✓ Playlist Reordering:`, JSON.parse(reorderRes.body));

    // 7. Test Track Metadata Update (e.g. client decoded duration)
    const patchRes = await httpSendJson(`http://127.0.0.1:4005/api/audio/tracks/${uploadedTrack.id}`, 'PATCH', {
      durationSec: 2.05,
      artist: 'Acoustic Synthesizer',
    });
    console.log(`✓ Track Metadata Updated:`, JSON.parse(patchRes.body));

    // 8. Test WebSocket Communication & Time Sync
    const ws = new WebSocket('ws://127.0.0.1:4005/ws');
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });
    console.log('✓ WebSocket connected successfully');

    let receivedSyncResponse = false;
    let receivedRoomUpdate = false;

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'SYNC_PONG') {
        console.log(`✓ WebSocket SYNC_PONG: serverSendTime=${msg.payload.serverSendTime}`);
        receivedSyncResponse = true;
      }
      if (msg.type === 'BROADCAST_STATE' && msg.payload.roomId === 'ROOM-VERIFIED') {
        console.log(`✓ WebSocket BROADCAST_STATE updated roomId=${msg.payload.roomId}`);
        receivedRoomUpdate = true;
      }
    });

    // Send NTP-style Time Sync Ping
    ws.send(JSON.stringify({
      type: 'SYNC_PING',
      payload: { clientSendTime: Date.now() },
      timestamp: Date.now(),
    }));

    // Send Room Update
    ws.send(JSON.stringify({
      type: 'BROADCAST_ROOM_UPDATE',
      payload: { roomId: 'ROOM-VERIFIED', isRoomActive: true },
      timestamp: Date.now(),
    }));

    await wait(800);
    ws.close();

    if (!receivedSyncResponse) throw new Error('Did not receive SYNC_PONG');
    if (!receivedRoomUpdate) throw new Error('Did not receive room update broadcast');

    // 9. Test Track Deletion
    const deleteRes = await httpSendJson(`http://127.0.0.1:4005/api/audio/tracks/${uploadedTrack.id}`, 'DELETE', {});
    console.log(`✓ Track Deletion result:`, JSON.parse(deleteRes.body));

    // Cleanup local temp test file
    if (fs.existsSync(tempWavPath)) fs.unlinkSync(tempWavPath);

    console.log('\n======================================================');
    console.log('  ALL SENDER INTEGRATION TESTS PASSED WITH 100% SUCCESS');
    console.log('======================================================\n');
  } finally {
    serverProcess.kill('SIGINT');
  }
}

runTests().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
