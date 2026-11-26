import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { Logger } from '@nestjs/common';
import { UserRole } from '@my-spotify/shared-types';

export const ACCESS_TOKEN_TTL_SECONDS = 3600;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

const SALT_BYTES = 16;
const SCRYPT_KEY_LENGTH = 64;
const VALID_ROLES = new Set<string>(Object.values(UserRole));
const logger = new Logger('TokenUtil');

let cachedFallbackSecret: string | null = null;
let warnedAboutFallbackSecret = false;

export type JwtTokenType = 'access' | 'refresh';

export interface JwtPayload {
  type: JwtTokenType;
  sub: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export interface SignTokenInput {
  type: JwtTokenType;
  sub: string;
  email: string;
  role: UserRole;
  ttlSeconds?: number;
  nowSeconds?: number;
}

export interface VerifyTokenOptions {
  expectedType?: JwtTokenType;
  secret?: string;
  nowSeconds?: number;
}

export function getJwtSecret(): string {
  const configured = process.env.JWT_SECRET?.trim();
  if (configured) {
    return configured;
  }

  if (!cachedFallbackSecret) {
    cachedFallbackSecret = randomBytes(32).toString('hex');
  }

  if (!warnedAboutFallbackSecret) {
    warnedAboutFallbackSecret = true;
    logger.warn(
      'JWT_SECRET is not set. Using an ephemeral generated secret; tokens will be invalidated on server restart. Set JWT_SECRET in your environment for persistent sessions.',
    );
  }

  return cachedFallbackSecret;
}

export function hashPassword(password: string): string {
  const saltHex = randomBytes(SALT_BYTES).toString('hex');
  const hashHex = scryptSync(password, saltHex, SCRYPT_KEY_LENGTH).toString(
    'hex',
  );
  return `${saltHex}:${hashHex}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) {
    return false;
  }

  const [saltHex, hashHex] = parts;
  if (
    !saltHex ||
    !hashHex ||
    hashHex.length % 2 !== 0 ||
    !/^[0-9a-f]+$/i.test(hashHex)
  ) {
    return false;
  }

  const expectedBuffer = Buffer.from(hashHex, 'hex');
  if (expectedBuffer.length === 0) {
    return false;
  }

  const derivedBuffer = scryptSync(password, saltHex, expectedBuffer.length);
  if (derivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(derivedBuffer, expectedBuffer);
}

function encodeBase64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeBase64UrlJson(segment: string): unknown {
  const raw = Buffer.from(segment, 'base64url').toString('utf8');
  return JSON.parse(raw) as unknown;
}

function signSegment(signingInput: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64url');
}

export function signJwt(input: SignTokenInput, secret?: string): string {
  const resolvedSecret = secret ?? getJwtSecret();
  const iat = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ttlSeconds =
    input.ttlSeconds ??
    (input.type === 'refresh'
      ? REFRESH_TOKEN_TTL_SECONDS
      : ACCESS_TOKEN_TTL_SECONDS);

  const header = { alg: 'HS256', typ: 'JWT' } as const;
  const payload: JwtPayload = {
    type: input.type,
    sub: input.sub,
    email: input.email,
    role: input.role,
    iat,
    exp: iat + ttlSeconds,
  };

  const encodedHeader = encodeBase64UrlJson(header);
  const encodedPayload = encodeBase64UrlJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = signSegment(signingInput, resolvedSecret);

  return `${signingInput}.${signature}`;
}

export function verifyJwt(
  token: string,
  options: VerifyTokenOptions = {},
): JwtPayload | null {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    return null;
  }

  const resolvedSecret = options.secret ?? getJwtSecret();
  const expectedSignature = signSegment(
    `${encodedHeader}.${encodedPayload}`,
    resolvedSecret,
  );

  const actualSigBuffer = Buffer.from(encodedSignature, 'utf8');
  const expectedSigBuffer = Buffer.from(expectedSignature, 'utf8');
  if (
    actualSigBuffer.length !== expectedSigBuffer.length ||
    !timingSafeEqual(actualSigBuffer, expectedSigBuffer)
  ) {
    return null;
  }

  let parsedHeader: unknown;
  let parsedPayload: unknown;
  try {
    parsedHeader = decodeBase64UrlJson(encodedHeader);
    parsedPayload = decodeBase64UrlJson(encodedPayload);
  } catch {
    return null;
  }

  if (
    !parsedHeader ||
    typeof parsedHeader !== 'object' ||
    (parsedHeader as Record<string, unknown>).alg !== 'HS256' ||
    (parsedHeader as Record<string, unknown>).typ !== 'JWT'
  ) {
    return null;
  }

  if (!parsedPayload || typeof parsedPayload !== 'object') {
    return null;
  }

  const candidate = parsedPayload as Record<string, unknown>;
  const type = candidate.type;
  const sub = candidate.sub;
  const email = candidate.email;
  const role = candidate.role;
  const iat = candidate.iat;
  const exp = candidate.exp;

  if (
    (type !== 'access' && type !== 'refresh') ||
    typeof sub !== 'string' ||
    sub.length === 0 ||
    typeof email !== 'string' ||
    email.length === 0 ||
    typeof role !== 'string' ||
    !VALID_ROLES.has(role) ||
    typeof iat !== 'number' ||
    !Number.isFinite(iat) ||
    typeof exp !== 'number' ||
    !Number.isFinite(exp)
  ) {
    return null;
  }

  if (options.expectedType && type !== options.expectedType) {
    return null;
  }

  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (exp <= nowSeconds) {
    return null;
  }

  return {
    type,
    sub,
    email,
    role: role as UserRole,
    iat,
    exp,
  };
}

export function extractBearerToken(
  authorizationHeader?: string | string[],
): string | null {
  const headerValue = Array.isArray(authorizationHeader)
    ? authorizationHeader[0]
    : authorizationHeader;

  if (!headerValue || typeof headerValue !== 'string') {
    return null;
  }

  const match = /^Bearer\s+(\S+)$/i.exec(headerValue.trim());
  return match?.[1] ?? null;
}
