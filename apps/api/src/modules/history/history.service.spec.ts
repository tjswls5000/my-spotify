import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AudioQuality, RepeatMode } from '@my-spotify/shared-types';
import { vi } from 'vitest';
import type { DatabaseService } from '../../database/database.service.js';
import type {
  PlaybackHistoryRecord,
  PlaybackStateRecord,
  TrackRecord,
} from '../../database/schema.js';
import { HistoryController } from './history.controller.js';
import { HistoryService } from './history.service.js';

const TRACK_ID = '11111111-1111-4111-8111-111111111111';
const MISSING_TRACK_ID = '22222222-2222-4222-8222-222222222222';
const FOLDER_ID = '33333333-3333-4333-8333-333333333333';
const HISTORY_ID = '44444444-4444-4444-8444-444444444444';

function makeTrackRecord(overrides: Partial<TrackRecord> = {}): TrackRecord {
  const timestamp = new Date('2026-01-15T10:00:00.000Z');
  return {
    id: TRACK_ID,
    libraryFolderId: FOLDER_ID,
    filePath: '/music/song.flac',
    fileSizeBytes: 32_000_000,
    fileMtimeMs: 1_700_000_000_000,
    title: 'Night Drive',
    artist: 'Synth Wave',
    album: 'Midnight',
    trackNumber: 2,
    year: 2025,
    genre: 'Electronic',
    durationSeconds: 245,
    bitrateKbps: 1411,
    sampleRateHz: 44100,
    codec: 'FLAC',
    quality: AudioQuality.LOSSLESS,
    mimeType: 'audio/flac',
    hasCover: true,
    isLiked: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function makeHistoryRecord(
  overrides: Partial<PlaybackHistoryRecord> = {},
): PlaybackHistoryRecord {
  return {
    id: HISTORY_ID,
    trackId: TRACK_ID,
    playedAt: new Date('2026-02-01T12:30:00.000Z'),
    durationListenedSeconds: 180,
    completed: true,
    ...overrides,
  };
}

function makePlaybackStateRecord(
  overrides: Partial<PlaybackStateRecord> = {},
): PlaybackStateRecord {
  return {
    id: 'default',
    currentTrackId: TRACK_ID,
    positionSeconds: 95,
    volume: 0.75,
    isShuffled: true,
    repeatMode: RepeatMode.ONE,
    updatedAt: new Date('2026-02-02T08:15:00.000Z'),
    ...overrides,
  };
}

interface MockDbControls {
  databaseService: DatabaseService;
  isReady: ReturnType<typeof vi.fn<() => boolean>>;
  selectMock: ReturnType<typeof vi.fn>;
  insertMock: ReturnType<typeof vi.fn>;
  setSelectResult: (result: unknown) => void;
  enqueueSelectResult: (result: unknown) => void;
  setInsertResult: (result: unknown) => void;
  limitSpy: ReturnType<typeof vi.fn>;
  valuesSpy: ReturnType<typeof vi.fn>;
  onConflictDoUpdateSpy: ReturnType<typeof vi.fn>;
}

function createMockDatabaseService(): MockDbControls {
  let defaultSelectResult: unknown = [];
  const selectQueue: unknown[] = [];
  let insertResult: unknown = [];

  const nextSelectResult = () =>
    selectQueue.length > 0 ? selectQueue.shift() : defaultSelectResult;

  const limitSpy = vi.fn(() => Promise.resolve(nextSelectResult()));
  const orderBySpy = vi.fn(() => ({ limit: limitSpy }));
  const whereSpy = vi.fn(() => ({ limit: limitSpy }));
  const innerJoinSpy = vi.fn(() => ({ orderBy: orderBySpy }));
  const leftJoinSpy = vi.fn(() => ({ where: whereSpy }));
  const fromSpy = vi.fn(() => ({
    innerJoin: innerJoinSpy,
    leftJoin: leftJoinSpy,
    where: whereSpy,
    orderBy: orderBySpy,
    limit: limitSpy,
  }));
  const selectMock = vi.fn(() => ({ from: fromSpy }));

  const returningSpy = vi.fn(() => Promise.resolve(insertResult));
  const onConflictDoUpdateSpy = vi.fn(() => ({ returning: returningSpy }));
  const valuesSpy = vi.fn(() => ({
    returning: returningSpy,
    onConflictDoUpdate: onConflictDoUpdateSpy,
  }));
  const insertMock = vi.fn(() => ({ values: valuesSpy }));

  const isReady = vi.fn<() => boolean>(() => true);

  const databaseService = {
    isReady,
    db: {
      select: selectMock,
      insert: insertMock,
    },
  } as unknown as DatabaseService;

  return {
    databaseService,
    isReady,
    selectMock,
    insertMock,
    setSelectResult: (result: unknown) => {
      defaultSelectResult = result;
    },
    enqueueSelectResult: (result: unknown) => {
      selectQueue.push(result);
    },
    setInsertResult: (result: unknown) => {
      insertResult = result;
    },
    limitSpy,
    valuesSpy,
    onConflictDoUpdateSpy,
  };
}

describe('HistoryService', () => {
  let mockDb: MockDbControls;
  let service: HistoryService;

  beforeEach(() => {
    mockDb = createMockDatabaseService();
    service = new HistoryService(mockDb.databaseService);
  });

  describe('getRecentHistory', () => {
    it('throws ServiceUnavailableException when database is not ready', async () => {
      mockDb.isReady.mockReturnValue(false);

      await expect(service.getRecentHistory()).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(mockDb.selectMock).not.toHaveBeenCalled();
    });

    it('returns recent history entries with mapped track DTOs using default limit 50', async () => {
      const trackWithCover = makeTrackRecord();
      const trackWithoutCover = makeTrackRecord({
        id: MISSING_TRACK_ID,
        hasCover: false,
        quality: 'unknown-quality',
        trackNumber: null,
        year: null,
        genre: null,
        bitrateKbps: null,
        sampleRateHz: null,
        codec: null,
      });

      mockDb.setSelectResult([
        { history: makeHistoryRecord(), track: trackWithCover },
        {
          history: makeHistoryRecord({
            id: '55555555-5555-4555-8555-555555555555',
            trackId: MISSING_TRACK_ID,
            durationListenedSeconds: 45,
            completed: false,
          }),
          track: trackWithoutCover,
        },
      ]);

      const result = await service.getRecentHistory();

      expect(mockDb.limitSpy).toHaveBeenCalledWith(50);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: HISTORY_ID,
        trackId: TRACK_ID,
        playedAt: '2026-02-01T12:30:00.000Z',
        durationListenedSeconds: 180,
        completed: true,
        track: {
          id: TRACK_ID,
          libraryFolderId: FOLDER_ID,
          title: 'Night Drive',
          artist: 'Synth Wave',
          album: 'Midnight',
          trackNumber: 2,
          year: 2025,
          genre: 'Electronic',
          coverUrl: `/api/catalog/tracks/${TRACK_ID}/cover`,
          streamUrl: `/api/streaming/${TRACK_ID}`,
          durationSeconds: 245,
          quality: AudioQuality.LOSSLESS,
          bitrateKbps: 1411,
          sampleRateHz: 44100,
          codec: 'FLAC',
          fileSizeBytes: 32_000_000,
          isLiked: true,
          createdAt: '2026-01-15T10:00:00.000Z',
        },
      });
      expect(result[1]?.track?.coverUrl).toBeNull();
      expect(result[1]?.track?.quality).toBe(AudioQuality.STANDARD);
      expect(result[1]?.track?.trackNumber).toBeUndefined();
    });

    it('clamps limit to 1..200 and falls back to 50 for non-finite values', async () => {
      mockDb.setSelectResult([]);

      await service.getRecentHistory(0);
      expect(mockDb.limitSpy).toHaveBeenLastCalledWith(1);

      await service.getRecentHistory(-25);
      expect(mockDb.limitSpy).toHaveBeenLastCalledWith(1);

      await service.getRecentHistory(500);
      expect(mockDb.limitSpy).toHaveBeenLastCalledWith(200);

      await service.getRecentHistory(19.8);
      expect(mockDb.limitSpy).toHaveBeenLastCalledWith(19);

      await service.getRecentHistory(Number.NaN);
      expect(mockDb.limitSpy).toHaveBeenLastCalledWith(50);
    });
  });

  describe('recordPlayback', () => {
    it('throws ServiceUnavailableException when database is not ready', async () => {
      mockDb.isReady.mockReturnValue(false);

      await expect(
        service.recordPlayback({
          trackId: TRACK_ID,
          durationListenedSeconds: 120,
          completed: true,
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('rejects invalid trackId, negative/non-finite duration, and non-boolean completed', async () => {
      await expect(
        service.recordPlayback({
          trackId: 'not-a-uuid',
          durationListenedSeconds: 60,
          completed: false,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.recordPlayback({
          trackId: TRACK_ID,
          durationListenedSeconds: -1,
          completed: false,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.recordPlayback({
          trackId: TRACK_ID,
          durationListenedSeconds: Number.POSITIVE_INFINITY,
          completed: false,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.recordPlayback({
          trackId: TRACK_ID,
          durationListenedSeconds: 10,
          completed: 'yes' as unknown as boolean,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when track does not exist', async () => {
      mockDb.enqueueSelectResult([]);

      await expect(
        service.recordPlayback({
          trackId: MISSING_TRACK_ID,
          durationListenedSeconds: 30,
          completed: false,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(mockDb.insertMock).not.toHaveBeenCalled();
    });

    it('inserts rounded duration and returns created entry with track DTO', async () => {
      const track = makeTrackRecord();
      const inserted = makeHistoryRecord({
        durationListenedSeconds: 43,
        completed: true,
      });

      mockDb.enqueueSelectResult([track]);
      mockDb.setInsertResult([inserted]);

      const result = await service.recordPlayback({
        trackId: TRACK_ID,
        durationListenedSeconds: 42.6,
        completed: true,
      });

      expect(mockDb.valuesSpy).toHaveBeenCalledWith({
        trackId: TRACK_ID,
        durationListenedSeconds: 43,
        completed: true,
      });
      expect(result.id).toBe(HISTORY_ID);
      expect(result.durationListenedSeconds).toBe(43);
      expect(result.completed).toBe(true);
      expect(result.track?.id).toBe(TRACK_ID);
    });
  });

  describe('getResumeState', () => {
    it('throws ServiceUnavailableException when database is not ready', async () => {
      mockDb.isReady.mockReturnValue(false);

      await expect(service.getResumeState()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('returns null when no playback state row exists', async () => {
      mockDb.setSelectResult([]);

      const result = await service.getResumeState();

      expect(result).toBeNull();
    });

    it('returns saved playback state with currentTrack DTO when track exists', async () => {
      const state = makePlaybackStateRecord();
      const track = makeTrackRecord();
      mockDb.setSelectResult([{ state, track }]);

      const result = await service.getResumeState();

      expect(result).toEqual({
        currentTrackId: TRACK_ID,
        positionSeconds: 95,
        volume: 0.75,
        isShuffled: true,
        repeatMode: RepeatMode.ONE,
        updatedAt: '2026-02-02T08:15:00.000Z',
        currentTrack: expect.objectContaining({
          id: TRACK_ID,
          title: 'Night Drive',
          streamUrl: `/api/streaming/${TRACK_ID}`,
        }),
      });
    });

    it('returns currentTrack as null when track was deleted or currentTrackId is null', async () => {
      const state = makePlaybackStateRecord({
        currentTrackId: null,
        repeatMode: 'invalid-mode',
      });
      mockDb.setSelectResult([{ state, track: null }]);

      const result = await service.getResumeState();

      expect(result).toEqual({
        currentTrackId: null,
        positionSeconds: 95,
        volume: 0.75,
        isShuffled: true,
        repeatMode: RepeatMode.ALL,
        updatedAt: '2026-02-02T08:15:00.000Z',
        currentTrack: null,
      });
    });
  });

  describe('saveResumeState', () => {
    it('throws ServiceUnavailableException when database is not ready', async () => {
      mockDb.isReady.mockReturnValue(false);

      await expect(
        service.saveResumeState({
          currentTrackId: null,
          positionSeconds: 0,
          volume: 0.8,
          isShuffled: false,
          repeatMode: RepeatMode.ALL,
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('validates positionSeconds, volume, isShuffled, repeatMode, and currentTrackId UUID', async () => {
      await expect(
        service.saveResumeState({
          currentTrackId: null,
          positionSeconds: -5,
          volume: 0.5,
          isShuffled: false,
          repeatMode: RepeatMode.OFF,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.saveResumeState({
          currentTrackId: null,
          positionSeconds: 10,
          volume: Number.NaN,
          isShuffled: false,
          repeatMode: RepeatMode.OFF,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.saveResumeState({
          currentTrackId: null,
          positionSeconds: 10,
          volume: 0.5,
          isShuffled: 'false' as unknown as boolean,
          repeatMode: RepeatMode.OFF,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.saveResumeState({
          currentTrackId: null,
          positionSeconds: 10,
          volume: 0.5,
          isShuffled: false,
          repeatMode: 'loop' as RepeatMode,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.saveResumeState({
          currentTrackId: 'bad-uuid',
          positionSeconds: 10,
          volume: 0.5,
          isShuffled: false,
          repeatMode: RepeatMode.ALL,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('upserts playback state with rounded position, clamped volume, and resolved track', async () => {
      const track = makeTrackRecord();
      const saved = makePlaybackStateRecord({
        currentTrackId: TRACK_ID,
        positionSeconds: 64,
        volume: 1,
        isShuffled: true,
        repeatMode: RepeatMode.ALL,
      });

      mockDb.enqueueSelectResult([track]);
      mockDb.setInsertResult([saved]);

      const result = await service.saveResumeState({
        currentTrackId: TRACK_ID,
        positionSeconds: 63.7,
        volume: 1.5,
        isShuffled: true,
        repeatMode: RepeatMode.ALL,
      });

      expect(mockDb.valuesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'default',
          currentTrackId: TRACK_ID,
          positionSeconds: 64,
          volume: 1,
          isShuffled: true,
          repeatMode: RepeatMode.ALL,
        }),
      );
      expect(mockDb.onConflictDoUpdateSpy).toHaveBeenCalledTimes(1);
      expect(result.currentTrackId).toBe(TRACK_ID);
      expect(result.positionSeconds).toBe(64);
      expect(result.volume).toBe(1);
      expect(result.currentTrack?.id).toBe(TRACK_ID);
    });

    it('gracefully sets currentTrackId to null when track no longer exists', async () => {
      const saved = makePlaybackStateRecord({
        currentTrackId: null,
        positionSeconds: 12,
        volume: 0,
        isShuffled: false,
        repeatMode: RepeatMode.OFF,
      });

      mockDb.enqueueSelectResult([]);
      mockDb.setInsertResult([saved]);

      const result = await service.saveResumeState({
        currentTrackId: MISSING_TRACK_ID,
        positionSeconds: 12.2,
        volume: -0.3,
        isShuffled: false,
        repeatMode: RepeatMode.OFF,
      });

      expect(mockDb.valuesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'default',
          currentTrackId: null,
          positionSeconds: 12,
          volume: 0,
          isShuffled: false,
          repeatMode: RepeatMode.OFF,
        }),
      );
      expect(result.currentTrackId).toBeNull();
      expect(result.currentTrack).toBeNull();
    });

    it('skips track lookup when currentTrackId is null', async () => {
      const saved = makePlaybackStateRecord({
        currentTrackId: null,
        positionSeconds: 0,
        volume: 0.8,
        isShuffled: false,
        repeatMode: RepeatMode.ALL,
      });
      mockDb.setInsertResult([saved]);

      const result = await service.saveResumeState({
        currentTrackId: null,
        positionSeconds: 0,
        volume: 0.8,
        isShuffled: false,
        repeatMode: RepeatMode.ALL,
      });

      expect(mockDb.selectMock).not.toHaveBeenCalled();
      expect(result.currentTrackId).toBeNull();
      expect(result.currentTrack).toBeNull();
    });
  });
});

describe('HistoryController', () => {
  it('delegates endpoints to HistoryService and wraps responses in ApiResponse', async () => {
    const mockService = {
      getRecentHistory: vi.fn().mockResolvedValue([]),
      recordPlayback: vi.fn().mockResolvedValue({
        id: HISTORY_ID,
        trackId: TRACK_ID,
        playedAt: '2026-02-01T12:30:00.000Z',
        durationListenedSeconds: 90,
        completed: true,
      }),
      getResumeState: vi.fn().mockResolvedValue(null),
      saveResumeState: vi.fn().mockResolvedValue({
        currentTrackId: null,
        positionSeconds: 0,
        volume: 0.8,
        isShuffled: false,
        repeatMode: RepeatMode.ALL,
        updatedAt: '2026-02-02T08:15:00.000Z',
        currentTrack: null,
      }),
    };

    const controller = new HistoryController(
      mockService as unknown as HistoryService,
    );

    const recent = await controller.getRecentHistory('25');
    expect(mockService.getRecentHistory).toHaveBeenCalledWith(25);
    expect(recent).toEqual({ data: [] });

    await controller.getRecentHistory(undefined);
    expect(mockService.getRecentHistory).toHaveBeenLastCalledWith(undefined);

    const recorded = await controller.recordPlayback({
      trackId: TRACK_ID,
      durationListenedSeconds: 90,
      completed: true,
    });
    expect(recorded.data.id).toBe(HISTORY_ID);

    const resume = await controller.getResumeState();
    expect(resume).toEqual({ data: null });

    const saved = await controller.saveResumeState({
      currentTrackId: null,
      positionSeconds: 0,
      volume: 0.8,
      isShuffled: false,
      repeatMode: RepeatMode.ALL,
    });
    expect(saved.data.repeatMode).toBe(RepeatMode.ALL);
  });
});
