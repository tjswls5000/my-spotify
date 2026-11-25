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
  coverUrl: string | null;
  releaseYear?: number;
}

export interface TrackDto {
  id: string;
  libraryFolderId: string;
  title: string;
  artist: string;
  album: string;
  trackNumber?: number;
  year?: number;
  genre?: string;
  coverUrl: string | null;
  streamUrl: string;
  durationSeconds: number;
  quality: AudioQuality;
  bitrateKbps?: number;
  sampleRateHz?: number;
  codec?: string;
  fileSizeBytes: number;
  isLiked: boolean;
  createdAt: string;
}
