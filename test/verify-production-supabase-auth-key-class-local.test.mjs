import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'vitest';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(
  new URL('../scripts/operations/verify-production-supabase-auth-key-class-local.mjs', import.meta.url)
);

const FAKE_PUBLISHABLE = 'sb_publishable_synthetic_local_preflight_123456789012345';
const FAKE_SECRET = 'sb_secret_synthetic_local_preflight_123456789012345';
const FIXTURE_ORIGIN = 'https://cnsfpcdiyofqvhpcegfc.supabase.co';
function syntheticLegacyKey(role) {
  return [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ role })).toString('base64url'),
    'synthetic-not-a-valid-jwt-signature',
  ].join('.');
}

function run(key, overrides = {}, args = []) {
  // Child receives synthetic keys solely through its private process
  // environment, never CLI args, logs, git files, Vercel or network.
  const env = {
    NODE_ENV: 'test',
    MYEONGHA_SUPABASE_URL: FIXTURE_ORIGIN,
    MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_runtime',
    ...(key === undefined ? {} : { MYEONGHA_SUPABASE_API_KEY: key }),
    ...overrides,
  };
  const result = spawnSync(process.execPath, [script, ...args], {
    env, encoding: 'utf8', timeout: 12000, maxBuffer: 200000,
  });
  if (result.error) throw result.error;
  const output = (result.stdout || '') + '\n' + (result.stderr || '');
  for (const syntheticSecret of [
    FAKE_PUBLISHABLE,
    FAKE_SECRET,
    syntheticLegacyKey('anon'),
    syntheticLegacyKey('service_role'),
    ...(key === undefined ? [] : [key]),
  ]) {
    assert.ok(!output.includes(syntheticSecret),
      'local attestation must not print any synthetic credential bytes');
  }
  return { code: result.status, output };
}

test('D3e26: publishable Supabase key passes without key bytes in output', () => {
  const result = run(FAKE_PUBLISHABLE);
  assert.equal(result.code, 0);
  assert.match(result.output, /PASS D3e26: least-privilege_supabase_auth_key_class=publishable/);
  assert.match(result.output, /HOLD D3e26: local_shape_check_only/);
});

test('D3e26: legacy anon class remains supported only as backward compatibility', () => {
  const result = run(syntheticLegacyKey('anon'));
  assert.equal(result.code, 0);
  assert.match(result.output, /least-privilege_supabase_auth_key_class=legacy_anon/);
});

for (const [name, key, reason] of [
  ['new elevated secret', FAKE_SECRET, 'privileged_supabase_auth_api_key'],
  ['legacy service_role', syntheticLegacyKey('service_role'), 'privileged_supabase_auth_api_key'],
  ['malformed', 'not-a-supabase-key', 'missing_or_unrecognized_supabase_auth_api_key'],
  ['empty', undefined, 'missing_or_unrecognized_supabase_auth_api_key'],
]) {
  test('D3e26: ' + name + ' fails closed without secret output', () => {
    const result = run(key);
    assert.equal(result.code, 2);
    assert.match(result.output, new RegExp(reason));
    assert.doesNotMatch(result.output, /PASS D3e26/);
  });
}

test('D3e26: incorrect Supabase origin fails without logging the supplied origin', () => {
  const secretPlaceHolder = 'https://wrong-private-project.example';
  const result = run(FAKE_PUBLISHABLE, { MYEONGHA_SUPABASE_URL: secretPlaceHolder });
  assert.equal(result.code, 2);
  assert.match(result.output, /unexpected_supabase_origin/);
  assert.ok(!result.output.includes(secretPlaceHolder));
});

test('D3e26: incorrect runtime DB principal fails without logging the supplied name', () => {
  const badPrincipal = 'postgres-secret-text-not-to-leak';
  const result = run(FAKE_PUBLISHABLE, { MYEONGHA_DATABASE_PRINCIPAL: badPrincipal });
  assert.equal(result.code, 2);
  assert.match(result.output, /unexpected_database_principal/);
  assert.ok(!result.output.includes(badPrincipal));
});

test('D3e26: rejects command line input to prevent accidental process argument leak', () => {
  const result = run(FAKE_PUBLISHABLE, {}, ['NOT_A_SECRET_ARG']);
  assert.equal(result.code, 2);
  assert.match(result.output, /command_arguments_not_accepted/);
  assert.ok(!result.output.includes('NOT_A_SECRET_ARG'));
});
