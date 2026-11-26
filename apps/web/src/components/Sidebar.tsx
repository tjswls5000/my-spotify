import {
  ServiceStatus,
  UserRole,
  type AuthStatusDto,
  type HealthCheckResponse,
  type LibraryFolderDto,
  type PlaylistDto,
} from '@my-spotify/shared-types';
import { resolveMediaUrl } from '../api/client.ts';
import {
  BrandMarkIcon,
  FolderIcon,
  FolderPlusIcon,
  HeartIcon,
  HistoryIcon,
  HomeIcon,
  ListMusicIcon,
  LockIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  ServerIcon,
  ShieldIcon,
} from './Icons.tsx';
import { formatUptime } from '../utils/format.ts';

export type NavSection =
  | 'all'
  | 'search'
  | 'liked'
  | 'recent'
  | 'folder'
  | 'playlist';

export interface ApiHealthState {
  status: 'loading' | 'connected' | 'error';
  payload: HealthCheckResponse | null;
  latencyMs: number | null;
  errorMessage: string | null;
}

interface SidebarProps {
  activeNav: NavSection;
  onSelectNav: (nav: NavSection) => void;
  libraries: LibraryFolderDto[];
  selectedLibraryId: string | null;
  onSelectLibrary: (libraryId: string) => void;
  playlists: PlaylistDto[];
  selectedPlaylistId: string | null;
  onSelectPlaylist: (playlistId: string) => void;
  onCreatePlaylist: () => void;
  totalTrackCount: number;
  likedTrackCount: number;
  recentHistoryCount: number;
  serverBaseUrl: string;
  apiHealth: ApiHealthState;
  authStatus: AuthStatusDto;
  onRefreshHealth: () => void;
  onOpenLibraryManager: () => void;
  onOpenAuthModal: () => void;
}

export function Sidebar({
  activeNav,
  onSelectNav,
  libraries,
  selectedLibraryId,
  onSelectLibrary,
  playlists,
  selectedPlaylistId,
  onSelectPlaylist,
  onCreatePlaylist,
  totalTrackCount,
  likedTrackCount,
  recentHistoryCount,
  serverBaseUrl,
  apiHealth,
  authStatus,
  onRefreshHealth,
  onOpenLibraryManager,
  onOpenAuthModal,
}: SidebarProps) {
  const dbCheck = apiHealth.payload?.checks?.find(
    (check) => check.name === 'postgres',
  );
  const isApiUp = apiHealth.status === 'connected';
  const isDbUp = dbCheck?.status === ServiceStatus.OK;
  const isFullyHealthy =
    isApiUp && apiHealth.payload?.status === ServiceStatus.OK;
  const isAuthLocked = authStatus.authEnabled && !authStatus.currentUser;

  const statusLabel =
    apiHealth.status === 'loading'
      ? '서버 연결 확인 중...'
      : isFullyHealthy
        ? '스트리밍 서버 정상'
        : isApiUp
          ? 'API 연결됨 · DB 대기'
          : '서버 오프라인';

  return (
    <aside className="sidebar" aria-label="Primary sidebar">
      <div className="sidebar-brand">
        <BrandMarkIcon className="brand-mark" />
        <div className="brand-copy">
          <span className="brand-name">my-spotify</span>
          <span className="brand-tag">Personal Streaming</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Main navigation">
        <button
          id="nav-all"
          type="button"
          className={`nav-item ${activeNav === 'all' ? 'is-active' : ''}`}
          onClick={() => onSelectNav('all')}
        >
          <HomeIcon className="nav-icon" />
          <span className="nav-label">전체 음원</span>
          <span className="count-chip">{totalTrackCount}</span>
        </button>
        <button
          id="nav-search"
          type="button"
          className={`nav-item ${activeNav === 'search' ? 'is-active' : ''}`}
          onClick={() => onSelectNav('search')}
        >
          <SearchIcon className="nav-icon" />
          <span className="nav-label">검색</span>
        </button>
        <button
          id="nav-liked"
          type="button"
          className={`nav-item ${activeNav === 'liked' ? 'is-active' : ''}`}
          onClick={() => onSelectNav('liked')}
        >
          <HeartIcon className="nav-icon" filled={activeNav === 'liked'} />
          <span className="nav-label">좋아요 표시한 곡</span>
          <span className="count-chip">{likedTrackCount}</span>
        </button>
        <button
          id="nav-recent"
          type="button"
          className={`nav-item ${activeNav === 'recent' ? 'is-active' : ''}`}
          onClick={() => onSelectNav('recent')}
        >
          <HistoryIcon className="nav-icon" />
          <span className="nav-label">최근 재생</span>
          <span className="count-chip">{recentHistoryCount}</span>
        </button>
      </nav>

      <div className="sidebar-divider" />

      <div className="sidebar-scroll-area">
        {/* Custom Playlists Section */}
        <section className="sidebar-group" aria-label="Custom playlists">
          <div className="sidebar-section-header">
            <span>플레이리스트</span>
            <button
              id="btn-sidebar-new-playlist"
              type="button"
              className="btn-inline-add"
              disabled={isAuthLocked || !isDbUp}
              onClick={onCreatePlaylist}
              title="새 플레이리스트 만들기"
            >
              <PlusIcon className="icon-xs" />
              <span>새 플레이리스트</span>
            </button>
          </div>

          {playlists.length === 0 ? (
            <div className="sidebar-empty-hint">
              <p>아직 만든 플레이리스트가 없습니다.</p>
            </div>
          ) : (
            <ul className="playlist-list sidebar-sublist">
              {playlists.map((playlist) => {
                const isSelected =
                  activeNav === 'playlist' && playlist.id === selectedPlaylistId;
                const coverUrl = resolveMediaUrl(
                  serverBaseUrl,
                  playlist.coverUrl,
                );
                return (
                  <li key={playlist.id}>
                    <button
                      id={`playlist-btn-${playlist.id}`}
                      type="button"
                      className={`playlist-item ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => onSelectPlaylist(playlist.id)}
                    >
                      {coverUrl ? (
                        <img
                          src={coverUrl}
                          alt={`${playlist.name} cover`}
                          className="folder-avatar playlist-avatar-img"
                          loading="lazy"
                        />
                      ) : (
                        <div className="folder-avatar">
                          <ListMusicIcon className="icon-sm" />
                        </div>
                      )}
                      <div className="playlist-meta">
                        <span className="playlist-title">{playlist.name}</span>
                        <span className="playlist-sub">
                          {playlist.trackCount}곡
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="sidebar-divider compact" />

        {/* Server Library Folders Section */}
        <section className="sidebar-group" aria-label="Server library folders">
          <div className="sidebar-section-header">
            <span>서버 음원 폴더</span>
            <button
              id="btn-sidebar-add-folder"
              type="button"
              className="btn-inline-add"
              onClick={onOpenLibraryManager}
              title="스트리밍 서버 음원 폴더 추가 및 관리"
            >
              <FolderPlusIcon className="icon-xs" />
              <span>폴더 관리</span>
            </button>
          </div>

          {libraries.length === 0 ? (
            <div className="sidebar-empty-folders">
              <p>연결된 음원 폴더가 없습니다.</p>
              <button
                id="btn-sidebar-connect-folder"
                type="button"
                className="btn-sidebar-cta"
                onClick={onOpenLibraryManager}
              >
                <FolderPlusIcon className="icon-sm" />
                <span>음원 폴더 선택</span>
              </button>
            </div>
          ) : (
            <ul className="playlist-list sidebar-sublist">
              {libraries.map((library) => {
                const isSelected =
                  activeNav === 'folder' && library.id === selectedLibraryId;
                return (
                  <li key={library.id}>
                    <button
                      id={`library-btn-${library.id}`}
                      type="button"
                      className={`playlist-item ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => onSelectLibrary(library.id)}
                    >
                      <div className="folder-avatar">
                        <FolderIcon className="icon-sm" />
                      </div>
                      <div className="playlist-meta">
                        <span className="playlist-title">{library.name}</span>
                        <span className="playlist-sub">
                          {library.trackCount}곡 ·{' '}
                          {library.isWatching ? '자동 스캔' : '수동'}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Account / Remote Security Status Button */}
      <button
        id="btn-sidebar-auth"
        type="button"
        className={`sidebar-auth-btn ${
          authStatus.currentUser
            ? 'is-authenticated'
            : isAuthLocked
              ? 'is-locked'
              : ''
        }`}
        onClick={onOpenAuthModal}
        title="계정 및 원격 접근 보안 설정"
      >
        <div className="sidebar-auth-icon" aria-hidden="true">
          {authStatus.currentUser ? (
            <span className="sidebar-auth-initial">
              {authStatus.currentUser.displayName.slice(0, 1).toUpperCase()}
            </span>
          ) : isAuthLocked ? (
            <LockIcon className="icon-sm" />
          ) : (
            <ShieldIcon className="icon-sm" />
          )}
        </div>
        <div className="sidebar-auth-meta">
          <span className="sidebar-auth-title">
            {authStatus.currentUser
              ? authStatus.currentUser.displayName
              : isAuthLocked
                ? '로그인 필요'
                : '보안 설정 (로컬)'}
          </span>
          <span className="sidebar-auth-sub">
            {authStatus.currentUser
              ? authStatus.currentUser.role === UserRole.ADMIN
                ? '관리자 · 원격 보호 활성'
                : '로그인됨 · 원격 보호 활성'
              : isAuthLocked
                ? '외부 접근 잠금됨 · 클릭해 로그인'
                : '개방 모드 · 관리자 계정으로 잠금'}
          </span>
        </div>
      </button>

      <section className="api-status-panel" aria-live="polite">
        <div className="api-status-top">
          <div className="api-status-indicator">
            <span
              className={`status-dot ${
                isFullyHealthy
                  ? 'is-ok'
                  : apiHealth.status === 'loading' || isApiUp
                    ? 'is-loading'
                    : 'is-error'
              }`}
            />
            <span className="api-status-label">{statusLabel}</span>
          </div>
          <div className="api-status-actions">
            <button
              id="btn-open-server-settings"
              type="button"
              className="icon-button subtle"
              onClick={onOpenLibraryManager}
              title="스트리밍 서버 주소 및 폴더 설정"
              aria-label="스트리밍 서버 설정"
            >
              <ServerIcon className="icon-xs" />
            </button>
            <button
              id="btn-refresh-health"
              type="button"
              className="icon-button subtle"
              onClick={onRefreshHealth}
              title="서버 헬스 체크 다시 요청"
              aria-label="서버 헬스 체크 다시 요청"
            >
              <RefreshIcon
                className={`icon-xs ${apiHealth.status === 'loading' ? 'is-spinning' : ''}`}
              />
            </button>
          </div>
        </div>

        <div className="api-status-details">
          <div className="api-detail-row">
            <span>Server</span>
            <code className="truncate-code">
              {serverBaseUrl || 'local (/api)'}
            </code>
          </div>
          {apiHealth.payload ? (
            <>
              <div className="api-detail-row">
                <span>PostgreSQL</span>
                <span className={`mono ${isDbUp ? 'text-ok' : 'text-error'}`}>
                  {isDbUp
                    ? `ok · ${dbCheck?.latencyMs ?? 0}ms`
                    : 'disconnected'}
                </span>
              </div>
              <div className="api-detail-row">
                <span>API / Up</span>
                <span className="mono">
                  {apiHealth.latencyMs ?? 0}ms ·{' '}
                  {formatUptime(apiHealth.payload.uptimeSeconds)}
                </span>
              </div>
            </>
          ) : (
            <p className="api-status-fallback">
              {apiHealth.errorMessage ??
                'GET /api/health 응답 대기 중 (포트 3001)'}
            </p>
          )}
        </div>
      </section>
    </aside>
  );
}
