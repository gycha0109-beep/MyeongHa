import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  validateSajuSaturationReport, SATURATION_RATES, SATURATION_SECONDS,
  SATURATION_ROUNDS, SATURATION_WAVES_PER_SECOND, SATURATION_MAX_IN_FLIGHT,
} from '../../scripts/operations/validate-isolated-saju-saturation-phase11.mjs';

function syntheticFixture() {
  const rates = Array.from({ length: SATURATION_ROUNDS }, (_, index) =>
    SATURATION_RATES.map(rate => ({
      targetRps: rate, round: index + 1, intervalSeconds: SATURATION_SECONDS,
      wavesPerSecond: SATURATION_WAVES_PER_SECOND, waveSize: rate / SATURATION_WAVES_PER_SECOND,
      plannedSlots: rate * SATURATION_SECONDS,
      attempted: rate * SATURATION_SECONDS, successfulCalculations: rate * SATURATION_SECONDS,
      non200: 0, transportFailures: 0, invalidResponses: 0,
      skippedSchedulingLag: 0, skippedInFlightCap: 0, maxInFlightObserved: 8,
      successfulP50Ms: 1, successfulP95Ms: 3, successfulP99Ms: 4,
      achievedSuccessRps: rate, observedSchedulingWindowMs: 15000,
      observedIncludingDrainMs: 15001,
      serviceCpuUsecDelta: 100000, serviceCpuThrottledPeriodsDelta: 1,
      serviceCpuThrottledUsecDelta: 2000, servicePeakMemoryBytes: 48000000,
      driverCpuUsecDelta: 160000, driverCpuThrottledPeriodsDelta: 0,
      driverCpuThrottledUsecDelta: 0, driverPeakMemoryBytes: 52000000,
    }))).flat();
  return {
    schema: 'myeongha-ops-saju-split-cgroup-controlled-saturation-phase11-v1',
    status: 'OBSERVED_BOUNDED_SPLIT_CGROUP_SATURATION',
    sourceSha: '9807ce89c08afc61b587560d515a475efd819032',
    actualSajuProductionHostUsed: true, syntheticInputOnly: true,
    networkScope: 'shared-offline-network-namespace-loopback-only',
    separateResourceCgroups: true, boundedSyntheticProbeOnly: true,
    wavesPerSecond: SATURATION_WAVES_PER_SECOND,
    maxInFlightCap: SATURATION_MAX_IN_FLIGHT,
    kernelConstraints: {
      serviceCpuCores: 0.5, driverCpuCores: 1,
      serviceMemoryLimitBytes: 268435456, driverMemoryLimitBytes: 268435456,
      serviceSwapLimitBytes: 0, driverSwapLimitBytes: 0,
    },
    rates, totalPlannedSlots: 120000, totalActualAttempts: 120000,
    totalSuccessfulCalculations: 120000,
    serviceTotalCpuUsec: 800000, serviceTotalThrottledPeriods: 8,
    serviceTotalThrottledUsec: 16000, servicePeakMemoryBytes: 48000000,
    driverTotalCpuUsec: 1280000, driverTotalThrottledPeriods: 0,
    driverTotalThrottledUsec: 0, driverPeakMemoryBytes: 52000000,
    serviceMemoryOomKills: 0, driverMemoryOomKills: 0,
    postPressureRecoverySucceeded: true,
    saturationKneeApproved: false, sajuSaturationCeilingProven: false,
    productionSajuCpuMemoryCeilingProven: false, productionCapacityProven: false,
    productionScalingThresholdApproved: false, drReady: false,
    serviceResumptionAllowed: false, outputContainsIdentifiers: false,
  };
}

describe('Phase 11 bounded repeatable Saju saturation diagnostic, not approval', () => {
  it('locks two 4-stage 15s offline synthetic probes and validates kernel accounting', () => {
    expect(SATURATION_RATES).toEqual([400, 800, 1200, 1600]);
    expect(SATURATION_SECONDS).toBe(15);
    expect(SATURATION_ROUNDS).toBe(2);
    expect(SATURATION_WAVES_PER_SECOND).toBe(100);
    expect(SATURATION_MAX_IN_FLIGHT).toBe(64);
    expect(validateSajuSaturationReport(syntheticFixture())).toMatchObject({
      totalPlannedSlots: 120000, totalActualAttempts: 120000,
      totalSuccessfulCalculations: 120000, saturationKneeApproved: false,
      productionCapacityProven: false, drReady: false,
    });
  });

  it('fails closed on missing rounds, distorted stages, fabricated time or rate', () => {
    const corrupt = action => {
      const report = syntheticFixture();
      action(report.rates[7], report);
      expect(() => validateSajuSaturationReport(report)).toThrow();
    };
    corrupt(x => { x.targetRps = 3200; });
    corrupt(x => { x.round = 1; });
    corrupt(x => { x.intervalSeconds = 60; });
    corrupt(x => { x.waveSize = 1; });
    corrupt(x => { x.wavesPerSecond = 1000; });
    corrupt(x => { x.plannedSlots = 400; });
    corrupt(x => { x.observedSchedulingWindowMs = 1000; });
    corrupt(x => { x.successfulCalculations = 24001; });
    corrupt(x => { x.skippedSchedulingLag = -1; });
    corrupt(x => { x.maxInFlightObserved = 65; });
    corrupt(x => { x.achievedSuccessRps = 2000; });
    corrupt(x => { x.successfulP95Ms = 9; x.successfulP99Ms = 2; });
    corrupt(x => { x.servicePeakMemoryBytes = 300000000; });
    corrupt(x => { x.serviceCpuThrottledPeriodsDelta = -1; });
    corrupt((_, report) => { report.totalActualAttempts = 119999; });
    corrupt((_, report) => { report.serviceTotalCpuUsec = 1; });
    corrupt((_, report) => { report.rates.pop(); });
  });

  it('rejects unearned Production, DR, service ceiling and unsafe source claims', () => {
    for (const key of [
      'saturationKneeApproved', 'sajuSaturationCeilingProven',
      'productionSajuCpuMemoryCeilingProven', 'productionCapacityProven',
      'productionScalingThresholdApproved', 'drReady', 'serviceResumptionAllowed',
      'outputContainsIdentifiers',
    ]) {
      const r = syntheticFixture(); r[key] = true;
      expect(() => validateSajuSaturationReport(r)).toThrow();
    }
    for (const action of [
      r => { r.sourceSha = 'a'.repeat(40); },
      r => { r.separateResourceCgroups = false; },
      r => { r.boundedSyntheticProbeOnly = false; },
      r => { r.networkScope = 'internet'; },
      r => { r.kernelConstraints.serviceCpuCores = 4; },
      r => { r.serviceMemoryOomKills = 1; },
      r => { r.postPressureRecoverySucceeded = false; },
    ]) {
      const r = syntheticFixture(); action(r);
      expect(() => validateSajuSaturationReport(r)).toThrow();
    }
  });

  it('retains shared/split/sustained/four-client modes and exactly connected validation symbol', () => {
    const yml = readFileSync('.github/workflows/saju-isolated-rate-ladder-phase11.yml', 'utf8');
    const runner = readFileSync('scripts/operations/run-isolated-saju-split-rate-ladder-phase11.mjs', 'utf8');
    const driver = readFileSync('scripts/operations/measure-isolated-saju-split-rate-ladder-phase11.mjs', 'utf8');
    expect(yml).toContain('default: shared');
    for (const mode of ['shared', 'split', 'sustained', 'four-client-waves', 'saturation']) {
      expect(yml).toContain('- ' + mode);
      expect(yml).toContain("inputs.experiment == '" + mode + "'");
    }
    expect(yml).not.toContain('pull_request:');
    expect(yml).not.toContain('secrets.');
    expect(runner).toContain("import { validateSajuSaturationReport } from './validate-isolated-saju-saturation-phase11.mjs'");
    expect(runner).toContain('saturation ? validateSajuSaturationReport(JSON.parse(stdout))');
    expect(runner).toContain("'--network=none'");
    expect(runner).toContain("'--network=container:' + cid");
    expect(runner).toContain("'--cpus=0.50'");
    expect(runner).toContain("'--cpus=1.00'");
    expect(runner).toContain("saturation ? ['--saturation'] : []");
    expect(driver).toContain('Math.floor(slot / waveSize)');
    expect(driver).toContain('async function measure(rate, saturation = false, roundNumber = 0)');
    expect(driver).toContain('...(saturation ? { round: roundNumber,');
    expect(driver).toContain('achievedSuccessRps: round(');
    expect(driver).not.toContain('async function measure(rate, saturation = false, round = 0)');
    expect(driver).toContain('SATURATION_MAX_IN_FLIGHT = 64');
    expect(driver).toContain('SATURATION_ROUNDS = 2');
    expect(driver).toContain('saturation ? 120000 : 4710');
    expect(driver).toContain('postPressureRecoverySucceeded: recovery');
  });
});
