import { readFile, readdir } from 'node:fs/promises';

const expectedProjectRef = 'cnsfpcdiyofqvhpcegfc';
const workflowPath = '.github/workflows/supabase-production.yml';
const configPath = 'supabase/config.toml';
const migrationDir = 'supabase/migrations';

const [workflow, config, migrationFiles] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(configPath, 'utf8'),
  readdir(migrationDir),
]);

const requiredWorkflowFragments = [
  "branches:\n      - main",
  "paths:\n      - 'supabase/migrations/**'",
  "- '.github/workflows/supabase-production.yml'",
  `SUPABASE_PROJECT_ID: ${expectedProjectRef}`,
  'supabase/setup-cli@v3.0.0',
  'version: 2.116.0',
  "grep -q '20260830072444'",
  'supabase migration repair 20260830072444 --status reverted',
  'supabase migration repair 0010 --status applied',
  'supabase db push --dry-run',
  'supabase db push',
  'cancel-in-progress: false',
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

if (!config.includes('project_id = "myeongha"')) {
  throw new Error('Supabase CLI config is missing the repository-local project id.');
}

if (!migrationFiles.includes('0010_auth_owner.sql')) {
  throw new Error('Expected baseline migration 0010_auth_owner.sql is missing.');
}

console.log(`MyeongHa Supabase deployment verification passed for ${migrationFiles.length} migration files.`);
