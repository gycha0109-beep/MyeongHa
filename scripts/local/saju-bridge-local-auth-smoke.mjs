#!/usr/bin/env node
// Actual disposable GoTrue HTTP signup / JWT identity check; no secret is printed.
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const origin = 'http://gotrue:9999';
if (process.env.SAJU_BRIDGE_LOCAL_AUTH_URL !== origin) {
  throw new Error('Refusing a non-disposable GoTrue origin.');
}

async function ready() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const r = await fetch(origin + '/health', {
        redirect: 'manual', signal: AbortSignal.timeout(1800),
      });
      await r.body?.cancel();
      if (r.status === 200) return;
    } catch { /* GoTrue is still initializing. */ }
    await delay(1500);
  }
  throw new Error('Disposable GoTrue health check timed out.');
}

async function main() {
  await ready();
  const email = 'saju-bridge-' + randomBytes(10).toString('hex') + '@example.invalid';
  const credential = randomBytes(30).toString('base64url');
  const spoofId = '8c320001-0000-4000-8000-000000000001';
  const signup = await fetch(origin + '/signup', {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(8000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: credential, data: { subjectId: spoofId, is_admin: true } }),
  });
  if (signup.status !== 200) {
    await signup.body?.cancel();
    throw new Error('Disposable GoTrue signup rejected: HTTP ' + signup.status);
  }
  const created = await signup.json();
  const userId = created?.user?.id;
  if (typeof userId !== 'string' || userId.length < 12 || userId === spoofId) {
    throw new Error('GoTrue identity was not independently allocated.');
  }
  let token = created.access_token;
  if (typeof token !== 'string') {
    const login = await fetch(origin + '/token?grant_type=password', {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(8000),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: credential }),
    });
    if (!login.ok) {
      await login.body?.cancel();
      throw new Error('Disposable GoTrue password grant failed: HTTP ' + login.status);
    }
    token = (await login.json()).access_token;
  }
  if (typeof token !== 'string' || token.split('.').length !== 3) {
    throw new Error('GoTrue did not issue a JWT.');
  }

  const user = await fetch(origin + '/user', {
    headers: { authorization: 'Bearer ' + token },
    redirect: 'manual', signal: AbortSignal.timeout(8000),
  });
  if (!user.ok) {
    await user.body?.cancel();
    throw new Error('Disposable GoTrue /user rejected signed JWT: HTTP ' + user.status);
  }
  const actual = await user.json();
  if (actual?.id !== userId) throw new Error('GoTrue /user identity does not match signup.');
  console.log('[saju-bridge] Real isolated GoTrue signup, JWT and /user: PASS (synthetic only).');
}

try {
  await main();
} catch (error) {
  console.error('[saju-bridge] Auth smoke BLOCKED:', error instanceof Error ? error.message : 'unknown');
  process.exitCode = 1;
}
