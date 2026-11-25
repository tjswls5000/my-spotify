import { Injectable } from '@nestjs/common';
import {
  ServiceStatus,
  type HealthCheckResponse,
} from '@my-spotify/shared-types';
import { DatabaseService } from './database/database.service.js';

const REGISTERED_MODULES = [
  'auth',
  'catalog',
  'streaming',
  'playlist',
  'history',
];

@Injectable()
export class AppService {
  constructor(private readonly database: DatabaseService) {}

  async getHealth(): Promise<HealthCheckResponse> {
    const dbCheck = await this.database.checkHealth();
    const overallStatus =
      dbCheck.status === ServiceStatus.OK
        ? ServiceStatus.OK
        : ServiceStatus.DEGRADED;

    return {
      status: overallStatus,
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
        dbCheck,
      ],
    };
  }
}
