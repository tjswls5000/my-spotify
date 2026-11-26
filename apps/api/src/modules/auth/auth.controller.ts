import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type {
  ApiResponse,
  AuthResponseDto,
  AuthStatusDto,
  LoginRequestDto,
  RefreshTokenRequestDto,
  RegisterRequestDto,
  UserProfileDto,
} from '@my-spotify/shared-types';
import type { AuthenticatedRequest } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { Public } from './public.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get('status')
  async getStatus(
    @Headers('authorization') authorization?: string,
  ): Promise<ApiResponse<AuthStatusDto>> {
    const data = await this.authService.getStatus(authorization);
    return { data };
  }

  @Get('me')
  async getCurrentUser(
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiResponse<UserProfileDto | null>> {
    if (request.user) {
      return { data: request.user };
    }

    const data = await this.authService.getCurrentUser(
      request.headers?.authorization,
    );
    return { data };
  }

  @Public()
  @Post('register')
  async register(
    @Body() body: RegisterRequestDto,
    @Headers('authorization') authorization?: string,
  ): Promise<ApiResponse<AuthResponseDto>> {
    const data = await this.authService.register(body, authorization);
    return { data };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginRequestDto,
  ): Promise<ApiResponse<AuthResponseDto>> {
    const data = await this.authService.login(body);
    return { data };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() body: RefreshTokenRequestDto,
  ): Promise<ApiResponse<AuthResponseDto>> {
    const data = await this.authService.refresh(body);
    return { data };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(): void {
    // Stateless JWT logout acknowledgment
  }
}
