import { useEffect, useRef } from 'react';
import type { TrackDto } from '@my-spotify/shared-types';
import { resolveMediaUrl } from '../api/client.ts';
import type { QueueItem } from '../hooks/usePlaybackQueue.ts';
import { formatDuration } from '../utils/format.ts';
import {
  ChevronUpIcon,
  CloseIcon,
  MusicNoteIcon,
  PlayIcon,
  TrashIcon,
} from './Icons.tsx';
import '../styles/queue.css';

export interface QueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  serverBaseUrl: string;
  currentTrack: TrackDto | null;
  isPlaying: boolean;
  upNext: QueueItem[];
  upcomingContextTracks: TrackDto[];
  onPlayTrack: (track: TrackDto) => void;
  onPlayQueueItem: (uid: string) => void;
  onRemoveQueueItem: (uid: string) => void;
  onMoveQueueItem: (fromIndex: number, toIndex: number) => void;
  onClearQueue: () => void;
}

export function QueueDrawer({
  isOpen,
  onClose,
  serverBaseUrl,
  currentTrack,
  isPlaying,
  upNext,
  upcomingContextTracks,
  onPlayTrack,
  onPlayQueueItem,
  onRemoveQueueItem,
  onMoveQueueItem,
  onClearQueue,
}: QueueDrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      panelRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const currentCoverUrl = resolveMediaUrl(
    serverBaseUrl,
    currentTrack?.coverUrl ?? null,
  );

  return (
    <div
      className="queue-drawer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="재생 대기열"
      onClick={onClose}
    >
      <aside
        ref={panelRef}
        tabIndex={-1}
        className="queue-drawer-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="queue-drawer-header">
          <div className="queue-drawer-heading">
            <h2 className="queue-drawer-title">재생 대기열</h2>
            <span className="queue-drawer-subtitle">
              {upNext.length > 0
                ? `대기 중인 곡 ${upNext.length}곡`
                : '다음에 재생할 트랙을 관리합니다'}
            </span>
          </div>
          <button
            id="btn-close-queue-drawer"
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="재생 대기열 닫기"
          >
            <CloseIcon className="icon-md" />
          </button>
        </header>

        <div className="queue-drawer-body">
          {/* 1. Now Playing */}
          <section className="queue-section" aria-label="지금 재생 중">
            <div className="queue-section-header">
              <h3 className="queue-section-title">지금 재생 중</h3>
            </div>

            {currentTrack ? (
              <div
                className={`queue-now-playing-card ${isPlaying ? 'is-playing' : ''}`}
              >
                <div className="queue-cover-wrap is-lg">
                  {currentCoverUrl ? (
                    <img
                      src={currentCoverUrl}
                      alt={`${currentTrack.title} cover`}
                      className="queue-cover-img"
                    />
                  ) : (
                    <div
                      className="queue-cover-fallback"
                      aria-hidden="true"
                    >
                      <MusicNoteIcon className="icon-sm" />
                    </div>
                  )}
                </div>

                <div className="queue-track-meta">
                  <span className="queue-track-title is-accent">
                    {currentTrack.title}
                  </span>
                  <span className="queue-track-sub">
                    {currentTrack.artist}
                    {currentTrack.album ? ` · ${currentTrack.album}` : ''}
                  </span>
                </div>

                <div className="queue-now-playing-status">
                  {isPlaying ? (
                    <span className="equalizer" aria-label="재생 중">
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : (
                    <span className="queue-paused-pill">일시정지</span>
                  )}
                  <span className="queue-duration mono">
                    {formatDuration(currentTrack.durationSeconds)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="queue-empty-note">
                현재 재생 중인 트랙이 없습니다.
              </p>
            )}
          </section>

          {/* 2. Explicit Up Next Queue */}
          <section className="queue-section" aria-label="다음 재생 대기열">
            <div className="queue-section-header">
              <div className="queue-section-title-group">
                <h3 className="queue-section-title">다음 재생 대기열</h3>
                {upNext.length > 0 && (
                  <span className="queue-count-badge mono">
                    {upNext.length}
                  </span>
                )}
              </div>
              {upNext.length > 0 && (
                <button
                  id="btn-clear-queue"
                  type="button"
                  className="queue-clear-button"
                  onClick={onClearQueue}
                >
                  비우기
                </button>
              )}
            </div>

            {upNext.length === 0 ? (
              <p className="queue-empty-note">
                대기열에 추가된 곡이 없습니다. 트랙 목록에서 다음 재생 또는
                대기열 추가를 눌러 곡을 예약하세요.
              </p>
            ) : (
              <ol className="queue-list">
                {upNext.map((item, index) => {
                  const coverUrl = resolveMediaUrl(
                    serverBaseUrl,
                    item.track.coverUrl,
                  );
                  return (
                    <li key={item.uid} className="queue-row">
                      <button
                        type="button"
                        className="queue-row-main"
                        onClick={() => onPlayQueueItem(item.uid)}
                        aria-label={`${item.track.title} 바로 재생`}
                      >
                        <div className="queue-cover-wrap">
                          {coverUrl ? (
                            <img
                              src={coverUrl}
                              alt={`${item.track.title} cover`}
                              className="queue-cover-img"
                              loading="lazy"
                            />
                          ) : (
                            <div
                              className="queue-cover-fallback"
                              aria-hidden="true"
                            >
                              <MusicNoteIcon className="icon-xs" />
                            </div>
                          )}
                          <span
                            className="queue-cover-play-overlay"
                            aria-hidden="true"
                          >
                            <PlayIcon className="icon-xs play-offset" />
                          </span>
                        </div>

                        <div className="queue-track-meta">
                          <span className="queue-track-title">
                            {item.track.title}
                          </span>
                          <span className="queue-track-sub">
                            {item.track.artist}
                          </span>
                        </div>

                        <span className="queue-duration mono">
                          {formatDuration(item.track.durationSeconds)}
                        </span>
                      </button>

                      <div className="queue-row-actions">
                        <button
                          type="button"
                          className="icon-button subtle queue-action-btn"
                          disabled={index === 0}
                          onClick={() => onMoveQueueItem(index, index - 1)}
                          title="위로 이동"
                          aria-label={`${item.track.title} 위로 이동`}
                        >
                          <ChevronUpIcon className="icon-xs" />
                        </button>
                        <button
                          type="button"
                          className="icon-button subtle queue-action-btn"
                          disabled={index === upNext.length - 1}
                          onClick={() => onMoveQueueItem(index, index + 1)}
                          title="아래로 이동"
                          aria-label={`${item.track.title} 아래로 이동`}
                        >
                          <ChevronUpIcon className="icon-xs queue-chevron-down" />
                        </button>
                        <button
                          type="button"
                          className="icon-button subtle danger queue-action-btn"
                          onClick={() => onRemoveQueueItem(item.uid)}
                          title="대기열에서 제거"
                          aria-label={`${item.track.title} 대기열에서 제거`}
                        >
                          <TrashIcon className="icon-xs" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {/* 3. Upcoming Context Tracks */}
          <section className="queue-section" aria-label="이어서 재생할 목록">
            <div className="queue-section-header">
              <div className="queue-section-title-group">
                <h3 className="queue-section-title">이어서 재생할 목록</h3>
                {upcomingContextTracks.length > 0 && (
                  <span className="queue-count-badge mono">
                    {upcomingContextTracks.length}
                  </span>
                )}
              </div>
            </div>

            {upcomingContextTracks.length === 0 ? (
              <p className="queue-empty-note">
                이어서 재생할 트랙이 없습니다.
              </p>
            ) : (
              <ol className="queue-list">
                {upcomingContextTracks.map((track, index) => {
                  const coverUrl = resolveMediaUrl(
                    serverBaseUrl,
                    track.coverUrl,
                  );
                  return (
                    <li key={track.id} className="queue-row is-context">
                      <button
                        type="button"
                        className="queue-row-main"
                        onClick={() => onPlayTrack(track)}
                        aria-label={`${track.title} 재생`}
                      >
                        <span className="queue-context-index mono">
                          {index + 1}
                        </span>

                        <div className="queue-cover-wrap">
                          {coverUrl ? (
                            <img
                              src={coverUrl}
                              alt={`${track.title} cover`}
                              className="queue-cover-img"
                              loading="lazy"
                            />
                          ) : (
                            <div
                              className="queue-cover-fallback"
                              aria-hidden="true"
                            >
                              <MusicNoteIcon className="icon-xs" />
                            </div>
                          )}
                          <span
                            className="queue-cover-play-overlay"
                            aria-hidden="true"
                          >
                            <PlayIcon className="icon-xs play-offset" />
                          </span>
                        </div>

                        <div className="queue-track-meta">
                          <span className="queue-track-title">
                            {track.title}
                          </span>
                          <span className="queue-track-sub">
                            {track.artist}
                          </span>
                        </div>

                        <span className="queue-duration mono">
                          {formatDuration(track.durationSeconds)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
