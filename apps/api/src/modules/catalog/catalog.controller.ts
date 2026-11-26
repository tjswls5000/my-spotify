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
  Query,
  Res,
} from '@nestjs/common';
import type {
  AddLibraryFolderRequestDto,
  ApiResponse,
  DirectoryBrowseResponseDto,
  LibraryFolderDto,
  ScanLibraryRequestDto,
  ScanResultDto,
  TrackDto,
} from '@my-spotify/shared-types';
import type { Response } from 'express';
import { AllowQueryToken } from '../auth/public.decorator.js';
import { CatalogService } from './catalog.service.js';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('tracks')
  async listTracks(
    @Query('search') search?: string,
    @Query('libraryFolderId') libraryFolderId?: string,
    @Query('liked') liked?: string,
  ): Promise<ApiResponse<TrackDto[]>> {
    const data = await this.catalogService.listTracks({
      search,
      libraryFolderId,
      liked: liked === 'true',
    });
    return { data };
  }

  @Get('tracks/:id')
  async getTrack(@Param('id') id: string): Promise<ApiResponse<TrackDto>> {
    const data = await this.catalogService.getTrackById(id);
    return { data };
  }

  @Patch('tracks/:id/like')
  async toggleLike(@Param('id') id: string): Promise<ApiResponse<TrackDto>> {
    const data = await this.catalogService.toggleLike(id);
    return { data };
  }

  @AllowQueryToken()
  @Get('tracks/:id/cover')
  async getTrackCover(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const cover = await this.catalogService.getTrackCover(id);
    res.setHeader('Content-Type', cover.format);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(cover.data));
  }

  @Get('libraries')
  async listLibraries(): Promise<ApiResponse<LibraryFolderDto[]>> {
    const data = await this.catalogService.listLibraryFolders();
    return { data };
  }

  @Post('libraries')
  async addLibrary(
    @Body() body: AddLibraryFolderRequestDto,
  ): Promise<ApiResponse<{ folder: LibraryFolderDto; scan: ScanResultDto }>> {
    const data = await this.catalogService.addLibraryFolder(body);
    return { data };
  }

  @Delete('libraries/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeLibrary(@Param('id') id: string): Promise<void> {
    await this.catalogService.removeLibraryFolder(id);
  }

  @Post('scan')
  async scanLibraries(
    @Body() body?: ScanLibraryRequestDto,
  ): Promise<ApiResponse<ScanResultDto>> {
    const data = await this.catalogService.triggerScan(body?.libraryFolderId);
    return { data };
  }

  @Get('directories')
  async browseDirectories(
    @Query('path') targetPath?: string,
  ): Promise<ApiResponse<DirectoryBrowseResponseDto>> {
    const data = await this.catalogService.browseDirectories(targetPath);
    return { data };
  }
}
