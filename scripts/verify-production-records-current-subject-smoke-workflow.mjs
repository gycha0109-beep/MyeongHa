import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-records-current-subject-smoke.yml';
const liveVerifierPath = 'scripts/verify-production-records-current-subject.mjs';
const sessionHelperPath = 'scripts/production-member-smoke-session.mjs';

const [workflow, liveVerifier, sessionHelper] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(liveVerifierPath, 'utf8'),
  readFile(sessionHelperPath, 'utf8'),
]);

const requiredWorkflowFragments = [
  'workflow_dispatch:',
  "description: 'Type VERIFY_RECORDS_CURRENT_SUBJECT to run the production Records current-subject smoke.'",
  'permissions:',
  'contents: read',
  'cancel-in-progress: false',
  'environment: production',
  'DISPATCH_CONFIRM: ${{ inputs.confirm }}',
  'MYEONGHA_PRODUCTION_MEMBER_EMAIL: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EMAIL }}',
  'MYEONGHA_PRODUCTION_MEMBER_PASSWORD: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_PASSWORD }}',
  'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID }}',
  '[[ "$DISPATCH_CONFIRM" == \'VERIFY_RECORDS_CURRENT_SUBJECT\' ]]',
  'uses: actions/checkout@v4',
  'uses: actions/setup-node@v4',
  "node-version: '24'",
  'run: node scripts/verify-production-records-current-subject.mjs',
];

for (const fragment of requiredWorkflowFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`Missing production Records smoke workflow contract fragment: ${fragment}`);
  }
}

const forbiddenWorkflowFragments = [
  '\npush:',
  '\npull_request:',
  '\nschedule:',
  'MYEONGHA_PRODUCTION_MEMBER_BEARER',
  'MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_BEARER',
  'MYEONGHA_DATABASE_URL',
  'MYEONGHA_DATABASE_PRINCIPAL',
  'MYEONGHA_SUPABASE_URL',
  'MYEONGHA_SUPABASE_API_KEY',
  'VERCEL_TOKEN',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_DB_PASSWORD',
  'curl ',
  'psql ',
  'vercel deploy',
  'set -x',
];

for (const fragment of forbiddenWorkflowFragments) {
  if (workflow.includes(fragment)) {
    throw new Error(`Forbidden production Records smoke workflow fragment: ${fragment}`);
  }
}

if ((workflow.match(/workflow_dispatch:/g) ?? []).length !== 1) {
  throw new Error('Production Records smoke must expose exactly one workflow_dispatch trigger.');
}

const requiredLiveVerifierFragments = [
  "import { acquireProductionMemberSmokeSession } from './production-member-smoke-session.mjs';",
  "const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';",
  'const MEMBER_ME_URL = `${PRODUCTION_ORIGIN}/api/me`;',
  'const LIFE_RECORD_URL = `${PRODUCTION_ORIGIN}/api/life-record`;',
  'const MEMORIES_URL = `${PRODUCTION_ORIGIN}/api/memories`;',
  "requireSecret('MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID')",
  'await acquireProductionMemberSmokeSession()',
  "redirect: 'error'",
  'AbortSignal.timeout(REQUEST_TIMEOUT_MS)',
  'Authorization: `Bearer ${session.accessToken}`',
  "memberData.subjectKind !== 'member'",
  "memberData.subjectStatus !== 'active'",
  'memberData.subjectId !== expectedSubjectId',
  "await verifyUnauthenticatedFailClosed(LIFE_RECORD_URL, 'Production Life Record')",
  "await verifyUnauthenticatedFailClosed(MEMORIES_URL, 'Production Memories')",
  'lifeRecordResponse.status !== 200',
  'memoriesResponse.status !== 200',
  "requireArray('Production Life Record facts', data.facts)",
  "requireArray('Production Memories items', data.memories)",
  "error.code !== 'AUTH_REQUIRED'",
  'requireNoTokenReflection(',
  'memberSignIn=200',
  'memberSubjectMatch=true',
  'lifeRecordUnauthenticated=401',
  'memoriesUnauthenticated=401',
  'lifeRecord=200',
  'memories=200',
  'cacheControl=no-store',
];

for (const fragment of requiredLiveVerifierFragments) {
  if (!liveVerifier.includes(fragment)) {
    throw new Error(`Missing production Records live verifier contract fragment: ${fragment}`);
  }
}

const forbiddenLiveVerifierFragments = [
  'MYEONGHA_PRODUCTION_MEMBER_BEARER',
  'MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_BEARER',
  'process.env.MYEONGHA_PRODUCTION_ORIGIN',
  'process.env.VERCEL',
  'process.env.SUPABASE',
  "method: 'POST'",
  "method: 'DELETE'",
  "method: 'PATCH'",
  "method: 'PUT'",
  'console.log(session.accessToken',
  'console.error(session.accessToken',
  'console.log(memberBody',
  'console.error(memberBody',
  'console.log(lifeRecordBody',
  'console.error(lifeRecordBody',
  'console.log(memoriesBody',
  'console.error(memoriesBody',
  'writeFile',
  'appendFile',
  'localStorage',
  'refreshToken',
];

for (const fragment of forbiddenLiveVerifierFragments) {
  if (liveVerifier.includes(fragment)) {
    throw new Error(`Forbidden production Records live verifier fragment: ${fragment}`);
  }
}

const requiredSessionHelperFragments = [
  "const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';",
  'const SIGN_IN_URL = `${PRODUCTION_ORIGIN}/api/auth/sign-in`;',
  "requireCredential('MYEONGHA_PRODUCTION_MEMBER_EMAIL')",
  "requireCredential('MYEONGHA_PRODUCTION_MEMBER_PASSWORD', { trim: false })",
  "method: 'POST'",
  'body: JSON.stringify({ email, password })',
  "response.status !== 200",
  "body.data.status !== 'authenticated'",
  'const accessToken = session.accessToken;',
  'return Object.freeze({ accessToken });',
];

for (const fragment of requiredSessionHelperFragments) {
  if (!sessionHelper.includes(fragment)) {
    throw new Error(`Missing production Member fresh-session helper contract fragment: ${fragment}`);
  }
}

for (const fragment of ['MYEONGHA_PRODUCTION_MEMBER_BEARER', 'refreshToken', 'localStorage', 'writeFile', 'appendFile']) {
  if (sessionHelper.includes(fragment)) {
    throw new Error(`Forbidden production Member fresh-session helper fragment: ${fragment}`);
  }
}

console.log('MyeongHa production Records current-subject deterministic fresh-session smoke workflow contract verification passed.');
