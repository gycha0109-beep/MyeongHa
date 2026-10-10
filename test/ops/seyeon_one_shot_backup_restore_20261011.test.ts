import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const yaml = readFileSync('.github/workflows/postgres-isolated-restore-drill.yml','utf8');
const resolver = readFileSync('scripts/operations/resolve-postgres-restore-source.sh','utf8');
const producer = readFileSync('.github/workflows/production-postgres-backup.yml','utf8');

describe('single-use verified Production backup isolated restore', () => {
  it('pins one source, requires an exact reviewed push title and self-expires', () => {
    expect(yaml).toContain("startsWith(github.event.head_commit.message, 'ops(dr): one-shot restore backup 38088591661')");
    expect(yaml).toContain("RESTORE_BACKUP_RUN_ID: ${{ github.event_name == 'push' && '38088591661' || inputs.backup_run_id }}");
    expect(yaml).toContain('2026-10-10T21:44:36Z');
    expect(yaml).toContain('now - point <= 14400');
    expect(yaml).toContain("refs/heads/main");
    expect(yaml).toContain('SCOPED_RESTORE_PROOF_ONLY');
  });
  it('retains the existing user dispatch interface and exact restore inputs', () => {
    expect(yaml).toContain('workflow_dispatch:');
    expect(yaml).toContain("RESTORE_BACKUP_RUN_ID: ${{ github.event_name");
    expect(yaml).toContain("RESTORE_INCIDENT_REFERENCE_UTC: ${{ github.event_name");
    expect(yaml).toContain('BACKUP_RUN_ID: ${{ env.RESTORE_BACKUP_RUN_ID }}');
    expect(yaml).toContain('INCIDENT_REFERENCE_UTC: ${{ env.RESTORE_INCIDENT_REFERENCE_UTC }}');
    expect(yaml).toContain('run-id: ${{ env.RESTORE_BACKUP_RUN_ID }}');
    expect(yaml).toContain("MYEONGHA_WATCHTOWER_TRACK: ${{ github.event_name == 'push' && 'ops' || inputs.watchtower_track }}");
  });
  it('runs only in fixed loopback PostgreSQL, consuming encrypted artifact but no DB password', () => {
    expect(yaml).toContain('ghcr.io/supabase/postgres@sha256:');
    expect(yaml).toContain('EXPECTED_PROJECT_REF: cnsfpcdiyofqvhpcegfc');
    expect(yaml).toContain('MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE: ${{ secrets.MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE }}');
    expect(yaml).not.toContain('SUPABASE_DB_PASSWORD');
    expect(yaml).not.toContain('SUPABASE_PRODUCTION_SESSION_POOLER_HOST');
    expect(yaml).not.toMatch(/\bsupabase (?:db push|migration repair)\b/);
    expect(resolver).toContain('production-postgres-backup.yml');
    expect(producer).toContain('encrypted-logical-backup');
    expect(yaml).toContain('dr_ready=false');
  });
});
