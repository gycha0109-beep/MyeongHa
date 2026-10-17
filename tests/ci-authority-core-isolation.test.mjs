import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const mainScript = readFileSync('test/db/run_authority_core.sh', 'utf8');
const marker = '\nbash test/db/verify_no_schema_cardinality_hardcoding.sh';
const prefix = mainScript.slice(0, mainScript.indexOf(marker));

function runFixture({ profile = false, failure = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'myeongha-authority-isolation-'));
  try {
    mkdirSync(join(directory, 'test', 'db'), { recursive: true });
    mkdirSync(join(directory, 'supabase', 'migrations'), { recursive: true });
    writeFileSync(join(directory, 'test', 'db', 'bootstrap_supabase_auth_stub.sql'), '-- synthetic\n');
    writeFileSync(join(directory, 'supabase', 'migrations', '000001_synthetic.sql'), '-- synthetic\n');
    const logPath = join(directory, 'mock-commands.log');
    const mock = [
      'psql() { printf "psql|%s|%s\\n" "$PGDATABASE" "$*" >> "$MOCK_COMMANDS"; }',
      'createdb() { printf "createdb|%s\\n" "$*" >> "$MOCK_COMMANDS"; }',
      'dropdb() { printf "dropdb|%s\\n" "$*" >> "$MOCK_COMMANDS"; }',
    ].join('\n');
    const body = failure
      ? ['run_isolated_case myeongha_case_failed false', 'echo UNREACHABLE'].join('\n')
      : [
        "run_isolated_case myeongha_case_one bash -c 'echo case-one:$PGDATABASE'",
        "run_isolated_case myeongha_case_two bash -c 'echo case-two:$PGDATABASE'",
        "authority_profile_stage 'complete'",
      ].join('\n');
    const result = spawnSync('bash', ['-c', prefix + '\n' + mock + '\n' + body], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        CI: 'true',
        PGHOST: 'localhost',
        PGDATABASE: 'myeongha_test',
        MYEONGHA_AUTHORITY_PROFILE: profile ? '1' : '0',
        MOCK_COMMANDS: logPath,
      },
    });
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    return { ...result, calls: lines };
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

describe.skipIf(process.platform === 'win32')('disposable authority-core template isolation', () => {
  it('creates and migrates one parent template, clones each fresh case and cleans up', () => {
    const result = runFixture({ profile: true });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.calls.filter(line => line.includes('select 1 from pg_database'))).toHaveLength(1);
    expect(result.calls.filter(line => line === 'createdb|myeongha_authority_core_template')).toHaveLength(1);
    expect(result.calls.filter(line => line.includes('bootstrap_supabase_auth_stub.sql'))).toHaveLength(1);
    expect(result.calls.filter(line => line.includes('000001_synthetic.sql'))).toHaveLength(1);
    expect(result.calls.filter(line => line.includes('createdb|--template=myeongha_authority_core_template'))).toEqual([
      'createdb|--template=myeongha_authority_core_template myeongha_case_one',
      'createdb|--template=myeongha_authority_core_template myeongha_case_two',
    ]);
    expect(result.stdout).toContain('case-one:myeongha_case_one');
    expect(result.stdout).toContain('case-two:myeongha_case_two');
    expect(result.stdout).toContain('AUTHORITY_CORE_CASE db=myeongha_case_one duration_seconds=');
    expect(result.stdout).toContain('AUTHORITY_CORE_STAGE stage=baseline-and-early-guards');
    expect(result.stdout).toContain('AUTHORITY_CORE_TEMPLATE source=created create_ms=');
    expect(result.stdout).toMatch(/AUTHORITY_CORE_CASE db=myeongha_case_one duration_seconds=\d+ index=1/);
    expect(result.stdout).toMatch(/AUTHORITY_CORE_CASE db=myeongha_case_two duration_seconds=\d+ index=2/);
    expect(result.stdout).toMatch(/AUTHORITY_CORE_PHASE db=myeongha_case_one pre_drop_ms=\d+ clone_ms=\d+ command_ms=\d+ cleanup_ms=\d+/);
    expect(result.stdout).toMatch(/AUTHORITY_CORE_PHASE db=myeongha_case_two pre_drop_ms=\d+ clone_ms=\d+ command_ms=\d+ cleanup_ms=\d+/);
    expect(result.calls.at(-1)).toBe('dropdb|--if-exists myeongha_authority_core_template');
  });

  it('does not change output by default when profiling is disabled', () => {
    const result = runFixture();
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('AUTHORITY_CORE_STAGE');
    expect(result.stdout).not.toContain('AUTHORITY_CORE_CASE');
    expect(result.stdout).not.toContain('AUTHORITY_CORE_PHASE');
    expect(result.stdout).not.toContain('AUTHORITY_CORE_TEMPLATE');
  });

  it('fails closed on an isolated case error and still cleans up', () => {
    const result = runFixture({ profile: true, failure: true });
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain('UNREACHABLE');
    expect(result.stdout).not.toContain('AUTHORITY_CORE_PHASE db=myeongha_case_failed');
    expect(result.calls).toContain('dropdb|--if-exists myeongha_case_failed');
    expect(result.calls.at(-1)).toBe('dropdb|--if-exists myeongha_authority_core_template');
  });
});
