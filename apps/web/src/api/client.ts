import type {
  AddLibraryFolderRequestDto,
  ApiResponse,
  DirectoryBrowseResponseDto,
  HealthCheckResponse,
  LibraryFolderDto,
  ScanResultDto,
  TrackDto,
} from '@my-spotify/shared-types';

const SERVER_URL_STORAGE_KEY = 'my-spotify:server-url';
const ENV_DEFAULT_API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? '';

export interface HealthCheckResult {
  data: HealthCheckResponse;
  latencyMs: number;
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

export function resolveMediaUrl(
  serverBaseUrl: string,
  relativePath: string | null,
): string | null {
  if (!relativePath) {
    return null;
  }
  if (/^https?:\/\//i.test(relativePath)) {
    return relativePath;
  }
  return `${serverBaseUrl}${relativePath}`;
}

async function requestJson<T>(
  serverBaseUrl: string,
  endpoint: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${serverBaseUrl}${endpoint}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
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
    throw new Error(errorMessage);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function fetchApiHealth(
  serverBaseUrl: string,
  signal?: AbortSignal,
): Promise<HealthCheckResult> {
  const startedAt = performance.now();
  const data = await requestJson<HealthCheckResponse>(
    serverBaseUrl,
    '/api/health',
    { method: 'GET', signal },
  );
  const latencyMs = Math.max(1, Math.round(performance.now() - startedAt));
  return { data, latencyMs };
}

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
