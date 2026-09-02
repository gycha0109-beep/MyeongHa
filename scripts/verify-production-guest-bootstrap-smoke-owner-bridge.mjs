import { readFile } from 'node:fs/promises';

const workflowPath =
  '.github/workflows/production-guest-bootstrap-smoke-owner-bridge.yml';
const workflow = await readFile(workflowPath, 'utf8');

const requiredFragments = [
  'name: Production Guest Bootstrap Smoke Owner Bridge',
  'issue_comment:',
  'types: [created]',
  'contents: read',
  'issues: read',
  'pull-requests: read',
  'group: production-guest-bootstrap-smoke',
  'environment: production',
  "EXPECTED_TARGET_PR_NUMBER: '334'",
  'EXPECTED_ROUTE_ACTIVATION_SHA: ca503767d89553dd31026b3a995bee788e304adf',
  'EXPECTED_COMMAND: VERIFY_GUEST_BOOTSTRAP_V2_TLS_CA',
  'github.event.issue.number == 334',
  "github.event.comment.user.login == 'gycha0109-beep'",
  "github.event.comment.author_association == 'OWNER'",
  "github.event.comment.body == 'VERIFY_GUEST_BOOTSTRAP_V2_TLS_CA'",
  'git merge-base --is-ancestor "$EXPECTED_ROUTE_ACTIVATION_SHA" HEAD',
  'grep -F "SUPABASE_ROOT_CA_2021_PEM" apps/api/src/node-postgres-subject-pool.ts',
  'grep -F "rejectUnauthorized: true" apps/api/src/node-postgres-subject-pool.ts',
  'grep -F "SUPABASE_ROOT_CA_2021_SHA256_FINGERPRINT" apps/api/src/supabase-root-ca-2021.ts',
  '-X POST "$PRODUCTION_BASE_URL/api/session/bootstrap"',
  '-H "Authorization: Bearer $bearer_token"',
  '.data.guestSession.bearerToken == null',
  '.data.subjectId == $subject',
  '.data.subjectKind == "guest"',
  'invalid-opaque-credential-for-production-smoke',
  'invalidsignature',
  '.error.code == "AUTH_REQUIRED"',
  'cache-control',
  'no-store',
  '/api/health',
  'raw bearer was not emitted to logs',
];

for (const fragment of requiredFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`Missing production Guest smoke bridge contract fragment: ${fragment}`);
  }
}

const forbiddenFragments = [
  'VERIFY_GUEST_BOOTSTRAP_V1_CA503767',
  '\n  push:',
  '\n  pull_request:',
  '\n  schedule:',
  'workflow_dispatch:',
  'VERCEL_TOKEN',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_DB_PASSWORD',
  'MYEONGHA_DATABASE_URL',
  'MYEONGHA_DATABASE_PRINCIPAL',
  'MYEONGHA_SUPABASE_API_KEY',
  'MYEONGHA_GUEST_FINGERPRINT_SECRET',
  'service_role',
  'supabase_admin',
  'alter role',
  'contents: write',
  'issues: write',
  'pull-requests: write',
  'echo "$bearer_token"',
  'echo $bearer_token',
];

for (const fragment of forbiddenFragments) {
  if (workflow.includes(fragment)) {
    throw new Error(`Forbidden production Guest smoke bridge fragment: ${fragment}`);
  }
}

console.log('Production Guest bootstrap TLS V2 owner smoke bridge contract: verified');
