import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const compose = readFileSync(new URL('../scripts/local/saju-bridge-db.compose.yml', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../scripts/local/verify-saju-bridge-db.mjs', import.meta.url), 'utf8');

describe('Saju bridge local-only disposable PostgreSQL harness', () => {
  it('uses independent PG15 and PG17 instances without publishing host ports or storing data', () => {
    expect(compose).toMatch(/image: postgres:15\b/);
    expect(compose).toMatch(/image: postgres:17\.6\b/);
    expect(compose).toContain('internal: true');
    expect(compose).toContain('/var/lib/postgresql/data');
    expect(compose).toContain('tmpfs:');
    expect(compose).toContain(':/workspace:ro');
    expect(compose).not.toMatch(/^\s*ports:/m);
    expect(compose).not.toMatch(/^\s*network_mode:\s*host/m);
    expect(compose).not.toMatch(/^\s*privileged:\s*true/m);
    expect(compose).not.toMatch(/MYEONGHA_DATABASE_URL|MYEONGHA_SUPABASE_URL|SAJU_SERVICE_BEARER/);
  });

  it('runs existing Permit V2 PostgreSQL authority cases rather than a fake test', () => {
    const calls = compose.match(/bash test\/db\/run_ci_case\.sh saju-staging-operator-admission-v2/g);
    expect(calls).toHaveLength(2);
    expect(compose).not.toContain('GRANT ALL');
    expect(compose).not.toContain('supabase/migrations/');
  });

  it('uses a fresh Docker project and stops/removes it after both checks', () => {
    expect(runner).toContain("randomBytes(5)");
    expect(runner).toContain("'run', '--rm', 'check15'");
    expect(runner).toContain("'run', '--rm', 'check17'");
    expect(runner).toContain("'down', '--volumes', '--remove-orphans'");
    expect(runner).toContain('finally {');
    expect(runner).toContain('Refusing a nonlocal Docker daemon or context');
  });

  it('does not create any authorizer or claim that synthetic DB checks are production proof', () => {
    expect(compose).not.toContain('service_role');
    expect(runner).toContain('NOT operational staging admission');
    expect(runner).not.toContain('canRunOnce: true');
  });
});
