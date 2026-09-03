import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-birth-profile-authenticated-create-read-smoke.yml';
const liveVerifierPath = 'scripts/verify-production-birth-profile-authenticated-create-read.mjs';

const [workflow, liveVerifier] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(liveVerifierPath, 'utf8'),
]);

const requiredWorkflowFragments = [
  'workflow_dispatch:',
  "description: 'Type VERIFY_BIRTH_AUTHENTICATED_CREATE_READ to perform the one-time persistent production Birth smoke write.'",
  'permissions:',
  'contents: read',
  'cancel-in-progress: false',
  'environment: production',
  'DISPATCH_CONFIRM: ${{ inputs.confirm }}',
  'MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_BEARER: ${{ secrets.MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_BEARER }}',
  'MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_EXPECTED_SUBJECT_ID: ${{ secrets.MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_EXPECTED_SUBJECT_ID }}',
  '[[ "$DISPATCH_CONFIRM" == \'VERIFY_BIRTH_AUTHENTICATED_CREATE_READ\' ]]',
  'test -n "${MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_BEARER:-}"',
  'test -n "${MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_EXPECTED_SUBJECT_ID:-}"',
  'uses: actions/checkout@v4',
  'uses: actions/setup-node@v4',
  "node-version: '24'",
  'run: node scripts/verify-production-birth-profile-authenticated-create-read.mjs',
];

for (const fragment of requiredWorkflowFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`Missing authenticated Birth smoke workflow contract fragment: ${fragment}`);
  }
}

const forbiddenWorkflowFragments = [
  '\npush:',
  '\npull_request:',
  '\nschedule:',
  'MYEONGHA_PRODUCTION_MEMBER_BEARER',
  'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID',
  'MYEONGHA_DATABASE_URL',
  'MYEONGHA_DATABASE_PRINCIPAL',
  'MYEONGHA_SUPABASE_URL',
  'MYEONGHA_SUPABASE_API_KEY',
  'MYEONGHA_GUEST_FINGERPRINT_SECRET',
  'MYEONGHA_BIRTH_INPUT_HMAC_K1_SECRET',
  'VERCEL_TOKEN',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_DB_PASSWORD',
  'curl ',
  'psql ',
  'vercel deploy',
  'vercel --prod',
  'supabase db',
  'alter role',
  'set -x',
];

for (const fragment of forbiddenWorkflowFragments) {
  if (workflow.includes(fragment)) {
    throw new Error(`Forbidden authenticated Birth smoke workflow fragment: ${fragment}`);
  }
}

if ((workflow.match(/workflow_dispatch:/g) ?? []).length !== 1) {
  throw new Error('Authenticated Birth smoke must expose exactly one workflow_dispatch trigger.');
}

const requiredLiveVerifierFragments = [
  "const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';",
  'const MEMBER_ME_URL = `${PRODUCTION_ORIGIN}/api/me`;',
  'const BIRTH_PROFILES_URL = `${PRODUCTION_ORIGIN}/api/birth-profiles`;',
  "const SMOKE_LABEL = 'production-birth-smoke-v1';",
  "calendarType: 'solar'",
  "birthDate: '2000-01-01'",
  "birthTime: '00:00:00'",
  "sex: 'unspecified'",
  "requireSecret('MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_BEARER')",
  "requireSecret('MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_EXPECTED_SUBJECT_ID')",
  "redirect: 'error'",
  'AbortSignal.timeout(REQUEST_TIMEOUT_MS)',
  "memberBody.data.subjectKind !== 'member'",
  'memberBody.data.subjectId !== expectedSubjectId',
  "memberBody.data.subjectStatus !== 'active'",
  "method: 'POST'",
  "'Content-Type': 'application/json'",
  'create.status !== 201',
  "method: 'GET'",
  'read.status !== 200',
  "data.profileKind !== 'self'",
  'data.birthProfileId !== birthProfileId',
  'data.currentRevision.revisionId !== revisionId',
  "directives.includes('no-store')",
];

for (const fragment of requiredLiveVerifierFragments) {
  if (!liveVerifier.includes(fragment)) {
    throw new Error(`Missing authenticated Birth live verifier contract fragment: ${fragment}`);
  }
}

const forbiddenLiveVerifierFragments = [
  'MYEONGHA_PRODUCTION_MEMBER_BEARER',
  'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID',
  'process.env.MYEONGHA_PRODUCTION_ORIGIN',
  'process.env.VERCEL',
  'process.env.SUPABASE',
  "method: 'DELETE'",
  "method: 'PATCH'",
  "method: 'PUT'",
  'api/session/bootstrap',
  'console.log(bearer',
  'console.error(bearer',
  'console.log(memberBody',
  'console.error(memberBody',
  'console.log(createBody',
  'console.error(createBody',
  'console.log(readBody',
  'console.error(readBody',
];

for (const fragment of forbiddenLiveVerifierFragments) {
  if (liveVerifier.includes(fragment)) {
    throw new Error(`Forbidden authenticated Birth live verifier fragment: ${fragment}`);
  }
}

console.log('MyeongHa production authenticated Birth create/read smoke workflow contract verification passed.');
