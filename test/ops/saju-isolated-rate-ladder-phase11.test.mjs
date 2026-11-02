import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assertKernelConstraints,
  parseStat,
  percentile,
  validateLadderReport,
} from '../../scripts/operations/measure-isolated-saju-rate-ladder-phase11.mjs';

const rates = [10, 25, 50, 100, 200, 400];

function validReport() {
  return {
    schema: 'myeongha-ops-saju-real-engine-cgroup-rate-ladder-phase11-v1',
    status: 'OBSERVED_RATE_LADDER',
    sourceSha: '9807ce89c08afc61b587560d515a475efd819032',
    actualSajuProductionHostUsed: true,
    syntheticInputOnly: true,
    networkScope: 'container-loopback-only',
    driverSharesServiceCgroup: true,
    kernelConstraints: {
      cpuQuotaCores: 0.5,
      memoryLimitBytes: 268435456,
      memorySwapLimitBytes: 0,
    },
    postPressureRecoverySucceeded: true,
    totalPlannedSlots: 4710,
    totalActualAttempts: 4698,
    totalSuccessfulCalculations: 4692,
    totalCpuThrottledPeriods: 6,
    kernelCgroupPeakMemoryBytes: 80_000_000,
    memoryOomKills: 0,
    saturationKneeApproved: false,
    rates: rates.map(targetRps => ({
      targetRps,
      intervalSeconds: 6,
      plannedSlots: targetRps * 6,
      attempted: targetRps * 6 - 2,
      successfulCalculations: targetRps * 6 - 3,
      non200: 1,
      transportFailures: 0,
      invalidResponses: 0,
      skippedInFlightCap: 1,
      skippedSchedulingLag: 1,
      maxInFlightObserved: 4,
      cgroupCpuUsageMicrosecondsDelta: 1000,
      cgroupCpuThrottledPeriodsDelta: 1,
      cgroupPeakMemoryBytes: 80_000_000,
    })),
    sajuSaturationCeilingProven: false,
    productionSajuCpuMemoryCeilingProven: false,
    productionCapacityProven: false,
    productionScalingThresholdApproved: false,
    drReady: false,
    serviceResumptionAllowed: false,
    outputContainsIdentifiers: false,
  };
}

describe('Phase 11 controlled real Saju rate-ladder evidence', () => {
  it('requires real Linux cgroup CPU, memory, zero swap and valid kernel counters', () => {
    expect(assertKernelConstraints('50000 100000\n', '268435456\n', '0\n'))
      .toMatchObject({ cpuQuotaCores: 0.5, memoryLimitBytes: 268435456, memorySwapLimitBytes: 0 });
    expect(() => assertKernelConstraints('max 100000', '268435456', '0')).toThrow();
    expect(() => assertKernelConstraints('50000 100000', 'max', '0')).toThrow();
    expect(() => assertKernelConstraints('50000 100000', '268435456', '1024')).toThrow();
    expect(parseStat('usage_usec 145\nnr_throttled 3\n', 'nr_throttled')).toBe(3);
    expect(() => parseStat('usage_usec 145', 'nr_throttled')).toThrow();
    expect(() => parseStat('nr_throttled -1', 'nr_throttled')).toThrow();
  });

  it('retains transparent latency percentiles and no fabricated all-error success p95', () => {
    expect(percentile([], 0.95)).toBe(null);
    expect(percentile([10], 0.95)).toBe(10);
    expect(percentile([10, 20, 30], 0.5)).toBe(20);
    expect(percentile([10, 20, 30], 0.95)).toBe(29);
  });

  it('requires exact bounded slots, source, workload and non-readiness', () => {
    expect(validateLadderReport(validReport()).status).toBe('OBSERVED_RATE_LADDER');
    const incorrect = [
      { sourceSha: 'a'.repeat(40) },
      { actualSajuProductionHostUsed: false },
      { networkScope: 'public' },
      { postPressureRecoverySucceeded: false },
      { productionCapacityProven: true },
      { sajuSaturationCeilingProven: true },
      { drReady: true },
      { totalActualAttempts: 1 },
      { driverSharesServiceCgroup: false },
      { memoryOomKills: 1 },
      { saturationKneeApproved: true },
      { rates: validReport().rates.slice(0, 5) },
      { rates: validReport().rates.map((stage, i) => i ? stage : { ...stage, attempted: 1 }) },
      { rates: validReport().rates.map((stage, i) => i ? stage : { ...stage, maxInFlightObserved: 32 }) },
    ];
    for (const patch of incorrect) {
      expect(() => validateLadderReport({ ...validReport(), ...patch })).toThrow();
    }
  });

  it('allows only a manually dispatched pinned public Saju calculation process with no egress', () => {
    const workflow = readFileSync('.github/workflows/saju-isolated-rate-ladder-phase11.yml', 'utf8');
    const wrapper = readFileSync('scripts/operations/run-isolated-saju-rate-ladder-phase11-ci.sh', 'utf8');
    const runner = readFileSync('scripts/operations/measure-isolated-saju-rate-ladder-phase11.mjs', 'utf8');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toContain('pull_request:');
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain('repository: gycha0109-beep/Saju');
    expect(workflow).toContain('9807ce89c08afc61b587560d515a475efd819032');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).not.toContain('secrets.');
    expect(wrapper).toContain('--network none');
    expect(wrapper).toContain('--cpus=0.50');
    expect(wrapper).toContain('--memory=256m --memory-swap=256m');
    expect(wrapper).toContain('--cap-drop=ALL');
    expect(wrapper).toContain('--read-only --tmpfs');
    expect(wrapper).toContain('BLOCKED_INCOMPLETE');
    expect(wrapper).toContain('SAJU_PRODUCTION_SERVICE_BEARER');
    expect(wrapper).toContain('source_sha="9807ce89c08afc61b587560d515a475efd819032"');
    expect(runner).toContain('http://127.0.0.1:');
    expect(runner).toContain("resolve(argv[1]) === '/saju'");
    expect(runner).not.toMatch(/https?:\/\/(?!127\.0\.0\.1)[^'"]+/u);
    expect(runner).toContain('MAX_IN_FLIGHT = 16');
    expect(runner).toContain('REQUEST_DEADLINE_MS = 2500');
    expect(runner).toContain('saturationKneeApproved: false');
  });
});
