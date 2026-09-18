import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-postgres-privacy-delta-audit.yml';
const runbookPath = 'docs/operations/POSTGRES_BACKUP_RESTORE_RUNBOOK_V1.md';
const statusPath = 'docs/operations/POSTGRES_DR_READINESS_STATUS_V1.md';

const [workflow, runbook, status] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(runbookPath, 'utf8'),
  readFile(statusPath, 'utf8'),
]);

function requireFragment(text, fragment, path) {
  if (!text.includes(fragment)) {
    throw new Error(`${path} is missing required privacy-delta audit fragment: ${fragment}`);
  }
}

for (const fragment of [
  'name: Production PostgreSQL Privacy Delta Count Audit',
  'workflow_dispatch:',
  'backup_run_id:',
  'incident_reference_utc:',
  'actions: read',
  'contents: read',
  'environment: production',
  'Validate audit input and source backup authority',
  '.name == "Production PostgreSQL Logical Backup"',
  '.path == ".github/workflows/production-postgres-backup.yml"',
  'Download exact governed backup artifact metadata',
  'schema_version == "myeongha-postgres-backup-artifact-v1"',
  'Resolve governed production session-pooler endpoint',
  'Execute count-only post-backup privacy delta audit',
  "select count(*) from public.data_deletion_jobs where requested_at > :'cutoff'::timestamptz and requested_at <= :'incident'::timestamptz",
  "select count(*) from public.share_artifacts where revoked_at > :'cutoff'::timestamptz and revoked_at <= :'incident'::timestamptz",
  "select count(*) from public.device_installations where revoked_at > :'cutoff'::timestamptz and revoked_at <= :'incident'::timestamptz",
  "select count(*) from public.life_facts where revoked_at > :'cutoff'::timestamptz and revoked_at <= :'incident'::timestamptz",
  "select count(*) from public.memory_items where revoked_at > :'cutoff'::timestamptz and revoked_at <= :'incident'::timestamptz",
  "select count(*) from public.record_access_grants where revoked_at > :'cutoff'::timestamptz and revoked_at <= :'incident'::timestamptz",
  "select count(*) from public.subjects where status <> 'active' and updated_at > :'cutoff'::timestamptz and updated_at <= :'incident'::timestamptz",
  'source_authority: "primary-production-db-observation-only"',
  'durable_post_backup_source_authority: false',
  'contains_identifiers: false',
  'contains_row_payloads: false',
  'privacy_reconciliation_exercised: false',
  'dr_ready: false',
  'Upload sanitized count-only audit evidence',
  'path: ${{ runner.temp }}/privacy-delta-audit/privacy-delta-audit.json',
]) requireFragment(workflow, fragment, workflowPath);

for (const forbidden of [
  'service_role',
  'MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE',
  'select *',
  'SELECT *',
  'privacy_reconciliation_exercised: true',
  'durable_post_backup_source_authority: true',
  'dr_ready: true',
]) {
  if (workflow.includes(forbidden)) {
    throw new Error(`${workflowPath} contains forbidden count-only audit fragment: ${forbidden}`);
  }
}

for (const fragment of [
  'production privacy delta count audit = IMPLEMENTED / CI-VERIFIED / RUNTIME PENDING',
  'primary production DB observation only',
  'does not establish a durable post-backup authority',
]) requireFragment(runbook, fragment, runbookPath);

for (const fragment of [
  'production_privacy_delta_count_audit: IMPLEMENTED_CI_VERIFIED',
  'production_privacy_delta_count_audit_runtime: PENDING_MANUAL_RUN_FOR_BACKUP_35329018925',
  'authoritative_post_backup_delta_audit_for_current_backup: NOT_EXECUTED',
  'authoritative_post_backup_source: false',
  'dr_ready: false',
]) requireFragment(status, fragment, statusPath);

console.log('Production PostgreSQL privacy delta count-audit workflow verification passed.');
