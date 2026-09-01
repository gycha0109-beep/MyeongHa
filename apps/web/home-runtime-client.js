const DEFAULT_PROFILE_ENDPOINT = '/v1/profile';

export class HomeRuntimeError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'HomeRuntimeError';
    this.code = code;
  }
}

function requireFetch(fetchImpl) {
  if (typeof fetchImpl !== 'function') {
    throw new HomeRuntimeError('WEB_HOME_FETCH_UNAVAILABLE', 'Home profile transport is unavailable.');
  }
  return fetchImpl;
}

function assertProfilePayload(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HomeRuntimeError('WEB_HOME_MALFORMED_PROFILE', 'Home profile API returned a malformed payload.');
  }
  return payload;
}

export function createHomeRuntimeClient(options = {}) {
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
        throw new HomeRuntimeError('WEB_HOME_PROFILE_REQUEST_FAILED', 'Home profile request failed.', error);
      }

      if (response.status === 401 || response.status === 403) {
        throw new HomeRuntimeError('WEB_HOME_SESSION_REQUIRED', 'A current session is required.');
      }
      if (!response.ok) {
        throw new HomeRuntimeError('WEB_HOME_PROFILE_REQUEST_FAILED', `Home profile request failed with status ${response.status}.`);
      }

      let payload;
      try {
        payload = await response.json();
      } catch (error) {
        throw new HomeRuntimeError('WEB_HOME_MALFORMED_PROFILE', 'Home profile API returned invalid JSON.', error);
      }

      return assertProfilePayload(payload);
    },
  });
}

export const HOME_PROFILE_ENDPOINT_V1 = DEFAULT_PROFILE_ENDPOINT;
