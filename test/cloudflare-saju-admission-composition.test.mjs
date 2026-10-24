import { beforeEach, expect, it, vi } from 'vitest';

const spies = vi.hoisted(() => ({
  calculation: vi.fn(), preview: vi.fn(), close: vi.fn(async () => {}),
}));
vi.mock('../workers/cloudflare-hyperdrive-subject-pool.mjs', () => ({
  createCloudflareSubjectPoolV1: () => ({ close: spies.close }),
}));
vi.mock('../apps/api/src/production-user-data-runtime-config.ts', () => ({
  parseProductionUserDataRuntimeConfigV1: () => ({}),
}));
vi.mock('../apps/api/src/production-saju-runtime-config.ts', () => ({
  parseProductionSajuRuntimeConfigV1: () => ({}),
}));
vi.mock('../apps/api/src/node-postgres-subject-pool.ts', () => ({
  buildProductionNodePostgresPoolConfigV1: () => ({ max: 1, ssl: { rejectUnauthorized: true } }),
}));
vi.mock('../workers/cloudflare-auth-db-api.mjs', () => ({
  approvedCloudflareAuthOriginV1: () => 'https://synthetic.example.invalid',
  approvedCloudflareStage5HandoffV1: () => true,
  approvedCloudflarePostgresTargetV1: () => true,
  approvedCloudflareSameOriginPostV1: () => true,
  CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1: { 'Cache-Control': 'no-store' },
}));
vi.mock('../apps/api/src/production-current-subject-saju-calculation-runtime.ts', () => ({
  createProductionCurrentSubjectSajuCalculationRuntimeV1: spies.calculation,
}));
vi.mock('../apps/api/src/production-current-subject-saju-preview-reading-runtime.ts', () => ({
  createProductionCurrentSubjectSajuPreviewReadingRuntimeV1: spies.preview,
}));

import { tryHandleCloudflareApprovedSajuCalculationV1 as calculation } from '../workers/cloudflare-saju-calculation.mjs';
import { tryHandleCloudflareApprovedSajuPreviewReadingV1 as preview } from '../workers/cloudflare-saju-preview-reading.mjs';

beforeEach(() => {
  vi.clearAllMocks();
  const create = () => ({
    handleRequest: async () => Response.json({ ok: false, error: { code: 'RATE_LIMITED' } }, {
      status: 429, headers: { 'Retry-After': '7', 'Cache-Control': 'no-store' },
    }),
    close: async () => {},
  });
  spies.calculation.mockImplementation(create);
  spies.preview.mockImplementation(create);
});

for (const [name, handle, factory, id, mode] of [
  ['calculation', calculation, spies.calculation, 'api.me.saju.calculation', { MYEONGHA_CLOUDFLARE_SAJU_MODE: 'approved-calculation-only-v1' }],
  ['preview', preview, spies.preview, 'rewrite.saju.preview', { MYEONGHA_CLOUDFLARE_SAJU_PREVIEW_MODE: 'approved-preview-reading-v1' }],
]) {
  const request = () => new Request(`https://synthetic.example.invalid/api/me/saju/${name}`, { method: 'POST' });
  it(`${name}: binds enabled admission to the existing runtime and preserves quota response/cleanup`, async () => {
    const response = await handle(request(), { ...mode, MYEONGHA_SAJU_ABUSE_ADMISSION_ENABLED: 'true' }, { id });
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({ sajuAbuseAdmissionEnabled: true }));
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('7');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(spies.close).toHaveBeenCalledOnce();
  });
  it(`${name}: absent/false release switch keeps admission disabled`, async () => {
    for (const flag of [undefined, 'false']) {
      await handle(request(), { ...mode, MYEONGHA_SAJU_ABUSE_ADMISSION_ENABLED: flag }, { id });
      expect(factory).toHaveBeenLastCalledWith(expect.objectContaining({ sajuAbuseAdmissionEnabled: false }));
    }
  });
  it(`${name}: malformed activation fails closed without constructing a runtime`, async () => {
    const response = await handle(request(), { ...mode, MYEONGHA_SAJU_ABUSE_ADMISSION_ENABLED: 'TRUE' }, { id });
    expect(response.status).toBe(503);
    expect(factory).not.toHaveBeenCalled();
    expect(spies.close).toHaveBeenCalledOnce();
  });
}
