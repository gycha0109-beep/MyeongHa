// Read-only production Cloudflare end-to-end verifier.
// Watchtower-Track: ops
// Never print response bodies, tokens, cookies, e-mails, SQL, or credentials.
// The authenticated mode sends one existing governed Member sign-in and one
// calculation-only POST. No writes, paid chat, or new accounts are performed.
import { pathToFileURL } from 'node:url';

export const CLOUDFLARE_PRIMARY_E2E_ORIGIN = 'https://myeongha.gycha0109.workers.dev';
const TIMEOUT_MS = 20_000;
const MAX_RESPONSE_CHARS = 131_072;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function noStore(response, label) {
  const directives = (response.headers.get('cache-control') ?? '')
    .toLowerCase().split(',').map(x => x.trim());
  assert(directives.includes('no-store'), label + ' missing Cache-Control: no-store');
}
function apiHeaders(response, label, { json = true } = {}) {
  noStore(response, label);
  assert(response.headers.get('x-content-type-options') === 'nosniff',
    label + ' missing X-Content-Type-Options: nosniff');
  if (json) assert((response.headers.get('content-type') ?? '').toLowerCase()
    .includes('application/json'), label + ' is not JSON');
  assert(!response.headers.has('location'), label + ' unexpectedly redirected');
}
function noSecretEgress(response, label) {
  assert(!response.headers.has('set-cookie'), label + ' set an unexpected cookie');
  assert(!response.headers.has('access-control-allow-origin'),
    label + ' exposed permissive cross-origin access');
}
async function boundedJson(response, label) {
  const length = Number(response.headers.get('content-length') ?? '0');
  assert(!Number.isFinite(length) || length <= MAX_RESPONSE_CHARS,
    label + ' response too large');
  const text = await response.text();
  assert(text.length <= MAX_RESPONSE_CHARS, label + ' response too large');
  let payload;
  try { payload = JSON.parse(text); }
  catch { throw new Error(label + ' returned invalid JSON'); }
  assert(record(payload), label + ' JSON envelope is not an object');
  return payload;
}
function expectedHttp(response, label, statuses) {
  assert(statuses.includes(response.status),
    label + ' unexpected HTTP ' + response.status + '; expected ' + statuses.join('/'));
}

export async function runCloudflarePrimaryE2E(options = {}) {
  const origin = options.origin ?? CLOUDFLARE_PRIMARY_E2E_ORIGIN;
  assert(origin === CLOUDFLARE_PRIMARY_E2E_ORIGIN,
    'E2E target is pinned to the governed Cloudflare primary Worker');
  const mode = options.mode ?? 'anonymous';
  assert(['anonymous', 'authenticated', 'operations'].includes(mode), 'Unknown E2E mode');
  const expectedVersion = options.expectedVersion ?? process.env.CLOUDFLARE_EXPECTED_WORKER_VERSION;
  if (mode === 'authenticated') {
    assert(typeof expectedVersion === 'string' &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(expectedVersion),
      'Authenticated Cloudflare E2E requires the independently verified exact Worker version');
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const checks = [];
  let observedOperationsWorkerVersion = null;

  async function call(label, path, init = {}) {
    // Every request stays on the exact owned origin; redirects never follow.
    assert(path.startsWith('/') && !path.startsWith('//'), 'Unsafe E2E path');
    const response = await fetchImpl(origin + path, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Accept: 'application/json',
        ...init.headers,
      },
    });
    assert(response instanceof Response, label + ' missing Fetch Response');
    // Pin credential-admission API responses, not independent protected Chat holds.
    // No Member credential is sent until the version-pinned admission probes pass.
    const pinnedPaths = [
      '/api/health', '/api/readiness', '/api/me',
      '/api/auth/sign-in', '/api/me/birth-profile',
      '/api/me/saju/calculation', '/api/me/saju/preview-reading',
    ];
    if (mode === 'authenticated' && pinnedPaths.includes(path)) {
      assert(response.headers.get('x-myeongha-worker-version') === expectedVersion,
        label + ' returned a different deployed Worker version; no credential replay');
    }
    if (mode === 'operations' && pinnedPaths.includes(path)) {
      const version = response.headers.get('x-myeongha-worker-version');
      assert(typeof version === 'string' &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(version),
      label + ' is missing its exact Worker version');
      if (observedOperationsWorkerVersion === null) observedOperationsWorkerVersion = version;
      assert(version === observedOperationsWorkerVersion,
        label + ' changed Worker version during the operations smoke');
    }
    return response;
  }
  function mark(label, status) {
    checks.push(Object.freeze({ name: label, status }));
  }

  const index = await call('web root', '/', { headers: { Accept: 'text/html' } });
  expectedHttp(index, 'web root', [200]);
  assert((index.headers.get('content-type') ?? '').includes('text/html'),
    'web root did not serve HTML');
  mark('static.root', index.status);

  const hall = await call('web hall', '/hall.html', { headers: { Accept: 'text/html' } });
  expectedHttp(hall, 'web hall', [200]);
  assert((hall.headers.get('content-type') ?? '').includes('text/html'),
    'web hall did not serve HTML');
  mark('static.hall', hall.status);

  const health = await call('health', '/api/health');
  expectedHttp(health, 'health', [200]);
  apiHeaders(health, 'health');
  noSecretEgress(health, 'health');
  const healthBody = await boundedJson(health, 'health');
  assert(healthBody.status === 'ok' && Object.keys(healthBody).length === 1,
    'health must be a constant non-sensitive liveness response');
  mark('api.health', 200);

  const healthMethod = await call('health method fence', '/api/health', { method: 'POST' });
  expectedHttp(healthMethod, 'health method fence', [405]);
  noStore(healthMethod, 'health method fence');
  assert(healthMethod.headers.get('allow') === 'GET', 'health method fence missing Allow GET');
  mark('api.health.method', 405);

  const ready = await call('readiness', '/api/readiness');
  expectedHttp(ready, 'readiness', [200, 503, 404]);
  apiHeaders(ready, 'readiness', { json: ready.status !== 404 });
  noSecretEgress(ready, 'readiness');
  if (ready.status !== 404) {
    const data = await boundedJson(ready, 'readiness');
    assert(typeof data.status === 'string' && record(data.capabilities),
      'readiness returned an invalid capability report');
    assert(ready.status !== 200 || data.status !== 'unready',
      'readiness declared unready with HTTP 200');
  }
  // Readiness is config-only. A 200 does NOT prove PostgreSQL connectivity.
  mark('api.readiness.config_only', ready.status);

  const meAnonymous = await call('unauthenticated member DB', '/api/me');
  expectedHttp(meAnonymous, 'unauthenticated member DB', [401, 403, 404, 503]);
  apiHeaders(meAnonymous, 'unauthenticated member DB', { json: meAnonymous.status !== 404 });
  noSecretEgress(meAnonymous, 'unauthenticated member DB');
  mark('api.member.anonymous_fence', meAnonymous.status);

  const sajuAnonymous = await call('unauthenticated Saju', '/api/me/saju/calculation', {
    method: 'POST', headers: { Origin: origin },
  });
  expectedHttp(sajuAnonymous, 'unauthenticated Saju', [401, 403, 404, 503]);
  apiHeaders(sajuAnonymous, 'unauthenticated Saju', { json: sajuAnonymous.status !== 404 });
  noSecretEgress(sajuAnonymous, 'unauthenticated Saju');
  mark('api.saju.anonymous_fence', sajuAnonymous.status);

  const previewAnonymous = await call('unauthenticated Saju preview', '/api/me/saju/preview-reading', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ readingText: '전체 사주' }),
  });
  expectedHttp(previewAnonymous, 'unauthenticated Saju preview', [401, 403, 404, 503]);
  apiHeaders(previewAnonymous, 'unauthenticated Saju preview', { json: previewAnonymous.status !== 404 });
  noSecretEgress(previewAnonymous, 'unauthenticated Saju preview');
  mark('api.saju.preview_anonymous_fence', previewAnonymous.status);

  const crossOriginAuth = await call('cross-origin login denial', '/api/auth/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example.org' },
    body: '{}',
  });
  expectedHttp(crossOriginAuth, 'cross-origin login denial', [403]);
  apiHeaders(crossOriginAuth, 'cross-origin login denial');
  noSecretEgress(crossOriginAuth, 'cross-origin login denial');
  const rejectedAuth = await boundedJson(crossOriginAuth, 'cross-origin login denial');
  assert(rejectedAuth?.error?.code === 'INVALID_REQUEST',
    'cross-origin login denial did not report INVALID_REQUEST');
  mark('api.auth.cross_origin_fence', 403);

  const unknown = await call('unknown API', '/api/__myeongha_e2e_unknown');
  expectedHttp(unknown, 'unknown API', [404]);
  apiHeaders(unknown, 'unknown API', { json: false });
  noSecretEgress(unknown, 'unknown API');
  mark('api.unknown_fence', 404);

  if (mode === 'operations') {
    assert(ready.status === 200 && meAnonymous.status === 401 &&
      sajuAnonymous.status === 401 && previewAnonymous.status === 401,
      'Cloudflare operations NOT_ACCEPTED: config readiness=' + ready.status +
      ' member denial=' + meAnonymous.status + ' saju denial=' + sajuAnonymous.status +
      ' preview denial=' + previewAnonymous.status);
    mark('api.operations_config_and_auth_denial', 200);
  }

  // Only deliberately invalid identities are used; no chat/AI call is authorized.
  if (mode !== 'operations') for (const [name, path, method] of [
    ['chat.open_hold', '/api/chat', 'GET'],
    ['chat.turn_hold', '/api/chat/00000000-0000-4000-8000-000000000000/turns', 'POST'],
    ['chat.encoded_hold', '/%61pi/chat', 'GET'],
    ['chat.marker_hold', '/api/health?__myeongha_chat_open=1', 'GET'],
  ]) {
    const response = await call(name, path, {
      method,
      headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {},
      ...(method === 'POST' ? { body: '{}' } : {}),
    });
    expectedHttp(response, name, name === 'chat.turn_hold' ? [401, 503] : [503]);
    apiHeaders(response, name);
    noSecretEgress(response, name);
    const payload = await boundedJson(response, name);
    assert(payload.ok !== true, name + ' leaked positive chat output');
    if (response.status === 401) {
      assert(payload?.error?.code === 'AUTH_REQUIRED',
        name + ' did not return the verified Member AUTH_REQUIRED boundary');
    }
    mark(name, response.status);
  }

  if (mode === 'authenticated') {
    // Security-owned production prerequisite: do not send credentials while
    // the native Member and both Saju adapters are unadmitted. No retries.
    assert(ready.status === 200 && meAnonymous.status === 401 &&
      sajuAnonymous.status === 401 && previewAnonymous.status === 401,
      'Cloudflare positive E2E BLOCKED_BY_ADMISSION: readiness=' + ready.status +
      ' member=' + meAnonymous.status + ' saju=' + sajuAnonymous.status +
      ' preview=' + previewAnonymous.status);
    const { email, password, expectedSubjectId } = options.credentials ?? {};
    assert(typeof email === 'string' && email.length > 0 &&
      typeof password === 'string' && password.length > 0 &&
      typeof expectedSubjectId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(expectedSubjectId),
    'Authenticated E2E requires governed Member credentials and subject UUID');
    // No test Member is created. One normal sign-in consumes the ordinary limiter.
    const login = await call('member sign-in', '/api/auth/sign-in', {
      method: 'POST',
      headers: {
        Origin: origin, 'Content-Type': 'application/json',
        'X-MyeongHa-Auth-Transport': 'web-cookie-v1',
      },
      body: JSON.stringify({ email, password }),
    });
    expectedHttp(login, 'member sign-in', [200]);
    apiHeaders(login, 'member sign-in');
    const cookie = login.headers.get('set-cookie') ?? '';
    assert(cookie.includes('HttpOnly') && cookie.includes('Secure') &&
      cookie.includes('SameSite=Strict'), 'member sign-in lost the sealed refresh cookie');
    const loginJson = await boundedJson(login, 'member sign-in');
    const token = loginJson?.data?.session?.accessToken;
    assert(loginJson.ok === true && loginJson?.data?.status === 'authenticated' &&
      typeof token === 'string' && token.length > 20 && !/[\s,]/u.test(token) &&
      loginJson.data.session.refreshToken === undefined,
    'member sign-in did not return a safe access-token session');
    mark('auth.member_sign_in', 200);

    const authorization = { Authorization: 'Bearer ' + token };
    const me = await call('authenticated member DB', '/api/me', { headers: authorization });
    expectedHttp(me, 'authenticated member DB', [200]);
    apiHeaders(me, 'authenticated member DB');
    noSecretEgress(me, 'authenticated member DB');
    const meJson = await boundedJson(me, 'authenticated member DB');
    assert(meJson.ok === true && meJson.data?.subjectKind === 'member' &&
      meJson.data.subjectId === expectedSubjectId,
    'authenticated DB subject ownership does not match the governed Member');
    mark('db.authoritative_member', 200);

    const birth = await call('member birth revision', '/api/me/birth-profile', {
      headers: authorization,
    });
    expectedHttp(birth, 'member birth revision', [200]);
    apiHeaders(birth, 'member birth revision');
    const birthJson = await boundedJson(birth, 'member birth revision');
    const revisionId = birthJson?.data?.birthProfile?.currentRevision?.revisionId;
    assert(birthJson.ok === true && typeof revisionId === 'string' &&
      /^[0-9a-f-]{36}$/iu.test(revisionId),
    'authenticated Member has no governed current Birth revision');
    mark('db.birth_revision', 200);

    // Calculation-only; no interpretation, reading, payment, or Provider chat.
    const saju = await call('authenticated Saju calculation', '/api/me/saju/calculation', {
      method: 'POST',
      headers: { ...authorization, Origin: origin },
    });
    expectedHttp(saju, 'authenticated Saju calculation', [200]);
    apiHeaders(saju, 'authenticated Saju calculation');
    noSecretEgress(saju, 'authenticated Saju calculation');
    const sajuJson = await boundedJson(saju, 'authenticated Saju calculation');
    const calculation = sajuJson?.data?.calculation;
    assert(sajuJson.ok === true &&
      calculation?.kind === 'saju_calculation_evidence' &&
      calculation?.semanticAuthority === 'calculation_only' &&
      calculation?.interpretationAuthorized === false &&
      calculation?.birthRevisionRef === revisionId &&
      record(calculation?.snapshot?.pillars),
    'Saju calculation was not bound to the authenticated Birth revision');
    mark('saju.calculation_only', 200);
  }

  return Object.freeze({
    target: 'myeongha',
    mode,
    result: 'PASS',
    ...(mode === 'operations' ? {
      observedWorkerVersion: observedOperationsWorkerVersion,
      readinessScope: 'configuration-only',
      liveDependencyConnectivityProven: false,
      productionAcceptanceProven: false,
    } : {}),
    checks: Object.freeze(checks),
    // Never serialize sensitive responses, identities, tokens or private data.
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.env.MYEONGHA_CLOUDFLARE_E2E_MODE || 'anonymous';
  const credentials = mode === 'authenticated' ? {
    email: process.env.MYEONGHA_PRODUCTION_MEMBER_EMAIL,
    password: process.env.MYEONGHA_PRODUCTION_MEMBER_PASSWORD,
    expectedSubjectId: process.env.MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID,
  } : undefined;
  try {
    const result = await runCloudflarePrimaryE2E({ mode, credentials,
      expectedVersion: process.env.CLOUDFLARE_EXPECTED_WORKER_VERSION });
    console.log(JSON.stringify(result));
  } catch (error) {
    // Fail closed without printing upstream bodies or request inputs.
    console.error('Cloudflare primary E2E FAILED: ' + (error?.message ?? 'unknown failure'));
    process.exitCode = 1;
  }
}
