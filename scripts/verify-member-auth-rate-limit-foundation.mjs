import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const paths = {
  policy: 'config/operations/member-auth-abuse-policy-v2.json',
  migration: 'supabase/migrations/1310_member_auth_rate_limit_runtime_authority.sql',
  networkKey: 'apps/api/src/member-auth-client-network-key.ts',
  rateLimit: 'apps/api/src/member-auth-rate-limit.ts',
  rateLimitHttp: 'apps/api/src/member-auth-rate-limit-http.ts',
  postgresPort: 'apps/api/src/postgres-member-auth-rate-limit.ts',
  productionRuntime: 'apps/api/src/production-member-auth-http-runtime.ts',
  pool: 'apps/api/src/node-postgres-subject-pool.ts',
  config: 'apps/api/src/production-member-auth-rate-limit-config.ts',
  dbTest: 'test/db/member_auth_rate_limit_authority.sh',
  authorityCore: 'test/db/run_authority_core.sh',
  docs: 'docs/operations/MEMBER_AUTH_ABUSE_POLICY_V2.md',
  signIn: 'api/auth/sign-in.ts',
  signUp: 'api/auth/sign-up.ts',
  refresh: 'api/auth/refresh.ts',
  signOut: 'api/auth/sign-out.ts',
  authHttp: 'apps/api/src/supabase-auth-http.ts',
  canaryScript: 'scripts/operations/run-production-member-auth-rate-limit-canary.mjs',
  canaryWorkflow: '.github/workflows/production-member-auth-rate-limit-canary.yml',
};

execFileSync('bash', ['-n', paths.dbTest], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', paths.canaryScript], { stdio: 'inherit' });

const [
  policyRaw,
  migration,
  networkKey,
  rateLimit,
  rateLimitHttp,
  postgresPort,
  productionRuntime,
  pool,
  config,
  dbTest,
  authorityCore,
  docs,
  signIn,
  signUp,
  refresh,
  signOut,
  authHttp,
  canaryScript,
  canaryWorkflow,
] = await Promise.all([
  readFile(paths.policy, 'utf8'),
  readFile(paths.migration, 'utf8'),
  readFile(paths.networkKey, 'utf8'),
  readFile(paths.rateLimit, 'utf8'),
  readFile(paths.rateLimitHttp, 'utf8'),
  readFile(paths.postgresPort, 'utf8'),
  readFile(paths.productionRuntime, 'utf8'),
  readFile(paths.pool, 'utf8'),
  readFile(paths.config, 'utf8'),
  readFile(paths.dbTest, 'utf8'),
  readFile(paths.authorityCore, 'utf8'),
  readFile(paths.docs, 'utf8'),
  readFile(paths.signIn, 'utf8'),
  readFile(paths.signUp, 'utf8'),
  readFile(paths.refresh, 'utf8'),
  readFile(paths.signOut, 'utf8'),
  readFile(paths.authHttp, 'utf8'),
  readFile(paths.canaryScript, 'utf8'),
  readFile(paths.canaryWorkflow, 'utf8'),
]);

const policy = JSON.parse(policyRaw);
const expectedPolicy = {
  contractVersion: 'myeongha-member-auth-abuse-policy-v2',
  strategy: 'postgres-application-admission',
  activationState: 'production-active',
  algorithm: 'anchored-fixed-window',
  windowSeconds: 60,
  requestLimit: 30,
  blockedCountSaturation: 31,
  actions: ['sign-in', 'sign-up', 'refresh'],
  excludedActions: ['sign-out'],
  failureMode: 'fail-closed',
  applicationRetryOnRateLimit: false,
  supabaseSecretKeyRequired: false,
  productionHttpActivation: true,
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

if (
  policy.runtime?.routeComposition !== 'production-member-auth-http-runtime-v1' ||
  policy.runtime?.admissionBeforeRequestBody !== true ||
  policy.runtime?.postgresConnectionTimeoutMs !== 1500 ||
  policy.runtime?.postgresStatementTimeoutMs !== 1500 ||
  policy.runtime?.failureStatus !== 503 ||
  policy.runtime?.failureCode !== 'AUTH_RATE_LIMIT_UNAVAILABLE' ||
  policy.runtime?.blockedStatus !== 429 ||
  policy.runtime?.blockedCode !== 'RATE_LIMITED' ||
  JSON.stringify(policy.runtime?.retryAfterSecondsRange) !== JSON.stringify([1, 60])
) {
  throw new Error('Member Auth V2 production runtime contract drifted.');
}
if (
  policy.productionCanary?.status !== 'pass' ||
  policy.productionCanary?.runId !== 36346090857 ||
  policy.productionCanary?.exactProductionDeploymentId !== 'dpl_8sA237CXZ4vN65N9Nq4uSPYf9p4h' ||
  policy.productionCanary?.sideEffectFree !== true ||
  policy.productionCanary?.expectedAllowedInvalidRequests !== 30 ||
  policy.productionCanary?.expectedFirstRateLimitedAttempt !== 31 ||
  JSON.stringify(policy.productionCanary?.observedRetryAfterSeconds) !== JSON.stringify({
    'sign-in': 52,
    'sign-up': 53,
    refresh: 52,
  }) ||
  policy.productionCanary?.endpointBucketIndependence !== true ||
  policy.productionCanary?.signOutExcluded !== true ||
  policy.productionCanary?.probePayloads !== 'local-invalid-only' ||
  policy.productionCanary?.rawNetworkIdentifiersEmitted !== false ||
  policy.productionCanary?.credentialMaterialEmitted !== false
) {
  throw new Error('Member Auth V2 production canary evidence drifted.');
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
  'readTrustedVercelClientIpV1',
  'fingerprintMemberAuthClientV1',
  "input.request.method !== 'POST'",
  'AUTH_RATE_LIMIT_UNAVAILABLE',
  'RATE_LIMITED',
  "'Retry-After'",
  'MAXIMUM_RETRY_AFTER_SECONDS = 60',
  'cancelUnusedRequestBodyBestEffort',
  'return input.next()',
]) requireFragment(paths.rateLimitHttp, rateLimitHttp, fragment);
for (const forbidden of [
  'email',
  'password',
  'refreshToken',
  'MYEONGHA_SUPABASE_API_KEY',
  'console.log',
]) forbidFragment(paths.rateLimitHttp, rateLimitHttp, forbidden);

for (const fragment of [
  'parseProductionMemberAuthRateLimitConfigV1',
  'createNodePostgresSubjectPoolV1',
  'PostgresMemberAuthRateLimitAdmissionPortV1',
  'handleMemberAuthRateLimitHttpV1',
  'handleSupabaseAuthRequestV1',
  'connectionTimeoutMs: 1_500',
  'statementTimeoutMs: 1_500',
  'idleTimeoutMs: 5_000',
  'maxConnectionsPerRuntime: 4',
  "requestInput.request.method !== 'POST'",
]) requireFragment(paths.productionRuntime, productionRuntime, fragment);

for (const fragment of [
  'NodePostgresSubjectPoolOptionsV1',
  'connectionTimeoutMs?: number',
  'statementTimeoutMs?: number',
  'options: NodePostgresSubjectPoolOptionsV1 = {}',
]) requireFragment(paths.pool, pool, fragment);

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
  'PRODUCTION ACTIVE / C2 CANARY PROVEN',
  'UNLOGGED',
  '30 allowed',
  '10 denied',
  'MYEONGHA_AUTH_RATE_LIMIT_SECRET',
  'fail-closed',
  'production-active',
  'AUTH_RATE_LIMIT_UNAVAILABLE',
  'RATE_LIMITED',
  '36341568878',
  '36346090857',
  'dpl_8sA237CXZ4vN65N9Nq4uSPYf9p4h',
  'Retry-After: 52',
  'Retry-After: 53',
  '1500 ms',
  'endpoint bucket independence passed',
  'raw network identifiers were not emitted',
  'credential material was not emitted',
]) requireFragment(paths.docs, docs, fragment);

for (const [name, source, action] of [
  [paths.signIn, signIn, 'sign-in'],
  [paths.signUp, signUp, 'sign-up'],
  [paths.refresh, refresh, 'refresh'],
]) {
  requireFragment(name, source, 'createProductionMemberAuthHttpRuntimeV1');
  requireFragment(name, source, 'let runtime: ReturnType<typeof createProductionMemberAuthHttpRuntimeV1> | undefined;');
  requireFragment(name, source, "action: '" + action + "'");
  forbidFragment(name, source, 'handleSupabaseAuthRequestV1');
}

requireFragment(paths.signOut, signOut, 'handleSupabaseAuthRequestV1');
requireFragment(paths.signOut, signOut, "action: 'sign-out'");
forbidFragment(paths.signOut, signOut, 'createProductionMemberAuthHttpRuntimeV1');

for (const forbidden of [
  'member-auth-rate-limit',
  'MYEONGHA_AUTH_RATE_LIMIT_SECRET',
  'cmd_admit_member_auth_request_v1',
]) forbidFragment(paths.authHttp, authHttp, forbidden);

for (const fragment of [
  'const REQUEST_LIMIT = 30;',
  'const WINDOW_SECONDS = 60;',
  '{"email":"","password":""}',
  '{"refreshToken":""}',
  "expectedPreLimitStatus: 400",
  "expectedPreLimitCode: 'INVALID_REQUEST'",
  "expectedPreLimitStatus: 401",
  "expectedPreLimitCode: 'SESSION_EXPIRED'",
  'body.error.code !== endpoint.expectedPreLimitCode',
  "body.error.code !== 'RATE_LIMITED'",
  'sign_out_rate_limit_excluded=pass',
  'endpoint_bucket_independence=pass',
  'probe_payloads=local_non_mutating_only',
  'raw_network_identifiers_emitted=false',
  'credential_material_emitted=false',
]) requireFragment(paths.canaryScript, canaryScript, fragment);

for (const fragment of [
  'name: Production Member Auth Rate Limit Canary',
  'run-name: "[WT:ops] Production Member Auth Rate Limit Canary"',
  'workflow_dispatch:',
  'push:',
  'branches:',
  '- main',
  "- '.github/production-member-auth-rate-limit-canary.trigger'",
  'workflow_dispatch|push',
  "github.event_name == 'push' && 'ops' || inputs.watchtower_track",
  "github.event_name == 'push' && 'VERIFY_MEMBER_AUTH_RATE_LIMIT_CANARY_V2' || inputs.confirm",
  'VERIFY_MEMBER_AUTH_RATE_LIMIT_CANARY_V2',
  'default: ops',
  'environment: production',
  'VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}',
  'wait_exact_main_deployment',
  'node scripts/operations/run-production-member-auth-rate-limit-canary.mjs',
  'group: production-member-auth-rate-limit-canary',
  'cancel-in-progress: false',
]) requireFragment(paths.canaryWorkflow, canaryWorkflow, fragment);
for (const forbidden of ['\npull_request:', '\nschedule:']) {
  forbidFragment(paths.canaryWorkflow, canaryWorkflow, forbidden);
}

console.log(
  'MyeongHa Member Auth rate-limit V2 verification passed: C1 PostgreSQL authority remains pinned, C2 production HTTP enforcement is active for sign-in/sign-up/refresh, sign-out remains excluded, fail-closed 503 and 429 Retry-After contracts are fixed, and the side-effect-free Production canary is runtime-proven.',
);
