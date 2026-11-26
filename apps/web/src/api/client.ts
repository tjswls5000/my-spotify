import type {
  AddLibraryFolderRequestDto,
  AddPlaylistTracksRequestDto,
  ApiResponse,
  AuthResponseDto,
  AuthStatusDto,
  AuthTokensDto,
  CreatePlaylistRequestDto,
  DirectoryBrowseResponseDto,
  HealthCheckResponse,
  LibraryFolderDto,
  LoginRequestDto,
  PlaybackHistoryEntryDto,
  PlaylistDto,
  RecordPlaybackHistoryRequestDto,
  RefreshTokenRequestDto,
  RegisterRequestDto,
  ReorderPlaylistTracksRequestDto,
  SavedPlaybackStateDto,
  ScanResultDto,
  TrackDto,
  UpdatePlaybackStateRequestDto,
  UpdatePlaylistRequestDto,
} from '@my-spotify/shared-types';

const SERVER_URL_STORAGE_KEY = 'my-spotify:server-url';
const AUTH_TOKENS_STORAGE_KEY = 'my-spotify:auth-tokens';
const ENV_DEFAULT_API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? '';

export interface HealthCheckResult {
  data: HealthCheckResponse;
  latencyMs: number;
}

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

let authExpiredCallback: (() => void) | null = null;
let inFlightRefresh: Promise<AuthTokensDto | null> | null = null;

export function setAuthExpiredHandler(handler: (() => void) | null): void {
  authExpiredCallback = handler;
}

export function getStoredAuthTokens(): AuthTokensDto | null {
  try {
    const raw = window.localStorage.getItem(AUTH_TOKENS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<AuthTokensDto>;
    if (
      typeof parsed.accessToken === 'string' &&
      parsed.accessToken.length > 0 &&
      typeof parsed.refreshToken === 'string' &&
      parsed.refreshToken.length > 0
    ) {
      return {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        expiresInSeconds:
          typeof parsed.expiresInSeconds === 'number'
            ? parsed.expiresInSeconds
            : 3600,
      };
    }
  } catch {
    // ignore storage or parse errors
  }
  return null;
}

export function saveAuthTokens(tokens: AuthTokensDto): void {
  try {
    window.localStorage.setItem(AUTH_TOKENS_STORAGE_KEY, JSON.stringify(tokens));
  } catch {
    // ignore storage errors
  }
}

export function clearAuthTokens(): void {
  try {
    window.localStorage.removeItem(AUTH_TOKENS_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function normalizeServerBaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return '';
  }
  return trimmed.replace(/\/api$/, '');
}

export function getStoredServerBaseUrl(): string {
  try {
    const saved = window.localStorage.getItem(SERVER_URL_STORAGE_KEY);
    if (saved !== null) {
      return normalizeServerBaseUrl(saved);
    }
  } catch {
    // ignore storage errors
  }
  return normalizeServerBaseUrl(ENV_DEFAULT_API_BASE);
}

export function saveServerBaseUrl(rawUrl: string): string {
  const normalized = normalizeServerBaseUrl(rawUrl);
  try {
    window.localStorage.setItem(SERVER_URL_STORAGE_KEY, normalized);
  } catch {
    // ignore storage errors
  }
  return normalized;
}

function shouldAttachMediaToken(relativePath: string): boolean {
  return (
    relativePath.startsWith('/api/streaming/') ||
    relativePath.startsWith('/api/catalog/tracks/')
  );
}

export function resolveMediaUrl(
  serverBaseUrl: string,
  relativePath: string | null,
): string | null {
  if (!relativePath) {
    return null;
  }

  let resolved = /^https?:\/\//i.test(relativePath)
    ? relativePath
    : `${serverBaseUrl}${relativePath}`;

  if (shouldAttachMediaToken(relativePath)) {
    const tokens = getStoredAuthTokens();
    if (tokens?.accessToken) {
      const separator = resolved.includes('?') ? '&' : '?';
      resolved = `${resolved}${separator}token=${encodeURIComponent(tokens.accessToken)}`;
    }
  }

  return resolved;
}

async function parseErrorMessage(response: Response): Promise<string> {
  let errorMessage = `요청 실패 (HTTP ${response.status})`;
  try {
    const payload = (await response.json()) as {
      message?: string | string[];
    };
    if (Array.isArray(payload.message)) {
      errorMessage = payload.message.join(', ');
    } else if (typeof payload.message === 'string') {
      errorMessage = payload.message;
    }
  } catch {
    // ignore non-JSON error bodies
  }
  return errorMessage;
}

async function performTokenRefresh(
  serverBaseUrl: string,
  refreshToken: string,
): Promise<AuthTokensDto | null> {
  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  inFlightRefresh = (async () => {
    try {
      const response = await fetch(`${serverBaseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken } satisfies RefreshTokenRequestDto),
      });

      if (!response.ok) {
        clearAuthTokens();
        authExpiredCallback?.();
        return null;
      }

      const payload = (await response.json()) as ApiResponse<AuthResponseDto>;
      saveAuthTokens(payload.data.tokens);
      return payload.data.tokens;
    } catch {
      clearAuthTokens();
      authExpiredCallback?.();
      return null;
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}

interface RequestOptions {
  skipAuthHeader?: boolean;
  skipAuthRefresh?: boolean;
}

async function requestJson<T>(
  serverBaseUrl: string,
  endpoint: string,
  init?: RequestInit,
  options?: RequestOptions,
): Promise<T> {
  const buildHeaders = (accessToken?: string): Record<string, string> => {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (init?.body) {
      headers['Content-Type'] = 'application/json';
    }
    if (accessToken && !options?.skipAuthHeader) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    if (init?.headers) {
      const extra = new Headers(init.headers);
      extra.forEach((value, key) => {
        headers[key] = value;
      });
    }
    return headers;
  };

  const storedTokens = getStoredAuthTokens();
  let response = await fetch(`${serverBaseUrl}${endpoint}`, {
    ...init,
    headers: buildHeaders(storedTokens?.accessToken),
  });

  if (response.status === 401 && !options?.skipAuthRefresh) {
    if (storedTokens?.refreshToken) {
      const nextTokens = await performTokenRefresh(
        serverBaseUrl,
        storedTokens.refreshToken,
      );
      if (nextTokens?.accessToken) {
        response = await fetch(`${serverBaseUrl}${endpoint}`, {
          ...init,
          headers: buildHeaders(nextTokens.accessToken),
        });
      }
    } else if (storedTokens?.accessToken) {
      clearAuthTokens();
      authExpiredCallback?.();
    }
  }

  if (!response.ok) {
    const errorMessage = await parseErrorMessage(response);
    throw new ApiRequestError(errorMessage, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

// Health
export async function fetchApiHealth(
  serverBaseUrl: string,
  signal?: AbortSignal,
): Promise<HealthCheckResult> {
  const startedAt = performance.now();
  const data = await requestJson<HealthCheckResponse>(
    serverBaseUrl,
    '/api/health',
    { method: 'GET', signal },
    { skipAuthRefresh: true },
  );
  const latencyMs = Math.max(1, Math.round(performance.now() - startedAt));
  return { data, latencyMs };
}

// Auth
export async function fetchAuthStatus(
  serverBaseUrl: string,
  signal?: AbortSignal,
): Promise<AuthStatusDto> {
  const response = await requestJson<ApiResponse<AuthStatusDto>>(
    serverBaseUrl,
    '/api/auth/status',
    { method: 'GET', signal },
  );
  return response.data;
}

export async function registerUser(
  serverBaseUrl: string,
  body: RegisterRequestDto,
  options?: { persistSession?: boolean },
): Promise<AuthResponseDto> {
  const response = await requestJson<ApiResponse<AuthResponseDto>>(
    serverBaseUrl,
    '/api/auth/register',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    { skipAuthRefresh: true },
  );
  if (options?.persistSession !== false) {
    saveAuthTokens(response.data.tokens);
  }
  return response.data;
}

export async function loginUser(
  serverBaseUrl: string,
  body: LoginRequestDto,
): Promise<AuthResponseDto> {
  const response = await requestJson<ApiResponse<AuthResponseDto>>(
    serverBaseUrl,
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    { skipAuthHeader: true, skipAuthRefresh: true },
  );
  saveAuthTokens(response.data.tokens);
  return response.data;
}

export async function refreshAuthTokens(
  serverBaseUrl: string,
  body: RefreshTokenRequestDto,
): Promise<AuthResponseDto> {
  const response = await requestJson<ApiResponse<AuthResponseDto>>(
    serverBaseUrl,
    '/api/auth/refresh',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    { skipAuthHeader: true, skipAuthRefresh: true },
  );
  saveAuthTokens(response.data.tokens);
  return response.data;
}

export async function logoutUser(serverBaseUrl: string): Promise<void> {
  try {
    await requestJson<void>(
      serverBaseUrl,
      '/api/auth/logout',
      { method: 'POST' },
      { skipAuthRefresh: true },
    );
  } finally {
    clearAuthTokens();
  }
}

// Catalog & Libraries
export async function fetchTracks(
  serverBaseUrl: string,
  params?: {
    search?: string;
    libraryFolderId?: string;
    liked?: boolean;
  },
  signal?: AbortSignal,
): Promise<TrackDto[]> {
  const query = new URLSearchParams();
  if (params?.search?.trim()) {
    query.set('search', params.search.trim());
  }
  if (params?.libraryFolderId) {
    query.set('libraryFolderId', params.libraryFolderId);
  }
  if (params?.liked) {
    query.set('liked', 'true');
  }
  const qs = query.toString();
  const response = await requestJson<ApiResponse<TrackDto[]>>(
    serverBaseUrl,
    `/api/catalog/tracks${qs ? `?${qs}` : ''}`,
    { method: 'GET', signal },
  );
  return response.data;
}

export async function toggleTrackLike(
  serverBaseUrl: string,
  trackId: string,
): Promise<TrackDto> {
  const response = await requestJson<ApiResponse<TrackDto>>(
    serverBaseUrl,
    `/api/catalog/tracks/${encodeURIComponent(trackId)}/like`,
    { method: 'PATCH' },
  );
  return response.data;
}

export async function fetchLibraries(
  serverBaseUrl: string,
  signal?: AbortSignal,
): Promise<LibraryFolderDto[]> {
  const response = await requestJson<ApiResponse<LibraryFolderDto[]>>(
    serverBaseUrl,
    '/api/catalog/libraries',
    { method: 'GET', signal },
  );
  return response.data;
}

export async function addLibraryFolder(
  serverBaseUrl: string,
  body: AddLibraryFolderRequestDto,
): Promise<{ folder: LibraryFolderDto; scan: ScanResultDto }> {
  const response = await requestJson<
    ApiResponse<{ folder: LibraryFolderDto; scan: ScanResultDto }>
  >(serverBaseUrl, '/api/catalog/libraries', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return response.data;
}

export async function removeLibraryFolder(
  serverBaseUrl: string,
  folderId: string,
): Promise<void> {
  await requestJson<void>(
    serverBaseUrl,
    `/api/catalog/libraries/${encodeURIComponent(folderId)}`,
    { method: 'DELETE' },
  );
}

export async function triggerLibraryScan(
  serverBaseUrl: string,
  libraryFolderId?: string,
): Promise<ScanResultDto> {
  const response = await requestJson<ApiResponse<ScanResultDto>>(
    serverBaseUrl,
    '/api/catalog/scan',
    {
      method: 'POST',
      body: JSON.stringify(libraryFolderId ? { libraryFolderId } : {}),
    },
  );
  return response.data;
}

export async function browseServerDirectories(
  serverBaseUrl: string,
  targetPath?: string,
  signal?: AbortSignal,
): Promise<DirectoryBrowseResponseDto> {
  const qs = targetPath ? `?path=${encodeURIComponent(targetPath)}` : '';
  const response = await requestJson<ApiResponse<DirectoryBrowseResponseDto>>(
    serverBaseUrl,
    `/api/catalog/directories${qs}`,
    { method: 'GET', signal },
  );
  return response.data;
}

// Playlists
export async function fetchPlaylists(
  serverBaseUrl: string,
  signal?: AbortSignal,
): Promise<PlaylistDto[]> {
  const response = await requestJson<ApiResponse<PlaylistDto[]>>(
    serverBaseUrl,
    '/api/playlists',
    { method: 'GET', signal },
  );
  return response.data;
}

export async function fetchPlaylistById(
  serverBaseUrl: string,
  playlistId: string,
  signal?: AbortSignal,
): Promise<PlaylistDto> {
  const response = await requestJson<ApiResponse<PlaylistDto>>(
    serverBaseUrl,
    `/api/playlists/${encodeURIComponent(playlistId)}`,
    { method: 'GET', signal },
  );
  return response.data;
}

export async function createPlaylist(
  serverBaseUrl: string,
  body: CreatePlaylistRequestDto,
): Promise<PlaylistDto> {
  const response = await requestJson<ApiResponse<PlaylistDto>>(
    serverBaseUrl,
    '/api/playlists',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
  return response.data;
}

export async function updatePlaylist(
  serverBaseUrl: string,
  playlistId: string,
  body: UpdatePlaylistRequestDto,
): Promise<PlaylistDto> {
  const response = await requestJson<ApiResponse<PlaylistDto>>(
    serverBaseUrl,
    `/api/playlists/${encodeURIComponent(playlistId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
  return response.data;
}

export async function deletePlaylist(
  serverBaseUrl: string,
  playlistId: string,
): Promise<void> {
  await requestJson<void>(
    serverBaseUrl,
    `/api/playlists/${encodeURIComponent(playlistId)}`,
    { method: 'DELETE' },
  );
}

export async function addTracksToPlaylist(
  serverBaseUrl: string,
  playlistId: string,
  body: AddPlaylistTracksRequestDto,
): Promise<PlaylistDto> {
  const response = await requestJson<ApiResponse<PlaylistDto>>(
    serverBaseUrl,
    `/api/playlists/${encodeURIComponent(playlistId)}/tracks`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
  return response.data;
}

export async function removeTrackFromPlaylist(
  serverBaseUrl: string,
  playlistId: string,
  trackId: string,
): Promise<PlaylistDto> {
  const response = await requestJson<ApiResponse<PlaylistDto>>(
    serverBaseUrl,
    `/api/playlists/${encodeURIComponent(playlistId)}/tracks/${encodeURIComponent(trackId)}`,
    { method: 'DELETE' },
  );
  return response.data;
}

export async function reorderPlaylistTracks(
  serverBaseUrl: string,
  playlistId: string,
  body: ReorderPlaylistTracksRequestDto,
): Promise<PlaylistDto> {
  const response = await requestJson<ApiResponse<PlaylistDto>>(
    serverBaseUrl,
    `/api/playlists/${encodeURIComponent(playlistId)}/tracks/reorder`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
  return response.data;
}

// Playback History & Resume
export async function fetchRecentHistory(
  serverBaseUrl: string,
  limit = 50,
  signal?: AbortSignal,
): Promise<PlaybackHistoryEntryDto[]> {
  const response = await requestJson<ApiResponse<PlaybackHistoryEntryDto[]>>(
    serverBaseUrl,
    `/api/history/recent?limit=${encodeURIComponent(String(limit))}`,
    { method: 'GET', signal },
  );
  return response.data;
}

export async function recordPlaybackHistory(
  serverBaseUrl: string,
  body: RecordPlaybackHistoryRequestDto,
): Promise<PlaybackHistoryEntryDto> {
  const response = await requestJson<ApiResponse<PlaybackHistoryEntryDto>>(
    serverBaseUrl,
    '/api/history',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
  return response.data;
}

export async function fetchResumeState(
  serverBaseUrl: string,
  signal?: AbortSignal,
): Promise<SavedPlaybackStateDto | null> {
  const response = await requestJson<ApiResponse<SavedPlaybackStateDto | null>>(
    serverBaseUrl,
    '/api/history/resume',
    { method: 'GET', signal },
  );
  return response.data;
}

export async function saveResumeState(
  serverBaseUrl: string,
  body: UpdatePlaybackStateRequestDto,
): Promise<SavedPlaybackStateDto> {
  const response = await requestJson<ApiResponse<SavedPlaybackStateDto>>(
    serverBaseUrl,
    '/api/history/resume',
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
  );
  return response.data;
}
