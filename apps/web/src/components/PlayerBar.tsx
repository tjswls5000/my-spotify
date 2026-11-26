import {
  AudioQuality,
  RepeatMode,
  type PlaybackStateDto,
  type TrackDto,
} from '@my-spotify/shared-types';
import { resolveMediaUrl } from '../api/client.ts';
import {
  HeartIcon,
  MusicNoteIcon,
  PauseIcon,
  PlayIcon,
  QueueListIcon,
  RepeatIcon,
  ShuffleIcon,
  SkipNextIcon,
  SkipPrevIcon,
  VolumeIcon,
} from './Icons.tsx';
import { formatDuration } from '../utils/format.ts';

interface PlayerBarProps {
  currentTrack: TrackDto | null;
  serverBaseUrl: string;
  playback: PlaybackStateDto;
  durationSeconds: number;
  isBuffering: boolean;
  playbackError: string | null;
  queueCount: number;
  isQueueOpen: boolean;
  onToggleQueue: () => void;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onToggleLike: () => void;
}

const QUALITY_TEXT: Record<AudioQuality, string> = {
  [AudioQuality.LOSSLESS]: 'Lossless',
  [AudioQuality.HIGH]: 'High',
  [AudioQuality.STANDARD]: 'Standard',
};

export function PlayerBar({
  currentTrack,
  serverBaseUrl,
  playback,
  durationSeconds,
  isBuffering,
  playbackError,
  queueCount,
  isQueueOpen,
  onToggleQueue,
  onTogglePlay,
  onPrev,
  onNext,
  onSeek,
  onToggleShuffle,
  onCycleRepeat,
  onVolumeChange,
  onToggleMute,
  onToggleLike,
}: PlayerBarProps) {
  const duration = durationSeconds || currentTrack?.durationSeconds || 0;
  const progressPercent =
    duration > 0 ? Math.min(100, (playback.positionSeconds / duration) * 100) : 0;
  const volumePercent = Math.round(playback.volume * 100);
  const coverSrc = resolveMediaUrl(serverBaseUrl, currentTrack?.coverUrl ?? null);

  return (
    <footer className="player-bar" aria-label="Audio playback controls">
      <div className="player-now-playing">
        {currentTrack ? (
          <>
            {coverSrc ? (
              <img
                src={coverSrc}
                alt={`${currentTrack.title} cover`}
                className="player-cover"
              />
            ) : (
              <div
                className="player-cover player-cover-fallback"
                aria-hidden="true"
              >
                <MusicNoteIcon className="icon-md" />
              </div>
            )}
            <div className="player-track-meta">
              <span className="player-track-title">{currentTrack.title}</span>
              <span className="player-track-artist">
                {playbackError
                  ? playbackError
                  : isBuffering
                    ? '스트리밍 버퍼링 중...'
                    : currentTrack.artist}
              </span>
            </div>
            <button
              id="btn-player-like"
              type="button"
              className={`icon-button ${currentTrack.isLiked ? 'is-accent' : ''}`}
              onClick={onToggleLike}
              aria-label={
                currentTrack.isLiked ? '현재 곡 좋아요 취소' : '현재 곡 좋아요'
              }
              aria-pressed={currentTrack.isLiked}
            >
              <HeartIcon className="icon-sm" filled={currentTrack.isLiked} />
            </button>
          </>
        ) : (
          <span className="player-empty">
            서버에 스캔된 트랙을 클릭해 재생하세요
          </span>
        )}
      </div>

      <div className="player-center">
        <div className="transport-controls">
          <button
            id="btn-player-shuffle"
            type="button"
            className={`icon-button ${playback.isShuffled ? 'is-accent' : ''}`}
            onClick={onToggleShuffle}
            aria-label="셔플 토글"
            aria-pressed={playback.isShuffled}
            title="셔플"
          >
            <ShuffleIcon className="icon-sm" />
          </button>

          <button
            id="btn-player-prev"
            type="button"
            className="icon-button"
            disabled={!currentTrack}
            onClick={onPrev}
            aria-label="이전 트랙"
            title="이전 트랙"
          >
            <SkipPrevIcon className="icon-md" />
          </button>

          <button
            id="btn-player-toggle"
            type="button"
            className="btn-player-play"
            disabled={!currentTrack}
            onClick={onTogglePlay}
            aria-label={playback.isPlaying ? '일시정지' : '재생'}
            title={playback.isPlaying ? '일시정지 (Space)' : '재생 (Space)'}
          >
            {playback.isPlaying ? (
              <PauseIcon className="icon-sm" />
            ) : (
              <PlayIcon className="icon-sm play-offset" />
            )}
          </button>

          <button
            id="btn-player-next"
            type="button"
            className="icon-button"
            disabled={!currentTrack}
            onClick={onNext}
            aria-label="다음 트랙"
            title="다음 트랙"
          >
            <SkipNextIcon className="icon-md" />
          </button>

          <button
            id="btn-player-repeat"
            type="button"
            className={`icon-button repeat-btn ${
              playback.repeatMode !== RepeatMode.OFF ? 'is-accent' : ''
            }`}
            onClick={onCycleRepeat}
            aria-label={`반복 모드: ${playback.repeatMode}`}
            title={`반복 모드: ${playback.repeatMode}`}
          >
            <RepeatIcon className="icon-sm" />
            {playback.repeatMode === RepeatMode.ONE && (
              <span className="repeat-one-badge">1</span>
            )}
          </button>
        </div>

        <div className="progress-bar-row">
          <span className="time-label mono">
            {formatDuration(playback.positionSeconds)}
          </span>
          <input
            id="player-seek-slider"
            type="range"
            className="range-slider"
            min={0}
            max={duration || 100}
            step={0.5}
            value={Math.min(playback.positionSeconds, duration || 100)}
            onChange={(event) => onSeek(Number(event.target.value))}
            disabled={!currentTrack}
            aria-label="재생 위치 탐색"
            style={{
              ['--range-progress' as string]: `${progressPercent}%`,
            }}
          />
          <span className="time-label mono">{formatDuration(duration)}</span>
        </div>
      </div>

      <div className="player-right">
        {currentTrack && (
          <span className={`quality-pill is-${currentTrack.quality}`}>
            {QUALITY_TEXT[currentTrack.quality]}
            {currentTrack.bitrateKbps ? ` · ${currentTrack.bitrateKbps}k` : ''}
          </span>
        )}

        <button
          id="btn-player-queue"
          type="button"
          className={`icon-button queue-toggle-btn ${
            isQueueOpen ? 'is-accent' : ''
          }`}
          onClick={onToggleQueue}
          aria-label="재생 대기열 열기"
          aria-pressed={isQueueOpen}
          title={
            queueCount > 0
              ? `재생 대기열 (${queueCount}곡 대기 중)`
              : '재생 대기열'
          }
        >
          <QueueListIcon className="icon-sm" />
          {queueCount > 0 && (
            <span className="queue-btn-badge mono">
              {queueCount > 99 ? '99+' : queueCount}
            </span>
          )}
        </button>

        <div className="volume-control">
          <button
            id="btn-player-mute"
            type="button"
            className="icon-button"
            onClick={onToggleMute}
            aria-label={playback.volume === 0 ? '음소거 해제' : '음소거'}
          >
            <VolumeIcon className="icon-sm" muted={playback.volume === 0} />
          </button>
          <input
            id="player-volume-slider"
            type="range"
            className="range-slider volume-slider"
            min={0}
            max={100}
            value={volumePercent}
            onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
            aria-label="볼륨 조절"
            style={{
              ['--range-progress' as string]: `${volumePercent}%`,
            }}
          />
        </div>
      </div>
    </footer>
  );
}
