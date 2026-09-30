export interface MemberSessionUserV1 {
  readonly id: string | null;
  readonly email: string | null;
}

export interface MemberSessionV1 {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: string;
  readonly tokenType: 'bearer';
  readonly user: MemberSessionUserV1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireCredentialString(name: string, value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 4096 ||
    /\s/u.test(value)
  ) {
    throw new Error(`Member session ${name} is invalid.`);
  }
  return value;
}

function requireTimestamp(name: string, value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Member session ${name} is invalid.`);
  }
  return value;
}

function nullableString(name: string, value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`Member session user ${name} is invalid.`);
  }
  return value;
}

export function parseMemberSessionV1(value: unknown): MemberSessionV1 {
  if (!isRecord(value) || value.tokenType !== 'bearer' || !isRecord(value.user)) {
    throw new Error('Member session payload is invalid.');
  }

  return Object.freeze({
    accessToken: requireCredentialString('access token', value.accessToken),
    refreshToken: requireCredentialString('refresh token', value.refreshToken),
    expiresAt: requireTimestamp('expiry', value.expiresAt),
    tokenType: 'bearer',
    user: Object.freeze({
      id: nullableString('id', value.user.id),
      email: nullableString('email', value.user.email),
    }),
  });
}

export function serializeMemberSessionV1(value: MemberSessionV1): string {
  return JSON.stringify(parseMemberSessionV1(value));
}

export function parseStoredMemberSessionV1(raw: string): MemberSessionV1 {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error('Stored Member session is not JSON.', { cause: error });
  }
  return parseMemberSessionV1(payload);
}

export function sameMemberSessionGenerationV1(
  left: MemberSessionV1,
  right: MemberSessionV1,
): boolean {
  return (
    left.accessToken === right.accessToken &&
    left.refreshToken === right.refreshToken
  );
}

export function isMemberSessionExpiredV1(
  session: MemberSessionV1,
  nowEpochMs = Date.now(),
): boolean {
  return Date.parse(session.expiresAt) <= nowEpochMs;
}

export function isMemberSessionRefreshDueV1(
  session: MemberSessionV1,
  nowEpochMs = Date.now(),
  refreshSkewMs = 60_000,
): boolean {
  if (!Number.isSafeInteger(refreshSkewMs) || refreshSkewMs < 0) {
    throw new RangeError('Member session refresh skew must be a non-negative integer.');
  }
  return Date.parse(session.expiresAt) - nowEpochMs <= refreshSkewMs;
}
