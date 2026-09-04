import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-saju-current-subject-smoke.yml';
const liveVerifierPath = 'scripts/verify-production-saju-current-subject.mjs';

const [workflow, liveVerifier] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(liveVerifierPath, 'utf8'),
]);

const requiredWorkflowFragments = [
  'workflow_dispatch:',
  "description: 'Type VERIFY_SAJU_CURRENT_SUBJECT to run the production current-subject Saju calculation smoke.'",
  'permissions:',
  'contents: read',
  'cancel-in-progress: false',
  'environment: production',
  'DISPATCH_CONFIRM: ${{ inputs.confirm }}',
  'MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_BEARER: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_BEARER }}',
  'MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_EXPECTED_SUBJECT_ID: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID }}',
  '[[ "$DISPATCH_CONFIRM" == \'VERIFY_SAJU_CURRENT_SUBJECT\' ]]',
  'test -n "${MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_BEARER:-}"',
  'test -n "${MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_EXPECTED_SUBJECT_ID:-}"',
  'uses: actions/checkout@v4',
  'uses: actions/setup-node@v4',
  "node-version: '24'",
  'run: node scripts/verify-production-saju-current-subject.mjs',
];

for (const fragment of requiredWorkflowFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`Missing production Saju smoke workflow contract fragment: ${fragment}`);
  }
}

const forbiddenWorkflowFragments = [
  '\npush:',
  '\npull_request:',
  '\nschedule:',
  'MYEONGHA_SAJU_SERVICE_ORIGIN',
  'MYEONGHA_SAJU_SERVICE_BEARER',
  'SAJU_PRODUCTION_SERVICE_BEARER',
  'SAJU_PRODUCTION_PREVIOUS_SERVICE_BEARER',
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
    throw new Error(`Forbidden production Saju smoke workflow fragment: ${fragment}`);
  }
}

if ((workflow.match(/workflow_dispatch:/g) ?? []).length !== 1) {
  throw new Error('Production Saju smoke must expose exactly one workflow_dispatch trigger.');
}

const requiredLiveVerifierFragments = [
  "const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';",
  'const MEMBER_ME_URL = `${PRODUCTION_ORIGIN}/api/me`;',
  'const SAJU_CALCULATION_URL = `${PRODUCTION_ORIGIN}/api/me/saju/calculation`;',
  "requireSecret('MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_BEARER')",
  "requireSecret('MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_EXPECTED_SUBJECT_ID')",
  "redirect: 'error'",
  'AbortSignal.timeout(REQUEST_TIMEOUT_MS)',
  "memberData.subjectKind !== 'member'",
  'memberData.subjectId !== expectedSubjectId',
  "memberData.subjectStatus !== 'active'",
  "method: 'POST'",
  'calculationResponse.status !== 200',
  "'myeongha-saju-production-calculation-ingress-v1'",
  "'saju_calculation_evidence'",
  "'calculation_only'",
  "'myeonghwa-production-calculation-http-v1'",
  "'myeonghwa-production-calculation-runtime-v1'",
  "'myeonghwa-production-civil-midnight-v1'",
  "'myeonghwa-production-calculation-default-authorization-v1'",
  "'docs/decisions/ADR-0006-production-calculation-default-v1.md'",
  "'myeonghwa-production-calculation-policy-v1'",
  "'myeonghwa/production/civil-midnight-v1'",
  "requireNoStore(calculationResponse, 'Production current-subject Saju calculation')",
];

for (const fragment of requiredLiveVerifierFragments) {
  if (!liveVerifier.includes(fragment)) {
    throw new Error(`Missing production Saju live verifier contract fragment: ${fragment}`);
  }
}

const forbiddenLiveVerifierFragments = [
  'MYEONGHA_SAJU_SERVICE_ORIGIN',
  'MYEONGHA_SAJU_SERVICE_BEARER',
  'SAJU_PRODUCTION_SERVICE_BEARER',
  'SAJU_PRODUCTION_PREVIOUS_SERVICE_BEARER',
  'process.env.MYEONGHA_PRODUCTION_ORIGIN',
  'process.env.VERCEL',
  'process.env.SUPABASE',
  'body:',
  "method: 'DELETE'",
  "method: 'PATCH'",
  "method: 'PUT'",
  'api/session/bootstrap',
  'console.log(bearer',
  'console.error(bearer',
  'console.log(memberBody',
  'console.error(memberBody',
  'console.log(calculationBody',
  'console.error(calculationBody',
];

for (const fragment of forbiddenLiveVerifierFragments) {
  if (liveVerifier.includes(fragment)) {
    throw new Error(`Forbidden production Saju live verifier fragment: ${fragment}`);
  }
}

console.log('MyeongHa production current-subject Saju smoke workflow contract verification passed.');
