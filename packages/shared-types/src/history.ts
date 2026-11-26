import type { TrackDto } from './catalog.js';
import type { RepeatMode } from './enums.js';

export interface PlaybackHistoryEntryDto {
  id: string;
  trackId: string;
  playedAt: string;
  durationListenedSeconds: number;
  completed: boolean;
  track?: TrackDto;
}

export interface RecordPlaybackHistoryRequestDto {
  trackId: string;
  durationListenedSeconds: number;
  completed: boolean;
}

export interface SavedPlaybackStateDto {
  currentTrackId: string | null;
  positionSeconds: number;
  volume: number;
  isShuffled: boolean;
  repeatMode: RepeatMode;
  updatedAt: string;
  currentTrack?: TrackDto | null;
}

export interface UpdatePlaybackStateRequestDto {
  currentTrackId: string | null;
  positionSeconds: number;
  volume: number;
  isShuffled: boolean;
  repeatMode: RepeatMode;
}
