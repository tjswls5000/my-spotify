import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RepeatMode,
  type PlaybackStateDto,
  type TrackDto,
} from '@my-spotify/shared-types';
import { fetchApiHealth } from './api/health.ts';
import { PlayerBar } from './components/PlayerBar.tsx';
import {
  Sidebar,
  type ApiHealthState,
  type NavSection,
} from './components/Sidebar.tsx';
import { TrackList } from './components/TrackList.tsx';
import { INITIAL_PLAYLISTS } from './data/mockLibrary.ts';

const ALL_TRACKS: TrackDto[] = INITIAL_PLAYLISTS.flatMap(
  (playlist) => playlist.tracks ?? [],
);

const INITIAL_LIKED_IDS = ALL_TRACKS.filter((track) => track.isLiked).map(
  (track) => track.id,
);

const DEFAULT_PLAYLIST = INITIAL_PLAYLISTS[0]!;
const DEFAULT_TRACK = DEFAULT_PLAYLIST.tracks?.[0] ?? null;

export function App() {
  const [activeNav, setActiveNav] = useState<NavSection>('home');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>(
    DEFAULT_PLAYLIST.id,
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [likedTrackIds, setLikedTrackIds] = useState<Set<string>>(
    () => new Set(INITIAL_LIKED_IDS),
  );
  const [previousVolume, setPreviousVolume] = useState<number>(0.78);

  const [playback, setPlayback] = useState<PlaybackStateDto>({
    currentTrackId: DEFAULT_TRACK?.id ?? null,
    isPlaying: false,
    positionSeconds: 42,
    volume: 0.78,
    isShuffled: false,
    repeatMode: RepeatMode.ALL,
  });

  const [apiHealth, setApiHealth] = useState<ApiHealthState>({
    status: 'loading',
    payload: null,
    latencyMs: null,
    errorMessage: null,
  });

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const handleRefreshHealth = useCallback(async () => {
    setApiHealth((prev) => ({
      ...prev,
      status: 'loading',
      errorMessage: null,
    }));

    try {
      const result = await fetchApiHealth();
      setApiHealth({
        status: 'connected',
        payload: result.data,
        latencyMs: result.latencyMs,
        errorMessage: null,
      });
    } catch (error) {
      setApiHealth({
        status: 'error',
        payload: null,
        latencyMs: null,
        errorMessage:
          error instanceof Error
            ? error.message
            : '백엔드 서버(/api/health)에 연결할 수 없습니다.',
      });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetchApiHealth(controller.signal)
      .then((result) => {
        setApiHealth({
          status: 'connected',
          payload: result.data,
          latencyMs: result.latencyMs,
          errorMessage: null,
        });
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
              : '백엔드 서버(/api/health)에 연결할 수 없습니다.',
        });
      });

    return () => controller.abort();
  }, []);

  const selectedPlaylist = useMemo(
    () =>
      INITIAL_PLAYLISTS.find(
        (playlist) => playlist.id === selectedPlaylistId,
      ) ?? DEFAULT_PLAYLIST,
    [selectedPlaylistId],
  );

  const playlistTracks = useMemo(
    () => selectedPlaylist.tracks ?? [],
    [selectedPlaylist],
  );

  const visibleTracks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const baseTracks = activeNav === 'library'
      ? ALL_TRACKS.filter((track) => likedTrackIds.has(track.id))
      : playlistTracks;

    if (!query) {
      return baseTracks;
    }

    return baseTracks.filter(
      (track) =>
        track.title.toLowerCase().includes(query) ||
        track.artist.toLowerCase().includes(query) ||
        track.album.toLowerCase().includes(query),
    );
  }, [activeNav, likedTrackIds, playlistTracks, searchQuery]);

  const currentTrack = useMemo(
    () =>
      ALL_TRACKS.find((track) => track.id === playback.currentTrackId) ?? null,
    [playback.currentTrackId],
  );

  const stepTrack = useCallback(
    (direction: 1 | -1) => {
      const queue = visibleTracks.length > 0 ? visibleTracks : ALL_TRACKS;
      if (queue.length === 0) {
        return;
      }

      setPlayback((prev) => {
        const currentIdx = queue.findIndex(
          (track) => track.id === prev.currentTrackId,
        );

        let nextIdx: number;
        if (prev.isShuffled && queue.length > 1) {
          nextIdx = (Math.max(0, currentIdx) + 2) % queue.length;
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
    [visibleTracks],
  );

  // Simulated audio clock for the player skeleton until streaming audio engine is attached
  useEffect(() => {
    if (!playback.isPlaying || !currentTrack) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setPlayback((prev) => {
        if (!prev.isPlaying) {
          return prev;
        }
        const nextPosition = prev.positionSeconds + 1;
        if (nextPosition < currentTrack.durationSeconds) {
          return { ...prev, positionSeconds: nextPosition };
        }
        if (prev.repeatMode === RepeatMode.ONE) {
          return { ...prev, positionSeconds: 0 };
        }
        if (prev.repeatMode === RepeatMode.OFF) {
          return { ...prev, positionSeconds: 0, isPlaying: false };
        }
        return { ...prev, positionSeconds: 0 };
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [playback.isPlaying, currentTrack]);

  // Spacebar shortcut for play/pause when not typing in an input
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if (event.code === 'Space' && !isEditable) {
        event.preventDefault();
        setPlayback((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectNav = (nav: NavSection) => {
    setActiveNav(nav);
    if (nav === 'search') {
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  };

  const handleSelectPlaylist = (playlistId: string) => {
    setActiveNav('home');
    setSelectedPlaylistId(playlistId);
  };

  const handleSelectTrack = (track: TrackDto) => {
    setPlayback((prev) => {
      if (prev.currentTrackId === track.id) {
        return { ...prev, isPlaying: !prev.isPlaying };
      }
      return {
        ...prev,
        currentTrackId: track.id,
        positionSeconds: 0,
        isPlaying: true,
      };
    });
  };

  const handleTogglePlayPlaylist = () => {
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

    setPlayback((prev) => ({
      ...prev,
      currentTrackId: firstTrack.id,
      positionSeconds: 0,
      isPlaying: true,
    }));
  };

  const handleToggleLike = (trackId: string) => {
    setLikedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
  };

  const handleCycleRepeat = () => {
    setPlayback((prev) => {
      const order: RepeatMode[] = [
        RepeatMode.OFF,
        RepeatMode.ALL,
        RepeatMode.ONE,
      ];
      const currentIndex = order.indexOf(prev.repeatMode);
      const nextMode = order[(currentIndex + 1) % order.length] ?? RepeatMode.OFF;
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
      return { ...prev, volume: previousVolume || 0.7 };
    });
  };

  const displayedPlaylist =
    activeNav === 'library'
      ? {
          ...selectedPlaylist,
          name: '좋아요 표시한 곡',
          description: '내 라이브러리에서 즐겨찾기한 개인 소장 트랙 목록',
          trackCount: visibleTracks.length,
          totalDurationSeconds: visibleTracks.reduce(
            (sum, track) => sum + track.durationSeconds,
            0,
          ),
        }
      : selectedPlaylist;

  return (
    <div className="app-shell">
      <div className="workspace-grid">
        <Sidebar
          activeNav={activeNav}
          onSelectNav={handleSelectNav}
          playlists={INITIAL_PLAYLISTS}
          selectedPlaylistId={selectedPlaylistId}
          onSelectPlaylist={handleSelectPlaylist}
          apiHealth={apiHealth}
          onRefreshHealth={handleRefreshHealth}
        />

        <TrackList
          playlist={displayedPlaylist}
          tracks={visibleTracks}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          currentTrackId={playback.currentTrackId}
          isPlaying={playback.isPlaying}
          isShuffled={playback.isShuffled}
          likedTrackIds={likedTrackIds}
          onSelectTrack={handleSelectTrack}
          onTogglePlayPlaylist={handleTogglePlayPlaylist}
          onToggleShuffle={() =>
            setPlayback((prev) => ({ ...prev, isShuffled: !prev.isShuffled }))
          }
          onToggleLike={handleToggleLike}
          searchInputRef={searchInputRef}
        />
      </div>

      <PlayerBar
        currentTrack={currentTrack}
        playback={playback}
        isLiked={
          currentTrack ? likedTrackIds.has(currentTrack.id) : false
        }
        onTogglePlay={() =>
          setPlayback((prev) => ({ ...prev, isPlaying: !prev.isPlaying }))
        }
        onPrev={() => stepTrack(-1)}
        onNext={() => stepTrack(1)}
        onSeek={(seconds) =>
          setPlayback((prev) => ({ ...prev, positionSeconds: seconds }))
        }
        onToggleShuffle={() =>
          setPlayback((prev) => ({ ...prev, isShuffled: !prev.isShuffled }))
        }
        onCycleRepeat={handleCycleRepeat}
        onVolumeChange={handleVolumeChange}
        onToggleMute={handleToggleMute}
        onToggleLike={() => {
          if (currentTrack) {
            handleToggleLike(currentTrack.id);
          }
        }}
      />
    </div>
  );
}

export default App;
