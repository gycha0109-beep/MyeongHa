import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  validateSyntheticLocalInputs, runSyntheticLocalHostedAcceptance,
} from './run-postgres-hosted-synthetic-local-acceptance.mjs';

const bytes = Buffer.from('dr-synthetic-private-object-2026');
const cfg = Object.freeze({
  MH_DR_LOCAL_TARGET: 'http://127.0.0.1:54321',
  MH_DR_LOCAL_ANON_KEY: 'sb_publishable_synthetic_unit_test',
  MH_DR_LOCAL_MEMBER_EMAIL: 'dr-synthetic-member@example.test',
  MH_DR_LOCAL_MEMBER_PASSWORD: 'synthetic_password_123',
  MH_DR_LOCAL_DELETED_EMAIL: 'dr-synthetic-deleted@example.test',
  MH_DR_LOCAL_DELETED_PASSWORD: 'synthetic_password_deleted_123',
  MH_DR_LOCAL_PRIVATE_BUCKET: 'dr-synthetic-private',
  MH_DR_LOCAL_OBJECT_PATH: 'probe/data.txt',
  MH_DR_LOCAL_OBJECT_SHA256: createHash('sha256').update(bytes).digest('hex'),
});
const response = (status, body = {}) => ({
  status, json: async () => body, arrayBuffer: async () => bytes,
});
const events = [];
let loggedOut = false;
const mock = async (url, options) => {
  assert.ok(url.startsWith(cfg.MH_DR_LOCAL_TARGET + '/'));
  assert.equal(options.redirect, 'manual');
  assert.equal(options.headers.apikey, cfg.MH_DR_LOCAL_ANON_KEY);
  if (url.endsWith('/auth/v1/token?grant_type=password')) {
    const body = JSON.parse(options.body);
    events.push('login');
    if (body.email !== cfg.MH_DR_LOCAL_MEMBER_EMAIL ||
        body.password !== cfg.MH_DR_LOCAL_MEMBER_PASSWORD) return response(400);
    return response(200, { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' });
  }
  if (url.includes('/storage/v1/object/')) {
    events.push('storage');
    return options.headers.Authorization === 'Bearer synthetic-access'
      ? response(200) : response(403);
  }
  if (url.endsWith('/auth/v1/token?grant_type=refresh_token')) {
    events.push('refresh');
    return loggedOut ? response(400) :
      response(200, { access_token: 'synthetic-refreshed', refresh_token: 'synthetic-new-refresh' });
  }
  if (url.endsWith('/auth/v1/logout')) {
    events.push('signout');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-refreshed');
    loggedOut = true;
    return response(204);
  }
  throw new Error('unexpected mock endpoint');
};
const outcome = await runSyntheticLocalHostedAcceptance(cfg, mock);
assert.equal(outcome.positiveLogin, 'PASS');
assert.equal(outcome.privateStorageByteDigest, 'PASS');
assert.equal(outcome.deletedSyntheticLoginDenied, 'PASS');
assert.equal(outcome.refreshAfterSignOutDenied, 'PASS');
assert.equal(outcome.drReady, false);
assert.equal(outcome.gate, 'BLOCKED');
assert.equal(outcome.serviceResumptionAllowed, false);
assert.equal(outcome.hostedProviderRecoveryProven, false);
assert.equal(outcome.outputContainsIdentifiers, false);
assert.deepEqual(events, ['login','login','login','storage','storage','refresh','signout','refresh']);

for (const overridden of [
  { MH_DR_LOCAL_TARGET: 'https://example.com' },
  { MH_DR_LOCAL_TARGET: 'http://localhost:54321' },
  { MH_DR_LOCAL_ANON_KEY: 'sb_secret_privileged_key' },
  { MH_DR_LOCAL_MEMBER_EMAIL: 'real-person@example.com' },
  { MH_DR_LOCAL_PRIVATE_BUCKET: 'customer-data' },
  { MH_DR_LOCAL_OBJECT_PATH: '../private' },
  { MH_DR_LOCAL_OBJECT_SHA256: '0'.repeat(63) },
]) {
  assert.throws(() => validateSyntheticLocalInputs({ ...cfg, ...overridden }));
}
await assert.rejects(() => runSyntheticLocalHostedAcceptance(
  { ...cfg, MH_DR_LOCAL_OBJECT_SHA256: '0'.repeat(64) }, mock,
));
await assert.rejects(() => runSyntheticLocalHostedAcceptance(
  cfg, async () => response(403),
));
console.log('Hosted synthetic local acceptance verifier PASS: loopback functional checks and fail-closed non-Hosted classification.');
