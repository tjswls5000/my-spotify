import {
  AudioQuality,
  type PlaylistDto,
  type TrackDto,
} from '@my-spotify/shared-types';
import {
  ClockIcon,
  HeartIcon,
  PauseIcon,
  PlayIcon,
  SearchIcon,
  ShuffleIcon,
} from './Icons.tsx';
import { formatDuration, formatTotalDuration } from '../utils/format.ts';

interface TrackListProps {
  playlist: PlaylistDto;
  tracks: TrackDto[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  currentTrackId: string | null;
  isPlaying: boolean;
  isShuffled: boolean;
  likedTrackIds: ReadonlySet<string>;
  onSelectTrack: (track: TrackDto) => void;
  onTogglePlayPlaylist: () => void;
  onToggleShuffle: () => void;
  onToggleLike: (trackId: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

const QUALITY_LABELS: Record<AudioQuality, string> = {
  [AudioQuality.LOSSLESS]: 'FLAC',
  [AudioQuality.HIGH]: '320K',
  [AudioQuality.STANDARD]: '192K',
};

export function TrackList({
  playlist,
  tracks,
  searchQuery,
  onSearchChange,
  currentTrackId,
  isPlaying,
  isShuffled,
  likedTrackIds,
  onSelectTrack,
  onTogglePlayPlaylist,
  onToggleShuffle,
  onToggleLike,
  searchInputRef,
}: TrackListProps) {
  const isPlaylistPlaying =
    isPlaying && tracks.some((track) => track.id === currentTrackId);

  return (
    <main className="main-view">
      <div className="main-topbar">
        <div className="search-field">
          <SearchIcon className="search-field-icon" />
          <input
            ref={searchInputRef}
            id="track-search-input"
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="트랙, 아티스트, 앨범 검색..."
            aria-label="트랙, 아티스트, 앨범 검색"
          />
        </div>
        <div className="topbar-meta">
          <span className="mono">{tracks.length} tracks</span>
        </div>
      </div>

      <header className="playlist-hero">
        <img
          src={playlist.coverUrl}
          alt={`${playlist.name} artwork`}
          className="hero-cover"
        />
        <div className="hero-content">
          <span className="hero-eyebrow">CURATED PLAYLIST</span>
          <h1 className="hero-title">{playlist.name}</h1>
          <p className="hero-description">{playlist.description}</p>
          <div className="hero-stats">
            <span>my-spotify</span>
            <span aria-hidden="true">•</span>
            <span>{playlist.trackCount}곡</span>
            <span aria-hidden="true">•</span>
            <span>{formatTotalDuration(playlist.totalDurationSeconds)}</span>
          </div>
        </div>
      </header>

      <div className="playlist-actions">
        <button
          id="btn-playlist-play"
          type="button"
          className="btn-primary-play"
          onClick={onTogglePlayPlaylist}
          aria-label={isPlaylistPlaying ? '재생 일시정지' : '플레이리스트 재생'}
        >
          {isPlaylistPlaying ? (
            <PauseIcon className="icon-md" />
          ) : (
            <PlayIcon className="icon-md play-offset" />
          )}
        </button>

        <button
          id="btn-playlist-shuffle"
          type="button"
          className={`btn-action-ghost ${isShuffled ? 'is-active' : ''}`}
          onClick={onToggleShuffle}
          aria-pressed={isShuffled}
        >
          <ShuffleIcon className="icon-sm" />
          <span>셔플</span>
        </button>
      </div>

      <section className="track-table-wrap" aria-label="Track list">
        <div className="track-table-header" role="row">
          <span className="col-index">#</span>
          <span className="col-title">제목</span>
          <span className="col-album">앨범</span>
          <span className="col-quality">음질</span>
          <span className="col-duration" aria-label="재생 시간">
            <ClockIcon className="icon-xs" />
          </span>
        </div>

        {tracks.length === 0 ? (
          <div className="empty-state">
            <p>검색어 &ldquo;{searchQuery}&rdquo;와 일치하는 트랙이 없습니다.</p>
          </div>
        ) : (
          <div className="track-rows" role="list">
            {tracks.map((track, idx) => {
              const isCurrent = track.id === currentTrackId;
              const isTrackPlaying = isCurrent && isPlaying;
              const isLiked = likedTrackIds.has(track.id);

              return (
                <div
                  key={track.id}
                  role="listitem"
                  className={`track-row ${isCurrent ? 'is-current' : ''}`}
                  onClick={() => onSelectTrack(track)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectTrack(track);
                    }
                  }}
                  tabIndex={0}
                >
                  <div className="col-index">
                    {isTrackPlaying ? (
                      <span className="equalizer" aria-label="재생 중">
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : (
                      <span className="track-num mono">{idx + 1}</span>
                    )}
                    <span className="track-play-indicator" aria-hidden="true">
                      {isTrackPlaying ? (
                        <PauseIcon className="icon-xs" />
                      ) : (
                        <PlayIcon className="icon-xs" />
                      )}
                    </span>
                  </div>

                  <div className="col-title">
                    <img
                      src={track.coverUrl}
                      alt={`${track.album} cover`}
                      className="track-cover"
                      loading="lazy"
                    />
                    <div className="track-info">
                      <span className="track-name">{track.title}</span>
                      <span className="track-artist">{track.artist}</span>
                    </div>
                  </div>

                  <div className="col-album">
                    <span className="track-album">{track.album}</span>
                  </div>

                  <div className="col-quality">
                    <span
                      className={`quality-badge is-${track.quality}`}
                      title={
                        track.bitrateKbps ? `${track.bitrateKbps} kbps` : undefined
                      }
                    >
                      {QUALITY_LABELS[track.quality]}
                    </span>
                  </div>

                  <div className="col-duration">
                    <button
                      id={`like-track-${track.id}`}
                      type="button"
                      className={`like-button ${isLiked ? 'is-liked' : ''}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleLike(track.id);
                      }}
                      aria-label={isLiked ? '좋아요 취소' : '좋아요'}
                      aria-pressed={isLiked}
                    >
                      <HeartIcon className="icon-xs" filled={isLiked} />
                    </button>
                    <span className="track-duration mono">
                      {formatDuration(track.durationSeconds)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
