const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';
const HEALTH_URL = `${PRODUCTION_ORIGIN}/api/health`;
const MEMBER_ME_URL = `${PRODUCTION_ORIGIN}/api/me`;
const GUEST_BOOTSTRAP_URL = `${PRODUCTION_ORIGIN}/api/session/bootstrap`;
const REQUEST_TIMEOUT_MS = 20_000;
const EXPECTED_GUEST_TTL_SECONDS = 604800;
const TTL_TOLERANCE_MS = 30_000;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireUuid(name, value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  ) {
    throw new Error(`${name} must be a UUID.`);
  }
  return value;
}

function requireTimestamp(name, value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${name} must be a timestamp.`);
  }
  return value;
}

function requireNoStore(response, label) {
  const directives = (response.headers.get('cache-control') ?? '')
    .split(',')
    .map((directive) => directive.trim().toLowerCase())
    .filter(Boolean);
  if (!directives.includes('no-store')) {
    throw new Error(`${label} must return Cache-Control containing no-store.`);
  }
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

async function fetchCanonical(url, init = {}) {
  return fetch(url, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function requireErrorEnvelope(body, code, label) {
  if (
    body.ok !== false ||
    !isRecord(body.error) ||
    body.error.code !== code ||
    body.error.retryable !== false
  ) {
    throw new Error(`${label} did not return the expected ${code} envelope.`);
  }
}

function requireGuestBootstrapEnvelope(body, label) {
  if (body.ok !== true || !isRecord(body.data) || !isRecord(body.meta)) {
    throw new Error(`${label} did not return an ok data envelope.`);
  }
  if (body.data.kind !== 'guest' || !isRecord(body.data.guestSession)) {
    throw new Error(`${label} did not return a Guest session.`);
  }
  return {
    data: body.data,
    meta: body.meta,
  };
}

const health = await fetchCanonical(HEALTH_URL, { method: 'GET' });
if (health.status !== 200) {
  throw new Error(`Production health expected HTTP 200, received ${health.status}.`);
}
const healthBody = await readJsonWithoutLogging(health, 'Production health');
if (healthBody.status !== 'ok') {
  throw new Error('Production health did not return status=ok.');
}

const bootstrapGet = await fetchCanonical(GUEST_BOOTSTRAP_URL, { method: 'GET' });
requireNoStore(bootstrapGet, 'GET Guest bootstrap');
if (bootstrapGet.status !== 405 || bootstrapGet.headers.get('allow') !== 'POST') {
  throw new Error('GET Guest bootstrap did not preserve the POST-only method boundary.');
}

const unauthenticatedMe = await fetchCanonical(MEMBER_ME_URL, { method: 'GET' });
requireNoStore(unauthenticatedMe, 'Unauthenticated /api/me');
if (unauthenticatedMe.status !== 401) {
  throw new Error(
    `Unauthenticated /api/me expected HTTP 401, received ${unauthenticatedMe.status}.`,
  );
}
requireErrorEnvelope(
  await readJsonWithoutLogging(unauthenticatedMe, 'Unauthenticated /api/me'),
  'AUTH_REQUIRED',
  'Unauthenticated /api/me',
);

const malformed = await fetchCanonical(GUEST_BOOTSTRAP_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{',
});
requireNoStore(malformed, 'Malformed Guest bootstrap');
if (malformed.status !== 400) {
  throw new Error(`Malformed Guest bootstrap expected HTTP 400, received ${malformed.status}.`);
}
requireErrorEnvelope(
  await readJsonWithoutLogging(malformed, 'Malformed Guest bootstrap'),
  'INVALID_REQUEST',
  'Malformed Guest bootstrap',
);

const clientControlled = await fetchCanonical(GUEST_BOOTSTRAP_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    subjectId: '00000000-0000-4000-8000-000000000000',
  }),
});
requireNoStore(clientControlled, 'Client-controlled Guest bootstrap');
if (clientControlled.status !== 400) {
  throw new Error(
    `Client-controlled Guest bootstrap expected HTTP 400, received ${clientControlled.status}.`,
  );
}
requireErrorEnvelope(
  await readJsonWithoutLogging(clientControlled, 'Client-controlled Guest bootstrap'),
  'INVALID_REQUEST',
  'Client-controlled Guest bootstrap',
);

const invalidOpaqueToken =
  'myeongha_guest_v1_invalid_smoke_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const invalidOpaque = await fetchCanonical(GUEST_BOOTSTRAP_URL, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${invalidOpaqueToken}`,
    'Content-Type': 'application/json',
  },
  body: '{}',
});
requireNoStore(invalidOpaque, 'Invalid opaque Guest bootstrap');
if (invalidOpaque.status !== 401) {
  throw new Error(
    `Invalid opaque Guest bootstrap expected HTTP 401, received ${invalidOpaque.status}.`,
  );
}
requireErrorEnvelope(
  await readJsonWithoutLogging(invalidOpaque, 'Invalid opaque Guest bootstrap'),
  'AUTH_REQUIRED',
  'Invalid opaque Guest bootstrap',
);

const invalidJwtToken =
  'eyJhbGciOiJub25lIn0.eyJzdWIiOiJndWVzdC1zbW9rZSJ9.invalidsignature';
const invalidJwt = await fetchCanonical(GUEST_BOOTSTRAP_URL, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${invalidJwtToken}`,
    'Content-Type': 'application/json',
  },
  body: '{}',
});
requireNoStore(invalidJwt, 'Invalid JWT Guest bootstrap');
if (invalidJwt.status !== 401) {
  throw new Error(`Invalid JWT Guest bootstrap expected HTTP 401, received ${invalidJwt.status}.`);
}
requireErrorEnvelope(
  await readJsonWithoutLogging(invalidJwt, 'Invalid JWT Guest bootstrap'),
  'AUTH_REQUIRED',
  'Invalid JWT Guest bootstrap',
);

const fresh = await fetchCanonical(GUEST_BOOTSTRAP_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});
requireNoStore(fresh, 'Fresh Guest bootstrap');
if (fresh.status !== 200) {
  throw new Error(`Fresh Guest bootstrap expected HTTP 200, received ${fresh.status}.`);
}
const freshEnvelope = requireGuestBootstrapEnvelope(
  await readJsonWithoutLogging(fresh, 'Fresh Guest bootstrap'),
  'Fresh Guest bootstrap',
);

const freshSubjectId = requireUuid('Fresh Guest subjectId', freshEnvelope.data.subjectId);
const freshGuestSessionId = requireUuid(
  'Fresh Guest guestSessionId',
  freshEnvelope.data.guestSession.guestSessionId,
);
const freshExpiresAt = requireTimestamp(
  'Fresh Guest expiresAt',
  freshEnvelope.data.guestSession.expiresAt,
);
const freshServerTime = requireTimestamp('Fresh Guest serverTime', freshEnvelope.meta.serverTime);
const freshBearer = freshEnvelope.data.guestSession.bearerToken;
if (
  typeof freshBearer !== 'string' ||
  freshBearer.length < 32 ||
  freshBearer.length > 512 ||
  !freshBearer.startsWith('myeongha_guest_v1_') ||
  !/^[\x21-\x7E]+$/u.test(freshBearer) ||
  freshBearer.includes(',') ||
  /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(freshBearer)
) {
  throw new Error('Fresh Guest bootstrap returned a bearer outside the opaque Guest contract.');
}

const observedTtlMs = Date.parse(freshExpiresAt) - Date.parse(freshServerTime);
const expectedTtlMs = EXPECTED_GUEST_TTL_SECONDS * 1000;
if (Math.abs(observedTtlMs - expectedTtlMs) > TTL_TOLERANCE_MS) {
  throw new Error('Fresh Guest bootstrap expiry does not match the decided seven-day TTL.');
}

const authenticatedMe = await fetchCanonical(MEMBER_ME_URL, {
  method: 'GET',
  headers: { Authorization: `Bearer ${freshBearer}` },
});
requireNoStore(authenticatedMe, 'Authenticated Guest /api/me');
if (authenticatedMe.status !== 200) {
  throw new Error(
    `Authenticated Guest /api/me expected HTTP 200, received ${authenticatedMe.status}.`,
  );
}
const authenticatedMeBody = await readJsonWithoutLogging(
  authenticatedMe,
  'Authenticated Guest /api/me',
);
if (authenticatedMeBody.ok !== true || !isRecord(authenticatedMeBody.data)) {
  throw new Error('Authenticated Guest /api/me did not return an ok data envelope.');
}
if (
  authenticatedMeBody.data.subjectId !== freshSubjectId ||
  authenticatedMeBody.data.subjectKind !== 'guest' ||
  authenticatedMeBody.data.subjectStatus !== 'active'
) {
  throw new Error('Authenticated Guest /api/me did not resolve the freshly bootstrapped canonical Guest.');
}

const reused = await fetchCanonical(GUEST_BOOTSTRAP_URL, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${freshBearer}`,
    'Content-Type': 'application/json',
  },
  body: '{}',
});
requireNoStore(reused, 'Reused Guest bootstrap');
if (reused.status !== 200) {
  throw new Error(`Reused Guest bootstrap expected HTTP 200, received ${reused.status}.`);
}
const reusedEnvelope = requireGuestBootstrapEnvelope(
  await readJsonWithoutLogging(reused, 'Reused Guest bootstrap'),
  'Reused Guest bootstrap',
);
if (
  reusedEnvelope.data.subjectId !== freshSubjectId ||
  reusedEnvelope.data.guestSession.guestSessionId !== freshGuestSessionId ||
  Date.parse(reusedEnvelope.data.guestSession.expiresAt) !== Date.parse(freshExpiresAt) ||
  reusedEnvelope.data.guestSession.bearerToken !== null
) {
  throw new Error('Reused Guest bootstrap did not preserve identity/session or suppress bearer re-emission.');
}

console.log(
  'MyeongHa production Guest bootstrap smoke passed: health=200, bootstrap GET=405, unauth /api/me=401, malformed/client-controlled=400, invalid opaque/JWT=401, fresh Guest=200, authenticated Guest /api/me=200 same canonical subject, reuse=200 same session bearerToken=null, ttl=604800, cacheControl=no-store.',
);
