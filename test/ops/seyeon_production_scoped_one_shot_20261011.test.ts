import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const flow = readFileSync('.github/workflows/supabase-production.yml','utf8');
const script = readFileSync('scripts/operations/seyeon-production-relationship-backfill-guarded.sh','utf8');
const marker = readFileSync('.github/ops/seyeon-relationship-1400-1450-restore-38090483306.once','utf8').trim();
const expectedTitle = 'ops(seyeon): apply one-shot 1400-1450 38088591661 38090483306';

describe('one-shot guarded Production Se-yeon relationship backfill', () => {
  it('requires the reviewed marker + exact main commit title, forbids mixing migrations', () => {
    expect(marker).toBe('SEYEON-SCOPED-BACKFILL-1400-1450-38088591661-38090483306-V1');
    expect(flow).toContain(expectedTitle);
    expect(flow).toContain("git show -s --format=%s");
    expect(flow).toContain('HOLD_ONE_SHOT_BACKFILL: one-shot marker not in reviewed merge');
    expect(flow).toContain('HOLD_ONE_SHOT_BACKFILL: migration SQL modified with one-shot');
    expect(flow).toContain('HOLD_ONE_SHOT_BACKFILL: unexpected marker');
    expect(flow).toContain('refs/heads/main');
  });
  it('keeps ordinary Production db push disabled on the exact one-shot event', () => {
    expect(flow).toContain("reason='protected exact-head one-shot backfill must never invoke ordinary db push'");
    expect(flow).toContain('requires_deploy=false');
    expect(flow).toContain("needs.change-gate.outputs.requires_deploy == 'true'");
    expect(flow).toContain("needs: change-gate");
    expect(flow).toContain("github.event_name == 'workflow_dispatch' && inputs.relationship_backfill_1400_1450 == true");
  });
  it('pins successful backup+restore IDs without weakening existing runtime evidence checks', () => {
    expect(flow).toContain("SEYEON_BACKUP_RUN_ID: ${{ github.event_name == 'push' && '38088591661' || inputs.backup_run_id }}");
    expect(flow).toContain("SEYEON_RESTORE_RUN_ID: ${{ github.event_name == 'push' && '38090483306' || inputs.restore_run_id }}");
    expect(flow).toContain("SEYEON_SCOPE_CONFIRMATION: ${{ github.event_name == 'push' && 'APPLY_RELATIONSHIP_1400_1450_ONLY' || inputs.scoped_confirmation }}");
    expect(script).toContain('backup_epoch >= now_epoch - 14400');
    expect(script).toContain('source_encrypted_sha256');
    expect(script).toContain('member_auth_rate_limit_acl_restore');
    expect(script).toContain('SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM');
    expect(script).toContain('PGSSLMODE=verify-full');
    expect(script).toContain('psql -X -q --single-transaction -v ON_ERROR_STOP=1');
    expect(script).toContain('seyeon-production-acl-recovery-readonly.sql');
  });
  it('retains production environment protection and controlled GitHub action token', () => {
    expect(flow).toContain('concurrency:\n  group: supabase-production-migrations');
    expect(flow).toContain('environment: production');
    expect(flow).toContain('GH_TOKEN: ${{ github.token }}');
    expect(flow).toContain('permissions:\n      contents: read\n      actions: read');
    expect(flow).toContain('persist-credentials: false');
  });
});
