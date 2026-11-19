import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import {
  AudioTrackMetadata,
  ServerRuntimeStatus,
} from '@echocast/shared';
import { config } from './config/index';
import { logger } from './utils/logger';
import { networkService } from './services/networkService';
import { syncEngine } from './services/syncEngineService';
import { deviceManager } from './services/deviceManagerService';
import { audioStreamService } from './services/audioStreamService';
import { wsServer } from './websocket/wsServer';
import { validateAudioFileHeader } from './utils/audioValidator';

const app = express();
const server = http.createServer(app);
const serverStartTime = Date.now();

// Middleware
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.path.startsWith('/api/server/status')) {
    logger.debug(`${req.method} ${req.path} [${req.ip}]`);
  }
  next();
});

// Configure Multer for local audio file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, config.uploadDir);
  },
  filename: (_req, file, cb) => {
    // Sanitize filename and prevent collisions
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadSizeBytes },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'audio/mpeg',
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/ogg',
      'audio/aac',
      'audio/flac',
      'audio/mp4',
      'audio/webm',
    ];
    if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(mp3|wav|ogg|aac|flac|m4a)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only standard audio files (MP3, WAV, OGG, AAC, FLAC) are supported.'));
    }
  },
});

// --- REST Endpoints ---

/**
 * Server and Network Status Endpoint
 */
app.get('/api/server/status', (_req: Request, res: Response) => {
  const interfaces = networkService.getNetworkInterfaces();
  const primary = networkService.getPrimaryInterface();
  const broadcastState = audioStreamService.getBroadcastState();

  const status: ServerRuntimeStatus = {
    version: '1.0.0',
    serverTime: syncEngine.getServerTime(),
    httpPort: config.port,
    wsPort: config.port,
    activeInterfaces: interfaces,
    primaryUrl: primary.url,
    isHotspotDetected: interfaces.some((i) => i.isHotspot),
    connectedReceiversCount: deviceManager.getReceivers().length,
    senderConnected: deviceManager.getSender() !== undefined,
    activeTrackId: broadcastState.currentTrack?.id || null,
    serverUptimeSec: Math.floor((Date.now() - serverStartTime) / 1000),
  };

  res.json(status);
});

/**
 * Room Verification Endpoint (used by receivers to validate room code & status)
 */
app.get('/api/room/verify', (req: Request, res: Response) => {
  const roomId = req.query.roomId as string;
  const broadcastState = audioStreamService.getBroadcastState();

  if (!roomId || !roomId.trim()) {
    res.status(400).json({ valid: false, error: 'Room code is required' });
    return;
  }

  const isMatch = broadcastState.roomId.trim().toUpperCase() === roomId.trim().toUpperCase();
  if (!isMatch) {
    res.status(404).json({
      valid: false,
      error: `Room "${roomId}" was not found`,
      code: 'INVALID_ROOM_ID',
    });
    return;
  }

  if (!broadcastState.isRoomActive) {
    res.status(403).json({
      valid: false,
      error: `Room "${roomId}" is currently paused or closed by the host`,
      code: 'ROOM_INACTIVE',
      isRoomActive: false,
    });
    return;
  }

  const tokenParam = req.query.token as string | undefined;
  const isTokenValid = !broadcastState.requireAuth || (tokenParam === broadcastState.authToken);

  res.json({
    valid: true,
    roomId: broadcastState.roomId,
    isRoomActive: broadcastState.isRoomActive,
    requireAuth: broadcastState.requireAuth || false,
    isTokenValid,
    currentTrack: broadcastState.currentTrack,
    senderConnected: deviceManager.getSender() !== undefined,
    connectedReceiversCount: deviceManager.getReceivers().length,
  });
});

/**
 * Local Network Interfaces Endpoint
 */
app.get('/api/network/interfaces', (_req: Request, res: Response) => {
  res.json({
    interfaces: networkService.getNetworkInterfaces(),
    primary: networkService.getPrimaryInterface(),
  });
});

/**
 * Simulate or trigger network IP address change notification (used during hotspot migration & testing)
 */
app.post('/api/network/simulate-change', (req: Request, res: Response) => {
  const { newIp } = req.body;
  if (!newIp) {
    res.status(400).json({ error: 'newIp required' });
    return;
  }
  networkService.triggerAddressChange(newIp);
  res.json({ success: true, newIp });
});

/**
 * Audio Catalog Endpoint
 */
app.get('/api/audio/tracks', (_req: Request, res: Response) => {
  res.json(audioStreamService.getAllTracks());
});

/**
 * Current Broadcast Playback State
 */
app.get('/api/audio/state', (_req: Request, res: Response) => {
  res.json(audioStreamService.getBroadcastState());
});

/**
 * HTTP Audio Streaming Endpoint (supports byte-ranges for chunked streaming)
 */
app.get('/api/audio/stream/:trackId', (req: Request, res: Response) => {
  audioStreamService.handleStreamRequest(req, res, req.params.trackId);
});

/**
 * Upload Audio Track(s) Endpoint - supports single or batch file uploads with security header validation
 */
app.post('/api/audio/upload', (req: Request, res: Response) => {
  upload.array('audio', 20)(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({
            error: 'File size limit exceeded',
            message: `Uploaded file exceeds maximum allowed size (${config.maxUploadSizeBytes / (1024 * 1024)}MB)`,
          });
          return;
        }
        res.status(400).json({ error: err.code, message: err.message });
        return;
      }
      res.status(400).json({ error: 'Upload Error', message: err.message });
      return;
    }

    const files = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No audio file provided' });
      return;
    }

    const newTracks: AudioTrackMetadata[] = [];

    for (const file of files) {
      const validation = validateAudioFileHeader(file.path);
      if (!validation.valid) {
        try {
          fs.unlinkSync(file.path);
        } catch {}
        res.status(400).json({ error: 'Invalid Audio Payload', message: validation.error });
        return;
      }

      const ext = validation.format || path.extname(file.originalname).toLowerCase().replace('.', '');
      const trackId = `track-${Buffer.from(file.filename).toString('base64url')}`;

      const metadata: AudioTrackMetadata = {
        id: trackId,
        title: path.basename(file.originalname, path.extname(file.originalname)),
        artist: 'Local Upload',
        url: `/api/audio/stream/${trackId}`,
        sourceType: 'file',
        format: ext as any,
        sizeBytes: file.size,
        durationSec: 180, // Updated accurately on client after decoding
        addedAt: Date.now(),
      };

      audioStreamService.addUploadedTrack(metadata);
      logger.info(`Uploaded file saved & validated: ${file.originalname} -> ${metadata.id}`);
      newTracks.push(metadata);
    }

    // Broadcast updated state to all clients
    wsServer.broadcast({
      type: 'BROADCAST_STATE',
      payload: audioStreamService.getBroadcastState(),
      timestamp: syncEngine.getServerTime(),
    });

    res.status(201).json(newTracks.length === 1 ? newTracks[0] : newTracks);
  });
});

/**
 * Delete Audio Track Endpoint
 */
app.delete('/api/audio/tracks/:trackId', (req: Request, res: Response) => {
  const { trackId } = req.params;
  const success = audioStreamService.removeTrack(trackId);
  if (success) {
    wsServer.broadcast({
      type: 'BROADCAST_STATE',
      payload: audioStreamService.getBroadcastState(),
      timestamp: syncEngine.getServerTime(),
    });
    res.json({ success: true, trackId });
  } else {
    res.status(404).json({ error: 'Track not found' });
  }
});

/**
 * Reorder Playlist Endpoint
 */
app.put('/api/audio/playlist', (req: Request, res: Response) => {
  const { trackIds } = req.body;
  if (!Array.isArray(trackIds)) {
    res.status(400).json({ error: 'trackIds array required' });
    return;
  }
  audioStreamService.setPlaylistOrder(trackIds);
  wsServer.broadcast({
    type: 'BROADCAST_STATE',
    payload: audioStreamService.getBroadcastState(),
    timestamp: syncEngine.getServerTime(),
  });
  res.json({ success: true, playlist: audioStreamService.getPlaylist() });
});

/**
 * Update Track Metadata Endpoint (e.g. accurately decoded duration from client)
 */
app.patch('/api/audio/tracks/:trackId', (req: Request, res: Response) => {
  const { trackId } = req.params;
  const { durationSec, artist, album } = req.body;
  audioStreamService.updateTrackMetadata(trackId, durationSec, artist, album);
  wsServer.broadcast({
    type: 'BROADCAST_STATE',
    payload: audioStreamService.getBroadcastState(),
    timestamp: syncEngine.getServerTime(),
  });
  res.json({ success: true, track: audioStreamService.getTrack(trackId) });
});

/**
 * Connected Devices List Endpoint
 */
app.get('/api/devices', (_req: Request, res: Response) => {
  res.json(deviceManager.getAllDevices());
});

// Production: Serve client static SPA build if exists
const clientDistPath = path.resolve(process.cwd(), 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  logger.info(`Serving static client files from ${clientDistPath}`);
  app.use(express.static(clientDistPath));

  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled server exception', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
  });
});

// Initialize WebSocket server
wsServer.initialize(server);

// Start dynamic network interface change monitoring
networkService.startMonitoring(4000);
networkService.onChange((primaryUrl, interfaces) => {
  wsServer.broadcast({
    type: 'NETWORK_STATUS_UPDATE',
    payload: {
      primaryUrl,
      activeInterfaces: interfaces,
      isHotspotDetected: interfaces.some((i) => i.isHotspot),
    },
    timestamp: syncEngine.getServerTime(),
  });
});

// Start server
server.listen(config.port, config.host, () => {
  logger.info(`========================================================`);
  logger.info(`  EchoCast Server Started on port ${config.port}`);
  logger.info(`========================================================`);
  networkService.logDetectedInterfaces();
  const primary = networkService.getPrimaryInterface();
  logger.info(`  Primary Access URL: ${primary.url}`);
  logger.info(`  WebSocket Endpoint: ${primary.wsUrl}`);
  logger.info(`========================================================`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down EchoCast server...');
  networkService.stopMonitoring();
  wsServer.close();
  server.close(() => {
    logger.info('EchoCast server stopped.');
    process.exit(0);
  });
});
