import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApprovedSajuSandboxOwnerRuntimeV1 } from './approved-saju-sandbox-owner-runtime-v1.js';

const mock = vi.hoisted(() => {
  const targetRead = vi.fn(async () => Response.json({ ok: true, data: [] }));
  const archiveRead = vi.fn(async () => Response.json({ ok: true, data: { readings: [] } }));
  const targetClose = vi.fn(async () => undefined);
  const archiveClose = vi.fn(async () => undefined);
  return {
    checkout: vi.fn(() => ({ handleRequest: vi.fn() })),
    host: vi.fn((_input: { ownerReads: {
      targets: (request: Request) => Promise<Response>;
      readings: (request: Request) => Promise<Response>;
    } }) => ({ start: vi.fn(async () => undefined), close: vi.fn(async () => undefined) })),
    target: vi.fn(() => ({ handleRequest: targetRead, close: targetClose })),
    archive: vi.fn(() => ({ handleRequest: archiveRead, close: archiveClose })),
    targetRead, archiveRead, targetClose, archiveClose,
    parseConfig: vi.fn(() => ({ validated: true })),
    verifier: vi.fn(() => ({ verifyRequestIdentity: vi.fn() })),
  };
});
vi.mock('./approved-saju-sandbox-loopback-host-v1.js', () => ({
  createApprovedSajuSandboxLoopbackHostV1: mock.host,
}));
vi.mock('./approved-saju-sandbox-http-runtime-v1.js', () => ({
  createApprovedSajuSandboxHttpRuntimeV1: mock.checkout,
}));
vi.mock('./production-target-person-read-runtime.js', () => ({
  createProductionTargetPersonReadRuntimeV1: mock.target,
}));
vi.mock('./production-records-read-runtime.js', () => ({
  createProductionReadingHistoryReadRuntimeV1: mock.archive,
}));
vi.mock('./production-user-data-runtime-config.js', () => ({
  parseProductionUserDataRuntimeConfigV1: mock.parseConfig,
}));
vi.mock('./production-request-identity-verifier.js', () => ({
  createProductionRequestIdentityVerifierV1: mock.verifier,
}));

const memberPool = { connect: vi.fn() };
const commercePool = { connect: vi.fn() };
const env = { sandbox: 'fixture' };
const channel = {
  environment: 'sandbox' as const,
  storeId: 'store-11111111-1111-4111-8111-111111111111',
  channelKey: 'channel-key-22222222-2222-4222-8222-222222222222',
};
const verificationAdapter = { verify: vi.fn() };
const input = { origin: 'http://127.0.0.1:48701', staticRoot: 'C:\\fixture',
  env, channel, memberPool, commercePool, verificationAdapter };
beforeEach(() => vi.clearAllMocks());

describe('owner Saju checkout, target and paid archive runtime composition', () => {
  it('refuses to reuse one PostgreSQL role for member and merchant receipts', () => {
    expect(() => createApprovedSajuSandboxOwnerRuntimeV1({
      ...input, commercePool: memberPool,
    } as never)).toThrow('separate member and commerce DB roles');
    expect(mock.checkout).not.toHaveBeenCalled();
  });

  it('mounts existing verified sandbox checkout and RLS purchase archive, not a public sale', async () => {
    const runtime = createApprovedSajuSandboxOwnerRuntimeV1(input as never);
    expect(mock.checkout).toHaveBeenCalledWith(expect.objectContaining({
      origin: input.origin, channel, pool: memberPool, commercePool, verificationAdapter,
    }));
    expect(mock.archive).toHaveBeenCalledWith(expect.objectContaining({
      env, pool: memberPool, approvedSajuArchiveEnabled: true,
    }));
    expect(mock.target).toHaveBeenCalledWith(expect.objectContaining({ env, pool: memberPool }));
    expect(mock.host).toHaveBeenCalledWith(expect.objectContaining({
      origin: input.origin,
      staticRoot: input.staticRoot,
    }));
    const readPorts = mock.host.mock.lastCall?.[0]?.ownerReads;
    if (!readPorts) throw Error('Isolated Owner archive was not attached.');
    expect(typeof readPorts.readings).toBe('function');
    expect(typeof readPorts?.targets).toBe('function');
    await readPorts.targets(new Request(input.origin + '/api/target-persons'));
    await readPorts.readings(new Request(input.origin + '/api/readings'));
    expect(mock.targetRead).toHaveBeenCalledOnce();
    expect(mock.archiveRead).toHaveBeenCalledOnce();
    await runtime.start();
    await runtime.close();
    expect(mock.targetClose).toHaveBeenCalledOnce();
    expect(mock.archiveClose).toHaveBeenCalledOnce();
  });
});
