import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-member-reauth-continuity-smoke.yml';
const liveVerifierPath = 'scripts/verify-production-member-reauth-continuity.mjs';
const sessionHelperPath = 'scripts/production-member-smoke-session.mjs';

const [workflow, liveVerifier, sessionHelper] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(liveVerifierPath, 'utf8'),
  readFile(sessionHelperPath, 'utf8'),
]);

const requiredWorkflowFragments = [
  'workflow_dispatch:',
  "description: 'Type VERIFY_MEMBER_REAUTH_CONTINUITY to run the production Member sign-out and re-sign-in continuity smoke.'",
  'permissions:',
  'contents: read',
  'cancel-in-progress: false',
  'environment: production',
  'DISPATCH_CONFIRM: ${{ inputs.confirm }}',
  'MYEONGHA_PRODUCTION_MEMBER_EMAIL: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EMAIL }}',
  'MYEONGHA_PRODUCTION_MEMBER_PASSWORD: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_PASSWORD }}',
  'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID }}',
  '[[ "$DISPATCH_CONFIRM" == \'VERIFY_MEMBER_REAUTH_CONTINUITY\' ]]',
  'test -n "${MYEONGHA_PRODUCTION_MEMBER_EMAIL:-}"',
  'test -n "${MYEONGHA_PRODUCTION_MEMBER_PASSWORD:-}"',
  'test -n "${MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID:-}"',
  'uses: actions/checkout@v4',
  'uses: actions/setup-node@v4',
  "node-version: '24'",
  'run: node scripts/verify-production-member-reauth-continuity.mjs',
];

for (const fragment of requiredWorkflowFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`Missing production Member reauthentication workflow contract fragment: ${fragment}`);
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
  'MYEONGHA_SAJU_SERVICE_BEARER',
  'SAJU_PRODUCTION_SERVICE_BEARER',
  'SAJU_PRODUCTION_PREVIOUS_SERVICE_BEARER',
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
    throw new Error(`Forbidden production Member reauthentication workflow fragment: ${fragment}`);
  }
}

if ((workflow.match(/workflow_dispatch:/g) ?? []).length !== 1) {
  throw new Error('Production Member reauthentication smoke must expose exactly one workflow_dispatch trigger.');
}

const requiredLiveVerifierFragments = [
  "import { acquireProductionMemberSmokeSession } from './production-member-smoke-session.mjs';",
  "const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';",
  'const SIGN_OUT_URL = `${PRODUCTION_ORIGIN}/api/auth/sign-out`;',
  'const MEMBER_ME_URL = `${PRODUCTION_ORIGIN}/api/me`;',
  'const BIRTH_PROFILE_URL = `${PRODUCTION_ORIGIN}/api/me/birth-profile`;',
  'const SAJU_CALCULATION_URL = `${PRODUCTION_ORIGIN}/api/me/saju/calculation`;',
  "requireSecret('MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID')",
  'const firstSession = await acquireProductionMemberSmokeSession();',
  'await signOutFreshSession(firstSession.accessToken);',
  'const secondSession = await acquireProductionMemberSmokeSession();',
  "Authorization: `Bearer ${accessToken}`",
  "method: 'POST'",
  "body: '{}'",
  'data.signedOut !== true',
  "memberData.subjectKind !== 'member'",
  "memberData.subjectStatus !== 'active'",
  'memberData.subjectId !== expectedSubjectId',
  "birthProfile.profileKind !== 'self'",
  'birthProfile.archivedAt !== null',
  'birthProfile.currentRevision',
  "calculation.schemaVersion !== 'myeongha-saju-production-calculation-ingress-v1'",
  "calculation.kind !== 'saju_calculation_evidence'",
  "calculation.semanticAuthority !== 'calculation_only'",
  'calculation.interpretationAuthorized !== false',
  'calculation.birthRevisionRef !== revisionId',
  'afterReSignIn.subjectId !== beforeSignOut.subjectId',
  'afterReSignIn.birthProfileId !== beforeSignOut.birthProfileId',
  'afterReSignIn.revisionId !== beforeSignOut.revisionId',
  'afterReSignIn.revisionNo !== beforeSignOut.revisionNo',
  'requireNoTokenReflection(accessToken, [memberBody, birthBody, calculationBody], label);',
  "requireNoTokenReflection(accessToken, [body], 'Production Member sign-out');",
  'firstSignIn=200',
  'signOut=200',
  'secondSignIn=200',
  'memberSubjectPreserved=true',
  'birthProfilePreserved=true',
  'birthRevisionPreserved=true',
  'calculationAfterReSignIn=200',
  'authority=calculation_only',
  'cacheControl=no-store',
];

for (const fragment of requiredLiveVerifierFragments) {
  if (!liveVerifier.includes(fragment)) {
    throw new Error(`Missing production Member reauthentication live verifier contract fragment: ${fragment}`);
  }
}

const forbiddenLiveVerifierFragments = [
  'MYEONGHA_PRODUCTION_MEMBER_BEARER',
  'MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_BEARER',
  'MYEONGHA_DATABASE_URL',
  'MYEONGHA_DATABASE_PRINCIPAL',
  'MYEONGHA_SUPABASE_URL',
  'MYEONGHA_SUPABASE_API_KEY',
  'MYEONGHA_SAJU_SERVICE_BEARER',
  'SAJU_PRODUCTION_SERVICE_BEARER',
  'SAJU_PRODUCTION_PREVIOUS_SERVICE_BEARER',
  'process.env.MYEONGHA_PRODUCTION_ORIGIN',
  'process.env.VERCEL',
  'process.env.SUPABASE',
  'localStorage',
  'sessionStorage',
  'writeFile',
  'appendFile',
  'refreshToken',
  'console.log(accessToken',
  'console.error(accessToken',
  'console.log(firstSession',
  'console.error(firstSession',
  'console.log(secondSession',
  'console.error(secondSession',
  'console.log(memberBody',
  'console.error(memberBody',
  'console.log(birthBody',
  'console.error(birthBody',
  'console.log(calculationBody',
  'console.error(calculationBody',
];

for (const fragment of forbiddenLiveVerifierFragments) {
  if (liveVerifier.includes(fragment)) {
    throw new Error(`Forbidden production Member reauthentication live verifier fragment: ${fragment}`);
  }
}

const requiredSessionHelperFragments = [
  "const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';",
  'const SIGN_IN_URL = `${PRODUCTION_ORIGIN}/api/auth/sign-in`;',
  "requireCredential('MYEONGHA_PRODUCTION_MEMBER_EMAIL')",
  "requireCredential('MYEONGHA_PRODUCTION_MEMBER_PASSWORD', { trim: false })",
  'return Object.freeze({ accessToken });',
];

for (const fragment of requiredSessionHelperFragments) {
  if (!sessionHelper.includes(fragment)) {
    throw new Error(`Missing production Member fresh-session helper fragment: ${fragment}`);
  }
}

console.log('MyeongHa production Member reauthentication continuity smoke workflow contract verification passed.');
