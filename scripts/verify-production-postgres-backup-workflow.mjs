import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-postgres-backup.yml';
const runnerPath = 'scripts/operations/export-production-postgres-backup.sh';
const strictTlsHelperPath = 'scripts/operations/prepare-production-postgres-strict-libpq.mjs';
const strictDumpHelperPath = 'scripts/operations/run-production-postgres-strict-dump.sh';
const restoreSourceResolverPath = 'scripts/operations/resolve-postgres-restore-source.sh';
const runbookPath = 'docs/operations/POSTGRES_BACKUP_RESTORE_RUNBOOK_V1.md';

const [workflow, runner, strictTlsHelper, strictDumpHelper, restoreSourceResolver, runbook] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(runnerPath, 'utf8'),
  readFile(strictTlsHelperPath, 'utf8'),
  readFile(strictDumpHelperPath, 'utf8'),
  readFile(restoreSourceResolverPath, 'utf8'),
  readFile(runbookPath, 'utf8'),
]);
const contract = workflow + '\n' + runner + '\n' + strictTlsHelper + '\n' + strictDumpHelper;

const requiredWorkflowFragments = [
  'name: Production PostgreSQL Logical Backup',
  'workflow_dispatch:',
  "cron: '17 18 * * *'",
  'environment: production',
  'uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7',
  'cancel-in-progress: false',
  'SUPABASE_PROJECT_ID: cnsfpcdiyofqvhpcegfc',
  "SUPABASE_CLI_VERSION: '2.117.0'",
  "SUPABASE_POSTGRES_IMAGE: 'supabase/postgres:17.6.1.167'",
  "BACKUP_RETENTION_DAYS: '30'",
  'SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}',
  'SUPABASE_PRODUCTION_SESSION_POOLER_HOST: ${{ secrets.SUPABASE_PRODUCTION_SESSION_POOLER_HOST }}',
  'SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM: ${{ secrets.SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM }}',
  'MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE: ${{ secrets.MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE }}',
  'missing=()',
  'missing+=(SUPABASE_DB_PASSWORD)',
  'missing+=(MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE)',
  'missing+=(SUPABASE_PRODUCTION_SESSION_POOLER_HOST)',
  'missing+=(SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM)',
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
  'prepare-production-postgres-strict-libpq.mjs',
  'run-production-postgres-strict-dump.sh',
  "export PGSSLMODE='verify-full'",
  'export PGSSLROOTCERT="$root_certificate_file"',
  'export PGHOST="$POOL_HOST"',
  'export PGUSER="$ADMIN_POOL_USER"',
  'export PGPASSWORD="$SUPABASE_DB_PASSWORD"',
  'root_certificate_pem_emitted=false',
  'bash scripts/operations/run-production-postgres-strict-dump.sh roles "$backup_dir/roles.sql"',
  'bash scripts/operations/run-production-postgres-strict-dump.sh schema "$backup_dir/schema.sql"',
  'bash scripts/operations/run-production-postgres-strict-dump.sh data "$backup_dir/data.sql"',
  '--mount "type=bind,src=$PGSSLROOTCERT,dst=$container_root_certificate,readonly"',
  '--env PGSSLMODE=verify-full',
  '--env PGSSLROOTCERT="$container_root_certificate"',
  '--env PGPASSWORD',
  '--entrypoint bash',
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
  'sslmode=disable',
  'sslmode=require',
  'sslmode=prefer',
  'SUPABASE_DB_PASSWORD: postgres',
  'echo "$SUPABASE_ACCESS_TOKEN"',
  'echo "$SUPABASE_DB_PASSWORD"',
  'echo "$SUPABASE_PRODUCTION_SESSION_POOLER_HOST"',
  'echo "$MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE"',
  'echo "$db_url"',
  'db_url=',
  'encoded_password=',
  'npx --yes "supabase@$SUPABASE_CLI_VERSION" db dump',
  '--db-url',
  'path: $backup_dir',
  'path: roles.sql',
  'path: schema.sql',
  'path: data.sql',
];

for (const fragment of forbiddenWorkflowFragments) {
  if (contract.includes(fragment)) {
    throw new Error(`Forbidden production backup workflow fragment: ${fragment}`);
  }
}
if ((workflow + '\n' + runner).includes('service_role')) {
  throw new Error('Production backup workflow/runner must not consume service_role credentials.');
}
if (runner.includes('pg_dump ') || runner.includes('pg_dumpall ')) {
  throw new Error('Production backup runner must route dump execution through the strict Docker helper.');
}

if (strictDumpHelper.includes(String.raw`\\\"`)) {
  throw new Error(
    'Production strict dump helper must not double-escape embedded double quotes inside bash -c scripts.',
  );
}
for (const fragment of [
  String.raw`sed -E "s/^CREATE ROLE \"($reserved_roles)\"/-- &/"`,
  String.raw`sed -E "s/^ALTER ROLE \"($reserved_roles)\"/-- &/"`,
  String.raw`sed -E "s/^-- (.* SET \"($allowed_configs)\" .*)/\\1/"`,
  String.raw`sed -E "s/GRANT \".*\" TO \"($reserved_roles)\"/-- &/"`,
  String.raw`sed -E "s/^GRANT (.+) ON (.+) \"($excluded_schemas)\"/-- &/"`,
  String.raw`sed -E "s/^REVOKE (.+) ON (.+) \"($excluded_schemas)\"/-- &/"`,
]) {
  if (!strictDumpHelper.includes(fragment)) {
    throw new Error(`Production strict dump helper missing shell-safe sed fragment: ${fragment}`);
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


if (workflow.includes('push:')) {
  for (const fragment of [
    "'.github/ops/postgres-backup-frontier-1310.once'",
    'Gate one-shot frontier-1310 backup marker',
    'POSTGRES-BACKUP-FRONTIER-1310-V1',
  ]) {
    if (!workflow.includes(fragment)) {
      throw new Error(`One-shot backup bridge missing exact authority fragment: ${fragment}`);
    }
  }
}

const requiredRestoreSourceResolverFragments = [
  '.path == ".github/workflows/production-postgres-backup.yml"',
  '.conclusion == "success"',
  '.head_branch == "main"',
  '(.event == "schedule" or .event == "workflow_dispatch" or .event == "push")',
  '.repository.full_name == env.GITHUB_REPOSITORY',
  "if [[ \"$run_event\" == 'push' ]]",
  '.github/ops/postgres-backup-frontier-1310.once?ref=$source_sha',
  '.github/workflows/production-postgres-backup.yml?ref=$source_sha',
  'POSTGRES-BACKUP-FRONTIER-1310-V1',
  'Gate one-shot frontier-1310 backup marker',
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
  'successful production dump         = EVIDENCED — current-frontier backup run 36294430134',
  'RPO: APPROVED — PT24H (24 hours)',
  'RTO: APPROVED — PT6H (6 hours)',
  'SUPABASE_PRODUCTION_SESSION_POOLER_HOST',
  'one governed mode: the protected explicit Session Pooler host',
  'MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE',
  'data_deletion_jobs',
  'Never restore a drill directly over serving production.',
  'backup schema freshness             = CURRENT — backup frontier 1310 / deployed frontier 1310',
  'current-schema restore              = EVIDENCED — run 36295215761 / frontier 1310',
  'achieved recovery duration',
  'achieved data-loss window',
];

for (const fragment of requiredRunbookFragments) {
  if (!runbook.includes(fragment)) {
    throw new Error(`Missing PostgreSQL recovery runbook contract fragment: ${fragment}`);
  }
}

console.log('MyeongHa production PostgreSQL backup workflow explicit Session Pooler-only contract verification passed.');