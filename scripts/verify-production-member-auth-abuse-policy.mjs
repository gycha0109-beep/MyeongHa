import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const paths = {
  policy: 'config/operations/member-auth-abuse-policy-v1.json',
  registry: 'config/operations/vercel-waf-managed-rate-limit-rules-v1.json',
  workflow: '.github/workflows/production-member-auth-abuse-policy.yml',
  runScript: 'scripts/operations/run-production-member-auth-abuse-policy.sh',
  liveScript: 'scripts/operations/verify-production-member-auth-abuse-policy-live.sh',
  signIn: 'api/auth/sign-in.ts',
  signUp: 'api/auth/sign-up.ts',
  refresh: 'api/auth/refresh.ts',
  signOut: 'api/auth/sign-out.ts',
  docs: 'docs/operations/MEMBER_AUTH_ABUSE_POLICY_V1.md',
};

for (const script of [paths.runScript, paths.liveScript]) {
  execFileSync('bash', ['-n', script], { stdio: 'inherit' });
}

const [policyRaw, registryRaw, workflow, runScript, liveScript, signIn, signUp, refresh, signOut, docs] =
  await Promise.all([
    readFile(paths.policy, 'utf8'),
    readFile(paths.registry, 'utf8'),
    readFile(paths.workflow, 'utf8'),
    readFile(paths.runScript, 'utf8'),
    readFile(paths.liveScript, 'utf8'),
    readFile(paths.signIn, 'utf8'),
    readFile(paths.signUp, 'utf8'),
    readFile(paths.refresh, 'utf8'),
    readFile(paths.signOut, 'utf8'),
    readFile(paths.docs, 'utf8'),
  ]);

const policy = JSON.parse(policyRaw);
const registry = JSON.parse(registryRaw);
const expectedTop = {
  contractVersion: 'myeongha-member-auth-abuse-policy-v1',
  vercelProjectId: 'prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP',
  vercelTeamId: 'team_xuYA9OhCWlJETaYFOmeVodgS',
  vercelProjectName: 'myeongha',
  activationState: 'hold',
  durableNetworkIdentifierPersistence: false,
  applicationRetryOnRateLimit: false,
  supabaseSecretKeyRequired: false,
};
for (const [key, value] of Object.entries(expectedTop)) {
  if (JSON.stringify(policy[key]) !== JSON.stringify(value)) {
    throw new Error(paths.policy + ' has unexpected ' + key + '.');
  }
}

const expectedRoutes = new Map([
  ['member-auth-sign-in-v1', ['/api/auth/sign-in', 'myeongha-auth-sign-in-rate-limit-v1']],
  ['member-auth-sign-up-v1', ['/api/auth/sign-up', 'myeongha-auth-sign-up-rate-limit-v1']],
  ['member-auth-refresh-v1', ['/api/auth/refresh', 'myeongha-auth-refresh-rate-limit-v1']],
]);
if (!Array.isArray(policy.rules) || policy.rules.length !== expectedRoutes.size) {
  throw new Error('Member Auth policy must contain exactly three governed endpoint rules.');
}
for (const rule of policy.rules) {
  const expected = expectedRoutes.get(rule.policyId);
  if (!expected || rule.route !== expected[0] || rule.ruleName !== expected[1]) {
    throw new Error('Unexpected Member Auth rule ' + rule.policyId + '.');
  }
  for (const [key, value] of Object.entries({
    method: 'POST',
    algorithm: 'fixed_window',
    windowSeconds: 60,
    requestLimit: 30,
    observeRateLimitAction: 'log',
    enforceRateLimitAction: 'rate_limit',
  })) {
    if (rule[key] !== value) throw new Error(rule.policyId + ' has unexpected ' + key + '.');
  }
  if (JSON.stringify(rule.keys) !== JSON.stringify(['ip'])) {
    throw new Error(rule.policyId + ' must use the IP rate-limit key.');
  }
}
if (policy.rules.some((rule) => rule.route === '/api/auth/sign-out')) {
  throw new Error('sign-out is outside Member Auth abuse policy v1 scope.');
}

for (const entry of registry.managedRules.filter((entry) => entry.policyId.startsWith('member-auth-'))) {
  if (entry.activationAuthority !== 'hold') {
    throw new Error(entry.policyId + ' must remain activation-hold in Phase A.');
  }
}

const routeSources = [
  [signIn, "action: 'sign-in'"],
  [signUp, "action: 'sign-up'"],
  [refresh, "action: 'refresh'"],
  [signOut, "action: 'sign-out'"],
];
for (const [source, fragment] of routeSources) {
  if (!source.includes('handleSupabaseAuthRequestV1') || !source.includes(fragment)) {
    throw new Error('Auth route no longer matches the pinned handler contract: ' + fragment);
  }
}

function requireFragment(name, source, fragment) {
  if (!source.includes(fragment)) throw new Error(name + ' missing required fragment: ' + fragment);
}
function forbidFragment(name, source, fragment) {
  if (source.includes(fragment)) throw new Error(name + ' contains forbidden Phase A fragment: ' + fragment);
}

for (const fragment of [
  'name: Production Member Auth Abuse Policy',
  'run-name: "[WT:ops] Production Member Auth Abuse Policy',
  'workflow_dispatch:',
  '- verify',
  '- observe',
  '- enforce',
  '- disable',
  'Type VERIFY_MEMBER_AUTH_ABUSE_POLICY_V1',
  'environment: production',
  'default: ops',
  'VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}',
  'run: bash scripts/operations/run-production-member-auth-abuse-policy.sh',
  'cancel-in-progress: false',
]) requireFragment(paths.workflow, workflow, fragment);
for (const forbidden of ['\npush:', '\npull_request:', '\nschedule:']) {
  forbidFragment(paths.workflow, workflow, forbidden);
}

for (const fragment of [
  'activationState == "hold"',
  'MEMBER_AUTH_ABUSE_POLICY_MODE',
  'VERIFY_MEMBER_AUTH_ABUSE_POLICY_V1',
  'verify-production-member-auth-abuse-policy-live.sh',
  'Phase A contains no Production mutation path',
]) requireFragment(paths.runScript, runScript, fragment);

for (const fragment of [
  'verify_governed_vercel_project',
  'assert_managed_rate_limit_registry_live_safety "$config_file" ""',
  'member_auth_policy_activation=hold',
  'member_auth_managed_rule_present_count=0',
  'production_mutation_authorized=false',
  'raw_network_identifiers_emitted=false',
]) requireFragment(paths.liveScript, liveScript, fragment);

for (const source of [runScript, liveScript, workflow]) {
  for (const forbidden of [
    '-X PATCH',
    'firewall_request PATCH',
    '/draft/activate',
    'SUPABASE_SECRET',
    'SUPABASE_SERVICE_ROLE',
    'SUPABASE_DB_PASSWORD',
    'MYEONGHA_DATABASE_URL',
  ]) forbidFragment('Member Auth Phase A control plane', source, forbidden);
}

for (const fragment of [
  'REPOSITORY CONTRACT / PRODUCTION ACTIVATION HOLD',
  '#1332',
  '/api/auth/sign-in',
  '/api/auth/sign-up',
  '/api/auth/refresh',
  'independent',
  '30 requests per 60 seconds per IP',
  'no Supabase secret key',
  'no durable IP',
  'Phase B',
  'single activation',
]) requireFragment(paths.docs, docs, fragment);

console.log('MyeongHa Member Auth abuse policy v1 verification passed.');
