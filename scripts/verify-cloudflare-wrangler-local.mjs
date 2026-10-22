// Exercise the actual workerd runtime through local Wrangler: never deploy.
// CI-only network activity: npm downloads the pinned Wrangler CLI package.
// No Cloudflare login, credentials, production API proxy or remote resources.
// Watchtower-Track: ops
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HTML_ENTRIES } from './verify-cloudflare-static.mjs';

export const WRANGLER_PIN = '4.151.2';
const ORIGIN = 'http://127.0.0.1:8787';
const READY_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 8_000;

function assert(check, description) {
  if (!check) throw new Error(description);
}

async function get(path, init = {}) {
  return fetch(ORIGIN + path, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
  });
}

async function assertHttpStatus(path, expected, init = {}) {
  const response = await get(path, init);
  assert(
    response.status === expected,
    `${init.method ?? 'GET'} ${path}: expected ${expected}, got ${response.status}`,
  );
  assert(
    response.headers.get('x-robots-tag')?.includes('noindex'),
    `${path}: noindex header missing`,
  );
  assert(
    response.headers.get('x-content-type-options') === 'nosniff',
    `${path}: nosniff header missing`,
  );
  assert(
    !response.headers.has('set-cookie'),
    `${path}: preview must not set user session cookie`,
  );
  return response;
}

async function probe() {
  const config = JSON.parse(await readFile(resolve('vercel.json'), 'utf8'));
  const csp = config.headers[0].headers.find((x) => x.key === 'Content-Security-Policy')?.value;
  assert(typeof csp === 'string', 'Vercel CSP baseline unavailable');

  const root = await assertHttpStatus('/', 200);
  assert(root.headers.get('content-type')?.includes('text/html'), 'root HTML MIME mismatch');
  assert((await root.text()).toLowerCase().includes('<html'), 'root page is not HTML');

  for (const page of HTML_ENTRIES) {
    const response = await assertHttpStatus('/' + page, 200);
    assert(
      response.headers.get('content-security-policy') === csp,
      `${page}: static CSP differs from Vercel`,
    );
    assert(
      response.headers.get('cache-control')?.includes('no-store'),
      `${page}: static HTML must not be cached`,
    );
    assert(response.headers.get('content-type')?.includes('text/html'), `${page}: HTML MIME mismatch`);
  }

  const health = await assertHttpStatus('/api/health', 200);
  assert(health.headers.get('cache-control') === 'no-store', 'Public liveness must never be cached');
  assert(health.headers.get('content-security-policy') === csp, 'Health response CSP mismatch');
  assert(JSON.stringify(await health.json()) === '{"status":"ok"}', 'Health must return only a constant status');
  for (const method of ['POST', 'OPTIONS', 'HEAD']) {
    const denied = await assertHttpStatus('/api/health', 405, { method });
    assert(denied.headers.get('allow') === 'GET', 'Health method restriction drift');
    assert(denied.headers.get('cache-control') === 'no-store', 'Health rejection must not be cached');
    assert(denied.headers.get('access-control-allow-origin') === null, 'Health CORS accidentally enabled');
  }

  for (const missing of ['/missing-page.html', '/api', '/api/readiness', '/api/readings', '/api/unknown']) {
    const response = await assertHttpStatus(missing, 404);
    assert(response.headers.get('cache-control') === 'no-store', `${missing}: 404 must not be cached`);
    assert(response.headers.get('content-security-policy') === csp, `${missing}: deny CSP mismatch`);
    const body = await response.text();
    assert(!body.includes('<!doctype html>') && !body.includes('<html'), `${missing}: leaked SPA HTML`);
  }

  // S-CF2: actual workerd must intercept legacy Vercel Chat rewrite keys
  // BEFORE Health/Auth/Records API dispatch, even on unrelated canonical paths.
  // These are not trusted route selectors or permission to expose old data.
  for (const path of [
    '/api/health?__myeongha_chat_open=1',
    '/api/health?%25255F%25255Fmyeongha_chat_open=1',
    '/api/me?%255F_myeongha_chat_open=1',
    '/api/me?__myeongha_chat_turn_send=1',
    '/api/me?__myeongha_chat_thread_id=123e4567-e89b-42d3-a456-426614174000',
    '/api/auth/refresh?__myeongha_chat_open=1',
  ]) {
    const denied = await assertHttpStatus(path, 503);
    assert(denied.headers.get('cache-control') === 'no-store',
      path + ': protected hold must not be cached');
    assert(denied.headers.get('access-control-allow-origin') === null,
      path + ': protected hold must not admit cross-origin requests');
    assert(denied.headers.get('content-security-policy') === csp,
      path + ': protected hold lost CSP');
    const payload = await denied.json();
    assert(payload?.ok === false &&
      payload?.error?.code === 'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE',
      path + ': forged Chat marker escaped fixed protected 503');
  }

  const malformed = await assertHttpStatus('/api/auth/sign-in', 404, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"untrusted":true}',
  });
  assert(await malformed.text() === '', 'Unknown API request had a response body');

  const turn = await assertHttpStatus('/api/chat/thread-synthetic/turns', 503, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"synthetic":true}',
  });
  const json = await turn.json();
  assert(json.ok === false, 'Se-yeon 503 envelope changed');
  assert(json.error?.code === 'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE', 'Seyeon first reveal guard missing');
  assert(turn.headers.get('cache-control') === 'no-store', 'Seyeon denial may be cached');
  assert(turn.headers.get('content-security-policy') === csp, 'Seyeon denial CSP mismatch');

  // The mounted Security router holds ALL malformed or ambiguous Chat
  // requests, including GET on the POST-only endpoint, before any DB work.
  const unauthorizedGet = await assertHttpStatus('/api/chat/thread-synthetic/turns', 503);
  assert((await unauthorizedGet.json()).error?.code ===
    'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE', 'Unsafe Chat GET escaped the security fence');

  for (const path of [
    '/api/chat/123e4567-e89b-42d3-a456-426614174000',
    '/api/chat/123e4567-e89b-42d3-a456-426614174000?afterSequenceNo=0&afterSequenceNo=2',
    '/api/chat/123e4567-e89b-42d3-a456-426614174000/replay',
    '/api/chat/123e4567-e89b-42d3-a456-426614174000/turns?replay=1',
  ]) {
    const denied = await assertHttpStatus(path, 503);
    assert((await denied.json()).error?.code ===
      'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE', path + ': held Chat route escaped');
  }
  const chatOpen = await assertHttpStatus('/api/chat', 404, { method: 'POST' });
  assert((await chatOpen.text()) === '', 'Unported other-Character Chat open was exposed');

  return {
    runtime: 'wrangler dev (workerd), local only',
    wrangler: WRANGLER_PIN,
    htmlEntries: HTML_ENTRIES.length,
    apiPositiveRoutes: 1,
    liveness: 'GET 200 / POST, HEAD, OPTIONS 405; readiness 404',
    seyeonFirstReveal: 'HOLD 503',
    checks: 'PASS',
  };
}

async function waitReady(child, getLogs) {
  const stopAt = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < stopAt) {
    if (child.exitCode !== null) {
      throw new Error('Wrangler terminated before ready: ' + getLogs());
    }
    try {
      const res = await get('/api/health');
      if (res.status === 200) return;
    } catch {
      // Listening socket may not be ready yet.
    }
    await new Promise((done) => setTimeout(done, 600));
  }
  throw new Error('Timed out starting local Wrangler. Diagnostics: ' + getLogs());
}

async function main() {
  await readFile(resolve('public', '_headers'));
  await readFile(resolve('public', '_redirects'));
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(
    executable,
    ['exec', '--yes', `--package=wrangler@${WRANGLER_PIN}`, '--', 'wrangler', 'dev',
      '--config', 'wrangler.jsonc', '--ip', '127.0.0.1', '--port', '8787'],
    {
      cwd: resolve('.'),
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    },
  );

  let diagnostic = '';
  const collect = (part) => {
    diagnostic = (diagnostic + part.toString()).slice(-8000);
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  let exitReason;
  child.on('error', (error) => { exitReason = error; });

  try {
    await waitReady(child, () => diagnostic);
    if (exitReason) throw exitReason;
    console.log('Cloudflare local Worker HTTP smoke:', await probe());
  } catch (error) {
    console.error('Cloudflare local Worker failed:', error);
    console.error('Last local Wrangler diagnostics:', diagnostic.slice(-2600));
    process.exitCode = 1;
  } finally {
    if (child.exitCode === null) {
      try {
        if (process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM');
        else child.kill('SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
