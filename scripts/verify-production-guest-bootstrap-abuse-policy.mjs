import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const paths = {
  policy: 'config/operations/guest-bootstrap-abuse-policy-v1.json',
  applyWorkflow: '.github/workflows/production-guest-bootstrap-abuse-policy.yml',
  evidenceWorkflow: '.github/workflows/production-guest-bootstrap-abuse-policy-evidence.yml',
  applyScript: 'scripts/operations/run-production-guest-bootstrap-abuse-policy.sh',
  evidenceScript: 'scripts/operations/verify-production-guest-bootstrap-abuse-policy-live.sh',
  productAuth: 'apps/web/product-auth.js',
  docs: 'docs/operations/GUEST_BOOTSTRAP_ABUSE_POLICY_V1.md',
};

for (const script of [paths.applyScript, paths.evidenceScript]) {
  execFileSync('bash', ['-n', script], { stdio: 'inherit' });
}

const [policyRaw, applyWorkflow, evidenceWorkflow, applyScript, evidenceScript, productAuth, docs] =
  await Promise.all([
    readFile(paths.policy, 'utf8'),
    readFile(paths.applyWorkflow, 'utf8'),
    readFile(paths.evidenceWorkflow, 'utf8'),
    readFile(paths.applyScript, 'utf8'),
    readFile(paths.evidenceScript, 'utf8'),
    readFile(paths.productAuth, 'utf8'),
    readFile(paths.docs, 'utf8'),
  ]);

const policy = JSON.parse(policyRaw);
const expectedPolicy = {
  contractVersion: 'myeongha-guest-bootstrap-abuse-policy-v1',
  vercelProjectId: 'prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP',
  vercelTeamId: 'team_xuYA9OhCWlJETaYFOmeVodgS',
  vercelProjectName: 'myeongha',
  ruleName: 'myeongha-guest-bootstrap-rate-limit-v1',
  route: '/api/session/bootstrap',
  method: 'POST',
  algorithm: 'fixed_window',
  windowSeconds: 60,
  requestLimit: 30,
  keys: ['ip'],
  observeRateLimitAction: 'log',
  enforceRateLimitAction: 'rate_limit',
  durableNetworkIdentifierPersistence: false,
  applicationRetryOnRateLimit: false,
};

for (const [key, value] of Object.entries(expectedPolicy)) {
  if (JSON.stringify(policy[key]) !== JSON.stringify(value)) {
    throw new Error(`${paths.policy} has unexpected ${key}: ${JSON.stringify(policy[key])}`);
  }
}

function requireFragment(sourceName, source, fragment) {
  if (!source.includes(fragment)) {
    throw new Error(`${sourceName} missing required fragment: ${fragment}`);
  }
}

function forbidFragment(sourceName, source, fragment) {
  if (source.includes(fragment)) {
    throw new Error(`${sourceName} contains forbidden fragment: ${fragment}`);
  }
}

for (const fragment of [
  'name: Production Guest Bootstrap Abuse Policy',
  'run-name: "[WT:ops] Production Guest Bootstrap Abuse Policy',
  'workflow_dispatch:',
  '- observe',
  '- enforce',
  '- disable',
  'Type APPLY_GUEST_BOOTSTRAP_ABUSE_POLICY_V1',
  'environment: production',
  'MYEONGHA_WATCHTOWER_TRACK: ${{ inputs.watchtower_track }}',
  'VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}',
  'run: bash scripts/operations/run-production-guest-bootstrap-abuse-policy.sh',
  'cancel-in-progress: false',
]) {
  requireFragment(paths.applyWorkflow, applyWorkflow, fragment);
}
for (const forbidden of ['\npush:', '\npull_request:', '\nschedule:']) {
  forbidFragment(paths.applyWorkflow, applyWorkflow, forbidden);
}

for (const fragment of [
  'name: Production Guest Bootstrap Abuse Policy Evidence',
  'run-name: "[WT:ops] Production Guest Bootstrap Abuse Policy Evidence',
  'workflow_dispatch:',
  "cron: '41 18 * * *'",
  "github.event_name == 'schedule' && 'observe'",
  'environment: production',
  'VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}',
  'run: bash scripts/operations/verify-production-guest-bootstrap-abuse-policy-live.sh',
]) {
  requireFragment(paths.evidenceWorkflow, evidenceWorkflow, fragment);
}

for (const fragment of [
  '[[ "$GITHUB_EVENT_NAME" == "workflow_dispatch" ]]',
  '[[ "$GITHUB_REF" == "refs/heads/main" ]]',
  '[[ "$MYEONGHA_WATCHTOWER_TRACK" == "ops" ]]',
  '[[ "$DISPATCH_CONFIRM" == "APPLY_GUEST_BOOTSTRAP_ABUSE_POLICY_V1" ]]',
  'rules.insert',
  'rules.update',
  'A different active rate-limit rule already exists; no mutation was attempted.',
  '.draft.id // empty',
  '/activate?projectId=$VERCEL_PROJECT_ID&teamId=$VERCEL_TEAM_ID',
  '.active.firewallEnabled == true',
  'value: "/api/session/bootstrap"',
  'value: "POST"',
  'action: "rate_limit"',
  'algo: "fixed_window"',
  'window: $window',
  'limit: $limit',
  'keys: ["ip"]',
  'durable_network_identifier_persistence=false',
]) {
  requireFragment(paths.applyScript, applyScript, fragment);
}

for (const fragment of [
  'EXPECTED_ABUSE_POLICY_MODE',
  '.active.firewallEnabled == true',
  'value: "/api/session/bootstrap"',
  'value: "POST"',
  'algo == "fixed_window"',
  'tonumber) == 60',
  'tonumber) == 30',
  'keys == ["ip"]',
  'raw_network_identifiers_emitted=false',
]) {
  requireFragment(paths.evidenceScript, evidenceScript, fragment);
}

for (const forbidden of [
  'MYEONGHA_DATABASE_URL',
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_ACCESS_TOKEN',
  'guest_bootstrap_rate_limit',
  'client_ip',
  'fingerprint history',
]) {
  forbidFragment('Guest bootstrap firewall runtime', applyScript + '\n' + evidenceScript, forbidden);
}

for (const fragment of [
  "response.status === 429 && options?.rateLimitCode",
  "rateLimitCode: 'WEB_AUTH_GUEST_RATE_LIMITED'",
  '게스트 세션 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
]) {
  requireFragment(paths.productAuth, productAuth, fragment);
}
forbidFragment(paths.productAuth, productAuth, 'setTimeout(() => ensureGuestBearer');

for (const fragment of [
  '30 requests',
  '60 seconds',
  'no automatic application retry',
  'no database IP/fingerprint retention table',
  'mode=observe',
  '400 INVALID_REQUEST',
  'edge rate limiting',
]) {
  requireFragment(paths.docs, docs, fragment);
}

console.log(
  'MyeongHa Guest bootstrap abuse policy v1 verification passed: exact POST route, 30/60s/IP edge bound, observe/enforce/disable control plane, live drift evidence, no durable network-identifier store, and no automatic 429 retry are pinned.',
);
