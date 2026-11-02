import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const LOCAL_DR_SYNTHETIC_SCHEMA = 'myeongha-hosted-recovery-synthetic-local-v1';
const EXPECTED_TARGET = 'http://127.0.0.1:54321';

function hold(message) {
  throw new Error('HOLD_HOSTED_SYNTHETIC_LOCAL: ' + message);
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.length === 0) hold(label + ' absent');
  return value;
}

function syntheticEmail(value, label) {
  const text = requireString(value, label);
  if (!/^dr-synthetic-[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/u.test(text)) {
    hold(label + ' is not a designated synthetic identity');
  }
  return text;
}

function localAnonKey(value) {
  const key = requireString(value, 'anon API key');
  if (key.startsWith('sb_publishable_') && key.length > 16) return key;
  const pieces = key.split('.');
  try {
    if (pieces.length !== 3 ||
        JSON.parse(Buffer.from(pieces[1], 'base64url').toString('utf8')).role !== 'anon') {
      hold('service/privileged API key forbidden');
    }
  } catch {
    hold('only local publishable or anon API key accepted');
  }
  return key;
}

export function validateSyntheticLocalInputs(env) {
  if (env.MH_DR_LOCAL_TARGET !== EXPECTED_TARGET) {
    hold('the only permitted target is the fixed 127.0.0.1 Supabase CLI API');
  }
  const apiKey = localAnonKey(env.MH_DR_LOCAL_ANON_KEY);
  const email = syntheticEmail(env.MH_DR_LOCAL_MEMBER_EMAIL, 'member email');
  const deletedEmail = syntheticEmail(env.MH_DR_LOCAL_DELETED_EMAIL, 'deleted email');
  if (email === deletedEmail) hold('member and deleted identities must differ');
  const password = requireString(env.MH_DR_LOCAL_MEMBER_PASSWORD, 'member password');
  const deletedPassword = requireString(env.MH_DR_LOCAL_DELETED_PASSWORD, 'deleted password');
  if (password.length < 8 || deletedPassword.length < 8) hold('synthetic passwords too short');
  const bucket = requireString(env.MH_DR_LOCAL_PRIVATE_BUCKET, 'private bucket');
  if (!/^dr-synthetic-[a-z0-9-]+$/u.test(bucket)) hold('non-synthetic bucket');
  const objectPath = requireString(env.MH_DR_LOCAL_OBJECT_PATH, 'object path');
  if (!/^probe\/[a-zA-Z0-9/_-]+(?:\.[a-zA-Z0-9]+)?$/u.test(objectPath) ||
      objectPath.split('/').some(x => x === '..' || x === '.')) hold('non-synthetic object path');
  const expectedSha = requireString(env.MH_DR_LOCAL_OBJECT_SHA256, 'expected object digest');
  if (!/^[a-f0-9]{64}$/u.test(expectedSha)) hold('invalid expected object digest');
  return Object.freeze({ apiKey, email, deletedEmail, password, deletedPassword,
    bucket, objectPath, expectedSha });
}

function headers(apiKey, bearer = null) {
  return { apikey: apiKey, ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}) };
}

async function authToken(request, apiKey, email, password) {
  return request(EXPECTED_TARGET + '/auth/v1/token?grant_type=password', {
    method: 'POST', redirect: 'manual',
    headers: { ...headers(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

async function requireTokens(response, step) {
  if (response.status !== 200) hold(step + ' did not succeed');
  let data;
  try { data = await response.json(); } catch { hold(step + ' returned invalid JSON'); }
  if (!data || typeof data.access_token !== 'string' || !data.access_token ||
      typeof data.refresh_token !== 'string' || !data.refresh_token) {
    hold(step + ' returned no valid token pair');
  }
  return { access: data.access_token, refresh: data.refresh_token };
}

function denied(response, step) {
  if (![400, 401, 403].includes(response.status)) hold(step + ' did not deny access');
}

export async function runSyntheticLocalHostedAcceptance(env, request = fetch) {
  const cfg = validateSyntheticLocalInputs(env);
  if (typeof request !== 'function') hold('fetch implementation missing');
  const login = await requireTokens(
    await authToken(request, cfg.apiKey, cfg.email, cfg.password), 'positive synthetic login');
  denied(await authToken(request, cfg.apiKey, cfg.email, cfg.password + '-incorrect'),
    'wrong-password login');
  denied(await authToken(request, cfg.apiKey, cfg.deletedEmail, cfg.deletedPassword),
    'deleted synthetic login');

  const objectUrl = EXPECTED_TARGET + '/storage/v1/object/' +
    [cfg.bucket, ...cfg.objectPath.split('/')].map(encodeURIComponent).join('/');
  const object = await request(objectUrl, {
    method: 'GET', redirect: 'manual', headers: headers(cfg.apiKey, login.access),
  });
  if (object.status !== 200) hold('authorized synthetic object read failed');
  const bytes = Buffer.from(await object.arrayBuffer());
  if (bytes.length === 0 || bytes.length > 1024 * 1024 ||
      createHash('sha256').update(bytes).digest('hex') !== cfg.expectedSha) {
    hold('synthetic storage bytes invalid or nonmatching');
  }
  denied(await request(objectUrl, {
    method: 'GET', redirect: 'manual', headers: headers(cfg.apiKey),
  }), 'anonymous private object access');

  const refreshed = await requireTokens(await request(
    EXPECTED_TARGET + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', redirect: 'manual',
      headers: { ...headers(cfg.apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: login.refresh }),
    }), 'synthetic token refresh');

  const logout = await request(EXPECTED_TARGET + '/auth/v1/logout', {
    method: 'POST', redirect: 'manual',
    headers: headers(cfg.apiKey, refreshed.access),
  });
  if (![200, 204].includes(logout.status)) hold('synthetic sign-out failed');
  denied(await request(EXPECTED_TARGET + '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST', redirect: 'manual',
    headers: { ...headers(cfg.apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshed.refresh }),
  }), 'refresh after sign-out');

  return Object.freeze({
    schema: LOCAL_DR_SYNTHETIC_SCHEMA,
    target: 'local-loopback-synthetic-only',
    positiveLogin: 'PASS',
    wrongPasswordDenied: 'PASS',
    deletedSyntheticLoginDenied: 'PASS',
    refreshTokenRotation: 'PASS',
    refreshAfterSignOutDenied: 'PASS',
    privateStorageByteDigest: 'PASS',
    anonymousStorageDenied: 'PASS',
    hostedProviderRecoveryProven: false,
    independentPrivacyContinuityProven: false,
    s8ServingE2eProven: false,
    wholeServiceRpoRtoProven: false,
    providerManagedDataFullRestore: false,
    futureSafePrivacyReconciliation: false,
    drReady: false,
    gate: 'BLOCKED',
    serviceResumptionAllowed: false,
    outputContainsIdentifiers: false,
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 2) hold('unexpected CLI arguments');
  try {
    const result = await runSyntheticLocalHostedAcceptance(process.env);
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'HOLD_HOSTED_SYNTHETIC_LOCAL');
    process.exitCode = 1;
  }
}
