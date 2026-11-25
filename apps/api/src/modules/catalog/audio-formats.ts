import path from 'node:path';
import { AudioQuality } from '@my-spotify/shared-types';

const AUDIO_MIME_BY_EXT: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
};

export const SUPPORTED_AUDIO_EXTENSIONS = new Set(
  Object.keys(AUDIO_MIME_BY_EXT),
);

export function isSupportedAudioFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_AUDIO_EXTENSIONS.has(ext);
}

export function getAudioMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return AUDIO_MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

export function resolveAudioQuality(options: {
  lossless?: boolean;
  bitrateKbps?: number;
  filePath: string;
}): AudioQuality {
  const ext = path.extname(options.filePath).toLowerCase();
  if (options.lossless || ext === '.flac' || ext === '.wav') {
    return AudioQuality.LOSSLESS;
  }
  if ((options.bitrateKbps ?? 0) >= 256) {
    return AudioQuality.HIGH;
  }
  return AudioQuality.STANDARD;
}
