import { Controller, Get } from '@nestjs/common';
import type { HealthCheckResponse } from '@my-spotify/shared-types';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth(): HealthCheckResponse {
    return this.appService.getHealth();
  }
}
