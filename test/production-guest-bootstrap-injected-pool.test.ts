import { describe, expect, it } from 'vitest';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import { createProductionGuestBootstrapHttpRuntimeV1 } from '../apps/api/src/production-guest-bootstrap-http-runtime.js';

const ENV = Object.freeze({
  MYEONGHA_DATABASE_URL:
    'postgresql://myeongha_runtime.cnsfpcdiyofqvhpcegfc:test-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require',
  MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_runtime',
  MYEONGHA_DATABASE_TLS_PEER_MODE: 'verify-full',
  MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM: '-----BEGIN CERTIFICATE-----\\ntest-only\\n-----END CERTIFICATE-----',
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY: 'sb_publishable_test_key_for_guest_pool_injection',
  MYEONGHA_GUEST_FINGERPRINT_SECRET: 'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes',
  MYEONGHA_GUEST_SESSION_TTL_SECONDS: '604800',
});

describe('Guest bootstrap honors the Worker-owned Hyperdrive subject pool', () => {
  it('uses the injected subject pool for a POST, never silently opening the default direct DB pool', async () => {
    const sentry = new Error('injected subject pool used');
    let connects = 0;
    let closes = 0;
    const injectedPool: PostgresSubjectPoolV1 & { close(): Promise<void> } = {
      async connect() {
        connects += 1;
        throw sentry;
      },
      async close() {
        closes += 1;
      },
    };

    const runtime = createProductionGuestBootstrapHttpRuntimeV1({
      env: ENV,
      pool: injectedPool,
    });
    try {
      await expect(runtime.handleRequest({
        request: new Request('https://myeongha.example/api/session/bootstrap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }),
        requestId: 'guest-hyperdrive-injected-pool-canary',
        serverTime: '2026-10-27T05:00:00.000Z',
      })).rejects.toBe(sentry);
      expect(connects).toBe(1);
    } finally {
      await runtime.close();
    }
    expect(closes).toBe(0);
  });

  it('does not acquire or close the injected pool for method rejection', async () => {
    let connects = 0;
    let closes = 0;
    const pool: PostgresSubjectPoolV1 & { close(): Promise<void> } = {
      connect() {
        connects += 1;
        throw new Error('method rejection must not open a DB connection');
      },
      async close() { closes += 1; },
    };
    const runtime = createProductionGuestBootstrapHttpRuntimeV1({ env: ENV, pool });
    try {
      const response = await runtime.handleRequest({
        request: new Request('https://myeongha.example/api/session/bootstrap', { method: 'GET' }),
        requestId: 'guest-hyperdrive-rejected-method',
        serverTime: '2026-10-27T05:00:00.000Z',
      });
      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('POST');
    } finally { await runtime.close(); }
    expect(connects).toBe(0);
    expect(closes).toBe(0);
  });
});
