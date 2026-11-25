import { Controller, Get, Param } from '@nestjs/common';
import type { ApiResponse, StreamManifestDto } from '@my-spotify/shared-types';
import { StreamingService } from './streaming.service.js';

@Controller('streaming')
export class StreamingController {
  constructor(private readonly streamingService: StreamingService) {}

  @Get(':trackId/manifest')
  getManifest(
    @Param('trackId') trackId: string,
  ): ApiResponse<StreamManifestDto | null> {
    return {
      data: this.streamingService.getManifest(trackId),
    };
  }
}
