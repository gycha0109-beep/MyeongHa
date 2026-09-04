import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-data-api-containment.yml';
const runnerPath = 'scripts/run-production-data-api-containment.sh';
const runtimeSmokePath = 'scripts/verify-production-data-api-containment-guest-runtime.mjs';

const [workflow, runner, runtimeSmoke] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(runnerPath, 'utf8'),
  readFile(runtimeSmokePath, 'utf8'),
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
  'test -n "${SUPABASE_ACCESS_TOKEN:-}"',
  'Set up Node 24 for governed runtime smoke',
  "node-version: '24'",
  'Bootstrap and preflight governed Guest canonical-subject path',
  'CONTAINMENT_RUNTIME_SMOKE_MODE: bootstrap',
  'RUNTIME_SMOKE_STATE_PATH: ${{ runner.temp }}/myeongha-data-api-containment-runtime-smoke.json',
  'run: node scripts/verify-production-data-api-containment-guest-runtime.mjs',
  'run: bash scripts/run-production-data-api-containment.sh',
  'https://myeongha.vercel.app/api/health',
  'Verify governed Guest canonical-subject path after transition',
  'CONTAINMENT_RUNTIME_SMOKE_MODE: verify',
  'Remove runtime smoke credential material',
  'rm -f "${{ runner.temp }}/myeongha-data-api-containment-runtime-smoke.json"',
  'if: always()',
  'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1',
  'retention-days: 14',
];

for (const fragment of requiredWorkflowFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`Missing production Data API containment workflow fragment: ${fragment}`);
  }
}

for (const forbiddenWorkflowFragment of [
  'MYEONGHA_PRODUCTION_MEMBER_BEARER',
  'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID',
  'SUPABASE_DB_PASSWORD',
  'RUNTIME_DB_PRINCIPAL',
  'API_EXECUTION_ROLE',
  'Install PostgreSQL client',
  'Resolve governed production pooler endpoint',
  'verify-production-data-api-containment-direct-db.sh',
  'verify-production-member-me.mjs',
]) {
  if (workflow.includes(forbiddenWorkflowFragment)) {
    throw new Error(`Containment must not depend on invalid preflight material: ${forbiddenWorkflowFragment}`);
  }
}

const requiredRunnerFragments = [
  "baseline_schema='public,graphql_public'",
  "contained_schema_request='pg_pgrst_no_exposed_schemas'",
  'is_contained_schema()',
  '[[ -z "$schema" || "$schema" == "$contained_schema_request" ]]',
  'is_expected_before_schema()',
  'is_expected_after_schema()',
  "expected_after_label='disabled'",
  'patch_schema="$contained_schema_request"',
  "[[ \"$DISPATCH_CONFIRM\" == 'DISABLE_PRODUCT_DATA_API' ]]",
  "[[ \"$DISPATCH_CONFIRM\" == 'RESTORE_PRODUCT_DATA_API' ]]",
  'if is_expected_after_schema "$before_schema"; then',
  'elif ! is_expected_before_schema "$before_schema"; then',
  'Refusing Data API containment mutation because production db_schema drifted',
  'https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_ID/postgrest',
  "jq -n --arg db_schema \"$patch_schema\" '{db_schema: $db_schema}'",
  '-X PATCH',
  "[[ \"$patch_http_status\" == '200' ]]",
  'read_postgrest_config "$post_raw"',
  'if ! is_expected_after_schema "$after_schema"; then',
  'Data API containment post-state did not match expected state',
  'pre_non_schema="$(jq -S \'del(.db_schema)\' "$snapshot_dir/pre_config.json")"',
  'post_non_schema="$(jq -S \'del(.db_schema)\' "$snapshot_dir/post_config.json")"',
  '[[ "$pre_non_schema" == "$post_non_schema" ]]',
  '[[ "$after_schema" != *\'public\'* ]]',
  '[[ "$after_schema" != *\'graphql_public\'* ]]',
  'request_db_schema=$patch_schema',
  'expected_after_db_schema=$expected_after_label',
  'mutation_scope=management_api_postgrest_db_schema_only',
  'sha256sum pre_config.json post_config.json containment_metadata.txt > SHA256SUMS',
  'sha256sum --check SHA256SUMS',
  'rm -f "$pre_raw" "$patch_raw" "$post_raw" "$request_body"',
  'has("jwt_secret")',
  'try_sanitize_config()',
  'write_patch_failure_evidence()',
  'failure_post_config.json',
  "post_read_state='unavailable'",
  "observed_after_schema='unverified'",
  "state_change='unknown'",
  "post_read_state='captured'",
  "state_change='unchanged'",
  'elif is_expected_after_schema "$observed_after_schema"; then',
  "state_change='expected_after_observed'",
  "state_change='unexpected_drift'",
  'echo "post_read_state=$post_read_state"',
  'echo "observed_after_db_schema=$observed_after_schema"',
  'echo "state_change=$state_change"',
  'failure_files=(pre_config.json containment_failure.txt)',
  'failure_files+=(failure_post_config.json)',
  'sha256sum "${failure_files[@]}" > SHA256SUMS',
  "write_patch_failure_evidence 'transport_error' 'unavailable'",
  "write_patch_failure_evidence 'management_api_rejected' \"$patch_http_status\"",
];

for (const fragment of requiredRunnerFragments) {
  if (!runner.includes(fragment)) {
    throw new Error(`Missing production Data API containment runner fragment: ${fragment}`);
  }
}

const requiredRuntimeSmokeFragments = [
  "const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';",
  'const BOOTSTRAP_URL = `${PRODUCTION_ORIGIN}/api/session/bootstrap`;',
  'const MEMBER_ME_URL = `${PRODUCTION_ORIGIN}/api/me`;',
  "mode !== 'bootstrap' && mode !== 'verify'",
  'fetchCanonical(BOOTSTRAP_URL',
  "method: 'POST'",
  'fetchCanonical(MEMBER_ME_URL',
  "method: 'GET'",
  "directives.includes('no-store')",
  "body.meta.apiContractVersion !== 'v0.9'",
  "body.data.kind !== 'guest'",
  "body.data.subjectKind !== 'guest'",
  "body.data.subjectStatus !== 'active'",
  'JSON.stringify({ subjectId, bearerToken: bearer, expiresAt })',
  'mode: 0o600',
  'await chmod(statePath, 0o600);',
  "JSON.parse(await readFile(statePath, 'utf8'))",
  'await verifyCanonicalGuest(subjectId, bearer);',
];

for (const fragment of requiredRuntimeSmokeFragments) {
  if (!runtimeSmoke.includes(fragment)) {
    throw new Error(`Missing canonical Guest containment smoke fragment: ${fragment}`);
  }
}

for (const forbiddenTrigger of ['\npush:', '\npull_request:', '\nschedule:']) {
  if (workflow.includes(forbiddenTrigger)) {
    throw new Error(`Production Data API containment must remain manual-only: ${forbiddenTrigger}`);
  }
}

const mutationStepIndex = workflow.indexOf('run: bash scripts/run-production-data-api-containment.sh');
if (mutationStepIndex < 0) {
  throw new Error('Containment mutation step is missing.');
}

const accessTokenPreflightIndex = workflow.indexOf('test -n "${SUPABASE_ACCESS_TOKEN:-}"');
if (accessTokenPreflightIndex < 0 || accessTokenPreflightIndex > mutationStepIndex) {
  throw new Error('Supabase access-token preflight must occur before mutation.');
}

const runtimeSmokeMatches = [
  ...workflow.matchAll(/run: node scripts\/verify-production-data-api-containment-guest-runtime\.mjs/g),
];
if (runtimeSmokeMatches.length !== 2) {
  throw new Error(`Expected exactly two canonical Guest runtime smokes, found ${runtimeSmokeMatches.length}.`);
}

const preRuntimeSmokeIndex = runtimeSmokeMatches[0]?.index ?? -1;
const postRuntimeSmokeIndex = runtimeSmokeMatches[1]?.index ?? -1;
const bootstrapModeIndex = workflow.indexOf('CONTAINMENT_RUNTIME_SMOKE_MODE: bootstrap');
const verifyModeIndex = workflow.indexOf('CONTAINMENT_RUNTIME_SMOKE_MODE: verify');
const cleanupIndex = workflow.indexOf('Remove runtime smoke credential material');

if (
  bootstrapModeIndex < 0 ||
  preRuntimeSmokeIndex < 0 ||
  bootstrapModeIndex > preRuntimeSmokeIndex ||
  preRuntimeSmokeIndex >= mutationStepIndex
) {
  throw new Error('Canonical Guest bootstrap/runtime preflight must pass before the Data API transition.');
}
if (
  verifyModeIndex <= mutationStepIndex ||
  postRuntimeSmokeIndex <= mutationStepIndex ||
  verifyModeIndex > postRuntimeSmokeIndex
) {
  throw new Error('Canonical Guest post-transition smoke must run after the Data API transition.');
}
if (cleanupIndex <= postRuntimeSmokeIndex) {
  throw new Error('Runtime smoke credential material must be removed after post-transition verification.');
}

const patchCount = [...runner.matchAll(/-X PATCH/g)].length;
if (patchCount !== 1) {
  throw new Error(`Expected exactly one Management API PATCH primitive, found ${patchCount}.`);
}

const postReadCalls = [...runner.matchAll(/read_postgrest_config \"\$post_raw\"/g)].length;
if (postReadCalls !== 2) {
  throw new Error(`Expected a post-state GET on both failure and success paths, found ${postReadCalls}.`);
}

const containedPredicateCount = [...runner.matchAll(/is_contained_schema /g)].length;
if (containedPredicateCount < 2) {
  throw new Error('Containment must consistently recognize the normalized disabled Data API state.');
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

const forbiddenRuntimeSmokeFragments = [
  '/api/birth-profiles',
  'api.supabase.com',
  'SUPABASE_DB_PASSWORD',
  'psql',
  'SET LOCAL ROLE',
  'pg_authid',
  'rolpassword',
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
  'console.log(bearer',
  'console.log(state',
  'console.log(body',
];

const lowerRuntimeSmoke = runtimeSmoke.toLowerCase();
for (const fragment of forbiddenRuntimeSmokeFragments) {
  if (lowerRuntimeSmoke.includes(fragment.toLowerCase())) {
    throw new Error(`Forbidden canonical Guest containment smoke surface: ${fragment}`);
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

if (workflow.includes('myeongha-data-api-containment-runtime-smoke.json\n          path:')) {
  throw new Error('Runtime Guest credential material must never be uploaded as containment evidence.');
}

console.log('MyeongHa guarded production Data API containment contract verification passed.');
