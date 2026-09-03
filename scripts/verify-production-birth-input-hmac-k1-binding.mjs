import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-birth-input-hmac-k1-binding.yml';
const workflow = await readFile(workflowPath, 'utf8');

const requiredFragments = [
  'name: Production Birth Input HMAC K1 Binding',
  'workflow_dispatch:',
  "description: 'Type BIND_BIRTH_HMAC_K1 to create the production Birth input HMAC k1 exactly once without deploying routes.'",
  'environment: production',
  'concurrency:',
  'group: production-birth-input-hmac-k1-binding',
  'cancel-in-progress: false',
  'DISPATCH_CONFIRM: ${{ inputs.confirm }}',
  'VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}',
  'VERCEL_PROJECT_ID: prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP',
  'VERCEL_TEAM_ID: team_xuYA9OhCWlJETaYFOmeVodgS',
  'VERCEL_PROJECT_NAME: myeongha',
  'BIRTH_INPUT_HMAC_ENV_KEY: MYEONGHA_BIRTH_INPUT_HMAC_K1_SECRET',
  '[[ "$DISPATCH_CONFIRM" == \'BIND_BIRTH_HMAC_K1\' ]]',
  'https://api.vercel.com/v9/projects/$VERCEL_PROJECT_ID?teamId=$VERCEL_TEAM_ID',
  '.id == $id and .name == $name',
  'https://api.vercel.com/v10/projects/$VERCEL_PROJECT_ID/env?teamId=$VERCEL_TEAM_ID',
  '(.envs | type) == "array"',
  '[.envs[] | select(.key == $key)] | length',
  "if [[ \"$existing_count\" != '0' ]]; then",
  'Refusing to overwrite or rotate it.',
  'openssl rand -hex 32',
  '[[ "$birth_hmac_k1_secret" =~ ^[0-9a-f]{64}$ ]]',
  'echo "::add-mask::$birth_hmac_k1_secret"',
  'key: $key',
  'value: $secret',
  'type: "sensitive"',
  'target: ["production"]',
  '-X POST',
  "jq -e '((.failed // []) | length) == 0'",
  'https://api.vercel.com/v1/projects/$VERCEL_PROJECT_ID/env/$env_id?teamId=$VERCEL_TEAM_ID',
  '.key == $key',
  'and .type == "sensitive"',
  'and (.target | length) == 1',
  'and .target[0] == "production"',
  'rm -f "$payload_file" "$response_file" "$readback_file"',
  'Production Birth input HMAC k1 was bound and metadata-verified.',
  'No deployment or route activation was performed.',
];

for (const fragment of requiredFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`Missing Birth input HMAC k1 binding contract fragment: ${fragment}`);
  }
}

const forbiddenFragments = [
  '\npush:',
  '\npull_request:',
  '\nschedule:',
  'default:',
  'upsert=true',
  'decrypt=true',
  '/env?decrypt=true',
  '.value ==',
  '.value !=',
  'vercel deploy',
  'vercel --prod',
  'api/birth-profiles',
  'MYEONGHA_DATABASE_URL',
  'MYEONGHA_DATABASE_PRINCIPAL',
  'MYEONGHA_SUPABASE_URL',
  'MYEONGHA_SUPABASE_API_KEY',
  'MYEONGHA_GUEST_FINGERPRINT_SECRET',
  'MYEONGHA_GUEST_SESSION_TTL_SECONDS',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_DB_PASSWORD',
  'alter role',
  'service_role',
  'supabase_admin',
];

for (const fragment of forbiddenFragments) {
  if (workflow.includes(fragment)) {
    throw new Error(`Forbidden Birth input HMAC k1 binding workflow fragment: ${fragment}`);
  }
}

const myeonghaEnvNames = new Set(
  [...workflow.matchAll(/MYEONGHA_[A-Z0-9_]+/g)].map((match) => match[0]),
);
if (
  myeonghaEnvNames.size !== 1 ||
  !myeonghaEnvNames.has('MYEONGHA_BIRTH_INPUT_HMAC_K1_SECRET')
) {
  throw new Error(
    `Birth HMAC workflow may reference exactly one MyeongHa environment key; found: ${[
      ...myeonghaEnvNames,
    ].join(', ')}`,
  );
}

const postEndpoint =
  'https://api.vercel.com/v10/projects/$VERCEL_PROJECT_ID/env?teamId=$VERCEL_TEAM_ID';
const postEndpointOccurrences = workflow.split(postEndpoint).length - 1;
if (postEndpointOccurrences !== 2) {
  throw new Error(
    `Expected exactly one list call and one create call to the governed Vercel env endpoint; found ${postEndpointOccurrences} references.`,
  );
}

const postIndex = workflow.indexOf('-X POST');
const createEndpointIndex = workflow.indexOf(postEndpoint, postIndex);
if (postIndex < 0 || createEndpointIndex < postIndex) {
  throw new Error('Birth HMAC binding must POST to the governed Vercel environment endpoint.');
}

const sensitiveBindingIndex = workflow.indexOf('type: "sensitive"');
const productionTargetIndex = workflow.indexOf('target: ["production"]');
if (sensitiveBindingIndex < 0 || productionTargetIndex < sensitiveBindingIndex) {
  throw new Error('Birth HMAC k1 must be stored as a production-only sensitive Vercel variable.');
}

const existingKeyGuardIndex = workflow.indexOf('[.envs[] | select(.key == $key)] | length');
if (existingKeyGuardIndex < 0 || existingKeyGuardIndex > postIndex) {
  throw new Error('Birth HMAC k1 existing-key guard must run before the create request.');
}

const secretGenerationIndex = workflow.indexOf('openssl rand -hex 32');
const maskIndex = workflow.indexOf('echo "::add-mask::$birth_hmac_k1_secret"');
const payloadIndex = workflow.indexOf('value: $secret');
if (
  secretGenerationIndex < 0 ||
  maskIndex < secretGenerationIndex ||
  payloadIndex < maskIndex
) {
  throw new Error('Birth HMAC k1 must be generated server-side and masked before payload construction.');
}

const readbackIndex = workflow.indexOf(
  'https://api.vercel.com/v1/projects/$VERCEL_PROJECT_ID/env/$env_id?teamId=$VERCEL_TEAM_ID',
);
if (readbackIndex < postIndex) {
  throw new Error('Birth HMAC k1 metadata readback must occur after creation.');
}
const readbackWindow = workflow.slice(readbackIndex, readbackIndex + 900);
if (!readbackWindow.includes('.key == $key')) {
  throw new Error('Birth HMAC k1 readback must verify the exact environment key.');
}
if (!readbackWindow.includes('and .type == "sensitive"')) {
  throw new Error('Birth HMAC k1 readback must verify sensitive storage type.');
}
if (
  !readbackWindow.includes('and (.target | length) == 1') ||
  !readbackWindow.includes('and .target[0] == "production"')
) {
  throw new Error('Birth HMAC k1 readback must verify an exact production-only target.');
}
if (readbackWindow.includes('.value')) {
  throw new Error('Birth HMAC k1 readback must never inspect secret value material.');
}

console.log('MyeongHa production Birth input HMAC k1 one-time binding contract verification passed.');
