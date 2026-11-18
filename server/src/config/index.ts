import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env from root or server directory if present
const rootEnvPath = path.resolve(process.cwd(), '.env');
const serverEnvPath = path.resolve(process.cwd(), 'server', '.env');

if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else if (fs.existsSync(serverEnvPath)) {
  dotenv.config({ path: serverEnvPath });
} else {
  dotenv.config();
}

export interface AppConfig {
  port: number;
  host: string;
  corsOrigin: string;
  uploadDir: string;
  maxUploadSizeBytes: number;
  defaultScheduleDelayMs: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  ntpSamplesCount: number;
  logLevel: string;
}

const uploadsDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'server/uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '4000', 10),
  host: process.env.HOST || '0.0.0.0',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  uploadDir: uploadsDir,
  maxUploadSizeBytes: parseInt(process.env.MAX_UPLOAD_SIZE_MB || '100', 10) * 1024 * 1024,
  defaultScheduleDelayMs: parseInt(process.env.SCHEDULE_DELAY_MS || '650', 10), // Safe network broadcast window
  heartbeatIntervalMs: 15000,
  heartbeatTimeoutMs: 35000,
  ntpSamplesCount: 8,
  logLevel: process.env.LOG_LEVEL || 'info',
};
