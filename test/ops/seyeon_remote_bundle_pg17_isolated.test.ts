import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = resolve('test/db/seyeon_remote_bundle_pg17_isolated.sh');
const body = readFileSync(script, 'utf8');

describe('Se-yeon exact remote historical bundle PostgreSQL 17 rehearsal', () => {
  it('is syntactically valid Bash and never connected to production deploy', () => {
    expect(() => execFileSync('bash', ['-n', script], { stdio: 'pipe' })).not.toThrow();
    expect(readFileSync('.github/workflows/supabase-production.yml', 'utf8')).not.toContain('seyeon_remote_bundle_pg17_isolated.sh');
    expect(readFileSync('scripts/operations/run-supabase-production-migrations.sh', 'utf8')).not.toContain('seyeon_remote_bundle_pg17_isolated.sh');
    expect(body).not.toMatch(/supabase (?:db push|migration repair)/);
  });

  it('pins the 104021-byte historical source SHA, local PG17 and transactional isolation', () => {
    expect(body).toContain('4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894');
    expect(body).toContain('104021');
    expect(body).toContain('sha256sum --check --status');
    expect(body).toContain('^17[0-9]{4}$');
    expect(body).toContain('createdb "$shadow"');
    expect(body).toContain('trap cleanup EXIT');
    expect(body).toContain('psql -X -q -1 -v ON_ERROR_STOP=1 -f "$bundle"');
    expect(body).toContain('psql -X -q -1 -v ON_ERROR_STOP=1 "$@"');
    expect(body).toContain('SEYEON_REMOTE_BUNDLE_FILE');
    expect(body).toContain('SUPABASE_DB_PASSWORD');
  });

  it('rejects fake remote SQL before any PostgreSQL operation', () => {
    const dir = mkdtempSync(join(tmpdir(), 'seyeon-pg17-negative-'));
    try {
      const bad = join(dir, 'wrong.sql');
      const marker = join(dir, 'attempted-db-command');
      writeFileSync(bad, 'SELECT 1;\n');
      // If the script reaches the database at all, the marker will be created.
      const env = {
        ...process.env,
        CI: 'true',
        PGHOST: 'localhost',
        PGUSER: 'postgres',
        PGDATABASE: 'myeongha_test',
        SUPABASE_DB_PASSWORD: '',
        SUPABASE_PRODUCTION_SESSION_POOLER_HOST: '',
        SEYEON_REMOTE_BUNDLE_FILE: bad,
        PSQL_TEST_SENTINEL: marker,
      };
      expect(() => execFileSync('bash', [script], { env, stdio: 'pipe' })).toThrow();
      expect(() => readFileSync(marker, 'utf8')).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a Production credential even with a provided SQL path', () => {
    expect(() => execFileSync('bash', [script], {
      env: {
        ...process.env,
        CI: 'true', PGHOST: 'localhost', PGUSER: 'postgres', PGDATABASE: 'myeongha_test',
        SUPABASE_DB_PASSWORD: 'credential-present', SUPABASE_PRODUCTION_SESSION_POOLER_HOST: '',
        SEYEON_REMOTE_BUNDLE_FILE: '/not/available.sql',
      },
      stdio: 'pipe',
    })).toThrow();
  });
});
