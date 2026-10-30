import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateLocalFixtureConfig } from './prepare-postgres-hosted-synthetic-local-fixtures.mjs';

const BASE = 'http://127.0.0.1:54321';
const DENIAL = new Set([400, 401, 403, 404]);

function hold(reason) {
  throw new Error('HOLD_DR_LOCAL_POSTDELETE: ' + reason);
}

async function json(response, step) {
  try { return await response.json(); }
  catch { hold(step + ' returned malformed JSON'); }
}

export async function verifyLocalSyntheticPostDeletion(env, request = fetch) {
  const c = validateLocalFixtureConfig(env);
  if (typeof request !== 'function') hold('request transport unavailable');
  const member = await request(BASE + '/auth/v1/token?grant_type=password', {
    method: 'POST', redirect: 'manual',
    headers: { apikey: c.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: c.email, password: c.password }),
  });
  if (member.status !== 200) hold('synthetic member must be active before deletion');
  const tokens = await json(member, 'member sign-in');
  if (typeof tokens?.access_token !== 'string' ||
      typeof tokens?.refresh_token !== 'string') hold('member tokens absent');

  const self = await request(BASE + '/auth/v1/user', {
    method: 'GET', redirect: 'manual',
    headers: { apikey: c.apiKey, Authorization: 'Bearer ' + tokens.access_token },
  });
  if (self.status !== 200) hold('local identity proof rejected');
  const identity = await json(self, 'local identity proof');
  if (identity?.email !== c.email ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
        .test(identity?.id ?? '')) hold('nonfixture identity cannot be deleted');

  const objectUrl = BASE + '/storage/v1/object/' +
    [c.bucket, ...c.objectPath.split('/')].map(encodeURIComponent).join('/');
  const memberHeaders = { apikey: c.apiKey, Authorization: 'Bearer ' + tokens.access_token };
  const before = await request(objectUrl, {
    method: 'GET', redirect: 'manual', headers: memberHeaders,
  });
  if (before.status !== 200) hold('synthetic private-object baseline must be readable');
  const bytes = Buffer.from(await before.arrayBuffer());
  if (bytes.length === 0 || bytes.length > 1024 * 1024 ||
      createHash('sha256').update(bytes).digest('hex') !== c.expectedSha) {
    hold('private synthetic-object baseline digest mismatch');
  }

  const deletion = await request(BASE + '/auth/v1/admin/users/' + identity.id, {
    method: 'DELETE', redirect: 'manual',
    headers: { apikey: c.serviceRoleKey,
      Authorization: 'Bearer ' + c.serviceRoleKey },
  });
  if (deletion.status !== 200 && deletion.status !== 204) {
    hold('synthetic local account deletion failed');
  }

  const postLogin = await request(BASE + '/auth/v1/token?grant_type=password', {
    method: 'POST', redirect: 'manual',
    headers: { apikey: c.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: c.email, password: c.password }),
  });
  const postRefresh = await request(BASE + '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST', redirect: 'manual',
    headers: { apikey: c.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: tokens.refresh_token }),
  });
  const postStorage = await request(objectUrl, {
    method: 'GET', redirect: 'manual', headers: memberHeaders,
  });

  const loginDenied = DENIAL.has(postLogin.status);
  const refreshDenied = DENIAL.has(postRefresh.status);
  const staleStorageDenied = DENIAL.has(postStorage.status);
  const report = Object.freeze({
    schema: 'myeongha-dr-synthetic-local-postdelete-v1',
    target: 'local-loopback-synthetic-only',
    syntheticPrivateObjectBeforeDeletion: 'PASS',
    syntheticDeletion: 'PASS',
    newLoginDenied: loginDenied ? 'PASS' : 'FAIL',
    refreshAfterDeletionDenied: refreshDenied ? 'PASS' : 'FAIL',
    staleAccessTokenStorageDenied: staleStorageDenied ? 'PASS' : 'FAIL',
    independentPrivacyContinuityProven: false,
    hostedProviderRecoveryProven: false,
    providerManagedDataFullRestore: false,
    futureSafePrivacyReconciliation: false,
    drReady: false,
    gate: 'BLOCKED',
    serviceResumptionAllowed: false,
    outputContainsIdentifiers: false,
  });
  return report;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 2) hold('unexpected CLI argument');
  try {
    const report = await verifyLocalSyntheticPostDeletion(process.env);
    console.log(JSON.stringify(report));
    if (report.newLoginDenied !== 'PASS' ||
        report.refreshAfterDeletionDenied !== 'PASS' ||
        report.staleAccessTokenStorageDenied !== 'PASS') {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'HOLD_DR_LOCAL_POSTDELETE');
    process.exitCode = 1;
  }
}
