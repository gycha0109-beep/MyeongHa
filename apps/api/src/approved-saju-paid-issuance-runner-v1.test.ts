import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  self: vi.fn<() => Promise<{ state: 'idle' | 'issued' | 'held' | 'lease_expired' }>>(),
  pair: vi.fn<() => Promise<{ state: 'idle' | 'issued' | 'held' | 'lease_expired' }>>(),
}));
vi.mock('./approved-saju-issuance-worker-v1.js', () => ({
  createApprovedSajuIssuanceWorkerV1: () => ({ runNext: mock.self }),
}));
vi.mock('./approved-saju-t10-pair-issuance-worker-v1.js', () => ({
  createApprovedSajuT10PairIssuanceWorkerV1: () => ({ runNext: mock.pair }),
}));
import { createApprovedSajuPaidIssuanceRunnerV1 } from './approved-saju-paid-issuance-runner-v1.js';

const issuerPool = { connect: vi.fn() };
const pairReaderPool = { connect: vi.fn() };
const config = () => ({
  self: { pool: issuerPool },
  pair: { pool: issuerPool, pairReaderPool },
  maxJobsPerCycle: 20,
  intervalMs: 15_000,
});
beforeEach(() => {
  vi.resetAllMocks();
  mock.self.mockResolvedValue({ state: 'idle' });
  mock.pair.mockResolvedValue({ state: 'idle' });
});

describe('paid receipt → signed official Saju issuer runner', () => {
  it('drains both individual and compatibility jobs, stopping when their trusted queues are idle', async () => {
    mock.self.mockResolvedValueOnce({ state: 'issued' });
    mock.pair.mockResolvedValueOnce({ state: 'issued' });
    const runner = createApprovedSajuPaidIssuanceRunnerV1(config() as never);
    expect(await runner.runOnce()).toEqual({
      attempted: 2, issued: 2, held: 0, leaseExpired: 0, idle: false,
    });
    expect(mock.self).toHaveBeenCalledTimes(2);
    expect(mock.pair).toHaveBeenCalledTimes(2);
    await runner.close();
  });

  it('never acknowledges or immediately retries a held or expired signed issue', async () => {
    mock.self.mockResolvedValueOnce({ state: 'held' });
    mock.pair.mockResolvedValueOnce({ state: 'lease_expired' });
    const runner = createApprovedSajuPaidIssuanceRunnerV1(config() as never);
    expect(await runner.runOnce()).toMatchObject({
      attempted: 2, issued: 0, held: 1, leaseExpired: 1,
    });
    expect(mock.self).toHaveBeenCalledTimes(1);
    expect(mock.pair).toHaveBeenCalledTimes(1);
    await runner.close();
  });

  it('rejects shared issuer and pair archive roles before running any jobs', () => {
    expect(() => createApprovedSajuPaidIssuanceRunnerV1({
      ...config(), pair: { pool: issuerPool, pairReaderPool: issuerPool },
    } as never)).toThrow('separate pair Reader');
    expect(mock.self).not.toHaveBeenCalled();
  });

  it('limits each drain to a bounded set of jobs and cannot restart once closed', async () => {
    mock.self.mockResolvedValue({ state: 'issued' });
    const runner = createApprovedSajuPaidIssuanceRunnerV1({
      ...config(), maxJobsPerCycle: 4,
    } as never);
    expect((await runner.runOnce()).attempted).toBe(4);
    expect(mock.self).toHaveBeenCalledTimes(4);
    await runner.close();
    expect(() => runner.start()).toThrow('after close');
  });
});
