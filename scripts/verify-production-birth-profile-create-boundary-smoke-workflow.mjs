import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-birth-profile-create-boundary-smoke.yml';
const liveVerifierPath = 'scripts/verify-production-birth-profile-create-boundary.mjs';

const [workflow, liveVerifier] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(liveVerifierPath, 'utf8'),
]);

const requiredWorkflowFragments = [
  'workflow_dispatch:',
  "description: 'Type VERIFY_BIRTH_CREATE_BOUNDARY to run the non-mutating production Birth create boundary smoke.'",
  'permissions:',
  'contents: read',
  'cancel-in-progress: false',
  'environment: production',
  'DISPATCH_CONFIRM: ${{ inputs.confirm }}',
  '[[ "$DISPATCH_CONFIRM" == \'VERIFY_BIRTH_CREATE_BOUNDARY\' ]]',
  'uses: actions/checkout@v4',
  'uses: actions/setup-node@v4',
  "node-version: '24'",
  'run: node scripts/verify-production-birth-profile-create-boundary.mjs',
];

for (const fragment of requiredWorkflowFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`Missing Birth create boundary smoke workflow contract fragment: ${fragment}`);
  }
}

const forbiddenWorkflowFragments = [
  '\npush:',
  '\npull_request:',
  '\nschedule:',
  'MYEONGHA_DATABASE_URL',
  'MYEONGHA_DATABASE_PRINCIPAL',
  'MYEONGHA_SUPABASE_URL',
  'MYEONGHA_SUPABASE_API_KEY',
  'MYEONGHA_GUEST_FINGERPRINT_SECRET',
  'MYEONGHA_BIRTH_INPUT_HMAC_K1_SECRET',
  'MYEONGHA_PRODUCTION_MEMBER_BEARER',
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
    throw new Error(`Forbidden Birth create boundary smoke workflow fragment: ${fragment}`);
  }
}

if ((workflow.match(/workflow_dispatch:/g) ?? []).length !== 1) {
  throw new Error('Birth create boundary smoke must expose exactly one workflow_dispatch trigger.');
}

const requiredLiveVerifierFragments = [
  "const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';",
  "const BIRTH_PROFILE_URL = `${PRODUCTION_ORIGIN}/api/birth-profiles`;",
  "method: 'POST'",
  "'Content-Type': 'application/json'",
  'body: JSON.stringify(createBody)',
  "rootPost.status !== 401",
  "rootPostBody.error.code !== 'AUTH_REQUIRED'",
  "rootPostBody.meta.apiContractVersion !== 'v0.9'",
  "rootGet.status !== 404",
  "dynamicPost.status !== 405",
  "dynamicPost.headers.get('allow')",
  "redirect: 'error'",
  'AbortSignal.timeout(REQUEST_TIMEOUT_MS)',
  "directives.includes('no-store')",
];

for (const fragment of requiredLiveVerifierFragments) {
  if (!liveVerifier.includes(fragment)) {
    throw new Error(`Missing Birth create boundary live verifier contract fragment: ${fragment}`);
  }
}

const forbiddenLiveVerifierFragments = [
  'Authorization',
  'process.env.',
  'api/session/bootstrap',
  'MYEONGHA_',
  'console.log(rootPostBody',
  'console.error(rootPostBody',
  'console.log(createBody',
  'console.error(createBody',
];

for (const fragment of forbiddenLiveVerifierFragments) {
  if (liveVerifier.includes(fragment)) {
    throw new Error(`Forbidden Birth create boundary live verifier fragment: ${fragment}`);
  }
}

console.log('MyeongHa production Birth Profile create boundary smoke workflow contract verification passed.');
