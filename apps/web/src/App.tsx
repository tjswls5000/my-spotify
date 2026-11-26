import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RepeatMode,
  ServiceStatus,
  type AuthResponseDto,
  type AuthStatusDto,
  type LibraryFolderDto,
  type PlaybackHistoryEntryDto,
  type PlaybackStateDto,
  type PlaylistDto,
  type ScanResultDto,
  type TrackDto,
} from '@my-spotify/shared-types';
import {
  addTracksToPlaylist,
  clearAuthTokens,
  createPlaylist,
  deletePlaylist,
  fetchApiHealth,
  fetchAuthStatus,
  fetchLibraries,
  fetchPlaylistById,
  fetchPlaylists,
  fetchRecentHistory,
  fetchResumeState,
  fetchTracks,
  getStoredAuthTokens,
  getStoredServerBaseUrl,
  recordPlaybackHistory,
  refreshAuthTokens,
  removeTrackFromPlaylist,
  reorderPlaylistTracks,
  resolveMediaUrl,
  saveResumeState,
  saveServerBaseUrl,
  setAuthExpiredHandler,
  toggleTrackLike,
  triggerLibraryScan,
  updatePlaylist,
} from './api/client.ts';
import { AuthModal } from './components/AuthModal.tsx';
import { LibraryManagerModal } from './components/LibraryManagerModal.tsx';
import { PlayerBar } from './components/PlayerBar.tsx';
import { PlaylistModal } from './components/PlaylistModal.tsx';
import { QueueDrawer } from './components/QueueDrawer.tsx';
import {
  Sidebar,
  type ApiHealthState,
  type NavSection,
} from './components/Sidebar.tsx';
import { TrackList, type TrackRowItem } from './components/TrackList.tsx';
import { useMediaSession } from './hooks/useMediaSession.ts';
import { usePlaybackQueue } from './hooks/usePlaybackQueue.ts';
import './styles/features.css';

interface PlaylistModalState {
  isOpen: boolean;
  mode: 'create' | 'edit';
  playlist: PlaylistDto | null;
  pendingTrack: TrackDto | null;
}

const DEFAULT_AUTH_STATUS: AuthStatusDto = {
  authEnabled: false,
  userCount: 0,
  currentUser: null,
};

const RESUME_SAVE_THROTTLE_MS = 5000;
const HISTORY_RECORD_THRESHOLD_SECONDS = 10;

export function App() {
  const [serverBaseUrl, setServerBaseUrl] = useState<string>(() =>
    getStoredServerBaseUrl(),
  );
  const [activeNav, setActiveNav] = useState<NavSection>('all');
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(
    null,
  );
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [libraries, setLibraries] = useState<LibraryFolderDto[]>([]);
  const [tracks, setTracks] = useState<TrackDto[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistDto[]>([]);
  const [activePlaylistDetail, setActivePlaylistDetail] =
    useState<PlaylistDto | null>(null);
  const [recentHistory, setRecentHistory] = useState<PlaybackHistoryEntryDto[]>(
    [],
  );
  const [isLoadingTracks, setIsLoadingTracks] = useState<boolean>(true);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanBanner, setScanBanner] = useState<string | null>(null);
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isQueueOpen, setIsQueueOpen] = useState<boolean>(false);
  const [playlistModal, setPlaylistModal] = useState<PlaylistModalState>({
    isOpen: false,
    mode: 'create',
    playlist: null,
    pendingTrack: null,
  });

  const [authStatus, setAuthStatus] =
    useState<AuthStatusDto>(DEFAULT_AUTH_STATUS);
  const [authRevision, setAuthRevision] = useState<number>(0);

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

  const {
    upNext,
    playNext,
    addToQueue,
    removeFromQueue,
    moveQueueItem,
    clearQueue,
    consumeNextQueuedTrack,
    jumpToQueueItem,
  } = usePlaybackQueue();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const loadedTrackIdRef = useRef<string | null>(null);
  const loadedServerUrlRef = useRef<string>(serverBaseUrl);
  const loadedAuthRevisionRef = useRef<number>(authRevision);

  const playbackRef = useRef<PlaybackStateDto>(playback);
  const hasRestoredResumeRef = useRef<boolean>(false);
  const pendingSeekSecondsRef = useRef<number | null>(null);
  const lastResumeSaveAtRef = useRef<number>(0);

  const playSessionIdRef = useRef<number>(0);
  const recordedHistorySessionRef = useRef<number>(-1);
  const bannerTimerRef = useRef<number | null>(null);

  useEffect(() => {
    playbackRef.current = playback;
  }, [playback]);

  const isApiConnected = apiHealth.status === 'connected';
  const isDbConnected =
    apiHealth.payload?.checks?.some(
      (check) => check.name === 'postgres' && check.status === ServiceStatus.OK,
    ) ?? false;
  const isAuthLocked = authStatus.authEnabled && !authStatus.currentUser;

  const showBanner = useCallback((message: string, durationMs = 4000) => {
    if (bannerTimerRef.current !== null) {
      window.clearTimeout(bannerTimerRef.current);
    }
    setScanBanner(message);
    bannerTimerRef.current = window.setTimeout(() => {
      setScanBanner(null);
      bannerTimerRef.current = null;
    }, durationMs);
  }, []);

  useEffect(() => {
    return () => {
      if (bannerTimerRef.current !== null) {
        window.clearTimeout(bannerTimerRef.current);
      }
    };
  }, []);

  // Handle global 401 session expiration from API client
  useEffect(() => {
    setAuthExpiredHandler(() => {
      setAuthStatus((prev) => ({
        ...prev,
        authEnabled: true,
        currentUser: null,
      }));
      setAuthRevision((prev) => prev + 1);
      setLibraries([]);
      setTracks([]);
      setPlaylists([]);
      setActivePlaylistDetail(null);
      setRecentHistory([]);
      setPlayback((prev) => ({ ...prev, isPlaying: false }));
      showBanner('세션이 만료되었습니다. 다시 로그인해 주세요.', 5000);
    });
    return () => setAuthExpiredHandler(null);
  }, [showBanner]);

  const refreshRecentHistoryList = useCallback(
    async (baseUrl: string) => {
      try {
        const entries = await fetchRecentHistory(baseUrl, 50);
        setRecentHistory(entries);
      } catch {
        // ignore transient refresh errors
      }
    },
    [],
  );

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
          setAuthStatus(DEFAULT_AUTH_STATUS);
          setLibraries([]);
          setTracks([]);
          setPlaylists([]);
          setActivePlaylistDetail(null);
          setRecentHistory([]);
          setIsLoadingTracks(false);
          return;
        }

        let nextAuthStatus = await fetchAuthStatus(baseUrl, signal);

        // If access token expired (>1h) while refresh token is still stored, refresh transparently
        if (nextAuthStatus.authEnabled && !nextAuthStatus.currentUser) {
          const storedTokens = getStoredAuthTokens();
          if (storedTokens?.refreshToken) {
            try {
              const refreshed = await refreshAuthTokens(baseUrl, {
                refreshToken: storedTokens.refreshToken,
              });
              nextAuthStatus = {
                ...nextAuthStatus,
                currentUser: refreshed.user,
              };
              setAuthRevision((prev) => prev + 1);
            } catch {
              clearAuthTokens();
            }
          }
        }

        setAuthStatus(nextAuthStatus);

        if (nextAuthStatus.authEnabled && !nextAuthStatus.currentUser) {
          setLibraries([]);
          setTracks([]);
          setPlaylists([]);
          setActivePlaylistDetail(null);
          setRecentHistory([]);
          setIsLoadingTracks(false);
          return;
        }

        const [
          fetchedLibraries,
          fetchedTracks,
          fetchedPlaylists,
          fetchedHistory,
        ] = await Promise.all([
          fetchLibraries(baseUrl, signal),
          fetchTracks(baseUrl, undefined, signal),
          fetchPlaylists(baseUrl, signal),
          fetchRecentHistory(baseUrl, 50, signal).catch(() => []),
        ]);

        setLibraries(fetchedLibraries);
        setTracks(fetchedTracks);
        setPlaylists(fetchedPlaylists);
        setRecentHistory(fetchedHistory);
        setIsLoadingTracks(false);

        // Auto-resume saved playback state once on initial load
        if (
          !hasRestoredResumeRef.current &&
          playbackRef.current.currentTrackId === null
        ) {
          try {
            const saved = await fetchResumeState(baseUrl, signal);
            if (!signal?.aborted) {
              hasRestoredResumeRef.current = true;
              if (saved?.currentTrackId) {
                const matchedTrack = fetchedTracks.find(
                  (track) => track.id === saved.currentTrackId,
                );
                if (matchedTrack) {
                  const clampedPos =
                    matchedTrack.durationSeconds > 0
                      ? Math.min(
                          Math.max(0, saved.positionSeconds),
                          matchedTrack.durationSeconds,
                        )
                      : Math.max(0, saved.positionSeconds);
                  pendingSeekSecondsRef.current =
                    clampedPos > 0 ? clampedPos : null;
                  setAudioDuration(matchedTrack.durationSeconds);
                  if (saved.volume > 0) {
                    setPreviousVolume(saved.volume);
                  }
                  setPlayback({
                    currentTrackId: matchedTrack.id,
                    isPlaying: false,
                    positionSeconds: clampedPos,
                    volume: Math.max(0, Math.min(1, saved.volume)),
                    isShuffled: saved.isShuffled,
                    repeatMode: saved.repeatMode,
                  });
                }
              }
            }
          } catch {
            if (!signal?.aborted) {
              hasRestoredResumeRef.current = true;
            }
          }
        }
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
        setPlaylists([]);
        setActivePlaylistDetail(null);
        setRecentHistory([]);
        setIsLoadingTracks(false);
      }
    },
    [],
  );

  // Initial load & reload when serverBaseUrl changes
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) {
        return refreshServerData(serverBaseUrl, controller.signal);
      }
      return undefined;
    });
    return () => controller.abort();
  }, [refreshServerData, serverBaseUrl]);

  // Fetch detailed playlist tracks when viewing a specific playlist
  useEffect(() => {
    if (
      activeNav !== 'playlist' ||
      !selectedPlaylistId ||
      !isDbConnected ||
      isAuthLocked
    ) {
      return;
    }

    const controller = new AbortController();
    fetchPlaylistById(serverBaseUrl, selectedPlaylistId, controller.signal)
      .then((detail) => {
        setActivePlaylistDetail(detail);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setActivePlaylistDetail(null);
        }
      });

    return () => controller.abort();
  }, [activeNav, isAuthLocked, isDbConnected, selectedPlaylistId, serverBaseUrl]);

  const persistResumeState = useCallback(
    (state: PlaybackStateDto) => {
      if (!isDbConnected || isAuthLocked || !hasRestoredResumeRef.current) {
        return;
      }
      lastResumeSaveAtRef.current = Date.now();
      void saveResumeState(serverBaseUrl, {
        currentTrackId: state.currentTrackId,
        positionSeconds: Math.max(0, Math.round(state.positionSeconds)),
        volume: Math.max(0, Math.min(1, state.volume)),
        isShuffled: state.isShuffled,
        repeatMode: state.repeatMode,
      }).catch(() => {
        // ignore transient resume save errors
      });
    },
    [isAuthLocked, isDbConnected, serverBaseUrl],
  );

  // Save resume state on track change, pause, shuffle/repeat/volume updates
  useEffect(() => {
    if (!hasRestoredResumeRef.current || !isDbConnected || isAuthLocked) {
      return;
    }
    if (!playback.currentTrackId) {
      return;
    }
    persistResumeState({
      ...playbackRef.current,
      currentTrackId: playback.currentTrackId,
      isPlaying: playback.isPlaying,
      volume: playback.volume,
      isShuffled: playback.isShuffled,
      repeatMode: playback.repeatMode,
    });
  }, [
    isAuthLocked,
    isDbConnected,
    persistResumeState,
    playback.currentTrackId,
    playback.isPlaying,
    playback.isShuffled,
    playback.repeatMode,
    playback.volume,
  ]);

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
    hasRestoredResumeRef.current = false;
    pendingSeekSecondsRef.current = null;
    setIsLoadingTracks(true);
    setPlayback((prev) => ({
      ...prev,
      currentTrackId: null,
      isPlaying: false,
      positionSeconds: 0,
    }));
    setSelectedLibraryId(null);
    setSelectedPlaylistId(null);
    setActivePlaylistDetail(null);
    setActiveNav('all');
    setServerBaseUrl(nextUrl);
  }, []);

  const tracksById = useMemo(() => {
    const map = new Map<string, TrackDto>();
    for (const track of tracks) {
      map.set(track.id, track);
    }
    return map;
  }, [tracks]);

  const visibleTrackRows = useMemo<TrackRowItem[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery = (track: TrackDto) =>
      !query ||
      track.title.toLowerCase().includes(query) ||
      track.artist.toLowerCase().includes(query) ||
      track.album.toLowerCase().includes(query);

    if (activeNav === 'playlist') {
      const playlistTracks = activePlaylistDetail?.tracks ?? [];
      return playlistTracks
        .map((track) => tracksById.get(track.id) ?? track)
        .filter(matchesQuery)
        .map((track) => ({ key: `${selectedPlaylistId ?? 'pl'}-${track.id}`, track }));
    }

    if (activeNav === 'recent') {
      const rows: TrackRowItem[] = [];
      for (const entry of recentHistory) {
        const resolvedTrack =
          tracksById.get(entry.trackId) ?? entry.track ?? null;
        if (!resolvedTrack || !matchesQuery(resolvedTrack)) {
          continue;
        }
        rows.push({
          key: entry.id,
          track: resolvedTrack,
          playedAt: entry.playedAt,
        });
      }
      return rows;
    }

    let filtered = tracks;
    if (activeNav === 'liked') {
      filtered = filtered.filter((track) => track.isLiked);
    } else if (activeNav === 'folder' && selectedLibraryId) {
      filtered = filtered.filter(
        (track) => track.libraryFolderId === selectedLibraryId,
      );
    }

    return filtered.filter(matchesQuery).map((track) => ({
      key: track.id,
      track,
    }));
  }, [
    activeNav,
    activePlaylistDetail,
    recentHistory,
    searchQuery,
    selectedLibraryId,
    selectedPlaylistId,
    tracks,
    tracksById,
  ]);

  const visibleTracks = useMemo(
    () => visibleTrackRows.map((row) => row.track),
    [visibleTrackRows],
  );

  const likedTrackCount = useMemo(
    () => tracks.filter((track) => track.isLiked).length,
    [tracks],
  );

  const activePlaylist = useMemo(() => {
    if (activeNav !== 'playlist' || !selectedPlaylistId) {
      return null;
    }
    if (activePlaylistDetail?.id === selectedPlaylistId) {
      return activePlaylistDetail;
    }
    return playlists.find((item) => item.id === selectedPlaylistId) ?? null;
  }, [activeNav, activePlaylistDetail, playlists, selectedPlaylistId]);

  const currentTrack = useMemo(() => {
    if (!playback.currentTrackId) {
      return null;
    }
    const fromCatalog = tracksById.get(playback.currentTrackId);
    if (fromCatalog) {
      return fromCatalog;
    }
    const fromPlaylist = activePlaylistDetail?.tracks?.find(
      (track) => track.id === playback.currentTrackId,
    );
    if (fromPlaylist) {
      return fromPlaylist;
    }
    const fromQueue = upNext.find(
      (item) => item.track.id === playback.currentTrackId,
    )?.track;
    return fromQueue ?? null;
  }, [activePlaylistDetail, playback.currentTrackId, tracksById, upNext]);

  const selectedLibrary = useMemo(
    () => libraries.find((library) => library.id === selectedLibraryId) ?? null,
    [libraries, selectedLibraryId],
  );

  const upcomingContextTracks = useMemo(() => {
    const contextQueue = visibleTracks.length > 0 ? visibleTracks : tracks;
    if (contextQueue.length === 0) {
      return [];
    }
    const currentIdx = contextQueue.findIndex(
      (track) => track.id === playback.currentTrackId,
    );
    const orderedCandidates =
      currentIdx === -1
        ? contextQueue
        : playback.repeatMode === RepeatMode.ALL
          ? [
              ...contextQueue.slice(currentIdx + 1),
              ...contextQueue.slice(0, currentIdx),
            ]
          : contextQueue.slice(currentIdx + 1);

    const seenIds = new Set<string>();
    if (playback.currentTrackId) {
      seenIds.add(playback.currentTrackId);
    }

    const uniqueTracks: TrackDto[] = [];
    for (const track of orderedCandidates) {
      if (seenIds.has(track.id)) {
        continue;
      }
      seenIds.add(track.id);
      uniqueTracks.push(track);
      if (uniqueTracks.length >= 30) {
        break;
      }
    }
    return uniqueTracks;
  }, [playback.currentTrackId, playback.repeatMode, tracks, visibleTracks]);

  const playTrackImmediately = useCallback((track: TrackDto) => {
    playSessionIdRef.current += 1;
    pendingSeekSecondsRef.current = null;
    setPlaybackError(null);
    setAudioDuration(track.durationSeconds);
    setPlayback((prev) => ({
      ...prev,
      currentTrackId: track.id,
      positionSeconds: 0,
      isPlaying: true,
    }));
  }, []);

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

    if (!currentTrack || isAuthLocked) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      loadedTrackIdRef.current = null;
      return;
    }

    const streamSrc = resolveMediaUrl(serverBaseUrl, currentTrack.streamUrl);
    const trackChanged =
      loadedTrackIdRef.current !== currentTrack.id ||
      loadedServerUrlRef.current !== serverBaseUrl ||
      loadedAuthRevisionRef.current !== authRevision;

    if (trackChanged && streamSrc) {
      loadedTrackIdRef.current = currentTrack.id;
      loadedServerUrlRef.current = serverBaseUrl;
      loadedAuthRevisionRef.current = authRevision;
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
  }, [authRevision, currentTrack, isAuthLocked, playback.isPlaying, serverBaseUrl]);

  const stepTrack = useCallback(
    (direction: 1 | -1) => {
      if (direction === 1) {
        const queuedTrack = consumeNextQueuedTrack();
        if (queuedTrack) {
          playTrackImmediately(queuedTrack);
          return;
        }
      }

      const contextQueue = visibleTracks.length > 0 ? visibleTracks : tracks;
      if (contextQueue.length === 0) {
        return;
      }

      const currentIdx = contextQueue.findIndex(
        (track) => track.id === playbackRef.current.currentTrackId,
      );

      let nextIdx: number;
      if (playbackRef.current.isShuffled && contextQueue.length > 1) {
        const offset =
          Math.floor(Math.random() * (contextQueue.length - 1)) + 1;
        nextIdx = (Math.max(0, currentIdx) + offset) % contextQueue.length;
      } else if (currentIdx === -1) {
        nextIdx = 0;
      } else {
        nextIdx =
          (currentIdx + direction + contextQueue.length) % contextQueue.length;
      }

      const nextTrack = contextQueue[nextIdx];
      if (!nextTrack) {
        return;
      }

      playTrackImmediately(nextTrack);
    },
    [consumeNextQueuedTrack, playTrackImmediately, tracks, visibleTracks],
  );

  const handleSeek = useCallback((seconds: number) => {
    pendingSeekSecondsRef.current = null;
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
    }
    setPlayback((prev) => ({ ...prev, positionSeconds: seconds }));
  }, []);

  const handleMediaPlay = useCallback(() => {
    setPlayback((prev) => {
      if (!prev.currentTrackId) {
        return prev;
      }
      return { ...prev, isPlaying: true };
    });
  }, []);

  const handleMediaPause = useCallback(() => {
    setPlayback((prev) => ({ ...prev, isPlaying: false }));
  }, []);

  const handlePrevTrack = useCallback(() => {
    stepTrack(-1);
  }, [stepTrack]);

  const handleNextTrack = useCallback(() => {
    stepTrack(1);
  }, [stepTrack]);

  // OS Media Session integration (Lock screen & media hardware keys)
  const currentCoverUrl = useMemo(
    () =>
      authRevision >= 0
        ? resolveMediaUrl(serverBaseUrl, currentTrack?.coverUrl ?? null)
        : null,
    [authRevision, currentTrack?.coverUrl, serverBaseUrl],
  );

  useMediaSession({
    currentTrack,
    coverUrl: currentCoverUrl,
    isPlaying: playback.isPlaying,
    positionSeconds: playback.positionSeconds,
    durationSeconds: audioDuration || currentTrack?.durationSeconds || 0,
    onPlay: handleMediaPlay,
    onPause: handleMediaPause,
    onPreviousTrack: handlePrevTrack,
    onNextTrack: handleNextTrack,
    onSeekTo: handleSeek,
  });

  // Spacebar shortcut for play/pause
  const isAnyModalOpen =
    isLibraryModalOpen || playlistModal.isOpen || isAuthModalOpen;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if (event.code === 'Space' && !isEditable && !isAnyModalOpen) {
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
  }, [isAnyModalOpen]);

  const recordHistorySilently = useCallback(
    (trackId: string, durationListenedSeconds: number, completed: boolean) => {
      if (!isDbConnected || isAuthLocked) {
        return;
      }
      void recordPlaybackHistory(serverBaseUrl, {
        trackId,
        durationListenedSeconds: Math.max(
          0,
          Math.round(durationListenedSeconds),
        ),
        completed,
      })
        .then(() => refreshRecentHistoryList(serverBaseUrl))
        .catch(() => {
          // ignore transient history recording errors
        });
    },
    [isAuthLocked, isDbConnected, refreshRecentHistoryList, serverBaseUrl],
  );

  const handleAudioEnded = () => {
    const audio = audioRef.current;

    if (
      currentTrack &&
      recordedHistorySessionRef.current !== playSessionIdRef.current
    ) {
      recordedHistorySessionRef.current = playSessionIdRef.current;
      recordHistorySilently(
        currentTrack.id,
        audioDuration || currentTrack.durationSeconds,
        true,
      );
    }

    if (playback.repeatMode === RepeatMode.ONE && audio) {
      playSessionIdRef.current += 1;
      audio.currentTime = 0;
      void audio.play();
      return;
    }

    const queuedTrack = consumeNextQueuedTrack();
    if (queuedTrack) {
      playTrackImmediately(queuedTrack);
      return;
    }

    const contextQueue = visibleTracks.length > 0 ? visibleTracks : tracks;
    const currentIdx = contextQueue.findIndex(
      (track) => track.id === playback.currentTrackId,
    );
    const isLastTrack =
      currentIdx !== -1 && currentIdx === contextQueue.length - 1;

    if (
      playback.repeatMode === RepeatMode.OFF &&
      isLastTrack &&
      !playback.isShuffled
    ) {
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
    if (nav !== 'playlist') {
      setSelectedPlaylistId(null);
    }
    if (nav === 'search') {
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
    }
    if (nav === 'recent' && isDbConnected && !isAuthLocked) {
      void refreshRecentHistoryList(serverBaseUrl);
    }
  };

  const handleSelectLibrary = (libraryId: string) => {
    setSelectedLibraryId(libraryId);
    setSelectedPlaylistId(null);
    setActiveNav('folder');
  };

  const handleSelectPlaylist = (playlistId: string) => {
    setSelectedPlaylistId(playlistId);
    setSelectedLibraryId(null);
    setActiveNav('playlist');
  };

  const handleSelectTrack = (track: TrackDto) => {
    if (playback.currentTrackId === track.id) {
      setPlayback((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
      return;
    }
    playTrackImmediately(track);
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

    playTrackImmediately(firstTrack);
  };

  const handleToggleLike = async (trackId: string) => {
    try {
      const updated = await toggleTrackLike(serverBaseUrl, trackId);
      setTracks((prev) =>
        prev.map((track) => (track.id === updated.id ? updated : track)),
      );
      setActivePlaylistDetail((prev) => {
        if (!prev?.tracks) {
          return prev;
        }
        return {
          ...prev,
          tracks: prev.tracks.map((track) =>
            track.id === updated.id ? updated : track,
          ),
        };
      });
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
    if (playback.volume > 0) {
      setPreviousVolume(playback.volume);
      setPlayback((prev) => ({ ...prev, volume: 0 }));
      return;
    }
    setPlayback((prev) => ({ ...prev, volume: previousVolume || 0.75 }));
  };

  // Queue handlers
  const handlePlayNext = useCallback(
    (track: TrackDto) => {
      playNext(track);
      showBanner(`"${track.title}" 트랙을 다음 곡으로 예약했습니다.`, 2800);
    },
    [playNext, showBanner],
  );

  const handleAddToQueue = useCallback(
    (track: TrackDto) => {
      addToQueue(track);
      showBanner(`"${track.title}" 트랙을 재생 대기열에 추가했습니다.`, 2800);
    },
    [addToQueue, showBanner],
  );

  const handlePlayQueueItem = useCallback(
    (uid: string) => {
      const targetTrack = jumpToQueueItem(uid);
      if (targetTrack) {
        playTrackImmediately(targetTrack);
      }
    },
    [jumpToQueueItem, playTrackImmediately],
  );

  // Playlist CRUD handlers
  const openCreatePlaylistModal = (pendingTrack: TrackDto | null = null) => {
    setPlaylistModal({
      isOpen: true,
      mode: 'create',
      playlist: null,
      pendingTrack,
    });
  };

  const openEditPlaylistModal = (playlist: PlaylistDto) => {
    setPlaylistModal({
      isOpen: true,
      mode: 'edit',
      playlist,
      pendingTrack: null,
    });
  };

  const syncPlaylistInState = useCallback((updated: PlaylistDto) => {
    setPlaylists((prev) => {
      const exists = prev.some((item) => item.id === updated.id);
      if (!exists) {
        return [updated, ...prev];
      }
      return prev.map((item) =>
        item.id === updated.id ? { ...item, ...updated } : item,
      );
    });
    setActivePlaylistDetail((prev) =>
      prev?.id === updated.id ? updated : prev,
    );
  }, []);

  const handleSubmitPlaylistModal = async (values: {
    name: string;
    description: string;
  }) => {
    if (playlistModal.mode === 'create') {
      let created = await createPlaylist(serverBaseUrl, {
        name: values.name,
        description: values.description,
      });
      if (playlistModal.pendingTrack) {
        created = await addTracksToPlaylist(serverBaseUrl, created.id, {
          trackIds: [playlistModal.pendingTrack.id],
        });
        showBanner(
          `"${created.name}" 플레이리스트를 만들고 "${playlistModal.pendingTrack.title}" 트랙을 추가했습니다.`,
        );
      } else {
        showBanner(`"${created.name}" 플레이리스트를 만들었습니다.`);
      }
      syncPlaylistInState(created);
      setSelectedPlaylistId(created.id);
      setActivePlaylistDetail(created);
      setActiveNav('playlist');
      return;
    }

    if (playlistModal.playlist) {
      const updated = await updatePlaylist(
        serverBaseUrl,
        playlistModal.playlist.id,
        {
          name: values.name,
          description: values.description,
        },
      );
      syncPlaylistInState(updated);
      showBanner(`"${updated.name}" 플레이리스트 정보를 수정했습니다.`);
    }
  };

  const handleDeletePlaylist = async (playlist: PlaylistDto) => {
    try {
      await deletePlaylist(serverBaseUrl, playlist.id);
      setPlaylists((prev) => prev.filter((item) => item.id !== playlist.id));
      if (selectedPlaylistId === playlist.id) {
        setSelectedPlaylistId(null);
        setActivePlaylistDetail(null);
        setActiveNav('all');
      }
      showBanner(`"${playlist.name}" 플레이리스트를 삭제했습니다.`);
    } catch (error) {
      showBanner(
        error instanceof Error
          ? error.message
          : '플레이리스트 삭제에 실패했습니다.',
      );
    }
  };

  const handleAddTrackToPlaylist = async (
    playlistId: string,
    trackId: string,
  ) => {
    try {
      const updated = await addTracksToPlaylist(serverBaseUrl, playlistId, {
        trackIds: [trackId],
      });
      syncPlaylistInState(updated);
      showBanner(`"${updated.name}" 플레이리스트에 곡을 추가했습니다.`, 2800);
    } catch (error) {
      showBanner(
        error instanceof Error
          ? error.message
          : '플레이리스트에 곡을 추가하지 못했습니다.',
      );
    }
  };

  const handleRemoveTrackFromPlaylist = async (
    playlistId: string,
    trackId: string,
  ) => {
    try {
      const updated = await removeTrackFromPlaylist(
        serverBaseUrl,
        playlistId,
        trackId,
      );
      syncPlaylistInState(updated);
      showBanner('플레이리스트에서 트랙을 제거했습니다.', 2600);
    } catch (error) {
      showBanner(
        error instanceof Error
          ? error.message
          : '플레이리스트에서 트랙을 제거하지 못했습니다.',
      );
    }
  };

  const handleMovePlaylistTrack = async (
    playlistId: string,
    fromIndex: number,
    toIndex: number,
  ) => {
    const currentTracks = activePlaylistDetail?.tracks;
    if (
      !currentTracks ||
      activePlaylistDetail.id !== playlistId ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= currentTracks.length ||
      toIndex >= currentTracks.length ||
      fromIndex === toIndex
    ) {
      return;
    }

    const reordered = [...currentTracks];
    const [moved] = reordered.splice(fromIndex, 1);
    if (!moved) {
      return;
    }
    reordered.splice(toIndex, 0, moved);

    // Optimistic reorder
    const previousDetail = activePlaylistDetail;
    setActivePlaylistDetail({
      ...activePlaylistDetail,
      tracks: reordered,
    });

    try {
      const updated = await reorderPlaylistTracks(serverBaseUrl, playlistId, {
        trackIds: reordered.map((track) => track.id),
      });
      syncPlaylistInState(updated);
    } catch {
      setActivePlaylistDetail(previousDetail);
      showBanner('트랙 순서 변경에 실패했습니다.');
    }
  };

  // Auth modal callbacks
  const handleAuthSuccess = async (response: AuthResponseDto) => {
    hasRestoredResumeRef.current = false;
    setAuthRevision((prev) => prev + 1);
    setIsLoadingTracks(true);
    await refreshServerData(serverBaseUrl);
    showBanner(`${response.user.displayName}님으로 로그인했습니다.`);
  };

  const handleUserCreated = async () => {
    try {
      const nextStatus = await fetchAuthStatus(serverBaseUrl);
      setAuthStatus(nextStatus);
    } catch {
      // ignore transient status refresh errors
    }
  };

  const handleLogout = async () => {
    hasRestoredResumeRef.current = false;
    pendingSeekSecondsRef.current = null;
    setAuthRevision((prev) => prev + 1);
    setPlayback((prev) => ({
      ...prev,
      currentTrackId: null,
      isPlaying: false,
      positionSeconds: 0,
    }));
    clearQueue();
    await refreshServerData(serverBaseUrl);
    showBanner('로그아웃했습니다.');
  };

  const showScanSummary = (scan?: ScanResultDto) => {
    if (!scan) {
      return;
    }
    showBanner(
      `스캔 완료 · ${scan.filesFound}곡 확인 (+${scan.addedCount} 추가 / ${scan.updatedCount} 업데이트 / -${scan.removedCount} 삭제 · ${scan.durationMs}ms)`,
      5000,
    );
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
    if (activeNav === 'playlist' && activePlaylist) {
      return {
        eyebrow: 'CUSTOM PLAYLIST',
        title: activePlaylist.name,
        description:
          activePlaylist.description ||
          '직접 구성한 커스텀 플레이리스트입니다. 순서를 조정하거나 트랙을 자유롭게 추가해 보세요.',
        folderPath: null,
      };
    }
    if (activeNav === 'recent') {
      return {
        eyebrow: 'PLAYBACK HISTORY & RESUME',
        title: '최근 재생',
        description:
          '최근에 감상한 트랙 기록입니다. 마지막 재생 위치는 서버에 자동 저장되어 이어듣기를 지원합니다.',
        folderPath: null,
      };
    }
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
          const audioEl = event.currentTarget;
          const nextDuration = audioEl.duration;
          if (Number.isFinite(nextDuration) && nextDuration > 0) {
            setAudioDuration(nextDuration);
          }
          if (pendingSeekSecondsRef.current !== null) {
            const targetSeek =
              Number.isFinite(nextDuration) && nextDuration > 0
                ? Math.min(pendingSeekSecondsRef.current, nextDuration)
                : pendingSeekSecondsRef.current;
            audioEl.currentTime = Math.max(0, targetSeek);
            pendingSeekSecondsRef.current = null;
          }
          setIsBuffering(false);
        }}
        onTimeUpdate={(event) => {
          if (pendingSeekSecondsRef.current !== null) {
            return;
          }
          const nextPosition = event.currentTarget.currentTime;
          const elDuration = event.currentTarget.duration;
          setPlayback((prev) => ({
            ...prev,
            positionSeconds: nextPosition,
          }));

          // Record play history once per track play session after >= 10s
          if (
            playbackRef.current.isPlaying &&
            currentTrack &&
            recordedHistorySessionRef.current !== playSessionIdRef.current
          ) {
            const threshold =
              Number.isFinite(elDuration) &&
              elDuration > 0 &&
              elDuration < HISTORY_RECORD_THRESHOLD_SECONDS
                ? elDuration * 0.8
                : HISTORY_RECORD_THRESHOLD_SECONDS;
            if (nextPosition >= threshold) {
              recordedHistorySessionRef.current = playSessionIdRef.current;
              recordHistorySilently(currentTrack.id, nextPosition, false);
            }
          }

          // Throttled resume position save every ~5 seconds while playing
          if (
            playbackRef.current.isPlaying &&
            currentTrack &&
            Date.now() - lastResumeSaveAtRef.current >= RESUME_SAVE_THROTTLE_MS
          ) {
            persistResumeState({
              ...playbackRef.current,
              positionSeconds: nextPosition,
            });
          }
        }}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          setIsBuffering(false);
          setPlaybackError(null);
        }}
        onEnded={handleAudioEnded}
        onError={() => {
          setIsBuffering(false);
          if (currentTrack && !isAuthLocked) {
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
          playlists={playlists}
          selectedPlaylistId={selectedPlaylistId}
          onSelectPlaylist={handleSelectPlaylist}
          onCreatePlaylist={() => openCreatePlaylistModal(null)}
          totalTrackCount={tracks.length}
          likedTrackCount={likedTrackCount}
          recentHistoryCount={recentHistory.length}
          serverBaseUrl={serverBaseUrl}
          apiHealth={apiHealth}
          authStatus={authStatus}
          onRefreshHealth={handleRefreshHealth}
          onOpenLibraryManager={() => setIsLibraryModalOpen(true)}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
        />

        <TrackList
          activeNav={activeNav}
          activePlaylist={activePlaylist}
          playlists={playlists}
          title={heroMeta.title}
          eyebrow={heroMeta.eyebrow}
          description={heroMeta.description}
          folderPath={heroMeta.folderPath}
          tracks={visibleTracks}
          trackRows={visibleTrackRows}
          libraries={libraries}
          isLoadingTracks={isLoadingTracks}
          isScanning={isScanning}
          isDbConnected={isDbConnected}
          isApiConnected={isApiConnected}
          isAuthLocked={isAuthLocked}
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
          onPlayNext={handlePlayNext}
          onAddToQueue={handleAddToQueue}
          onAddTrackToPlaylist={(playlistId, trackId) =>
            void handleAddTrackToPlaylist(playlistId, trackId)
          }
          onCreatePlaylistWithTrack={(track) => openCreatePlaylistModal(track)}
          onEditPlaylist={openEditPlaylistModal}
          onDeletePlaylist={(playlist) => void handleDeletePlaylist(playlist)}
          onRemoveTrackFromPlaylist={(playlistId, trackId) =>
            void handleRemoveTrackFromPlaylist(playlistId, trackId)
          }
          onMovePlaylistTrack={(playlistId, fromIndex, toIndex) =>
            void handleMovePlaylistTrack(playlistId, fromIndex, toIndex)
          }
          onOpenLibraryManager={() => setIsLibraryModalOpen(true)}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
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
        queueCount={upNext.length}
        isQueueOpen={isQueueOpen}
        onToggleQueue={() => setIsQueueOpen((prev) => !prev)}
        onTogglePlay={() =>
          setPlayback((prev) => ({ ...prev, isPlaying: !prev.isPlaying }))
        }
        onPrev={handlePrevTrack}
        onNext={handleNextTrack}
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

      <QueueDrawer
        isOpen={isQueueOpen}
        onClose={() => setIsQueueOpen(false)}
        serverBaseUrl={serverBaseUrl}
        currentTrack={currentTrack}
        isPlaying={playback.isPlaying}
        upNext={upNext}
        upcomingContextTracks={upcomingContextTracks}
        onPlayTrack={playTrackImmediately}
        onPlayQueueItem={handlePlayQueueItem}
        onRemoveQueueItem={removeFromQueue}
        onMoveQueueItem={moveQueueItem}
        onClearQueue={clearQueue}
      />

      <LibraryManagerModal
        isOpen={isLibraryModalOpen}
        onClose={() => setIsLibraryModalOpen(false)}
        serverBaseUrl={serverBaseUrl}
        onChangeServerBaseUrl={handleChangeServerBaseUrl}
        libraries={libraries}
        onLibraryChanged={handleLibraryChanged}
      />

      <PlaylistModal
        isOpen={playlistModal.isOpen}
        mode={playlistModal.mode}
        initialPlaylist={playlistModal.playlist}
        pendingTrackTitle={playlistModal.pendingTrack?.title ?? null}
        onClose={() =>
          setPlaylistModal({
            isOpen: false,
            mode: 'create',
            playlist: null,
            pendingTrack: null,
          })
        }
        onSubmit={handleSubmitPlaylistModal}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        serverBaseUrl={serverBaseUrl}
        authStatus={authStatus}
        onAuthSuccess={handleAuthSuccess}
        onUserCreated={handleUserCreated}
        onLogout={handleLogout}
      />
    </div>
  );
}

export default App;
