import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';

const expectedProjectRef = 'cnsfpcdiyofqvhpcegfc';
const workflowPath = '.github/workflows/supabase-production.yml';
const migrationRunnerPath = 'scripts/operations/run-supabase-production-migrations.sh';
const postdeployVerifyPath = 'scripts/run-production-platform-integrity-postdeploy-verify.sh';
const dataApiSurfaceAuditPath = 'scripts/run-production-platform-integrity-data-api-surface-audit.sh';
const configPath = 'supabase/config.toml';
const migrationDir = 'supabase/migrations';

execFileSync('bash', ['-n', migrationRunnerPath], { stdio: 'inherit' });
execFileSync('bash', ['-n', postdeployVerifyPath], { stdio: 'inherit' });

const [workflow, migrationRunner, postdeployVerify, dataApiSurfaceAudit, config, migrationFiles] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(migrationRunnerPath, 'utf8'),
  readFile(postdeployVerifyPath, 'utf8'),
  readFile(dataApiSurfaceAuditPath, 'utf8'),
  readFile(configPath, 'utf8'),
  readdir(migrationDir),
]);

const deploymentContract = workflow + '\n' + migrationRunner;

const requiredWorkflowFragments = [
  "push:\n    branches:\n      - main\n  workflow_dispatch:",
  'change-gate:',
  'name: detect-production-db-relevance',
  'fetch-depth: 0',
  'requires_deploy: ${{ steps.relevance.outputs.requires_deploy }}',
  'EVENT_NAME: ${{ github.event_name }}',
  'BEFORE_SHA: ${{ github.event.before }}',
  'CURRENT_SHA: ${{ github.sha }}',
  "if [[ \"$EVENT_NAME\" == 'workflow_dispatch' ]]; then",
  "reason='workflow_dispatch forces governed Production verification'",
  '"$BEFORE_SHA" =~ ^0+$',
  "reason='push before SHA is unavailable; fail closed'",
  'git cat-file -e "${BEFORE_SHA}^{commit}"',
  "reason='push before SHA is not present in checkout; fail closed'",
  'git diff --name-only "$BEFORE_SHA" "$CURRENT_SHA"',
  "'^(supabase/migrations/|[.]github/workflows/supabase-production[.]yml$|scripts/run-production-platform-integrity-postdeploy-verify[.]sh$|scripts/run-production-platform-integrity-read-audit[.]sh$|scripts/run-production-platform-integrity-data-api-surface-audit[.]sh$|scripts/operations/run-supabase-production-migrations[.]sh$)'",
  'echo "requires_deploy=$requires_deploy" >> "$GITHUB_OUTPUT"',
  'needs: change-gate',
  "if: ${{ needs.change-gate.outputs.requires_deploy == 'true' }}",
  `SUPABASE_PROJECT_ID: ${expectedProjectRef}`,
  'uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
  'uses: supabase/setup-cli@46f7f98c7f948ad727d22c1e67fab04c223a0520 # v3.0.0',
  'version: 2.116.0',
  'SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}',
  'SUPABASE_PRODUCTION_SESSION_POOLER_HOST: ${{ secrets.SUPABASE_PRODUCTION_SESSION_POOLER_HOST }}',
  ': "${SUPABASE_PRODUCTION_SESSION_POOLER_HOST:?SUPABASE_PRODUCTION_SESSION_POOLER_HOST is required}"',
  'SUPABASE_PRODUCTION_SESSION_POOLER_HOST must be a bare *.pooler.supabase.com hostname.',
  'run: bash scripts/operations/run-supabase-production-migrations.sh',
  'db_url="postgresql://postgres.${SUPABASE_PROJECT_ID}:${encoded_password}@${host}:5432/postgres?sslmode=require"',
  'echo "::add-mask::$db_url"',
  'db_args=(--db-url "$db_url")',
  "grep -q '20260830072444'",
  'supabase migration repair 20260830072444 --status reverted "${db_args[@]}"',
  'supabase migration repair 0010 --status applied "${db_args[@]}"',
  'supabase db push --include-all --dry-run "${db_args[@]}"',
  'supabase db push --include-all "${db_args[@]}"',
  'cancel-in-progress: false',
  'sudo apt-get install -y postgresql-client',
  'run: bash scripts/run-production-platform-integrity-postdeploy-verify.sh',
  'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1',
  'name: myeongha-production-postdeploy-platform-integrity-${{ github.run_id }}',
  'path: ${{ runner.temp }}/myeongha-platform-integrity-catalog',
  'if-no-files-found: warn',
  'retention-days: 14',
];

for (const fragment of requiredWorkflowFragments) {
  if (!deploymentContract.includes(fragment)) {
    throw new Error(`Missing Supabase deployment contract fragment: ${fragment}`);
  }
}

const forbiddenWorkflowFragments = [
  'SUPABASE_ACCESS_TOKEN',
  'supabase link --project-ref',
  "    paths:\n      - 'supabase/migrations/**'",
  'uses: actions/checkout@v7.0.1',
  'uses: supabase/setup-cli@v3.0.0',
  '--include-seed',
  'sslmode=disable',
  'SUPABASE_DB_PASSWORD: postgres',
  'echo "$SUPABASE_ACCESS_TOKEN"',
  'echo "$SUPABASE_DB_PASSWORD"',
  'echo "$SUPABASE_PRODUCTION_DB_URL"',
];

for (const fragment of forbiddenWorkflowFragments) {
  if (deploymentContract.includes(fragment)) {
    throw new Error(`Supabase production workflow contains a forbidden fragment: ${fragment}`);
  }
}

const requiredPostdeployFragments = [
  `[[ "$SUPABASE_PROJECT_ID" == '${expectedProjectRef}' ]]`,
  '[[ "$SUPABASE_PRODUCTION_SESSION_POOLER_HOST" =~ ^[a-z0-9-]+([.][a-z0-9-]+)*[.]pooler[.]supabase[.]com$ ]]',
  'ADMIN_POOL_USER="postgres.$SUPABASE_PROJECT_ID"',
  'POOL_HOST="$SUPABASE_PRODUCTION_SESSION_POOLER_HOST"',
  "POOL_PORT='5432'",
  "POOL_DB='postgres'",
  '[[ "$ADMIN_POOL_USER" == "postgres.$SUPABASE_PROJECT_ID" ]]',
  '[[ "$POOL_HOST" =~ ^[a-z0-9-]+([.][a-z0-9-]+)*[.]pooler[.]supabase[.]com$ ]]',
  '[[ "$POOL_PORT" == \'5432\' ]]',
  '[[ "$POOL_DB" == \'postgres\' ]]',
  'bash scripts/run-production-platform-integrity-read-audit.sh',
  'bash scripts/run-production-platform-integrity-data-api-surface-audit.sh',
];

for (const fragment of requiredPostdeployFragments) {
  if (!postdeployVerify.includes(fragment)) {
    throw new Error(`Missing production post-deploy integrity verifier fragment: ${fragment}`);
  }
}

const forbiddenPostdeployFragments = [
  'SUPABASE_ACCESS_TOKEN',
  'api.supabase.com',
  '/config/database/pooler',
  '-X POST',
  '-X PUT',
  '-X PATCH',
  '-X DELETE',
  'supabase db push',
  'supabase migration repair',
  'supabase migration up',
  'supabase db reset',
  'api-keys?reveal=true',
  'sslmode=disable',
  'PGSSLMODE=disable',
  'echo "$SUPABASE_ACCESS_TOKEN"',
  'echo "$SUPABASE_DB_PASSWORD"',
];

for (const fragment of forbiddenPostdeployFragments) {
  if (postdeployVerify.includes(fragment)) {
    throw new Error(`Production post-deploy integrity verifier contains a forbidden mutation or unsafe fragment: ${fragment}`);
  }
}

for (const forbidden of ['SUPABASE_ACCESS_TOKEN', 'api.supabase.com', '/postgrest']) {
  if (dataApiSurfaceAudit.includes(forbidden)) {
    throw new Error(`Production Data API/default-ACL audit must not inherit Management PAT authority: ${forbidden}`);
  }
}
for (const required of [
  "data_api_config_authority=production_data_api_surface_containment_workflow",
  "data_api_config_management_read=not_performed",
  "data_api_surface_metadata_captured=database_acl_only",
  "[[ \"$POOL_PORT\" == '5432' ]]",
]) {
  if (!dataApiSurfaceAudit.includes(required)) {
    throw new Error(`Production Data API/default-ACL audit missing explicit database-only authority fragment: ${required}`);
  }
}

const mutationPatterns = [
  /\binsert\s+into\b/i,
  /\bupdate\s+[a-zA-Z0-9_.\"]+\s+set\b/i,
  /\bdelete\s+from\b/i,
  /\btruncate\b/i,
  /\balter\s+(?:table|role|function|procedure|schema|database|policy|sequence|view)\b/i,
  /\bcreate\s+(?:table|role|function|procedure|schema|policy|sequence|view|index|trigger)\b/i,
  /\bdrop\s+(?:table|role|function|procedure|schema|policy|sequence|view|index|trigger)\b/i,
  /\bgrant\s+[^\n]+\s+to\b/i,
  /\brevoke\s+[^\n]+\s+from\b/i,
];

for (const pattern of mutationPatterns) {
  if (pattern.test(postdeployVerify)) {
    throw new Error(`Production post-deploy integrity verifier contains a mutation pattern: ${pattern}`);
  }
}

if (!config.includes('project_id = "myeongha"')) {
  throw new Error('Supabase CLI config is missing the repository-local project id.');
}

if (!migrationFiles.includes('0010_auth_owner.sql')) {
  throw new Error('Expected baseline migration 0010_auth_owner.sql is missing.');
}

console.log(`MyeongHa Supabase deployment configuration + auditable main-push gate + explicit Session Pooler-only post-deploy verification passed for ${migrationFiles.length} migration files.`);
