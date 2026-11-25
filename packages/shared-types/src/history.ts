export interface PlaybackHistoryEntryDto {
  id: string;
  trackId: string;
  playedAt: string;
  durationListenedSeconds: number;
  completed: boolean;
}
