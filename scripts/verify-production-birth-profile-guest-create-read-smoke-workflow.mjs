import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-birth-profile-guest-create-read-smoke.yml';
const liveVerifierPath = 'scripts/verify-production-birth-profile-guest-create-read.mjs';

const [workflow, liveVerifier] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(liveVerifierPath, 'utf8'),
]);

const requiredWorkflowFragments = [
  'workflow_dispatch:',
  "description: 'Type VERIFY_GUEST_BIRTH_CREATE_READ_ONCE to create one persistent synthetic Guest Birth fixture. Do not rerun after success.'",
  'permissions:',
  'actions: read',
  'contents: read',
  'cancel-in-progress: false',
  'environment: production',
  'DISPATCH_CONFIRM: ${{ inputs.confirm }}',
  'GH_TOKEN: ${{ github.token }}',
  '[[ "$DISPATCH_CONFIRM" == \'VERIFY_GUEST_BIRTH_CREATE_READ_ONCE\' ]]',
  'actions/workflows/production-birth-profile-guest-create-read-smoke.yml/runs?event=workflow_dispatch&status=success&per_page=1',
  "--jq '.total_count'",
  '[[ "$prior_successes" == \'0\' ]]',
  'uses: actions/checkout@v4',
  'uses: actions/setup-node@v4',
  "node-version: '24'",
  'run: node scripts/verify-production-birth-profile-guest-create-read.mjs',
];

for (const fragment of requiredWorkflowFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`Missing Guest Birth smoke workflow contract fragment: ${fragment}`);
  }
}

const forbiddenWorkflowFragments = [
  '\npush:',
  '\npull_request:',
  '\nschedule:',
  'secrets.',
  'MYEONGHA_PRODUCTION_MEMBER_BEARER',
  'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID',
  'MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_BEARER',
  'MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_EXPECTED_SUBJECT_ID',
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
    throw new Error(`Forbidden Guest Birth smoke workflow fragment: ${fragment}`);
  }
}

if ((workflow.match(/workflow_dispatch:/g) ?? []).length !== 1) {
  throw new Error('Guest Birth smoke must expose exactly one workflow_dispatch trigger.');
}

const requiredLiveVerifierFragments = [
  "const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';",
  'const BOOTSTRAP_URL = `${PRODUCTION_ORIGIN}/api/session/bootstrap`;',
  'const MEMBER_ME_URL = `${PRODUCTION_ORIGIN}/api/me`;',
  'const BIRTH_PROFILES_URL = `${PRODUCTION_ORIGIN}/api/birth-profiles`;',
  "const SMOKE_LABEL = 'production-guest-birth-smoke-v1';",
  "calendarType: 'solar'",
  "birthDate: '2000-01-01'",
  "birthTime: '00:00:00'",
  'timeKnown: true',
  'isLeapMonth: false',
  "sex: 'unspecified'",
  "redirect: 'error'",
  'AbortSignal.timeout(REQUEST_TIMEOUT_MS)',
  "method: 'POST'",
  "body: '{}'",
  "bootstrap.status !== 200",
  "bootstrapData.kind !== 'guest'",
  "bootstrapData.guestSession.bearerToken",
  "method: 'GET'",
  "currentSubject.status !== 200",
  "currentSubjectBody.data.subjectKind !== 'guest'",
  'currentSubjectBody.data.subjectId !== subjectId',
  "currentSubjectBody.data.subjectStatus !== 'active'",
  "'Content-Type': 'application/json'",
  'create.status !== 201',
  'createBody.data.revisionNo !== 1',
  'read.status !== 200',
  "data.profileKind !== 'self'",
  'data.birthProfileId !== birthProfileId',
  'data.currentRevision.revisionId !== revisionId',
  'data.currentRevision.revisionNo !== 1',
  'data.currentRevision.input[key] !== expected',
  'data.revisions.length !== 1',
  "directives.includes('no-store')",
];

for (const fragment of requiredLiveVerifierFragments) {
  if (!liveVerifier.includes(fragment)) {
    throw new Error(`Missing Guest Birth live verifier contract fragment: ${fragment}`);
  }
}

const forbiddenLiveVerifierFragments = [
  'process.env.',
  'MYEONGHA_PRODUCTION_MEMBER_BEARER',
  'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID',
  'MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_BEARER',
  'MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_EXPECTED_SUBJECT_ID',
  'MYEONGHA_DATABASE_URL',
  'MYEONGHA_DATABASE_PRINCIPAL',
  'MYEONGHA_SUPABASE_URL',
  'MYEONGHA_SUPABASE_API_KEY',
  'MYEONGHA_GUEST_FINGERPRINT_SECRET',
  'MYEONGHA_BIRTH_INPUT_HMAC_K1_SECRET',
  "method: 'DELETE'",
  "method: 'PATCH'",
  "method: 'PUT'",
  'console.log(bearer',
  'console.error(bearer',
  'console.log(bootstrapBody',
  'console.error(bootstrapBody',
  'console.log(currentSubjectBody',
  'console.error(currentSubjectBody',
  'console.log(createBody',
  'console.error(createBody',
  'console.log(readBody',
  'console.error(readBody',
];

for (const fragment of forbiddenLiveVerifierFragments) {
  if (liveVerifier.includes(fragment)) {
    throw new Error(`Forbidden Guest Birth live verifier fragment: ${fragment}`);
  }
}

console.log('MyeongHa production Guest Birth create/read smoke workflow contract verification passed.');
