import { describe, expect, it, vi } from 'vitest';
import {
  createProductionRequestIdentityVerifierV1,
  type ProductionRequestIdentityFetchV1,
} from '../apps/api/src/production-request-identity-verifier.js';
import {
  MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
  type ProductionUserDataRuntimeConfigV1,
} from '../apps/api/src/production-user-data-runtime-config.js';

const UUID_V7_SHAPED_USER_ID = '019535d7-31c3-7cc4-ae2b-3e4f5a6b7c8d';
const MEMBER_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

function configFixture(): ProductionUserDataRuntimeConfigV1 {
  return {
    databaseUrl:
      'postgresql://myeongha_runtime:password@db.example.internal/postgres?sslmode=require',
    databasePrincipal: 'myeongha_runtime',
    databaseExecutionRole: 'myeongha_api_executor',
    supabaseOrigin: MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
    supabaseApiKey: 'sb_publishable_example_key_for_runtime_contract',
    guestFingerprintSecret:
      'guest-fingerprint-secret-material-at-least-thirty-two-bytes',
  };
}

describe('production verified Member UUID contract', () => {
  it('accepts canonical PostgreSQL UUID syntax without hard-coding UUID versions 1-5', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ id: UUID_V7_SHAPED_USER_ID }),
    ) as unknown as ProductionRequestIdentityFetchV1;
    const verifier = createProductionRequestIdentityVerifierV1({
      config: configFixture(),
      fetchImpl,
    });

    await expect(
      verifier.verifyRequestIdentity(
        new Request('https://myeongha.vercel.app/api/me', {
          headers: { Authorization: `Bearer ${MEMBER_TOKEN}` },
        }),
      ),
    ).resolves.toEqual({
      kind: 'member',
      verifiedAuthUserId: UUID_V7_SHAPED_USER_ID,
    });
  });
});
