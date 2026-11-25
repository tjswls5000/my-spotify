import {
  ServiceStatus,
  type HealthCheckResponse,
  type PlaylistDto,
} from '@my-spotify/shared-types';
import {
  BrandMarkIcon,
  HomeIcon,
  LibraryIcon,
  RefreshIcon,
  SearchIcon,
} from './Icons.tsx';
import { formatUptime } from '../utils/format.ts';

export type NavSection = 'home' | 'search' | 'library';

export interface ApiHealthState {
  status: 'loading' | 'connected' | 'error';
  payload: HealthCheckResponse | null;
  latencyMs: number | null;
  errorMessage: string | null;
}

interface SidebarProps {
  activeNav: NavSection;
  onSelectNav: (nav: NavSection) => void;
  playlists: PlaylistDto[];
  selectedPlaylistId: string;
  onSelectPlaylist: (playlistId: string) => void;
  apiHealth: ApiHealthState;
  onRefreshHealth: () => void;
}

export function Sidebar({
  activeNav,
  onSelectNav,
  playlists,
  selectedPlaylistId,
  onSelectPlaylist,
  apiHealth,
  onRefreshHealth,
}: SidebarProps) {
  const isHealthy =
    apiHealth.status === 'connected' &&
    apiHealth.payload?.status === ServiceStatus.OK;

  const statusLabel =
    apiHealth.status === 'loading'
      ? '연결 확인 중...'
      : isHealthy
        ? 'API 정상 연결됨'
        : 'API 오프라인';

  return (
    <aside className="sidebar" aria-label="Primary sidebar">
      <div className="sidebar-brand">
        <BrandMarkIcon className="brand-mark" />
        <div className="brand-copy">
          <span className="brand-name">my-spotify</span>
          <span className="brand-tag">Personal Audio</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Main navigation">
        <button
          id="nav-home"
          type="button"
          className={`nav-item ${activeNav === 'home' ? 'is-active' : ''}`}
          onClick={() => onSelectNav('home')}
        >
          <HomeIcon className="nav-icon" />
          <span>홈</span>
        </button>
        <button
          id="nav-search"
          type="button"
          className={`nav-item ${activeNav === 'search' ? 'is-active' : ''}`}
          onClick={() => onSelectNav('search')}
        >
          <SearchIcon className="nav-icon" />
          <span>검색</span>
        </button>
        <button
          id="nav-library"
          type="button"
          className={`nav-item ${activeNav === 'library' ? 'is-active' : ''}`}
          onClick={() => onSelectNav('library')}
        >
          <LibraryIcon className="nav-icon" />
          <span>내 라이브러리</span>
        </button>
      </nav>

      <div className="sidebar-divider" />

      <section className="sidebar-playlists" aria-label="Playlists">
        <div className="sidebar-section-header">
          <span>플레이리스트</span>
          <span className="count-chip">{playlists.length}</span>
        </div>

        <ul className="playlist-list">
          {playlists.map((playlist) => {
            const isSelected = playlist.id === selectedPlaylistId;
            return (
              <li key={playlist.id}>
                <button
                  id={`playlist-btn-${playlist.id}`}
                  type="button"
                  className={`playlist-item ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => onSelectPlaylist(playlist.id)}
                >
                  <img
                    src={playlist.coverUrl}
                    alt={`${playlist.name} cover`}
                    className="playlist-thumb"
                    loading="lazy"
                  />
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
      </section>

      <section className="api-status-panel" aria-live="polite">
        <div className="api-status-top">
          <div className="api-status-indicator">
            <span
              className={`status-dot ${
                isHealthy
                  ? 'is-ok'
                  : apiHealth.status === 'loading'
                    ? 'is-loading'
                    : 'is-error'
              }`}
            />
            <span className="api-status-label">{statusLabel}</span>
          </div>
          <button
            id="btn-refresh-health"
            type="button"
            className="icon-button subtle"
            onClick={onRefreshHealth}
            title="백엔드 헬스 체크 다시 요청"
            aria-label="백엔드 헬스 체크 다시 요청"
          >
            <RefreshIcon
              className={`icon-sm ${apiHealth.status === 'loading' ? 'is-spinning' : ''}`}
            />
          </button>
        </div>

        {apiHealth.payload ? (
          <div className="api-status-details">
            <div className="api-detail-row">
              <span>Service</span>
              <code>{apiHealth.payload.service}</code>
            </div>
            <div className="api-detail-row">
              <span>Latency / Up</span>
              <span className="mono">
                {apiHealth.latencyMs ?? 0}ms ·{' '}
                {formatUptime(apiHealth.payload.uptimeSeconds)}
              </span>
            </div>
            <div className="api-modules-list">
              {apiHealth.payload.modules.map((moduleName) => (
                <span key={moduleName} className="module-tag">
                  {moduleName}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="api-status-fallback">
            {apiHealth.errorMessage ??
              'GET /api/health 응답 대기 중 (포트 3001)'}
          </p>
        )}
      </section>
    </aside>
  );
}
