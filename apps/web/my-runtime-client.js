import { unwrapApiSuccessEnvelope, WebApiEnvelopeError } from './api-envelope.js';
import { getActiveBearer, invalidateMemberSession } from './product-auth.js';

const DEFAULT_PROFILE_ENDPOINT = '/api/me';
const DEFAULT_BIRTH_PROFILE_ENDPOINT = '/api/me/birth-profile';

export class MyRuntimeError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'MyRuntimeError';
    this.code = code;
  }
}

function requireFetch(fetchImpl) {
  if (typeof fetchImpl !== 'function') {
    throw new MyRuntimeError('WEB_MY_FETCH_UNAVAILABLE', 'My page transport is unavailable.');
  }
  return fetchImpl;
}

function malformed(code, message) {
  throw new MyRuntimeError(code, message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNullableString(value) {
  return value === null || typeof value === 'string';
}

function assertProfile(payload) {
  if (!isRecord(payload)) malformed('WEB_MY_MALFORMED_PROFILE', 'Profile API returned a malformed payload.');
  if (payload.subjectKind !== 'guest' && payload.subjectKind !== 'member') {
    malformed('WEB_MY_MALFORMED_PROFILE', 'Profile API returned an invalid subject kind.');
  }
  if (payload.subjectStatus !== 'active' && payload.subjectStatus !== 'deletion_pending') {
    malformed('WEB_MY_MALFORMED_PROFILE', 'Profile API returned an invalid subject status.');
  }

  const profile = payload.profile;
  if (profile === null) return payload;
  if (!isRecord(profile)) malformed('WEB_MY_MALFORMED_PROFILE', 'Profile API returned an invalid profile object.');

  for (const field of ['displayName', 'locale', 'timezone', 'onboardingState']) {
    if (!isNullableString(profile[field])) {
      malformed('WEB_MY_MALFORMED_PROFILE', `Profile API returned an invalid ${field}.`);
    }
  }
  if (
    typeof profile.updatedAt !== 'string' ||
    profile.updatedAt.trim().length === 0 ||
    Number.isNaN(Date.parse(profile.updatedAt))
  ) {
    malformed('WEB_MY_MALFORMED_PROFILE', 'Profile API returned an invalid updatedAt timestamp.');
  }

  return payload;
}

function assertBirthProfile(payload) {
  if (!isRecord(payload) || !Object.prototype.hasOwnProperty.call(payload, 'birthProfile')) {
    malformed('WEB_MY_MALFORMED_BIRTH_PROFILE', 'Birth Profile API returned a malformed payload.');
  }
  if (payload.birthProfile === null) return payload;
  if (!isRecord(payload.birthProfile)) {
    malformed('WEB_MY_MALFORMED_BIRTH_PROFILE', 'Birth Profile API returned an invalid profile.');
  }
  const profile = payload.birthProfile;
  if (profile.profileKind !== 'self' || profile.archivedAt !== null) {
    malformed('WEB_MY_MALFORMED_BIRTH_PROFILE', 'Birth Profile API returned a non-current self profile.');
  }
  if (!isRecord(profile.currentRevision) || !isRecord(profile.currentRevision.input)) {
    malformed('WEB_MY_MALFORMED_BIRTH_PROFILE', 'Birth Profile API returned an invalid current revision.');
  }
  const revision = profile.currentRevision;
  const input = revision.input;
  if (
    typeof revision.revisionId !== 'string' || revision.revisionId.trim().length === 0 ||
    typeof revision.revisionNo !== 'number' || !Number.isSafeInteger(revision.revisionNo) || revision.revisionNo <= 0
  ) {
    malformed('WEB_MY_MALFORMED_BIRTH_PROFILE', 'Birth Profile API returned invalid revision identity.');
  }
  if (input.calendarType !== 'solar' && input.calendarType !== 'lunar') {
    malformed('WEB_MY_MALFORMED_BIRTH_PROFILE', 'Birth Profile API returned an invalid calendar type.');
  }
  if (typeof input.birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(input.birthDate)) {
    malformed('WEB_MY_MALFORMED_BIRTH_PROFILE', 'Birth Profile API returned an invalid birth date.');
  }
  if (typeof input.timeKnown !== 'boolean' || typeof input.isLeapMonth !== 'boolean') {
    malformed('WEB_MY_MALFORMED_BIRTH_PROFILE', 'Birth Profile API returned invalid time/calendar flags.');
  }
  if (input.birthTime !== null && typeof input.birthTime !== 'string') {
    malformed('WEB_MY_MALFORMED_BIRTH_PROFILE', 'Birth Profile API returned an invalid birth time.');
  }
  if ((input.timeKnown && input.birthTime === null) || (!input.timeKnown && input.birthTime !== null)) {
    malformed('WEB_MY_MALFORMED_BIRTH_PROFILE', 'Birth Profile API returned inconsistent birth time state.');
  }
  if (input.sex !== null && input.sex !== 'male' && input.sex !== 'female' && input.sex !== 'unspecified') {
    malformed('WEB_MY_MALFORMED_BIRTH_PROFILE', 'Birth Profile API returned an invalid sex value.');
  }
  return payload;
}

async function readAuthorizedJson({
  fetchImpl,
  endpoint,
  resolveBearer,
  failureCode,
  malformedCode,
  assertPayload,
  invalidateRejectedMember = false,
}) {
  const activeBearer = await resolveBearer();
  if (!activeBearer?.token) {
    throw new MyRuntimeError('WEB_MY_SESSION_REQUIRED', 'A current session is required.');
  }

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${activeBearer.token}`,
      },
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch (error) {
    throw new MyRuntimeError(failureCode, 'My API request failed.', error);
  }

  if (response.status === 401 || response.status === 403) {
    if (invalidateRejectedMember && response.status === 401 && activeBearer.kind === 'member') {
      invalidateMemberSession();
    }
    throw new MyRuntimeError('WEB_MY_SESSION_REQUIRED', 'A current session is required.');
  }
  if (!response.ok) {
    throw new MyRuntimeError(failureCode, `My API request failed with status ${response.status}.`);
  }

  let envelope;
  try {
    envelope = await response.json();
  } catch (error) {
    throw new MyRuntimeError(malformedCode, 'My API returned invalid JSON.', error);
  }

  try {
    return assertPayload(unwrapApiSuccessEnvelope(envelope));
  } catch (error) {
    if (error instanceof WebApiEnvelopeError) {
      throw new MyRuntimeError(malformedCode, error.message, error);
    }
    throw error;
  }
}

export function createMyRuntimeClient(options = {}) {
  const fetchImpl = requireFetch(options.fetchImpl ?? globalThis.fetch);
  const profileEndpoint = options.profileEndpoint ?? DEFAULT_PROFILE_ENDPOINT;
  const birthProfileEndpoint = options.birthProfileEndpoint ?? DEFAULT_BIRTH_PROFILE_ENDPOINT;
  const resolveBearer = options.resolveBearer ?? getActiveBearer;

  return Object.freeze({
    readProfile() {
      return readAuthorizedJson({
        fetchImpl,
        endpoint: profileEndpoint,
        resolveBearer,
        failureCode: 'WEB_MY_PROFILE_REQUEST_FAILED',
        malformedCode: 'WEB_MY_MALFORMED_PROFILE',
        assertPayload: assertProfile,
        invalidateRejectedMember: true,
      });
    },
    readBirthProfile() {
      return readAuthorizedJson({
        fetchImpl,
        endpoint: birthProfileEndpoint,
        resolveBearer,
        failureCode: 'WEB_MY_BIRTH_PROFILE_REQUEST_FAILED',
        malformedCode: 'WEB_MY_MALFORMED_BIRTH_PROFILE',
        assertPayload: assertBirthProfile,
      });
    },
  });
}

export const MY_PROFILE_ENDPOINT_V1 = DEFAULT_PROFILE_ENDPOINT;
export const MY_BIRTH_PROFILE_ENDPOINT_V1 = DEFAULT_BIRTH_PROFILE_ENDPOINT;
