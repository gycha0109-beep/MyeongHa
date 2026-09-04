import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-platform-integrity-read-audit.yml';
const auditScriptPath = 'scripts/run-production-platform-integrity-read-audit.sh';

const [workflow, auditScript] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(auditScriptPath, 'utf8'),
]);

const requiredWorkflowFragments = [
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
  'run: bash scripts/run-production-platform-integrity-read-audit.sh',
  'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1',
  'retention-days: 14',
];

for (const fragment of requiredWorkflowFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`Missing production read-audit workflow safety fragment: ${fragment}`);
  }
}

const requiredScriptFragments = [
  'PGSSLMODE=require',
  'begin read only;',
  "select current_setting('transaction_read_only');",
  "[[ \"$transaction_read_only\" == *'on'* ]]",
  "set local statement_timeout = '30s';",
  "set local lock_timeout = '5s';",
  "set local application_name = 'myeongha_pi_catalog_audit';",
  "printf '%s\\n' 'copy ('",
  "printf '%s\\n' ') to stdout with (format csv, header true);'",
  "printf '%s\\n' 'rollback;'",
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
  'sha256sum --check SHA256SUMS',
  'audit_mode=explicit_read_only_transactions',
];

for (const fragment of requiredScriptFragments) {
  if (!auditScript.includes(fragment)) {
    throw new Error(`Missing production read-audit script safety fragment: ${fragment}`);
  }
}

const combined = `${workflow}\n${auditScript}`;
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
  'PGOPTIONS=',
  'rolpassword',
  'pg_authid',
  '-X POST',
  '-X PUT',
  '-X PATCH',
  '-X DELETE',
];

for (const fragment of forbiddenFragments) {
  if (combined.includes(fragment)) {
    throw new Error(`Forbidden production read-audit fragment: ${fragment}`);
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
  /\bcopy\s+[^\n]+\s+from\b/i,
];

for (const pattern of mutationPatterns) {
  if (pattern.test(combined)) {
    throw new Error(`Production read-audit contains a mutation pattern: ${pattern}`);
  }
}

const csvFunctionMatch = auditScript.match(/csv_query\(\) \{([\s\S]*?)\n\}/);
if (!csvFunctionMatch) {
  throw new Error('Production read-audit script is missing csv_query().');
}

const csvFunction = csvFunctionMatch[1];
for (const fragment of [
  'begin read only;',
  "set local statement_timeout = '30s';",
  "set local lock_timeout = '5s';",
  'copy (',
  'to stdout with (format csv, header true);',
  'rollback;',
]) {
  if (!csvFunction.includes(fragment)) {
    throw new Error(`csv_query() is not fail-closed read-only: missing ${fragment}`);
  }
}

if (csvFunction.includes('--csv -c "$query"')) {
  throw new Error('csv_query() must not execute the supplied query outside its explicit READ ONLY transaction wrapper.');
}

const expectedCsvFiles = [
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
];

const actualCsvFiles = [...auditScript.matchAll(/^csv_query\s+([^\s]+\.csv)\s+<<'SQL'$/gm)].map((match) => match[1]);
if (actualCsvFiles.length !== expectedCsvFiles.length) {
  throw new Error(`Expected ${expectedCsvFiles.length} read-only csv_query calls, found ${actualCsvFiles.length}.`);
}

for (const file of expectedCsvFiles) {
  if (!actualCsvFiles.includes(file)) {
    throw new Error(`Production read-audit is missing snapshot artifact ${file}.`);
  }
}

for (const file of ['audit_metadata.txt', 'SHA256SUMS']) {
  if (!auditScript.includes(file)) {
    throw new Error(`Production read-audit is missing snapshot artifact ${file}.`);
  }
}

console.log('MyeongHa production platform-integrity transaction-pooler read-audit contract verification passed.');
