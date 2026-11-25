import { Controller, Get } from '@nestjs/common';
import type { ApiResponse, TrackDto } from '@my-spotify/shared-types';
import { CatalogService } from './catalog.service.js';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('tracks')
  listTracks(): ApiResponse<TrackDto[]> {
    return {
      data: this.catalogService.listTracks(),
    };
  }
}
