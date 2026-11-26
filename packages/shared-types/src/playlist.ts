import type { TrackDto } from './catalog.js';

export interface PlaylistDto {
  id: string;
  name: string;
  description: string;
  coverUrl: string | null;
  trackCount: number;
  totalDurationSeconds: number;
  tracks?: TrackDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlaylistRequestDto {
  name: string;
  description?: string;
  coverUrl?: string | null;
}

export interface UpdatePlaylistRequestDto {
  name?: string;
  description?: string;
  coverUrl?: string | null;
}

export interface AddPlaylistTracksRequestDto {
  trackIds: string[];
}

export interface ReorderPlaylistTracksRequestDto {
  trackIds: string[];
}
