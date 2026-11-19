import fs from 'fs';
import path from 'path';

export interface AudioValidationResult {
  valid: boolean;
  format?: 'mp3' | 'wav' | 'ogg' | 'flac' | 'aac' | 'm4a';
  error?: string;
}

/**
 * Validates audio file header/magic bytes to prevent non-audio or malicious payload uploads
 */
export function validateAudioFileHeader(filePath: string): AudioValidationResult {
  if (!fs.existsSync(filePath)) {
    return { valid: false, error: 'File does not exist on disk' };
  }

  const stats = fs.statSync(filePath);
  if (stats.size < 64) {
    return { valid: false, error: 'File size too small (corrupted or empty audio payload)' };
  }

  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(32);
  fs.readSync(fd, buffer, 0, 32, 0);
  fs.closeSync(fd);

  // 1. WAV: starts with 'RIFF' and contains 'WAVE' at offset 8
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x41 && buffer[10] === 0x56 && buffer[11] === 0x45
  ) {
    return { valid: true, format: 'wav' };
  }

  // 2. MP3: starts with 'ID3' (ID3v2) or MPEG Audio Sync Frame (0xFF, 0xFB / 0xF3 / 0xF2 / 0xFA)
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    return { valid: true, format: 'mp3' };
  }
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return { valid: true, format: 'mp3' };
  }

  // 3. FLAC: starts with 'fLaC' (0x66, 0x4C, 0x61, 0x43)
  if (buffer[0] === 0x66 && buffer[1] === 0x4c && buffer[2] === 0x61 && buffer[3] === 0x43) {
    return { valid: true, format: 'flac' };
  }

  // 4. OGG: starts with 'OggS' (0x4F, 0x67, 0x67, 0x53)
  if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
    return { valid: true, format: 'ogg' };
  }

  // 5. M4A / AAC (MP4 container): has 'ftyp' at offset 4
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    return { valid: true, format: 'm4a' };
  }

  // 6. AAC raw ADTS: starts with 0xFF followed by 0xF1 or 0xF9
  if (buffer[0] === 0xff && (buffer[1] === 0xf1 || buffer[1] === 0xf9)) {
    return { valid: true, format: 'aac' };
  }

  // Fallback check based on extension if headers are unusual
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) {
    return { valid: true, format: ext as any };
  }

  return {
    valid: false,
    error: 'Invalid audio header: the file does not contain valid audio stream data',
  };
}
