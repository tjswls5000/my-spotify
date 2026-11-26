import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import type {
  ApiResponse,
  PlaybackHistoryEntryDto,
  RecordPlaybackHistoryRequestDto,
  SavedPlaybackStateDto,
  UpdatePlaybackStateRequestDto,
} from '@my-spotify/shared-types';
import { HistoryService } from './history.service.js';

@Controller('history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get('recent')
  async getRecentHistory(
    @Query('limit') limit?: string,
  ): Promise<ApiResponse<PlaybackHistoryEntryDto[]>> {
    const parsedLimit =
      limit !== undefined && limit.trim() !== '' ? Number(limit) : undefined;
    const data = await this.historyService.getRecentHistory(parsedLimit);
    return { data };
  }

  @Post()
  async recordPlayback(
    @Body() body: RecordPlaybackHistoryRequestDto,
  ): Promise<ApiResponse<PlaybackHistoryEntryDto>> {
    const data = await this.historyService.recordPlayback(body);
    return { data };
  }

  @Get('resume')
  async getResumeState(): Promise<ApiResponse<SavedPlaybackStateDto | null>> {
    const data = await this.historyService.getResumeState();
    return { data };
  }

  @Put('resume')
  async saveResumeState(
    @Body() body: UpdatePlaybackStateRequestDto,
  ): Promise<ApiResponse<SavedPlaybackStateDto>> {
    const data = await this.historyService.saveResumeState(body);
    return { data };
  }
}
