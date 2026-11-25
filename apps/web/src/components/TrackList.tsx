import {
  AudioQuality,
  type LibraryFolderDto,
  type TrackDto,
} from '@my-spotify/shared-types';
import { resolveMediaUrl } from '../api/client.ts';
import {
  ClockIcon,
  FolderIcon,
  FolderPlusIcon,
  HeartIcon,
  MusicNoteIcon,
  PauseIcon,
  PlayIcon,
  RefreshIcon,
  SearchIcon,
  ShuffleIcon,
} from './Icons.tsx';
import { formatDuration, formatTotalDuration } from '../utils/format.ts';

interface TrackListProps {
  title: string;
  eyebrow: string;
  description: string;
  folderPath?: string | null;
  tracks: TrackDto[];
  libraries: LibraryFolderDto[];
  isLoadingTracks: boolean;
  isScanning: boolean;
  isDbConnected: boolean;
  isApiConnected: boolean;
  serverBaseUrl: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  currentTrackId: string | null;
  isPlaying: boolean;
  isShuffled: boolean;
  onSelectTrack: (track: TrackDto) => void;
  onTogglePlayList: () => void;
  onToggleShuffle: () => void;
  onToggleLike: (trackId: string) => void;
  onOpenLibraryManager: () => void;
  onRescan: () => void;
  scanBanner: string | null;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

const QUALITY_LABELS: Record<AudioQuality, string> = {
  [AudioQuality.LOSSLESS]: 'FLAC',
  [AudioQuality.HIGH]: '320K',
  [AudioQuality.STANDARD]: 'STD',
};

export function TrackList({
  title,
  eyebrow,
  description,
  folderPath,
  tracks,
  libraries,
  isLoadingTracks,
  isScanning,
  isDbConnected,
  isApiConnected,
  serverBaseUrl,
  searchQuery,
  onSearchChange,
  currentTrackId,
  isPlaying,
  isShuffled,
  onSelectTrack,
  onTogglePlayList,
  onToggleShuffle,
  onToggleLike,
  onOpenLibraryManager,
  onRescan,
  scanBanner,
  searchInputRef,
}: TrackListProps) {
  const totalDurationSeconds = tracks.reduce(
    (sum, track) => sum + track.durationSeconds,
    0,
  );
  const isCurrentListPlaying =
    isPlaying && tracks.some((track) => track.id === currentTrackId);

  const heroTrackWithCover = tracks.find((track) => Boolean(track.coverUrl));
  const heroCoverUrl = resolveMediaUrl(
    serverBaseUrl,
    heroTrackWithCover?.coverUrl ?? null,
  );

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
            placeholder="서버 내 트랙, 아티스트, 앨범 검색..."
            aria-label="서버 내 트랙, 아티스트, 앨범 검색"
          />
        </div>
        <div className="topbar-actions">
          <span className="topbar-meta mono">{tracks.length} tracks</span>
          <button
            id="btn-topbar-folders"
            type="button"
            className="btn-ghost-sm"
            onClick={onOpenLibraryManager}
          >
            <FolderPlusIcon className="icon-xs" />
            <span>폴더 설정</span>
          </button>
        </div>
      </div>

      {scanBanner && (
        <div className="scan-toast" role="status">
          {scanBanner}
        </div>
      )}

      <header className="playlist-hero">
        {heroCoverUrl ? (
          <img
            src={heroCoverUrl}
            alt={`${title} artwork`}
            className="hero-cover"
          />
        ) : (
          <div className="hero-cover hero-cover-fallback" aria-hidden="true">
            {folderPath ? (
              <FolderIcon className="hero-fallback-icon" />
            ) : (
              <MusicNoteIcon className="hero-fallback-icon" />
            )}
          </div>
        )}
        <div className="hero-content">
          <span className="hero-eyebrow">{eyebrow}</span>
          <h1 className="hero-title">{title}</h1>
          <p className="hero-description">{description}</p>
          {folderPath && <code className="hero-path">{folderPath}</code>}
          <div className="hero-stats">
            <span>{libraries.length}개 폴더 연결</span>
            <span aria-hidden="true">•</span>
            <span>{tracks.length}곡</span>
            {totalDurationSeconds > 0 && (
              <>
                <span aria-hidden="true">•</span>
                <span>{formatTotalDuration(totalDurationSeconds)}</span>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="playlist-actions">
        <button
          id="btn-playlist-play"
          type="button"
          className="btn-primary-play"
          disabled={tracks.length === 0}
          onClick={onTogglePlayList}
          aria-label={isCurrentListPlaying ? '재생 일시정지' : '전체 재생'}
        >
          {isCurrentListPlaying ? (
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

        <button
          id="btn-playlist-rescan"
          type="button"
          className="btn-action-ghost"
          disabled={isScanning || !isDbConnected || libraries.length === 0}
          onClick={onRescan}
        >
          <RefreshIcon
            className={`icon-sm ${isScanning ? 'is-spinning' : ''}`}
          />
          <span>{isScanning ? '스캔 중...' : '폴더 다시 스캔'}</span>
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

        {isLoadingTracks ? (
          <div className="empty-state">
            <p>스트리밍 서버에서 음원 목록을 불러오는 중...</p>
          </div>
        ) : tracks.length === 0 ? (
          <div className="empty-state">
            {!isApiConnected ? (
              <>
                <h2 className="empty-title">스트리밍 서버에 연결할 수 없습니다</h2>
                <p>
                  백엔드 서버가 실행 중인지 확인하거나 서버 주소를 설정해
                  주세요.
                </p>
                <button
                  type="button"
                  className="btn-primary-solid"
                  onClick={onOpenLibraryManager}
                >
                  서버 연결 설정
                </button>
              </>
            ) : !isDbConnected ? (
              <>
                <h2 className="empty-title">PostgreSQL 연결 대기 중</h2>
                <p>
                  루트 디렉터리에서 <code>pnpm db:up</code> 명령으로
                  PostgreSQL을 실행하면 음원 인덱싱을 시작할 수 있습니다.
                </p>
              </>
            ) : searchQuery.trim() ? (
              <p>
                검색어 &ldquo;{searchQuery}&rdquo;와 일치하는 서버 음원이
                없습니다.
              </p>
            ) : libraries.length === 0 ? (
              <>
                <h2 className="empty-title">
                  아직 연결된 음원 폴더가 없습니다
                </h2>
                <p>
                  개인 음원 파일(.mp3, .flac, .m4a, .wav, .ogg 등)이 들어있는
                  서버 폴더를 선택하면 자동으로 스캔되어 재생 목록에 표시됩니다.
                </p>
                <button
                  id="btn-empty-select-folder"
                  type="button"
                  className="btn-primary-solid"
                  onClick={onOpenLibraryManager}
                >
                  <FolderPlusIcon className="icon-sm" />
                  <span>음원 폴더 선택 및 스캔</span>
                </button>
              </>
            ) : (
              <>
                <h2 className="empty-title">스캔된 음원 파일이 없습니다</h2>
                <p>
                  등록된 폴더에 지원되는 오디오 파일(.mp3, .flac, .m4a, .wav,
                  .ogg, .opus, .aac)을 넣으면 자동으로 감지됩니다.
                </p>
                <div className="empty-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={onRescan}
                  >
                    지금 다시 스캔
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={onOpenLibraryManager}
                  >
                    다른 폴더 추가
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="track-rows" role="list">
            {tracks.map((track, idx) => {
              const isCurrent = track.id === currentTrackId;
              const isTrackPlaying = isCurrent && isPlaying;
              const coverSrc = resolveMediaUrl(serverBaseUrl, track.coverUrl);

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
                    {coverSrc ? (
                      <img
                        src={coverSrc}
                        alt={`${track.album} cover`}
                        className="track-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className="track-cover track-cover-fallback"
                        aria-hidden="true"
                      >
                        <MusicNoteIcon className="icon-xs" />
                      </div>
                    )}
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
                        track.bitrateKbps
                          ? `${track.codec ?? 'Audio'} · ${track.bitrateKbps} kbps`
                          : track.codec
                      }
                    >
                      {track.bitrateKbps && track.quality !== AudioQuality.LOSSLESS
                        ? `${track.bitrateKbps}K`
                        : QUALITY_LABELS[track.quality]}
                    </span>
                  </div>

                  <div className="col-duration">
                    <button
                      id={`like-track-${track.id}`}
                      type="button"
                      className={`like-button ${track.isLiked ? 'is-liked' : ''}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleLike(track.id);
                      }}
                      aria-label={track.isLiked ? '좋아요 취소' : '좋아요'}
                      aria-pressed={track.isLiked}
                    >
                      <HeartIcon className="icon-xs" filled={track.isLiked} />
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
