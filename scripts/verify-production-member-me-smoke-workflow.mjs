import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-member-me-smoke.yml';
const liveVerifierPath = 'scripts/verify-production-member-me.mjs';
const sessionHelperPath = 'scripts/production-member-smoke-session.mjs';

const [workflow, liveVerifier, sessionHelper] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(liveVerifierPath, 'utf8'),
  readFile(sessionHelperPath, 'utf8'),
]);

const requiredWorkflowFragments = [
  'workflow_dispatch:',
  "description: 'Type VERIFY_MEMBER_ME to run the read-only production Member /api/me smoke.'",
  'permissions:',
  'contents: read',
  'cancel-in-progress: false',
  'environment: production',
  'DISPATCH_CONFIRM: ${{ inputs.confirm }}',
  'MYEONGHA_PRODUCTION_MEMBER_EMAIL: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EMAIL }}',
  'MYEONGHA_PRODUCTION_MEMBER_PASSWORD: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_PASSWORD }}',
  'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID }}',
  '[[ "$DISPATCH_CONFIRM" == \'VERIFY_MEMBER_ME\' ]]',
  'test -n "${MYEONGHA_PRODUCTION_MEMBER_EMAIL:-}"',
  'test -n "${MYEONGHA_PRODUCTION_MEMBER_PASSWORD:-}"',
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
  'MYEONGHA_PRODUCTION_MEMBER_BEARER',
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
  "import { acquireProductionMemberSmokeSession } from './production-member-smoke-session.mjs';",
  "const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';",
  "const MEMBER_ME_URL = `${PRODUCTION_ORIGIN}/api/me`;",
  "requireSecret('MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID')",
  'await acquireProductionMemberSmokeSession()',
  "redirect: 'error'",
  'AbortSignal.timeout(REQUEST_TIMEOUT_MS)',
  "unauthenticated.status !== 401",
  "unauthenticatedBody.error.code !== 'AUTH_REQUIRED'",
  'Authorization: `Bearer ${accessToken}`',
  'authenticated.status !== 200',
  "data.subjectKind !== 'member'",
  'data.subjectId !== expectedSubjectId',
  "data.subjectStatus !== 'active' && data.subjectStatus !== 'deletion_pending'",
  "directives.includes('no-store')",
  'JSON.stringify(authenticatedBody).includes(accessToken)',
];

for (const fragment of requiredLiveVerifierFragments) {
  if (!liveVerifier.includes(fragment)) {
    throw new Error(`Missing production Member live verifier contract fragment: ${fragment}`);
  }
}

const forbiddenLiveVerifierFragments = [
  'MYEONGHA_PRODUCTION_MEMBER_BEARER',
  'process.env.MYEONGHA_PRODUCTION_ORIGIN',
  'process.env.VERCEL',
  'process.env.SUPABASE',
  'api/session/bootstrap',
  'console.log(accessToken',
  'console.error(accessToken',
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

const requiredSessionHelperFragments = [
  "const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';",
  'const SIGN_IN_URL = `${PRODUCTION_ORIGIN}/api/auth/sign-in`;',
  "requireCredential('MYEONGHA_PRODUCTION_MEMBER_EMAIL')",
  "requireCredential('MYEONGHA_PRODUCTION_MEMBER_PASSWORD', { trim: false })",
  "method: 'POST'",
  "'Content-Type': 'application/json'",
  'body: JSON.stringify({ email, password })',
  "redirect: 'error'",
  'AbortSignal.timeout(REQUEST_TIMEOUT_MS)',
  "response.status !== 200",
  "body.data.status !== 'authenticated'",
  'const accessToken = session.accessToken;',
  "directives.includes('no-store')",
  "contentType.toLowerCase().includes('application/json')",
  'return Object.freeze({ accessToken });',
];

for (const fragment of requiredSessionHelperFragments) {
  if (!sessionHelper.includes(fragment)) {
    throw new Error(`Missing production Member fresh-session helper contract fragment: ${fragment}`);
  }
}

const forbiddenSessionHelperFragments = [
  'MYEONGHA_PRODUCTION_MEMBER_BEARER',
  'refreshToken',
  'localStorage',
  'writeFile',
  'appendFile',
  'console.log(',
  'console.error(',
  'set -x',
];

for (const fragment of forbiddenSessionHelperFragments) {
  if (sessionHelper.includes(fragment)) {
    throw new Error(`Forbidden production Member fresh-session helper fragment: ${fragment}`);
  }
}

console.log('MyeongHa production Member /api/me fresh-session smoke workflow contract verification passed.');
