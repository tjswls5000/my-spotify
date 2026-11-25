import type { ServiceStatus } from './enums.js';

export interface ServiceHealthDetail {
  name: string;
  status: ServiceStatus;
  latencyMs?: number;
}

export interface HealthCheckResponse {
  status: ServiceStatus;
  service: string;
  version: string;
  timestamp: string;
  uptimeSeconds: number;
  modules: string[];
  checks?: ServiceHealthDetail[];
}
