import { Injectable } from '@nestjs/common';
import type { StreamManifestDto } from '@my-spotify/shared-types';

@Injectable()
export class StreamingService {
  getManifest(_trackId: string): StreamManifestDto | null {
    // TODO: Implement HTTP range streaming & HLS manifest generation via ffmpeg
    return null;
  }
}
