import { Injectable } from '@nestjs/common';
import type { TrackDto } from '@my-spotify/shared-types';

@Injectable()
export class CatalogService {
  listTracks(): TrackDto[] {
    // TODO: Load tracks from database / media library indexer
    return [];
  }
}
