// Bounded production OAuth-start probe. This is NOT an actual provider callback E2E.
// Watchtower-Track: ops
// Never print provider authorization URLs, OAuth states, sessions, or response bodies.
import { pathToFileURL } from 'node:url';

export const ORIGIN = 'https://myeongha.gycha0109.workers.dev';
export const PROVIDERS = Object.freeze(['google', 'kakao', 'naver']);
const VERSION = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;

function ensure(condition, code) {
  if (!condition) throw Error(code);
}

async function boundedJson(response) {
  const size = Number(response.headers.get('content-length') ?? 0);
  ensure(Number.isFinite(size) && size <= 8192, 'OVERSIZE');
  const raw = await response.text();
  ensure(raw.length <= 8192, 'OVERSIZE');
  try { return JSON.parse(raw); } catch { throw Error('INVALID_JSON'); }
}

export async function verifyCloudflareOAuthStart({ fetchImpl = fetch, workerVersion } = {}) {
  ensure(VERSION.test(workerVersion ?? ''), 'WORKER_VERSION_REQUIRED');
  const request = async (path, init = {}) => {
    const response = await fetchImpl(ORIGIN + path, {
      ...init, redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    ensure(response instanceof Response, 'INVALID_RESPONSE');
    ensure(response.headers.get('x-myeongha-worker-version') === workerVersion,
      'WORKER_VERSION_DRIFT');
    return response;
  };
  const health = await request('/api/health', { headers: { Accept: 'application/json' } });
  ensure(health.status === 200, 'HEALTH_NOT_READY');
  const checks = [];
  for (const provider of PROVIDERS) {
    const response = await request('/api/auth/social/start', {
      method: 'POST',
      headers: { Origin: ORIGIN, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, redirectUri: ORIGIN + '/auth.html?social=callback' }),
    });
    ensure(response.status === 200, provider + '_START_HTTP');
    ensure(response.headers.get('cache-control')?.toLowerCase().includes('no-store'),
      provider + '_CACHE_CONTROL');
    ensure(!response.headers.has('set-cookie'), provider + '_UNEXPECTED_COOKIE');
    const payload = await boundedJson(response);
    ensure(payload?.ok === true && payload.data?.provider === provider,
      provider + '_ENVELOPE');
    const authorize = new URL(payload.data.authorizationUrl);
    ensure(authorize.protocol === 'https:' && authorize.pathname === '/auth/v1/authorize',
      provider + '_AUTHORIZE_URL');
    ensure(authorize.searchParams.get('provider') === (provider === 'naver' ? 'custom:naver' : provider),
      provider + '_PROVIDER_MAPPING');
    const callback = new URL(authorize.searchParams.get('redirect_to') ?? '');
    ensure(callback.origin === ORIGIN && callback.pathname === '/auth.html' &&
      callback.searchParams.get('social') === 'callback' &&
      callback.searchParams.get('state') === payload.data.state &&
      typeof payload.data.state === 'string' && payload.data.state.length >= 16,
      provider + '_CALLBACK_ORIGIN');
    checks.push({ provider, status: 'PASS_START_ONLY' });
  }
  const confirmation = await request('/api/health', { headers: { Accept: 'application/json' } });
  ensure(confirmation.status === 200, 'HEALTH_CHANGED');
  return { result: 'PASS_START_ONLY', workerVersion, checks, callbackExchanged: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const index = process.argv.indexOf('--worker-version');
  const workerVersion = index > -1 ? process.argv[index + 1] : null;
  try {
    const report = await verifyCloudflareOAuthStart({ workerVersion });
    process.stdout.write(JSON.stringify(report) + '\n');
  } catch (error) {
    const code = String(error?.message ?? 'UNKNOWN');
    // Never emit URLs, query params, authorization response bodies or fetch error detail.
    const allowed = /^[A-Z_]+(?:_(?:START_HTTP|CACHE_CONTROL|UNEXPECTED_COOKIE|ENVELOPE|AUTHORIZE_URL|PROVIDER_MAPPING|CALLBACK_ORIGIN))?$/u;
    process.stdout.write(JSON.stringify({ result: 'HOLD', callbackExchanged: false,
      reason: allowed.test(code) ? code : 'PROBE_FAILED' }) + '\n');
    process.exitCode = 2;
  }
}
