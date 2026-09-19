import { readFile } from 'node:fs/promises';

const workflow = await readFile(
  '.github/workflows/production-saju-service-origin-binding.yml',
  'utf8',
);
const runner = await readFile(
  'scripts/operations/run-production-saju-service-origin-binding.sh',
  'utf8',
);
const common = await readFile(
  'scripts/operations/vercel-production-common.sh',
  'utf8',
);

const onSection = workflow.slice(
  workflow.indexOf('on:\n'),
  workflow.indexOf('\npermissions:'),
);

for (const fragment of [
  'name: Production Saju Service Origin Binding',
  'workflow_dispatch:',
  'environment: production',
  'SAJU_SERVICE_ORIGIN_ENV_KEY: MYEONGHA_SAJU_SERVICE_ORIGIN',
  'SAJU_SERVICE_ORIGIN: https://saju-production-anh2svf5aa-as.a.run.app',
  'VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}',
  'run: bash scripts/operations/run-production-saju-service-origin-binding.sh',
]) {
  if (!workflow.includes(fragment)) {
    throw new Error('Missing Saju origin workflow contract fragment: ' + fragment);
  }
}

if (onSection.includes('push:') || onSection.includes('pull_request:') || onSection.includes('schedule:')) {
  throw new Error('Production Saju origin binding must be manual-only.');
}
if (workflow.includes('api.vercel.com')) {
  throw new Error('Production workflow YAML must not embed Vercel orchestration.');
}
if (!runner.includes("[[ \"$GITHUB_REF\" == 'refs/heads/main' ]]")) {
  throw new Error('Saju origin binding must reject non-main workflow_dispatch refs.');
}
if (!runner.includes("[[ \"${DISPATCH_CONFIRM:-}\" == 'BIND_SAJU_ORIGIN' ]]")) {
  throw new Error('Saju origin binding must require explicit confirmation.');
}

for (const fragment of [
  'env?upsert=true&teamId=$VERCEL_TEAM_ID',
  'target: ["production"]',
  'type: "encrypted"',
  '(.target | index("production")) != null',
]) {
  if (!runner.includes(fragment)) {
    throw new Error('Missing Saju origin mutation invariant: ' + fragment);
  }
}

for (const fragment of [
  '(.meta.githubCommitSha // "") == $sha',
  'deploymentId: $deployment_id',
  'meta: {action: "redeploy"}',
  'and (.meta.action // "") == "redeploy"',
  '.capabilities.userData == "ready"',
  '.capabilities.sajuCalculation == "ready"',
]) {
  if (!common.includes(fragment)) {
    throw new Error('Missing governed Vercel orchestration invariant: ' + fragment);
  }
}

const combined = workflow + '\n' + runner + '\n' + common;
for (const fragment of [
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_DB_PASSWORD',
  'MYEONGHA_DATABASE_URL',
  'MYEONGHA_DATABASE_PRINCIPAL',
  'MYEONGHA_SAJU_SERVICE_BEARER',
  'alter role',
  'gcloud run deploy',
  'gcloud run services update',
]) {
  if (combined.includes(fragment)) {
    throw new Error('Forbidden Saju origin authority fragment: ' + fragment);
  }
}

console.log('MyeongHa production Saju service origin binding contract verification passed.');
