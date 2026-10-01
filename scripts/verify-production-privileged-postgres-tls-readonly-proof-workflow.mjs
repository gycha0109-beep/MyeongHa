import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-privileged-postgres-tls-readonly-proof.yml';
const runnerPath = 'scripts/operations/run-production-privileged-postgres-tls-readonly-proof.sh';
const strictLibpqPath = 'scripts/operations/prepare-production-postgres-strict-libpq.mjs';

const [workflow, runner, strictLibpq] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(runnerPath, 'utf8'),
  readFile(strictLibpqPath, 'utf8'),
]);

const requiredWorkflowFragments = [
  'name: Production Privileged PostgreSQL TLS Read-Only Proof',
  'run-name: "[WT:security] Production Privileged PostgreSQL TLS Read-Only Proof"',
  'workflow_dispatch:',
  'Type VERIFY_PRIVILEGED_POSTGRES_TLS_READONLY_D1',
  'default: security',
  'permissions:\n  contents: read',
  'environment: production',
  'SUPABASE_PROJECT_ID: cnsfpcdiyofqvhpcegfc',
  'SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}',
  'SUPABASE_PRODUCTION_SESSION_POOLER_HOST: ${{ secrets.SUPABASE_PRODUCTION_SESSION_POOLER_HOST }}',
  'SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM: ${{ secrets.SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM }}',
  'uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7',
  'uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7',
  "[[ \"$GITHUB_REF\" == 'refs/heads/main' ]]",
  "[[ \"$MYEONGHA_WATCHTOWER_TRACK\" == 'security' ]]",
  'sudo apt-get install -y postgresql-client',
  'bash scripts/operations/run-production-privileged-postgres-tls-readonly-proof.sh',
];

for (const fragment of requiredWorkflowFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`Missing privileged PostgreSQL TLS read-only workflow fragment: ${fragment}`);
  }
}

for (const forbidden of [
  'pull_request:',
  'pull_request_target:',
  'schedule:',
  'repository_dispatch:',
  'contents: write',
  'actions: write',
  'id-token: write',
]) {
  if (workflow.includes(forbidden)) {
    throw new Error(`Forbidden privileged PostgreSQL TLS read-only workflow fragment: ${forbidden}`);
  }
}

const requiredRunnerFragments = [
  "begin transaction read only;",
  "current_setting('transaction_read_only')",
  'rollback;',
  'prepare-production-postgres-strict-libpq.mjs',
  'export PGHOST="$SUPABASE_PRODUCTION_SESSION_POOLER_HOST"',
  "export PGPORT='5432'",
  'export PGUSER="$admin_pool_user"',
  'export PGPASSWORD="$SUPABASE_DB_PASSWORD"',
  "export PGDATABASE='postgres'",
  "export PGSSLMODE='verify-full'",
  'export PGSSLROOTCERT="$root_certificate_file"',
  'psql -X -qAt -v ON_ERROR_STOP=1',
  '2>"$work_dir/psql-error.log"',
  'project_ref=cnsfpcdiyofqvhpcegfc',
  'database_principal=postgres.cnsfpcdiyofqvhpcegfc',
  'endpoint_authority_pinned=true',
  'tls_mode=verify-full',
  'peer_verification=full',
  'root_certificate_pinned=true',
  'default_hostname_verification=true',
  'connection_succeeded=true',
  'transaction_read_only=true',
  'write_executed=false',
  'database_url_emitted=false',
  'credential_material_emitted=false',
  'root_certificate_pem_emitted=false',
];

for (const fragment of requiredRunnerFragments) {
  if (!runner.includes(fragment)) {
    throw new Error(`Missing privileged PostgreSQL TLS read-only runner fragment: ${fragment}`);
  }
}

for (const forbidden of [
  'postgres://',
  'postgresql://',
  '--db-url',
  'db_url=',
  'MYEONGHA_DATABASE_URL',
  'SUPABASE_DB_URL',
  'sslmode=require',
  'sslmode=prefer',
  'sslmode=disable',
  'service_role',
  'echo "$SUPABASE_DB_PASSWORD"',
  'echo "$SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM"',
  'pg_stat_ssl',
]) {
  if ((workflow + '\n' + runner).includes(forbidden)) {
    throw new Error(`Forbidden privileged PostgreSQL TLS read-only contract fragment: ${forbidden}`);
  }
}

if (/(^|[;\n]\s*)(?:insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|copy)\b/imu.test(runner)) {
  throw new Error('Production privileged PostgreSQL TLS proof must not contain a write-capable SQL statement.');
}

for (const fragment of [
  "tlsMode: 'verify-full'",
  "peerVerification: 'full'",
  'rootCertificatePinned: true',
  'rootCertificatePemEmitted: false',
  'databaseUrlEmitted: false',
  'credentialMaterialEmitted: false',
]) {
  if (!strictLibpq.includes(fragment)) {
    throw new Error(`Strict libpq authority missing read-only proof dependency fragment: ${fragment}`);
  }
}

console.log(
  'MyeongHa Production privileged PostgreSQL TLS read-only proof contract verification passed: client-side verify-full with pinned root, explicit READ ONLY transaction, successful connection, and zero write SQL are pinned.',
);
