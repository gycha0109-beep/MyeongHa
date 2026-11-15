import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApprovedSajuSandboxOwnerRuntimeV1 } from './approved-saju-sandbox-owner-runtime-v1.js';

const mock = vi.hoisted(() => ({
  host: vi.fn((input: { ownerReads: {
    targets: (request: Request) => Promise<Response>;
    readings: (request: Request) => Promise<Response>;
  } }) => ({ start: vi.fn(async () => undefined), close: vi.fn(async () => undefined) })),
  checkout: vi.fn(() => ({ handleRequest: vi.fn() })),
  targets: vi.fn(async () => Response.json({ ok: true, data: [] })),
  history: vi.fn(async () => Response.json({ ok: true, data: { readings: [] } })),
  detail: vi.fn(async () => Response.json({ ok: true, data: { readingId: 'synthetic' } })),
}));
vi.mock('./approved-saju-sandbox-loopback-host-v1.js', () => ({
  createApprovedSajuSandboxLoopbackHostV1: mock.host,
}));
vi.mock('./approved-saju-sandbox-http-runtime-v1.js', () => ({
  createApprovedSajuSandboxHttpRuntimeV1: mock.checkout,
}));
vi.mock('./target-person-read-http.js', () => ({
  handleTargetPersonReadRequestV1: mock.targets,
}));
vi.mock('./reading-history-http.js', () => ({
  handleReadingHistoryRequestV1: mock.history,
}));
vi.mock('./official-reading-record-http.js', () => ({
  handleOfficialReadingRecordRequestV1: mock.detail,
}));
vi.mock('./supabase-member-identity-verifier.js', () => ({
  SupabaseMemberIdentityEvidenceVerifierV1: class {
    async verifyRequestIdentity() { return null; }
  },
}));
const memberPool = { connect: vi.fn() };
const commercePool = { connect: vi.fn() };
const channel = {
  environment: 'sandbox' as const,
  storeId: 'store-11111111-1111-4111-8111-111111111111',
  channelKey: 'channel-key-22222222-2222-4222-8222-222222222222',
};
const verificationAdapter = { verify: vi.fn() };
const input = {
  origin: 'http://127.0.0.1:48701', staticRoot: 'C:\\fixture',
  supabaseOrigin: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  supabaseApiKey: 'synthetic-public-api-key-12345',
  channel, memberPool, commercePool, verificationAdapter,
};
beforeEach(() => vi.clearAllMocks());

describe('owner Saju sandbox checkout, archive and counterpart runtime', () => {
  it('refuses the same DB role and an unapproved authentication source', () => {
    expect(() => createApprovedSajuSandboxOwnerRuntimeV1({
      ...input, commercePool: memberPool,
    } as never)).toThrow('separate member and commerce DB roles');
    expect(() => createApprovedSajuSandboxOwnerRuntimeV1({
      ...input, supabaseOrigin: 'https://attacker.example',
    } as never)).toThrow('governed Supabase Auth');
    expect(mock.checkout).not.toHaveBeenCalled();
  });
  it('mounts the existing verified handlers for real checkout/archives', async () => {
    const runtime = createApprovedSajuSandboxOwnerRuntimeV1(input as never);
    expect(mock.checkout).toHaveBeenCalledWith(expect.objectContaining({
      origin: input.origin, pool: memberPool, commercePool, verificationAdapter,
    }));
    const reads = mock.host.mock.lastCall?.[0]?.ownerReads;
    if (!reads) throw Error('Owner archive was not mounted.');
    await reads.targets(new Request(input.origin + '/api/target-persons'));
    await reads.readings(new Request(input.origin + '/api/readings'));
    await reads.readings(new Request(input.origin + '/api/readings?purchaseIntentId=11111111-1111-4111-8111-111111111111'));
    expect(mock.targets).toHaveBeenCalledOnce();
    expect(mock.history).toHaveBeenCalledWith(expect.objectContaining({ approvedSajuArchiveEnabled: true }));
    expect(mock.detail).toHaveBeenCalledWith(expect.objectContaining({ approvedSajuArchiveEnabled: true }));
    await runtime.start();
    await runtime.close();
  });
});
