import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';

const expectedProjectRef = 'cnsfpcdiyofqvhpcegfc';
const workflowPath = '.github/workflows/supabase-production.yml';
const postdeployVerifyPath = 'scripts/run-production-platform-integrity-postdeploy-verify.sh';
const configPath = 'supabase/config.toml';
const migrationDir = 'supabase/migrations';

execFileSync('bash', ['-n', postdeployVerifyPath], { stdio: 'inherit' });

const [workflow, postdeployVerify, config, migrationFiles] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(postdeployVerifyPath, 'utf8'),
  readFile(configPath, 'utf8'),
  readdir(migrationDir),
]);

const requiredWorkflowFragments = [
  "branches:\n      - main",
  "paths:\n      - 'supabase/migrations/**'",
  "- '.github/workflows/supabase-production.yml'",
  "- 'scripts/run-production-platform-integrity-postdeploy-verify.sh'",
  "- 'scripts/run-production-platform-integrity-read-audit.sh'",
  "- 'scripts/run-production-platform-integrity-data-api-surface-audit.sh'",
  `SUPABASE_PROJECT_ID: ${expectedProjectRef}`,
  'supabase/setup-cli@v3.0.0',
  'version: 2.116.0',
  "grep -q '20260830072444'",
  'supabase migration repair 20260830072444 --status reverted',
  'supabase migration repair 0010 --status applied',
  'supabase db push --dry-run',
  'supabase db push',
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
  if (!workflow.includes(fragment)) {
    throw new Error(`Missing Supabase deployment contract fragment: ${fragment}`);
  }
}

if (!workflow.includes('SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}')) {
  throw new Error('Supabase production workflow must source SUPABASE_ACCESS_TOKEN from GitHub secrets.');
}

if (!workflow.includes('SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}')) {
  throw new Error('Supabase production workflow must source SUPABASE_DB_PASSWORD from GitHub secrets.');
}

if (workflow.includes('--include-seed')) {
  throw new Error('Production Supabase deployment must not include seed data.');
}

const requiredPostdeployFragments = [
  `[[ "$SUPABASE_PROJECT_ID" == '${expectedProjectRef}' ]]`,
  'https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_ID/config/database/pooler',
  'select((.database_type // "") == "PRIMARY")',
  'test("\\\\.pooler\\\\.supabase\\\\.com:(5432|6543)/postgres(?:\\\\?|$)")',
  'sort_by(',
  'test(":5432/postgres(?:\\\\?|$)")',
  '[[ "$ADMIN_POOL_USER" == "postgres.$SUPABASE_PROJECT_ID" ]]',
  '[[ "$POOL_HOST" == *.pooler.supabase.com ]]',
  '[[ "$POOL_PORT" == \'5432\' || "$POOL_PORT" == \'6543\' ]]',
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
];

for (const fragment of forbiddenPostdeployFragments) {
  if (postdeployVerify.includes(fragment)) {
    throw new Error(`Production post-deploy integrity verifier contains a forbidden mutation or unsafe fragment: ${fragment}`);
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

console.log(`MyeongHa Supabase deployment configuration + post-deploy integrity verification passed for ${migrationFiles.length} migration files.`);
