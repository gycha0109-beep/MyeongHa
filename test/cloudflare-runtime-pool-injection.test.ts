import { describe, expect, it } from 'vitest';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import { createProductionGuestBootstrapHttpRuntimeV1 } from '../apps/api/src/production-guest-bootstrap-http-runtime.js';
import { createProductionGuestPromotionRuntimeV1 } from '../apps/api/src/production-guest-promotion-runtime.js';
import { createProductionCurrentSubjectBirthProfileRuntimeV1 } from '../apps/api/src/production-current-subject-birth-profile-runtime.js';

// Synthetic config and injected pools only; absolutely no database/socket/provider calls.
const ENV = Object.freeze({
  MYEONGHA_DATABASE_URL:
    'postgresql://synthetic_login:synthetic_password@db.synthetic.example.com:5432/isolated?sslmode=require',
  MYEONGHA_DATABASE_PRINCIPAL: 'synthetic_login',
  MYEONGHA_DATABASE_TLS_PEER_MODE: 'verify-full',
  MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM:
    '-----BEGIN CERTIFICATE-----\ntest-only\n-----END CERTIFICATE-----',
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY: 'sb_publishable_synthetic_test_key_minimum_length',
  MYEONGHA_GUEST_FINGERPRINT_SECRET: 'synthetic_guest_fingerprint_secret_minimum_length',
  MYEONGHA_GUEST_SESSION_TTL_SECONDS: '604800',
});

function injectedPool() {
  let attempts = 0;
  let closes = 0;
  const pool: PostgresSubjectPoolV1 & { close(): Promise<void> } = {
    async connect() {
      attempts++;
      throw Error('SYNTHETIC_DB_MUST_NOT_BE_CALLED');
    },
    async close() {
      closes++;
      throw Error('INJECTED_POOL_IS_WORKER_OWNED');
    },
  };
  return { pool, attempts: () => attempts, closes: () => closes };
}

describe('Cloudflare Ops producer pool injection is server-owned and backwards-compatible', () => {
  const factories = [
    {
      name: 'Guest Bootstrap',
      create: (pool: PostgresSubjectPoolV1) =>
        createProductionGuestBootstrapHttpRuntimeV1({ env: ENV, pool }),
    },
    {
      name: 'Guest Promotion',
      create: (pool: PostgresSubjectPoolV1) =>
        createProductionGuestPromotionRuntimeV1({ env: ENV, pool }),
    },
    {
      name: 'Current Subject Birth Profile',
      create: (pool: PostgresSubjectPoolV1) =>
        createProductionCurrentSubjectBirthProfileRuntimeV1({ env: ENV, pool }),
    },
  ];

  for (const { name, create } of factories) {
    it(name + ' borrows without connecting or closing a Worker-owned pool', async () => {
      const injected = injectedPool();
      const runtime = create(injected.pool);
      await runtime.close();
      await runtime.close();
      expect(injected.attempts()).toBe(0);
      expect(injected.closes()).toBe(0);
    });
  }

  it('Guest Promotion keeps method rejection with an injected pool and no DB/identity work', async () => {
    const injected = injectedPool();
    const runtime = createProductionGuestPromotionRuntimeV1({ env: ENV, pool: injected.pool });
    const response = await runtime.handleRequest({
      request: new Request('https://auth.synthetic.example.com/api/auth/promote-guest', { method: 'GET' }),
      requestId: 'synthetic-method-rejection',
      serverTime: '2026-10-22T00:00:00.000Z',
    });
    expect(response.status).toBe(405);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await runtime.close();
    expect(injected.attempts()).toBe(0);
    expect(injected.closes()).toBe(0);
  });
});
