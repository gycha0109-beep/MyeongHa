import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-guest-bootstrap-ttl-binding.yml';
const workflow = await readFile(workflowPath, 'utf8');

const requiredFragments = [
  'workflow_dispatch:',
  "description: 'Type BIND_GUEST_TTL to bind the decided Guest authentication TTL without deploying routes.'",
  "description: 'Enter the decided P0-PR-01A Guest authentication TTL in seconds: 604800.'",
  'environment: production',
  'cancel-in-progress: false',
  'DISPATCH_CONFIRM: ${{ inputs.confirm }}',
  'GUEST_SESSION_TTL_SECONDS: ${{ inputs.ttl_seconds }}',
  'DECIDED_GUEST_SESSION_TTL_SECONDS: \'604800\'',
  'VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}',
  'VERCEL_PROJECT_ID: prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP',
  'VERCEL_TEAM_ID: team_xuYA9OhCWlJETaYFOmeVodgS',
  'VERCEL_PROJECT_NAME: myeongha',
  '[[ "$DISPATCH_CONFIRM" == \'BIND_GUEST_TTL\' ]]',
  '[[ "$GUEST_SESSION_TTL_SECONDS" =~ ^[1-9][0-9]*$ ]]',
  '[[ "$GUEST_SESSION_TTL_SECONDS" == "$DECIDED_GUEST_SESSION_TTL_SECONDS" ]]',
  'https://api.vercel.com/v9/projects/$VERCEL_PROJECT_ID?teamId=$VERCEL_TEAM_ID',
  '.id == $id and .name == $name',
  '"MYEONGHA_GUEST_SESSION_TTL_SECONDS"',
  'type: "encrypted"',
  'target: ["production"]',
  'https://api.vercel.com/v10/projects/$VERCEL_PROJECT_ID/env?upsert=true&teamId=$VERCEL_TEAM_ID',
  "jq -e '((.failed // []) | length) == 0'",
  'env_id="$(jq -er',
  'https://api.vercel.com/v1/projects/$VERCEL_PROJECT_ID/env/$env_id?teamId=$VERCEL_TEAM_ID',
  '.value == $ttl',
  'rm -f "$payload_file" "$response_file" "$readback_file"',
  'Decided Guest authentication TTL 604800 was bound and verified in Vercel production.',
  'No deployment or route activation was performed.',
];

for (const fragment of requiredFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`Missing Guest bootstrap TTL binding contract fragment: ${fragment}`);
  }
}

const forbiddenFragments = [
  '\npush:',
  '\npull_request:',
  '\nschedule:',
  'default:',
  'vercel deploy',
  'vercel --prod',
  'api/session/bootstrap',
  'MYEONGHA_DATABASE_URL',
  'MYEONGHA_DATABASE_PRINCIPAL',
  'MYEONGHA_SUPABASE_URL',
  'MYEONGHA_SUPABASE_API_KEY',
  'MYEONGHA_GUEST_FINGERPRINT_SECRET',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_DB_PASSWORD',
  'alter role',
  'service_role',
  'supabase_admin',
  '/env?decrypt=true',
];

for (const fragment of forbiddenFragments) {
  if (workflow.includes(fragment)) {
    throw new Error(`Forbidden Guest bootstrap TTL binding workflow fragment: ${fragment}`);
  }
}

const ttlKeyIndex = workflow.indexOf('key: "MYEONGHA_GUEST_SESSION_TTL_SECONDS"');
if (ttlKeyIndex < 0) {
  throw new Error('Missing Vercel production binding for MYEONGHA_GUEST_SESSION_TTL_SECONDS.');
}
const ttlBindingWindow = workflow.slice(ttlKeyIndex, ttlKeyIndex + 420);
if (!ttlBindingWindow.includes('type: "encrypted"')) {
  throw new Error('Guest session TTL must use an encrypted Vercel environment variable.');
}
if (!ttlBindingWindow.includes('target: ["production"]')) {
  throw new Error('Guest session TTL must target Vercel production only.');
}

const envKeyMatches = [...workflow.matchAll(/key: "(MYEONGHA_[A-Z0-9_]+)"/g)].map(
  (match) => match[1],
);
if (
  envKeyMatches.length !== 1 ||
  envKeyMatches[0] !== 'MYEONGHA_GUEST_SESSION_TTL_SECONDS'
) {
  throw new Error(
    `Guest bootstrap TTL workflow must mutate exactly one MyeongHa environment key; found: ${envKeyMatches.join(', ')}`,
  );
}

if (!workflow.includes('select(.key == "MYEONGHA_GUEST_SESSION_TTL_SECONDS")')) {
  throw new Error('Guest TTL binding must extract only the just-bound environment variable id.');
}
if (!workflow.includes('and (.target | index("production")) != null')) {
  throw new Error('Guest TTL readback must verify the production target.');
}
if (!workflow.includes('and .type == "encrypted"')) {
  throw new Error('Guest TTL readback must verify encrypted storage type.');
}

console.log('MyeongHa production Guest bootstrap TTL binding/readback contract verification passed.');
