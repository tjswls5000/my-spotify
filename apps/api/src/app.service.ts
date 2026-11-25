import { Injectable } from '@nestjs/common';
import {
  ServiceStatus,
  type HealthCheckResponse,
} from '@my-spotify/shared-types';

const REGISTERED_MODULES = [
  'auth',
  'catalog',
  'streaming',
  'playlist',
  'history',
];

@Injectable()
export class AppService {
  getHealth(): HealthCheckResponse {
    return {
      status: ServiceStatus.OK,
      service: 'my-spotify-api',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      modules: [...REGISTERED_MODULES],
      checks: [
        {
          name: 'api',
          status: ServiceStatus.OK,
          latencyMs: 0,
        },
      ],
    };
  }
}
