import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const paths = {
  policy: 'config/operations/member-auth-abuse-policy-v2.json',
  migration: 'supabase/migrations/1310_member_auth_rate_limit_runtime_authority.sql',
  networkKey: 'apps/api/src/member-auth-client-network-key.ts',
  rateLimit: 'apps/api/src/member-auth-rate-limit.ts',
  postgresPort: 'apps/api/src/postgres-member-auth-rate-limit.ts',
  config: 'apps/api/src/production-member-auth-rate-limit-config.ts',
  dbTest: 'test/db/member_auth_rate_limit_authority.sh',
  authorityCore: 'test/db/run_authority_core.sh',
  docs: 'docs/operations/MEMBER_AUTH_ABUSE_POLICY_V2.md',
  signIn: 'api/auth/sign-in.ts',
  signUp: 'api/auth/sign-up.ts',
  refresh: 'api/auth/refresh.ts',
  signOut: 'api/auth/sign-out.ts',
  authHttp: 'apps/api/src/supabase-auth-http.ts',
};

execFileSync('bash', ['-n', paths.dbTest], { stdio: 'inherit' });

const [
  policyRaw,
  migration,
  networkKey,
  rateLimit,
  postgresPort,
  config,
  dbTest,
  authorityCore,
  docs,
  signIn,
  signUp,
  refresh,
  signOut,
  authHttp,
] = await Promise.all([
  readFile(paths.policy, 'utf8'),
  readFile(paths.migration, 'utf8'),
  readFile(paths.networkKey, 'utf8'),
  readFile(paths.rateLimit, 'utf8'),
  readFile(paths.postgresPort, 'utf8'),
  readFile(paths.config, 'utf8'),
  readFile(paths.dbTest, 'utf8'),
  readFile(paths.authorityCore, 'utf8'),
  readFile(paths.docs, 'utf8'),
  readFile(paths.signIn, 'utf8'),
  readFile(paths.signUp, 'utf8'),
  readFile(paths.refresh, 'utf8'),
  readFile(paths.signOut, 'utf8'),
  readFile(paths.authHttp, 'utf8'),
]);

const policy = JSON.parse(policyRaw);
const expectedPolicy = {
  contractVersion: 'myeongha-member-auth-abuse-policy-v2',
  strategy: 'postgres-application-admission',
  activationState: 'foundation-dormant',
  algorithm: 'anchored-fixed-window',
  windowSeconds: 60,
  requestLimit: 30,
  blockedCountSaturation: 31,
  actions: ['sign-in', 'sign-up', 'refresh'],
  excludedActions: ['sign-out'],
  failureMode: 'fail-closed',
  applicationRetryOnRateLimit: false,
  supabaseSecretKeyRequired: false,
  productionHttpActivation: false,
};
for (const [key, value] of Object.entries(expectedPolicy)) {
  if (JSON.stringify(policy[key]) !== JSON.stringify(value)) {
    throw new Error(paths.policy + ' has unexpected ' + key + '.');
  }
}
if (
  policy.clientKey?.source !== 'trusted-vercel-x-forwarded-for' ||
  policy.clientKey?.derivation !== 'hmac-sha256' ||
  policy.clientKey?.rawNetworkIdentifierPersistence !== false ||
  policy.clientKey?.crossEndpointLinkability !== false
) {
  throw new Error('Member Auth V2 client-key privacy contract drifted.');
}
if (
  policy.counterStore?.kind !== 'postgres' ||
  policy.counterStore?.persistence !== 'unlogged-ephemeral' ||
  policy.counterStore?.maximumCleanupRowsPerAdmission !== 8
) {
  throw new Error('Member Auth V2 counter-store contract drifted.');
}

function requireFragment(name, source, fragment) {
  if (!source.includes(fragment)) {
    throw new Error(name + ' missing required fragment: ' + fragment);
  }
}
function forbidFragment(name, source, fragment) {
  if (source.includes(fragment)) {
    throw new Error(name + ' contains forbidden C1 fragment: ' + fragment);
  }
}

for (const fragment of [
  'create unlogged table if not exists public.member_auth_rate_limit_buckets',
  'client_fingerprint bytea not null',
  "check (action in ('sign-in', 'sign-up', 'refresh'))",
  'pg_catalog.octet_length(client_fingerprint) = 32',
  'request_count between 1 and 31',
  'myeongha_member_auth_rate_limit_owner',
  'NOLOGIN',
  'NOBYPASSRLS',
  'grant create on schema public to myeongha_member_auth_rate_limit_owner',
  'revoke create on schema public from myeongha_member_auth_rate_limit_owner',
  'security definer',
  'public.cmd_admit_member_auth_request_v1',
  "interval '60 seconds'",
  'least(current_bucket.request_count + 1, 31)',
  "v_now - interval '5 minutes'",
  'limit 8',
  'grant execute on function public.cmd_admit_member_auth_request_v1(text, bytea)',
  'revoke all on table public.member_auth_rate_limit_buckets',
]) requireFragment(paths.migration, migration.toLowerCase().includes('create unlogged') ? migration : migration, fragment);

for (const forbidden of [
  'client_ip ',
  'ip_address',
  ' inet ',
  ' cidr ',
]) forbidFragment(paths.migration, migration.toLowerCase(), forbidden);

for (const fragment of [
  "request.headers.get('x-forwarded-for')",
  'isIP',
  'createHmac',
  'myeongha-member-auth-rate-limit-hmac-sha256-v1',
  ".update(input.action, 'utf8')",
  ".update(input.clientIp, 'utf8')",
  ".digest()",
]) requireFragment(paths.networkKey, networkKey, fragment);
for (const forbidden of ['console.log', 'console.error']) {
  forbidFragment(paths.networkKey, networkKey, forbidden);
}

for (const fragment of [
  "executionRole: 'myeongha_api_executor'",
  "admissionCommand: 'public.cmd_admit_member_auth_request_v1'",
  'SET LOCAL ROLE myeongha_api_executor',
  'BEGIN',
  'COMMIT',
  'ROLLBACK',
  'Buffer.from(input.clientFingerprint)',
]) requireFragment(paths.postgresPort, postgresPort, fragment);
for (const forbidden of [
  'x-forwarded-for',
  'request.headers',
  'clientIp',
  'email',
  'refreshToken',
]) forbidFragment(paths.postgresPort, postgresPort, forbidden);

for (const fragment of [
  'MYEONGHA_AUTH_RATE_LIMIT_SECRET',
  'parseProductionPostgresRuntimeConfigV1',
  'rawSecret.trim().length < 32',
]) requireFragment(paths.config, config, fragment);

for (const fragment of [
  'for i in $(seq 1 40)',
  "test \"$allowed_count\" -eq 30",
  "test \"$denied_count\" -eq 10",
  'sign-up refresh',
  'window_reset=pass',
  'api_executor_direct_table_authority=false',
]) requireFragment(paths.dbTest, dbTest, fragment);
requireFragment(paths.authorityCore, authorityCore, 'bash test/db/member_auth_rate_limit_authority.sh');

for (const fragment of [
  'C1 FOUNDATION DORMANT',
  'UNLOGGED',
  '30 allowed',
  '10 denied',
  'MYEONGHA_AUTH_RATE_LIMIT_SECRET',
  'fail-closed',
  'C2',
]) requireFragment(paths.docs, docs, fragment);

for (const [name, source] of [
  [paths.signIn, signIn],
  [paths.signUp, signUp],
  [paths.refresh, refresh],
  [paths.signOut, signOut],
  [paths.authHttp, authHttp],
]) {
  for (const forbidden of [
    'member-auth-rate-limit',
    'MYEONGHA_AUTH_RATE_LIMIT_SECRET',
    'cmd_admit_member_auth_request_v1',
  ]) {
    forbidFragment(name, source, forbidden);
  }
}

console.log('MyeongHa Member Auth Postgres rate-limit C1 foundation verification passed.');
