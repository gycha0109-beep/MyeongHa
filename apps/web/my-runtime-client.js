const DEFAULT_PROFILE_ENDPOINT = '/v1/profile';

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

function assertProfile(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new MyRuntimeError('WEB_MY_MALFORMED_PROFILE', 'Profile API returned a malformed payload.');
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
        throw new MyRuntimeError('WEB_MY_PROFILE_REQUEST_FAILED', `Profile API request failed with status ${response.status}.`);
      }

      let payload;
      try {
        payload = await response.json();
      } catch (error) {
        throw new MyRuntimeError('WEB_MY_MALFORMED_PROFILE', 'Profile API returned invalid JSON.', error);
      }

      return assertProfile(payload);
    },
  });
}

export const MY_PROFILE_ENDPOINT_V1 = DEFAULT_PROFILE_ENDPOINT;
