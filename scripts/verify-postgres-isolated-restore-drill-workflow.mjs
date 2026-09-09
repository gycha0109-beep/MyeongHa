import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/postgres-isolated-restore-drill.yml';
const harnessPath = 'scripts/run-postgres-isolated-restore-drill.sh';
const runbookPath = 'docs/operations/POSTGRES_BACKUP_RESTORE_RUNBOOK_V1.md';

const [workflow, harness, runbook] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(harnessPath, 'utf8'),
  readFile(runbookPath, 'utf8'),
]);

const requiredWorkflowFragments = [
  'name: PostgreSQL Isolated Restore Drill',
  'workflow_dispatch:',
  'backup_run_id:',
  'incident_reference_utc:',
  'actions: read',
  'contents: read',
  'cancel-in-progress: false',
  'environment: production',
  'image: postgres:17.6',
  'POSTGRES_PASSWORD: restore-drill',
  'EXPECTED_PROJECT_REF: cnsfpcdiyofqvhpcegfc',
  'MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE: ${{ secrets.MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE }}',
  '.name == "Production PostgreSQL Logical Backup"',
  '.path == ".github/workflows/production-postgres-backup.yml"',
  '.conclusion == "success"',
  '.head_branch == "main"',
  '(.event == "schedule" or .event == "workflow_dispatch")',
  '.expired == false',
  '^myeongha-postgres-[0-9]{8}T[0-9]{6}Z$',
  'uses: actions/download-artifact@v4',
  'run-id: ${{ inputs.backup_run_id }}',
  'artifact-ids: ${{ steps.source.outputs.artifact_id }}',
  'merge-multiple: true',
  'bash scripts/run-postgres-isolated-restore-drill.sh',
  'Upload restore drill evidence only',
  'path: ${{ runner.temp }}/restore-evidence/restore-evidence.json',
  'retention-days: 30',
  "echo 'privacy_reconciliation=not_exercised_by_this_workflow'",
  "echo 'dr_ready=false'",
];

for (const fragment of requiredWorkflowFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`Missing isolated restore workflow contract fragment: ${fragment}`);
  }
}

const forbiddenWorkflowFragments = [
  '\n  push:',
  '\n  schedule:',
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_ACCESS_TOKEN',
  'pooler.supabase.com',
  'api.supabase.com/v1/projects',
  'service_role',
  'path: ${{ runner.temp }}/backup-artifact\n          retention-days:',
  'path: roles.sql',
  'path: schema.sql',
  'path: data.sql',
];

for (const fragment of forbiddenWorkflowFragments) {
  if (workflow.includes(fragment)) {
    throw new Error(`Forbidden isolated restore workflow fragment: ${fragment}`);
  }
}

const requiredHarnessFragments = [
  "readonly RESTORE_DATABASE_URL='postgresql://postgres:restore-drill@127.0.0.1:5432/postgres'",
  'EXPECTED_PROJECT_REF',
  'EXPECTED_SOURCE_SHA',
  'myeongha-postgres-backup-artifact-v1',
  'myeongha-postgres-logical-backup-v1',
  'sha256sum -c',
  'openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000',
  "printf '%s\\n' data.sql manifest.json plaintext-sha256.txt roles.sql schema.sql",
  "--command 'SET session_replication_role = replica'",
  'subjects birth_profiles products product_offers data_deletion_jobs',
  "rolname='myeongha_api_executor' and not rolsuper and not rolbypassrls",
  'myeongha-postgres-isolated-restore-drill-v1',
  'privacy_reconciliation: "not_exercised_by_this_workflow"',
  'dr_ready: false',
];

for (const fragment of requiredHarnessFragments) {
  if (!harness.includes(fragment)) {
    throw new Error(`Missing isolated restore harness contract fragment: ${fragment}`);
  }
}

const forbiddenHarnessFragments = [
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_ACCESS_TOKEN',
  'pooler.supabase.com',
  'api.supabase.com',
  'myeongha.vercel.app',
  'gcloud ',
];

for (const fragment of forbiddenHarnessFragments) {
  if (harness.includes(fragment)) {
    throw new Error(`Forbidden isolated restore harness fragment: ${fragment}`);
  }
}

const requiredRunbookFragments = [
  '.github/workflows/postgres-isolated-restore-drill.yml',
  'GitHub Actions loopback PostgreSQL 17.6',
  'manual-only',
  'does not accept a remote restore database URL',
  'privacy reconciliation is not exercised by the workflow',
  'DR Ready = FALSE / NOT EVIDENCED',
];

for (const fragment of requiredRunbookFragments) {
  if (!runbook.includes(fragment)) {
    throw new Error(`Missing restore-drill runbook contract fragment: ${fragment}`);
  }
}

console.log('MyeongHa isolated PostgreSQL restore drill workflow contract verification passed.');
