import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-postgres-backup.yml';
const runbookPath = 'docs/operations/POSTGRES_BACKUP_RESTORE_RUNBOOK_V1.md';

const [workflow, runbook] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(runbookPath, 'utf8'),
]);

const requiredWorkflowFragments = [
  'name: Production PostgreSQL Logical Backup',
  'workflow_dispatch:',
  "cron: '17 18 * * *'",
  'environment: production',
  'cancel-in-progress: false',
  'SUPABASE_PROJECT_ID: cnsfpcdiyofqvhpcegfc',
  "SUPABASE_CLI_VERSION: '2.117.0'",
  "BACKUP_RETENTION_DAYS: '30'",
  'SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}',
  'SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}',
  'MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE: ${{ secrets.MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE }}',
  'https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_ID/config/database/pooler',
  'select((.database_type // "") == "PRIMARY")',
  "[[ \"$pool_port\" == '5432' ]]",
  'npx --yes "supabase@$SUPABASE_CLI_VERSION" db dump',
  '--role-only',
  '-f "$backup_dir/schema.sql"',
  '--use-copy',
  '--data-only',
  "-x 'storage.buckets_vectors'",
  "-x 'storage.vector_indexes'",
  'sha256sum',
  'openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000',
  'rm -f "$plaintext_archive"',
  'uses: actions/upload-artifact@v4',
  'retention-days: 30',
  'compression-level: 0',
  'backup_status=success',
];

for (const fragment of requiredWorkflowFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`Missing production backup workflow contract fragment: ${fragment}`);
  }
}

const forbiddenWorkflowFragments = [
  'service_role',
  'sslmode=disable',
  'SUPABASE_DB_PASSWORD: postgres',
  'echo "$SUPABASE_DB_PASSWORD"',
  'echo "$MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE"',
  'path: $backup_dir',
  'path: roles.sql',
  'path: schema.sql',
  'path: data.sql',
  'pg_dump ',
];

for (const fragment of forbiddenWorkflowFragments) {
  if (workflow.includes(fragment)) {
    throw new Error(`Forbidden production backup workflow fragment: ${fragment}`);
  }
}

const encryptIndex = workflow.indexOf('openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000');
const plaintextDeleteIndex = workflow.indexOf('rm -f "$plaintext_archive"');
const uploadIndex = workflow.indexOf('uses: actions/upload-artifact@v4');
if (encryptIndex < 0 || plaintextDeleteIndex < 0 || uploadIndex < 0) {
  throw new Error('Backup encryption/upload ordering markers are missing.');
}
if (!(encryptIndex < plaintextDeleteIndex && plaintextDeleteIndex < uploadIndex)) {
  throw new Error('Plaintext backup must be encrypted and removed before artifact upload.');
}

const requiredRunbookFragments = [
  'Production state: IMPLEMENTED / NOT YET PRODUCTION-PROVEN',
  'Current Supabase organization plan: `free`',
  'PITR',
  'NOT AVAILABLE UNDER THE CURRENT FREE-PLAN OPERATING BASELINE',
  'Restore drill: NOT YET EVIDENCED',
  'RPO: OPEN DECISION',
  'RTO: OPEN DECISION',
  'MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE',
  'data_deletion_jobs',
  'never restore directly over the serving production project',
  'achieved recovery duration',
  'achieved data-loss window',
];

for (const fragment of requiredRunbookFragments) {
  if (!runbook.includes(fragment)) {
    throw new Error(`Missing PostgreSQL recovery runbook contract fragment: ${fragment}`);
  }
}

console.log('MyeongHa production PostgreSQL backup workflow contract verification passed.');
