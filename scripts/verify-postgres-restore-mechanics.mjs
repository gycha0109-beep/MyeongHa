import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transformPortableDataReplay } from './build-postgres-portable-data-replay.mjs';
import { buildRestoreEvidenceEnvelope } from './build-postgres-restore-evidence-envelope.mjs';

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


console.log('MyeongHa PostgreSQL portable replay and restore evidence mechanics verification passed.');
