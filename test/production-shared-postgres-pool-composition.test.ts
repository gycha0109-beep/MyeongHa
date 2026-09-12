import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import { createProductionPostgresSubjectPoolLeaseV1 } from '../apps/api/src/production-postgres-subject-pool-lease.js';
import { parseProductionUserDataRuntimeConfigV1 } from '../apps/api/src/production-user-data-runtime-config.js';

function productionLikeEnv(): Record<string, string> {
  return {
    MYEONGHA_DATABASE_URL:
      'postgresql://myeongha_runtime.cnsfpcdiyofqvhpcegfc:test-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require',
    MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_runtime',
    MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
    MYEONGHA_SUPABASE_API_KEY:
      'sb_publishable_test_key_material_for_shared_postgres_pool',
    MYEONGHA_GUEST_FINGERPRINT_SECRET:
      'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes',
  };
}

describe('Production multiplexed PostgreSQL pool composition', () => {
  it('treats an injected shared pool as non-owning', async () => {
    let injectedCloseCalls = 0;
    const injectedPool: PostgresSubjectPoolV1 & { close(): Promise<void> } = {
      connect() {
        throw new Error('Injected pool should not be opened by this ownership test.');
      },
      async close() {
        injectedCloseCalls += 1;
      },
    };

    const lease = createProductionPostgresSubjectPoolLeaseV1({
      config: parseProductionUserDataRuntimeConfigV1(productionLikeEnv()),
      pool: injectedPool,
    });

    expect(lease.pool).toBe(injectedPool);
    await lease.close();
    expect(injectedCloseCalls).toBe(0);
  });

  it('pins one shared pool creation and five shared injections in /api/me', async () => {
    const source = await readFile(new URL('../api/me.ts', import.meta.url), 'utf8');

    expect(source.match(/createNodePostgresSubjectPoolV1\(/gu)).toHaveLength(1);
    expect(source.match(/pool: getSharedPostgresPool\(\)/gu)).toHaveLength(5);
  });

  it('pins one shared pool creation and two shared injections in /api/birth-profiles', async () => {
    const source = await readFile(
      new URL('../api/birth-profiles.ts', import.meta.url),
      'utf8',
    );

    expect(source.match(/createNodePostgresSubjectPoolV1\(/gu)).toHaveLength(1);
    expect(source.match(/pool: getSharedPostgresPool\(\)/gu)).toHaveLength(2);
  });
});
