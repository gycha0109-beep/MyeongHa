import { afterEach, describe, expect, it, vi } from 'vitest';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const MEMORY_ID = '22222222-2222-4222-8222-222222222222';
const ORIGIN = 'https://myeongha.gycha0109.workers.dev';
const query = vi.fn(async (sql, params = []) => {
  if (sql.includes('begin_member_subject_context_v1')) {
    return { rows: [{ subjectId: SUBJECT_ID, subjectKind: 'member' }] };
  }
  if (sql.includes('to_regprocedure') && sql.includes('qry_seyeon_memory_grant_lifecycle_v1')) {
    return { rows: [{ installed: true }] };
  }
  if (sql.includes('from public.qry_seyeon_memory_grant_lifecycle_v1')) {
    return { rows: [{ grantState: 'active', grantedAt: '2026-10-20T00:00:00.000Z' }] };
  }
  if (sql.includes('qry_memory_active_grants_v1')) {
    return { rows: [{ grantId: '33333333-3333-4333-8333-333333333333',
      characterId: 'seyeon', grantReason: 'user_choice',
      grantedAt: '2026-10-20T00:00:00.000Z',
      contentJsonb: { secret: 'NEVER_DISCLOSE_ORIGINAL' },
    }] };
  }
  return { rows: [] };
});
const release = vi.fn();
const close = vi.fn(async () => {});
const connect = vi.fn(async () => ({ query, release }));
const verifier = vi.fn(async () => ({ kind: 'member',
  verifiedAuthUserId: '44444444-4444-4444-8444-444444444444' }));

vi.mock('../workers/cloudflare-auth-db-api.mjs', () => ({
  approvedCloudflareAuthOriginV1: () => ORIGIN,
  approvedCloudflareStage5HandoffV1: () => true,
  approvedCloudflarePostgresTargetV1: () => true,
  approvedCloudflareSameOriginPostV1: () => true,
  CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1: { 'Cache-Control': 'no-store' },
}));
vi.mock('../apps/api/src/production-user-data-runtime-config.ts', () => ({
  parseProductionUserDataRuntimeConfigV1: () => ({}),
}));
vi.mock('../apps/api/src/node-postgres-subject-pool.ts', () => ({
  buildProductionNodePostgresPoolConfigV1: () => ({
    max: 1, ssl: { rejectUnauthorized: true },
  }),
}));
vi.mock('../workers/cloudflare-hyperdrive-subject-pool.mjs', () => ({
  createCloudflareSubjectPoolV1: () => ({ connect, close }),
}));
vi.mock('../apps/api/src/production-request-identity-verifier.ts', () => ({
  createProductionRequestIdentityVerifierV1: () => ({
    verifyRequestIdentity: verifier,
  }),
}));

const { tryHandleCloudflareApprovedRecordsV1 } = await import('../workers/cloudflare-records-api.mjs');
const { matchCloudflareApiRoute } = await import('../workers/cloudflare-api-router.mjs');
const endpoint = `/api/memories/${MEMORY_ID}/grants/seyeon`;

afterEach(() => {
  vi.clearAllMocks();
  verifier.mockImplementation(async () => ({
    kind: 'member', verifiedAuthUserId: '44444444-4444-4444-8444-444444444444',
  }));
});

describe('Cloudflare Member current original Memory Grant GET', () => {
  it('runs canonical Member/Subject PostgreSQL authority, never returns original text', async () => {
    const request = new Request(ORIGIN + endpoint);
    const response = await tryHandleCloudflareApprovedRecordsV1(request, {},
      matchCloudflareApiRoute(new URL(request.url).pathname));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.text();
    expect(body).not.toContain('NEVER_DISCLOSE_ORIGINAL');
    expect(JSON.parse(body).data).toMatchObject({
      memoryItemId: MEMORY_ID, characterId: 'seyeon', currentlyGranted: true,
    });
    expect(query.mock.calls.some(([sql, params]) =>
      sql.includes('qry_memory_active_grants_v1') &&
      params[0] === SUBJECT_ID && params[1] === MEMORY_ID)).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('returns 401 and does not open a DB connection for missing verified Member', async () => {
    verifier.mockResolvedValueOnce(null);
    const request = new Request(ORIGIN + endpoint);
    const response = await tryHandleCloudflareApprovedRecordsV1(request, {},
      matchCloudflareApiRoute(new URL(request.url).pathname));
    expect(response.status).toBe(401);
    expect(connect).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('blocks forged query selectors and mutation methods before creating a pool', async () => {
    for (const [suffix, method, expected] of [
      ['?subjectId=forged', 'GET', 404],
      ['?__myeongha_seyeon_memory_grant_status_id=' + MEMORY_ID, 'GET', 404],
      ['', 'POST', 405],
    ]) {
      const request = new Request(ORIGIN + endpoint + suffix, { method });
      const response = await tryHandleCloudflareApprovedRecordsV1(request, {},
        matchCloudflareApiRoute(new URL(request.url).pathname));
      expect(response.status).toBe(expected);
    }
    expect(connect).not.toHaveBeenCalled();
  });
});
