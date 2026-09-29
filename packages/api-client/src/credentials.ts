export interface GuestCredentialV1 {
  readonly kind: 'guest';
  readonly subjectId: string;
  readonly guestSessionId: string;
  readonly bearerToken: string;
  readonly expiresAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Guest credential ${name} is invalid.`);
  }
  return value;
}

export function normalizeOpaqueGuestBearerV1(value: unknown): string {
  const bearer = requireString('bearer token', value);
  if (
    bearer.length > 4096 ||
    /\s/u.test(bearer) ||
    /^[^.\s]+\.[^.\s]+\.[^.\s]+$/u.test(bearer)
  ) {
    throw new Error('Guest credential bearer token is invalid.');
  }
  return bearer;
}

function requireTimestamp(name: string, value: unknown): string {
  const timestamp = requireString(name, value);
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new Error(`Guest credential ${name} is not a timestamp.`);
  }
  return timestamp;
}

export function parseGuestCredentialV1(value: unknown): GuestCredentialV1 {
  if (!isRecord(value) || value.kind !== 'guest') {
    throw new Error('Guest credential payload is invalid.');
  }

  return Object.freeze({
    kind: 'guest',
    subjectId: requireString('subject id', value.subjectId),
    guestSessionId: requireString('guest session id', value.guestSessionId),
    bearerToken: normalizeOpaqueGuestBearerV1(value.bearerToken),
    expiresAt: requireTimestamp('expiry', value.expiresAt),
  });
}

export function serializeGuestCredentialV1(value: GuestCredentialV1): string {
  return JSON.stringify(parseGuestCredentialV1(value));
}

export function parseStoredGuestCredentialV1(raw: string): GuestCredentialV1 {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error('Stored guest credential is not JSON.', { cause: error });
  }
  return parseGuestCredentialV1(payload);
}

export function isGuestCredentialExpiredV1(
  credential: GuestCredentialV1,
  nowEpochMs = Date.now(),
): boolean {
  return Date.parse(credential.expiresAt) <= nowEpochMs;
}
