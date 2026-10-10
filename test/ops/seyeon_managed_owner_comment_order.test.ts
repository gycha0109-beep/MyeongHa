import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = 'scripts/operations/stage-seyeon-managed-owner-comment-order.py';
const sourceDir = 'supabase/migrations';
const names = [
  '1400_relationship_apply_context_v1.sql',
  '1410_relationship_event_apply_command_v1.sql',
  '1420_relationship_reliability_context_v1.sql',
  '1430_relationship_adjustment_commands_v1.sql',
  '1440_relationship_projection_rebuild_v1.sql',
  '1450_relationship_snapshot_runtime_v1.sql',
];
const tmpRoots: string[] = [];
const scratch = () => { const root = mkdtempSync(join(tmpdir(), 'seyeon-owner-order-')); tmpRoots.push(root); return root; };
afterEach(() => { for (const root of tmpRoots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('non-superuser managed function owner COMMENT staging', () => {
  it('reorders only the closing role revoke, not source SQL or function definition', () => {
    const root = scratch();
    const output = join(root, 'output');
    mkdirSync(output);
    expect(() => execFileSync('python3', [script, '--source-dir', sourceDir, '--output-dir', output])).not.toThrow();
    for (const name of names) {
      const original = readFileSync(join(sourceDir, name), 'utf8');
      const staged = readFileSync(join(output, name), 'utf8');
      const marker = 'revoke myeongha_relationship_apply_owner from current_user;';
      expect(original.indexOf(marker)).toBeGreaterThan(-1);
      expect(original.lastIndexOf('comment on function public.')).toBeGreaterThan(original.indexOf(marker));
      const grant = 'grant myeongha_relationship_apply_owner to current_user;';
      const grantAt = original.indexOf(grant);
      const revokeAt = original.indexOf(marker);
      expect(staged.indexOf(marker)).toBe(staged.lastIndexOf(marker));
      expect(grantAt).toBeGreaterThan(0);
      expect(staged).toContain(original.slice(0, grantAt).trimEnd());
      expect(staged).toContain(original.slice(grantAt, revokeAt + marker.length));
      expect(staged).toContain(original.slice(revokeAt + marker.length).trim());
      expect(staged.lastIndexOf('comment on function public.')).toBeLessThan(staged.indexOf(grant));
      expect(staged.indexOf(marker)).toBeGreaterThan(staged.indexOf(grant));
      expect(readFileSync(join(sourceDir, name), 'utf8')).toBe(original);
    }
  });
  it('rejects even a whitespace-only change to pinned immutable migration source', () => {
    const root = scratch();
    const source = join(root, 'source');
    const dest = join(root, 'output');
    mkdirSync(source);
    mkdirSync(dest);
    for (const name of names) cpSync(join(sourceDir, name), join(source, name));
    const p = join(source, names[0]);
    writeFileSync(p, readFileSync(p, 'utf8') + '\n');
    expect(() => execFileSync('python3', [script, '--source-dir', source, '--output-dir', dest], { stdio: 'pipe' })).toThrow();
  });
  it('keeps exact Production and disposable PG17 runner bound to the same staged source', () => {
    const prod = readFileSync('scripts/operations/seyeon-production-relationship-backfill-guarded.sh', 'utf8');
    const shadow = readFileSync('test/db/seyeon_remote_bundle_pg17_isolated.sh', 'utf8');
    expect(prod).toContain('stage-seyeon-managed-owner-comment-order.py');
    expect(shadow).toContain('stage-seyeon-managed-owner-comment-order.py');
    expect(shadow).toContain('alter role postgres nosuperuser createrole createdb');
    expect(shadow).toContain('Disposable PG17 executor is unexpectedly superuser.');
    for (const name of names) {
      expect(prod).toContain('managed-owner-migrations/' + name);
      expect(shadow).toContain('managed-owner-migrations/');
    }
    expect(prod).toContain('psql -X -q --single-transaction -v ON_ERROR_STOP=1');
    expect(prod).toContain('PGSSLMODE=verify-full');
  });
});
