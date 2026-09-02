import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const workflowPath = '.github/workflows/production-guest-bootstrap-smoke-owner-bridge.yml';
const liveSmokePath = 'scripts/verify-production-guest-bootstrap.mjs';

const [workflow, liveSmoke] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(liveSmokePath, 'utf8'),
]);

const requiredWorkflowFragments = [
  'issue_comment:',
  'types: [edited]',
  'permissions:',
  'contents: read',
  'issues: read',
  'pull-requests: read',
  'cancel-in-progress: false',
  'environment: production',
  "EXPECTED_ISSUE_NUMBER: '329'",
  "EXPECTED_COMMENT_ID: '5514124938'",
  'EXPECTED_COMMAND: SMOKE_GUEST_BOOTSTRAP_V1_CA503767_7A9E4C21',
  'EXPECTED_ROUTE_MERGE_SHA: ca503767d89553dd31026b3a995bee788e304adf',
  'EXPECTED_ROUTE_BLOB_SHA: 5b9707781a5481d9e1c12ad3d6c0848dfccf67f3',
  "EXPECTED_ACTIVATION_PR_NUMBER: '334'",
  "github.event.issue.number == 329",
  "github.event.comment.id == 5514124938",
  "github.event.comment.user.login == 'gycha0109-beep'",
  "github.event.comment.author_association == 'OWNER'",
  "github.actor == 'gycha0109-beep'",
  "github.event.comment.body == 'SMOKE_GUEST_BOOTSTRAP_V1_CA503767_7A9E4C21'",
  'GH_READ_TOKEN: ${{ github.token }}',
  'uses: actions/checkout@v4',
  'git ls-remote origin refs/heads/main',
  'test "$remote_main" = "$GITHUB_SHA"',
  'git merge-base --is-ancestor "$EXPECTED_ROUTE_MERGE_SHA" HEAD',
  'git rev-parse HEAD:api/session/bootstrap.ts',
  '$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/pulls/$EXPECTED_ACTIVATION_PR_NUMBER',
  '.merge_commit_sha == $merged',
  'uses: actions/setup-node@v4',
  "node-version: '24'",
  'run: node scripts/verify-production-guest-bootstrap.mjs',
];

for (const fragment of requiredWorkflowFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`Missing production Guest smoke bridge workflow fragment: ${fragment}`);
  }
}

const forbiddenWorkflowFragments = [
  '\n  workflow_dispatch:',
  '\n  push:',
  '\n  pull_request:',
  '\n  schedule:',
  'VERCEL_TOKEN',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_DB_PASSWORD',
  'MYEONGHA_DATABASE_URL',
  'MYEONGHA_DATABASE_PRINCIPAL',
  'MYEONGHA_SUPABASE_API_KEY',
  'MYEONGHA_GUEST_FINGERPRINT_SECRET',
  'MYEONGHA_GUEST_SESSION_TTL_SECONDS',
  'actions/upload-artifact',
  'actions/cache',
  'set -x',
  'curl -v',
  'curl --verbose',
  'tee ',
  'psql ',
  'vercel ',
  'supabase ',
];

for (const fragment of forbiddenWorkflowFragments) {
  if (workflow.includes(fragment)) {
    throw new Error(`Forbidden production Guest smoke bridge workflow fragment: ${fragment}`);
  }
}

if ((workflow.match(/issue_comment:/g) ?? []).length !== 1) {
  throw new Error('Production Guest smoke bridge must expose exactly one issue_comment trigger.');
}

const requiredLiveSmokeFragments = [
  "const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';",
  "const HEALTH_URL = `${PRODUCTION_ORIGIN}/api/health`;",
  "const MEMBER_ME_URL = `${PRODUCTION_ORIGIN}/api/me`;",
  "const GUEST_BOOTSTRAP_URL = `${PRODUCTION_ORIGIN}/api/session/bootstrap`;",
  'const EXPECTED_GUEST_TTL_SECONDS = 604800;',
  "redirect: 'error'",
  'AbortSignal.timeout(REQUEST_TIMEOUT_MS)',
  "directives.includes('no-store')",
  "bootstrapGet.status !== 405",
  "unauthenticatedMe.status !== 401",
  "body: '{'",
  "malformed.status !== 400",
  "subjectId: '00000000-0000-4000-8000-000000000000'",
  "clientControlled.status !== 400",
  "myeongha_guest_v1_invalid_smoke_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "invalidOpaque.status !== 401",
  "eyJhbGciOiJub25lIn0.eyJzdWIiOiJndWVzdC1zbW9rZSJ9.invalidsignature",
  "invalidJwt.status !== 401",
  "fresh.status !== 200",
  "freshBearer.startsWith('myeongha_guest_v1_')",
  'EXPECTED_GUEST_TTL_SECONDS * 1000',
  'Authorization: `Bearer ${freshBearer}`',
  "authenticatedMe.status !== 200",
  "authenticatedMeBody.data.subjectKind !== 'guest'",
  "authenticatedMeBody.data.subjectStatus !== 'active'",
  "reused.status !== 200",
  'reusedEnvelope.data.subjectId !== freshSubjectId',
  'reusedEnvelope.data.guestSession.guestSessionId !== freshGuestSessionId',
  'reusedEnvelope.data.guestSession.bearerToken !== null',
  'ttl=604800',
];

for (const fragment of requiredLiveSmokeFragments) {
  if (!liveSmoke.includes(fragment)) {
    throw new Error(`Missing production Guest live smoke contract fragment: ${fragment}`);
  }
}

const forbiddenLiveSmokeFragments = [
  'process.env',
  'node:fs',
  'writeFile',
  'appendFile',
  'createWriteStream',
  'console.log(freshBearer',
  'console.error(freshBearer',
  'console.log(freshEnvelope',
  'console.error(freshEnvelope',
  'console.log(authenticatedMeBody',
  'console.error(authenticatedMeBody',
  'console.log(reusedEnvelope',
  'console.error(reusedEnvelope',
  'console.log(await',
  'console.error(await',
  'JSON.stringify(freshEnvelope',
  'JSON.stringify(authenticatedMeBody',
  'JSON.stringify(reusedEnvelope',
];

for (const fragment of forbiddenLiveSmokeFragments) {
  if (liveSmoke.includes(fragment)) {
    throw new Error(`Forbidden production Guest live smoke fragment: ${fragment}`);
  }
}

if ((liveSmoke.match(/console\.log\(/g) ?? []).length !== 1) {
  throw new Error('Production Guest live smoke must emit exactly one sanitized success log.');
}

const syntax = spawnSync(process.execPath, ['--check', liveSmokePath], {
  encoding: 'utf8',
});
if (syntax.status !== 0) {
  throw new Error('Production Guest live smoke script failed Node syntax verification.');
}

console.log('MyeongHa production Guest bootstrap one-shot smoke bridge contract verification passed.');
