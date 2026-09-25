import { readFile, readdir } from 'node:fs/promises';

const policyPath = 'config/operations/supabase-management-token-policy-v1.json';
const docsPath = 'docs/operations/SUPABASE_MANAGEMENT_TOKEN_POLICY_V1.md';
const workflowsDir = '.github/workflows';

const policy = JSON.parse(await readFile(policyPath, 'utf8'));
const expected = {
  contractVersion: 'myeongha-supabase-management-token-policy-v1',
  status: 'approved_implementation_authority',
  projectRef: 'cnsfpcdiyofqvhpcegfc',
  secretName: 'SUPABASE_ACCESS_TOKEN',
  tokenClass: 'scoped_personal_access_token',
  tokenPrefix: 'sbp_fc',
  providerStage: 'public_alpha',
  allowedWorkflowConsumers: ['.github/workflows/production-data-api-containment.yml'],
  allowedManagementApi: [
    { method: 'GET', path: '/v1/projects/{projectRef}/postgrest' },
    { method: 'PATCH', path: '/v1/projects/{projectRef}/postgrest' },
  ],
  requiredPermission: { name: 'Data API Config', access: 'Read-write' },
  forbiddenPermissions: [
    'API Keys', 'API Key Secrets', 'Connection Pooling', 'Database', 'Database Config', 'Migrations',
    'Auth Config', 'Project Settings', 'Edge Functions', 'Storage', 'Organizations', 'Projects (account-wide)',
  ],
  authAdminAuthority: 'MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET',
  databaseRoutingAuthority: 'SUPABASE_PRODUCTION_SESSION_POOLER_HOST',
  databasePasswordAuthority: 'SUPABASE_DB_PASSWORD',
  managementApiResponseLogging: 'forbidden',
  authorizationHeaderLogging: 'forbidden',
  credentialLogging: 'forbidden',
};
if (JSON.stringify(policy) !== JSON.stringify(expected)) {
  throw new Error(`${policyPath} drifted from the approved V1 authority.`);
}

const docs = await readFile(docsPath, 'utf8');
for (const fragment of [
  'Status: **APPROVED IMPLEMENTATION AUTHORITY**',
  'Data API Config — Read-write',
  'GET   /v1/projects/{projectRef}/postgrest',
  'PATCH /v1/projects/{projectRef}/postgrest',
  'scoped personal access token',
  'public alpha',
  'classic broad PAT is not accepted as closure evidence',
  'superseded broad PAT is revoked',
]) {
  if (!docs.includes(fragment)) throw new Error(`${docsPath} missing authority fragment: ${fragment}`);
}

const workflowNames = (await readdir(workflowsDir)).filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'));
const consumers = [];
for (const name of workflowNames) {
  const path = `${workflowsDir}/${name}`;
  const source = await readFile(path, 'utf8');
  if (source.includes('secrets.SUPABASE_ACCESS_TOKEN')) consumers.push(path);
}
if (JSON.stringify(consumers.sort()) !== JSON.stringify(expected.allowedWorkflowConsumers)) {
  throw new Error(`SUPABASE_ACCESS_TOKEN workflow consumers drifted: ${consumers.join(', ') || 'none'}`);
}

const containmentWorkflow = await readFile('.github/workflows/production-data-api-containment.yml', 'utf8');
const containmentRunner = await readFile('scripts/run-production-data-api-containment.sh', 'utf8');
for (const fragment of [
  'SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}',
  'https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_ID/postgrest',
  '-X PATCH',
]) {
  if (!(containmentWorkflow + '\n' + containmentRunner).includes(fragment)) {
    throw new Error(`Data API containment missing approved Management authority fragment: ${fragment}`);
  }
}
for (const forbidden of ['/api-keys', '/config/database/pooler', '/config/auth', '/functions', '/storage', '/branches', '/organizations']) {
  if (containmentRunner.includes(forbidden)) {
    throw new Error(`Data API containment expanded beyond approved Management surface: ${forbidden}`);
  }
}

const forbiddenPatFiles = [
  '.github/workflows/account-deletion-hosted-auth-canary.yml',
  '.github/workflows/production-privacy-recovery-canary.yml',
  '.github/workflows/production-platform-integrity-read-audit.yml',
  '.github/workflows/production-character-roster-read-audit.yml',
  '.github/workflows/production-chat-current-subject-smoke.yml',
  '.github/workflows/production-postgres-backup.yml',
  '.github/workflows/supabase-production.yml',
  'scripts/run-account-deletion-hosted-auth-canary.mjs',
  'scripts/run-production-privacy-recovery-canary.mjs',
  'scripts/operations/run-supabase-production-migrations.sh',
  'scripts/run-production-platform-integrity-postdeploy-verify.sh',
];
for (const path of forbiddenPatFiles) {
  const source = await readFile(path, 'utf8');
  if (source.includes('SUPABASE_ACCESS_TOKEN') || source.includes('/config/database/pooler') || source.includes('/api-keys')) {
    throw new Error(`${path} reintroduced forbidden Management-token authority.`);
  }
}

for (const path of [
  '.github/workflows/production-platform-integrity-read-audit.yml',
  '.github/workflows/production-character-roster-read-audit.yml',
  '.github/workflows/production-chat-current-subject-smoke.yml',
  '.github/workflows/production-postgres-backup.yml',
  '.github/workflows/supabase-production.yml',
]) {
  const source = await readFile(path, 'utf8');
  if (!source.includes('SUPABASE_PRODUCTION_SESSION_POOLER_HOST')) {
    throw new Error(`${path} must bind database routing to the explicit Session Pooler host.`);
  }
}

for (const path of [
  '.github/workflows/account-deletion-hosted-auth-canary.yml',
  '.github/workflows/production-privacy-recovery-canary.yml',
]) {
  const source = await readFile(path, 'utf8');
  if (!source.includes('MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET')) {
    throw new Error(`${path} must bind Hosted Auth administration to the explicit Auth Admin secret.`);
  }
}

console.log('MyeongHa Supabase Management token policy v1 verification passed: PAT workflow consumers=1, Data API Config is the sole Management surface, Auth and database fallbacks are forbidden.');
