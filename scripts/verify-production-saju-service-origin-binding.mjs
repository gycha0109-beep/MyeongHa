import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-saju-service-origin-binding.yml';
const workflow = await readFile(workflowPath, 'utf8');

const requiredFragments = [
  'name: Production Saju Service Origin Binding',
  'workflow_dispatch:',
  "description: 'Type BIND_SAJU_ORIGIN to upsert the authoritative Saju production origin and redeploy production.'",
  'push:',
  'branches:',
  '- main',
  '- .github/workflows/production-saju-service-origin-binding.yml',
  'environment: production',
  'concurrency:',
  'group: production-saju-service-origin-binding',
  'cancel-in-progress: false',
  'VERCEL_PROJECT_ID: prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP',
  'VERCEL_TEAM_ID: team_xuYA9OhCWlJETaYFOmeVodgS',
  'VERCEL_PROJECT_NAME: myeongha',
  'CANONICAL_PRODUCTION_HOST: myeongha.vercel.app',
  'SAJU_SERVICE_ORIGIN_ENV_KEY: MYEONGHA_SAJU_SERVICE_ORIGIN',
  'SAJU_SERVICE_ORIGIN: https://saju-production-anh2svf5aa-as.a.run.app',
  'VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}',
  '[[ "$DISPATCH_CONFIRM" == \'BIND_SAJU_ORIGIN\' ]]',
  '[[ "$GITHUB_REF" == \'refs/heads/main\' ]]',
  "parsed.protocol !== 'https:'",
  "parsed.pathname !== '/'",
  'parsed.search !==',
  'parsed.hash !==',
  'parsed.origin !== value',
  'https://api.vercel.com/v9/projects/$VERCEL_PROJECT_ID?teamId=$VERCEL_TEAM_ID',
  '.id == $id and .name == $name',
  'target: ["production"]',
  'type: "encrypted"',
  'env?upsert=true&teamId=$VERCEL_TEAM_ID',
  "jq -e '((.failed // []) | length) == 0'",
  'https://api.vercel.com/v10/projects/$VERCEL_PROJECT_ID/env?teamId=$VERCEL_TEAM_ID',
  '(.target | index("production")) != null',
  'https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&target=production&limit=20&teamId=$VERCEL_TEAM_ID',
  '(.meta.githubCommitSha // "") == $sha',
  'echo "deployment_id=$source_id" >> "$GITHUB_OUTPUT"',
  "'{deploymentId: $deployment_id, target: \"production\"}'",
  'forceNew=1&skipAutoDetectionConfirmation=1&teamId=$VERCEL_TEAM_ID',
  "-w '%{http_code}'",
  'Vercel redeploy request failed: HTTP $http_code code=$error_code',
  'https://api.vercel.com/v13/deployments/$REDEPLOYMENT_ID?teamId=$VERCEL_TEAM_ID',
  '(.projectId // "") == $project_id',
  'and (.target // "") == "production"',
  'and (.meta.githubCommitSha // "") == $sha',
  'https://api.vercel.com/v2/deployments/$REDEPLOYMENT_ID/aliases?teamId=$VERCEL_TEAM_ID',
  'any(.aliases[]; .alias == $alias)',
  'https://$CANONICAL_PRODUCTION_HOST/api/readiness',
  '.capabilities.userData == "ready"',
  '.capabilities.sajuCalculation == "ready"',
];

for (const fragment of requiredFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`Missing production Saju origin binding contract fragment: ${fragment}`);
  }
}

const forbiddenFragments = [
  '\npull_request:',
  '\nschedule:',
  'decrypt=true',
  '/promote/',
  '-X DELETE',
  '--request DELETE',
  'vercel env rm',
  'vercel deploy',
  'vercel --prod',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_DB_PASSWORD',
  'MYEONGHA_DATABASE_URL',
  'MYEONGHA_DATABASE_PRINCIPAL',
  'MYEONGHA_SUPABASE_URL',
  'MYEONGHA_SUPABASE_API_KEY',
  'MYEONGHA_GUEST_FINGERPRINT_SECRET',
  'MYEONGHA_BIRTH_INPUT_HMAC_K1_SECRET',
  'MYEONGHA_SAJU_SERVICE_BEARER',
  'service_role',
  'alter role',
  'gcloud run deploy',
  'gcloud run services update',
  "'{deploymentId: $deployment_id}'",
  'https://api.vercel.com/v13/deployments?teamId=$VERCEL_TEAM_ID',
];

for (const fragment of forbiddenFragments) {
  if (workflow.includes(fragment)) {
    throw new Error(`Forbidden production Saju origin binding workflow fragment: ${fragment}`);
  }
}

const myeonghaEnvNames = new Set(
  [...workflow.matchAll(/MYEONGHA_[A-Z0-9_]+/g)].map((match) => match[0]),
);
if (
  myeonghaEnvNames.size !== 1 ||
  !myeonghaEnvNames.has('MYEONGHA_SAJU_SERVICE_ORIGIN')
) {
  throw new Error(
    `Saju origin workflow may reference exactly one MyeongHa environment key; found: ${[
      ...myeonghaEnvNames,
    ].join(', ')}`,
  );
}

const origin = 'https://saju-production-anh2svf5aa-as.a.run.app';
const originOccurrences = workflow.split(origin).length - 1;
if (originOccurrences !== 1) {
  throw new Error(`Expected the authoritative public Cloud Run origin exactly once; found ${originOccurrences}.`);
}

const upsertIndex = workflow.indexOf('env?upsert=true&teamId=$VERCEL_TEAM_ID');
const exactRevisionIndex = workflow.indexOf('(.meta.githubCommitSha // "") == $sha');
const redeployIndex = workflow.indexOf('forceNew=1&skipAutoDetectionConfirmation=1&teamId=$VERCEL_TEAM_ID');
const readinessIndex = workflow.indexOf('https://$CANONICAL_PRODUCTION_HOST/api/readiness');
if (
  upsertIndex < 0 ||
  exactRevisionIndex < upsertIndex ||
  redeployIndex < exactRevisionIndex ||
  readinessIndex < redeployIndex
) {
  throw new Error(
    'Saju origin workflow must bind first, resolve the exact-main deployment, force a fresh redeploy, then verify readiness.',
  );
}

const pushIndex = workflow.indexOf('push:');
const pushPathIndex = workflow.indexOf('- .github/workflows/production-saju-service-origin-binding.yml');
if (pushIndex < 0 || pushPathIndex < pushIndex) {
  throw new Error('Automatic production execution must be scoped to the binding workflow path on main.');
}

const dispatchGuardIndex = workflow.indexOf("[[ \"$DISPATCH_CONFIRM\" == 'BIND_SAJU_ORIGIN' ]]");
if (dispatchGuardIndex < 0) {
  throw new Error('Manual Saju origin binding must require the explicit confirmation phrase.');
}

console.log('MyeongHa production Saju service origin binding/redeploy contract verification passed.');
