import { useEffect, useRef, useState } from 'react';
import {
  AudioQuality,
  type LibraryFolderDto,
  type PlaylistDto,
  type TrackDto,
} from '@my-spotify/shared-types';
import { resolveMediaUrl } from '../api/client.ts';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  EditIcon,
  FolderIcon,
  FolderPlusIcon,
  HeartIcon,
  HistoryIcon,
  ListMusicIcon,
  LockIcon,
  MusicNoteIcon,
  PauseIcon,
  PlayIcon,
  PlayNextIcon,
  PlusIcon,
  QueueListIcon,
  RefreshIcon,
  SearchIcon,
  ShuffleIcon,
  TrashIcon,
} from './Icons.tsx';
import type { NavSection } from './Sidebar.tsx';
import { formatDuration, formatTotalDuration } from '../utils/format.ts';

export interface TrackRowItem {
  key: string;
  track: TrackDto;
  playedAt?: string;
}

interface TrackListProps {
  activeNav: NavSection;
  activePlaylist: PlaylistDto | null;
  playlists: PlaylistDto[];
  title: string;
  eyebrow: string;
  description: string;
  folderPath?: string | null;
  tracks: TrackDto[];
  trackRows?: TrackRowItem[];
  libraries: LibraryFolderDto[];
  isLoadingTracks: boolean;
  isScanning: boolean;
  isDbConnected: boolean;
  isApiConnected: boolean;
  isAuthLocked: boolean;
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
  onPlayNext: (track: TrackDto) => void;
  onAddToQueue: (track: TrackDto) => void;
  onAddTrackToPlaylist: (playlistId: string, trackId: string) => void;
  onCreatePlaylistWithTrack: (track: TrackDto) => void;
  onEditPlaylist: (playlist: PlaylistDto) => void;
  onDeletePlaylist: (playlist: PlaylistDto) => void;
  onRemoveTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  onMovePlaylistTrack: (
    playlistId: string,
    fromIndex: number,
    toIndex: number,
  ) => void;
  onOpenLibraryManager: () => void;
  onOpenAuthModal: () => void;
  onRescan: () => void;
  scanBanner: string | null;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

const QUALITY_LABELS: Record<AudioQuality, string> = {
  [AudioQuality.LOSSLESS]: 'FLAC',
  [AudioQuality.HIGH]: '320K',
  [AudioQuality.STANDARD]: 'STD',
};

function formatRelativePlayedAt(isoString: string): string {
  const timestamp = Date.parse(isoString);
  if (!Number.isFinite(timestamp)) {
    return '';
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) {
    return '방금 전';
  }
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}분 전`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}시간 전`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}일 전`;
  }
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export function TrackList({
  activeNav,
  activePlaylist,
  playlists,
  title,
  eyebrow,
  description,
  folderPath,
  tracks,
  trackRows,
  libraries,
  isLoadingTracks,
  isScanning,
  isDbConnected,
  isApiConnected,
  isAuthLocked,
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
  onPlayNext,
  onAddToQueue,
  onAddTrackToPlaylist,
  onCreatePlaylistWithTrack,
  onEditPlaylist,
  onDeletePlaylist,
  onRemoveTrackFromPlaylist,
  onMovePlaylistTrack,
  onOpenLibraryManager,
  onOpenAuthModal,
  onRescan,
  scanBanner,
  searchInputRef,
}: TrackListProps) {
  const [openMenuRowKey, setOpenMenuRowKey] = useState<string | null>(null);
  const [confirmDeletePlaylistId, setConfirmDeletePlaylistId] = useState<
    string | null
  >(null);
  const popoverContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openMenuRowKey) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        popoverContainerRef.current &&
        target &&
        !popoverContainerRef.current.contains(target)
      ) {
        setOpenMenuRowKey(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenuRowKey(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenuRowKey]);

  const rows: TrackRowItem[] =
    trackRows ?? tracks.map((track) => ({ key: track.id, track }));

  const totalDurationSeconds = tracks.reduce(
    (sum, track) => sum + track.durationSeconds,
    0,
  );
  const isCurrentListPlaying =
    isPlaying && tracks.some((track) => track.id === currentTrackId);

  const isPlaylistView = activeNav === 'playlist' && activePlaylist !== null;
  const isRecentView = activeNav === 'recent';
  const canReorderPlaylist = isPlaylistView && !searchQuery.trim();
  const isConfirmingDelete =
    activePlaylist !== null && confirmDeletePlaylistId === activePlaylist.id;

  const heroTrackWithCover = tracks.find((track) => Boolean(track.coverUrl));
  const heroCoverUrl = resolveMediaUrl(
    serverBaseUrl,
    (isPlaylistView ? activePlaylist.coverUrl : null) ??
      heroTrackWithCover?.coverUrl ??
      null,
  );

  if (isAuthLocked) {
    return (
      <main className="main-view">
        <div className="auth-lock-screen">
          <div className="auth-lock-card">
            <div className="auth-lock-icon-wrap" aria-hidden="true">
              <LockIcon className="auth-lock-icon" />
            </div>
            <span className="hero-eyebrow">REMOTE ACCESS PROTECTION</span>
            <h1 className="auth-lock-title">로그인이 필요한 서버입니다</h1>
            <p className="auth-lock-description">
              이 스트리밍 서버는 외부 접근 보안이 활성화되어 있습니다. 등록된
              계정으로 로그인하면 전체 음원, 커스텀 플레이리스트, 이어듣기 기록을
              바로 이용할 수 있습니다.
            </p>
            <div className="auth-lock-actions">
              <button
                id="btn-main-open-login"
                type="button"
                className="btn-primary-solid"
                onClick={onOpenAuthModal}
              >
                <LockIcon className="icon-sm" />
                <span>로그인하기</span>
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={onOpenLibraryManager}
              >
                서버 주소 변경
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

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
          <span className="topbar-meta mono">{rows.length} tracks</span>
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
            {isPlaylistView ? (
              <ListMusicIcon className="hero-fallback-icon" />
            ) : isRecentView ? (
              <HistoryIcon className="hero-fallback-icon" />
            ) : folderPath ? (
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
            {!isPlaylistView && !isRecentView && (
              <>
                <span>{libraries.length}개 폴더 연결</span>
                <span aria-hidden="true">•</span>
              </>
            )}
            <span>{rows.length}곡</span>
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

        {isPlaylistView ? (
          <>
            <button
              id="btn-playlist-edit"
              type="button"
              className="btn-action-ghost"
              onClick={() => onEditPlaylist(activePlaylist)}
            >
              <EditIcon className="icon-sm" />
              <span>플레이리스트 수정</span>
            </button>

            {isConfirmingDelete ? (
              <div className="inline-confirm-group">
                <button
                  id="btn-playlist-delete-confirm"
                  type="button"
                  className="btn-action-danger"
                  onClick={() => {
                    setConfirmDeletePlaylistId(null);
                    onDeletePlaylist(activePlaylist);
                  }}
                >
                  <TrashIcon className="icon-sm" />
                  <span>삭제 확인</span>
                </button>
                <button
                  type="button"
                  className="btn-action-ghost"
                  onClick={() => setConfirmDeletePlaylistId(null)}
                >
                  취소
                </button>
              </div>
            ) : (
              <button
                id="btn-playlist-delete"
                type="button"
                className="btn-action-ghost is-danger-hover"
                onClick={() => setConfirmDeletePlaylistId(activePlaylist.id)}
              >
                <TrashIcon className="icon-sm" />
                <span>삭제</span>
              </button>
            )}
          </>
        ) : (
          !isRecentView && (
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
          )
        )}
      </div>

      <section className="track-table-wrap" aria-label="Track list">
        <div
          className={`track-table-header track-grid-enhanced ${
            isPlaylistView ? 'is-playlist-view' : ''
          }`}
          role="row"
        >
          <span className="col-index">#</span>
          <span className="col-title">제목</span>
          <span className="col-album">{isRecentView ? '앨범 · 재생 시각' : '앨범'}</span>
          <span className="col-quality">음질</span>
          <span className="col-duration" aria-label="재생 시간">
            <ClockIcon className="icon-xs" />
          </span>
        </div>

        {isLoadingTracks ? (
          <div className="empty-state">
            <p>스트리밍 서버에서 음원 목록을 불러오는 중...</p>
          </div>
        ) : rows.length === 0 ? (
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
            ) : isPlaylistView ? (
              <>
                <h2 className="empty-title">플레이리스트가 비어 있습니다</h2>
                <p>
                  전체 음원이나 폴더 목록에서 각 트랙의 <code>+</code> 버튼을
                  눌러 이 플레이리스트에 곡을 담아보세요.
                </p>
              </>
            ) : isRecentView ? (
              <>
                <h2 className="empty-title">최근 재생 기록이 없습니다</h2>
                <p>
                  트랙을 10초 이상 듣거나 끝까지 재생하면 자동으로 최근 재생
                  목록에 기록됩니다.
                </p>
              </>
            ) : activeNav === 'liked' ? (
              <>
                <h2 className="empty-title">좋아요 표시한 곡이 없습니다</h2>
                <p>
                  마음에 드는 트랙의 하트 아이콘을 눌러 즐겨찾기 컬렉션을
                  만들어보세요.
                </p>
              </>
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
            {rows.map((row, idx) => {
              const { track, key: rowKey, playedAt } = row;
              const isCurrent = track.id === currentTrackId;
              const isTrackPlaying = isCurrent && isPlaying;
              const coverSrc = resolveMediaUrl(serverBaseUrl, track.coverUrl);
              const isMenuOpen = openMenuRowKey === rowKey;
              const relativePlayed = playedAt
                ? formatRelativePlayedAt(playedAt)
                : '';

              return (
                <div
                  key={rowKey}
                  role="listitem"
                  className={`track-row track-grid-enhanced ${
                    isPlaylistView ? 'is-playlist-view' : ''
                  } ${isCurrent ? 'is-current' : ''} ${
                    isMenuOpen ? 'has-open-menu' : ''
                  }`}
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
                    {relativePlayed && (
                      <span
                        className="played-at-badge"
                        title={
                          playedAt
                            ? new Date(playedAt).toLocaleString('ko-KR')
                            : undefined
                        }
                      >
                        {relativePlayed}
                      </span>
                    )}
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

                  <div className="col-duration col-duration-enhanced">
                    <div
                      className="track-row-actions"
                      ref={isMenuOpen ? popoverContainerRef : undefined}
                    >
                      <button
                        type="button"
                        className="row-action-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          onPlayNext(track);
                        }}
                        title="다음 곡으로 재생"
                        aria-label={`${track.title} 다음 곡으로 재생`}
                      >
                        <PlayNextIcon className="icon-xs" />
                      </button>

                      <button
                        type="button"
                        className="row-action-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          onAddToQueue(track);
                        }}
                        title="재생 대기열에 추가"
                        aria-label={`${track.title} 재생 대기열에 추가`}
                      >
                        <QueueListIcon className="icon-xs" />
                      </button>

                      <div className="playlist-popover-anchor">
                        <button
                          type="button"
                          className={`row-action-btn ${isMenuOpen ? 'is-active' : ''}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenMenuRowKey((prev) =>
                              prev === rowKey ? null : rowKey,
                            );
                          }}
                          title="플레이리스트에 추가"
                          aria-label={`${track.title} 플레이리스트에 추가`}
                          aria-expanded={isMenuOpen}
                          aria-haspopup="menu"
                        >
                          <PlusIcon className="icon-xs" />
                        </button>

                        {isMenuOpen && (
                          <div
                            className="playlist-popover"
                            role="menu"
                            aria-label="플레이리스트 선택"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <div className="playlist-popover-header">
                              플레이리스트에 추가
                            </div>
                            {playlists.length > 0 ? (
                              <div className="playlist-popover-list">
                                {playlists.map((playlist) => (
                                  <button
                                    key={playlist.id}
                                    type="button"
                                    role="menuitem"
                                    className="playlist-popover-item"
                                    onClick={() => {
                                      setOpenMenuRowKey(null);
                                      onAddTrackToPlaylist(
                                        playlist.id,
                                        track.id,
                                      );
                                    }}
                                  >
                                    <ListMusicIcon className="icon-xs" />
                                    <span className="playlist-popover-name">
                                      {playlist.name}
                                    </span>
                                    <span className="playlist-popover-count mono">
                                      {playlist.trackCount}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p className="playlist-popover-empty">
                                생성된 플레이리스트가 없습니다.
                              </p>
                            )}
                            <div className="playlist-popover-divider" />
                            <button
                              type="button"
                              role="menuitem"
                              className="playlist-popover-item is-create"
                              onClick={() => {
                                setOpenMenuRowKey(null);
                                onCreatePlaylistWithTrack(track);
                              }}
                            >
                              <PlusIcon className="icon-xs" />
                              <span>새 플레이리스트 만들기</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {isPlaylistView && (
                        <>
                          <button
                            type="button"
                            className="row-action-btn"
                            disabled={!canReorderPlaylist || idx === 0}
                            onClick={(event) => {
                              event.stopPropagation();
                              onMovePlaylistTrack(
                                activePlaylist.id,
                                idx,
                                idx - 1,
                              );
                            }}
                            title="위로 이동"
                            aria-label={`${track.title} 위로 이동`}
                          >
                            <ChevronUpIcon className="icon-xs" />
                          </button>

                          <button
                            type="button"
                            className="row-action-btn"
                            disabled={
                              !canReorderPlaylist || idx === rows.length - 1
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              onMovePlaylistTrack(
                                activePlaylist.id,
                                idx,
                                idx + 1,
                              );
                            }}
                            title="아래로 이동"
                            aria-label={`${track.title} 아래로 이동`}
                          >
                            <ChevronDownIcon className="icon-xs" />
                          </button>

                          <button
                            type="button"
                            className="row-action-btn is-danger"
                            onClick={(event) => {
                              event.stopPropagation();
                              onRemoveTrackFromPlaylist(
                                activePlaylist.id,
                                track.id,
                              );
                            }}
                            title="플레이리스트에서 제거"
                            aria-label={`${track.title} 플레이리스트에서 제거`}
                          >
                            <TrashIcon className="icon-xs" />
                          </button>
                        </>
                      )}
                    </div>

                    <button
                      id={`like-track-${rowKey}`}
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
