import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  validateSplitLinuxEvidence, verifyEvidenceFile,
} from '../../scripts/operations/verify-saju-split-rate-ladder-proof-phase11.mjs';

const file = 'docs/operations/SAJU_REAL_ENGINE_SPLIT_CGROUP_LINUX_OBSERVATION_20261103.json';
const digest = '2063321492567f7bff495e14844040030da8fd9878c3a6672bfaac6c4ddb6ec3';
const mainSha = '137211996b27a5b7f34755e85c61334001bbf4bf';
const evidence = () => JSON.parse(readFileSync(file, 'utf8'));

describe('Independent Phase 11 Saju Linux split-cgroup observation proof', () => {
  it('checks the original bytes SHA-256 and all six actual kernel-isolated stages', () => {
    expect(verifyEvidenceFile(file, digest, mainSha)).toMatchObject({
      planned: 4710,
      attempted: 4710,
      success: 4710,
      skippedScheduling: 0,
      skippedAtConcurrencyLimit: 0,
      httpErrors: 0,
      transportFailures: 0,
      invalidResponses: 0,
      highestRateSuccessRps: 400.137,
      serviceThrottledPeriods: 0,
      driverThrottledPeriods: 0,
      recovered: true,
      productionReady: false,
    });
    expect(() => verifyEvidenceFile(file, '0'.repeat(64), mainSha)).toThrow();
    expect(() => verifyEvidenceFile(file, digest, 'a'.repeat(40))).toThrow();
  });

  it('rejects wrong source, host, root or stage schema and unsafe Production claims', () => {
    const invalid = [
      { sourceSha: 'a'.repeat(40) },
      { githubMainSha: 'b'.repeat(40) },
      { actualSajuProductionHostUsed: false },
      { separateResourceCgroups: false },
      { networkScope: 'public' },
      { status: 'BLOCKED_INCOMPLETE' },
      { localValidationOnly: true },
      { outputContainsIdentifiers: true },
      { drReady: true },
      { saturationKneeApproved: true },
      { productionCapacityProven: true },
      { productionScalingThresholdApproved: true },
      { postPressureRecoverySucceeded: false },
      { serviceMemoryOomKills: 1 },
      { driverMemoryOomKills: 1 },
      { rates: evidence().rates.slice(0, 5) },
      { totalSuccessfulCalculations: 4711 },
      { totalPlannedSlots: 4709 },
    ];
    for (const patch of invalid) {
      expect(() => validateSplitLinuxEvidence({ ...evidence(), ...patch }, mainSha)).toThrow();
    }
  });

  it('rejects invented successes, missing slot accounting, latency and throughput', () => {
    const tamper = change => {
      const proof = evidence();
      change(proof.rates[5], proof);
      expect(() => validateSplitLinuxEvidence(proof, mainSha)).toThrow();
    };
    tamper(r => { r.attempted -= 1; });
    tamper(r => { r.successfulCalculations += 1; });
    tamper(r => { r.skippedSchedulingLag = -1; });
    tamper(r => { r.maxInFlightObserved = 17; });
    tamper(r => { r.successfulP50Ms = r.successfulP99Ms + 10; });
    tamper(r => { r.achievedSuccessRps = 600; });
    tamper(r => { r.observedSchedulingWindowMs = 0; });
    tamper(r => { r.driverPeakMemoryBytes = 300_000_000; });
    tamper(r => { r.serviceCpuUsecDelta = -1; });
    tamper(r => { r.syntheticPayload = 'private'; });
  });

  it('rejects forged aggregated CPU/cgroup totals and contradictory memory constraints', () => {
    for (const field of ['serviceTotalCpuUsec', 'driverTotalCpuUsec',
      'serviceTotalThrottledPeriods', 'driverTotalThrottledPeriods']) {
      const proof = evidence();
      proof[field] = -1;
      expect(() => validateSplitLinuxEvidence(proof, mainSha)).toThrow();
    }
    for (const key of ['serviceCpuCores', 'driverCpuCores',
      'serviceMemoryLimitBytes', 'driverSwapLimitBytes']) {
      const proof = evidence();
      proof.kernelConstraints[key] = 99;
      expect(() => validateSplitLinuxEvidence(proof, mainSha)).toThrow();
    }
    const altered = evidence();
    altered.servicePeakMemoryBytes = 10;
    expect(() => validateSplitLinuxEvidence(altered, mainSha)).toThrow();
  });
});
