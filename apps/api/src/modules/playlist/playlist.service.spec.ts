import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AudioQuality } from '@my-spotify/shared-types';
import { vi } from 'vitest';
import type { DatabaseService } from '../../database/database.service.js';
import type { PlaylistRecord, TrackRecord } from '../../database/schema.js';
import { PlaylistController } from './playlist.controller.js';
import { PlaylistService } from './playlist.service.js';

const PLAYLIST_ID_1 = '11111111-1111-4111-8111-111111111111';
const PLAYLIST_ID_2 = '22222222-2222-4222-8222-222222222222';
const FOLDER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TRACK_ID_1 = '00000001-0000-4000-8000-000000000001';
const TRACK_ID_2 = '00000002-0000-4000-8000-000000000002';
const TRACK_ID_3 = '00000003-0000-4000-8000-000000000003';
const PT_ROW_1 = 'f0000001-0000-4000-8000-000000000001';
const PT_ROW_2 = 'f0000002-0000-4000-8000-000000000002';
const PT_ROW_3 = 'f0000003-0000-4000-8000-000000000003';

function makePlaylistRecord(
  overrides: Partial<PlaylistRecord> = {},
): PlaylistRecord {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: PLAYLIST_ID_1,
    name: 'Focus Mix',
    description: 'Deep work beats',
    coverUrl: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeTrackRecord(overrides: Partial<TrackRecord> = {}): TrackRecord {
  const now = new Date('2026-01-02T12:00:00.000Z');
  return {
    id: TRACK_ID_1,
    libraryFolderId: FOLDER_ID,
    filePath: '/music/track1.flac',
    fileSizeBytes: 24_000_000,
    fileMtimeMs: 1_700_000_000_000,
    title: 'Midnight Drive',
    artist: 'Synth Wave',
    album: 'Neon Nights',
    trackNumber: 1,
    year: 2025,
    genre: 'Electronic',
    durationSeconds: 215,
    bitrateKbps: 980,
    sampleRateHz: 44100,
    codec: 'FLAC',
    quality: AudioQuality.LOSSLESS,
    mimeType: 'audio/flac',
    hasCover: true,
    isLiked: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

interface RecordedInsert {
  values: unknown;
  onConflictDoNothingCalled: boolean;
}

interface RecordedUpdate {
  set: unknown;
}

interface MockDbHarness {
  database: DatabaseService;
  setReady: (ready: boolean) => void;
  queueSelect: (...results: unknown[]) => void;
  queueInsert: (...results: unknown[]) => void;
  queueUpdate: (...results: unknown[]) => void;
  queueDelete: (...results: unknown[]) => void;
  inserts: RecordedInsert[];
  updates: RecordedUpdate[];
  deleteCount: () => number;
}

function createMockDatabase(): MockDbHarness {
  let ready = true;
  const selectQueue: unknown[] = [];
  const insertQueue: unknown[] = [];
  const updateQueue: unknown[] = [];
  const deleteQueue: unknown[] = [];
  const inserts: RecordedInsert[] = [];
  const updates: RecordedUpdate[] = [];
  let deletes = 0;

  const makeQueryPromise = (
    getResult: () => unknown,
    extraMethods: Record<string, (...args: unknown[]) => unknown> = {},
  ) => {
    const promise = Promise.resolve().then(() => getResult());
    const chain = promise as unknown as Record<string, unknown>;
    const returnSelf = () => chain;

    for (const method of [
      'from',
      'innerJoin',
      'leftJoin',
      'where',
      'orderBy',
      'limit',
      'returning',
    ]) {
      chain[method] = vi.fn(returnSelf);
    }

    for (const [name, fn] of Object.entries(extraMethods)) {
      chain[name] = vi.fn((...args: unknown[]) => {
        fn(...args);
        return chain;
      });
    }

    return chain;
  };

  const db = {
    select: vi.fn(() =>
      makeQueryPromise(() => {
        if (selectQueue.length === 0) {
          throw new Error('Unexpected select() call in mock DB');
        }
        return selectQueue.shift();
      }),
    ),
    insert: vi.fn(() => {
      const record: RecordedInsert = {
        values: undefined,
        onConflictDoNothingCalled: false,
      };
      inserts.push(record);
      return makeQueryPromise(() => insertQueue.shift() ?? [], {
        values: (val: unknown) => {
          record.values = val;
        },
        onConflictDoNothing: () => {
          record.onConflictDoNothingCalled = true;
        },
      });
    }),
    update: vi.fn(() => {
      const record: RecordedUpdate = { set: undefined };
      updates.push(record);
      return makeQueryPromise(() => updateQueue.shift() ?? [], {
        set: (val: unknown) => {
          record.set = val;
        },
      });
    }),
    delete: vi.fn(() => {
      deletes += 1;
      return makeQueryPromise(() => deleteQueue.shift() ?? []);
    }),
    transaction: vi.fn(
      async <T>(callback: (tx: typeof db) => Promise<T>): Promise<T> =>
        callback(db),
    ),
  };

  const database = {
    isReady: () => ready,
    db,
  } as unknown as DatabaseService;

  return {
    database,
    setReady: (nextReady: boolean) => {
      ready = nextReady;
    },
    queueSelect: (...results: unknown[]) => {
      selectQueue.push(...results);
    },
    queueInsert: (...results: unknown[]) => {
      insertQueue.push(...results);
    },
    queueUpdate: (...results: unknown[]) => {
      updateQueue.push(...results);
    },
    queueDelete: (...results: unknown[]) => {
      deleteQueue.push(...results);
    },
    inserts,
    updates,
    deleteCount: () => deletes,
  };
}

describe('PlaylistService', () => {
  let harness: MockDbHarness;
  let service: PlaylistService;

  beforeEach(() => {
    harness = createMockDatabase();
    service = new PlaylistService(harness.database);
  });

  describe('database readiness & UUID validation', () => {
    it('throws ServiceUnavailableException when database is not ready', async () => {
      harness.setReady(false);
      await expect(service.listPlaylists()).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(service.createPlaylist({ name: 'Test' })).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('throws BadRequestException for invalid UUID parameters', async () => {
      await expect(service.getPlaylistById('not-a-uuid')).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        service.updatePlaylist('bad-id', { name: 'Valid' }),
      ).rejects.toThrow(BadRequestException);
      await expect(service.deletePlaylist('bad-id')).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        service.removeTrackFromPlaylist(PLAYLIST_ID_1, 'bad-track-id'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listPlaylists', () => {
    it('returns empty array when no playlists exist', async () => {
      harness.queueSelect([]);
      const result = await service.listPlaylists();
      expect(result).toEqual([]);
    });

    it('aggregates trackCount, totalDurationSeconds, and resolves coverUrl fallback', async () => {
      const playlistWithCustomCover = makePlaylistRecord({
        id: PLAYLIST_ID_1,
        name: 'Custom Cover',
        coverUrl: 'https://example.com/custom.jpg',
      });
      const playlistWithFallbackCover = makePlaylistRecord({
        id: PLAYLIST_ID_2,
        name: 'Fallback Cover',
        coverUrl: null,
      });

      harness.queueSelect(
        [playlistWithCustomCover, playlistWithFallbackCover],
        [
          {
            playlistId: PLAYLIST_ID_1,
            trackId: TRACK_ID_1,
            durationSeconds: 180,
            hasCover: true,
          },
          {
            playlistId: PLAYLIST_ID_2,
            trackId: TRACK_ID_2,
            durationSeconds: 200,
            hasCover: true,
          },
          {
            playlistId: PLAYLIST_ID_2,
            trackId: TRACK_ID_3,
            durationSeconds: 120,
            hasCover: false,
          },
        ],
      );

      const result = await service.listPlaylists();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: PLAYLIST_ID_1,
        name: 'Custom Cover',
        description: 'Deep work beats',
        coverUrl: 'https://example.com/custom.jpg',
        trackCount: 1,
        totalDurationSeconds: 180,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      expect(result[1]).toEqual({
        id: PLAYLIST_ID_2,
        name: 'Fallback Cover',
        description: 'Deep work beats',
        coverUrl: `/api/catalog/tracks/${TRACK_ID_2}/cover`,
        trackCount: 2,
        totalDurationSeconds: 320,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('returns null coverUrl when playlist has no custom cover and first track has no cover', async () => {
      const playlist = makePlaylistRecord({ id: PLAYLIST_ID_1, coverUrl: null });
      harness.queueSelect(
        [playlist],
        [
          {
            playlistId: PLAYLIST_ID_1,
            trackId: TRACK_ID_1,
            durationSeconds: 100,
            hasCover: false,
          },
          {
            playlistId: PLAYLIST_ID_1,
            trackId: TRACK_ID_2,
            durationSeconds: 150,
            hasCover: true,
          },
        ],
      );

      const [item] = await service.listPlaylists();
      expect(item?.coverUrl).toBeNull();
      expect(item?.trackCount).toBe(2);
      expect(item?.totalDurationSeconds).toBe(250);
    });
  });

  describe('getPlaylistById', () => {
    it('throws NotFoundException when playlist does not exist', async () => {
      harness.queueSelect([]);
      await expect(service.getPlaylistById(PLAYLIST_ID_1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('maps playlist and tracks to DTOs matching CatalogService format', async () => {
      const playlist = makePlaylistRecord({ id: PLAYLIST_ID_1, coverUrl: null });
      const track1 = makeTrackRecord({
        id: TRACK_ID_1,
        hasCover: true,
        durationSeconds: 215,
        quality: AudioQuality.LOSSLESS,
      });
      const track2 = makeTrackRecord({
        id: TRACK_ID_2,
        title: 'Unknown Quality Track',
        hasCover: false,
        durationSeconds: 185,
        quality: 'legacy-unknown',
        trackNumber: null,
        year: null,
        genre: null,
        bitrateKbps: null,
        sampleRateHz: null,
        codec: null,
      });

      harness.queueSelect([playlist], [{ track: track1 }, { track: track2 }]);

      const result = await service.getPlaylistById(PLAYLIST_ID_1);

      expect(result.coverUrl).toBe(`/api/catalog/tracks/${TRACK_ID_1}/cover`);
      expect(result.trackCount).toBe(2);
      expect(result.totalDurationSeconds).toBe(400);
      expect(result.tracks).toHaveLength(2);
      expect(result.tracks?.[0]).toEqual({
        id: TRACK_ID_1,
        libraryFolderId: FOLDER_ID,
        title: 'Midnight Drive',
        artist: 'Synth Wave',
        album: 'Neon Nights',
        trackNumber: 1,
        year: 2025,
        genre: 'Electronic',
        coverUrl: `/api/catalog/tracks/${TRACK_ID_1}/cover`,
        streamUrl: `/api/streaming/${TRACK_ID_1}`,
        durationSeconds: 215,
        quality: AudioQuality.LOSSLESS,
        bitrateKbps: 980,
        sampleRateHz: 44100,
        codec: 'FLAC',
        fileSizeBytes: 24_000_000,
        isLiked: true,
        createdAt: '2026-01-02T12:00:00.000Z',
      });
      expect(result.tracks?.[1]?.quality).toBe(AudioQuality.STANDARD);
      expect(result.tracks?.[1]?.coverUrl).toBeNull();
      expect(result.tracks?.[1]?.trackNumber).toBeUndefined();
      expect(result.tracks?.[1]?.codec).toBeUndefined();
    });
  });

  describe('createPlaylist', () => {
    it('rejects empty or whitespace-only name', async () => {
      await expect(service.createPlaylist({ name: '   ' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('trims name/description, normalizes blank coverUrl to null, and returns empty tracks array', async () => {
      const created = makePlaylistRecord({
        name: 'Road Trip',
        description: 'Highway classics',
        coverUrl: null,
      });
      harness.queueInsert([created]);

      const result = await service.createPlaylist({
        name: '  Road Trip  ',
        description: '  Highway classics  ',
        coverUrl: '   ',
      });

      expect(harness.inserts[0]?.values).toEqual({
        name: 'Road Trip',
        description: 'Highway classics',
        coverUrl: null,
      });
      expect(result).toEqual({
        id: PLAYLIST_ID_1,
        name: 'Road Trip',
        description: 'Highway classics',
        coverUrl: null,
        trackCount: 0,
        totalDurationSeconds: 0,
        tracks: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('updatePlaylist', () => {
    it('rejects empty name if provided', async () => {
      await expect(
        service.updatePlaylist(PLAYLIST_ID_1, { name: '  ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if playlist does not exist', async () => {
      harness.queueUpdate([]);
      await expect(
        service.updatePlaylist(PLAYLIST_ID_1, { name: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates fields and returns playlist with tracks', async () => {
      const updated = makePlaylistRecord({
        name: 'Chill Vibes',
        description: 'Updated description',
        coverUrl: 'https://example.com/new.png',
      });
      harness.queueUpdate([updated]);
      harness.queueSelect([{ track: makeTrackRecord() }]);

      const result = await service.updatePlaylist(PLAYLIST_ID_1, {
        name: '  Chill Vibes ',
        description: ' Updated description ',
        coverUrl: ' https://example.com/new.png ',
      });

      expect(harness.updates[0]?.set).toMatchObject({
        name: 'Chill Vibes',
        description: 'Updated description',
        coverUrl: 'https://example.com/new.png',
      });
      expect(result.name).toBe('Chill Vibes');
      expect(result.tracks).toHaveLength(1);
    });
  });

  describe('deletePlaylist', () => {
    it('throws NotFoundException when playlist does not exist', async () => {
      harness.queueDelete([]);
      await expect(service.deletePlaylist(PLAYLIST_ID_1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deletes existing playlist cleanly', async () => {
      harness.queueDelete([{ id: PLAYLIST_ID_1 }]);
      await expect(
        service.deletePlaylist(PLAYLIST_ID_1),
      ).resolves.toBeUndefined();
      expect(harness.deleteCount()).toBe(1);
    });
  });

  describe('addTracksToPlaylist', () => {
    it('validates non-empty array of valid UUIDs', async () => {
      await expect(
        service.addTracksToPlaylist(PLAYLIST_ID_1, { trackIds: [] }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.addTracksToPlaylist(PLAYLIST_ID_1, {
          trackIds: ['not-a-uuid'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when any requested track does not exist', async () => {
      harness.queueSelect([makePlaylistRecord()], [{ id: TRACK_ID_1 }]);

      await expect(
        service.addTracksToPlaylist(PLAYLIST_ID_1, {
          trackIds: [TRACK_ID_1, TRACK_ID_2],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('ignores duplicate tracks, appends only new tracks at maxPosition + 1 with onConflictDoNothing', async () => {
      const updatedPlaylist = makePlaylistRecord({
        updatedAt: new Date('2026-01-05T00:00:00.000Z'),
      });
      const track1 = makeTrackRecord({ id: TRACK_ID_1, durationSeconds: 100 });
      const track2 = makeTrackRecord({ id: TRACK_ID_2, durationSeconds: 150 });
      const track3 = makeTrackRecord({ id: TRACK_ID_3, durationSeconds: 200 });

      harness.queueSelect(
        // 1. playlist exists
        [makePlaylistRecord()],
        // 2. catalog tracks exist
        [{ id: TRACK_ID_1 }, { id: TRACK_ID_2 }, { id: TRACK_ID_3 }],
        // 3. current playlist_tracks inside tx (TRACK_ID_1 already at position 0)
        [{ trackId: TRACK_ID_1, position: 0 }],
        // 4. buildPlaylistWithTracks final joined query
        [{ track: track1 }, { track: track2 }, { track: track3 }],
      );
      harness.queueUpdate([updatedPlaylist]);

      const result = await service.addTracksToPlaylist(PLAYLIST_ID_1, {
        trackIds: [TRACK_ID_1, TRACK_ID_2, TRACK_ID_2, TRACK_ID_3],
      });

      expect(harness.inserts).toHaveLength(1);
      expect(harness.inserts[0]?.onConflictDoNothingCalled).toBe(true);
      expect(harness.inserts[0]?.values).toEqual([
        { playlistId: PLAYLIST_ID_1, trackId: TRACK_ID_2, position: 1 },
        { playlistId: PLAYLIST_ID_1, trackId: TRACK_ID_3, position: 2 },
      ]);
      expect(result.trackCount).toBe(3);
      expect(result.totalDurationSeconds).toBe(450);
    });

    it('skips insert when all requested tracks are already in the playlist', async () => {
      const updatedPlaylist = makePlaylistRecord();
      const track1 = makeTrackRecord({ id: TRACK_ID_1, durationSeconds: 100 });

      harness.queueSelect(
        [makePlaylistRecord()],
        [{ id: TRACK_ID_1 }],
        [{ trackId: TRACK_ID_1, position: 0 }],
        [{ track: track1 }],
      );
      harness.queueUpdate([updatedPlaylist]);

      const result = await service.addTracksToPlaylist(PLAYLIST_ID_1, {
        trackIds: [TRACK_ID_1],
      });

      expect(harness.inserts).toHaveLength(0);
      expect(harness.updates).toHaveLength(1);
      expect(result.trackCount).toBe(1);
    });
  });

  describe('removeTrackFromPlaylist', () => {
    it('throws NotFoundException if track is not in the playlist', async () => {
      harness.queueSelect([makePlaylistRecord()]);
      harness.queueDelete([]);

      await expect(
        service.removeTrackFromPlaylist(PLAYLIST_ID_1, TRACK_ID_2),
      ).rejects.toThrow(NotFoundException);
    });

    it('removes track, re-compacts remaining positions to 0..n-1, and updates updatedAt', async () => {
      const updatedPlaylist = makePlaylistRecord();
      const track1 = makeTrackRecord({ id: TRACK_ID_1, durationSeconds: 100 });
      const track3 = makeTrackRecord({ id: TRACK_ID_3, durationSeconds: 200 });

      harness.queueSelect(
        // 1. playlist exists
        [makePlaylistRecord()],
        // 2. remaining playlist_tracks after removing position 1 (leaves pos 0 and pos 2)
        [
          { id: PT_ROW_1, position: 0 },
          { id: PT_ROW_3, position: 2 },
        ],
        // 3. buildPlaylistWithTracks
        [{ track: track1 }, { track: track3 }],
      );
      harness.queueDelete([{ id: PT_ROW_2 }]);
      // Update #1: compact PT_ROW_3 from position 2 -> 1; Update #2: playlist.updatedAt
      harness.queueUpdate([], [updatedPlaylist]);

      const result = await service.removeTrackFromPlaylist(
        PLAYLIST_ID_1,
        TRACK_ID_2,
      );

      expect(harness.updates).toHaveLength(2);
      expect(harness.updates[0]?.set).toEqual({ position: 1 });
      expect(harness.updates[1]?.set).toHaveProperty('updatedAt');
      expect(result.trackCount).toBe(2);
      expect(result.tracks?.map((t) => t.id)).toEqual([TRACK_ID_1, TRACK_ID_3]);
    });
  });

  describe('reorderPlaylistTracks', () => {
    it('rejects non-array or invalid UUIDs', async () => {
      await expect(
        service.reorderPlaylistTracks(PLAYLIST_ID_1, {
          trackIds: ['invalid'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects trackIds that are not members of the playlist', async () => {
      harness.queueSelect(
        [makePlaylistRecord()],
        [{ id: PT_ROW_1, trackId: TRACK_ID_1, position: 0 }],
      );

      await expect(
        service.reorderPlaylistTracks(PLAYLIST_ID_1, {
          trackIds: [TRACK_ID_2],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('reorders tracks according to trackIds and keeps unmentioned tracks afterward', async () => {
      const updatedPlaylist = makePlaylistRecord();
      const track1 = makeTrackRecord({ id: TRACK_ID_1 });
      const track2 = makeTrackRecord({ id: TRACK_ID_2 });
      const track3 = makeTrackRecord({ id: TRACK_ID_3 });

      harness.queueSelect(
        // 1. playlist exists
        [makePlaylistRecord()],
        // 2. current playlist tracks: [T1(0), T2(1), T3(2)]
        [
          { id: PT_ROW_1, trackId: TRACK_ID_1, position: 0 },
          { id: PT_ROW_2, trackId: TRACK_ID_2, position: 1 },
          { id: PT_ROW_3, trackId: TRACK_ID_3, position: 2 },
        ],
        // 3. buildPlaylistWithTracks (resulting order: T3, T1, T2)
        [{ track: track3 }, { track: track1 }, { track: track2 }],
      );
      // 3 position updates (T3->0, T1->1, T2->2) + 1 playlist updatedAt update
      harness.queueUpdate([], [], [], [updatedPlaylist]);

      // Partial reorder requesting T3 first -> expected final order [T3(0), T1(1), T2(2)]
      const result = await service.reorderPlaylistTracks(PLAYLIST_ID_1, {
        trackIds: [TRACK_ID_3],
      });

      expect(harness.updates).toHaveLength(4);
      expect(harness.updates[0]?.set).toEqual({ position: 0 });
      expect(harness.updates[1]?.set).toEqual({ position: 1 });
      expect(harness.updates[2]?.set).toEqual({ position: 2 });
      expect(harness.updates[3]?.set).toHaveProperty('updatedAt');
      expect(result.tracks?.map((t) => t.id)).toEqual([
        TRACK_ID_3,
        TRACK_ID_1,
        TRACK_ID_2,
      ]);
    });
  });

  describe('PlaylistController', () => {
    it('wraps service results in ApiResponse and returns void on delete', async () => {
      const controller = new PlaylistController(service);
      const playlist = makePlaylistRecord();
      harness.queueSelect([playlist], []);
      harness.queueDelete([{ id: PLAYLIST_ID_1 }]);

      const getRes = await controller.getPlaylist(PLAYLIST_ID_1);
      expect(getRes.data.id).toBe(PLAYLIST_ID_1);
      expect(getRes.data.tracks).toEqual([]);

      await expect(
        controller.deletePlaylist(PLAYLIST_ID_1),
      ).resolves.toBeUndefined();
    });
  });
});
