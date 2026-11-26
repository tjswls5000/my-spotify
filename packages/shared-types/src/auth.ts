import type { UserRole } from './enums.js';

export interface UserProfileDto {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  avatarUrl?: string;
}

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface AuthStatusDto {
  authEnabled: boolean;
  userCount: number;
  currentUser: UserProfileDto | null;
}

export interface RegisterRequestDto {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginRequestDto {
  email: string;
  password: string;
}

export interface RefreshTokenRequestDto {
  refreshToken: string;
}

export interface AuthResponseDto {
  user: UserProfileDto;
  tokens: AuthTokensDto;
}
