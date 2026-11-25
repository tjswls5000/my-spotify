import type { TrackDto } from './catalog.js';

export interface PlaylistDto {
  id: string;
  name: string;
  description: string;
  coverUrl: string;
  trackCount: number;
  totalDurationSeconds: number;
  tracks?: TrackDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlaylistRequestDto {
  name: string;
  description?: string;
  coverUrl?: string;
}
