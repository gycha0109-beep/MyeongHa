import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-member-me-smoke.yml';
const liveVerifierPath = 'scripts/verify-production-member-me.mjs';

const [workflow, liveVerifier] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(liveVerifierPath, 'utf8'),
]);

const requiredWorkflowFragments = [
  'workflow_dispatch:',
  "description: 'Type VERIFY_MEMBER_ME to run the read-only production Member /api/me smoke.'",
  'permissions:',
  'contents: read',
  'cancel-in-progress: false',
  'environment: production',
  'DISPATCH_CONFIRM: ${{ inputs.confirm }}',
  'MYEONGHA_PRODUCTION_MEMBER_BEARER: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_BEARER }}',
  'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID }}',
  '[[ "$DISPATCH_CONFIRM" == \'VERIFY_MEMBER_ME\' ]]',
  'test -n "${MYEONGHA_PRODUCTION_MEMBER_BEARER:-}"',
  'test -n "${MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID:-}"',
  'uses: actions/checkout@v4',
  'uses: actions/setup-node@v4',
  "node-version: '24'",
  'run: node scripts/verify-production-member-me.mjs',
];

for (const fragment of requiredWorkflowFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`Missing production Member smoke workflow contract fragment: ${fragment}`);
  }
}

const forbiddenWorkflowFragments = [
  '\npush:',
  '\npull_request:',
  '\nschedule:',
  'MYEONGHA_PRODUCTION_ORIGIN',
  'MYEONGHA_GUEST_SESSION_TTL_SECONDS',
  'MYEONGHA_DATABASE_URL',
  'MYEONGHA_DATABASE_PRINCIPAL',
  'MYEONGHA_SUPABASE_URL',
  'MYEONGHA_SUPABASE_API_KEY',
  'MYEONGHA_GUEST_FINGERPRINT_SECRET',
  'VERCEL_TOKEN',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_DB_PASSWORD',
  'curl ',
  'psql ',
  'vercel deploy',
  'vercel --prod',
  'supabase db',
  'alter role',
  'api/session/bootstrap',
  'set -x',
];

for (const fragment of forbiddenWorkflowFragments) {
  if (workflow.includes(fragment)) {
    throw new Error(`Forbidden production Member smoke workflow fragment: ${fragment}`);
  }
}

if ((workflow.match(/workflow_dispatch:/g) ?? []).length !== 1) {
  throw new Error('Production Member smoke must expose exactly one workflow_dispatch trigger.');
}

const requiredLiveVerifierFragments = [
  "const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';",
  "const MEMBER_ME_URL = `${PRODUCTION_ORIGIN}/api/me`;",
  "requireSecret('MYEONGHA_PRODUCTION_MEMBER_BEARER')",
  "requireSecret('MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID')",
  "redirect: 'error'",
  'AbortSignal.timeout(REQUEST_TIMEOUT_MS)',
  "unauthenticated.status !== 401",
  "unauthenticatedBody.error.code !== 'AUTH_REQUIRED'",
  'Authorization: `Bearer ${bearer}`',
  'authenticated.status !== 200',
  "data.subjectKind !== 'member'",
  'data.subjectId !== expectedSubjectId',
  "data.subjectStatus !== 'active' && data.subjectStatus !== 'deletion_pending'",
  "directives.includes('no-store')",
];

for (const fragment of requiredLiveVerifierFragments) {
  if (!liveVerifier.includes(fragment)) {
    throw new Error(`Missing production Member live verifier contract fragment: ${fragment}`);
  }
}

const forbiddenLiveVerifierFragments = [
  'process.env.MYEONGHA_PRODUCTION_ORIGIN',
  'process.env.VERCEL',
  'process.env.SUPABASE',
  'api/session/bootstrap',
  'console.log(bearer',
  'console.error(bearer',
  'console.log(authenticatedBody',
  'console.error(authenticatedBody',
  'console.log(unauthenticatedBody',
  'console.error(unauthenticatedBody',
];

for (const fragment of forbiddenLiveVerifierFragments) {
  if (liveVerifier.includes(fragment)) {
    throw new Error(`Forbidden production Member live verifier fragment: ${fragment}`);
  }
}

console.log('MyeongHa production Member /api/me smoke workflow contract verification passed.');
