import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import {
  isMemberAuthRateLimitActionV1,
  type MemberAuthRateLimitActionV1,
} from './member-auth-rate-limit.js';

export const MEMBER_AUTH_RATE_LIMIT_FINGERPRINT_VERSION_V1 =
  'myeongha-member-auth-rate-limit-hmac-sha256-v1' as const;

export class MemberAuthClientNetworkKeyErrorV1 extends Error {
  constructor(
    readonly code: 'CLIENT_IP_UNAVAILABLE' | 'CLIENT_IP_INVALID' | 'SECRET_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'MemberAuthClientNetworkKeyErrorV1';
  }
}

export function readTrustedVercelClientIpV1(request: Request): string {
  const raw = request.headers.get('x-forwarded-for');
  if (raw === null || raw.trim().length === 0) {
    throw new MemberAuthClientNetworkKeyErrorV1(
      'CLIENT_IP_UNAVAILABLE',
      'Trusted Vercel client IP header is unavailable.',
    );
  }

  const value = raw.trim();
  if (value.includes(',') || isIP(value) === 0) {
    throw new MemberAuthClientNetworkKeyErrorV1(
      'CLIENT_IP_INVALID',
      'Trusted Vercel client IP header is not one exact IP literal.',
    );
  }
  return value;
}

export function fingerprintMemberAuthClientV1(input: {
  readonly clientIp: string;
  readonly action: MemberAuthRateLimitActionV1;
  readonly secret: string;
}): Uint8Array {
  if (!isMemberAuthRateLimitActionV1(input.action)) {
    throw new Error('Unsupported Member Auth rate-limit action.');
  }
  if (isIP(input.clientIp) === 0 || input.clientIp.includes(',')) {
    throw new MemberAuthClientNetworkKeyErrorV1(
      'CLIENT_IP_INVALID',
      'Member Auth rate-limit client IP is invalid.',
    );
  }
  if (input.secret.length < 32) {
    throw new MemberAuthClientNetworkKeyErrorV1(
      'SECRET_INVALID',
      'Member Auth rate-limit HMAC secret is outside the production minimum.',
    );
  }

  return createHmac('sha256', input.secret)
    .update(MEMBER_AUTH_RATE_LIMIT_FINGERPRINT_VERSION_V1, 'utf8')
    .update('\0', 'utf8')
    .update(input.action, 'utf8')
    .update('\0', 'utf8')
    .update(input.clientIp, 'utf8')
    .digest();
}
