import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AudioQuality,
  type AddLibraryFolderRequestDto,
  type DirectoryBrowseResponseDto,
  type DirectoryEntryDto,
  type LibraryFolderDto,
  type ScanResultDto,
  type TrackDto,
} from '@my-spotify/shared-types';
import { and, asc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { parseFile } from 'music-metadata';
import { DatabaseService } from '../../database/database.service.js';
import {
  libraryFolders,
  tracks,
  type TrackRecord,
} from '../../database/schema.js';
import { isSupportedAudioFile } from './audio-formats.js';
import { CatalogScannerService } from './catalog-scanner.service.js';

export interface ListTracksFilters {
  search?: string;
  libraryFolderId?: string;
  liked?: boolean;
}

export interface TrackCoverData {
  data: Uint8Array;
  format: string;
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly database: DatabaseService,
    private readonly scanner: CatalogScannerService,
  ) {}

  private ensureDatabaseReady(): void {
    if (!this.database.isReady()) {
      throw new ServiceUnavailableException(
        'PostgreSQL database is not connected. Start PostgreSQL with "pnpm db:up".',
      );
    }
  }

  private toTrackDto(record: TrackRecord): TrackDto {
    const qualityValues = new Set<string>(Object.values(AudioQuality));
    const quality = qualityValues.has(record.quality)
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

  async listTracks(filters: ListTracksFilters = {}): Promise<TrackDto[]> {
    this.ensureDatabaseReady();

    const conditions: SQL[] = [];

    if (filters.libraryFolderId) {
      conditions.push(eq(tracks.libraryFolderId, filters.libraryFolderId));
    }

    if (filters.liked) {
      conditions.push(eq(tracks.isLiked, true));
    }

    const trimmedSearch = filters.search?.trim();
    if (trimmedSearch) {
      const pattern = `%${trimmedSearch}%`;
      const searchExpr = or(
        ilike(tracks.title, pattern),
        ilike(tracks.artist, pattern),
        ilike(tracks.album, pattern),
      );
      if (searchExpr) {
        conditions.push(searchExpr);
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await this.database.db
      .select()
      .from(tracks)
      .where(whereClause)
      .orderBy(asc(tracks.album), asc(tracks.trackNumber), asc(tracks.title));

    return rows.map((row) => this.toTrackDto(row));
  }

  async getTrackById(trackId: string): Promise<TrackDto> {
    const record = await this.getTrackRecordById(trackId);
    return this.toTrackDto(record);
  }

  async getTrackRecordById(trackId: string): Promise<TrackRecord> {
    this.ensureDatabaseReady();
    const [record] = await this.database.db
      .select()
      .from(tracks)
      .where(eq(tracks.id, trackId))
      .limit(1);

    if (!record) {
      throw new NotFoundException(`Track not found: ${trackId}`);
    }
    return record;
  }

  async toggleLike(trackId: string): Promise<TrackDto> {
    const record = await this.getTrackRecordById(trackId);
    const [updated] = await this.database.db
      .update(tracks)
      .set({
        isLiked: !record.isLiked,
        updatedAt: new Date(),
      })
      .where(eq(tracks.id, trackId))
      .returning();

    if (!updated) {
      throw new NotFoundException(`Track not found: ${trackId}`);
    }
    return this.toTrackDto(updated);
  }

  async getTrackCover(trackId: string): Promise<TrackCoverData> {
    const record = await this.getTrackRecordById(trackId);
    if (!record.hasCover) {
      throw new NotFoundException('Track does not have embedded cover art');
    }

    try {
      const metadata = await parseFile(record.filePath, { duration: false });
      const picture = metadata.common.picture?.[0];
      if (!picture) {
        throw new NotFoundException('Embedded cover art not found');
      }
      return {
        data: picture.data,
        format: picture.format || 'image/jpeg',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new NotFoundException('Unable to read cover art from audio file');
    }
  }

  async listLibraryFolders(): Promise<LibraryFolderDto[]> {
    this.ensureDatabaseReady();

    const rows = await this.database.db
      .select({
        id: libraryFolders.id,
        name: libraryFolders.name,
        path: libraryFolders.path,
        isWatching: libraryFolders.isWatching,
        lastScannedAt: libraryFolders.lastScannedAt,
        createdAt: libraryFolders.createdAt,
        trackCount: sql<number>`count(${tracks.id})::int`,
      })
      .from(libraryFolders)
      .leftJoin(tracks, eq(tracks.libraryFolderId, libraryFolders.id))
      .groupBy(libraryFolders.id)
      .orderBy(asc(libraryFolders.createdAt));

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      path: row.path,
      trackCount: Number(row.trackCount ?? 0),
      isWatching: row.isWatching,
      lastScannedAt: row.lastScannedAt ? row.lastScannedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async addLibraryFolder(dto: AddLibraryFolderRequestDto): Promise<{
    folder: LibraryFolderDto;
    scan: ScanResultDto;
  }> {
    this.ensureDatabaseReady();

    const rawPath = dto.path?.trim();
    if (!rawPath) {
      throw new BadRequestException('폴더 경로를 입력해 주세요.');
    }

    const expandedPath = rawPath.startsWith('~')
      ? path.join(os.homedir(), rawPath.slice(1))
      : rawPath;
    const resolvedPath = path.resolve(expandedPath);

    let stat;
    try {
      stat = await fs.stat(resolvedPath);
    } catch {
      throw new BadRequestException(
        `서버에서 해당 경로를 찾을 수 없습니다: ${resolvedPath}`,
      );
    }

    if (!stat.isDirectory()) {
      throw new BadRequestException(
        `유효한 폴더 경로가 아닙니다: ${resolvedPath}`,
      );
    }

    const name = dto.name?.trim() || path.basename(resolvedPath) || resolvedPath;

    const [inserted] = await this.database.db
      .insert(libraryFolders)
      .values({
        name,
        path: resolvedPath,
        isWatching: true,
      })
      .onConflictDoUpdate({
        target: libraryFolders.path,
        set: {
          name,
          isWatching: true,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!inserted) {
      throw new BadRequestException('라이브러리 폴더 등록에 실패했습니다.');
    }

    const scan = await this.scanner.scanLibraries(inserted.id);
    await this.scanner.startWatchingFolder(inserted);

    const folders = await this.listLibraryFolders();
    const folder = folders.find((item) => item.id === inserted.id);
    if (!folder) {
      throw new NotFoundException('등록된 라이브러리 폴더를 찾을 수 없습니다.');
    }

    return { folder, scan };
  }

  async removeLibraryFolder(folderId: string): Promise<void> {
    this.ensureDatabaseReady();
    await this.scanner.stopWatchingFolder(folderId);

    const deleted = await this.database.db
      .delete(libraryFolders)
      .where(eq(libraryFolders.id, folderId))
      .returning({ id: libraryFolders.id });

    if (deleted.length === 0) {
      throw new NotFoundException(`Library folder not found: ${folderId}`);
    }
  }

  async triggerScan(libraryFolderId?: string): Promise<ScanResultDto> {
    this.ensureDatabaseReady();
    return this.scanner.scanLibraries(libraryFolderId);
  }

  async browseDirectories(requestedPath?: string): Promise<DirectoryBrowseResponseDto> {
    const defaultRoot = process.env.LIBRARY_BROWSE_ROOT?.trim() || os.homedir();
    const rawTarget = requestedPath?.trim() || defaultRoot;
    const expanded = rawTarget.startsWith('~')
      ? path.join(os.homedir(), rawTarget.slice(1))
      : rawTarget;
    const currentPath = path.resolve(expanded);

    let stat;
    try {
      stat = await fs.stat(currentPath);
    } catch {
      throw new BadRequestException(`경로를 열 수 없습니다: ${currentPath}`);
    }

    if (!stat.isDirectory()) {
      throw new BadRequestException(`폴더가 아닙니다: ${currentPath}`);
    }

    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      throw new BadRequestException(
        `해당 폴더를 읽을 권한이 없습니다: ${currentPath}`,
      );
    }

    const directories: DirectoryEntryDto[] = [];
    let audioFileCount = 0;

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        directories.push({
          name: entry.name,
          path: entryPath,
        });
      } else if (entry.isFile() && isSupportedAudioFile(entryPath)) {
        audioFileCount += 1;
      }
    }

    directories.sort((a, b) => a.name.localeCompare(b.name));

    const parent = path.dirname(currentPath);
    const parentPath = parent !== currentPath ? parent : null;

    return {
      currentPath,
      parentPath,
      directories,
      audioFileCount,
    };
  }
}
