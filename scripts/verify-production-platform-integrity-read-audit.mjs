import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-platform-integrity-read-audit.yml';
const workflow = await readFile(workflowPath, 'utf8');

const requiredFragments = [
  'workflow_dispatch:',
  "description: 'Type READ_ONLY_CATALOG to snapshot production PostgreSQL metadata without mutations.'",
  'permissions:\n  contents: read',
  'environment: production',
  'cancel-in-progress: false',
  'SUPABASE_PROJECT_ID: cnsfpcdiyofqvhpcegfc',
  'SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}',
  'SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}',
  '[[ "$DISPATCH_CONFIRM" == \'READ_ONLY_CATALOG\' ]]',
  'https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_ID/config/database/pooler',
  'select((.database_type // "") == "PRIMARY")',
  'test("\\\\.pooler\\\\.supabase\\\\.com:(5432|6543)/postgres(?:\\\\?|$)")',
  'sort_by(',
  'test(":5432/postgres(?:\\\\?|$)")',
  '[[ "$admin_pool_user" == "postgres.$SUPABASE_PROJECT_ID" ]]',
  '[[ "$pool_port" == \'5432\' || "$pool_port" == \'6543\' ]]',
  'PGSSLMODE=require',
  "PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=5000 -c application_name=myeongha_pi_catalog_audit'",
  "select current_setting('default_transaction_read_only');",
  'begin read only;',
  "select current_setting('transaction_read_only');",
  'rollback;',
  'from supabase_migrations.schema_migrations',
  'from pg_catalog.pg_class c',
  'from pg_catalog.pg_constraint con',
  'from pg_catalog.pg_index i',
  'from pg_catalog.pg_trigger t',
  'from pg_catalog.pg_policies',
  'from pg_catalog.pg_proc p',
  'from pg_catalog.pg_roles',
  'from pg_catalog.pg_auth_members membership',
  'from information_schema.table_privileges',
  'from information_schema.routine_privileges',
  'sha256sum *.csv audit_metadata.txt > SHA256SUMS',
  'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1',
  'retention-days: 14',
];

for (const fragment of requiredFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`Missing production read-audit safety fragment: ${fragment}`);
  }
}

const forbiddenFragments = [
  '\npush:',
  '\npull_request:',
  '\nschedule:',
  'supabase db push',
  'supabase migration repair',
  'supabase migration up',
  'supabase db reset',
  'api-keys?reveal=true',
  'vercel.com/v10/projects',
  'vercel deploy',
  'vercel --prod',
  'sslmode=disable',
  'PGSSLMODE=disable',
  'rolpassword',
  'pg_authid',
  '-X POST',
  '-X PUT',
  '-X PATCH',
  '-X DELETE',
];

for (const fragment of forbiddenFragments) {
  if (workflow.includes(fragment)) {
    throw new Error(`Forbidden production read-audit workflow fragment: ${fragment}`);
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
  /\bcomment\s+on\b/i,
];

for (const pattern of mutationPatterns) {
  if (pattern.test(workflow)) {
    throw new Error(`Production read-audit workflow contains a mutation pattern: ${pattern}`);
  }
}

const expectedSnapshotFiles = [
  'migration_history.csv',
  'public_objects.csv',
  'columns.csv',
  'constraints.csv',
  'indexes.csv',
  'triggers.csv',
  'policies.csv',
  'functions.csv',
  'views.csv',
  'role_state.csv',
  'role_memberships.csv',
  'table_privileges.csv',
  'routine_privileges.csv',
  'summary.csv',
  'audit_metadata.txt',
  'SHA256SUMS',
];

for (const file of expectedSnapshotFiles) {
  if (!workflow.includes(file)) {
    throw new Error(`Production read-audit workflow is missing snapshot artifact ${file}.`);
  }
}

if (!workflow.includes('default_transaction_read_only=on')) {
  throw new Error('Production read-audit must force default_transaction_read_only=on.');
}

if (!workflow.includes("[[ \"$default_read_only\" == 'on' ]]")) {
  throw new Error('Production read-audit must fail closed when session read-only mode is not active.');
}

if (!workflow.includes("[[ \"$transaction_read_only\" == *'on'* ]]")) {
  throw new Error('Production read-audit must verify an explicit READ ONLY transaction.');
}

console.log('MyeongHa production platform-integrity read-audit workflow contract verification passed.');
