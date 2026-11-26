import fs from 'node:fs';
import {
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Res,
} from '@nestjs/common';
import type { ApiResponse, StreamManifestDto } from '@my-spotify/shared-types';
import type { Response } from 'express';
import { AllowQueryToken } from '../auth/public.decorator.js';
import { StreamingService } from './streaming.service.js';

function parseByteRange(
  rangeHeader: string,
  fileSize: number,
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) {
    return null;
  }

  const rawStart = match[1];
  const rawEnd = match[2];

  if (!rawStart && !rawEnd) {
    return null;
  }

  if (!rawStart && rawEnd) {
    const suffixLength = Number.parseInt(rawEnd, 10);
    if (Number.isNaN(suffixLength) || suffixLength <= 0) {
      return null;
    }
    const start = Math.max(0, fileSize - suffixLength);
    return { start, end: fileSize - 1 };
  }

  const start = Number.parseInt(rawStart ?? '', 10);
  const end = rawEnd
    ? Math.min(Number.parseInt(rawEnd, 10), fileSize - 1)
    : fileSize - 1;

  if (
    Number.isNaN(start) ||
    Number.isNaN(end) ||
    start < 0 ||
    start >= fileSize ||
    start > end
  ) {
    return null;
  }

  return { start, end };
}

@Controller('streaming')
export class StreamingController {
  constructor(private readonly streamingService: StreamingService) {}

  @Get(':trackId/manifest')
  async getManifest(
    @Param('trackId') trackId: string,
  ): Promise<ApiResponse<StreamManifestDto>> {
    const data = await this.streamingService.getManifest(trackId);
    return { data };
  }

  @AllowQueryToken()
  @Get(':trackId')
  async streamTrack(
    @Param('trackId') trackId: string,
    @Headers('range') rangeHeader: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const audio = await this.streamingService.getStreamableFile(trackId);
    const { filePath, fileSizeBytes, mimeType } = audio;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    if (rangeHeader) {
      const parsedRange = parseByteRange(rangeHeader, fileSizeBytes);
      if (!parsedRange) {
        res.setHeader('Content-Range', `bytes */${fileSizeBytes}`);
        res.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE).end();
        return;
      }

      const { start, end } = parsedRange;
      const chunkSize = end - start + 1;

      res.status(HttpStatus.PARTIAL_CONTENT);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSizeBytes}`);
      res.setHeader('Content-Length', chunkSize);

      const stream = fs.createReadStream(filePath, { start, end });
      res.on('close', () => stream.destroy());
      stream.pipe(res);
      return;
    }

    res.status(HttpStatus.OK);
    res.setHeader('Content-Length', fileSizeBytes);

    const stream = fs.createReadStream(filePath);
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  }
}
