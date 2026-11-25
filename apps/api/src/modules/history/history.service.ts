import { Injectable } from '@nestjs/common';
import type { PlaybackHistoryEntryDto } from '@my-spotify/shared-types';

@Injectable()
export class HistoryService {
  getRecentHistory(): PlaybackHistoryEntryDto[] {
    // TODO: Persist and query recently played tracks
    return [];
  }
}
