import type { HealthCheckResponse } from '@my-spotify/shared-types';

export interface HealthCheckResult {
  data: HealthCheckResponse;
  latencyMs: number;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

export async function fetchApiHealth(signal?: AbortSignal): Promise<HealthCheckResult> {
  const startedAt = performance.now();
  const response = await fetch(`${API_BASE_URL}/api/health`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`API health check failed with status ${response.status}`);
  }

  const data = (await response.json()) as HealthCheckResponse;
  const latencyMs = Math.max(1, Math.round(performance.now() - startedAt));

  return { data, latencyMs };
}
