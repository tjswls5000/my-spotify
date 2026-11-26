import { useCallback, useRef, useState } from 'react';
import type { TrackDto } from '@my-spotify/shared-types';

export interface QueueItem {
  uid: string;
  track: TrackDto;
}

export interface UsePlaybackQueueResult {
  upNext: QueueItem[];
  playNext: (track: TrackDto) => void;
  addToQueue: (track: TrackDto) => void;
  removeFromQueue: (uid: string) => void;
  moveQueueItem: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  consumeNextQueuedTrack: () => TrackDto | null;
  jumpToQueueItem: (uid: string) => TrackDto | null;
}

let queueUidCounter = 0;

function createQueueUid(trackId: string): string {
  queueUidCounter += 1;
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `${trackId}-${crypto.randomUUID()}`;
  }
  return `${trackId}-${Date.now()}-${queueUidCounter}`;
}

export function usePlaybackQueue(): UsePlaybackQueueResult {
  const [upNext, setUpNext] = useState<QueueItem[]>([]);
  const upNextRef = useRef<QueueItem[]>([]);

  const updateQueue = useCallback((nextItems: QueueItem[]) => {
    upNextRef.current = nextItems;
    setUpNext(nextItems);
  }, []);

  const playNext = useCallback(
    (track: TrackDto) => {
      const nextItem: QueueItem = {
        uid: createQueueUid(track.id),
        track,
      };
      updateQueue([nextItem, ...upNextRef.current]);
    },
    [updateQueue],
  );

  const addToQueue = useCallback(
    (track: TrackDto) => {
      const nextItem: QueueItem = {
        uid: createQueueUid(track.id),
        track,
      };
      updateQueue([...upNextRef.current, nextItem]);
    },
    [updateQueue],
  );

  const removeFromQueue = useCallback(
    (uid: string) => {
      const current = upNextRef.current;
      const next = current.filter((item) => item.uid !== uid);
      if (next.length === current.length) {
        return;
      }
      updateQueue(next);
    },
    [updateQueue],
  );

  const moveQueueItem = useCallback(
    (fromIndex: number, toIndex: number) => {
      const current = upNextRef.current;
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= current.length ||
        toIndex >= current.length
      ) {
        return;
      }

      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) {
        return;
      }
      next.splice(toIndex, 0, moved);
      updateQueue(next);
    },
    [updateQueue],
  );

  const clearQueue = useCallback(() => {
    if (upNextRef.current.length === 0) {
      return;
    }
    updateQueue([]);
  }, [updateQueue]);

  const consumeNextQueuedTrack = useCallback((): TrackDto | null => {
    const current = upNextRef.current;
    const [first, ...rest] = current;
    if (!first) {
      return null;
    }
    updateQueue(rest);
    return first.track;
  }, [updateQueue]);

  const jumpToQueueItem = useCallback(
    (uid: string): TrackDto | null => {
      const current = upNextRef.current;
      const targetIndex = current.findIndex((item) => item.uid === uid);
      if (targetIndex === -1) {
        return null;
      }
      const targetItem = current[targetIndex];
      if (!targetItem) {
        return null;
      }
      updateQueue(current.slice(targetIndex + 1));
      return targetItem.track;
    },
    [updateQueue],
  );

  return {
    upNext,
    playNext,
    addToQueue,
    removeFromQueue,
    moveQueueItem,
    clearQueue,
    consumeNextQueuedTrack,
    jumpToQueueItem,
  };
}
