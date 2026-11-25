import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RepeatMode,
  ServiceStatus,
  type LibraryFolderDto,
  type PlaybackStateDto,
  type ScanResultDto,
  type TrackDto,
} from '@my-spotify/shared-types';
import {
  fetchApiHealth,
  fetchLibraries,
  fetchTracks,
  getStoredServerBaseUrl,
  resolveMediaUrl,
  saveServerBaseUrl,
  toggleTrackLike,
  triggerLibraryScan,
} from './api/client.ts';
import { LibraryManagerModal } from './components/LibraryManagerModal.tsx';
import { PlayerBar } from './components/PlayerBar.tsx';
import {
  Sidebar,
  type ApiHealthState,
  type NavSection,
} from './components/Sidebar.tsx';
import { TrackList } from './components/TrackList.tsx';

export function App() {
  const [serverBaseUrl, setServerBaseUrl] = useState<string>(() =>
    getStoredServerBaseUrl(),
  );
  const [activeNav, setActiveNav] = useState<NavSection>('all');
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [libraries, setLibraries] = useState<LibraryFolderDto[]>([]);
  const [tracks, setTracks] = useState<TrackDto[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState<boolean>(true);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanBanner, setScanBanner] = useState<string | null>(null);
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState<boolean>(false);

  const [previousVolume, setPreviousVolume] = useState<number>(0.8);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const [playback, setPlayback] = useState<PlaybackStateDto>({
    currentTrackId: null,
    isPlaying: false,
    positionSeconds: 0,
    volume: 0.8,
    isShuffled: false,
    repeatMode: RepeatMode.ALL,
  });

  const [apiHealth, setApiHealth] = useState<ApiHealthState>({
    status: 'loading',
    payload: null,
    latencyMs: null,
    errorMessage: null,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const loadedTrackIdRef = useRef<string | null>(null);
  const loadedServerUrlRef = useRef<string>(serverBaseUrl);

  const isApiConnected = apiHealth.status === 'connected';
  const isDbConnected =
    apiHealth.payload?.checks?.some(
      (check) => check.name === 'postgres' && check.status === ServiceStatus.OK,
    ) ?? false;

  const refreshServerData = useCallback(
    async (baseUrl: string, signal?: AbortSignal) => {
      try {
        const healthResult = await fetchApiHealth(baseUrl, signal);
        setApiHealth({
          status: 'connected',
          payload: healthResult.data,
          latencyMs: healthResult.latencyMs,
          errorMessage: null,
        });

        const dbOk =
          healthResult.data.checks?.some(
            (check) =>
              check.name === 'postgres' && check.status === ServiceStatus.OK,
          ) ?? false;

        if (!dbOk) {
          setLibraries([]);
          setTracks([]);
          setIsLoadingTracks(false);
          return;
        }

        const [fetchedLibraries, fetchedTracks] = await Promise.all([
          fetchLibraries(baseUrl, signal),
          fetchTracks(baseUrl, undefined, signal),
        ]);

        setLibraries(fetchedLibraries);
        setTracks(fetchedTracks);
        setIsLoadingTracks(false);
      } catch (error) {
        if (signal?.aborted) {
          return;
        }
        setApiHealth({
          status: 'error',
          payload: null,
          latencyMs: null,
          errorMessage:
            error instanceof Error
              ? error.message
              : '스트리밍 서버에 연결할 수 없습니다.',
        });
        setLibraries([]);
        setTracks([]);
        setIsLoadingTracks(false);
      }
    },
    [],
  );

  // Initial load & reload when serverBaseUrl changes
  useEffect(() => {
    const controller = new AbortController();

    fetchApiHealth(serverBaseUrl, controller.signal)
      .then(async (healthResult) => {
        setApiHealth({
          status: 'connected',
          payload: healthResult.data,
          latencyMs: healthResult.latencyMs,
          errorMessage: null,
        });

        const dbOk =
          healthResult.data.checks?.some(
            (check) =>
              check.name === 'postgres' && check.status === ServiceStatus.OK,
          ) ?? false;

        if (!dbOk) {
          setLibraries([]);
          setTracks([]);
          setIsLoadingTracks(false);
          return;
        }

        const [fetchedLibraries, fetchedTracks] = await Promise.all([
          fetchLibraries(serverBaseUrl, controller.signal),
          fetchTracks(serverBaseUrl, undefined, controller.signal),
        ]);

        setLibraries(fetchedLibraries);
        setTracks(fetchedTracks);
        setIsLoadingTracks(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setApiHealth({
          status: 'error',
          payload: null,
          latencyMs: null,
          errorMessage:
            error instanceof Error
              ? error.message
              : '스트리밍 서버에 연결할 수 없습니다.',
        });
        setLibraries([]);
        setTracks([]);
        setIsLoadingTracks(false);
      });

    return () => controller.abort();
  }, [serverBaseUrl]);

  const handleRefreshHealth = useCallback(() => {
    setApiHealth((prev) => ({
      ...prev,
      status: 'loading',
      errorMessage: null,
    }));
    void refreshServerData(serverBaseUrl);
  }, [refreshServerData, serverBaseUrl]);

  const handleChangeServerBaseUrl = useCallback((rawUrl: string) => {
    const nextUrl = saveServerBaseUrl(rawUrl);
    setIsLoadingTracks(true);
    setPlayback((prev) => ({
      ...prev,
      currentTrackId: null,
      isPlaying: false,
      positionSeconds: 0,
    }));
    setSelectedLibraryId(null);
    setActiveNav('all');
    setServerBaseUrl(nextUrl);
  }, []);

  const visibleTracks = useMemo(() => {
    let filtered = tracks;

    if (activeNav === 'liked') {
      filtered = filtered.filter((track) => track.isLiked);
    } else if (activeNav === 'folder' && selectedLibraryId) {
      filtered = filtered.filter(
        (track) => track.libraryFolderId === selectedLibraryId,
      );
    }

    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return filtered;
    }

    return filtered.filter(
      (track) =>
        track.title.toLowerCase().includes(query) ||
        track.artist.toLowerCase().includes(query) ||
        track.album.toLowerCase().includes(query),
    );
  }, [activeNav, searchQuery, selectedLibraryId, tracks]);

  const likedTrackCount = useMemo(
    () => tracks.filter((track) => track.isLiked).length,
    [tracks],
  );

  const currentTrack = useMemo(
    () =>
      tracks.find((track) => track.id === playback.currentTrackId) ?? null,
    [playback.currentTrackId, tracks],
  );

  const selectedLibrary = useMemo(
    () => libraries.find((library) => library.id === selectedLibraryId) ?? null,
    [libraries, selectedLibraryId],
  );

  // Sync HTML5 <audio> element volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = playback.volume;
    }
  }, [playback.volume]);

  // Sync HTML5 <audio> src & playback state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (!currentTrack) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      loadedTrackIdRef.current = null;
      return;
    }

    const streamSrc = resolveMediaUrl(serverBaseUrl, currentTrack.streamUrl);
    const trackChanged =
      loadedTrackIdRef.current !== currentTrack.id ||
      loadedServerUrlRef.current !== serverBaseUrl;

    if (trackChanged && streamSrc) {
      loadedTrackIdRef.current = currentTrack.id;
      loadedServerUrlRef.current = serverBaseUrl;
      audio.src = streamSrc;
      audio.load();
    }

    if (playback.isPlaying) {
      void audio.play().catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setPlaybackError('오디오 재생을 시작할 수 없습니다.');
        setPlayback((prev) => ({ ...prev, isPlaying: false }));
      });
    } else {
      audio.pause();
    }
  }, [currentTrack, playback.isPlaying, serverBaseUrl]);

  const stepTrack = useCallback(
    (direction: 1 | -1) => {
      const queue = visibleTracks.length > 0 ? visibleTracks : tracks;
      if (queue.length === 0) {
        return;
      }

      setPlaybackError(null);
      setPlayback((prev) => {
        const currentIdx = queue.findIndex(
          (track) => track.id === prev.currentTrackId,
        );

        let nextIdx: number;
        if (prev.isShuffled && queue.length > 1) {
          const offset = Math.floor(Math.random() * (queue.length - 1)) + 1;
          nextIdx = (Math.max(0, currentIdx) + offset) % queue.length;
        } else if (currentIdx === -1) {
          nextIdx = 0;
        } else {
          nextIdx = (currentIdx + direction + queue.length) % queue.length;
        }

        const nextTrack = queue[nextIdx];
        if (!nextTrack) {
          return prev;
        }

        return {
          ...prev,
          currentTrackId: nextTrack.id,
          positionSeconds: 0,
          isPlaying: true,
        };
      });
    },
    [tracks, visibleTracks],
  );

  // Spacebar shortcut for play/pause
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if (event.code === 'Space' && !isEditable && !isLibraryModalOpen) {
        event.preventDefault();
        setPlayback((prev) => {
          if (!prev.currentTrackId) {
            return prev;
          }
          return { ...prev, isPlaying: !prev.isPlaying };
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLibraryModalOpen]);

  const handleAudioEnded = () => {
    const audio = audioRef.current;
    if (playback.repeatMode === RepeatMode.ONE && audio) {
      audio.currentTime = 0;
      void audio.play();
      return;
    }

    const queue = visibleTracks.length > 0 ? visibleTracks : tracks;
    const currentIdx = queue.findIndex(
      (track) => track.id === playback.currentTrackId,
    );
    const isLastTrack =
      currentIdx !== -1 && currentIdx === queue.length - 1;

    if (playback.repeatMode === RepeatMode.OFF && isLastTrack && !playback.isShuffled) {
      setPlayback((prev) => ({
        ...prev,
        isPlaying: false,
        positionSeconds: 0,
      }));
      return;
    }

    stepTrack(1);
  };

  const handleSelectNav = (nav: NavSection) => {
    setActiveNav(nav);
    if (nav !== 'folder') {
      setSelectedLibraryId(null);
    }
    if (nav === 'search') {
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  };

  const handleSelectLibrary = (libraryId: string) => {
    setSelectedLibraryId(libraryId);
    setActiveNav('folder');
  };

  const handleSelectTrack = (track: TrackDto) => {
    setPlaybackError(null);
    setPlayback((prev) => {
      if (prev.currentTrackId === track.id) {
        return { ...prev, isPlaying: !prev.isPlaying };
      }
      setAudioDuration(track.durationSeconds);
      return {
        ...prev,
        currentTrackId: track.id,
        positionSeconds: 0,
        isPlaying: true,
      };
    });
  };

  const handleTogglePlayList = () => {
    const firstTrack = visibleTracks[0];
    if (!firstTrack) {
      return;
    }

    const isInCurrentList = visibleTracks.some(
      (track) => track.id === playback.currentTrackId,
    );

    if (isInCurrentList) {
      setPlayback((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
      return;
    }

    setPlaybackError(null);
    setAudioDuration(firstTrack.durationSeconds);
    setPlayback((prev) => ({
      ...prev,
      currentTrackId: firstTrack.id,
      positionSeconds: 0,
      isPlaying: true,
    }));
  };

  const handleSeek = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
    }
    setPlayback((prev) => ({ ...prev, positionSeconds: seconds }));
  };

  const handleToggleLike = async (trackId: string) => {
    try {
      const updated = await toggleTrackLike(serverBaseUrl, trackId);
      setTracks((prev) =>
        prev.map((track) => (track.id === updated.id ? updated : track)),
      );
    } catch {
      // ignore transient toggle error
    }
  };

  const handleCycleRepeat = () => {
    setPlayback((prev) => {
      const order: RepeatMode[] = [
        RepeatMode.OFF,
        RepeatMode.ALL,
        RepeatMode.ONE,
      ];
      const currentIndex = order.indexOf(prev.repeatMode);
      const nextMode =
        order[(currentIndex + 1) % order.length] ?? RepeatMode.OFF;
      return { ...prev, repeatMode: nextMode };
    });
  };

  const handleVolumeChange = (nextVolume: number) => {
    const clamped = Math.max(0, Math.min(1, nextVolume));
    if (clamped > 0) {
      setPreviousVolume(clamped);
    }
    setPlayback((prev) => ({ ...prev, volume: clamped }));
  };

  const handleToggleMute = () => {
    setPlayback((prev) => {
      if (prev.volume > 0) {
        setPreviousVolume(prev.volume);
        return { ...prev, volume: 0 };
      }
      return { ...prev, volume: previousVolume || 0.75 };
    });
  };

  const showScanSummary = (scan?: ScanResultDto) => {
    if (!scan) {
      return;
    }
    setScanBanner(
      `스캔 완료 · ${scan.filesFound}곡 확인 (+${scan.addedCount} 추가 / ${scan.updatedCount} 업데이트 / -${scan.removedCount} 삭제 · ${scan.durationMs}ms)`,
    );
    window.setTimeout(() => setScanBanner(null), 5000);
  };

  const handleLibraryChanged = async (scanResult?: ScanResultDto) => {
    await refreshServerData(serverBaseUrl);
    showScanSummary(scanResult);
  };

  const handleRescan = async () => {
    setIsScanning(true);
    try {
      const targetFolderId =
        activeNav === 'folder' ? (selectedLibraryId ?? undefined) : undefined;
      const scan = await triggerLibraryScan(serverBaseUrl, targetFolderId);
      await refreshServerData(serverBaseUrl);
      showScanSummary(scan);
    } finally {
      setIsScanning(false);
    }
  };

  const heroMeta = (() => {
    if (activeNav === 'liked') {
      return {
        eyebrow: 'PERSONAL COLLECTION',
        title: '좋아요 표시한 곡',
        description:
          '스트리밍 서버의 음원 중 즐겨찾기 표시한 트랙만 모아 재생합니다.',
        folderPath: null,
      };
    }
    if (activeNav === 'folder' && selectedLibrary) {
      return {
        eyebrow: selectedLibrary.isWatching
          ? 'AUTO-SYNCED LIBRARY FOLDER'
          : 'LIBRARY FOLDER',
        title: selectedLibrary.name,
        description:
          '선택한 서버 폴더의 실제 음원 파일을 HTTP Range 스트리밍으로 바로 재생합니다.',
        folderPath: selectedLibrary.path,
      };
    }
    return {
      eyebrow: 'STREAMING SERVER LIBRARY',
      title: '내 스트리밍 라이브러리',
      description:
        '연결된 스트리밍 서버에 실제로 존재하는 음원만 자동으로 인덱싱되어 표시됩니다.',
      folderPath: null,
    };
  })();

  return (
    <div className="app-shell">
      <audio
        ref={audioRef}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const nextDuration = event.currentTarget.duration;
          if (Number.isFinite(nextDuration) && nextDuration > 0) {
            setAudioDuration(nextDuration);
          }
          setIsBuffering(false);
        }}
        onTimeUpdate={(event) => {
          setPlayback((prev) => ({
            ...prev,
            positionSeconds: event.currentTarget.currentTime,
          }));
        }}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          setIsBuffering(false);
          setPlaybackError(null);
        }}
        onEnded={handleAudioEnded}
        onError={() => {
          setIsBuffering(false);
          if (currentTrack) {
            setPlaybackError('스트리밍 파일을 불러오지 못했습니다.');
            setPlayback((prev) => ({ ...prev, isPlaying: false }));
          }
        }}
      />

      <div className="workspace-grid">
        <Sidebar
          activeNav={activeNav}
          onSelectNav={handleSelectNav}
          libraries={libraries}
          selectedLibraryId={selectedLibraryId}
          onSelectLibrary={handleSelectLibrary}
          totalTrackCount={tracks.length}
          likedTrackCount={likedTrackCount}
          serverBaseUrl={serverBaseUrl}
          apiHealth={apiHealth}
          onRefreshHealth={handleRefreshHealth}
          onOpenLibraryManager={() => setIsLibraryModalOpen(true)}
        />

        <TrackList
          title={heroMeta.title}
          eyebrow={heroMeta.eyebrow}
          description={heroMeta.description}
          folderPath={heroMeta.folderPath}
          tracks={visibleTracks}
          libraries={libraries}
          isLoadingTracks={isLoadingTracks}
          isScanning={isScanning}
          isDbConnected={isDbConnected}
          isApiConnected={isApiConnected}
          serverBaseUrl={serverBaseUrl}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          currentTrackId={playback.currentTrackId}
          isPlaying={playback.isPlaying}
          isShuffled={playback.isShuffled}
          onSelectTrack={handleSelectTrack}
          onTogglePlayList={handleTogglePlayList}
          onToggleShuffle={() =>
            setPlayback((prev) => ({ ...prev, isShuffled: !prev.isShuffled }))
          }
          onToggleLike={(trackId) => void handleToggleLike(trackId)}
          onOpenLibraryManager={() => setIsLibraryModalOpen(true)}
          onRescan={() => void handleRescan()}
          scanBanner={scanBanner}
          searchInputRef={searchInputRef}
        />
      </div>

      <PlayerBar
        currentTrack={currentTrack}
        serverBaseUrl={serverBaseUrl}
        playback={playback}
        durationSeconds={audioDuration}
        isBuffering={isBuffering}
        playbackError={playbackError}
        onTogglePlay={() =>
          setPlayback((prev) => ({ ...prev, isPlaying: !prev.isPlaying }))
        }
        onPrev={() => stepTrack(-1)}
        onNext={() => stepTrack(1)}
        onSeek={handleSeek}
        onToggleShuffle={() =>
          setPlayback((prev) => ({ ...prev, isShuffled: !prev.isShuffled }))
        }
        onCycleRepeat={handleCycleRepeat}
        onVolumeChange={handleVolumeChange}
        onToggleMute={handleToggleMute}
        onToggleLike={() => {
          if (currentTrack) {
            void handleToggleLike(currentTrack.id);
          }
        }}
      />

      <LibraryManagerModal
        isOpen={isLibraryModalOpen}
        onClose={() => setIsLibraryModalOpen(false)}
        serverBaseUrl={serverBaseUrl}
        onChangeServerBaseUrl={handleChangeServerBaseUrl}
        libraries={libraries}
        onLibraryChanged={handleLibraryChanged}
      />
    </div>
  );
}

export default App;
