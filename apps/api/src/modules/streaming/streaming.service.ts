import fs from 'node:fs/promises';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AudioQuality,
  StreamingProtocol,
  type StreamManifestDto,
} from '@my-spotify/shared-types';
import { CatalogService } from '../catalog/catalog.service.js';

export interface StreamableAudioFile {
  trackId: string;
  filePath: string;
  mimeType: string;
  fileSizeBytes: number;
}

@Injectable()
export class StreamingService {
  constructor(private readonly catalogService: CatalogService) {}

  async getStreamableFile(trackId: string): Promise<StreamableAudioFile> {
    const record = await this.catalogService.getTrackRecordById(trackId);

    try {
      const stat = await fs.stat(record.filePath);
      if (!stat.isFile()) {
        throw new NotFoundException('Audio file is not available on disk');
      }

      return {
        trackId: record.id,
        filePath: record.filePath,
        mimeType: record.mimeType,
        fileSizeBytes: stat.size,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new NotFoundException(
        'Audio file was moved or deleted from the streaming server',
      );
    }
  }

  async getManifest(trackId: string): Promise<StreamManifestDto> {
    const track = await this.catalogService.getTrackById(trackId);
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString();

    return {
      trackId: track.id,
      protocol: StreamingProtocol.PROGRESSIVE,
      quality: track.quality ?? AudioQuality.STANDARD,
      manifestUrl: `/api/streaming/${track.id}`,
      expiresAt,
    };
  }
}
