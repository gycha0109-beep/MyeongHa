import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/postgres-isolated-restore-drill.yml', 'utf8');
const marker = readFileSync('.github/ops/postgres-restore-backup-39067271230-20261018.once', 'utf8');
const verifier = readFileSync('scripts/verify-postgres-isolated-restore-drill-workflow.mjs', 'utf8');

describe('owner-approved single-use current-frontier backup restore', () => {
  it('requires corrected jq false guard and exact one-shot inventory retry', () => {
    const markerPath = '.github/ops/postgres-restore-provider-rows-retry-40780751650-20261029.once';
    expect(readFileSync(markerPath, 'utf8').trim())
      .toBe('POSTGRES-RESTORE-PROVIDER-ROWS-RETRY-40780751650-20261029-V1');
    expect(workflow).toContain(markerPath);
    expect(workflow).toContain('ops(dr): one-shot provider row inventory retry 40780751650');
    expect(workflow).toContain('incident_reference_utc=2026-10-29T03:05:00Z');
    expect(workflow).toContain('now - point <= 86400');
    expect(workflow).toContain('SCOPED_RESTORE_PROVIDER_ROW_RETRY_ONLY');
    expect(verifier).toContain('triggerMarkers.length !== 7');
    const harness = readFileSync('scripts/run-postgres-isolated-restore-drill.sh', 'utf8');
    expect(harness).toContain(
      "require_report_contract '(.provider_source_counts_include_payloads == false)' 'true'",
    );
  });

  it('pins the newer Production migration backup and its artifact to a separate single-use restore', () => {
    const markerPath = '.github/ops/postgres-restore-backup-40812111605-20261029.once';
    expect(readFileSync(markerPath, 'utf8').trim())
      .toBe('POSTGRES-RESTORE-BACKUP-40812111605-20261029-V1');
    expect(workflow).toContain(markerPath);
    expect(workflow).toContain('ops(dr): one-shot restore backup 40812111605');
    expect(workflow).toContain('backup_run_id=40812111605');
    expect(workflow).toContain('expected_artifact_id=12871016812');
    expect(workflow).toContain('incident_reference_utc=2026-10-29T03:35:00Z');
    expect(workflow).toContain('SCOPED_RESTORE_LATEST_MIGRATION_ONLY');
    expect(verifier).toContain('triggerMarkers.length !== 7');
    expect(verifier).toContain('EXPECTED_BACKUP_ARTIFACT_ID');
  });

  it('replays existing governed backup once for payload-free provider source-row inventory', () => {
    const providerMarker = '.github/ops/postgres-restore-provider-rows-40780751650-20261029.once';
    expect(readFileSync(providerMarker, 'utf8').trim())
      .toBe('POSTGRES-RESTORE-PROVIDER-ROWS-40780751650-20261029-V1');
    expect(workflow).toContain(providerMarker);
    expect(workflow).toContain('ops(dr): one-shot provider row inventory 40780751650');
    expect(workflow).toContain('incident_reference_utc=2026-10-29T02:18:00Z');
    expect(workflow).toContain('now - point <= 86400');
    expect(workflow).toContain('SCOPED_RESTORE_ROW_INVENTORY_ONLY: exact governed backup 40780751650');
    expect(verifier).toContain('triggerMarkers.length !== 7');
    expect(verifier).toContain('POSTGRES-RESTORE-PROVIDER-ROWS-40780751650-20261029-V1');
  });

  it('pins new migration-matched backup to exactly one 24-hour loopback-only marker', () => {
    const markerPath = '.github/ops/postgres-restore-backup-40780751650-20261029.once';
    const latestMarker = readFileSync(markerPath, 'utf8');
    expect(latestMarker.trim()).toBe('POSTGRES-RESTORE-BACKUP-40780751650-20261029-V1');
    expect(workflow).toContain(markerPath);
    expect(workflow).toContain('ops(dr): one-shot restore backup 40780751650');
    expect(workflow).toContain('backup_run_id=40780751650');
    expect(workflow).toContain('incident_reference_utc=2026-10-28T22:37:00Z');
    expect(workflow).toContain('SCOPED_RESTORE_PROOF_ONLY: backup 40780751650; synthetic privacy, no Production writes, no Hosted restore');
    expect(workflow).toContain('now - point <= 86400');
    expect(verifier).toContain('triggerMarkers.length !== 7');
    expect(verifier).toContain('backup_run_id=40780751650');
    expect(verifier).toContain('POSTGRES-RESTORE-BACKUP-40780751650-20261029-V1');
  });
  it('pins the new current-frontier backup to the reviewed one-day loopback-only scope', () => {
    const currentMarker = readFileSync(
      '.github/ops/postgres-restore-backup-40232489516-20261026.once',
      'utf8',
    );
    expect(currentMarker.trim()).toBe('POSTGRES-RESTORE-BACKUP-40232489516-20261026-V1');
    expect(workflow).toContain("'ops(dr): one-shot restore backup 40232489516'");
    expect(workflow).toContain('backup_run_id=40232489516');
    expect(workflow).toContain('incident_reference_utc=2026-10-26T00:00:00Z');
    expect(workflow).toContain('now - point <= 86400');
    expect(workflow).toContain('SCOPED_RESTORE_PROOF_ONLY: backup 40232489516; no Production SQL or privacy canary');
    expect(verifier).toContain('triggerMarkers.length !== 7');
  });
  it('binds one existing encrypted backup, exact reviewed main commit and 4-hour expiry', () => {
    expect(marker.trim()).toBe('POSTGRES-RESTORE-BACKUP-39067271230-20261018-V1');
    expect(workflow).toContain("'ops(dr): one-shot restore backup 39067271230'");
    expect(workflow).toContain("subject=\"$(git show -s --format=%s HEAD)\"");
    expect(workflow).toContain("[[ \"$GITHUB_REF\" == 'refs/heads/main' ]]");
    expect(workflow).toContain('[[ "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]]');
    expect(workflow).toContain('backup_run_id=39067271230');
    expect(workflow).toContain('incident_reference_utc=2026-10-18T08:00:00Z');
    expect(workflow).toContain('now - point <= 14400');
    expect(verifier).toContain('triggerMarkers.length !== 7');
  });

  it('retains the manual interface and isolates restoration from production SQL', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE');
    expect(workflow).toContain('ghcr.io/supabase/postgres@sha256:');
    expect(workflow).toContain('127.0.0.1');
    expect(workflow).not.toContain('SUPABASE_DB_PASSWORD');
    expect(workflow).not.toContain('SUPABASE_PRODUCTION_SESSION_POOLER_HOST');
    expect(workflow).toContain("echo 'dr_ready=false'");
    expect(workflow).toContain('SCOPED_RESTORE_PROOF_ONLY: backup 39067271230; no Production SQL or privacy canary');
  });
});
