import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const scriptPath = 'scripts/operations/seyeon-production-relationship-backfill-guarded.sh';
const code = readFileSync(scriptPath, 'utf8');
const workflow = readFileSync('.github/workflows/supabase-production.yml', 'utf8');
const pre = readFileSync('scripts/operations/seyeon-relationship-backfill-transaction-pre.sql', 'utf8');
const post = readFileSync('scripts/operations/seyeon-relationship-backfill-transaction-post.sql', 'utf8');
const shadow = readFileSync('test/db/seyeon_remote_bundle_pg17_isolated.sh', 'utf8');

describe('Se-yeon scoped Production relationship migration restore', () => {
  it('is Bash-valid and rejects ordinary local/PR execution before any database or GitHub access', () => {
    expect(() => execFileSync('bash', ['-n', scriptPath], { stdio: 'pipe' })).not.toThrow();
    expect(() => execFileSync('bash', [scriptPath], {
      stdio: 'pipe',
      env: { ...process.env, GITHUB_ACTIONS: 'false', CI: 'false',
        SUPABASE_DB_PASSWORD: '', SEYEON_SCOPE_CONFIRMATION: '' },
    })).toThrow();
    expect(code).toContain("refs/heads/main");
    expect(code).toContain("gycha0109-beep/MyeongHa");
    expect(code).toContain("APPLY_RELATIONSHIP_1400_1450_ONLY");
  });
  it('demands fresh governed backup and matching independent restore artifact', () => {
    expect(code).toContain('backup_epoch >= now_epoch - 14400');
    expect(code).toContain('backup_workflow_run_id');
    expect(code).toContain('backup_migration_frontier');
    expect(code).toContain('20261008090417');
    expect(code).toContain('postgres-isolated-restore-drill-');
    expect(code).toContain('source_encrypted_sha256');
    expect(code).toContain('SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM');
    expect(code).toContain('PGSSLMODE=verify-full');
    expect(code).toContain('current protected main HEAD');
  });
  it('isolates manual backfill from ordinary Production migration deployment', () => {
    expect(workflow).toContain('relationship_backfill_1400_1450:');
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain("inputs.relationship_backfill_1400_1450 == true");
    expect(workflow).toContain("reason='manual scoped Se-yeon backfill must never invoke ordinary db push'");
    expect(workflow).toContain('requires_deploy=false');
    expect(workflow).toContain('concurrency:\n  group: supabase-production-migrations');
    expect(code).not.toMatch(/^\\s*supabase (?:db push|migration repair)/m);
    expect(code).toContain('psql -X -q --single-transaction -v ON_ERROR_STOP=1');
  });
  it('enforces exactly six historical versions and fingerprints later 18 RPCs in the same transaction', () => {
    expect(pre).toContain('pg_try_advisory_xact_lock(14001450)');
    expect(pre).toContain('relationship_event_records');
    expect(pre).toContain('relationship_state_snapshots');
    expect(pre).toContain('4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894');
    expect(pre).toContain('seyeon_before_backfill_fingerprint');
    expect(pre).toContain('later dependent migrations already present');
    expect(pre).toContain('later history marker names have changed');
    for (const version of ['1400','1410','1420','1430','1440','1450']) {
      expect(post).toContain("'" + version + "'");
      expect(code).toContain('supabase/migrations/' + version + '_');
    }
    expect(post).toContain('later runtime definition/Owner/ACL fingerprint changed');
    expect(post).toContain('unexpectedly exposed to public roles');
    expect(post).toContain('PASS_SEYEON_SCOPED_1400_1450_TRANSACTION');
    expect(shadow).toContain('seyeon-relationship-backfill-transaction-pre.sql');
    expect(shadow).toContain('seyeon-relationship-backfill-transaction-post.sql');
    expect(shadow).toContain('Local-only exact incident ledger fixture failed.');
    expect(workflow).not.toContain('SEYEON_SCOPE_CONFIRMATION: APPLY_RELATIONSHIP_1400_1450_ONLY');
  });
});
