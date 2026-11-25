import { Controller, Get } from '@nestjs/common';
import type { ApiResponse, PlaylistDto } from '@my-spotify/shared-types';
import { PlaylistService } from './playlist.service.js';

@Controller('playlists')
export class PlaylistController {
  constructor(private readonly playlistService: PlaylistService) {}

  @Get()
  listPlaylists(): ApiResponse<PlaylistDto[]> {
    return {
      data: this.playlistService.listPlaylists(),
    };
  }
}
