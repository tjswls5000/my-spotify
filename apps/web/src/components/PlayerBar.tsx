import {
  AudioQuality,
  RepeatMode,
  type PlaybackStateDto,
  type TrackDto,
} from '@my-spotify/shared-types';
import {
  HeartIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  ShuffleIcon,
  SkipNextIcon,
  SkipPrevIcon,
  VolumeIcon,
} from './Icons.tsx';
import { formatDuration } from '../utils/format.ts';

interface PlayerBarProps {
  currentTrack: TrackDto | null;
  playback: PlaybackStateDto;
  isLiked: boolean;
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
  [AudioQuality.HIGH]: 'High · 320k',
  [AudioQuality.STANDARD]: 'Standard',
};

export function PlayerBar({
  currentTrack,
  playback,
  isLiked,
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
  const duration = currentTrack?.durationSeconds ?? 0;
  const progressPercent =
    duration > 0 ? Math.min(100, (playback.positionSeconds / duration) * 100) : 0;
  const volumePercent = Math.round(playback.volume * 100);

  return (
    <footer className="player-bar" aria-label="Audio playback controls">
      <div className="player-now-playing">
        {currentTrack ? (
          <>
            <img
              src={currentTrack.coverUrl}
              alt={`${currentTrack.title} cover`}
              className="player-cover"
            />
            <div className="player-track-meta">
              <span className="player-track-title">{currentTrack.title}</span>
              <span className="player-track-artist">{currentTrack.artist}</span>
            </div>
            <button
              id="btn-player-like"
              type="button"
              className={`icon-button ${isLiked ? 'is-accent' : ''}`}
              onClick={onToggleLike}
              aria-label={isLiked ? '현재 곡 좋아요 취소' : '현재 곡 좋아요'}
              aria-pressed={isLiked}
            >
              <HeartIcon className="icon-sm" filled={isLiked} />
            </button>
          </>
        ) : (
          <span className="player-empty">재생할 트랙을 선택해 주세요</span>
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
          </span>
        )}
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
