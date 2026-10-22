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

  // CF-D05: the local Worker-first Static Assets path must keep HEAD
  // metadata equivalent to public GET without streaming a representation.
  // Raw workerd HTTP is exercised here; no remote deployment is performed.
  for (const path of ['/', '/index.html', '/chat.html']) {
    const response = await assertHttpStatus(path, 200, { method: 'HEAD' });
    assert(response.headers.get('content-type')?.includes('text/html'),
      path + ': HEAD lost HTML MIME');
    assert(response.headers.get('cache-control') === 'no-store',
      path + ': HEAD must not cache HTML');
    assert(response.headers.get('content-security-policy') === csp,
      path + ': HEAD must preserve CSP');
    assert(await response.text() === '', path + ': HEAD returned an unexpected body');
  }

  // CF-D05/D08: a public Static Asset must not become a credential-aware
  // route merely because the browser sends an Authorization/Cookie header
  // or a query token. Unit Worker tests inspect the actual ASSETS Request.
  const staticSecret = 'SYNTHETIC_PUBLIC_ASSET_SECRET';
  const withCredentials = await assertHttpStatus(
    '/index.html?session=' + staticSecret, 200, {
      headers: {
        Authorization: 'Bearer ' + staticSecret,
        Cookie: 'session=' + staticSecret,
        'X-Api-Key': staticSecret,
      },
    },
  );
  assert(withCredentials.headers.get('cache-control') === 'no-store',
    'Static HTML with browser credentials must not become cacheable');
  assert(withCredentials.headers.get('content-security-policy') === csp,
    'Static HTML with browser credentials must retain CSP');
  assert((await withCredentials.text()).includes('<html'),
    'Static HTML with browser credentials stopped rendering');
  assert(!withCredentials.headers.has('set-cookie'),
    'Static HTML cannot return a session cookie');

  const health = await assertHttpStatus('/api/health', 200);
  assert(health.headers.get('cache-control') === 'no-store', 'Public liveness must never be cached');
  assert(health.headers.get('content-security-policy') === csp, 'Health response CSP mismatch');
  assert(JSON.stringify(await health.json()) === '{"status":"ok"}', 'Health must return only a constant status');
  // S-CF2: forged cache validators cannot change the only positive API
  // liveness response or turn approved HTML into an arbitrary 304. The
  // stronger 304 ETag/date/body binding is tested with synthetic ASSETS in
  // the Worker fetch regression; this is real local workerd HTTP routing.
  for (const [assetPath, validator] of [
    ['/api/health', '"synthetic-nonmatching-health-validator"'],
    ['/index.html', 'W/"synthetic-nonmatching-html-validator"'],
  ]) {
    const unaffected = await assertHttpStatus(assetPath, 200, {
      headers: { 'If-None-Match': validator },
    });
    assert(unaffected.headers.get('cache-control') === 'no-store',
      assetPath + ': HTML/liveness revalidation must remain no-store');
    assert(unaffected.headers.get('content-security-policy') === csp,
      assetPath + ': conditional requests lost CSP');
    assert(unaffected.headers.get('location') === null,
      assetPath + ': conditional request redirected');
  }

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
    '/index.html?__myeongha_chat_open=1',
    '/?__myeongha_chat_turn_send=1',
    '/hall.html?%255F_myeongha_chat_open=1',
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
    '/%61pi/chat/123e4567-e89b-42d3-a456-426614174000',
    '/%2561pi/chat/123e4567-e89b-42d3-a456-426614174000',
    '/api%2F%63hat/123e4567-e89b-42d3-a456-426614174000',
    '/api%252F%2563hat/123e4567-e89b-42d3-a456-426614174000',
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

async function stopLocalWrangler(child) {
  if (child.exitCode !== null) return;
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM');
    else child.kill('SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  // Wait for process-group cleanup so a later startup never probes a stale port.
  await new Promise((resolveDone) => {
    if (child.exitCode !== null) return resolveDone();
    const grace = setTimeout(() => {
      try {
        if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch { /* child already exited */ }
      resolveDone();
    }, 2_000);
    child.once('exit', () => {
      clearTimeout(grace);
      resolveDone();
    });
  });
}

async function main() {
  await readFile(resolve('public', '_headers'));
  await readFile(resolve('public', '_redirects'));
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  // Only retry local CLI startup once. A successfully started Worker with
  // failing HTTP/authorization contracts must NEVER be retried into PASS.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const child = spawn(
      executable,
      ['exec', '--yes', '--package=' + 'wrangler@' + WRANGLER_PIN, '--', 'wrangler', 'dev',
        '--config', 'wrangler.jsonc', '--ip', '127.0.0.1', '--port', '8787'],
      {
        cwd: resolve('.'),
        env: {
          ...process.env,
          WRANGLER_SEND_METRICS: 'false',
          NO_COLOR: '1',
          npm_config_fetch_retries: '1',
          npm_config_fetch_timeout: '45000',
          ...(attempt === 2 ? { npm_config_prefer_offline: 'true' } : {}),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      },
    );
    let diagnostic = '';
    const collect = (part) => { diagnostic = (diagnostic + part.toString()).slice(-8000); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    let exitReason;
    child.on('error', (error) => { exitReason = error; });

    let ready = false;
    try {
      await waitReady(child, () => diagnostic);
      ready = true;
      if (exitReason) throw exitReason;
      console.log('Cloudflare local Worker HTTP smoke:', await probe());
      return;
    } catch (error) {
      if (ready || attempt === 2) {
        console.error('Cloudflare local Worker failed:', error);
        console.error('Last local Wrangler diagnostics:', diagnostic.slice(-2600));
        process.exitCode = 1;
        return;
      }
      // Startup failures can be npm registry/workerd bootstrap transients.
      // Stop ALL children, then give the cached install one final opportunity.
      console.warn('Local Wrangler startup failed; retrying once from npm cache.');
      console.warn('Startup diagnostics:', diagnostic.slice(-1000));
    } finally {
      await stopLocalWrangler(child);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
