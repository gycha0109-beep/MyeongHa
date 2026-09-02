import { readFile } from 'node:fs/promises';

const workflowPath =
  '.github/workflows/production-guest-bootstrap-ttl-owner-bridge.yml';
const workflow = await readFile(workflowPath, 'utf8');

const requiredFragments = [
  'name: Production Guest Bootstrap TTL Owner Bridge',
  'issue_comment:',
  'types: [edited]',
  'contents: read',
  'issues: read',
  'pull-requests: read',
  'group: production-guest-bootstrap-ttl-binding',
  'environment: production',
  "DECIDED_GUEST_SESSION_TTL_SECONDS: '604800'",
  "EXPECTED_PR_NUMBER: '329'",
  "EXPECTED_COMMENT_ID: '5514124938'",
  'EXPECTED_ROUTE_HEAD_SHA: ba062462fe2b8914913c6b82406ff2310c3cf21e',
  'EXPECTED_COMMAND: BIND_GUEST_TTL_V1_PR329_BA062462_604800',
  'github.event.issue.number == 329',
  'github.event.comment.id == 5514124938',
  "github.event.comment.user.login == 'gycha0109-beep'",
  "github.event.comment.author_association == 'OWNER'",
  "github.event.comment.body == 'BIND_GUEST_TTL_V1_PR329_BA062462_604800'",
  'github.event.issue.pull_request != null',
  'GH_READ_TOKEN: ${{ github.token }}',
  'VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}',
  '.state == "open"',
  'and .draft == true',
  'and .base.ref == "main"',
  'and .base.sha == $main',
  'and .head.sha == $head',
  '/compare/$main_sha...$EXPECTED_ROUTE_HEAD_SHA',
  '.behind_by == 0',
  '"api/session/bootstrap.ts"',
  '"test/api-session-bootstrap-runtime.test.ts"',
  'VERCEL_PROJECT_ID: prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP',
  'VERCEL_TEAM_ID: team_xuYA9OhCWlJETaYFOmeVodgS',
  'VERCEL_PROJECT_NAME: myeongha',
  '"MYEONGHA_GUEST_SESSION_TTL_SECONDS"',
  'type: "encrypted"',
  'target: ["production"]',
  'https://api.vercel.com/v10/projects/$VERCEL_PROJECT_ID/env?upsert=true&teamId=$VERCEL_TEAM_ID',
  'https://api.vercel.com/v1/projects/$VERCEL_PROJECT_ID/env/$env_id?teamId=$VERCEL_TEAM_ID',
  '.value == $ttl',
  'No route activation was performed.',
];

for (const fragment of requiredFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`Missing one-shot Guest TTL bridge contract fragment: ${fragment}`);
  }
}

const forbiddenFragments = [
  '\n  push:',
  '\n  pull_request:',
  '\n  schedule:',
  'workflow_dispatch:',
  'api/session/bootstrap.ts\n',
  'vercel deploy',
  'vercel --prod',
  'MYEONGHA_DATABASE_URL',
  'MYEONGHA_DATABASE_PRINCIPAL',
  'MYEONGHA_SUPABASE_URL',
  'MYEONGHA_SUPABASE_API_KEY',
  'MYEONGHA_GUEST_FINGERPRINT_SECRET',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_DB_PASSWORD',
  'service_role',
  'supabase_admin',
  'alter role',
  'pull-requests: write',
  'issues: write',
  'contents: write',
];

for (const fragment of forbiddenFragments) {
  if (workflow.includes(fragment)) {
    throw new Error(`Forbidden one-shot Guest TTL bridge workflow fragment: ${fragment}`);
  }
}

const triggerBlock = workflow.slice(
  workflow.indexOf('on:'),
  workflow.indexOf('\n\npermissions:'),
);
if (!triggerBlock.includes('issue_comment:') || !triggerBlock.includes('types: [edited]')) {
  throw new Error('One-shot bridge must trigger only from an edited issue comment.');
}

if ((workflow.match(/MYEONGHA_GUEST_SESSION_TTL_SECONDS/g) ?? []).length !== 2) {
  throw new Error('One-shot bridge must mutate only the approved Guest TTL environment key.');
}

console.log('MyeongHa one-shot production Guest TTL owner bridge contract verification passed.');
