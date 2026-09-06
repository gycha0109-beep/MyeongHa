const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';
const CHAT_OPEN_URL = `${PRODUCTION_ORIGIN}/api/chat`;
const REQUEST_TIMEOUT_MS = 15_000;

function requireNoStore(response, label) {
  const directives = (response.headers.get('cache-control') ?? '')
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

async function fetchCanonical(init) {
  return fetch(CHAT_OPEN_URL, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

const methodBoundary = await fetchCanonical({ method: 'GET' });
requireNoStore(methodBoundary, 'GET /api/chat');
if (methodBoundary.status !== 405) {
  throw new Error(`GET /api/chat expected HTTP 405, received ${methodBoundary.status}.`);
}
if ((methodBoundary.headers.get('allow') ?? '') !== 'POST') {
  throw new Error('GET /api/chat must preserve Allow: POST.');
}

const unauthenticatedOpen = await fetchCanonical({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ characterId: 'production-negative-probe' }),
});
requireNoStore(unauthenticatedOpen, 'Unauthenticated POST /api/chat');
if (unauthenticatedOpen.status !== 401) {
  throw new Error(
    `Unauthenticated POST /api/chat expected HTTP 401, received ${unauthenticatedOpen.status}.`,
  );
}

const body = await readJsonWithoutLogging(
  unauthenticatedOpen,
  'Unauthenticated POST /api/chat',
);
if (
  body.ok !== false ||
  !isRecord(body.error) ||
  body.error.code !== 'AUTH_REQUIRED' ||
  body.error.messageKey !== 'auth.required' ||
  body.error.retryable !== false ||
  !isRecord(body.meta) ||
  body.meta.apiContractVersion !== 'v0.9' ||
  typeof body.meta.requestId !== 'string' ||
  body.meta.requestId.length === 0
) {
  throw new Error(
    'Unauthenticated POST /api/chat did not return the v0.9 AUTH_REQUIRED envelope.',
  );
}

console.log(
  'MyeongHa production Chat open boundary smoke passed: GET=405 Allow POST, unauthenticated POST=401 AUTH_REQUIRED v0.9, cacheControl=no-store.',
);
