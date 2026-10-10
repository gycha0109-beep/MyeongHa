import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const yaml = readFileSync('.github/workflows/postgres-isolated-restore-drill.yml','utf8');
const resolver = readFileSync('scripts/operations/resolve-postgres-restore-source.sh','utf8');
const producer = readFileSync('.github/workflows/production-postgres-backup.yml','utf8');

describe('single-use verified Production backup isolated restore', () => {
  it('pins one source, requires an exact reviewed push title and self-expires', () => {
    expect(yaml).toContain("startsWith(github.event.head_commit.message, 'ops(dr): one-shot restore backup 38088591661')");
    expect(yaml).toContain("backup_run_id=38088591661");
    expect(yaml).toContain('2026-10-10T21:44:36Z');
    expect(yaml).toContain('now - point <= 14400');
    expect(yaml).toContain('POSTGRES-RESTORE-SEYEON-20261008090417-V1');
    expect(yaml).toContain('postgres-restore-seyeon-20261008090417.once');
    expect(yaml).toContain("refs/heads/main");
    expect(yaml).toContain('SCOPED_RESTORE_PROOF_ONLY');
  });
  it('retains the existing user dispatch interface and exact restore inputs', () => {
    expect(yaml).toContain('workflow_dispatch:');
    expect(yaml).toContain('BACKUP_RUN_ID: ${{ github.event_name == \'workflow_dispatch\' && inputs.backup_run_id || steps.one_shot.outputs.backup_run_id }}');
    expect(yaml).toContain('INCIDENT_REFERENCE_UTC: ${{ github.event_name == \'workflow_dispatch\' && inputs.incident_reference_utc || steps.one_shot.outputs.incident_reference_utc }}');
    expect(yaml).toContain("MYEONGHA_WATCHTOWER_TRACK: ${{ github.event_name == 'workflow_dispatch' && inputs.watchtower_track || 'ops' }}");
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
