import { Injectable } from '@nestjs/common';
import type { PlaylistDto } from '@my-spotify/shared-types';

@Injectable()
export class PlaylistService {
  listPlaylists(): PlaylistDto[] {
    // TODO: Load user playlists from database
    return [];
  }
}
