import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type {
  AddPlaylistTracksRequestDto,
  ApiResponse,
  CreatePlaylistRequestDto,
  PlaylistDto,
  ReorderPlaylistTracksRequestDto,
  UpdatePlaylistRequestDto,
} from '@my-spotify/shared-types';
import { PlaylistService } from './playlist.service.js';

@Controller('playlists')
export class PlaylistController {
  constructor(private readonly playlistService: PlaylistService) {}

  @Get()
  async listPlaylists(): Promise<ApiResponse<PlaylistDto[]>> {
    const data = await this.playlistService.listPlaylists();
    return { data };
  }

  @Get(':id')
  async getPlaylist(
    @Param('id') id: string,
  ): Promise<ApiResponse<PlaylistDto>> {
    const data = await this.playlistService.getPlaylistById(id);
    return { data };
  }

  @Post()
  async createPlaylist(
    @Body() body: CreatePlaylistRequestDto,
  ): Promise<ApiResponse<PlaylistDto>> {
    const data = await this.playlistService.createPlaylist(body);
    return { data };
  }

  @Patch(':id')
  async updatePlaylist(
    @Param('id') id: string,
    @Body() body: UpdatePlaylistRequestDto,
  ): Promise<ApiResponse<PlaylistDto>> {
    const data = await this.playlistService.updatePlaylist(id, body);
    return { data };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePlaylist(@Param('id') id: string): Promise<void> {
    await this.playlistService.deletePlaylist(id);
  }

  @Post(':id/tracks')
  async addTracks(
    @Param('id') id: string,
    @Body() body: AddPlaylistTracksRequestDto,
  ): Promise<ApiResponse<PlaylistDto>> {
    const data = await this.playlistService.addTracksToPlaylist(id, body);
    return { data };
  }

  @Patch(':id/tracks/reorder')
  async reorderTracks(
    @Param('id') id: string,
    @Body() body: ReorderPlaylistTracksRequestDto,
  ): Promise<ApiResponse<PlaylistDto>> {
    const data = await this.playlistService.reorderPlaylistTracks(id, body);
    return { data };
  }

  @Delete(':id/tracks/:trackId')
  async removeTrack(
    @Param('id') id: string,
    @Param('trackId') trackId: string,
  ): Promise<ApiResponse<PlaylistDto>> {
    const data = await this.playlistService.removeTrackFromPlaylist(
      id,
      trackId,
    );
    return { data };
  }
}
