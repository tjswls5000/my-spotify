import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  UserRole,
  type AuthResponseDto,
  type AuthStatusDto,
  type AuthTokensDto,
  type LoginRequestDto,
  type RefreshTokenRequestDto,
  type RegisterRequestDto,
  type UserProfileDto,
} from '@my-spotify/shared-types';
import { eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service.js';
import { users, type UserRecord } from '../../database/schema.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  extractBearerToken,
  hashPassword,
  signJwt,
  verifyJwt,
  verifyPassword,
} from './token.util.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

function isPgUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const record = error as { code?: unknown; cause?: unknown };
  if (record.code === '23505') {
    return true;
  }

  if (record.cause && typeof record.cause === 'object') {
    return (record.cause as { code?: unknown }).code === '23505';
  }

  return false;
}

@Injectable()
export class AuthService {
  constructor(private readonly database: DatabaseService) {}

  private ensureDatabaseReady(): void {
    if (!this.database.isReady()) {
      throw new ServiceUnavailableException(
        'PostgreSQL database is not connected. Start PostgreSQL with "pnpm db:up".',
      );
    }
  }

  private toUserProfileDto(record: UserRecord): UserProfileDto {
    const role =
      record.role === UserRole.ADMIN ? UserRole.ADMIN : UserRole.USER;

    return {
      id: record.id,
      email: record.email,
      displayName: record.displayName,
      role,
      ...(record.avatarUrl ? { avatarUrl: record.avatarUrl } : {}),
    };
  }

  private issueTokens(user: UserProfileDto): AuthTokensDto {
    const accessToken = signJwt({
      type: 'access',
      sub: user.id,
      email: user.email,
      role: user.role,
      ttlSeconds: ACCESS_TOKEN_TTL_SECONDS,
    });

    const refreshToken = signJwt({
      type: 'refresh',
      sub: user.id,
      email: user.email,
      role: user.role,
      ttlSeconds: REFRESH_TOKEN_TTL_SECONDS,
    });

    return {
      accessToken,
      refreshToken,
      expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  async getUserCount(): Promise<number> {
    if (!this.database.isReady()) {
      return 0;
    }

    const [row] = await this.database.db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);

    return Number(row?.count ?? 0);
  }

  async isAuthEnabled(): Promise<boolean> {
    const count = await this.getUserCount();
    return count > 0;
  }

  async verifyAccessToken(token: string): Promise<UserProfileDto | null> {
    const payload = verifyJwt(token, { expectedType: 'access' });
    if (!payload || !this.database.isReady()) {
      return null;
    }

    const [record] = await this.database.db
      .select()
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!record) {
      return null;
    }

    return this.toUserProfileDto(record);
  }

  async getStatus(authorizationHeader?: string): Promise<AuthStatusDto> {
    if (!this.database.isReady()) {
      return {
        authEnabled: false,
        userCount: 0,
        currentUser: null,
      };
    }

    const userCount = await this.getUserCount();
    const authEnabled = userCount > 0;

    let currentUser: UserProfileDto | null = null;
    const token = extractBearerToken(authorizationHeader);
    if (token) {
      currentUser = await this.verifyAccessToken(token);
    }

    return {
      authEnabled,
      userCount,
      currentUser,
    };
  }

  async getCurrentUser(
    authorizationHeader?: string,
  ): Promise<UserProfileDto | null> {
    const token = extractBearerToken(authorizationHeader);
    if (token) {
      const user = await this.verifyAccessToken(token);
      if (user) {
        return user;
      }
    }

    const authEnabled = await this.isAuthEnabled();
    if (!authEnabled) {
      return null;
    }

    throw new UnauthorizedException('Authentication required');
  }

  async register(
    dto: RegisterRequestDto,
    authorizationHeader?: string,
  ): Promise<AuthResponseDto> {
    this.ensureDatabaseReady();

    const normalizedEmail =
      typeof dto?.email === 'string' ? dto.email.trim().toLowerCase() : '';
    const password = typeof dto?.password === 'string' ? dto.password : '';
    const displayName =
      typeof dto?.displayName === 'string' ? dto.displayName.trim() : '';

    if (!normalizedEmail || !EMAIL_PATTERN.test(normalizedEmail)) {
      throw new BadRequestException('A valid email address is required');
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
      );
    }

    if (!displayName) {
      throw new BadRequestException('Display name is required');
    }

    const userCount = await this.getUserCount();
    let assignedRole = UserRole.ADMIN;

    if (userCount > 0) {
      const token = extractBearerToken(authorizationHeader);
      const caller = token ? await this.verifyAccessToken(token) : null;
      if (!caller || caller.role !== UserRole.ADMIN) {
        throw new ForbiddenException(
          'Only an administrator can register additional accounts',
        );
      }
      assignedRole = UserRole.USER;
    }

    const [existing] = await this.database.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = hashPassword(password);

    let created: UserRecord | undefined;
    try {
      const inserted = await this.database.db
        .insert(users)
        .values({
          email: normalizedEmail,
          displayName,
          passwordHash,
          role: assignedRole,
        })
        .returning();
      created = inserted[0];
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }

    if (!created) {
      throw new ServiceUnavailableException('Failed to create user account');
    }

    const user = this.toUserProfileDto(created);
    const tokens = this.issueTokens(user);
    return { user, tokens };
  }

  async login(dto: LoginRequestDto): Promise<AuthResponseDto> {
    this.ensureDatabaseReady();

    const normalizedEmail =
      typeof dto?.email === 'string' ? dto.email.trim().toLowerCase() : '';
    const password = typeof dto?.password === 'string' ? dto.password : '';

    if (!normalizedEmail || !password) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const [record] = await this.database.db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!record || !verifyPassword(password, record.passwordHash)) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = this.toUserProfileDto(record);
    const tokens = this.issueTokens(user);
    return { user, tokens };
  }

  async refresh(dto: RefreshTokenRequestDto): Promise<AuthResponseDto> {
    this.ensureDatabaseReady();

    const refreshToken =
      typeof dto?.refreshToken === 'string' ? dto.refreshToken.trim() : '';

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    const payload = verifyJwt(refreshToken, { expectedType: 'refresh' });
    if (!payload) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const [record] = await this.database.db
      .select()
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!record) {
      throw new UnauthorizedException('User account no longer exists');
    }

    const user = this.toUserProfileDto(record);
    const tokens = this.issueTokens(user);
    return { user, tokens };
  }
}
