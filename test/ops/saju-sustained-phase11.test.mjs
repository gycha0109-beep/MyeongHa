import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  validateSajuSustainedReport, PROFILES, SUSTAINED_SCHEMA,
} from '../../scripts/operations/validate-isolated-saju-sustained-phase11.mjs';

function fakeReport() {
  const phases = PROFILES.map(profile => ({
    ...profile,
    attempted: profile.plannedSlots, successfulCalculations: profile.plannedSlots,
    non200: 0, transportFailures: 0, invalidResponses: 0,
    skippedSchedulingLag: 0, skippedInFlightCap: 0, maxInFlightObserved: 1,
    successfulP50Ms: 1, successfulP95Ms: 2, successfulP99Ms: 3,
    achievedSuccessRps: profile.targetRps,
    observedSchedulingWindowMs: profile.durationSeconds * 1000,
    observedIncludingDrainMs: profile.durationSeconds * 1000 + 1,
    serviceCpuUsecDelta: 50, serviceCpuThrottledPeriodsDelta: 0,
    serviceCpuThrottledUsecDelta: 0, servicePeakMemoryBytes: 45_000_000,
    driverCpuUsecDelta: 65, driverCpuThrottledPeriodsDelta: 0,
    driverCpuThrottledUsecDelta: 0, driverPeakMemoryBytes: 50_000_000,
  }));
  return {
    schema: SUSTAINED_SCHEMA, status: 'OBSERVED_SUSTAINED_REAL_SAJU',
    sourceSha: '9807ce89c08afc61b587560d515a475efd819032',
    actualSajuProductionHostUsed: true, syntheticInputOnly: true,
    networkScope: 'shared-offline-network-namespace-loopback-only',
    separateResourceCgroups: true,
    kernelConstraints: {
      serviceCpuCores: 0.5, driverCpuCores: 1,
      serviceMemoryLimitBytes: 268435456, driverMemoryLimitBytes: 268435456,
      serviceSwapLimitBytes: 0, driverSwapLimitBytes: 0,
    },
    phases, totalPlannedSlots: 3900, totalActualAttempts: 3900,
    totalSuccessfulCalculations: 3900,
    serviceTotalCpuUsec: 100, serviceTotalThrottledPeriods: 0,
    serviceTotalThrottledUsec: 0, driverTotalCpuUsec: 130,
    driverTotalThrottledPeriods: 0, driverTotalThrottledUsec: 0,
    servicePeakMemoryBytes: 45_000_000, driverPeakMemoryBytes: 50_000_000,
    serviceMemoryOomKills: 0, driverMemoryOomKills: 0,
    postPressureRecoverySucceeded: true,
    saturationKneeApproved: false, sajuSaturationCeilingProven: false,
    productionSajuCpuMemoryCeilingProven: false, productionCapacityProven: false,
    productionScalingThresholdApproved: false, drReady: false,
    serviceResumptionAllowed: false, outputContainsIdentifiers: false,
  };
}

describe('Phase 11 real Saju sustained 5-minute / 15-minute envelope', () => {
  it('locks exactly the architecture-established sustained 5m/15m profiles', () => {
    expect(PROFILES).toMatchObject([
      { profile: 'single-user-5m', durationSeconds: 300, targetRps: 1, concurrencyLimit: 1, plannedSlots: 300 },
      { profile: 'normal-concurrency-15m', durationSeconds: 900, targetRps: 4, concurrencyLimit: 4, plannedSlots: 3600 },
    ]);
    expect(validateSajuSustainedReport(fakeReport()).totalPlannedSlots).toBe(3900);
  });

  it('fails closed on unmeasured stage durations, fabricated success and skipped slots', () => {
    const stageChange = callback => {
      const report = fakeReport();
      callback(report.phases[1], report);
      expect(() => validateSajuSustainedReport(report)).toThrow();
    };
    stageChange(x => { x.durationSeconds = 30; });
    stageChange(x => { x.targetRps = 400; });
    stageChange(x => { x.concurrencyLimit = 16; });
    stageChange(x => { x.plannedSlots = 4; });
    stageChange(x => { x.observedSchedulingWindowMs = 12_000; });
    stageChange(x => { x.successfulCalculations = 3601; });
    stageChange(x => { x.skippedSchedulingLag = -1; });
    stageChange(x => { x.maxInFlightObserved = 17; });
    stageChange(x => { x.successfulP95Ms = 99; x.successfulP99Ms = 3; });
    stageChange(x => { x.achievedSuccessRps = 400; });
    stageChange(x => { x.serviceCpuUsecDelta = -1; });
    stageChange(x => { x.driverPeakMemoryBytes = 300_000_000; });
  });

  it('never accepts Production readiness, absent cgroups or missing post-pressure recovery', () => {
    for (const patch of [
      { sourceSha: 'a'.repeat(40) }, { status: 'BLOCKED_INCOMPLETE' },
      { actualSajuProductionHostUsed: false }, { syntheticInputOnly: false },
      { networkScope: 'public' }, { separateResourceCgroups: false },
      { postPressureRecoverySucceeded: false }, { serviceMemoryOomKills: 1 },
      { driverMemoryOomKills: 1 }, { drReady: true },
      { serviceResumptionAllowed: true }, { productionCapacityProven: true },
      { saturationKneeApproved: true }, { outputContainsIdentifiers: true },
      { phases: fakeReport().phases.slice(1) },
      { totalActualAttempts: 3901 },
      { serviceTotalCpuUsec: 1 },
    ]) {
      expect(() => validateSajuSustainedReport({ ...fakeReport(), ...patch })).toThrow();
    }
    const report = fakeReport();
    report.kernelConstraints.serviceCpuCores = 4;
    expect(() => validateSajuSustainedReport(report)).toThrow();
  });

  it('keeps prior shared and split runs unchanged and requires exact main manual dispatch', () => {
    const workflow = readFileSync('.github/workflows/saju-isolated-rate-ladder-phase11.yml', 'utf8');
    const runner = readFileSync('scripts/operations/run-isolated-saju-split-rate-ladder-phase11.mjs', 'utf8');
    const driver = readFileSync('scripts/operations/measure-isolated-saju-sustained-phase11.mjs', 'utf8');
    expect(workflow).toContain('default: shared');
    expect(workflow).toContain('- sustained');
    expect(workflow).toContain("inputs.experiment == 'shared'");
    expect(workflow).toContain("inputs.experiment == 'split'");
    expect(workflow).toContain("inputs.experiment == 'sustained'");
    expect(workflow).toContain('isolated-saju-sustained-phase11-');
    expect(workflow).not.toContain('pull_request:');
    expect(workflow).not.toContain('secrets.');
    expect(runner).toContain("GITHUB_REF === 'refs/heads/main'");
    expect(runner).toContain("'--network=none'");
    expect(runner).toContain("'--network=container:' + cid");
    expect(runner).toContain("'--cpus=0.50'");
    expect(runner).toContain("'--cpus=1.00'");
    expect(runner).toContain('sustained ? 1_320_000 : 120000');
    expect(runner).toContain('validateSajuSustainedReport');
    expect(driver).toContain('performance.now()');
    expect(driver).toContain('AbortSignal.timeout(2500)');
    expect(driver).toContain('postPressureRecoverySucceeded: recovered');
    expect(driver).toContain('serviceResumptionAllowed: false');
    expect(driver).not.toContain('https://');
  });
});
