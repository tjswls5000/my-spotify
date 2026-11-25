import type { AudioQuality, RepeatMode, StreamingProtocol } from './enums.js';

export interface StreamManifestDto {
  trackId: string;
  protocol: StreamingProtocol;
  quality: AudioQuality;
  manifestUrl: string;
  expiresAt: string;
}

export interface PlaybackStateDto {
  currentTrackId: string | null;
  isPlaying: boolean;
  positionSeconds: number;
  volume: number;
  isShuffled: boolean;
  repeatMode: RepeatMode;
}
