// Watchtower-Track: security
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = resolve('scripts/operations/install-seyeon-first-zero-sql-one-shot.sh');
const workflow = readFileSync('.github/workflows/seyeon-first-zero-locked-function-one-shot.yml', 'utf8');
const body = readFileSync(script, 'utf8');

function syntheticRun(confirmation: string, admission: string) {
  const temp = mkdtempSync(join(tmpdir(), 'myeongha-first-zero-sql-only-'));
  const bin = join(temp, 'bin');
  mkdirSync(bin);
  const trace = join(temp, 'commands');
  const psql = join(bin, 'psql');
  const supabase = join(bin, 'supabase');
  const sqlFake = [
    '#!/usr/bin/env bash',
    'echo psql >> "$SYNTHETIC_TRACE"',
    'if [[ "$*" == *" -f "* ]]; then exit 0; fi',
    'echo "$SYNTHETIC_ADMISSION"',
    '',
  ].join('\n');
  writeFileSync(psql, sqlFake);
  writeFileSync(supabase, '#!/usr/bin/env bash\necho supabase >> "$SYNTHETIC_TRACE"\n');
  chmodSync(psql, 0o755);
  chmodSync(supabase, 0o755);
  const currentSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  let errored = false;
  try {
    execFileSync('bash', [script], {
      stdio: 'pipe',
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: bin + ':' + (process.env.PATH ?? ''),
        GITHUB_SHA: currentSha,
        GITHUB_REF: 'refs/heads/main',
        REVIEWED_MAIN_SHA: currentSha,
        SCOPED_CONFIRMATION: confirmation,
        SUPABASE_PROJECT_ID: 'cnsfpcdiyofqvhpcegfc',
        SUPABASE_DB_PASSWORD: 'synthetic-only',
        SUPABASE_PRODUCTION_SESSION_POOLER_HOST: 'fake.pooler.supabase.com',
        SYNTHETIC_TRACE: trace,
        SYNTHETIC_ADMISSION: admission,
      },
    });
  } catch {
    errored = true;
  }
  const commands = existsSync(trace) ? readFileSync(trace, 'utf8').trim().split('\n') : [];
  rmSync(temp, { recursive: true, force: true });
  return { errored, commands };
}

describe('Seyeon first zero-source one-shot Production SQL gate', () => {
  it('keeps a manual only, exact main SHA + production environment gate', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/\n  push:/);
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('group: supabase-production-migrations');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain('version: 2.116.0');
    expect(workflow).toContain('REVIEWED_MAIN_SHA:');
    expect(workflow).toContain('SCOPED_CONFIRMATION:');
  });

  it('pins the exact reviewed SQL, refuses generic migrations and verifies strict ACL', () => {
    expect(body).toContain('002da74911ee6c9f2d0d31b56ca69391b0c3d5c6');
    expect(body).toContain('git hash-object "$migration"');
    expect(body).toContain('INSTALL_SEYEON_FIRST_ZERO_FUNCTION_ONLY');
    expect(body).toContain('refs/heads/main');
    expect(body).toContain('PGOPTIONS=\'-c default_transaction_read_only=on\'');
    expect(body).toContain('HOLD_FUNCTION_ALREADY_INSTALLED');
    expect(body).toContain('HOLD_MIGRATION_ALREADY_RECORDED');
    expect(body).toContain("pg_get_userbyid(p.proowner)='postgres'");
    expect(body).toContain("not has_function_privilege('anon',p.oid,'EXECUTE')");
    expect(body).toContain("not has_function_privilege('authenticated',p.oid,'EXECUTE')");
    expect(body).toContain("not has_function_privilege('service_role',p.oid,'EXECUTE')");
    expect(body).toContain('supabase migration repair "$version" --status applied');
    expect(body).not.toMatch(/supabase db push|--include-all|--status reverted/);
  });

  it('rejects absent explicit confirmation before invoking any DB or CLI command', () => {
    const attempt = syntheticRun('WRONG_SCOPE', 'ALLOW_EXACT_FIRST_ZERO_FUNCTION_ONLY');
    expect(attempt.errored).toBe(true);
    expect(attempt.commands).toEqual([]);
  });

  it('rejects a read-only catalog denial without any DDL or migration repair', () => {
    const attempt = syntheticRun('INSTALL_SEYEON_FIRST_ZERO_FUNCTION_ONLY', 'HOLD_MISSING_AUTHORITATIVE_CONTEXT');
    expect(attempt.errored).toBe(true);
    expect(attempt.commands).toEqual(['psql']);
  });

  it('does not repair migration history when post-install ACL proof fails', () => {
    const attempt = syntheticRun('INSTALL_SEYEON_FIRST_ZERO_FUNCTION_ONLY', 'ALLOW_EXACT_FIRST_ZERO_FUNCTION_ONLY');
    expect(attempt.errored).toBe(true);
    expect(attempt.commands).toEqual(['psql', 'psql', 'psql']);
  });
});
