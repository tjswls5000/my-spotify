import { Controller, Get } from '@nestjs/common';
import type {
  ApiResponse,
  PlaybackHistoryEntryDto,
} from '@my-spotify/shared-types';
import { HistoryService } from './history.service.js';

@Controller('history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get('recent')
  getRecentHistory(): ApiResponse<PlaybackHistoryEntryDto[]> {
    return {
      data: this.historyService.getRecentHistory(),
    };
  }
}
