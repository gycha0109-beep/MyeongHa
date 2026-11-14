import { afterEach, expect, it, vi } from 'vitest';
import { APPROVED_SAJU_SANDBOX_ROUTES_V1 as ROUTES } from '../../../../packages/contracts/src/approved-saju-sandbox-routes.js';
import { loadApprovedSajuSandboxCheckoutPortsV1 } from './approved-saju-sandbox-browser-runtime.js';

const origin = 'https://sandbox.example.test';
const purchaseIntentId = '33333333-3333-4333-8333-333333333333';

afterEach(() => vi.unstubAllGlobals());

it('loads the verified purchase archive and discards a late response when the owner changes', async () => {
  let memberActive = true;
  let loseAccess = false;
  const requestPayment = vi.fn();
  vi.stubGlobal('window', { location: { origin }, PortOne: { requestPayment } });

  const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
    const url = new URL(input, origin);
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer sandbox-member-token');
    if (url.pathname === ROUTES.access) return Response.json({
      ok: true, data: {
        environment: 'sandbox',
        storeId: 'store-11111111-1111-4111-8111-111111111111',
        channelKey: 'channel-key-22222222-2222-4222-8222-222222222222',
      },
    });
    if (url.pathname !== '/api/readings') return Response.json({}, { status: 404 });
    expect(url.searchParams.get('purchaseIntentId')).toBe(purchaseIntentId);
    expect(init?.method).toBe('GET');
    expect(init?.cache).toBe('no-store');
    if (loseAccess) memberActive = false;
    return Response.json({
      ok: true, data: { purchaseIntentId, readings: [{ component: 'wealth', state: 'pending' }] },
      meta: { apiContractVersion: 'v0.9', requestId: 'archive-test', serverTime: '2026-11-14T00:00:00.000Z' },
    });
  });
  vi.stubGlobal('fetch', fetchImpl);

  const ports = await loadApprovedSajuSandboxCheckoutPortsV1(async () => {
    if (!memberActive) throw Error('Member changed');
    return 'sandbox-member-token';
  });
  expect(ports?.readArchive).toBeDefined();
  await expect(ports!.readArchive!(purchaseIntentId)).resolves.toEqual([{ component: 'wealth', state: 'pending' }]);
  loseAccess = true;
  await expect(ports!.readArchive!(purchaseIntentId)).rejects.toThrow('Member changed');
  expect(requestPayment).not.toHaveBeenCalled();
});
