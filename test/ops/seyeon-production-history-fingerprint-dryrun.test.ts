import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = resolve('scripts/operations/seyeon-production-history-fingerprint-dryrun.sh');
const source = readFileSync(script, 'utf8');
const expectedSha = '4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894';

describe('Se-yeon production historical SQL fingerprint preflight', () => {
  it('is not wired into the mutating production deploy entrypoint', () => {
    const workflow = readFileSync('.github/workflows/supabase-production.yml', 'utf8');
    const deploy = readFileSync('scripts/operations/run-supabase-production-migrations.sh', 'utf8');
    expect(workflow).not.toContain('seyeon-production-history-fingerprint-dryrun.sh');
    expect(deploy).not.toContain('seyeon-production-history-fingerprint-dryrun.sh');
  });

  it('pins exact evidence and permits only a disposable Supabase dry-run', () => {
    expect(source).toContain(expectedSha);
    expect(source).toContain("history_bytes='104021'");
    expect(source).toContain("history_version='20261008090417'");
    expect(source).toContain("history_name='seyeon_runtime_1460_1510_acl_before_owner_recovery'");
    expect(source).toContain('default_transaction_read_only=on');
    expect(source).toContain('sha256sum --check --status');
    expect(source).toContain('sandbox="$(mktemp -d)"');
    expect(source).toContain('trap \'rm -rf -- "$sandbox"\' EXIT');
    expect(source).toContain('cp -R "$repo_root/supabase/migrations" "$sandbox/supabase/migrations"');
    expect(source).toContain('supabase migration list --db-url "$db_url"');
    expect(source).toContain('supabase db push --include-all --dry-run --db-url "$db_url"');
    expect(source).not.toMatch(/^\s*supabase migration repair\b/gm);
    expect(source).not.toMatch(/^\s*supabase db push\b(?![^\n]*--dry-run)/gm);
    expect(source).not.toMatch(/^\s*psql\b[^\n]*\s-f\s/gm);
  });

  it('rejects wrong project before any Production connections', () => {
    expect(() => execFileSync('bash', [script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        SUPABASE_PROJECT_ID: 'wrong-project',
        SUPABASE_DB_PASSWORD: 'synthetic',
        SUPABASE_PRODUCTION_SESSION_POOLER_HOST: 'test.pooler.supabase.com',
      },
      stdio: 'pipe',
    })).toThrow();
  });

  it('rejects corrupt remote evidence without invoking the Supabase CLI', () => {
    const dir = mkdtempSync(join(tmpdir(), 'seyeon-fingerprint-test-'));
    const bin = join(dir, 'bin');
    const callMarker = join(dir, 'supabase-was-invoked');
    try {
      mkdirSync(bin);
      const mockPsql = join(bin, 'psql');
      const mockSupabase = join(bin, 'supabase');
      // A single-byte fake remote proof cannot possibly match 104,021 bytes.
      writeFileSync(mockPsql, '#!/usr/bin/env bash\nprintf "ff\\n"\n');
      writeFileSync(mockSupabase, `#!/usr/bin/env bash\nprintf called > "${callMarker}"\n`);
      chmodSync(mockPsql, 0o755);
      chmodSync(mockSupabase, 0o755);
      let err: unknown;
      try {
        execFileSync('bash', [script], {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH ?? ''}`,
            SUPABASE_PROJECT_ID: 'cnsfpcdiyofqvhpcegfc',
            SUPABASE_DB_PASSWORD: 'synthetic-only',
            SUPABASE_PRODUCTION_SESSION_POOLER_HOST: 'test.pooler.supabase.com',
          },
          stdio: 'pipe',
        });
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(readFileSync(mockPsql, 'utf8')).toContain('printf "ff');
      expect(() => readFileSync(callMarker, 'utf8')).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
