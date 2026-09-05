import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-chat-current-subject-smoke.yml';
const triggerPath = '.github/production-chat-current-subject-smoke.trigger';
const discoveryPath = 'scripts/run-production-member-chat-read-smoke.sh';
const liveVerifierPath = 'scripts/verify-production-chat-current-subject.mjs';
const sessionHelperPath = 'scripts/production-member-smoke-session.mjs';

const [workflow, trigger, discovery, liveVerifier, sessionHelper] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(triggerPath, 'utf8'),
  readFile(discoveryPath, 'utf8'),
  readFile(liveVerifierPath, 'utf8'),
  readFile(sessionHelperPath, 'utf8'),
]);

const requiredWorkflowFragments = [
  'workflow_dispatch:',
  "description: 'Type VERIFY_CHAT_CURRENT_SUBJECT to run the production Chat current-subject smoke.'",
  'push:',
  '- main',
  "- '.github/production-chat-current-subject-smoke.trigger'",
  'permissions:',
  'contents: read',
  'cancel-in-progress: false',
  'environment: production',
  'SUPABASE_PROJECT_ID: cnsfpcdiyofqvhpcegfc',
  'SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}',
  'SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}',
  'MYEONGHA_PRODUCTION_MEMBER_EMAIL: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EMAIL }}',
  'MYEONGHA_PRODUCTION_MEMBER_PASSWORD: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_PASSWORD }}',
  'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID }}',
  "if [[ \"${{ github.event_name }}\" == 'workflow_dispatch' ]]",
  '[[ "$DISPATCH_CONFIRM" == \'VERIFY_CHAT_CURRENT_SUBJECT\' ]]',
  '[[ "${{ github.ref }}" == \'refs/heads/main\' ]]',
  'trigger_value="$(tr -d \'\\r\' < .github/production-chat-current-subject-smoke.trigger)"',
  '[[ "$trigger_value" =~ ^fire-[0-9]{4}-[0-9]{2}-[0-9]{2}-v[0-9]+$ ]]',
  'uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4',
  'uses: actions/setup-node@v4',
  "node-version: '24'",
  'sudo apt-get install -y postgresql-client',
  'https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_ID/config/database/pooler',
  'run: bash scripts/run-production-member-chat-read-smoke.sh',
];

for (const fragment of requiredWorkflowFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`Missing production Chat smoke workflow contract fragment: ${fragment}`);
  }
}

for (const fragment of [
  '\npull_request:',
  '\nschedule:',
  'MYEONGHA_PRODUCTION_MEMBER_BEARER',
  'VERCEL_TOKEN',
  'vercel deploy',
  'supabase db push',
  'supabase migration',
  'set -x',
]) {
  if (workflow.includes(fragment)) {
    throw new Error(`Forbidden production Chat smoke workflow fragment: ${fragment}`);
  }
}

if ((workflow.match(/workflow_dispatch:/g) ?? []).length !== 1) {
  throw new Error('Production Chat smoke must expose exactly one workflow_dispatch trigger.');
}
if ((workflow.match(/\n  push:/g) ?? []).length !== 1) {
  throw new Error('Production Chat smoke must expose exactly one governed push trigger.');
}
if (!/^fire-[0-9]{4}-[0-9]{2}-[0-9]{2}-v[0-9]+\s*$/u.test(trigger)) {
  throw new Error('Production Chat smoke trigger must use the governed fire-date-version format.');
}

const requiredDiscoveryFragments = [
  'begin read only;',
  "select current_setting('transaction_read_only');",
  "set local application_name = 'myeongha_member_chat_read_smoke_discovery';",
  "where t.subject_id = :'expected_subject_id'::uuid",
  "t.status = 'active'",
  "t.thread_type = 'single_character'",
  't.active_content_release_id is not null',
  't.active_content_bundle_id is not null',
  "p.role = 'primary'",
  'p.left_at is null',
  'p.content_bundle_id = t.active_content_bundle_id',
  'ownedThreadCount=%s',
  'eligibleThreadCount=%s',
  'auditMode=explicit_read_only',
  'export MYEONGHA_PRODUCTION_CHAT_THREAD_ID="$chat_thread_id"',
  'export MYEONGHA_PRODUCTION_CHAT_EXPECTED_CHARACTER_ID="$chat_character_id"',
  'export MYEONGHA_PRODUCTION_CHAT_EXPECTED_RELEASE_ID="$chat_release_id"',
  'export MYEONGHA_PRODUCTION_CHAT_EXPECTED_BUNDLE_ID="$chat_bundle_id"',
  'node scripts/verify-production-chat-current-subject.mjs',
];

for (const fragment of requiredDiscoveryFragments) {
  if (!discovery.includes(fragment)) {
    throw new Error(`Missing production Chat read-only discovery contract fragment: ${fragment}`);
  }
}

if ((discovery.match(/begin read only;/g) ?? []).length < 3) {
  throw new Error('Production Chat discovery must perform every database probe inside explicit read-only transactions.');
}

const mutationPattern = /\b(?:insert|update|delete|alter|drop|truncate|create|grant|revoke|merge|call)\b/giu;
const mutationMatches = discovery.match(mutationPattern) ?? [];
if (mutationMatches.length > 0) {
  throw new Error(`Production Chat discovery contains forbidden database mutation keyword: ${mutationMatches[0]}`);
}

for (const fragment of [
  'set -x',
  'productionCharacterId=',
  'productionThreadId=',
  'echo "$chat_thread_id"',
  'echo "$chat_character_id"',
  'printf "$chat_thread_id"',
  'printf "$chat_character_id"',
  'MYEONGHA_PRODUCTION_MEMBER_BEARER',
]) {
  if (discovery.includes(fragment)) {
    throw new Error(`Forbidden production Chat discovery fragment: ${fragment}`);
  }
}

const requiredLiveVerifierFragments = [
  "import { acquireProductionMemberSmokeSession } from './production-member-smoke-session.mjs';",
  "const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';",
  'const MEMBER_ME_URL = `${PRODUCTION_ORIGIN}/api/me`;',
  "requireSecret('MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID')",
  "requireSecret('MYEONGHA_PRODUCTION_CHAT_THREAD_ID')",
  "requireSecret('MYEONGHA_PRODUCTION_CHAT_EXPECTED_CHARACTER_ID')",
  "requireSecret('MYEONGHA_PRODUCTION_CHAT_EXPECTED_RELEASE_ID')",
  "requireSecret('MYEONGHA_PRODUCTION_CHAT_EXPECTED_BUNDLE_ID')",
  'await acquireProductionMemberSmokeSession()',
  "redirect: 'error'",
  'AbortSignal.timeout(REQUEST_TIMEOUT_MS)',
  'Authorization: `Bearer ${session.accessToken}`',
  "memberData.subjectKind !== 'member'",
  "memberData.subjectStatus !== 'active'",
  'memberData.subjectId !== expectedSubjectId',
  'await verifyUnauthenticatedFailClosed(chatUrl)',
  'chatResponse.status !== 200',
  'data.threadId !== expectedThreadId',
  'data.characterId !== expectedCharacterId',
  'data.contentReleaseId !== expectedReleaseId',
  'data.contentBundleId !== expectedBundleId',
  "requireArray('Production Chat messages', value)",
  'requireNoTokenReflection(',
  'memberSignIn=200',
  'memberSubjectMatch=true',
  'ownedThread=true',
  'chatUnauthenticated=401',
  'chat=200',
  'characterBindingMatch=true',
  'releaseBindingMatch=true',
  'bundleBindingMatch=true',
  'streamReadable=true',
  'cacheControl=no-store',
];

for (const fragment of requiredLiveVerifierFragments) {
  if (!liveVerifier.includes(fragment)) {
    throw new Error(`Missing production Chat live verifier contract fragment: ${fragment}`);
  }
}

for (const fragment of [
  'MYEONGHA_PRODUCTION_MEMBER_BEARER',
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
  'console.log(chatBody',
  'console.error(chatBody',
  'console.log(expectedThreadId',
  'console.log(expectedCharacterId',
  'writeFile',
  'appendFile',
  'localStorage',
  'refreshToken',
]) {
  if (liveVerifier.includes(fragment)) {
    throw new Error(`Forbidden production Chat live verifier fragment: ${fragment}`);
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

console.log('MyeongHa production Chat current-subject deterministic read-only discovery + fresh-session smoke workflow contract verification passed.');
