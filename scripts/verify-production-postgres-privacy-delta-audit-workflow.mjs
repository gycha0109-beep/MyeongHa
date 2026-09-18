import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-postgres-privacy-delta-audit.yml';
const statusPath = 'docs/operations/POSTGRES_DR_READINESS_STATUS_V1.md';

const schemaPaths = [
  'supabase/migrations/0010_auth_owner.sql',
  'supabase/migrations/0050_personal_record.sql',
  'supabase/migrations/0140_story_share.sql',
  'supabase/migrations/0170_notifications.sql',
  'supabase/migrations/0180_data_deletion_jobs.sql',
];

const [workflow, status, ...schemas] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(statusPath, 'utf8'),
  ...schemaPaths.map((path) => readFile(path, 'utf8')),
]);

const requiredWorkflowFragments = [
  'name: Production PostgreSQL Privacy Delta Count Audit',
  'workflow_dispatch:',
  'backup_run_id:',
  'permissions:',
  'actions: read',
  'contents: read',
  'environment: production',
  'SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}',
  'SUPABASE_PRODUCTION_SESSION_POOLER_HOST: ${{ secrets.SUPABASE_PRODUCTION_SESSION_POOLER_HOST }}',
  'uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7',
  '.name == "Production PostgreSQL Logical Backup"',
  '.path == ".github/workflows/production-postgres-backup.yml"',
  'and .conclusion == "success"',
  'and .head_branch == "main"',
  'and (.event == "schedule" or .event == "workflow_dispatch")',
  'uses: actions/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131 # v7',
  '.schema_version == "myeongha-postgres-backup-artifact-v1"',
  '.project_ref == $project_ref',
  '.source_sha == $source_sha',
  'backup_completed_at_utc=$cutoff_utc',
  "export PGOPTIONS='-c statement_timeout=30000",
  'begin transaction read only;',
  "where current_setting('transaction_read_only') = 'on';",
  'rollback;',
  'Explicit READ ONLY transaction could not complete.',
  `printf '%s\\n' "$sql" | psql "$db_url" -X -qAt`,
  '-v "cutoff=$BACKUP_COMPLETED_AT_UTC" > "$counts_path"',
  '[[ -s "$counts_path" ]]',
  "'data_deletion_jobs_requested_at'",
  'from public.data_deletion_jobs where requested_at > :\'cutoff\'::timestamptz',
  "'share_artifacts_revoked_at'",
  'from public.share_artifacts where revoked_at > :\'cutoff\'::timestamptz',
  "'device_installations_revoked_at'",
  'from public.device_installations where revoked_at > :\'cutoff\'::timestamptz',
  "'life_facts_revoked_at'",
  'from public.life_facts where revoked_at > :\'cutoff\'::timestamptz',
  "'memory_items_revoked_at'",
  'from public.memory_items where revoked_at > :\'cutoff\'::timestamptz',
  "'record_access_grants_revoked_at'",
  'from public.record_access_grants where revoked_at > :\'cutoff\'::timestamptz',
  "'subjects_non_active_updated_at'",
  "from public.subjects where status <> 'active' and updated_at > :'cutoff'::timestamptz",
  'query_mode: "read_only_count_only"',
  'authoritative_post_backup_source: false',
  'authoritative_privacy_reconciliation: false',
  'future_safe_privacy_reconciliation: false',
  'dr_ready: false',
  'uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7',
  'retention-days: 30',
  'This workflow reports count-only primary-database observations.',
];

for (const fragment of requiredWorkflowFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`Missing privacy delta audit workflow contract fragment: ${fragment}`);
  }
}

const forbiddenWorkflowFragments = [
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_SERVICE_ROLE_KEY',
  'service_role',
  'MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE',
  'sslmode=disable',
  'echo "$SUPABASE_DB_PASSWORD"',
  'echo "$SUPABASE_PRODUCTION_SESSION_POOLER_HOST"',
  'echo "$db_url"',
  'select *',
  'row_to_json',
  'json_agg',
  'array_agg',
  '\\copy',
  'pg_dump',
  'supabase db dump',
  'authoritative_post_backup_source: true',
  'authoritative_privacy_reconciliation: true',
  'future_safe_privacy_reconciliation: true',
  'dr_ready: true',
  '-c default_transaction_read_only=on',
  '-c "$sql"',
];

for (const fragment of forbiddenWorkflowFragments) {
  if (workflow.toLowerCase().includes(fragment.toLowerCase())) {
    throw new Error(`Forbidden privacy delta audit workflow fragment: ${fragment}`);
  }
}

const sqlStart = workflow.indexOf(`          sql="$(cat <<'SQL'`);
const sqlEnd = workflow.indexOf('          SQL\n          )"', sqlStart);
if (sqlStart < 0 || sqlEnd < 0) {
  throw new Error('Count-only SQL heredoc could not be located.');
}

const sql = workflow.slice(sqlStart, sqlEnd);
const countMatches = sql.match(/count\(\*\)::bigint/gi) ?? [];
if (countMatches.length !== 7) {
  throw new Error(`Expected exactly seven count-only privacy queries; found ${countMatches.length}.`);
}

const forbiddenSql = /\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|copy|call|do)\b/i;
if (forbiddenSql.test(sql)) {
  throw new Error('Privacy delta audit SQL contains a mutation-capable statement.');
}

if (/\b(id|subject_id|auth_user_id|target_resource_id|token_fingerprint)\b/i.test(sql)) {
  throw new Error('Privacy delta audit SQL must not select or filter on production row identifiers.');
}

const schemaAuthority = schemas.join('\n');
const requiredSchemaFragments = [
  'create table public.subjects (',
  'status text not null',
  'updated_at timestamptz not null',
  'create table public.life_facts (',
  'revoked_at timestamptz null',
  'create table public.memory_items (',
  'create table public.record_access_grants (',
  'create table public.share_artifacts (',
  'create table public.device_installations (',
  'create table public.data_deletion_jobs (',
  'requested_at timestamptz not null',
];

for (const fragment of requiredSchemaFragments) {
  if (!schemaAuthority.includes(fragment)) {
    throw new Error(`Current schema no longer supports privacy delta audit fragment: ${fragment}`);
  }
}

const requiredStatusFragments = [
  'authoritative_post_backup_delta_audit_for_current_backup: NOT_EXECUTED',
  'authoritative_post_backup_source: false',
  'privacy_reconciliation: BLOCKED_BY_P0_PR_01_AND_ISSUE_964',
  'rpo_authority: OPEN_DECISION',
  'rto_authority: OPEN_DECISION',
  'dr_ready: false',
];

for (const fragment of requiredStatusFragments) {
  if (!status.includes(fragment)) {
    throw new Error(`DR status authority changed unexpectedly while count-only audit remains unexecuted: ${fragment}`);
  }
}

console.log('MyeongHa production PostgreSQL privacy delta count-only audit workflow verification passed.');
