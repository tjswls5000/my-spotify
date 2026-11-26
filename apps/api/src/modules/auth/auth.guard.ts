import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserProfileDto } from '@my-spotify/shared-types';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import { ALLOW_QUERY_TOKEN_KEY, IS_PUBLIC_KEY } from './public.decorator.js';
import { extractBearerToken } from './token.util.js';

export interface AuthenticatedRequest extends Request {
  user?: UserProfileDto;
}

function extractQueryToken(request: Request): string | null {
  const raw = request.query?.token;
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  if (typeof candidate !== 'string') {
    return null;
  }

  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const authEnabled = await this.authService.isAuthEnabled();
    if (!authEnabled) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    let token = extractBearerToken(request.headers?.authorization);

    if (!token) {
      const allowQueryToken = this.reflector.getAllAndOverride<boolean>(
        ALLOW_QUERY_TOKEN_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (allowQueryToken) {
        token = extractQueryToken(request);
      }
    }

    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const user = await this.authService.verifyAccessToken(token);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    request.user = user;
    return true;
  }
}
