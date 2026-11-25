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
