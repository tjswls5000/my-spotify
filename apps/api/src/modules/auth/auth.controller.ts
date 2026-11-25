import { Controller, Get } from '@nestjs/common';
import type { ApiResponse, UserProfileDto } from '@my-spotify/shared-types';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  getCurrentUser(): ApiResponse<UserProfileDto | null> {
    return {
      data: this.authService.getCurrentUser(),
    };
  }
}
