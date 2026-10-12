import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
// @ts-expect-error JS-only operational script has no ambient .mjs declarations
import { buildRestoreEvidenceEnvelope } from '../../scripts/build-postgres-restore-evidence-envelope.mjs';

const exporter = readFileSync('scripts/operations/export-production-postgres-backup.sh', 'utf8');
const restore = readFileSync('scripts/run-postgres-isolated-restore-drill.sh', 'utf8');
const sql = readFileSync('scripts/operations/seyeon-relationship-isolated-restore-proof.sql', 'utf8');
const creatorDefaultAcl = readFileSync('scripts/operations/prepare-postgres-isolated-restore-function-defaults.sql', 'utf8');
const sourceSha = 'a'.repeat(40);
const proofHash = 'b'.repeat(64);

function fixture(scoped = true) {
  const backupManifest = {
    schema_version: 'myeongha-postgres-backup-artifact-v1',
    project_ref: 'cnsfpcdiyofqvhpcegfc',
    source_sha: sourceSha,
    created_at_utc: '2026-10-12T03:49:41Z',
    encrypted_sha256: 'c'.repeat(64),
    archive_name: 'myeongha-postgres-20261012T034704Z.tar.gz.enc',
    migration_frontier: 20261008090417,
    ephemeral_data_exclusions: ['public.member_auth_rate_limit_buckets'],
    ...(scoped ? { seyeon_early_relationship_migration_history_sha256: proofHash } : {}),
  };
  const restoreEvidence = {
    schema_version: 'myeongha-postgres-isolated-restore-drill-v1',
    project_ref: backupManifest.project_ref,
    source_sha: sourceSha,
    restore_target: 'github-actions-loopback-supabase-postgres',
    privacy_reconciliation: 'not_exercised_by_this_workflow',
    dr_ready: false,
    backup_migration_frontier: 20261008090417,
    backup_ephemeral_data_exclusions: ['public.member_auth_rate_limit_buckets'],
    restore_started_at_utc: '2026-10-12T03:55:17Z',
    restore_completed_at_utc: '2026-10-12T03:55:20Z',
    isolated_restore_validation_duration_seconds: 3,
    member_auth_rate_limit_schema_restore: 'pass',
    member_auth_rate_limit_unlogged: 'true',
    member_auth_rate_limit_ephemeral_data_restore: 'excluded',
    member_auth_rate_limit_owner_restore: 'pass',
    member_auth_rate_limit_acl_restore: 'pass',
    member_auth_rate_limit_synthetic_admission: 'pass',
    seyeon_early_history_restore_proof:
      scoped ? 'restored_scoped_version_name_snapshot_6_pass' : 'not_captured_in_source_backup',
    seyeon_early_functions_restore_proof:
      scoped ? 'restored_public_function_catalog_11_and_rls_6_pass' : 'not_evidenced',
    supabase_managed_migration_ledger_fully_restored: false,
  };
  return {
    backupManifest,
    restoreEvidence,
    backupRunId: '38201070158',
    incidentReferenceUtc: '2026-10-12T03:49:41Z',
    sourceArtifactName: 'myeongha-postgres-20261012T034704Z',
    sourceArtifactExpiresAt: '2026-11-11T03:49:37Z',
  };
}

describe('Se-yeon post-recovery governed backup to real PG17 catalog proof', () => {
  it('requires exactly six source version/name records without dumping managed SQL history', () => {
    execFileSync('bash', ['-n', 'scripts/operations/export-production-postgres-backup.sh']);
    execFileSync('bash', ['-n', 'scripts/run-postgres-isolated-restore-drill.sh']);
    for (const version of ['1400', '1410', '1420', '1430', '1440', '1450']) {
      expect(exporter).toContain(`"version":"${version}"`);
      expect(sql).toContain(`('${version}',`);
    }
    expect(exporter).toContain("PGOPTIONS='-c default_transaction_read_only=on'");
    expect(exporter).toContain('seyeon_early_history_after="$(capture_seyeon_early_history)"');
    expect(exporter).toContain('seyeon_early_relationship_migration_history: $seyeon_early_history');
    expect(exporter).toContain('seyeon_early_relationship_migration_history_sha256: $seyeon_early_history_sha256');
    expect(exporter).not.toContain('statements,');
  });

  it('checks actual restored pg_proc, privilege, RLS, and exact snapshot in rollback-only temp scope', () => {
    const earlyFunctions = [
      'relationship_event_json_v1',
      'cmd_lock_relationship_apply_context_v1',
      'cmd_apply_relationship_event_runtime_v1',
      'cmd_lock_relationship_history_context_v1',
      'relationship_assert_adjustment_slot_v1',
      'cmd_append_relationship_retraction_runtime_v1',
      'cmd_append_relationship_correction_runtime_v1',
      'cmd_commit_relationship_replay_projection_v1',
      'cmd_rebuild_relationship_projection_runtime_v1',
      'cmd_write_relationship_snapshot_runtime_v1',
      'qry_latest_valid_relationship_snapshot_v1',
    ];
    for (const name of earlyFunctions) expect(sql).toContain(`'${name}'`);
    expect(sql).toContain('pg_catalog.pg_proc');
    expect(sql).toContain("pg_catalog.has_function_privilege('anon'");
    expect(sql).toContain("pg_catalog.has_function_privilege('authenticated'");
    expect(sql).toContain('c.relrowsecurity');
    expect(sql).toContain('CREATE TEMP TABLE');
    expect(sql).toContain("jsonb_to_recordset(:'seyeon_history_json'::jsonb)");
    expect(sql).toContain('ROLLBACK;');
    expect(sql).not.toMatch(/\b(insert\s+into|alter\s+table|delete\s+from|update\s+supabase_migrations|drop\s+table)\s+supabase_migrations/iu);
    expect(restore).toContain('seyeon-relationship-isolated-restore-proof.sql');
    expect(restore).toContain('HOLD_SEYEON_RESTORE_PROOF: legacy backup excludes scoped migration-history snapshot');
    expect(restore).toContain('supabase_managed_migration_ledger_fully_restored: false');
  });

  it('normalizes isolated creator defaults before DDL without changing existing RPC privileges', () => {
    expect(creatorDefaultAcl).toContain('ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;');
    expect(creatorDefaultAcl).toContain('REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;');
    expect(creatorDefaultAcl).toContain('HOLD_SEYEON_RESTORE: creator retains PUBLIC/anon/authenticated default function EXECUTE');
    expect(creatorDefaultAcl).toContain("current_database() = 'postgres' AND current_user = 'supabase_admin'");
    expect(creatorDefaultAcl).toContain("current_database() ~ '^myeongha_ci_case_[0-9]+$'");
    expect(creatorDefaultAcl).toContain("pg_catalog.inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet");
    expect(creatorDefaultAcl).not.toMatch(/\\b(?:REVOKE|GRANT)\\s+.*\\bON\\s+FUNCTION\\b/iu);
    expect(creatorDefaultAcl).not.toContain('supabase_migrations.schema_migrations');
    const aclPosition = restore.indexOf('prepare-postgres-isolated-restore-function-defaults.sql');
    const schemaPosition = restore.indexOf('--file "$work_dir/schema.sql"');
    const exactProofPosition = restore.indexOf('seyeon-relationship-isolated-restore-proof.sql');
    expect(aclPosition).toBeGreaterThanOrEqual(0);
    expect(aclPosition).toBeLessThan(schemaPosition);
    expect(schemaPosition).toBeLessThan(exactProofPosition);
    expect(restore).toContain('HOLD_SEYEON_RESTORE: exact scoped relationship restore proof failed.');
  });

  it('admits a new scoped backup only after SQL execution returns both pass verdicts', () => {
    const envelope = buildRestoreEvidenceEnvelope(fixture());
    expect(envelope.seyeon_early_history_restore_proof).toBe('restored_scoped_version_name_snapshot_6_pass');
    expect(envelope.seyeon_early_functions_restore_proof).toBe('restored_public_function_catalog_11_and_rls_6_pass');
    expect(envelope.source_seyeon_early_history_sha256).toBe(proofHash);
    expect(envelope.supabase_managed_migration_ledger_fully_restored).toBe(false);
    expect(envelope.dr_ready).toBe(false);
  });

  it('rejects an absent, fake or improperly scoped relationship proof', () => {
    const noProof = fixture();
    noProof.restoreEvidence.seyeon_early_functions_restore_proof = 'not_evidenced';
    expect(() => buildRestoreEvidenceEnvelope(noProof)).toThrow(/restoreEvidence.seyeon_early_functions_restore_proof/);

    const missingDigest = fixture();
    delete missingDigest.backupManifest.seyeon_early_relationship_migration_history_sha256;
    expect(() => buildRestoreEvidenceEnvelope(missingDigest)).toThrow(/restoreEvidence.seyeon_early_history_restore_proof/);

    const falseLedger = fixture();
    falseLedger.restoreEvidence.supabase_managed_migration_ledger_fully_restored = true;
    expect(() => buildRestoreEvidenceEnvelope(falseLedger)).toThrow(/supabase_managed_migration_ledger_fully_restored/);

    const corruptDigest = fixture();
    corruptDigest.backupManifest.seyeon_early_relationship_migration_history_sha256 = 'x';
    expect(() => buildRestoreEvidenceEnvelope(corruptDigest)).toThrow(/must be SHA-256/);
  });

  it('accepts historical archives as unproven, never silently upgrades legacy evidence to PASS', () => {
    const envelope = buildRestoreEvidenceEnvelope(fixture(false));
    expect(envelope.source_seyeon_early_history_sha256).toBe(null);
    expect(envelope.seyeon_early_history_restore_proof).toBe('not_captured_in_source_backup');
    expect(envelope.seyeon_early_functions_restore_proof).toBe('not_evidenced');
    expect(envelope.dr_ready).toBe(false);
  });
});
