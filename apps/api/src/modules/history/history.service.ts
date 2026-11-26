import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AudioQuality,
  RepeatMode,
  type PlaybackHistoryEntryDto,
  type RecordPlaybackHistoryRequestDto,
  type SavedPlaybackStateDto,
  type TrackDto,
  type UpdatePlaybackStateRequestDto,
} from '@my-spotify/shared-types';
import { desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service.js';
import {
  playbackHistory,
  playbackStates,
  tracks,
  type PlaybackHistoryRecord,
  type PlaybackStateRecord,
  type TrackRecord,
} from '../../database/schema.js';

const DEFAULT_RECENT_LIMIT = 50;
const MIN_RECENT_LIMIT = 1;
const MAX_RECENT_LIMIT = 200;
const DEFAULT_PLAYBACK_STATE_ID = 'default';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUDIO_QUALITY_VALUES = new Set<string>(Object.values(AudioQuality));
const REPEAT_MODE_VALUES = new Set<string>(Object.values(RepeatMode));

@Injectable()
export class HistoryService {
  constructor(private readonly database: DatabaseService) {}

  private ensureDatabaseReady(): void {
    if (!this.database.isReady()) {
      throw new ServiceUnavailableException(
        'PostgreSQL database is not connected. Start PostgreSQL with "pnpm db:up".',
      );
    }
  }

  private toTrackDto(record: TrackRecord): TrackDto {
    const quality = AUDIO_QUALITY_VALUES.has(record.quality)
      ? (record.quality as AudioQuality)
      : AudioQuality.STANDARD;

    return {
      id: record.id,
      libraryFolderId: record.libraryFolderId,
      title: record.title,
      artist: record.artist,
      album: record.album,
      trackNumber: record.trackNumber ?? undefined,
      year: record.year ?? undefined,
      genre: record.genre ?? undefined,
      coverUrl: record.hasCover ? `/api/catalog/tracks/${record.id}/cover` : null,
      streamUrl: `/api/streaming/${record.id}`,
      durationSeconds: record.durationSeconds,
      quality,
      bitrateKbps: record.bitrateKbps ?? undefined,
      sampleRateHz: record.sampleRateHz ?? undefined,
      codec: record.codec ?? undefined,
      fileSizeBytes: record.fileSizeBytes,
      isLiked: record.isLiked,
      createdAt: record.createdAt.toISOString(),
    };
  }

  private toHistoryEntryDto(
    record: PlaybackHistoryRecord,
    track: TrackRecord,
  ): PlaybackHistoryEntryDto {
    return {
      id: record.id,
      trackId: record.trackId,
      playedAt: record.playedAt.toISOString(),
      durationListenedSeconds: record.durationListenedSeconds,
      completed: record.completed,
      track: this.toTrackDto(track),
    };
  }

  private toSavedPlaybackStateDto(
    record: PlaybackStateRecord,
    track: TrackRecord | null,
  ): SavedPlaybackStateDto {
    const repeatMode = REPEAT_MODE_VALUES.has(record.repeatMode)
      ? (record.repeatMode as RepeatMode)
      : RepeatMode.ALL;

    return {
      currentTrackId: record.currentTrackId,
      positionSeconds: record.positionSeconds,
      volume: record.volume,
      isShuffled: record.isShuffled,
      repeatMode,
      updatedAt: record.updatedAt.toISOString(),
      currentTrack: track ? this.toTrackDto(track) : null,
    };
  }

  private resolveRecentLimit(limit?: number): number {
    if (limit === undefined || !Number.isFinite(limit)) {
      return DEFAULT_RECENT_LIMIT;
    }
    const integerLimit = Math.floor(limit);
    return Math.min(MAX_RECENT_LIMIT, Math.max(MIN_RECENT_LIMIT, integerLimit));
  }

  private validateUuid(value: unknown, fieldName: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${fieldName} must be a valid UUID.`);
    }
    const trimmed = value.trim();
    if (!UUID_REGEX.test(trimmed)) {
      throw new BadRequestException(`${fieldName} must be a valid UUID.`);
    }
    return trimmed;
  }

  async getRecentHistory(limit?: number): Promise<PlaybackHistoryEntryDto[]> {
    this.ensureDatabaseReady();
    const resolvedLimit = this.resolveRecentLimit(limit);

    const rows = await this.database.db
      .select({
        history: playbackHistory,
        track: tracks,
      })
      .from(playbackHistory)
      .innerJoin(tracks, eq(playbackHistory.trackId, tracks.id))
      .orderBy(desc(playbackHistory.playedAt))
      .limit(resolvedLimit);

    return rows.map((row) => this.toHistoryEntryDto(row.history, row.track));
  }

  async recordPlayback(
    dto: RecordPlaybackHistoryRequestDto,
  ): Promise<PlaybackHistoryEntryDto> {
    this.ensureDatabaseReady();

    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('Request body is required.');
    }

    const trackId = this.validateUuid(dto.trackId, 'trackId');

    if (
      typeof dto.durationListenedSeconds !== 'number' ||
      !Number.isFinite(dto.durationListenedSeconds) ||
      dto.durationListenedSeconds < 0
    ) {
      throw new BadRequestException(
        'durationListenedSeconds must be a non-negative finite number.',
      );
    }

    if (typeof dto.completed !== 'boolean') {
      throw new BadRequestException('completed must be a boolean.');
    }

    const durationListenedSeconds = Math.round(dto.durationListenedSeconds);

    const [track] = await this.database.db
      .select()
      .from(tracks)
      .where(eq(tracks.id, trackId))
      .limit(1);

    if (!track) {
      throw new NotFoundException(`Track not found: ${trackId}`);
    }

    const [inserted] = await this.database.db
      .insert(playbackHistory)
      .values({
        trackId,
        durationListenedSeconds,
        completed: dto.completed,
      })
      .returning();

    if (!inserted) {
      throw new BadRequestException('Failed to record playback history.');
    }

    return this.toHistoryEntryDto(inserted, track);
  }

  async getResumeState(): Promise<SavedPlaybackStateDto | null> {
    this.ensureDatabaseReady();

    const [row] = await this.database.db
      .select({
        state: playbackStates,
        track: tracks,
      })
      .from(playbackStates)
      .leftJoin(tracks, eq(playbackStates.currentTrackId, tracks.id))
      .where(eq(playbackStates.id, DEFAULT_PLAYBACK_STATE_ID))
      .limit(1);

    if (!row) {
      return null;
    }

    return this.toSavedPlaybackStateDto(row.state, row.track);
  }

  async saveResumeState(
    dto: UpdatePlaybackStateRequestDto,
  ): Promise<SavedPlaybackStateDto> {
    this.ensureDatabaseReady();

    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('Request body is required.');
    }

    if (
      typeof dto.positionSeconds !== 'number' ||
      !Number.isFinite(dto.positionSeconds) ||
      dto.positionSeconds < 0
    ) {
      throw new BadRequestException(
        'positionSeconds must be a non-negative finite number.',
      );
    }

    if (typeof dto.volume !== 'number' || !Number.isFinite(dto.volume)) {
      throw new BadRequestException('volume must be a finite number.');
    }

    if (typeof dto.isShuffled !== 'boolean') {
      throw new BadRequestException('isShuffled must be a boolean.');
    }

    if (
      typeof dto.repeatMode !== 'string' ||
      !REPEAT_MODE_VALUES.has(dto.repeatMode)
    ) {
      throw new BadRequestException(
        `repeatMode must be one of: ${Object.values(RepeatMode).join(', ')}.`,
      );
    }

    const positionSeconds = Math.round(dto.positionSeconds);
    const volume = Math.min(1, Math.max(0, dto.volume));

    let resolvedTrackId: string | null = null;
    let resolvedTrack: TrackRecord | null = null;

    if (dto.currentTrackId !== null && dto.currentTrackId !== undefined) {
      const validatedTrackId = this.validateUuid(
        dto.currentTrackId,
        'currentTrackId',
      );
      const [track] = await this.database.db
        .select()
        .from(tracks)
        .where(eq(tracks.id, validatedTrackId))
        .limit(1);

      if (track) {
        resolvedTrackId = track.id;
        resolvedTrack = track;
      }
    }

    const now = new Date();
    const [saved] = await this.database.db
      .insert(playbackStates)
      .values({
        id: DEFAULT_PLAYBACK_STATE_ID,
        currentTrackId: resolvedTrackId,
        positionSeconds,
        volume,
        isShuffled: dto.isShuffled,
        repeatMode: dto.repeatMode,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: playbackStates.id,
        set: {
          currentTrackId: resolvedTrackId,
          positionSeconds,
          volume,
          isShuffled: dto.isShuffled,
          repeatMode: dto.repeatMode,
          updatedAt: now,
        },
      })
      .returning();

    if (!saved) {
      throw new BadRequestException('Failed to save playback state.');
    }

    return this.toSavedPlaybackStateDto(saved, resolvedTrack);
  }
}
