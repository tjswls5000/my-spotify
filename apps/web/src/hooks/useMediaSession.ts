import { useEffect, useRef } from 'react';
import type { TrackDto } from '@my-spotify/shared-types';

export interface UseMediaSessionParams {
  currentTrack: TrackDto | null;
  coverUrl: string | null;
  isPlaying: boolean;
  positionSeconds: number;
  durationSeconds: number;
  onPlay: () => void;
  onPause: () => void;
  onPreviousTrack: () => void;
  onNextTrack: () => void;
  onSeekTo: (seconds: number) => void;
}

const DEFAULT_SEEK_OFFSET_SECONDS = 10;

function hasMediaSession(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator;
}

function resolveArtworkUrl(coverUrl: string | null): string | null {
  if (!coverUrl) {
    return null;
  }
  try {
    if (typeof window !== 'undefined' && window.location?.href) {
      return new URL(coverUrl, window.location.href).href;
    }
  } catch {
    // fall back to the provided coverUrl if URL construction fails
  }
  return coverUrl;
}

function setActionHandlerSafe(
  action: MediaSessionAction,
  handler: MediaSessionActionHandler | null,
): void {
  if (!hasMediaSession()) {
    return;
  }
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // ignore unsupported MediaSessionAction in older browsers
  }
}

export function useMediaSession({
  currentTrack,
  coverUrl,
  isPlaying,
  positionSeconds,
  durationSeconds,
  onPlay,
  onPause,
  onPreviousTrack,
  onNextTrack,
  onSeekTo,
}: UseMediaSessionParams): void {
  const callbacksRef = useRef({
    onPlay,
    onPause,
    onPreviousTrack,
    onNextTrack,
    onSeekTo,
  });

  const timingRef = useRef({
    positionSeconds,
    durationSeconds,
  });

  useEffect(() => {
    callbacksRef.current = {
      onPlay,
      onPause,
      onPreviousTrack,
      onNextTrack,
      onSeekTo,
    };
  }, [onPlay, onPause, onPreviousTrack, onNextTrack, onSeekTo]);

  useEffect(() => {
    timingRef.current = {
      positionSeconds,
      durationSeconds,
    };
  }, [positionSeconds, durationSeconds]);

  // Sync track metadata & artwork
  useEffect(() => {
    if (!hasMediaSession()) {
      return;
    }

    if (!currentTrack) {
      navigator.mediaSession.metadata = null;
      return;
    }

    if (typeof MediaMetadata === 'undefined') {
      return;
    }

    const resolvedCover = resolveArtworkUrl(coverUrl);
    const artwork: MediaImage[] = resolvedCover
      ? [{ src: resolvedCover, sizes: '512x512' }]
      : [];

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album,
      artwork,
    });
  }, [currentTrack, coverUrl]);

  // Sync playback state
  useEffect(() => {
    if (!hasMediaSession()) {
      return;
    }

    navigator.mediaSession.playbackState = !currentTrack
      ? 'none'
      : isPlaying
        ? 'playing'
        : 'paused';
  }, [currentTrack, isPlaying]);

  // Sync playback position state
  useEffect(() => {
    if (
      !hasMediaSession() ||
      typeof navigator.mediaSession.setPositionState !== 'function'
    ) {
      return;
    }

    if (!currentTrack) {
      try {
        navigator.mediaSession.setPositionState();
      } catch {
        // ignore unsupported clear call
      }
      return;
    }

    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return;
    }

    const safePosition = Number.isFinite(positionSeconds)
      ? Math.min(Math.max(0, positionSeconds), durationSeconds)
      : 0;

    try {
      navigator.mediaSession.setPositionState({
        duration: durationSeconds,
        playbackRate: 1,
        position: safePosition,
      });
    } catch {
      // ignore transient or unsupported setPositionState errors
    }
  }, [currentTrack, durationSeconds, positionSeconds]);

  // Register OS media control handlers once and clean up on unmount
  useEffect(() => {
    if (!hasMediaSession()) {
      return;
    }

    const clampSeekTime = (seconds: number): number => {
      const { durationSeconds: currentDuration } = timingRef.current;
      if (Number.isFinite(currentDuration) && currentDuration > 0) {
        return Math.min(Math.max(0, seconds), currentDuration);
      }
      return Math.max(0, seconds);
    };

    setActionHandlerSafe('play', () => {
      callbacksRef.current.onPlay();
    });
    setActionHandlerSafe('pause', () => {
      callbacksRef.current.onPause();
    });
    setActionHandlerSafe('previoustrack', () => {
      callbacksRef.current.onPreviousTrack();
    });
    setActionHandlerSafe('nexttrack', () => {
      callbacksRef.current.onNextTrack();
    });
    setActionHandlerSafe('seekto', (details) => {
      if (
        typeof details.seekTime !== 'number' ||
        !Number.isFinite(details.seekTime)
      ) {
        return;
      }
      callbacksRef.current.onSeekTo(clampSeekTime(details.seekTime));
    });
    setActionHandlerSafe('seekbackward', (details) => {
      const offset =
        typeof details.seekOffset === 'number' &&
        Number.isFinite(details.seekOffset) &&
        details.seekOffset > 0
          ? details.seekOffset
          : DEFAULT_SEEK_OFFSET_SECONDS;
      const currentPosition = Number.isFinite(timingRef.current.positionSeconds)
        ? timingRef.current.positionSeconds
        : 0;
      callbacksRef.current.onSeekTo(clampSeekTime(currentPosition - offset));
    });
    setActionHandlerSafe('seekforward', (details) => {
      const offset =
        typeof details.seekOffset === 'number' &&
        Number.isFinite(details.seekOffset) &&
        details.seekOffset > 0
          ? details.seekOffset
          : DEFAULT_SEEK_OFFSET_SECONDS;
      const currentPosition = Number.isFinite(timingRef.current.positionSeconds)
        ? timingRef.current.positionSeconds
        : 0;
      callbacksRef.current.onSeekTo(clampSeekTime(currentPosition + offset));
    });

    const actions: MediaSessionAction[] = [
      'play',
      'pause',
      'previoustrack',
      'nexttrack',
      'seekto',
      'seekbackward',
      'seekforward',
    ];

    return () => {
      for (const action of actions) {
        setActionHandlerSafe(action, null);
      }
    };
  }, []);
}
