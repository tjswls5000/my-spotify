import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@my-spotify/shared-types';
import type { SQL } from 'drizzle-orm';
import type { DatabaseService } from '../../database/database.service.js';
import type { UserRecord } from '../../database/schema.js';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { ALLOW_QUERY_TOKEN_KEY, IS_PUBLIC_KEY } from './public.decorator.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  extractBearerToken,
  hashPassword,
  signJwt,
  verifyJwt,
  verifyPassword,
} from './token.util.js';

function extractEqCondition(
  clause: SQL | undefined,
): { columnName: string; value: unknown } | null {
  if (!clause || !Array.isArray(clause.queryChunks)) {
    return null;
  }

  let columnName: string | null = null;
  let value: unknown = undefined;

  for (const chunk of clause.queryChunks) {
    if (!chunk || typeof chunk !== 'object') {
      continue;
    }

    const record = chunk as Record<string, unknown>;
    if (
      typeof record.name === 'string' &&
      'table' in record &&
      columnName === null
    ) {
      columnName = record.name;
    } else if ('value' in record && !Array.isArray(record.value)) {
      value = record.value;
    }
  }

  if (!columnName) {
    return null;
  }

  return { columnName, value };
}

function createFakeDatabase(initialReady = true) {
  let ready = initialReady;
  const rows: UserRecord[] = [];

  const db = {
    select(fields?: Record<string, unknown>) {
      const isCountQuery = Boolean(fields && 'count' in fields);

      return {
        from() {
          if (isCountQuery) {
            return Promise.resolve([{ count: rows.length }]);
          }

          return {
            where(clause?: SQL) {
              const condition = extractEqCondition(clause);
              const filtered = rows.filter((row) => {
                if (!condition) {
                  return true;
                }
                if (condition.columnName === 'id') {
                  return row.id === condition.value;
                }
                if (condition.columnName === 'email') {
                  return row.email === condition.value;
                }
                return false;
              });

              return {
                limit(limitCount: number) {
                  return Promise.resolve(filtered.slice(0, limitCount));
                },
              };
            },
          };
        },
      };
    },
    insert() {
      return {
        values(input: {
          email: string;
          displayName: string;
          passwordHash: string;
          role: string;
          avatarUrl?: string | null;
        }) {
          return {
            returning() {
              const now = new Date();
              const record: UserRecord = {
                id: randomUUID(),
                email: input.email,
                displayName: input.displayName,
                passwordHash: input.passwordHash,
                role: input.role,
                avatarUrl: input.avatarUrl ?? null,
                createdAt: now,
                updatedAt: now,
              };
              rows.push(record);
              return Promise.resolve([record]);
            },
          };
        },
      };
    },
  };

  const service = {
    isReady: () => ready,
    db,
  } as unknown as DatabaseService;

  return {
    service,
    rows,
    setReady(next: boolean) {
      ready = next;
    },
  };
}

function createExecutionContext(options: {
  headers?: Record<string, string | undefined>;
  query?: Record<string, string | undefined>;
  isPublic?: boolean;
  allowQueryToken?: boolean;
}): {
  context: ExecutionContext;
  request: AuthenticatedRequest;
  reflector: Reflector;
} {
  const request = {
    headers: options.headers ?? {},
    query: options.query ?? {},
  } as unknown as AuthenticatedRequest;

  const handler = () => undefined;
  class DummyController {}

  const reflector = {
    getAllAndOverride: <T>(key: string): T | undefined => {
      if (key === IS_PUBLIC_KEY) {
        return options.isPublic as T | undefined;
      }
      if (key === ALLOW_QUERY_TOKEN_KEY) {
        return options.allowQueryToken as T | undefined;
      }
      return undefined;
    },
  } as unknown as Reflector;

  const context = {
    getHandler: () => handler,
    getClass: () => DummyController,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  return { context, request, reflector };
}

describe('token.util', () => {
  const previousSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = 'unit-test-jwt-secret-key';
  });

  afterEach(() => {
    if (previousSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousSecret;
    }
  });

  it('hashes and verifies passwords with unique random salts', () => {
    const hash1 = hashPassword('super-secret-pass');
    const hash2 = hashPassword('super-secret-pass');

    expect(hash1).not.toBe(hash2);
    expect(hash1.split(':')).toHaveLength(2);
    expect(verifyPassword('super-secret-pass', hash1)).toBe(true);
    expect(verifyPassword('super-secret-pass', hash2)).toBe(true);
    expect(verifyPassword('wrong-password', hash1)).toBe(false);
    expect(verifyPassword('super-secret-pass', 'malformed-hash')).toBe(false);
    expect(verifyPassword('super-secret-pass', 'abc:not-hex!')).toBe(false);
  });

  it('signs and verifies access and refresh JWTs with expected TTLs', () => {
    const now = 1_700_000_000;
    const accessToken = signJwt({
      type: 'access',
      sub: 'user-1',
      email: 'owner@example.com',
      role: UserRole.ADMIN,
      nowSeconds: now,
    });
    const refreshToken = signJwt({
      type: 'refresh',
      sub: 'user-1',
      email: 'owner@example.com',
      role: UserRole.ADMIN,
      nowSeconds: now,
    });

    const verifiedAccess = verifyJwt(accessToken, {
      expectedType: 'access',
      nowSeconds: now + 100,
    });
    expect(verifiedAccess).toEqual({
      type: 'access',
      sub: 'user-1',
      email: 'owner@example.com',
      role: UserRole.ADMIN,
      iat: now,
      exp: now + ACCESS_TOKEN_TTL_SECONDS,
    });

    const verifiedRefresh = verifyJwt(refreshToken, {
      expectedType: 'refresh',
      nowSeconds: now + 100,
    });
    expect(verifiedRefresh).toEqual({
      type: 'refresh',
      sub: 'user-1',
      email: 'owner@example.com',
      role: UserRole.ADMIN,
      iat: now,
      exp: now + REFRESH_TOKEN_TTL_SECONDS,
    });

    expect(
      verifyJwt(accessToken, { expectedType: 'refresh', nowSeconds: now + 10 }),
    ).toBeNull();
    expect(
      verifyJwt(refreshToken, { expectedType: 'access', nowSeconds: now + 10 }),
    ).toBeNull();
  });

  it('rejects expired, tampered, or wrong-secret JWTs', () => {
    const now = 1_700_000_000;
    const token = signJwt(
      {
        type: 'access',
        sub: 'user-1',
        email: 'owner@example.com',
        role: UserRole.ADMIN,
        ttlSeconds: 60,
        nowSeconds: now,
      },
      'secret-a',
    );

    // Expired
    expect(
      verifyJwt(token, {
        expectedType: 'access',
        secret: 'secret-a',
        nowSeconds: now + 60,
      }),
    ).toBeNull();

    // Wrong secret
    expect(
      verifyJwt(token, {
        expectedType: 'access',
        secret: 'secret-b',
        nowSeconds: now + 10,
      }),
    ).toBeNull();

    // Tampered payload
    const [header, , sig] = token.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        type: 'access',
        sub: 'user-1',
        email: 'attacker@example.com',
        role: UserRole.ADMIN,
        iat: now,
        exp: now + 99999,
      }),
    ).toString('base64url');
    expect(
      verifyJwt(`${header}.${tamperedPayload}.${sig}`, {
        expectedType: 'access',
        secret: 'secret-a',
        nowSeconds: now + 10,
      }),
    ).toBeNull();

    // Malformed
    expect(verifyJwt('not-a-jwt')).toBeNull();
    expect(verifyJwt('a.b')).toBeNull();
  });

  it('extracts Bearer tokens from Authorization headers', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(extractBearerToken('bearer   token-123  ')).toBe('token-123');
    expect(extractBearerToken('Basic dXNlcjpwYXNz')).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
  });
});

describe('AuthService', () => {
  const previousSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = 'unit-test-auth-service-secret';
  });

  afterEach(() => {
    if (previousSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousSecret;
    }
  });

  it('reports authEnabled=false when DB is not ready or has 0 users', async () => {
    const fakeDb = createFakeDatabase(false);
    const authService = new AuthService(fakeDb.service);

    expect(await authService.getStatus()).toEqual({
      authEnabled: false,
      userCount: 0,
      currentUser: null,
    });
    expect(await authService.isAuthEnabled()).toBe(false);
    expect(await authService.getCurrentUser()).toBeNull();

    fakeDb.setReady(true);
    expect(await authService.getStatus()).toEqual({
      authEnabled: false,
      userCount: 0,
      currentUser: null,
    });
    expect(await authService.getCurrentUser()).toBeNull();
  });

  it('assigns ADMIN role to the first registered user and enables auth', async () => {
    const fakeDb = createFakeDatabase(true);
    const authService = new AuthService(fakeDb.service);

    const registered = await authService.register({
      email: '  Owner@Example.com ',
      password: 'password123',
      displayName: 'Server Owner',
    });

    expect(registered.user.email).toBe('owner@example.com');
    expect(registered.user.displayName).toBe('Server Owner');
    expect(registered.user.role).toBe(UserRole.ADMIN);
    expect(registered.tokens.expiresInSeconds).toBe(ACCESS_TOKEN_TTL_SECONDS);
    expect(registered.tokens.accessToken).toBeTruthy();
    expect(registered.tokens.refreshToken).toBeTruthy();

    const status = await authService.getStatus(
      `Bearer ${registered.tokens.accessToken}`,
    );
    expect(status).toEqual({
      authEnabled: true,
      userCount: 1,
      currentUser: registered.user,
    });

    // Status with invalid token does not throw 401
    const anonStatus = await authService.getStatus('Bearer invalid.token.here');
    expect(anonStatus).toEqual({
      authEnabled: true,
      userCount: 1,
      currentUser: null,
    });

    // getCurrentUser without token throws 401 once auth is enabled
    await expect(authService.getCurrentUser()).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(
      await authService.getCurrentUser(
        `Bearer ${registered.tokens.accessToken}`,
      ),
    ).toEqual(registered.user);
  });

  it('blocks non-admin registration once auth is enabled and allows admin to create USER accounts', async () => {
    const fakeDb = createFakeDatabase(true);
    const authService = new AuthService(fakeDb.service);

    const admin = await authService.register({
      email: 'admin@example.com',
      password: 'admin-password',
      displayName: 'Admin',
    });

    // Unauthenticated signup attempt blocked with ForbiddenException
    await expect(
      authService.register({
        email: 'intruder@example.com',
        password: 'password123',
        displayName: 'Intruder',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Admin can register a second user (assigned USER role)
    const regularUser = await authService.register(
      {
        email: 'friend@example.com',
        password: 'friend-password',
        displayName: 'Friend',
      },
      `Bearer ${admin.tokens.accessToken}`,
    );
    expect(regularUser.user.role).toBe(UserRole.USER);

    // Regular USER cannot register additional accounts
    await expect(
      authService.register(
        {
          email: 'third@example.com',
          password: 'password123',
          displayName: 'Third',
        },
        `Bearer ${regularUser.tokens.accessToken}`,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Duplicate email rejected with ConflictException
    await expect(
      authService.register(
        {
          email: 'FRIEND@example.com',
          password: 'password123',
          displayName: 'Duplicate Friend',
        },
        `Bearer ${admin.tokens.accessToken}`,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('validates registration fields', async () => {
    const fakeDb = createFakeDatabase(true);
    const authService = new AuthService(fakeDb.service);

    await expect(
      authService.register({
        email: 'not-an-email',
        password: 'password123',
        displayName: 'Owner',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      authService.register({
        email: 'owner@example.com',
        password: 'short',
        displayName: 'Owner',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      authService.register({
        email: 'owner@example.com',
        password: 'password123',
        displayName: '   ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('logs in with valid credentials and refreshes tokens', async () => {
    const fakeDb = createFakeDatabase(true);
    const authService = new AuthService(fakeDb.service);

    const created = await authService.register({
      email: 'owner@example.com',
      password: 'my-secret-password',
      displayName: 'Owner',
    });

    const loggedIn = await authService.login({
      email: 'OWNER@example.com',
      password: 'my-secret-password',
    });
    expect(loggedIn.user).toEqual(created.user);

    await expect(
      authService.login({
        email: 'owner@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(
      authService.login({
        email: 'unknown@example.com',
        password: 'my-secret-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    // Refresh with valid refresh token succeeds
    const refreshed = await authService.refresh({
      refreshToken: loggedIn.tokens.refreshToken,
    });
    expect(refreshed.user).toEqual(created.user);
    expect(refreshed.tokens.accessToken).toBeTruthy();

    // Refresh using an access token fails
    await expect(
      authService.refresh({
        refreshToken: loggedIn.tokens.accessToken,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    // Refresh after user is deleted fails
    fakeDb.rows.length = 0;
    await expect(
      authService.refresh({
        refreshToken: refreshed.tokens.refreshToken,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthGuard', () => {
  const previousSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = 'unit-test-auth-guard-secret';
  });

  afterEach(() => {
    if (previousSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousSecret;
    }
  });

  it('allows all requests in opt-in mode when no users exist', async () => {
    const fakeDb = createFakeDatabase(true);
    const authService = new AuthService(fakeDb.service);
    const { context, reflector } = createExecutionContext({});
    const guard = new AuthGuard(reflector, authService);

    expect(await guard.canActivate(context)).toBe(true);
  });

  it('allows @Public() routes even when auth is enabled', async () => {
    const fakeDb = createFakeDatabase(true);
    const authService = new AuthService(fakeDb.service);
    await authService.register({
      email: 'admin@example.com',
      password: 'password123',
      displayName: 'Admin',
    });

    const { context, reflector } = createExecutionContext({ isPublic: true });
    const guard = new AuthGuard(reflector, authService);

    expect(await guard.canActivate(context)).toBe(true);
  });

  it('enforces Bearer access tokens on protected routes and attaches req.user', async () => {
    const fakeDb = createFakeDatabase(true);
    const authService = new AuthService(fakeDb.service);
    const admin = await authService.register({
      email: 'admin@example.com',
      password: 'password123',
      displayName: 'Admin',
    });

    // Missing token -> 401
    const missingCtx = createExecutionContext({});
    const missingGuard = new AuthGuard(missingCtx.reflector, authService);
    await expect(
      missingGuard.canActivate(missingCtx.context),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    // Query token on normal route without @AllowQueryToken() -> 401
    const queryBlockedCtx = createExecutionContext({
      query: { token: admin.tokens.accessToken },
    });
    const queryBlockedGuard = new AuthGuard(
      queryBlockedCtx.reflector,
      authService,
    );
    await expect(
      queryBlockedGuard.canActivate(queryBlockedCtx.context),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    // Valid Bearer access token -> passes and populates req.user
    const validCtx = createExecutionContext({
      headers: { authorization: `Bearer ${admin.tokens.accessToken}` },
    });
    const validGuard = new AuthGuard(validCtx.reflector, authService);
    expect(await validGuard.canActivate(validCtx.context)).toBe(true);
    expect(validCtx.request.user).toEqual(admin.user);

    // Refresh token used as Bearer token -> rejected
    const refreshAsAccessCtx = createExecutionContext({
      headers: { authorization: `Bearer ${admin.tokens.refreshToken}` },
    });
    const refreshAsAccessGuard = new AuthGuard(
      refreshAsAccessCtx.reflector,
      authService,
    );
    await expect(
      refreshAsAccessGuard.canActivate(refreshAsAccessCtx.context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts ?token=<accessToken> on @AllowQueryToken() routes', async () => {
    const fakeDb = createFakeDatabase(true);
    const authService = new AuthService(fakeDb.service);
    const admin = await authService.register({
      email: 'admin@example.com',
      password: 'password123',
      displayName: 'Admin',
    });

    const validQueryCtx = createExecutionContext({
      allowQueryToken: true,
      query: { token: admin.tokens.accessToken },
    });
    const validQueryGuard = new AuthGuard(validQueryCtx.reflector, authService);
    expect(await validQueryGuard.canActivate(validQueryCtx.context)).toBe(true);
    expect(validQueryCtx.request.user).toEqual(admin.user);

    const invalidQueryCtx = createExecutionContext({
      allowQueryToken: true,
      query: { token: 'invalid.jwt.token' },
    });
    const invalidQueryGuard = new AuthGuard(
      invalidQueryCtx.reflector,
      authService,
    );
    await expect(
      invalidQueryGuard.canActivate(invalidQueryCtx.context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
