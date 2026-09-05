import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-saju-current-subject-smoke.yml';
const liveVerifierPath = 'scripts/verify-production-saju-current-subject.mjs';
const sessionHelperPath = 'scripts/production-member-smoke-session.mjs';

const [workflow, liveVerifier, sessionHelper] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(liveVerifierPath, 'utf8'),
  readFile(sessionHelperPath, 'utf8'),
]);

const requiredWorkflowFragments = [
  'workflow_dispatch:',
  "description: 'Type VERIFY_SAJU_CURRENT_SUBJECT to run the production current-subject Saju calculation smoke.'",
  'permissions:',
  'contents: read',
  'cancel-in-progress: false',
  'environment: production',
  'DISPATCH_CONFIRM: ${{ inputs.confirm }}',
  'MYEONGHA_PRODUCTION_MEMBER_EMAIL: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EMAIL }}',
  'MYEONGHA_PRODUCTION_MEMBER_PASSWORD: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_PASSWORD }}',
  'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID }}',
  '[[ "$DISPATCH_CONFIRM" == \'VERIFY_SAJU_CURRENT_SUBJECT\' ]]',
  'test -n "${MYEONGHA_PRODUCTION_MEMBER_EMAIL:-}"',
  'test -n "${MYEONGHA_PRODUCTION_MEMBER_PASSWORD:-}"',
  'test -n "${MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID:-}"',
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
  'MYEONGHA_PRODUCTION_MEMBER_BEARER',
  'MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_BEARER',
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
  "import { acquireProductionMemberSmokeSession } from './production-member-smoke-session.mjs';",
  "const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';",
  'const MEMBER_ME_URL = `${PRODUCTION_ORIGIN}/api/me`;',
  'const BIRTH_PROFILE_URL = `${PRODUCTION_ORIGIN}/api/me/birth-profile`;',
  'const SAJU_CALCULATION_URL = `${PRODUCTION_ORIGIN}/api/me/saju/calculation`;',
  "requireSecret('MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID')",
  'await acquireProductionMemberSmokeSession()',
  "redirect: 'error'",
  'AbortSignal.timeout(REQUEST_TIMEOUT_MS)',
  'Authorization: `Bearer ${accessToken}`',
  "memberData.subjectKind !== 'member'",
  'memberData.subjectId !== expectedSubjectId',
  "memberData.subjectStatus !== 'active'",
  'birthProfileResponse.status !== 200',
  'birthProfileData.birthProfile',
  "birthProfile.profileKind !== 'self'",
  'birthProfile.archivedAt !== null',
  'birthProfile.currentRevision',
  'matchingCurrentRevisions.length !== 1',
  "requireNoStore(birthProfileResponse, 'Production Saju smoke current Birth Profile')",
  'function buildStableEvidence({ calculation, source, snapshot, policy, pillars, completeness, provenance })',
  'contentHash: source.contentHash',
  'calculationHash: snapshot.calculationHash',
  'function canonicalize(value)',
  'function stableSerialize(value)',
  'function validateCalculationBody(calculationBody, label)',
  'async function requestCalculation(label)',
  "method: 'POST'",
  "'myeongha-saju-production-calculation-ingress-v1'",
  "'saju_calculation_evidence'",
  "'calculation_only'",
  "requireExact('calculation.birthRevisionRef', calculation.birthRevisionRef, currentRevision.revisionId)",
  "'myeonghwa-production-calculation-http-v1'",
  "'myeonghwa-production-calculation-runtime-v1'",
  "'myeonghwa-production-civil-midnight-v1'",
  "'myeonghwa-production-calculation-default-authorization-v1'",
  "'docs/decisions/ADR-0006-production-calculation-default-v1.md'",
  "'myeonghwa-production-calculation-policy-v1'",
  "'myeonghwa/production/civil-midnight-v1'",
  "const firstCalculation = await requestCalculation('Production current-subject Saju calculation first');",
  "const repeatCalculation = await requestCalculation('Production current-subject Saju calculation repeat');",
  'stableSerialize(firstCalculation.stableEvidence) !== stableSerialize(repeatCalculation.stableEvidence)',
  'JSON.stringify(memberBody).includes(accessToken)',
  'JSON.stringify(birthProfileBody).includes(accessToken)',
  'JSON.stringify(firstCalculation.body).includes(accessToken)',
  'JSON.stringify(repeatCalculation.body).includes(accessToken)',
  'memberSignIn=200',
  'birthProfilePresent=true',
  'birthRevisionMatch=true',
  'calculationFirst=200',
  'calculationRepeat=200',
  'deterministicRepeat=true',
];

for (const fragment of requiredLiveVerifierFragments) {
  if (!liveVerifier.includes(fragment)) {
    throw new Error(`Missing production Saju live verifier contract fragment: ${fragment}`);
  }
}

if ((liveVerifier.match(/await requestCalculation\(/g) ?? []).length !== 2) {
  throw new Error('Production Saju live verifier must execute exactly two governed calculation requests.');
}

const stableEvidenceStart = liveVerifier.indexOf('function buildStableEvidence');
const stableEvidenceEnd = liveVerifier.indexOf('\nfunction canonicalize', stableEvidenceStart);
if (stableEvidenceStart < 0 || stableEvidenceEnd <= stableEvidenceStart) {
  throw new Error('Production Saju stable evidence projection boundary is missing.');
}
const stableEvidenceProjection = liveVerifier.slice(stableEvidenceStart, stableEvidenceEnd);
for (const volatileFragment of ['requestId', 'serverTime', 'snapshotId', 'createdAt']) {
  if (stableEvidenceProjection.includes(volatileFragment)) {
    throw new Error(`Volatile field leaked into deterministic Saju evidence projection: ${volatileFragment}`);
  }
}

const requestCalculationStart = liveVerifier.indexOf('async function requestCalculation(label)');
const requestCalculationEnd = liveVerifier.indexOf('\nconst firstCalculation =', requestCalculationStart);
if (requestCalculationStart < 0 || requestCalculationEnd <= requestCalculationStart) {
  throw new Error('Production Saju calculation request boundary is missing.');
}
const calculationRequestContract = liveVerifier.slice(requestCalculationStart, requestCalculationEnd);
if (calculationRequestContract.includes('body:')) {
  throw new Error('Production current-subject Saju calculation request must not send a request body.');
}

const forbiddenLiveVerifierFragments = [
  'MYEONGHA_PRODUCTION_MEMBER_BEARER',
  'MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_BEARER',
  'MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_EXPECTED_SUBJECT_ID',
  'MYEONGHA_SAJU_SERVICE_ORIGIN',
  'MYEONGHA_SAJU_SERVICE_BEARER',
  'SAJU_PRODUCTION_SERVICE_BEARER',
  'SAJU_PRODUCTION_PREVIOUS_SERVICE_BEARER',
  'process.env.MYEONGHA_PRODUCTION_ORIGIN',
  'process.env.VERCEL',
  'process.env.SUPABASE',
  "method: 'DELETE'",
  "method: 'PATCH'",
  "method: 'PUT'",
  'api/session/bootstrap',
  'console.log(accessToken',
  'console.error(accessToken',
  'console.log(memberBody',
  'console.error(memberBody',
  'console.log(birthProfileBody',
  'console.error(birthProfileBody',
  'console.log(firstCalculation',
  'console.error(firstCalculation',
  'console.log(repeatCalculation',
  'console.error(repeatCalculation',
];

for (const fragment of forbiddenLiveVerifierFragments) {
  if (liveVerifier.includes(fragment)) {
    throw new Error(`Forbidden production Saju live verifier fragment: ${fragment}`);
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

console.log('MyeongHa production current-subject Saju deterministic fresh-session smoke workflow contract verification passed.');
