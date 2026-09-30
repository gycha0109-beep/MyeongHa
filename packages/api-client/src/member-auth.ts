import {
  MyeongHaApiClientErrorV1,
  type MyeongHaApiClientV1,
} from './http.js';
import {
  parseMemberSessionV1,
  type MemberSessionV1,
} from './member-credentials.js';

export interface MemberSignInResultV1 {
  readonly session: MemberSessionV1;
  readonly passwordCompromiseCheck: 'safe' | 'unavailable' | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function malformed(message: string): never {
  throw new MyeongHaApiClientErrorV1(
    'malformed_response',
    'API_MEMBER_AUTH_RESPONSE_INVALID',
    message,
  );
}

function parseAuthenticatedSession(value: unknown): MemberSessionV1 {
  if (!isRecord(value) || value.status !== 'authenticated') {
    return malformed('Member auth response status is invalid.');
  }
  try {
    return parseMemberSessionV1(value.session);
  } catch (error) {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'API_MEMBER_AUTH_RESPONSE_INVALID',
      'Member auth session is invalid.',
      null,
      false,
      { cause: error },
    );
  }
}

export async function signInMemberV1(
  client: MyeongHaApiClientV1,
  input: Readonly<{ email: string; password: string }>,
): Promise<MemberSignInResultV1> {
  const data = await client.requestData({
    method: 'POST',
    path: '/api/auth/sign-in',
    body: Object.freeze({
      email: input.email,
      password: input.password,
    }),
  });

  const session = parseAuthenticatedSession(data);
  if (!isRecord(data)) return malformed('Member sign-in response is invalid.');
  const check = data.passwordCompromiseCheck;
  if (check !== undefined && check !== 'safe' && check !== 'unavailable') {
    return malformed('Member sign-in password compromise status is invalid.');
  }

  return Object.freeze({
    session,
    passwordCompromiseCheck:
      check === 'safe' || check === 'unavailable' ? check : null,
  });
}

export async function refreshMemberSessionV1(
  client: MyeongHaApiClientV1,
  refreshToken: string,
): Promise<MemberSessionV1> {
  const data = await client.requestData({
    method: 'POST',
    path: '/api/auth/refresh',
    body: Object.freeze({ refreshToken }),
  });
  return parseAuthenticatedSession(data);
}

export async function signOutMemberV1(
  client: MyeongHaApiClientV1,
  accessToken: string,
): Promise<void> {
  const data = await client.requestData({
    method: 'POST',
    path: '/api/auth/sign-out',
    bearer: accessToken,
    body: Object.freeze({}),
  });
  if (!isRecord(data) || data.signedOut !== true || Object.keys(data).length !== 1) {
    return malformed('Member sign-out response is invalid.');
  }
}
