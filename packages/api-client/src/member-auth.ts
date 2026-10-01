import {
  MyeongHaApiClientErrorV1,
  type MyeongHaApiClientV1,
} from './http.js';

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

function invalid(code: string, message: string): never {
  throw new MyeongHaApiClientErrorV1(
    'malformed_response',
    code,
    message,
  );
}

function requireToken(name: string, value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 4096 ||
    /\s/u.test(value)
  ) {
    return invalid('API_MEMBER_SESSION_INVALID', `Member session ${name} is invalid.`);
  }
  return value;
}

function requireTimestamp(name: string, value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    return invalid('API_MEMBER_SESSION_INVALID', `Member session ${name} is invalid.`);
  }
  return value;
}

function nullableString(name: string, value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    return invalid('API_MEMBER_SESSION_INVALID', `Member session ${name} is invalid.`);
  }
  return value;
}

function parseMemberSession(value: unknown): MemberSessionV1 {
  if (!isRecord(value) || value.tokenType !== 'bearer' || !isRecord(value.user)) {
    return invalid('API_MEMBER_SESSION_INVALID', 'Member session response is invalid.');
  }

  return Object.freeze({
    accessToken: requireToken('accessToken', value.accessToken),
    refreshToken: requireToken('refreshToken', value.refreshToken),
    expiresAt: requireTimestamp('expiresAt', value.expiresAt),
    tokenType: 'bearer',
    user: Object.freeze({
      id: nullableString('user id', value.user.id),
      email: nullableString('user email', value.user.email),
    }),
  });
}

function parseAuthenticatedData(value: unknown): MemberSessionV1 {
  if (!isRecord(value) || value.status !== 'authenticated') {
    return invalid('API_MEMBER_AUTH_RESPONSE_INVALID', 'Member auth response is invalid.');
  }
  return parseMemberSession(value.session);
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') {
    return invalid('CLIENT_MEMBER_AUTH_INVALID', 'Member email is invalid.');
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length < 3 ||
    normalized.length > 320 ||
    !normalized.includes('@')
  ) {
    return invalid('CLIENT_MEMBER_AUTH_INVALID', 'Member email is invalid.');
  }
  return normalized;
}

function normalizePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) {
    return invalid('CLIENT_MEMBER_AUTH_INVALID', 'Member password is invalid.');
  }
  return value;
}

export function parseStoredMemberSessionV1(value: unknown): MemberSessionV1 {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch (error) {
      throw new MyeongHaApiClientErrorV1(
        'malformed_response',
        'STORED_MEMBER_SESSION_INVALID',
        'Stored Member session is not valid JSON.',
        null,
        false,
        { cause: error },
      );
    }
  }
  return parseMemberSession(parsed);
}

export function serializeMemberSessionV1(session: MemberSessionV1): string {
  return JSON.stringify(parseMemberSession(session));
}

export function isMemberSessionExpiredV1(
  session: MemberSessionV1,
  nowEpochMs = Date.now(),
): boolean {
  return Date.parse(session.expiresAt) <= nowEpochMs;
}

export async function signInMemberV1(
  client: MyeongHaApiClientV1,
  email: string,
  password: string,
): Promise<MemberSessionV1> {
  return parseAuthenticatedData(await client.requestData({
    method: 'POST',
    path: '/api/auth/sign-in',
    body: Object.freeze({
      email: normalizeEmail(email),
      password: normalizePassword(password),
    }),
  }));
}

export async function refreshMemberSessionV1(
  client: MyeongHaApiClientV1,
  refreshToken: string,
): Promise<MemberSessionV1> {
  return parseAuthenticatedData(await client.requestData({
    method: 'POST',
    path: '/api/auth/refresh',
    body: Object.freeze({
      refreshToken: requireToken('refreshToken', refreshToken),
    }),
  }));
}

export async function signOutMemberV1(
  client: MyeongHaApiClientV1,
  accessToken: string,
): Promise<void> {
  const data = await client.requestData({
    method: 'POST',
    path: '/api/auth/sign-out',
    bearer: requireToken('accessToken', accessToken),
    body: Object.freeze({}),
  });
  if (!isRecord(data) || data.signedOut !== true) {
    return invalid('API_MEMBER_AUTH_RESPONSE_INVALID', 'Member sign-out response is invalid.');
  }
}
