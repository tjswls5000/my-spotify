import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AudioQuality,
  type AddPlaylistTracksRequestDto,
  type CreatePlaylistRequestDto,
  type PlaylistDto,
  type ReorderPlaylistTracksRequestDto,
  type TrackDto,
  type UpdatePlaylistRequestDto,
} from '@my-spotify/shared-types';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service.js';
import {
  playlists,
  playlistTracks,
  tracks,
  type PlaylistRecord,
  type TrackRecord,
} from '../../database/schema.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AUDIO_QUALITY_VALUES = new Set<string>(Object.values(AudioQuality));

@Injectable()
export class PlaylistService {
  constructor(private readonly database: DatabaseService) {}

  private ensureDatabaseReady(): void {
    if (!this.database.isReady()) {
      throw new ServiceUnavailableException(
        'PostgreSQL database is not connected. Start PostgreSQL with "pnpm db:up".',
      );
    }
  }

  private assertValidUuid(value: unknown, label: string): asserts value is string {
    if (typeof value !== 'string' || !UUID_REGEX.test(value)) {
      throw new BadRequestException(`Invalid ${label}: ${String(value)}`);
    }
  }

  private normalizeCoverUrl(coverUrl: unknown): string | null {
    if (coverUrl === null || coverUrl === undefined) {
      return null;
    }
    if (typeof coverUrl !== 'string') {
      throw new BadRequestException('coverUrl must be a string or null.');
    }
    const trimmed = coverUrl.trim();
    return trimmed.length > 0 ? trimmed : null;
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

  private async getPlaylistRecordOrThrow(
    playlistId: string,
  ): Promise<PlaylistRecord> {
    const [playlist] = await this.database.db
      .select()
      .from(playlists)
      .where(eq(playlists.id, playlistId))
      .limit(1);

    if (!playlist) {
      throw new NotFoundException(`Playlist not found: ${playlistId}`);
    }

    return playlist;
  }

  private async buildPlaylistWithTracks(
    playlist: PlaylistRecord,
  ): Promise<PlaylistDto> {
    const joinedRows = await this.database.db
      .select({
        track: tracks,
      })
      .from(playlistTracks)
      .innerJoin(tracks, eq(playlistTracks.trackId, tracks.id))
      .where(eq(playlistTracks.playlistId, playlist.id))
      .orderBy(asc(playlistTracks.position), asc(playlistTracks.addedAt));

    const trackDtos = joinedRows.map((row) => this.toTrackDto(row.track));
    const totalDurationSeconds = trackDtos.reduce(
      (sum, track) => sum + track.durationSeconds,
      0,
    );
    const firstTrackCoverUrl = trackDtos[0]?.coverUrl ?? null;

    return {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      coverUrl: playlist.coverUrl || firstTrackCoverUrl,
      trackCount: trackDtos.length,
      totalDurationSeconds,
      tracks: trackDtos,
      createdAt: playlist.createdAt.toISOString(),
      updatedAt: playlist.updatedAt.toISOString(),
    };
  }

  async listPlaylists(): Promise<PlaylistDto[]> {
    this.ensureDatabaseReady();

    const playlistRows = await this.database.db
      .select()
      .from(playlists)
      .orderBy(desc(playlists.updatedAt), desc(playlists.createdAt));

    if (playlistRows.length === 0) {
      return [];
    }

    const playlistIds = playlistRows.map((row) => row.id);
    const trackRows = await this.database.db
      .select({
        playlistId: playlistTracks.playlistId,
        trackId: tracks.id,
        durationSeconds: tracks.durationSeconds,
        hasCover: tracks.hasCover,
      })
      .from(playlistTracks)
      .innerJoin(tracks, eq(playlistTracks.trackId, tracks.id))
      .where(inArray(playlistTracks.playlistId, playlistIds))
      .orderBy(asc(playlistTracks.position), asc(playlistTracks.addedAt));

    const statsByPlaylistId = new Map<
      string,
      {
        trackCount: number;
        totalDurationSeconds: number;
        firstTrackCoverUrl: string | null;
      }
    >();

    for (const row of trackRows) {
      const existing = statsByPlaylistId.get(row.playlistId);
      if (!existing) {
        statsByPlaylistId.set(row.playlistId, {
          trackCount: 1,
          totalDurationSeconds: row.durationSeconds,
          firstTrackCoverUrl: row.hasCover
            ? `/api/catalog/tracks/${row.trackId}/cover`
            : null,
        });
      } else {
        existing.trackCount += 1;
        existing.totalDurationSeconds += row.durationSeconds;
      }
    }

    return playlistRows.map((playlist) => {
      const stats = statsByPlaylistId.get(playlist.id);
      return {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        coverUrl: playlist.coverUrl || (stats?.firstTrackCoverUrl ?? null),
        trackCount: stats?.trackCount ?? 0,
        totalDurationSeconds: stats?.totalDurationSeconds ?? 0,
        createdAt: playlist.createdAt.toISOString(),
        updatedAt: playlist.updatedAt.toISOString(),
      };
    });
  }

  async getPlaylistById(playlistId: string): Promise<PlaylistDto> {
    this.ensureDatabaseReady();
    this.assertValidUuid(playlistId, 'playlistId');

    const playlist = await this.getPlaylistRecordOrThrow(playlistId);
    return this.buildPlaylistWithTracks(playlist);
  }

  async createPlaylist(dto: CreatePlaylistRequestDto): Promise<PlaylistDto> {
    this.ensureDatabaseReady();

    if (typeof dto?.name !== 'string' || dto.name.trim().length === 0) {
      throw new BadRequestException('Playlist name is required.');
    }

    if (dto.description !== undefined && typeof dto.description !== 'string') {
      throw new BadRequestException('Playlist description must be a string.');
    }

    const name = dto.name.trim();
    const description = dto.description?.trim() ?? '';
    const coverUrl = this.normalizeCoverUrl(dto.coverUrl);

    const [created] = await this.database.db
      .insert(playlists)
      .values({
        name,
        description,
        coverUrl,
      })
      .returning();

    if (!created) {
      throw new BadRequestException('Failed to create playlist.');
    }

    return {
      id: created.id,
      name: created.name,
      description: created.description,
      coverUrl: created.coverUrl,
      trackCount: 0,
      totalDurationSeconds: 0,
      tracks: [],
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  async updatePlaylist(
    playlistId: string,
    dto: UpdatePlaylistRequestDto,
  ): Promise<PlaylistDto> {
    this.ensureDatabaseReady();
    this.assertValidUuid(playlistId, 'playlistId');

    const updates: {
      name?: string;
      description?: string;
      coverUrl?: string | null;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (dto?.name !== undefined) {
      if (typeof dto.name !== 'string' || dto.name.trim().length === 0) {
        throw new BadRequestException('Playlist name cannot be empty.');
      }
      updates.name = dto.name.trim();
    }

    if (dto?.description !== undefined) {
      if (typeof dto.description !== 'string') {
        throw new BadRequestException('Playlist description must be a string.');
      }
      updates.description = dto.description.trim();
    }

    if (dto?.coverUrl !== undefined) {
      updates.coverUrl = this.normalizeCoverUrl(dto.coverUrl);
    }

    const [updated] = await this.database.db
      .update(playlists)
      .set(updates)
      .where(eq(playlists.id, playlistId))
      .returning();

    if (!updated) {
      throw new NotFoundException(`Playlist not found: ${playlistId}`);
    }

    return this.buildPlaylistWithTracks(updated);
  }

  async deletePlaylist(playlistId: string): Promise<void> {
    this.ensureDatabaseReady();
    this.assertValidUuid(playlistId, 'playlistId');

    const deleted = await this.database.db
      .delete(playlists)
      .where(eq(playlists.id, playlistId))
      .returning({ id: playlists.id });

    if (deleted.length === 0) {
      throw new NotFoundException(`Playlist not found: ${playlistId}`);
    }
  }

  async addTracksToPlaylist(
    playlistId: string,
    dto: AddPlaylistTracksRequestDto,
  ): Promise<PlaylistDto> {
    this.ensureDatabaseReady();
    this.assertValidUuid(playlistId, 'playlistId');

    if (!Array.isArray(dto?.trackIds) || dto.trackIds.length === 0) {
      throw new BadRequestException(
        'trackIds must be a non-empty array of valid UUIDs.',
      );
    }

    for (const trackId of dto.trackIds) {
      this.assertValidUuid(trackId, 'trackId');
    }

    const uniqueTrackIds = [...new Set(dto.trackIds)];

    await this.getPlaylistRecordOrThrow(playlistId);

    const existingTracks = await this.database.db
      .select({ id: tracks.id })
      .from(tracks)
      .where(inArray(tracks.id, uniqueTrackIds));

    const foundTrackIds = new Set(existingTracks.map((row) => row.id));
    const missingTrackIds = uniqueTrackIds.filter(
      (trackId) => !foundTrackIds.has(trackId),
    );
    if (missingTrackIds.length > 0) {
      throw new NotFoundException(
        `Tracks not found: ${missingTrackIds.join(', ')}`,
      );
    }

    const updatedPlaylist = await this.database.db.transaction(async (tx) => {
      const currentEntries = await tx
        .select({
          trackId: playlistTracks.trackId,
          position: playlistTracks.position,
        })
        .from(playlistTracks)
        .where(eq(playlistTracks.playlistId, playlistId))
        .orderBy(asc(playlistTracks.position), asc(playlistTracks.addedAt));

      const existingTrackIdSet = new Set(
        currentEntries.map((entry) => entry.trackId),
      );
      const maxPosition = currentEntries.reduce(
        (max, entry) => Math.max(max, entry.position),
        -1,
      );

      const newTrackIds = uniqueTrackIds.filter(
        (trackId) => !existingTrackIdSet.has(trackId),
      );

      if (newTrackIds.length > 0) {
        await tx
          .insert(playlistTracks)
          .values(
            newTrackIds.map((trackId, index) => ({
              playlistId,
              trackId,
              position: maxPosition + 1 + index,
            })),
          )
          .onConflictDoNothing({
            target: [playlistTracks.playlistId, playlistTracks.trackId],
          });
      }

      const [updated] = await tx
        .update(playlists)
        .set({ updatedAt: new Date() })
        .where(eq(playlists.id, playlistId))
        .returning();

      if (!updated) {
        throw new NotFoundException(`Playlist not found: ${playlistId}`);
      }

      return updated;
    });

    return this.buildPlaylistWithTracks(updatedPlaylist);
  }

  async removeTrackFromPlaylist(
    playlistId: string,
    trackId: string,
  ): Promise<PlaylistDto> {
    this.ensureDatabaseReady();
    this.assertValidUuid(playlistId, 'playlistId');
    this.assertValidUuid(trackId, 'trackId');

    await this.getPlaylistRecordOrThrow(playlistId);

    const updatedPlaylist = await this.database.db.transaction(async (tx) => {
      const deleted = await tx
        .delete(playlistTracks)
        .where(
          and(
            eq(playlistTracks.playlistId, playlistId),
            eq(playlistTracks.trackId, trackId),
          ),
        )
        .returning({ id: playlistTracks.id });

      if (deleted.length === 0) {
        throw new NotFoundException(
          `Track ${trackId} not found in playlist ${playlistId}`,
        );
      }

      const remainingEntries = await tx
        .select({
          id: playlistTracks.id,
          position: playlistTracks.position,
        })
        .from(playlistTracks)
        .where(eq(playlistTracks.playlistId, playlistId))
        .orderBy(asc(playlistTracks.position), asc(playlistTracks.addedAt));

      for (let index = 0; index < remainingEntries.length; index += 1) {
        const entry = remainingEntries[index];
        if (entry && entry.position !== index) {
          await tx
            .update(playlistTracks)
            .set({ position: index })
            .where(eq(playlistTracks.id, entry.id));
        }
      }

      const [updated] = await tx
        .update(playlists)
        .set({ updatedAt: new Date() })
        .where(eq(playlists.id, playlistId))
        .returning();

      if (!updated) {
        throw new NotFoundException(`Playlist not found: ${playlistId}`);
      }

      return updated;
    });

    return this.buildPlaylistWithTracks(updatedPlaylist);
  }

  async reorderPlaylistTracks(
    playlistId: string,
    dto: ReorderPlaylistTracksRequestDto,
  ): Promise<PlaylistDto> {
    this.ensureDatabaseReady();
    this.assertValidUuid(playlistId, 'playlistId');

    if (!Array.isArray(dto?.trackIds)) {
      throw new BadRequestException('trackIds must be an array of valid UUIDs.');
    }

    for (const trackId of dto.trackIds) {
      this.assertValidUuid(trackId, 'trackId');
    }

    const uniqueRequestedIds = [...new Set(dto.trackIds)];

    await this.getPlaylistRecordOrThrow(playlistId);

    const updatedPlaylist = await this.database.db.transaction(async (tx) => {
      const currentEntries = await tx
        .select({
          id: playlistTracks.id,
          trackId: playlistTracks.trackId,
          position: playlistTracks.position,
        })
        .from(playlistTracks)
        .where(eq(playlistTracks.playlistId, playlistId))
        .orderBy(asc(playlistTracks.position), asc(playlistTracks.addedAt));

      const entryByTrackId = new Map(
        currentEntries.map((entry) => [entry.trackId, entry]),
      );

      for (const trackId of uniqueRequestedIds) {
        if (!entryByTrackId.has(trackId)) {
          throw new BadRequestException(
            `Track ${trackId} is not in playlist ${playlistId}`,
          );
        }
      }

      const requestedSet = new Set(uniqueRequestedIds);
      const reorderedEntries = [
        ...uniqueRequestedIds
          .map((trackId) => entryByTrackId.get(trackId))
          .filter(
            (entry): entry is NonNullable<typeof entry> => entry !== undefined,
          ),
        ...currentEntries.filter((entry) => !requestedSet.has(entry.trackId)),
      ];

      for (let index = 0; index < reorderedEntries.length; index += 1) {
        const entry = reorderedEntries[index];
        if (entry && entry.position !== index) {
          await tx
            .update(playlistTracks)
            .set({ position: index })
            .where(eq(playlistTracks.id, entry.id));
        }
      }

      const [updated] = await tx
        .update(playlists)
        .set({ updatedAt: new Date() })
        .where(eq(playlists.id, playlistId))
        .returning();

      if (!updated) {
        throw new NotFoundException(`Playlist not found: ${playlistId}`);
      }

      return updated;
    });

    return this.buildPlaylistWithTracks(updatedPlaylist);
  }
}
