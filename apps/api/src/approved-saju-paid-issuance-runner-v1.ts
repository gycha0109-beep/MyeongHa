import { createApprovedSajuIssuanceWorkerV1 } from './approved-saju-issuance-worker-v1.js';
import { createApprovedSajuT10PairIssuanceWorkerV1 } from './approved-saju-t10-pair-issuance-worker-v1.js';

type SelfConfig = Parameters<typeof createApprovedSajuIssuanceWorkerV1>[0];
type PairConfig = Parameters<typeof createApprovedSajuT10PairIssuanceWorkerV1>[0];
type IssuanceResult = Readonly<{ state: 'idle' | 'issued' | 'lease_expired' | 'held' }>;

export type ApprovedSajuIssuerCycleV1 = Readonly<{
  attempted: number;
  issued: number;
  held: number;
  leaseExpired: number;
  idle: boolean;
}>;

/**
 * Consume the already-authorized payment outbox with both official issuers.
 * The workers independently enforce the purchase grant, release, consent,
 * verified source signature and database receipt before acknowledging a job.
 *
 * No HTTP request or client-provided payment status can invoke an issuer.
 */
export function createApprovedSajuPaidIssuanceRunnerV1(input: Readonly<{
  self: SelfConfig;
  pair: PairConfig;
  intervalMs?: number;
  maxJobsPerCycle?: number;
  onCycle?: (result: ApprovedSajuIssuerCycleV1) => void;
  onError?: (error: unknown) => void;
}>) {
  if (input.self.pool !== input.pair.pool ||
    input.pair.pool === input.pair.pairReaderPool) {
    throw new Error('Both issuers must use the same dedicated issuer DB role, with a separate pair Reader.');
  }
  const intervalMs = input.intervalMs ?? 15_000;
  const maxJobs = input.maxJobsPerCycle ?? 42;
  if (!Number.isInteger(intervalMs) || intervalMs < 1_000 || intervalMs > 300_000 ||
      !Number.isInteger(maxJobs) || maxJobs < 2 || maxJobs > 140) {
    throw new Error('Invalid bounded Saju paid issuance cadence.');
  }
  const workers = [
    createApprovedSajuIssuanceWorkerV1(input.self),
    createApprovedSajuT10PairIssuanceWorkerV1(input.pair),
  ] as const;
  let inFlight: Promise<ApprovedSajuIssuerCycleV1> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let started = false;
  let closed = false;

  const runOnce = (): Promise<ApprovedSajuIssuerCycleV1> => {
    if (closed) throw new Error('Saju issuer has been closed.');
    if (inFlight) return inFlight;

    const cycle = async (): Promise<ApprovedSajuIssuerCycleV1> => {
      let attempted = 0, issued = 0, held = 0, leaseExpired = 0;
      const paused = new Set<number>();
      while (attempted < maxJobs && paused.size < workers.length) {
        for (let i = 0; i < workers.length && attempted < maxJobs; i++) {
          if (paused.has(i)) continue;
          const result: IssuanceResult = await workers[i]!.runNext();
          if (result.state === 'idle') {
            paused.add(i);
            continue;
          }
          attempted++;
          if (result.state === 'issued') issued++;
          else {
            if (result.state === 'held') held++;
            else leaseExpired++;
            // A held or expired lease is NOT a successful sale. Do not retry
            // this issuer in a tight loop or invent an entitlement to unblock.
            paused.add(i);
          }
        }
      }
      return Object.freeze({
        attempted, issued, held, leaseExpired,
        idle: attempted === 0,
      });
    };
    inFlight = cycle().finally(() => { inFlight = undefined; });
    return inFlight;
  };
  const schedule = () => {
    if (!started || closed) return;
    timer = setTimeout(async () => {
      try {
        input.onCycle?.(await runOnce());
      } catch (error) {
        input.onError?.(error);
        // A database, source-proof or trust error must stop the worker.
        // Human investigation is required before another dispatch.
        started = false;
        return;
      }
      schedule();
    }, intervalMs);
  };
  return Object.freeze({
    runOnce,
    start() {
      if (closed || started) throw new Error('Saju issuer cannot start twice or after close.');
      started = true;
      schedule();
    },
    async close() {
      started = false;
      closed = true;
      if (timer) clearTimeout(timer);
      if (inFlight) await inFlight;
    },
  });
}
