const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';
const BIRTH_PROFILE_URL = `${PRODUCTION_ORIGIN}/api/birth-profiles`;
const DYNAMIC_PROFILE_ID = 'b6300000-0000-0000-0000-000000000001';
const REQUEST_TIMEOUT_MS = 15_000;

function requireNoStore(response, label) {
  const cacheControl = response.headers.get('cache-control') ?? '';
  const directives = cacheControl
    .split(',')
    .map((directive) => directive.trim().toLowerCase())
    .filter(Boolean);

  if (!directives.includes('no-store')) {
    throw new Error(`${label} must return Cache-Control containing no-store.`);
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJsonWithoutLogging(response, label) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`${label} did not return valid JSON.`);
  }

  if (!isRecord(body)) {
    throw new Error(`${label} returned a non-object JSON body.`);
  }
  return body;
}

async function fetchCanonical(url, init) {
  return fetch(url, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

const createBody = {
  label: 'production-boundary-smoke',
  input: {
    calendarType: 'solar',
    birthDate: '1990-01-02',
    birthTime: '08:30:00',
    timeKnown: true,
    isLeapMonth: false,
    sex: 'female',
  },
};

const rootPost = await fetchCanonical(BIRTH_PROFILE_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(createBody),
});
requireNoStore(rootPost, 'Unauthenticated POST /api/birth-profiles');
if (rootPost.status !== 401) {
  throw new Error(
    `Unauthenticated POST /api/birth-profiles expected HTTP 401, received ${rootPost.status}.`,
  );
}
const rootPostBody = await readJsonWithoutLogging(
  rootPost,
  'Unauthenticated POST /api/birth-profiles',
);
if (
  rootPostBody.ok !== false ||
  !isRecord(rootPostBody.error) ||
  rootPostBody.error.code !== 'AUTH_REQUIRED' ||
  !isRecord(rootPostBody.meta) ||
  rootPostBody.meta.apiContractVersion !== 'v0.9'
) {
  throw new Error(
    'Unauthenticated POST /api/birth-profiles did not return the v0.9 AUTH_REQUIRED envelope.',
  );
}

const rootGet = await fetchCanonical(BIRTH_PROFILE_URL, { method: 'GET' });
requireNoStore(rootGet, 'GET /api/birth-profiles root');
if (rootGet.status !== 404) {
  throw new Error(`GET /api/birth-profiles root expected HTTP 404, received ${rootGet.status}.`);
}

const dynamicPost = await fetchCanonical(
  `${BIRTH_PROFILE_URL}/${DYNAMIC_PROFILE_ID}`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createBody),
  },
);
requireNoStore(dynamicPost, 'POST /api/birth-profiles/:id');
if (dynamicPost.status !== 405) {
  throw new Error(
    `POST /api/birth-profiles/:id expected HTTP 405, received ${dynamicPost.status}.`,
  );
}
if ((dynamicPost.headers.get('allow') ?? '') !== 'GET') {
  throw new Error('POST /api/birth-profiles/:id must preserve Allow: GET.');
}

console.log(
  'MyeongHa production Birth Profile create boundary smoke passed: root POST=401 AUTH_REQUIRED v0.9, root GET=404, dynamic POST=405 Allow GET, cacheControl=no-store.',
);
