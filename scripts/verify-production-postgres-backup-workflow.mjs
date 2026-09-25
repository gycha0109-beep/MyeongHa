import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-postgres-backup.yml';
const runnerPath = 'scripts/operations/export-production-postgres-backup.sh';
const restoreSourceResolverPath = 'scripts/operations/resolve-postgres-restore-source.sh';
const runbookPath = 'docs/operations/POSTGRES_BACKUP_RESTORE_RUNBOOK_V1.md';

const [workflow, runner, restoreSourceResolver, runbook] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(runnerPath, 'utf8'),
  readFile(restoreSourceResolverPath, 'utf8'),
  readFile(runbookPath, 'utf8'),
]);
const contract = workflow + '\n' + runner;

const requiredWorkflowFragments = [
  'name: Production PostgreSQL Logical Backup',
  'workflow_dispatch:',
  "cron: '17 18 * * *'",
  'environment: production',
  'uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7',
  'cancel-in-progress: false',
  'SUPABASE_PROJECT_ID: cnsfpcdiyofqvhpcegfc',
  "SUPABASE_CLI_VERSION: '2.117.0'",
  "BACKUP_RETENTION_DAYS: '30'",
  'SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}',
  'SUPABASE_PRODUCTION_SESSION_POOLER_HOST: ${{ secrets.SUPABASE_PRODUCTION_SESSION_POOLER_HOST }}',
  'MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE: ${{ secrets.MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE }}',
  'missing=()',
  'missing+=(SUPABASE_DB_PASSWORD)',
  'missing+=(MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE)',
  'missing+=(SUPABASE_PRODUCTION_SESSION_POOLER_HOST)',
  'SUPABASE_PRODUCTION_SESSION_POOLER_HOST must be a bare *.pooler.supabase.com hostname.',
  '::error title=Production backup credential missing::Missing Actions secret: $secret_name',
  '::error title=Production backup encryption secret invalid::MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE must be at least 32 characters.',
  'GITHUB_STEP_SUMMARY',
  'admin_pool_user="postgres.$SUPABASE_PROJECT_ID"',
  'pool_host="$SUPABASE_PRODUCTION_SESSION_POOLER_HOST"',
  "pool_port='5432'",
  "pool_db='postgres'",
  '[[ "$pool_host" =~ ^[a-z0-9-]+([.][a-z0-9-]+)*[.]pooler[.]supabase[.]com$ ]]',
  "[[ \"$pool_port\" == '5432' ]]",
  'npx --yes "supabase@$SUPABASE_CLI_VERSION" db dump',
  '--db-url "$db_url"',
  '--role-only',
  '-f "$backup_dir/schema.sql"',
  '--use-copy',
  '--data-only',
  "-x 'storage.buckets_vectors'",
  "-x 'storage.vector_indexes'",
  'echo "::add-mask::$db_url"',
  'cd "$backup_dir"',
  'sha256sum roles.sql schema.sql data.sql > plaintext-sha256.txt',
  'openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000',
  'rm -f "$plaintext_archive"',
  'uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7',
  'retention-days: 30',
  'compression-level: 0',
  'backup_status=success',
];

for (const fragment of requiredWorkflowFragments) {
  if (!contract.includes(fragment)) {
    throw new Error(`Missing production backup workflow contract fragment: ${fragment}`);
  }
}

const forbiddenWorkflowFragments = [
  'SUPABASE_ACCESS_TOKEN',
  'api.supabase.com',
  '/config/database/pooler',
  'uses: actions/checkout@v7',
  'uses: actions/upload-artifact@v7',
  'uses: actions/checkout@v4',
  'uses: actions/upload-artifact@v4',
  'service_role',
  'sslmode=disable',
  'SUPABASE_DB_PASSWORD: postgres',
  'echo "$SUPABASE_ACCESS_TOKEN"',
  'echo "$SUPABASE_DB_PASSWORD"',
  'echo "$SUPABASE_PRODUCTION_SESSION_POOLER_HOST"',
  'echo "$MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE"',
  'echo "$db_url"',
  'path: $backup_dir',
  'path: roles.sql',
  'path: schema.sql',
  'path: data.sql',
  'pg_dump ',
];

for (const fragment of forbiddenWorkflowFragments) {
  if (contract.includes(fragment)) {
    throw new Error(`Forbidden production backup workflow fragment: ${fragment}`);
  }
}

const encryptIndex = runner.indexOf('openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000');
const plaintextDeleteIndex = runner.indexOf('rm -f "$plaintext_archive"');
const runnerStepIndex = workflow.indexOf('run: bash scripts/operations/export-production-postgres-backup.sh');
const uploadIndex = workflow.indexOf('uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7');
if (encryptIndex < 0 || plaintextDeleteIndex < 0 || runnerStepIndex < 0 || uploadIndex < 0) {
  throw new Error('Backup encryption/upload ordering markers are missing.');
}
if (!(encryptIndex < plaintextDeleteIndex && runnerStepIndex < uploadIndex)) {
  throw new Error('Plaintext backup must be encrypted and removed by the runner before artifact upload.');
}


const requiredRestoreSourceResolverFragments = [
  '.path == ".github/workflows/production-postgres-backup.yml"',
  '.conclusion == "success"',
  '.head_branch == "main"',
  '(.event == "schedule" or .event == "workflow_dispatch")',
  '.repository.full_name == env.GITHUB_REPOSITORY',
];
for (const fragment of requiredRestoreSourceResolverFragments) {
  if (!restoreSourceResolver.includes(fragment)) {
    throw new Error(`Missing restore-source resolver authority fragment: ${fragment}`);
  }
}
if (restoreSourceResolver.includes('.name == "Production PostgreSQL Logical Backup"')) {
  throw new Error('Restore-source resolver must bind to canonical workflow path, not mutable workflow/run display name.');
}

const requiredRunbookFragments = [
  'CURRENT-FRONTIER BACKUP+RESTORE PROVEN',
  'Current Supabase organization plan: `free`',
  'PITR',
  'NOT AVAILABLE UNDER THE CURRENT FREE-PLAN OPERATING BASELINE',
  'successful production dump         = EVIDENCED — current-frontier backup run 35944326928',
  'RPO: APPROVED — PT24H (24 hours)',
  'RTO: APPROVED — PT6H (6 hours)',
  'SUPABASE_PRODUCTION_SESSION_POOLER_HOST',
  'preferred explicit Session Pooler host',
  'MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE',
  'data_deletion_jobs',
  'Never restore a drill directly over serving production.',
  'backup schema freshness             = CURRENT — backup frontier 1305 / deployed frontier 1305',
  'current-schema restore              = EVIDENCED — run 35947730074 / frontier 1305',
  'achieved recovery duration',
  'achieved data-loss window',
];

for (const fragment of requiredRunbookFragments) {
  if (!runbook.includes(fragment)) {
    throw new Error(`Missing PostgreSQL recovery runbook contract fragment: ${fragment}`);
  }
}

console.log('MyeongHa production PostgreSQL backup workflow explicit Session Pooler-only contract verification passed.');