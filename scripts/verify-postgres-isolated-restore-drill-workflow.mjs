import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transformPortableDataReplay } from './build-postgres-portable-data-replay.mjs';

const workflowPath = '.github/workflows/postgres-isolated-restore-drill.yml';
const harnessPath = 'scripts/run-postgres-isolated-restore-drill.sh';
const portableDataReplayPath = 'scripts/build-postgres-portable-data-replay.mjs';
const runbookPath = 'docs/operations/POSTGRES_BACKUP_RESTORE_RUNBOOK_V1.md';

const [workflow, harness, portableDataReplay, runbook] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(harnessPath, 'utf8'),
  readFile(portableDataReplayPath, 'utf8'),
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
  'uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7',
  'image: ghcr.io/supabase/postgres:17.6.1.166',
  'POSTGRES_PASSWORD: restore-drill',
  'POSTGRES_DB: postgres',
  '--health-cmd "pg_isready -U postgres -d postgres"',
  '--health-start-period 30s',
  'EXPECTED_PROJECT_REF: cnsfpcdiyofqvhpcegfc',
  'MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE: ${{ secrets.MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE }}',
  '.name == "Production PostgreSQL Logical Backup"',
  '.path == ".github/workflows/production-postgres-backup.yml"',
  '.conclusion == "success"',
  '.head_branch == "main"',
  '(.event == "schedule" or .event == "workflow_dispatch")',
  '.expired == false',
  '^myeongha-postgres-[0-9]{8}T[0-9]{6}Z$',
  'uses: actions/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131 # v7',
  'run-id: ${{ inputs.backup_run_id }}',
  'artifact-ids: ${{ steps.source.outputs.artifact_id }}',
  'merge-multiple: true',
  'bash scripts/run-postgres-isolated-restore-drill.sh',
  'Upload restore drill evidence only',
  'uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7',
  'path: ${{ runner.temp }}/restore-evidence/restore-evidence.json',
  'retention-days: 30',
  "echo 'restore_target=github-actions-loopback-supabase-postgres'",
  "echo 'privacy_reconciliation=not_exercised_by_this_workflow'",
  "echo 'dr_ready=false'",
];

for (const fragment of requiredWorkflowFragments) {
  if (!workflow.includes(fragment)) throw new Error(`Missing isolated restore workflow contract fragment: ${fragment}`);
}

const forbiddenWorkflowFragments = [
  'uses: actions/checkout@v7',
  'uses: actions/download-artifact@v7',
  'uses: actions/upload-artifact@v7',
  'uses: actions/checkout@v4',
  'uses: actions/download-artifact@v4',
  'uses: actions/upload-artifact@v4',
  '\n  push:',
  '\n  schedule:',
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_ACCESS_TOKEN',
  'pooler.supabase.com',
  'api.supabase.com/v1/projects',
  'service_role',
  'image: postgres:17.6',
  'POSTGRES_USER: postgres',
  'path: ${{ runner.temp }}/backup-artifact\n          retention-days:',
  'path: roles.sql',
  'path: schema.sql',
  'path: data.sql',
];

for (const fragment of forbiddenWorkflowFragments) {
  if (workflow.includes(fragment)) throw new Error(`Forbidden isolated restore workflow fragment: ${fragment}`);
}

const requiredHarnessFragments = [
  "readonly RESTORE_DATABASE_URL='postgresql://postgres:restore-drill@127.0.0.1:5432/postgres'",
  "readonly RESTORE_ADMIN_DATABASE_URL='postgresql://supabase_admin:restore-drill@127.0.0.1:5432/postgres'",
  "select current_user = 'supabase_admin' and rolsuper from pg_roles where rolname = current_user;",
  'EXPECTED_PROJECT_REF',
  'EXPECTED_SOURCE_SHA',
  'myeongha-postgres-backup-artifact-v1',
  'myeongha-postgres-logical-backup-v1',
  'sha256sum -c',
  'openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000',
  "printf '%s\\n' data.sql manifest.json plaintext-sha256.txt roles.sql schema.sql",
  'normalized_plaintext_checksum="$work_dir/plaintext-sha256.normalized.txt"',
  'declare -A seen_plaintext_checksum_names=()',
  'checksum_name="${checksum_path##*/}"',
  'roles.sql|schema.sql|data.sql',
  'sha256sum -c "$(basename "$normalized_plaintext_checksum")"',
  "grep -Eiv '^[[:space:]]*CREATE[[:space:]]+(ROLE|USER)[[:space:]]+\"myeongha_[a-z0-9_]+\"'",
  'normalized_application_memberships',
  'unsupported postgres grantor-provenance statement',
  'portable_roles="$work_dir/roles.portable.sql"',
  'Portable roles replay still contains postgres grantor provenance.',
  'psql "$RESTORE_ADMIN_DATABASE_URL" --set ON_ERROR_STOP=0 --set VERBOSITY=terse',
  '--file "$portable_roles"',
  'ERROR:[[:space:]]+role "supabase_[a-z0-9_]+" does not exist$',
  'provider_managed_roles_absent',
  'roles.sql contains a non-MyeongHa role creation; refusing to fabricate platform or unknown roles.',
  'pg_auth_members',
  'am.inherit_option = ${expected_inherit}',
  'Application role membership was not restored exactly once:',
  "rolname like 'myeongha\\\\_%' escape '\\\\' and (rolsuper or rolbypassrls)",
  'psql "$RESTORE_ADMIN_DATABASE_URL" --single-transaction --set ON_ERROR_STOP=1 --file "$work_dir/schema.sql"',
  'target-copy-catalog.json',
  'from information_schema.columns',
  "where table_schema not in ('pg_catalog', 'information_schema')",
  'node scripts/build-postgres-portable-data-replay.mjs',
  '--input "$work_dir/data.sql"',
  '--target-catalog "$target_copy_catalog"',
  '--report "$portable_data_report"',
  'target-compatible-copy-only',
  'public.subjects',
  'auth.users',
  'Provider-managed COPY blocks skipped because the isolated target schema is older or missing those provider relations:',
  'psql "$RESTORE_ADMIN_DATABASE_URL" --single-transaction --set ON_ERROR_STOP=1',
  "--command 'SET session_replication_role = replica' --file \"$portable_data\"",
  'subjects birth_profiles products product_offers data_deletion_jobs',
  "rolname='myeongha_api_executor' and not rolsuper and not rolbypassrls",
  "to_regprocedure('public.cmd_activate_content_release_v1(uuid,boolean)')",
  "== 'myeongha_content_publication_owner'",
  'left join auth.users u on u.id = s.auth_user_id',
  'where s.auth_user_id is not null and u.id is null',
  'myeongha-postgres-isolated-restore-drill-v1',
  'restore_execution_principal: "supabase_admin-loopback-only"',
  'post_restore_validation_principal: "postgres-loopback-only"',
  'application_role_restore: "pass"',
  'application_role_membership_restore: "pass"',
  'normalized_application_membership_grantor_count',
  'application_owner_restore: "pass"',
  'provider_managed_role_policy: "target-baseline-authoritative-no-fabrication"',
  'provider_managed_roles_absent_from_target',
  'provider_managed_data_policy: "target-compatible-copy-only-after-checksum"',
  'provider_managed_data_full_restore',
  'auth_users_restore: "pass"',
  'subject_auth_user_referential_integrity: "pass"',
  'restore_target: "github-actions-loopback-supabase-postgres"',
  'privacy_reconciliation: "not_exercised_by_this_workflow"',
  'dr_ready: false',
];

for (const fragment of requiredHarnessFragments) {
  if (!harness.includes(fragment)) throw new Error(`Missing isolated restore harness contract fragment: ${fragment}`);
}

const forbiddenHarnessFragments = [
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_ACCESS_TOKEN',
  'pooler.supabase.com',
  'api.supabase.com',
  'myeongha.vercel.app',
  'gcloud ',
  'sha256sum -c plaintext-sha256.txt',
  'CREATE ROLE "supabase_realtime_admin"',
  'CREATE USER supabase_realtime_admin',
  'psql "$RESTORE_DATABASE_URL" --single-transaction --set ON_ERROR_STOP=1 --file "$work_dir/schema.sql"',
  "sed -E 's/GRANTED[[:space:]]+BY",
  'audit_log_entries',
  'ip_address',
];

for (const fragment of forbiddenHarnessFragments) {
  if (harness.includes(fragment)) throw new Error(`Forbidden isolated restore harness fragment: ${fragment}`);
}

const requiredPortableReplayFragments = [
  'myeongha-postgres-portable-data-replay-v1',
  "application_schema_policy: 'public-fail-closed'",
  "provider_schema_policy: 'target-compatible-copy-only'",
  "if (line.startsWith('COPY '))",
  'Application COPY target mismatch',
  'target_relation_missing',
  'source_columns_missing_from_target',
  'target_requires_unbacked_columns',
  'COPY block missing terminator',
  'skipped_provider_copy_blocks',
  'replayed_provider_relations',
  'replayed_application_relations',
];

for (const fragment of requiredPortableReplayFragments) {
  if (!portableDataReplay.includes(fragment)) throw new Error(`Missing portable data replay contract fragment: ${fragment}`);
}

for (const fragment of ['SUPABASE_DB_PASSWORD', 'SUPABASE_ACCESS_TOKEN', 'pooler.supabase.com', 'audit_log_entries', 'ip_address']) {
  if (portableDataReplay.includes(fragment)) throw new Error(`Portable data replay must remain generic; forbidden fragment: ${fragment}`);
}

const requiredRunbookFragments = [
  '.github/workflows/postgres-isolated-restore-drill.yml',
  'GitHub Actions loopback Supabase PostgreSQL 17.6.1.166',
  'manual-only',
  'does not accept a remote restore database URL',
  'provider-managed `supabase_*` role',
  'must not fabricate missing provider-managed roles',
  'provider-managed COPY',
  '`auth.users`',
  '`subjects.auth_user_id`',
  'privacy reconciliation is not exercised by the workflow',
  'DR Ready = FALSE / NOT EVIDENCED',
];

for (const fragment of requiredRunbookFragments) {
  if (!runbook.includes(fragment)) throw new Error(`Missing restore-drill runbook contract fragment: ${fragment}`);
}

const tempRoot = await mkdtemp(join(tmpdir(), 'myeongha-portable-data-replay-'));
try {
  const targetCatalogPath = join(tempRoot, 'target-catalog.json');
  const inputPath = join(tempRoot, 'data.sql');
  const outputPath = join(tempRoot, 'data.portable.sql');
  const reportPath = join(tempRoot, 'report.json');
  const catalog = [
    { table_schema: 'auth', table_name: 'audit_events', column_name: 'id', ordinal_position: 1, not_null: true, has_default: false, is_identity: false, is_generated: false },
    { table_schema: 'auth', table_name: 'users', column_name: 'id', ordinal_position: 1, not_null: true, has_default: false, is_identity: false, is_generated: false },
    { table_schema: 'auth', table_name: 'users', column_name: 'email', ordinal_position: 2, not_null: false, has_default: false, is_identity: false, is_generated: false },
    { table_schema: 'public', table_name: 'subjects', column_name: 'id', ordinal_position: 1, not_null: true, has_default: false, is_identity: false, is_generated: false },
    { table_schema: 'public', table_name: 'subjects', column_name: 'auth_user_id', ordinal_position: 2, not_null: false, has_default: false, is_identity: false, is_generated: false },
  ];
  await writeFile(targetCatalogPath, JSON.stringify(catalog));
  await writeFile(inputPath, [
    'SET statement_timeout = 0;',
    'COPY "auth"."audit_events" ("id", "new_provider_column") FROM stdin;',
    'audit-row\tnew-value',
    '\\.',
    'COPY "auth"."users" ("id", "email") FROM stdin;',
    'user-id\tuser@example.invalid',
    '\\.',
    'COPY "public"."subjects" ("id", "auth_user_id") FROM stdin;',
    'subject-id\tuser-id',
    '\\.',
    '',
  ].join('\n'));

  const report = await transformPortableDataReplay({ inputPath, outputPath, targetCatalogPath, reportPath });
  const output = await readFile(outputPath, 'utf8');
  if (output.includes('audit-row') || output.includes('new_provider_column')) throw new Error('Provider-incompatible COPY block was not removed.');
  if (!output.includes('COPY "auth"."users"') || !output.includes('user@example.invalid')) throw new Error('Compatible auth.users COPY block was not preserved.');
  if (!output.includes('COPY "public"."subjects"') || !output.includes('subject-id')) throw new Error('Application COPY block was not preserved.');
  if (report.skipped_provider_copy_blocks.length !== 1 || report.skipped_provider_copy_blocks[0].table !== 'audit_events') throw new Error('Provider mismatch report is incorrect.');
  if (!report.replayed_provider_relations.includes('auth.users')) throw new Error('auth.users compatibility evidence is missing.');

  const badCatalogPath = join(tempRoot, 'bad-target-catalog.json');
  const badInputPath = join(tempRoot, 'bad-data.sql');
  const badOutputPath = join(tempRoot, 'bad-data.portable.sql');
  const badReportPath = join(tempRoot, 'bad-report.json');
  await writeFile(badCatalogPath, JSON.stringify(catalog.filter((row) => !(row.table_schema === 'public' && row.column_name === 'auth_user_id'))));
  await writeFile(badInputPath, 'COPY "public"."subjects" ("id", "auth_user_id") FROM stdin;\nsubject-id\tuser-id\n\\.\n');
  let applicationMismatchRejected = false;
  try {
    await transformPortableDataReplay({ inputPath: badInputPath, outputPath: badOutputPath, targetCatalogPath: badCatalogPath, reportPath: badReportPath });
  } catch (error) {
    applicationMismatchRejected = String(error).includes('Application COPY target mismatch');
  }
  if (!applicationMismatchRejected) throw new Error('Application-owned COPY mismatch did not fail closed.');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log('MyeongHa isolated PostgreSQL restore drill workflow contract verification passed.');
