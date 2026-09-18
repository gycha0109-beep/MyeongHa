import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transformPortableDataReplay } from './build-postgres-portable-data-replay.mjs';
import { buildRestoreEvidenceEnvelope } from './build-postgres-restore-evidence-envelope.mjs';

const workflowPath = '.github/workflows/postgres-isolated-restore-drill.yml';
const harnessPath = 'scripts/run-postgres-isolated-restore-drill.sh';
const portableDataReplayPath = 'scripts/build-postgres-portable-data-replay.mjs';
const restoreEvidenceEnvelopePath = 'scripts/build-postgres-restore-evidence-envelope.mjs';
const privacySyntheticDrillPath = 'scripts/run-postgres-privacy-reconciliation-synthetic-drill.sh';
const runbookPath = 'docs/operations/POSTGRES_BACKUP_RESTORE_RUNBOOK_V1.md';

const [workflow, harness, portableDataReplay, restoreEvidenceEnvelope, privacySyntheticDrill, runbook] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(harnessPath, 'utf8'),
  readFile(portableDataReplayPath, 'utf8'),
  readFile(restoreEvidenceEnvelopePath, 'utf8'),
  readFile(privacySyntheticDrillPath, 'utf8'),
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
  'Exercise synthetic privacy reconciliation on restored database',
  'PRIVACY_RECONCILIATION_BACKUP_RUN_ID: ${{ inputs.backup_run_id }}',
  'PRIVACY_RECONCILIATION_EVIDENCE_PATH: ${{ runner.temp }}/restore-evidence/privacy-reconciliation-evidence.json',
  'PGHOST: 127.0.0.1',
  'PGPORT: 5432',
  'PGUSER: postgres',
  'PGPASSWORD: restore-drill',
  'PGDATABASE: postgres',
  'export PRIVACY_RECONCILIATION_BACKUP_COMPLETED_AT_UTC',
  'bash scripts/run-postgres-privacy-reconciliation-synthetic-drill.sh',
  'Build self-contained restore evidence envelope',
  'mapfile -t public_manifests',
  'node scripts/build-postgres-restore-evidence-envelope.mjs',
  '--restore-evidence "$RESTORE_EVIDENCE_PATH"',
  '--backup-manifest "${public_manifests[0]}"',
  '--backup-run-id "$BACKUP_RUN_ID"',
  '--incident-reference-utc "$INCIDENT_REFERENCE_UTC"',
  '--source-artifact-name "$SOURCE_ARTIFACT_NAME"',
  '--source-artifact-expires-at "$SOURCE_ARTIFACT_EXPIRES_AT"',
  'Upload restore drill evidence only',
  'uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7',
  '${{ runner.temp }}/restore-evidence/restore-evidence.json',
  '${{ runner.temp }}/restore-evidence/privacy-reconciliation-evidence.json',
  'retention-days: 30',
  "echo 'restore_target=github-actions-loopback-supabase-postgres'",
  "echo 'synthetic_privacy_reconciliation_mechanics=exercised_on_restored_db'",
  "echo 'privacy_reconciliation=not_exercised_by_this_workflow'",
  "echo 'authoritative_privacy_reconciliation=not_exercised'",
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
  '--arg backup_run_id "$BACKUP_RUN_ID"',
  'data_loss_window_seconds=$((incident_epoch - backup_epoch))',
  'tmp_json="$RUNNER_TEMP/restore-evidence.tmp.json"',
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
  'require_report_contract',
  'target-compatible-column-projection',
  'public.subjects',
  'auth.users',
  'auth.users.id was not retained in portable replay',
  'Provider-managed COPY blocks projected to columns supported by the isolated target:',
  'Provider-managed COPY blocks skipped because the isolated target relation cannot safely accept them:',
  'provider_managed_data_blocks_projected',
  'provider_managed_data_projections',
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
  'provider_managed_data_policy: "target-compatible-column-projection-after-checksum"',
  'provider_managed_data_full_restore',
  'auth_users_restore: "identity-continuity-pass"',
  'auth_users_restore_mode',
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
  'myeongha-postgres-portable-data-replay-v2',
  "application_schema_policy: 'public-fail-closed'",
  "provider_schema_policy: 'target-compatible-column-projection'",
  "if (line.startsWith('COPY '))",
  'Application COPY target mismatch',
  'target_relation_missing',
  'source_columns_projected_to_target',
  'target_requires_unbacked_columns',
  'no_copyable_shared_columns',
  'projectCopyRow',
  'COPY row field count mismatch',
  'COPY block missing terminator',
  'projected_provider_copy_blocks',
  'skipped_provider_copy_blocks',
  'replayed_provider_copy_blocks',
  'replayed_provider_relations',
  'replayed_application_relations',
];

for (const fragment of requiredPortableReplayFragments) {
  if (!portableDataReplay.includes(fragment)) throw new Error(`Missing portable data replay contract fragment: ${fragment}`);
}

for (const fragment of ['SUPABASE_DB_PASSWORD', 'SUPABASE_ACCESS_TOKEN', 'pooler.supabase.com', 'audit_log_entries', 'ip_address']) {
  if (portableDataReplay.includes(fragment)) throw new Error(`Portable data replay must remain generic; forbidden fragment: ${fragment}`);
}

for (const fragment of [
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_ACCESS_TOKEN',
  'MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE',
  'pooler.supabase.com',
  'postgresql://',
  'service_role',
]) {
  if (restoreEvidenceEnvelope.includes(fragment)) {
    throw new Error(`Restore evidence envelope must remain secret/connection independent; forbidden fragment: ${fragment}`);
  }
}


const requiredPrivacySyntheticDrillFragments = [
  'PRIVACY_RECONCILIATION_BACKUP_RUN_ID',
  'PRIVACY_RECONCILIATION_BACKUP_COMPLETED_AT_UTC',
  'PRIVACY_RECONCILIATION_EVIDENCE_PATH',
  'synthetic privacy replay fixture collides with existing restored data',
  'sourceAuthority": "synthetic-db-drill"',
  'node scripts/build-postgres-privacy-reconciliation-plan.mjs',
  'first replay establishes revocation and account-deletion-start state',
  'second identical replay is idempotent after subject becomes deletion_pending',
  'deletion-pending replay fails closed when a required terminal revoke is absent',
  'myeongha-postgres-restored-db-privacy-reconciliation-synthetic-v1',
  "execution_target: 'isolated-restored-postgres'",
  'synthetic_fixture: true',
  'authoritative_post_backup_source: false',
  "replay_result: 'pass'",
  "second_identical_replay: 'idempotent-pass'",
  "negative_terminal_state_guard: 'fail-closed-pass'",
  'output_contains_identifiers: false',
  'output_contains_row_payloads: false',
  'dr_ready: false',
];

for (const fragment of requiredPrivacySyntheticDrillFragments) {
  if (!privacySyntheticDrill.includes(fragment)) {
    throw new Error(`Missing restored-db privacy synthetic drill contract fragment: ${fragment}`);
  }
}

for (const fragment of [
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_ACCESS_TOKEN',
  'MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE',
  'pooler.supabase.com',
  'api.supabase.com',
  'myeongha.vercel.app',
  'service_role',
]) {
  if (privacySyntheticDrill.includes(fragment)) {
    throw new Error(`Restored-db privacy synthetic drill must remain production-secret independent: ${fragment}`);
  }
}

const requiredRunbookFragments = [
  '.github/workflows/postgres-isolated-restore-drill.yml',
  'scripts/build-postgres-restore-evidence-envelope.mjs',
  'scripts/run-postgres-privacy-reconciliation-synthetic-drill.sh',
  'synthetic_fixture=true',
  'authoritative_post_backup_source=false',
  'self-contained enough to re-establish the governed source',
  'GitHub Actions loopback Supabase PostgreSQL 17.6.1.166',
  'manual-only',
  'does not accept a remote restore database URL',
  'provider-managed `supabase_*` role',
  'must not fabricate missing provider-managed roles',
  'provider-managed COPY',
  'column projection',
  '`auth.users`',
  '`subjects.auth_user_id`',
  'identity continuity',
  '35280075274',
  'Restore drill: PASSED for MyeongHa application-data portability and application-critical Auth identity continuity',
  'provider_managed_data_full_restore=false',
  'privacy reconciliation is not exercised by the workflow',
  'DR Ready = FALSE / NOT EVIDENCED',
];

for (const fragment of requiredRunbookFragments) {
  if (!runbook.includes(fragment)) throw new Error(`Missing restore-drill runbook contract fragment: ${fragment}`);
}

for (const staleFragment of [
  'RESTORE NOT YET PASSED',
  'Restore drill: EXECUTED / NOT YET PASSED',
  'isolated restore                = NOT YET EVIDENCED',
]) {
  if (runbook.includes(staleFragment)) {
    throw new Error(`Restore-drill runbook contains stale pre-success evidence: ${staleFragment}`);
  }
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
    { table_schema: 'auth', table_name: 'required_target', column_name: 'id', ordinal_position: 1, not_null: true, has_default: false, is_identity: false, is_generated: false },
    { table_schema: 'auth', table_name: 'required_target', column_name: 'target_only_required', ordinal_position: 2, not_null: true, has_default: false, is_identity: false, is_generated: false },
    { table_schema: 'public', table_name: 'subjects', column_name: 'id', ordinal_position: 1, not_null: true, has_default: false, is_identity: false, is_generated: false },
    { table_schema: 'public', table_name: 'subjects', column_name: 'auth_user_id', ordinal_position: 2, not_null: false, has_default: false, is_identity: false, is_generated: false },
  ];
  await writeFile(targetCatalogPath, JSON.stringify(catalog));
  await writeFile(inputPath, [
    'SET statement_timeout = 0;',
    'COPY "auth"."audit_events" ("id", "new_provider_column") FROM stdin;',
    'audit-row\tnew-value',
    '\\.',
    'COPY "auth"."users" ("id", "email", "new_auth_column") FROM stdin;',
    'user-id\tuser@example.invalid\tnew-auth-value',
    '\\.',
    'COPY "auth"."required_target" ("id") FROM stdin;',
    'required-row',
    '\\.',
    'COPY "public"."subjects" ("id", "auth_user_id") FROM stdin;',
    'subject-id\tuser-id',
    '\\.',
    '',
  ].join('\n'));

  const report = await transformPortableDataReplay({ inputPath, outputPath, targetCatalogPath, reportPath });
  const output = await readFile(outputPath, 'utf8');
  if (!output.includes('COPY "auth"."audit_events" ("id") FROM stdin;') || !output.includes('audit-row')) throw new Error('Provider column projection did not preserve compatible audit data.');
  if (output.includes('new_provider_column') || output.includes('new-value')) throw new Error('Provider projection retained a source-only audit column.');
  if (!output.includes('COPY "auth"."users" ("id", "email") FROM stdin;') || !output.includes('user-id\tuser@example.invalid')) throw new Error('Projected auth.users COPY did not preserve identity columns.');
  if (output.includes('new_auth_column') || output.includes('new-auth-value')) throw new Error('Projected auth.users COPY retained a source-only column.');
  if (output.includes('required-row') || output.includes('COPY "auth"."required_target"')) throw new Error('Provider block with unbacked required target columns was not skipped.');
  if (!output.includes('COPY "public"."subjects"') || !output.includes('subject-id')) throw new Error('Application COPY block was not preserved.');
  if (report.projected_provider_copy_blocks.length !== 2) throw new Error('Provider projection report count is incorrect.');
  if (report.skipped_provider_copy_blocks.length !== 1 || report.skipped_provider_copy_blocks[0].table !== 'required_target') throw new Error('Provider skip report is incorrect.');
  const authUsersReplay = report.replayed_provider_copy_blocks.filter((block) => block.schema === 'auth' && block.table === 'users');
  if (authUsersReplay.length !== 1 || authUsersReplay[0].mode !== 'project' || !authUsersReplay[0].replayed_columns.includes('id')) throw new Error('auth.users identity-continuity projection evidence is missing.');
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


const restoreEvidenceFixture = {
  schema_version: 'myeongha-postgres-isolated-restore-drill-v1',
  source_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  project_ref: 'cnsfpcdiyofqvhpcegfc',
  restore_target: 'github-actions-loopback-supabase-postgres',
  restore_execution_principal: 'supabase_admin-loopback-only',
  post_restore_validation_principal: 'postgres-loopback-only',
  restore_server_version: '17.6',
  restore_started_at_utc: '2026-09-17T22:04:40Z',
  restore_completed_at_utc: '2026-09-17T22:04:43Z',
  isolated_restore_validation_duration_seconds: 3,
  archive_integrity: 'pass',
  application_role_restore: 'pass',
  application_role_membership_restore: 'pass',
  application_owner_restore: 'pass',
  provider_managed_data_full_restore: false,
  auth_users_restore: 'identity-continuity-pass',
  subject_auth_user_referential_integrity: 'pass',
  required_tables: 'pass',
  authorization_baseline: 'pass',
  privacy_reconciliation: 'not_exercised_by_this_workflow',
  dr_ready: false,
};

const backupManifestFixture = {
  schema_version: 'myeongha-postgres-backup-artifact-v1',
  project_ref: 'cnsfpcdiyofqvhpcegfc',
  source_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  created_at_utc: '2026-09-17T18:42:39Z',
  encrypted_sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  archive_name: 'myeongha-postgres-20260917T184004Z.tar.gz.enc',
};

const envelope = buildRestoreEvidenceEnvelope({
  restoreEvidence: restoreEvidenceFixture,
  backupManifest: backupManifestFixture,
  backupRunId: '35260191079',
  incidentReferenceUtc: '2026-09-17T18:44:01Z',
  sourceArtifactName: 'myeongha-postgres-20260917T184004Z',
  sourceArtifactExpiresAt: '2026-10-17T18:40:04Z',
});
if (envelope.evidence_envelope_version !== 'myeongha-postgres-isolated-restore-evidence-envelope-v1') {
  throw new Error('Restore evidence envelope version is missing.');
}
if (envelope.backup_workflow_run_id !== '35260191079') {
  throw new Error('Restore evidence envelope did not retain the governed backup run id.');
}
if (envelope.backup_completed_at_utc !== '2026-09-17T18:42:39Z') {
  throw new Error('Restore evidence envelope did not bind the selected backup completion point.');
}
if (envelope.synthetic_data_loss_window_seconds !== 82) {
  throw new Error('Restore evidence envelope did not derive the synthetic data-loss window.');
}
if (envelope.source_archive_name !== backupManifestFixture.archive_name) {
  throw new Error('Restore evidence envelope did not retain the encrypted archive name.');
}
if (envelope.source_encrypted_sha256 !== backupManifestFixture.encrypted_sha256) {
  throw new Error('Restore evidence envelope did not retain the encrypted archive digest.');
}
if (envelope.dr_ready !== false || envelope.privacy_reconciliation !== 'not_exercised_by_this_workflow') {
  throw new Error('Restore evidence envelope weakened the DR/privacy boundary.');
}

let sourceMismatchRejected = false;
try {
  buildRestoreEvidenceEnvelope({
    restoreEvidence: restoreEvidenceFixture,
    backupManifest: { ...backupManifestFixture, source_sha: 'cccccccccccccccccccccccccccccccccccccccc' },
    backupRunId: '35260191079',
    incidentReferenceUtc: '2026-09-17T18:44:01Z',
    sourceArtifactName: 'myeongha-postgres-20260917T184004Z',
    sourceArtifactExpiresAt: '2026-10-17T18:40:04Z',
  });
} catch (error) {
  sourceMismatchRejected = String(error).includes('backupManifest.source_sha');
}
if (!sourceMismatchRejected) throw new Error('Restore evidence envelope accepted a source SHA mismatch.');

let preexistingEnrichmentRejected = false;
try {
  buildRestoreEvidenceEnvelope({
    restoreEvidence: { ...restoreEvidenceFixture, backup_workflow_run_id: '1' },
    backupManifest: backupManifestFixture,
    backupRunId: '35260191079',
    incidentReferenceUtc: '2026-09-17T18:44:01Z',
    sourceArtifactName: 'myeongha-postgres-20260917T184004Z',
    sourceArtifactExpiresAt: '2026-10-17T18:40:04Z',
  });
} catch (error) {
  preexistingEnrichmentRejected = String(error).includes('refusing overwrite');
}
if (!preexistingEnrichmentRejected) {
  throw new Error('Restore evidence envelope allowed preexisting enrichment fields to be overwritten.');
}

let badDurationRejected = false;
try {
  buildRestoreEvidenceEnvelope({
    restoreEvidence: { ...restoreEvidenceFixture, isolated_restore_validation_duration_seconds: 2 },
    backupManifest: backupManifestFixture,
    backupRunId: '35260191079',
    incidentReferenceUtc: '2026-09-17T18:44:01Z',
    sourceArtifactName: 'myeongha-postgres-20260917T184004Z',
    sourceArtifactExpiresAt: '2026-10-17T18:40:04Z',
  });
} catch (error) {
  badDurationRejected = String(error).includes('restore duration');
}
if (!badDurationRejected) throw new Error('Restore evidence envelope accepted inconsistent timing evidence.');

let preBackupIncidentRejected = false;
try {
  buildRestoreEvidenceEnvelope({
    restoreEvidence: restoreEvidenceFixture,
    backupManifest: backupManifestFixture,
    backupRunId: '35260191079',
    incidentReferenceUtc: '2026-09-17T18:42:38Z',
    sourceArtifactName: 'myeongha-postgres-20260917T184004Z',
    sourceArtifactExpiresAt: '2026-10-17T18:40:04Z',
  });
} catch (error) {
  preBackupIncidentRejected = String(error).includes('cannot precede');
}
if (!preBackupIncidentRejected) {
  throw new Error('Restore evidence envelope accepted an incident reference before the backup completion point.');
}

let postRestoreIncidentRejected = false;
try {
  buildRestoreEvidenceEnvelope({
    restoreEvidence: restoreEvidenceFixture,
    backupManifest: backupManifestFixture,
    backupRunId: '35260191079',
    incidentReferenceUtc: '2026-09-17T22:04:41Z',
    sourceArtifactName: 'myeongha-postgres-20260917T184004Z',
    sourceArtifactExpiresAt: '2026-10-17T18:40:04Z',
  });
} catch (error) {
  postRestoreIncidentRejected = String(error).includes('later than the restore start');
}
if (!postRestoreIncidentRejected) {
  throw new Error('Restore evidence envelope accepted an incident reference after restore start.');
}

let artifactArchiveMismatchRejected = false;
try {
  buildRestoreEvidenceEnvelope({
    restoreEvidence: restoreEvidenceFixture,
    backupManifest: {
      ...backupManifestFixture,
      archive_name: 'myeongha-postgres-20260917T184005Z.tar.gz.enc',
    },
    backupRunId: '35260191079',
    incidentReferenceUtc: '2026-09-17T18:44:01Z',
    sourceArtifactName: 'myeongha-postgres-20260917T184004Z',
    sourceArtifactExpiresAt: '2026-10-17T18:40:04Z',
  });
} catch (error) {
  artifactArchiveMismatchRejected = String(error).includes('selected governed artifact name');
}
if (!artifactArchiveMismatchRejected) {
  throw new Error('Restore evidence envelope accepted a mismatched artifact/archive binding.');
}

console.log('MyeongHa isolated PostgreSQL restore drill workflow contract verification passed.');
