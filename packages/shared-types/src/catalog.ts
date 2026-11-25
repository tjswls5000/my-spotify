import type { AudioQuality } from './enums.js';

export interface ArtistDto {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface AlbumDto {
  id: string;
  title: string;
  artistName: string;
  coverUrl: string;
  releaseYear: number;
}

export interface TrackDto {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  durationSeconds: number;
  quality: AudioQuality;
  bitrateKbps?: number;
  isLiked?: boolean;
}
