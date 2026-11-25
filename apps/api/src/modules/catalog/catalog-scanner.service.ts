import fs from 'node:fs/promises';
import path from 'node:path';
import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { ScanResultDto } from '@my-spotify/shared-types';
import chokidar, { type FSWatcher } from 'chokidar';
import { eq, inArray } from 'drizzle-orm';
import { parseFile } from 'music-metadata';
import { DatabaseService } from '../../database/database.service.js';
import {
  libraryFolders,
  tracks,
  type LibraryFolderRecord,
} from '../../database/schema.js';
import {
  getAudioMimeType,
  isSupportedAudioFile,
  resolveAudioQuality,
} from './audio-formats.js';

@Injectable()
export class CatalogScannerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CatalogScannerService.name);
  private readonly watchers = new Map<string, FSWatcher>();
  private readonly pendingFolderScans = new Map<string, NodeJS.Timeout>();

  constructor(private readonly database: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    if (!this.database.isReady()) {
      return;
    }

    try {
      await this.registerEnvLibraryDirs();
      await this.scanAllLibraries();
      await this.syncWatchers();
    } catch (error) {
      this.logger.warn(
        `Initial library scan skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const timer of this.pendingFolderScans.values()) {
      clearTimeout(timer);
    }
    this.pendingFolderScans.clear();

    await Promise.all(
      [...this.watchers.values()].map(async (watcher) => {
        try {
          await watcher.close();
        } catch {
          // ignore watcher close errors on shutdown
        }
      }),
    );
    this.watchers.clear();
  }

  private isWatcherEnabled(): boolean {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      return false;
    }
    return process.env.ENABLE_FOLDER_WATCH !== 'false';
  }

  private async registerEnvLibraryDirs(): Promise<void> {
    const rawDirs = process.env.MUSIC_LIBRARY_DIRS ?? '';
    const dirs = rawDirs
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    for (const dir of dirs) {
      const resolvedPath = path.resolve(dir);
      try {
        const stat = await fs.stat(resolvedPath);
        if (!stat.isDirectory()) {
          this.logger.warn(`MUSIC_LIBRARY_DIRS entry is not a directory: ${resolvedPath}`);
          continue;
        }
      } catch {
        this.logger.warn(`MUSIC_LIBRARY_DIRS entry does not exist: ${resolvedPath}`);
        continue;
      }

      const name = path.basename(resolvedPath) || resolvedPath;
      await this.database.db
        .insert(libraryFolders)
        .values({
          name,
          path: resolvedPath,
          isWatching: true,
        })
        .onConflictDoNothing({ target: libraryFolders.path });
    }
  }

  async syncWatchers(): Promise<void> {
    if (!this.isWatcherEnabled() || !this.database.isReady()) {
      return;
    }

    const folders = await this.database.db.select().from(libraryFolders);
    const activeIds = new Set(folders.map((folder) => folder.id));

    for (const [folderId, watcher] of this.watchers.entries()) {
      if (!activeIds.has(folderId)) {
        await watcher.close();
        this.watchers.delete(folderId);
      }
    }

    for (const folder of folders) {
      if (!folder.isWatching || this.watchers.has(folder.id)) {
        continue;
      }
      await this.startWatchingFolder(folder);
    }
  }

  async startWatchingFolder(folder: LibraryFolderRecord): Promise<void> {
    if (!this.isWatcherEnabled()) {
      return;
    }

    await this.stopWatchingFolder(folder.id);

    const watcher = chokidar.watch(folder.path, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 800,
        pollInterval: 200,
      },
    });

    const handleFsEvent = (changedPath: string) => {
      if (!isSupportedAudioFile(changedPath)) {
        return;
      }
      this.scheduleFolderScan(folder.id);
    };

    watcher
      .on('add', handleFsEvent)
      .on('change', handleFsEvent)
      .on('unlink', handleFsEvent)
      .on('error', (error: unknown) => {
        this.logger.warn(
          `Watcher error on ${folder.path}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

    this.watchers.set(folder.id, watcher);
    this.logger.log(`Watching library folder: ${folder.path}`);
  }

  async stopWatchingFolder(folderId: string): Promise<void> {
    const existingTimer = this.pendingFolderScans.get(folderId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.pendingFolderScans.delete(folderId);
    }

    const existing = this.watchers.get(folderId);
    if (existing) {
      await existing.close();
      this.watchers.delete(folderId);
    }
  }

  private scheduleFolderScan(folderId: string): void {
    const existing = this.pendingFolderScans.get(folderId);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.pendingFolderScans.delete(folderId);
      void this.scanLibraries(folderId).catch((error: unknown) => {
        this.logger.warn(
          `Auto-scan failed for folder ${folderId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, 600);

    this.pendingFolderScans.set(folderId, timer);
  }

  async scanAllLibraries(): Promise<ScanResultDto> {
    return this.scanLibraries();
  }

  async scanLibraries(libraryFolderId?: string): Promise<ScanResultDto> {
    const startedAt = performance.now();
    const folders = libraryFolderId
      ? await this.database.db
          .select()
          .from(libraryFolders)
          .where(eq(libraryFolders.id, libraryFolderId))
      : await this.database.db.select().from(libraryFolders);

    let filesFound = 0;
    let addedCount = 0;
    let updatedCount = 0;
    let removedCount = 0;

    for (const folder of folders) {
      const folderResult = await this.scanSingleFolder(folder);
      filesFound += folderResult.filesFound;
      addedCount += folderResult.addedCount;
      updatedCount += folderResult.updatedCount;
      removedCount += folderResult.removedCount;
    }

    return {
      scannedFolders: folders.length,
      filesFound,
      addedCount,
      updatedCount,
      removedCount,
      durationMs: Math.max(1, Math.round(performance.now() - startedAt)),
      scannedAt: new Date().toISOString(),
    };
  }

  private async scanSingleFolder(folder: LibraryFolderRecord): Promise<{
    filesFound: number;
    addedCount: number;
    updatedCount: number;
    removedCount: number;
  }> {
    const audioFiles = await this.collectAudioFiles(folder.path);
    const existingTracks = await this.database.db
      .select()
      .from(tracks)
      .where(eq(tracks.libraryFolderId, folder.id));

    const existingByPath = new Map(
      existingTracks.map((track) => [track.filePath, track]),
    );
    const seenPaths = new Set<string>();

    let addedCount = 0;
    let updatedCount = 0;

    for (const filePath of audioFiles) {
      seenPaths.add(filePath);
      try {
        const stat = await fs.stat(filePath);
        const fileSizeBytes = stat.size;
        const fileMtimeMs = Math.floor(stat.mtimeMs);
        const existing = existingByPath.get(filePath);

        if (
          existing &&
          existing.fileSizeBytes === fileSizeBytes &&
          existing.fileMtimeMs === fileMtimeMs
        ) {
          continue;
        }

        const parsed = await this.extractTrackMetadata(filePath);
        const now = new Date();

        if (existing) {
          await this.database.db
            .update(tracks)
            .set({
              fileSizeBytes,
              fileMtimeMs,
              ...parsed,
              updatedAt: now,
            })
            .where(eq(tracks.id, existing.id));
          updatedCount += 1;
        } else {
          await this.database.db
            .insert(tracks)
            .values({
              libraryFolderId: folder.id,
              filePath,
              fileSizeBytes,
              fileMtimeMs,
              ...parsed,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: tracks.filePath,
              set: {
                libraryFolderId: folder.id,
                fileSizeBytes,
                fileMtimeMs,
                ...parsed,
                updatedAt: now,
              },
            });
          addedCount += 1;
        }
      } catch (error) {
        this.logger.warn(
          `Failed to index audio file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const staleTrackIds = existingTracks
      .filter((track) => !seenPaths.has(track.filePath))
      .map((track) => track.id);

    if (staleTrackIds.length > 0) {
      await this.database.db
        .delete(tracks)
        .where(inArray(tracks.id, staleTrackIds));
    }

    await this.database.db
      .update(libraryFolders)
      .set({
        lastScannedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(libraryFolders.id, folder.id));

    return {
      filesFound: audioFiles.length,
      addedCount,
      updatedCount,
      removedCount: staleTrackIds.length,
    };
  }

  private async collectAudioFiles(rootDir: string): Promise<string[]> {
    const results: string[] = [];

    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (entry.name.startsWith('.')) {
          continue;
        }
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && isSupportedAudioFile(fullPath)) {
          results.push(fullPath);
        }
      }
    };

    await walk(rootDir);
    results.sort();
    return results;
  }

  private async extractTrackMetadata(filePath: string) {
    const fallbackTitle = path.basename(filePath, path.extname(filePath));
    const fallbackAlbum = path.basename(path.dirname(filePath)) || 'Unknown Album';

    try {
      const metadata = await parseFile(filePath, { duration: true });
      const { common, format } = metadata;

      const bitrateKbps = format.bitrate
        ? Math.round(format.bitrate / 1000)
        : null;
      const sampleRateHz = format.sampleRate
        ? Math.round(format.sampleRate)
        : null;
      const durationSeconds = format.duration
        ? Math.max(0, Math.round(format.duration))
        : 0;
      const quality = resolveAudioQuality({
        lossless: format.lossless,
        bitrateKbps: bitrateKbps ?? undefined,
        filePath,
      });

      return {
        title: common.title?.trim() || fallbackTitle,
        artist:
          common.artist?.trim() ||
          common.albumartist?.trim() ||
          'Unknown Artist',
        album: common.album?.trim() || fallbackAlbum,
        trackNumber: common.track.no ?? null,
        year: common.year ?? null,
        genre: common.genre?.[0]?.trim() || null,
        durationSeconds,
        bitrateKbps,
        sampleRateHz,
        codec: format.codec?.trim() || format.container?.trim() || null,
        quality,
        mimeType: getAudioMimeType(filePath),
        hasCover: Boolean(common.picture && common.picture.length > 0),
      };
    } catch {
      return {
        title: fallbackTitle,
        artist: 'Unknown Artist',
        album: fallbackAlbum,
        trackNumber: null,
        year: null,
        genre: null,
        durationSeconds: 0,
        bitrateKbps: null,
        sampleRateHz: null,
        codec: path.extname(filePath).slice(1).toUpperCase() || null,
        quality: resolveAudioQuality({ filePath }),
        mimeType: getAudioMimeType(filePath),
        hasCover: false,
      };
    }
  }
}
