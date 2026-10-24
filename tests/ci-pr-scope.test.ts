import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { resolveDbPrRouting } from '../scripts/ci/db-pr-router.mjs';
import { resolvePrGates } from '../scripts/ci/pr-gate-router.mjs';

it('routes S0 source SQL and its actual production-table test to the existing PG17 suite', () => {
  for (const path of [
    'scripts/operations/seyeon-security-s0/02-atomic-commit.sql',
    'test/seyeon-security-s0-postgres.e2e.test.ts',
    'test/db/seyeon_security_s0_real_path_pg17.sh',
  ]) {
    expect(resolveDbPrRouting([path]).suites).toContain('postgres17');
    expect(resolvePrGates([path]).db).toBe(true);
  }
});

it('does not schedule Commerce added only to the base while Character work advances', () => {
  const directory = mkdtempSync(join(tmpdir(), 'myeongha-pr-scope-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
  try {
    git('init', '-b', 'fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    git('config', 'user.name', 'CI fixture');
    git('commit', '--allow-empty', '-m', 'common baseline');
    git('branch', 'pr');
    mkdirSync(join(directory, 'supabase', 'migrations'), { recursive: true });
    writeFileSync(join(directory, 'supabase', 'migrations', '1200_commerce_payment.sql'), '-- base-only\n');
    git('add', '.');
    git('commit', '-m', 'unrelated base change');
    git('switch', 'pr');
    mkdirSync(join(directory, 'supabase', 'migrations'), { recursive: true });
    writeFileSync(join(directory, 'supabase', 'migrations', '1308_character_turn.sql'), '-- PR-only\n');
    git('add', '.');
    git('commit', '-m', 'character change');
    const oldPaths = git('diff', '--name-only', 'fixture', 'pr').split('\n');
    const prPaths = git('diff', '--name-only', 'fixture...pr').split('\n');
    expect(resolveDbPrRouting(oldPaths).suites).toContain('commerce-payment');
    expect(resolveDbPrRouting(prPaths).suites).toEqual(['content', 'postgres17']);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('routes SeYeon original-Grant revoke-to-socket regressions to actual PostgreSQL, not just unit tests', () => {
  const changed = ['test/seyeon-r5-current-reveal-disposable.test.ts'];
  expect(resolveDbPrRouting(changed).suites).toEqual(['postgres17']);
  expect(resolvePrGates(changed).db).toBe(true);
  expect(resolveDbPrRouting(['docs/security/SEYEON_D04_REVOKE_ACK_HTTP_SEND_CONTRACT_CANDIDATE_V1.md']).suites)
    .toEqual([]);
});
