import { unwrapApiSuccessEnvelope, WebApiEnvelopeError } from './api-envelope.js';

const DEFAULT_PROFILE_ENDPOINT = '/api/me';

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

function malformed(message) {
  throw new MyRuntimeError('WEB_MY_MALFORMED_PROFILE', message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNullableString(value) {
  return value === null || typeof value === 'string';
}

function assertProfile(payload) {
  if (!isRecord(payload)) malformed('Profile API returned a malformed payload.');
  if (payload.subjectKind !== 'guest' && payload.subjectKind !== 'member') {
    malformed('Profile API returned an invalid subject kind.');
  }
  if (payload.subjectStatus !== 'active' && payload.subjectStatus !== 'deletion_pending') {
    malformed('Profile API returned an invalid subject status.');
  }

  const profile = payload.profile;
  if (profile === null) return payload;
  if (!isRecord(profile)) malformed('Profile API returned an invalid profile object.');

  for (const field of ['displayName', 'locale', 'timezone', 'onboardingState']) {
    if (!isNullableString(profile[field])) {
      malformed(`Profile API returned an invalid ${field}.`);
    }
  }
  if (
    typeof profile.updatedAt !== 'string' ||
    profile.updatedAt.trim().length === 0 ||
    Number.isNaN(Date.parse(profile.updatedAt))
  ) {
    malformed('Profile API returned an invalid updatedAt timestamp.');
  }

  return payload;
}

export function createMyRuntimeClient(options = {}) {
  const fetchImpl = requireFetch(options.fetchImpl ?? globalThis.fetch);
  const profileEndpoint = options.profileEndpoint ?? DEFAULT_PROFILE_ENDPOINT;

  return Object.freeze({
    async readProfile() {
      let response;
      try {
        response = await fetchImpl(profileEndpoint, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
          cache: 'no-store',
        });
      } catch (error) {
        throw new MyRuntimeError('WEB_MY_PROFILE_REQUEST_FAILED', 'Profile API request failed.', error);
      }

      if (response.status === 401 || response.status === 403) {
        throw new MyRuntimeError('WEB_MY_SESSION_REQUIRED', 'A current session is required.');
      }
      if (!response.ok) {
        throw new MyRuntimeError(
          'WEB_MY_PROFILE_REQUEST_FAILED',
          `Profile API request failed with status ${response.status}.`,
        );
      }

      let envelope;
      try {
        envelope = await response.json();
      } catch (error) {
        throw new MyRuntimeError('WEB_MY_MALFORMED_PROFILE', 'Profile API returned invalid JSON.', error);
      }

      try {
        return assertProfile(unwrapApiSuccessEnvelope(envelope));
      } catch (error) {
        if (error instanceof WebApiEnvelopeError) {
          throw new MyRuntimeError('WEB_MY_MALFORMED_PROFILE', error.message, error);
        }
        throw error;
      }
    },
  });
}

export const MY_PROFILE_ENDPOINT_V1 = DEFAULT_PROFILE_ENDPOINT;
