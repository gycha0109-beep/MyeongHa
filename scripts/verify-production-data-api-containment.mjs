import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-data-api-containment.yml';
const runnerPath = 'scripts/run-production-data-api-containment.sh';

execFileSync('bash', ['-n', runnerPath], { stdio: 'inherit' });

const [workflow, runner] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(runnerPath, 'utf8'),
]);

const requiredWorkflowFragments = [
  'name: Production Data API Surface Containment',
  'workflow_dispatch:',
  'type: choice',
  '- contain',
  '- rollback',
  "contain: DISABLE_PRODUCT_DATA_API / rollback: RESTORE_PRODUCT_DATA_API",
  'permissions:\n  contents: read',
  'cancel-in-progress: false',
  'SUPABASE_PROJECT_ID: cnsfpcdiyofqvhpcegfc',
  'environment: production',
  'SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}',
  'MYEONGHA_PRODUCTION_MEMBER_BEARER: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_BEARER }}',
  'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID }}',
  'test -n "${SUPABASE_ACCESS_TOKEN:-}"',
  'test -n "${MYEONGHA_PRODUCTION_MEMBER_BEARER:-}"',
  'test -n "${MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID:-}"',
  'actions/setup-node@v4',
  "node-version: '24'",
  'run: bash scripts/run-production-data-api-containment.sh',
  'https://myeongha.vercel.app/api/health',
  'node scripts/verify-production-member-me.mjs',
  'if: always()',
  'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1',
  'retention-days: 14',
];

for (const fragment of requiredWorkflowFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`Missing production Data API containment workflow fragment: ${fragment}`);
  }
}

const requiredRunnerFragments = [
  "baseline_schema='public,graphql_public'",
  "contained_schema='pg_pgrst_no_exposed_schemas'",
  "[[ \"$DISPATCH_CONFIRM\" == 'DISABLE_PRODUCT_DATA_API' ]]",
  "[[ \"$DISPATCH_CONFIRM\" == 'RESTORE_PRODUCT_DATA_API' ]]",
  'if [[ "$before_schema" == "$expected_after" ]]',
  'elif [[ "$before_schema" != "$expected_before" ]]',
  'Refusing Data API containment mutation because production db_schema drifted',
  'https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_ID/postgrest',
  "jq -n --arg db_schema \"$expected_after\" '{db_schema: $db_schema}'",
  '-X PATCH',
  "[[ \"$patch_http_status\" == '200' ]]",
  'read_postgrest_config "$post_raw"',
  '[[ "$after_schema" == "$expected_after" ]]',
  'pre_non_schema="$(jq -S \'del(.db_schema)\' "$snapshot_dir/pre_config.json")"',
  'post_non_schema="$(jq -S \'del(.db_schema)\' "$snapshot_dir/post_config.json")"',
  '[[ "$pre_non_schema" == "$post_non_schema" ]]',
  '[[ "$after_schema" != *\'public\'* ]]',
  '[[ "$after_schema" != *\'graphql_public\'* ]]',
  'mutation_scope=management_api_postgrest_db_schema_only',
  'sha256sum pre_config.json post_config.json containment_metadata.txt > SHA256SUMS',
  'sha256sum --check SHA256SUMS',
  'rm -f "$pre_raw" "$patch_raw" "$post_raw" "$request_body"',
  'has("jwt_secret")',
];

for (const fragment of requiredRunnerFragments) {
  if (!runner.includes(fragment)) {
    throw new Error(`Missing production Data API containment runner fragment: ${fragment}`);
  }
}

for (const forbiddenTrigger of ['\npush:', '\npull_request:', '\nschedule:']) {
  if (workflow.includes(forbiddenTrigger)) {
    throw new Error(`Production Data API containment must remain manual-only: ${forbiddenTrigger}`);
  }
}

const mutationStepIndex = workflow.indexOf('run: bash scripts/run-production-data-api-containment.sh');
for (const preflightFragment of [
  'test -n "${SUPABASE_ACCESS_TOKEN:-}"',
  'test -n "${MYEONGHA_PRODUCTION_MEMBER_BEARER:-}"',
  'test -n "${MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID:-}"',
]) {
  const preflightIndex = workflow.indexOf(preflightFragment);
  if (preflightIndex < 0 || preflightIndex > mutationStepIndex) {
    throw new Error(`Production containment credential preflight must occur before mutation: ${preflightFragment}`);
  }
}

const memberSmokeIndex = workflow.indexOf('node scripts/verify-production-member-me.mjs');
if (memberSmokeIndex <= mutationStepIndex) {
  throw new Error('Governed Member /api/me smoke must run after the Data API transition.');
}

const patchCount = [...runner.matchAll(/-X PATCH/g)].length;
if (patchCount !== 1) {
  throw new Error(`Expected exactly one Management API PATCH primitive, found ${patchCount}.`);
}

const forbiddenRunnerFragments = [
  'psql ',
  'supabase db push',
  'supabase migration',
  'api-keys?reveal=true',
  'pg_authid',
  'rolpassword',
  '-X POST',
  '-X PUT',
  '-X DELETE',
  'alter table',
  'alter role',
  'create schema',
  'drop schema',
  'grant ',
  'revoke ',
  'insert into',
  'update ',
  'delete from',
  'truncate ',
];

const lowerRunner = runner.toLowerCase();
for (const fragment of forbiddenRunnerFragments) {
  if (lowerRunner.includes(fragment.toLowerCase())) {
    throw new Error(`Forbidden production containment mutation surface: ${fragment}`);
  }
}

const requestBodyMatch = runner.match(/jq -n --arg db_schema[^\n]+\n?/g) ?? [];
if (requestBodyMatch.length !== 1) {
  throw new Error('Containment must build exactly one db_schema-only Management API request body.');
}

if (runner.includes('jwt_secret:') || runner.includes('.jwt_secret')) {
  throw new Error('Containment runner must not materialize the PostgREST jwt_secret.');
}

for (const rawFile of ['$pre_raw', '$patch_raw', '$post_raw', '$request_body']) {
  const artifactCopyPattern = new RegExp(`(?:cp|mv)[^\\n]*${rawFile.replace('$', '\\$')}[^\\n]*snapshot_dir`, 'i');
  if (artifactCopyPattern.test(runner)) {
    throw new Error(`Raw Management API material must not be copied into the artifact: ${rawFile}`);
  }
}

console.log('MyeongHa guarded production Data API containment contract verification passed.');
