import { Controller, Get } from '@nestjs/common';
import type { HealthCheckResponse } from '@my-spotify/shared-types';
import { AppService } from './app.service.js';
import { Public } from './modules/auth/public.decorator.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get('health')
  getHealth(): Promise<HealthCheckResponse> {
    return this.appService.getHealth();
  }
}
