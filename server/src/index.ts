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
 * Upload Audio Track Endpoint
 */
app.post('/api/audio/upload', upload.single('audio'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No audio file provided' });
    return;
  }

  const file = req.file;
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  const trackId = `track-${Buffer.from(file.filename).toString('base64url')}`;

  const metadata: AudioTrackMetadata = {
    id: trackId,
    title: path.basename(file.originalname, path.extname(file.originalname)),
    url: `/api/audio/stream/${trackId}`,
    sourceType: 'file',
    format: (['mp3', 'wav', 'ogg', 'aac', 'flac'].includes(ext) ? ext : 'mp3') as any,
    sizeBytes: file.size,
    durationSec: 180, // Updated on client after header inspection
    addedAt: Date.now(),
  };

  audioStreamService.addUploadedTrack(metadata);
  logger.info(`Uploaded file saved: ${file.originalname} -> ${metadata.id}`);

  // Broadcast track list update to clients
  wsServer.broadcast({
    type: 'BROADCAST_TRACK_UPDATE',
    payload: metadata,
    timestamp: syncEngine.getServerTime(),
  });

  res.status(201).json(metadata);
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
  wsServer.close();
  server.close(() => {
    logger.info('EchoCast server stopped.');
    process.exit(0);
  });
});
