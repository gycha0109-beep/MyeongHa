import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  SAJU_BRIDGE_EXISTING_AUTHORITIES_V2,
  createSajuBridgeExistingAuthoritiesV2,
} from '../apps/api/src/saju-bridge-existing-authorities-v2.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const ENV = Object.freeze({
  MYEONGHA_DATABASE_URL:
    'postgresql://myeongha_runtime.cnsfpcdiyofqvhpcegfc:test-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require',
  MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_runtime',
  MYEONGHA_DATABASE_TLS_PEER_MODE: 'verify-full',
  MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM:
    '-----BEGIN CERTIFICATE-----\ntest-only\n-----END CERTIFICATE-----',
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY:
    'sb_publishable_test_key_material_for_saju_no_new_roles_v2',
  MYEONGHA_GUEST_FINGERPRINT_SECRET:
    'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes',
  MYEONGHA_SAJU_SERVICE_ORIGIN: 'https://saju.internal.example',
  MYEONGHA_SAJU_SERVICE_BEARER: 'test-only-saju-service-bearer-secret',
});

function fixture() {
  const connect = vi.fn(async () => {
    throw new Error('DB must not be contacted on unauthenticated/unknown requests');
  });
  const pool = { connect } as unknown as PostgresSubjectPoolV1;
  const memberFetchImpl = vi.fn(async () => {
    throw new Error('Auth must not fetch for unknown route or missing credentials');
  });
  const sajuFetchImpl = vi.fn(async () => {
    throw new Error('Saju must not receive unknown/unauthenticated requests');
  });
  const runtime = createSajuBridgeExistingAuthoritiesV2({
    env: ENV,
    pool,
    memberFetchImpl,
    sajuFetchImpl,
  });
  return { runtime, connect, memberFetchImpl, sajuFetchImpl };
}

function request(url: string, method = 'POST', body?: string): Request {
  return new Request('https://myeongha.example' + url, {
    method,
    ...(body === undefined ? {} : {
      body,
      headers: { 'content-type': 'application/json' },
    }),
  });
}

function handle(
  runtime: ReturnType<typeof createSajuBridgeExistingAuthoritiesV2>,
  req: Request,
): Promise<Response> {
  return runtime.handleRequest({
    request: req,
    requestId: 'no-new-roles-v2-test',
    serverTime: '2026-10-16T00:00:00.000Z',
  });
}

describe('Saju bridge existing-authority V2 / no new database accounts', () => {
  it('pins existing subject permissions only, never a permit owner/executor', () => {
    expect(SAJU_BRIDGE_EXISTING_AUTHORITIES_V2).toMatchObject({
      databaseLogin: 'myeongha_runtime',
      databaseExecutionRole: 'myeongha_api_executor',
      newDatabaseRolesRequired: false,
      newDatabaseSchemaRequired: false,
      newOperatorPermitRequired: false,
      canRunOnce: false, canExecute: false, canPublish: false, canSell: false,
    });
    const source = readFileSync(new URL(
      '../apps/api/src/saju-bridge-existing-authorities-v2.ts', import.meta.url,
    ), 'utf8');
    const calculation = readFileSync(new URL(
      '../apps/api/src/production-current-subject-saju-calculation-runtime.ts', import.meta.url,
    ), 'utf8');
    const execution = readFileSync(new URL(
      '../apps/api/src/postgres-subject-execution.ts', import.meta.url,
    ), 'utf8');
    for (const text of [source, calculation]) {
      expect(text).not.toContain('saju-single-project-operator-permit-v1');
      expect(text).not.toContain('SET LOCAL ROLE myeongha_saju_bridge_permit_executor');
      expect(text).not.toMatch(/\bCREATE\s+ROLE\b/iu);
      expect(text).not.toContain('operator_permits_v1');
    }
    expect(execution).toContain('SET LOCAL ROLE myeongha_api_executor');
  });

  it('does not contact Auth, DB or Saju on unknown path, query or permit route', async () => {
    const f = fixture();
    try {
      for (const url of [
        '/api/saju/issue-permit',
        '/api/me/saju/calculation?role=myeongha_saju_bridge_permit_executor',
        '/api/me/saju/preview-reading?owner=attacker',
        '/api/me/saju/readings',
      ]) {
        expect((await handle(f.runtime, request(url))).status).toBe(404);
      }
      expect(f.connect).not.toHaveBeenCalled();
      expect(f.memberFetchImpl).not.toHaveBeenCalled();
      expect(f.sajuFetchImpl).not.toHaveBeenCalled();
    } finally {
      await f.runtime.close();
    }
  });

  it('reuses existing routes, rejects anonymous requests before opening DB', async () => {
    const f = fixture();
    try {
      const calculate = await handle(f.runtime, request('/api/me/saju/calculation'));
      expect(calculate.status).toBe(401);
      await expect(calculate.json()).resolves.toMatchObject({
        error: { code: 'AUTH_REQUIRED' },
      });
      const preview = await handle(f.runtime, request('/api/me/saju/preview-reading'));
      expect(preview.status).toBe(401);
      await expect(preview.json()).resolves.toMatchObject({
        error: { code: 'AUTH_REQUIRED' },
      });
      expect(f.connect).not.toHaveBeenCalled();
      expect(f.sajuFetchImpl).not.toHaveBeenCalled();
    } finally {
      await f.runtime.close();
    }
  });

  it('blocks client-injected calculation authority without DB or Saju calls', async () => {
    const f = fixture();
    try {
      const response = await handle(f.runtime, request(
        '/api/me/saju/calculation',
        'POST',
        JSON.stringify({ birthRevisionId: 'attacker', permitId: 'attacker' }),
      ));
      expect(response.status).toBe(400);
      expect(f.connect).not.toHaveBeenCalled();
      expect(f.memberFetchImpl).not.toHaveBeenCalled();
      expect(f.sajuFetchImpl).not.toHaveBeenCalled();
    } finally {
      await f.runtime.close();
    }
  });

  it('keeps each route POST-only and closes without provisioning resources', async () => {
    const f = fixture();
    const calc = await handle(f.runtime, request('/api/me/saju/calculation','GET'));
    expect(calc.status).toBe(405);
    const reading = await handle(f.runtime, request('/api/me/saju/preview-reading','GET'));
    expect(reading.status).toBe(405);
    await f.runtime.close();
    await f.runtime.close();
    expect((await handle(f.runtime, request('/api/me/saju/calculation'))).status).toBe(503);
    expect(f.connect).not.toHaveBeenCalled();
    expect(f.memberFetchImpl).not.toHaveBeenCalled();
    expect(f.sajuFetchImpl).not.toHaveBeenCalled();
  });
});
