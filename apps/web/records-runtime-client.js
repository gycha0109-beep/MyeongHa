const DEFAULT_ENDPOINTS = Object.freeze({
  profile: '/v1/profile',
  birthProfile: '/v1/records/birth-profile',
  lifeFacts: '/v1/records/life-facts',
  memories: '/v1/records/memories',
});

export class RecordsRuntimeError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'RecordsRuntimeError';
    this.code = code;
  }
}

function requireFetch(fetchImpl) {
  if (typeof fetchImpl !== 'function') {
    throw new RecordsRuntimeError('WEB_RECORDS_FETCH_UNAVAILABLE', 'Records API transport is unavailable.');
  }
  return fetchImpl;
}

function assertJsonObject(value, endpoint) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new RecordsRuntimeError('WEB_RECORDS_MALFORMED_RESPONSE', `Records API returned a malformed payload for ${endpoint}.`);
  }
  return value;
}

async function readJson(fetchImpl, endpoint) {
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch (error) {
    throw new RecordsRuntimeError('WEB_RECORDS_REQUEST_FAILED', 'Records API request failed.', error);
  }

  if (response.status === 401 || response.status === 403) {
    throw new RecordsRuntimeError('WEB_RECORDS_SESSION_REQUIRED', 'A current session is required.');
  }
  if (!response.ok) {
    throw new RecordsRuntimeError('WEB_RECORDS_REQUEST_FAILED', `Records API request failed with status ${response.status}.`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new RecordsRuntimeError('WEB_RECORDS_MALFORMED_RESPONSE', 'Records API returned invalid JSON.', error);
  }
  return assertJsonObject(payload, endpoint);
}

export function createRecordsRuntimeClient(options = {}) {
  const fetchImpl = requireFetch(options.fetchImpl ?? globalThis.fetch);
  const endpoints = Object.freeze({ ...DEFAULT_ENDPOINTS, ...(options.endpoints ?? {}) });

  return Object.freeze({
    readProfile: () => readJson(fetchImpl, endpoints.profile),
    readBirthProfile: () => readJson(fetchImpl, endpoints.birthProfile),
    readLifeFacts: () => readJson(fetchImpl, endpoints.lifeFacts),
    readMemories: () => readJson(fetchImpl, endpoints.memories),
    async readRecords() {
      const [profile, birthProfile, lifeFacts, memories] = await Promise.all([
        readJson(fetchImpl, endpoints.profile),
        readJson(fetchImpl, endpoints.birthProfile),
        readJson(fetchImpl, endpoints.lifeFacts),
        readJson(fetchImpl, endpoints.memories),
      ]);
      return Object.freeze({ profile, birthProfile, lifeFacts, memories });
    },
  });
}

export const RECORDS_RUNTIME_ENDPOINTS_V1 = DEFAULT_ENDPOINTS;
