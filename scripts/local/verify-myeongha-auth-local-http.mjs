#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const origin = 'http://127.0.0.1:8787';
const email = `myeongha-local-${randomBytes(12).toString('hex')}@example.invalid`;
const password = `Local-Aa1-${randomBytes(28).toString('base64url')}!`;
const passes = [];

async function configuredLocalProvider(provider) {
  const variable = `MYEONGHA_SOCIAL_AUTH_${provider.toUpperCase()}_ENABLED`;
  const vars = await readFile(new URL('./.dev.vars', import.meta.url), 'utf8');
  const match = vars.match(new RegExp(`^${variable}=([^\\r\\n]*)$`, 'mu'));
  return match?.[1] === 'true';
}

async function request(path, body, headers = {}) {
  const response = await fetch(origin + path, {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(12_000),
    headers: { accept: 'application/json', 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  let payload = null;
  try { payload = await response.json(); } catch { await response.body?.cancel(); }
  if (!response.ok || payload?.ok !== true) {
    throw new Error(`${path} failed with HTTP ${response.status} (${payload?.error?.code ?? 'invalid-response'}).`);
  }
  return { response, payload };
}
function session(result) {
  const value = result.payload?.data?.session;
  if (!value || typeof value.accessToken !== 'string' || typeof value.refreshToken !== 'string' ||
      typeof value.user?.id !== 'string') throw new Error('Member API did not return a complete session.');
  return value;
}
function pass(label) { passes.push(label); console.log(`[local-auth] ${label}: PASS`); }

async function run() {
  const homepage = await fetch(origin + '/auth.html', { signal: AbortSignal.timeout(5000) });
  if (homepage.status !== 200) throw new Error('The actual MyeongHa auth page is not served at 127.0.0.1:8787.');
  await homepage.body?.cancel();

  const guestStart = await request('/api/session/bootstrap', {});
  const guest = guestStart.payload.data?.guestSession;
  if (guestStart.payload.data?.kind !== 'guest' || typeof guest?.bearerToken !== 'string' ||
      typeof guest?.guestSessionId !== 'string') throw new Error('Guest bootstrap returned no real guest credential.');
  pass('Guest session creation');

  const guestResume = await request('/api/session/bootstrap', {}, {
    authorization: `Bearer ${guest.bearerToken}`,
  });
  if (guestResume.payload.data?.subjectId !== guestStart.payload.data.subjectId ||
      guestResume.payload.data?.guestSession?.guestSessionId !== guest.guestSessionId ||
      guestResume.payload.data?.guestSession?.bearerToken !== null) {
    throw new Error('Guest resume did not resolve the same stored session.');
  }
  pass('Guest session reuse');

  const signup = await request('/api/auth/sign-up', { email, password, next: 'hall.html' });
  const signupSession = session(signup);
  if (signupSession.user.email !== email) throw new Error('Sign-up returned a different user identity.');
  pass('Member sign-up');

  const promotion = await request('/api/auth/promote-guest', {}, {
    authorization: `Bearer ${signupSession.accessToken}`,
    'x-myeongha-guest-bearer': guest.bearerToken,
  });
  if (promotion.payload.data?.kind !== 'member' || promotion.payload.data?.subjectId !== guestStart.payload.data.subjectId) {
    throw new Error('The existing guest Subject was not promoted to this Member.');
  }
  pass('Guest-to-member transition');

  await request('/api/auth/sign-out', {}, { authorization: `Bearer ${signupSession.accessToken}` });
  pass('Sign-out');

  const login = await request('/api/auth/sign-in', { email, password });
  const loginSession = session(login);
  if (loginSession.user.id !== signupSession.user.id) throw new Error('Email login resolved a different Member.');
  pass('Email sign-in after sign-out');

  const refresh = await request('/api/auth/refresh', { refreshToken: loginSession.refreshToken });
  const refreshed = session(refresh);
  if (refreshed.user.id !== loginSession.user.id) throw new Error('Refresh changed the authenticated Member.');
  pass('Session refresh');

  await request('/api/auth/sign-out', {}, { authorization: `Bearer ${refreshed.accessToken}` });
  pass('Final sign-out');

  // Exercise the same refresh-token transport used by product-auth.js in the website.
  const webCookieHeaders = { 'x-myeongha-auth-transport': 'web-cookie-v1' };
  const browserSignup = await request('/api/auth/sign-up', {
    email: `myeongha-cookie-${randomBytes(10).toString('hex')}@example.invalid`, password,
    next: 'hall.html',
  }, webCookieHeaders);
  const browserSession = browserSignup.payload.data?.session;
  const browserCookie = browserSignup.response.headers.get('set-cookie');
  if (browserSignup.payload.data?.status !== 'authenticated' ||
      typeof browserSession?.accessToken !== 'string' ||
      Object.hasOwn(browserSession, 'refreshToken') ||
      !browserCookie?.startsWith('myeongha_member_refresh_v1=') ||
      !/HttpOnly/u.test(browserCookie) || !/Secure/u.test(browserCookie) ||
      !/SameSite=Strict/u.test(browserCookie)) {
    throw new Error('Browser cookie signup did not return the hardened HttpOnly session transport.');
  }
  const cookieValue = browserCookie.split(';', 1)[0];
  pass('Website cookie-based sign-up and HttpOnly refresh storage');

  const browserRefresh = await request('/api/auth/refresh', {}, {
    ...webCookieHeaders, cookie: cookieValue,
  });
  const refreshedBrowserSession = browserRefresh.payload.data?.session;
  const rotatedCookie = browserRefresh.response.headers.get('set-cookie');
  if (browserRefresh.payload.data?.status !== 'authenticated' ||
      refreshedBrowserSession?.user?.id !== browserSession.user.id ||
      Object.hasOwn(refreshedBrowserSession ?? {}, 'refreshToken') ||
      !rotatedCookie?.startsWith('myeongha_member_refresh_v1=')) {
    throw new Error('Website cookie refresh did not rotate the HttpOnly credential.');
  }
  pass('Website cookie-based session refresh');

  const browserSignout = await request('/api/auth/sign-out', {}, {
    ...webCookieHeaders,
    authorization: `Bearer ${refreshedBrowserSession.accessToken}`,
    cookie: rotatedCookie.split(';', 1)[0],
  });
  const clearedCookie = browserSignout.response.headers.get('set-cookie');
  if (browserSignout.payload.data?.signedOut !== true || !/Max-Age=0/u.test(clearedCookie ?? '')) {
    throw new Error('Website cookie sign-out did not revoke the session and clear its refresh cookie.');
  }
  pass('Website cookie-based sign-out');

  const providerHosts = { google: 'accounts.google.com', kakao: 'kauth.kakao.com' };
  for (const provider of ['google', 'kakao', 'naver']) {
    const result = await fetch(origin + '/api/auth/social/start', {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(5000),
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ provider, redirectUri: origin + '/auth.html?social=callback' }),
    });
    let payload = null;
    try { payload = await result.json(); } catch { await result.body?.cancel(); }
    if (provider === 'naver' || !await configuredLocalProvider(provider)) {
      if (result.status !== 503 || payload?.error?.code !== 'SOCIAL_AUTH_PROVIDER_DISABLED') {
        throw new Error(`${provider} did not fail closed pending its provider settings.`);
      }
      continue;
    }
    const authUrl = payload?.data?.authorizationUrl;
    if (result.status !== 200 || payload?.ok !== true || typeof authUrl !== 'string' ||
        new URL(authUrl).origin !== 'http://127.0.0.1:15432' ||
        new URL(authUrl).pathname !== '/authorize') {
      throw new Error(`${provider} did not produce the approved local GoTrue authorization URL.`);
    }
    const authResponse = await fetch(authUrl, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
    const providerLocation = authResponse.headers.get('location');
    if (authResponse.status !== 302 || providerLocation === null) {
      throw new Error(`${provider} did not reach its configured OAuth authorization handoff.`);
    }
    const providerUrl = new URL(providerLocation);
    if (providerUrl.hostname !== providerHosts[provider] ||
        providerUrl.searchParams.get('redirect_uri') !== 'http://127.0.0.1:15432/callback') {
      throw new Error(`${provider} OAuth handoff used an unexpected host or callback.`);
    }
  }
  pass('Social provider handoffs match local settings (no external provider account contacted)');
  console.log(`[local-auth] All ${passes.length} real local HTTP checks passed (disposable only).`);
}

run().catch(error => {
  console.error('[local-auth] BLOCKED:', error instanceof Error ? error.message : 'unknown failure');
  process.exitCode = 1;
});
