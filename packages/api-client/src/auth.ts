import {
  MyeongHaApiClientErrorV1,
  type MyeongHaApiClientV1,
} from './http.js';
import {
  normalizeOpaqueGuestBearerV1,
  parseGuestCredentialV1,
  type GuestCredentialV1,
} from './credentials.js';

export type BootstrapSessionResponseV1 =
  | Readonly<{
      subjectId: string;
      kind: 'member';
      guestSession: null;
    }>
  | Readonly<{
      subjectId: string;
      kind: 'guest';
      guestSession: Readonly<{
        guestSessionId: string;
        expiresAt: string;
        bearerToken: string | null;
      }>;
    }>;

export type CurrentSubjectProfileV1 = Readonly<{
  subjectId: string;
  subjectKind: 'guest' | 'member';
  subjectStatus: 'active' | 'deletion_pending';
  profile: null | Readonly<{
    displayName: string | null;
    locale: string | null;
    timezone: string | null;
    onboardingState: string | null;
    updatedAt: string;
  }>;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function malformed(code: string, message: string): never {
  throw new MyeongHaApiClientErrorV1('malformed_response', code, message);
}

function requireString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    malformed('API_AUTH_RESPONSE_INVALID', `MyeongHa auth response ${name} is invalid.`);
  }
  return value;
}

function requireTimestamp(name: string, value: unknown): string {
  const timestamp = requireString(name, value);
  if (!Number.isFinite(Date.parse(timestamp))) {
    malformed('API_AUTH_RESPONSE_INVALID', `MyeongHa auth response ${name} is invalid.`);
  }
  return timestamp;
}

function requireNullableString(name: string, value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    malformed('API_PROFILE_RESPONSE_INVALID', `MyeongHa profile ${name} is invalid.`);
  }
  return value;
}

function parseBootstrapSession(value: unknown): BootstrapSessionResponseV1 {
  if (!isRecord(value)) {
    return malformed('API_AUTH_RESPONSE_INVALID', 'MyeongHa bootstrap response is invalid.');
  }

  const subjectId = requireString('subject id', value.subjectId);
  if (value.kind === 'member') {
    if (value.guestSession !== null) {
      return malformed('API_AUTH_RESPONSE_INVALID', 'Member bootstrap response contains guest session state.');
    }
    return Object.freeze({ subjectId, kind: 'member', guestSession: null });
  }

  if (value.kind !== 'guest' || !isRecord(value.guestSession)) {
    return malformed('API_AUTH_RESPONSE_INVALID', 'Guest bootstrap response is invalid.');
  }

  const bearerValue = value.guestSession.bearerToken;
  const bearerToken = bearerValue === null
    ? null
    : normalizeOpaqueGuestBearerV1(bearerValue);

  return Object.freeze({
    subjectId,
    kind: 'guest',
    guestSession: Object.freeze({
      guestSessionId: requireString('guest session id', value.guestSession.guestSessionId),
      expiresAt: requireTimestamp('guest session expiry', value.guestSession.expiresAt),
      bearerToken,
    }),
  });
}

function parseProfile(value: unknown): CurrentSubjectProfileV1 {
  if (!isRecord(value)) {
    return malformed('API_PROFILE_RESPONSE_INVALID', 'MyeongHa profile response is invalid.');
  }
  if (value.subjectKind !== 'guest' && value.subjectKind !== 'member') {
    return malformed('API_PROFILE_RESPONSE_INVALID', 'MyeongHa profile subject kind is invalid.');
  }
  if (value.subjectStatus !== 'active' && value.subjectStatus !== 'deletion_pending') {
    return malformed('API_PROFILE_RESPONSE_INVALID', 'MyeongHa profile subject status is invalid.');
  }

  let profile: CurrentSubjectProfileV1['profile'] = null;
  if (value.profile !== null) {
    if (!isRecord(value.profile)) {
      return malformed('API_PROFILE_RESPONSE_INVALID', 'MyeongHa profile body is invalid.');
    }
    const updatedAt = requireTimestamp('profile updatedAt', value.profile.updatedAt);
    profile = Object.freeze({
      displayName: requireNullableString('displayName', value.profile.displayName),
      locale: requireNullableString('locale', value.profile.locale),
      timezone: requireNullableString('timezone', value.profile.timezone),
      onboardingState: requireNullableString('onboardingState', value.profile.onboardingState),
      updatedAt,
    });
  }

  return Object.freeze({
    subjectId: requireString('profile subject id', value.subjectId),
    subjectKind: value.subjectKind,
    subjectStatus: value.subjectStatus,
    profile,
  });
}

export async function bootstrapSessionV1(
  client: MyeongHaApiClientV1,
  bearer?: string,
): Promise<BootstrapSessionResponseV1> {
  const data = await client.requestData({
    method: 'POST',
    path: '/api/session/bootstrap',
    ...(bearer === undefined ? {} : { bearer }),
    body: Object.freeze({}),
  });
  return parseBootstrapSession(data);
}

export async function readCurrentSubjectProfileV1(
  client: MyeongHaApiClientV1,
  bearer: string,
): Promise<CurrentSubjectProfileV1> {
  return parseProfile(await client.requestData({
    method: 'GET',
    path: '/api/me',
    bearer,
  }));
}

export function resolveGuestCredentialFromBootstrapV1(
  bootstrap: BootstrapSessionResponseV1,
  existing: GuestCredentialV1 | null,
): GuestCredentialV1 | null {
  if (bootstrap.kind === 'member') return null;

  const session = bootstrap.guestSession;
  if (session.bearerToken !== null) {
    return parseGuestCredentialV1({
      kind: 'guest',
      subjectId: bootstrap.subjectId,
      guestSessionId: session.guestSessionId,
      bearerToken: session.bearerToken,
      expiresAt: session.expiresAt,
    });
  }

  if (
    existing === null ||
    existing.subjectId !== bootstrap.subjectId ||
    existing.guestSessionId !== session.guestSessionId ||
    Date.parse(existing.expiresAt) !== Date.parse(session.expiresAt)
  ) {
    return malformed(
      'API_GUEST_REUSE_CREDENTIAL_MISSING',
      'MyeongHa reused a guest session without a matching locally-held bearer credential.',
    );
  }

  return existing;
}
