import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const workflow = readFileSync(resolve('.github/workflows/supabase-production.yml'), 'utf8');
const runner = resolve('scripts/operations/run-supabase-production-migrations.sh');
const prefix = '      - name: Determine governed Production DB relevance';
const dispatchStart = workflow.indexOf('        run: |\n', workflow.indexOf(prefix));
const dispatchEnd = workflow.indexOf('\n  deploy:', dispatchStart);
const dispatchScript = dispatchStart < 0 || dispatchEnd < 0
  ? ''
  : workflow.slice(dispatchStart + '        run: |\n'.length, dispatchEnd)
    .split('\n').map(line => line.startsWith('          ') ? line.slice(10) : line).join('\n');

function withSyntheticGit(check: (context: { dir: string; bin: string }) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'myeongha-reader-stage-hold-'));
  const bin = join(dir, 'bin');
  try {
    mkdirSync(bin);
    const git = join(bin, 'git');
    writeFileSync(git, [
      '#!/bin/sh',
      'case "$1" in',
      "  show) printf '%s\\n' 'synthetic CI staging commit' ;;",
      '  cat-file) exit 0 ;;',
      '  diff) printf "%s\\n" "$SYNTHETIC_CHANGED_FILES" ;;',
      '  *) exit 4 ;;',
      'esac',
      '',
    ].join('\n'));
    chmodSync(git, 0o755);
    check({ dir, bin });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function syntheticChangeGate(bin: string, dir: string, changed: string): { status: number | null; output: string; stderr: string } {
  const output = join(dir, 'result-output');
  const summary = join(dir, 'result-summary');
  writeFileSync(output, '');
  writeFileSync(summary, '');
  const process = spawnSync('bash', ['-c', dispatchScript], {
    cwd: dir, encoding: 'utf8',
    env: {
      ...globalThis.process.env,
      PATH: bin + ':' + (globalThis.process.env.PATH ?? ''),
      EVENT_NAME: 'push',
      BEFORE_SHA: 'a'.repeat(40),
      CURRENT_SHA: 'b'.repeat(40),
      SCOPED_BACKFILL: 'false',
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
      SYNTHETIC_CHANGED_FILES: changed,
    },
  });
  return { status: process.status, output: readFileSync(output, 'utf8'), stderr: process.stderr };
}

describe('Official Reader staged SQL cannot enter ordinary Production deployment', () => {
  it('skips Reader-only staging, rejects mixed migrations and retains unrelated deployment routing', () => {
    expect(dispatchScript).toContain('HOLD_READER_MIXED_PRODUCTION_DEPLOY');
    withSyntheticGit(({ dir, bin }) => {
      const reader = 'supabase/migrations/1740_official_reader_scope_lock_private_v1.sql';
      const staged = syntheticChangeGate(bin, dir, [
        '.github/workflows/supabase-production.yml',
        'scripts/operations/run-supabase-production-migrations.sh',
        reader,
      ].join('\n'));
      expect(staged.status).toBe(0);
      expect(staged.output).toContain('requires_deploy=false');

      const mixed = syntheticChangeGate(bin, dir, [
        reader, 'supabase/migrations/20261024235959_unrelated_sql.sql',
      ].join('\n'));
      expect(mixed.status).not.toBe(0);
      expect(mixed.stderr).toContain('HOLD_READER_MIXED_PRODUCTION_DEPLOY');

      const unrelated = syntheticChangeGate(bin, dir,
        'supabase/migrations/20261024235959_unrelated_sql.sql');
      expect(unrelated.status).toBe(0);
      expect(unrelated.output).toContain('requires_deploy=true');
    });
  });

  it('blocks the ordinary runner before reaching any external DB or Supabase CLI', () => {
    withSyntheticGit(({ dir, bin }) => {
      const migrations = join(dir, 'supabase', 'migrations');
      mkdirSync(migrations, { recursive: true });
      writeFileSync(join(migrations, '1740_official_reader_scope_lock_private_v1.sql'), '-- synthetic, not Production\n');
      const marker = join(dir, 'unexpected-db-call');
      for (const cmd of ['psql', 'supabase']) {
        const file = join(bin, cmd);
        writeFileSync(file, '#!/bin/sh\nprintf invoked > "$SYNTHETIC_DB_MARKER"\nexit 99\n');
        chmodSync(file, 0o755);
      }
      const outcome = spawnSync('bash', [runner], {
        cwd: dir, encoding: 'utf8',
        env: {
          ...globalThis.process.env,
          PATH: bin + ':' + (globalThis.process.env.PATH ?? ''),
          SUPABASE_PROJECT_ID: 'cnsfpcdiyofqvhpcegfc',
          SUPABASE_DB_PASSWORD: 'synthetic-not-production',
          SUPABASE_PRODUCTION_SESSION_POOLER_HOST: 'synthetic.pooler.supabase.com',
          SUPABASE_PROMOTION_REPAIR_ONLY: 'false',
          SUPABASE_SEYEON_MANIFEST_ACL_REPAIR_ONLY: 'false',
          SYNTHETIC_DB_MARKER: marker,
        },
      });
      expect(outcome.status).not.toBe(0);
      expect(outcome.stderr).toContain('HOLD_OFFICIAL_READER_1740_2290');
      expect(existsSync(marker)).toBe(false);
    });
  });
});
