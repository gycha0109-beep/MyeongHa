import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-member-chat-open-reuse-smoke.yml';
const liveVerifierPath = 'scripts/verify-production-member-chat-open-reuse.mjs';
const sessionHelperPath = 'scripts/production-member-smoke-session.mjs';
const pinnedReadVerifierPath = 'scripts/verify-production-chat-current-subject.mjs';

const [workflow, liveVerifier, sessionHelper, pinnedReadVerifier] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(liveVerifierPath, 'utf8'),
  readFile(sessionHelperPath, 'utf8'),
  readFile(pinnedReadVerifierPath, 'utf8'),
]);

const requiredWorkflowFragments = [
  'workflow_dispatch:',
  "description: 'Type VERIFY_MEMBER_CHAT_OPEN_REUSE to perform the governed Production Member Chat open/reuse smoke.'",
  "description: 'Canonical launch Character ID to open in Production.'",
  'permissions:',
  'contents: read',
  'cancel-in-progress: false',
  'environment: production',
  'MYEONGHA_PRODUCTION_CHAT_OPEN_CHARACTER_ID: ${{ inputs.character_id }}',
  'MYEONGHA_PRODUCTION_MEMBER_EMAIL: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EMAIL }}',
  'MYEONGHA_PRODUCTION_MEMBER_PASSWORD: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_PASSWORD }}',
  'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID }}',
  '[[ "$DISPATCH_CONFIRM" == \'VERIFY_MEMBER_CHAT_OPEN_REUSE\' ]]',
  'seyeon|yeoul|seorin|rahyeon|mira|taegyeom|yunho|doyun|baekheon)',
  'uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4',
  'uses: actions/setup-node@v4',
  "node-version: '24'",
  'run: node scripts/verify-production-member-chat-open-reuse.mjs',
];
for (const fragment of requiredWorkflowFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`Missing production Member Chat open/reuse workflow contract fragment: ${fragment}`);
  }
}

for (const fragment of [
  '\npush:',
  '\nschedule:',
  'pull_request:',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_DB_PASSWORD',
  'MYEONGHA_PRODUCTION_MEMBER_BEARER',
  'VERCEL_TOKEN',
  'supabase db push',
  'supabase migration',
  'vercel deploy',
  'set -x',
]) {
  if (workflow.includes(fragment)) {
    throw new Error(`Forbidden production Member Chat open/reuse workflow fragment: ${fragment}`);
  }
}

if ((workflow.match(/workflow_dispatch:/g) ?? []).length !== 1) {
  throw new Error('Production Member Chat open/reuse smoke must expose exactly one manual workflow_dispatch trigger.');
}

const requiredLiveVerifierFragments = [
  "import { acquireProductionMemberSmokeSession } from './production-member-smoke-session.mjs';",
  "const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';",
  'const CHAT_OPEN_URL = `${PRODUCTION_ORIGIN}/api/chat`;',
  'const MEMBER_ME_URL = `${PRODUCTION_ORIGIN}/api/me`;',
  "requireSecret('MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID')",
  "requireSecret('MYEONGHA_PRODUCTION_CHAT_OPEN_CHARACTER_ID')",
  "method: 'POST'",
  'body: JSON.stringify({ characterId })',
  "redirect: 'error'",
  'AbortSignal.timeout(REQUEST_TIMEOUT_MS)',
  'Authorization: `Bearer ${accessToken}`',
  'data.subjectKind !== \'member\'',
  'data.subjectStatus !== \'active\'',
  'data.subjectId !== expectedSubjectId',
  'response.status !== 401',
  "error.code !== 'AUTH_REQUIRED'",
  'response.status !== 200',
  "['characterId', 'created', 'threadId']",
  'data.characterId !== characterId',
  'JSON.stringify(body).includes(expectedSubjectId)',
  "'activeContentReleaseId'",
  "'activeContentBundleId'",
  "'contentReleaseId'",
  "'contentBundleId'",
  'second.threadId !== first.threadId',
  'second.created !== false',
  'third.threadId !== first.threadId',
  'third.created !== false',
  'contentPinMetadataHidden=true',
  'cacheControl=no-store',
];
for (const fragment of requiredLiveVerifierFragments) {
  if (!liveVerifier.includes(fragment)) {
    throw new Error(`Missing production Member Chat open/reuse live verifier fragment: ${fragment}`);
  }
}

if ((liveVerifier.match(/await acquireProductionMemberSmokeSession\(\)/g) ?? []).length !== 2) {
  throw new Error('Production Member Chat open/reuse verifier must acquire exactly two fresh Member sessions for re-auth continuity.');
}

for (const fragment of [
  'MYEONGHA_PRODUCTION_MEMBER_BEARER',
  'process.env.MYEONGHA_PRODUCTION_ORIGIN',
  'process.env.VERCEL',
  'process.env.SUPABASE',
  "method: 'DELETE'",
  "method: 'PATCH'",
  "method: 'PUT'",
  'writeFile',
  'appendFile',
  'localStorage',
  'refreshToken',
  'console.log(session.accessToken',
  'console.error(session.accessToken',
  'console.log(first.body',
  'console.log(second.body',
  'console.log(third.body',
  'console.log(first.threadId',
  'console.log(second.threadId',
  'console.log(third.threadId',
]) {
  if (liveVerifier.includes(fragment)) {
    throw new Error(`Forbidden production Member Chat open/reuse live verifier fragment: ${fragment}`);
  }
}

const requiredSessionHelperFragments = [
  "const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';",
  'const SIGN_IN_URL = `${PRODUCTION_ORIGIN}/api/auth/sign-in`;',
  "requireCredential('MYEONGHA_PRODUCTION_MEMBER_EMAIL')",
  "requireCredential('MYEONGHA_PRODUCTION_MEMBER_PASSWORD', { trim: false })",
  "method: 'POST'",
  'return Object.freeze({ accessToken });',
];
for (const fragment of requiredSessionHelperFragments) {
  if (!sessionHelper.includes(fragment)) {
    throw new Error(`Missing production Member fresh-session helper contract fragment: ${fragment}`);
  }
}

for (const fragment of [
  "method: 'GET'",
  'data.contentReleaseId !== expectedReleaseId',
  'data.contentBundleId !== expectedBundleId',
  'data.characterId !== expectedCharacterId',
  'data.threadId !== expectedThreadId',
]) {
  if (!pinnedReadVerifier.includes(fragment)) {
    throw new Error(`Existing production Chat pinned read verifier contract regressed: ${fragment}`);
  }
}
if (pinnedReadVerifier.includes("method: 'POST'")) {
  throw new Error('Production Chat pinned read verifier must remain read-only at the HTTP layer.');
}

console.log('MyeongHa production Member Chat manual open/reuse + re-auth smoke contract verification passed; DB-authoritative release/bundle pinning remains delegated to the separate read-only current-subject smoke.');
