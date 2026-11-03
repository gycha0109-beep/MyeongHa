export const SUSTAINED_SCHEMA = 'myeongha-ops-saju-split-cgroup-sustained-phase11-v1';
const SOURCE_SHA = '9807ce89c08afc61b587560d515a475efd819032';
const CAP = 268435456;
export const PROFILES = Object.freeze([
  { profile: 'single-user-5m', durationSeconds: 300, targetRps: 1, concurrencyLimit: 1, plannedSlots: 300 },
  { profile: 'normal-concurrency-15m', durationSeconds: 900, targetRps: 4, concurrencyLimit: 4, plannedSlots: 3600 },
]);
const FLAGS = [
  'saturationKneeApproved', 'sajuSaturationCeilingProven',
  'productionSajuCpuMemoryCeilingProven', 'productionCapacityProven',
  'productionScalingThresholdApproved', 'drReady', 'serviceResumptionAllowed',
  'outputContainsIdentifiers',
];
const validCount = n => Number.isSafeInteger(n) && n >= 0;
const positiveFinite = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
const need = (test, why) => { if (!test) throw Error('SAJU_SUSTAINED_PHASE11: ' + why); };
const total = (stages, key) => stages.reduce((acc, row) => acc + row[key], 0);

export function validateSajuSustainedReport(report) {
  need(report?.schema === SUSTAINED_SCHEMA &&
    report.status === 'OBSERVED_SUSTAINED_REAL_SAJU' &&
    report.sourceSha === SOURCE_SHA &&
    report.actualSajuProductionHostUsed === true &&
    report.syntheticInputOnly === true &&
    report.networkScope === 'shared-offline-network-namespace-loopback-only' &&
    report.separateResourceCgroups === true &&
    report.kernelConstraints?.serviceCpuCores === 0.5 &&
    report.kernelConstraints?.driverCpuCores === 1 &&
    report.kernelConstraints?.serviceMemoryLimitBytes === CAP &&
    report.kernelConstraints?.driverMemoryLimitBytes === CAP &&
    report.kernelConstraints?.serviceSwapLimitBytes === 0 &&
    report.kernelConstraints?.driverSwapLimitBytes === 0,
  'Real pinned source, loopback isolation or split cgroup contract missing');
  for (const key of FLAGS) need(report[key] === false, 'Unapproved readiness or privacy claim');
  need(report.postPressureRecoverySucceeded === true &&
    report.serviceMemoryOomKills === 0 && report.driverMemoryOomKills === 0 &&
    Array.isArray(report.phases) && report.phases.length === PROFILES.length,
  'Real Saju post-pressure recovery or exact sustained stages not proven');
  for (const [i, expected] of PROFILES.entries()) {
    const p = report.phases[i];
    need(p && Object.entries(expected).every(([k, v]) => p[k] === v),
      'Sustained duration/rate/concurrency profile changed');
    for (const k of [
      'attempted', 'successfulCalculations', 'non200', 'transportFailures',
      'invalidResponses', 'skippedSchedulingLag', 'skippedInFlightCap',
      'maxInFlightObserved', 'serviceCpuUsecDelta',
      'serviceCpuThrottledPeriodsDelta', 'serviceCpuThrottledUsecDelta',
      'driverCpuUsecDelta', 'driverCpuThrottledPeriodsDelta',
      'driverCpuThrottledUsecDelta', 'servicePeakMemoryBytes',
      'driverPeakMemoryBytes',
    ]) need(validCount(p[k]), 'Invalid stage counter: ' + k);
    need(p.attempted + p.skippedSchedulingLag + p.skippedInFlightCap === p.plannedSlots &&
      p.successfulCalculations + p.non200 + p.transportFailures +
      p.invalidResponses === p.attempted &&
      p.maxInFlightObserved <= expected.concurrencyLimit &&
      (p.attempted > 0 ? p.maxInFlightObserved > 0 : p.maxInFlightObserved === 0),
    'Skipped/attempted/successful slot accounting not balanced');
    need(p.servicePeakMemoryBytes > 0 && p.servicePeakMemoryBytes <= CAP &&
      p.driverPeakMemoryBytes > 0 && p.driverPeakMemoryBytes <= CAP,
    'Peak memory not attributable to separately limited cgroups');
    need(positiveFinite(p.observedSchedulingWindowMs) &&
      positiveFinite(p.observedIncludingDrainMs) &&
      p.observedSchedulingWindowMs >= p.durationSeconds * 1000 - 1000 &&
      p.observedIncludingDrainMs >= p.observedSchedulingWindowMs &&
      p.observedIncludingDrainMs <= p.durationSeconds * 1000 + 60000,
    'Actual 5m/15m monotonic timing envelope not proven');
    if (p.successfulCalculations === 0) {
      need(p.successfulP50Ms === null && p.successfulP95Ms === null &&
        p.successfulP99Ms === null && p.achievedSuccessRps === 0,
      'Failed-only stage cannot claim successful latency or throughput');
    } else {
      need([p.successfulP50Ms, p.successfulP95Ms, p.successfulP99Ms].every(x =>
        typeof x === 'number' && Number.isFinite(x) && x >= 0) &&
        p.successfulP50Ms <= p.successfulP95Ms &&
        p.successfulP95Ms <= p.successfulP99Ms &&
        positiveFinite(p.achievedSuccessRps) &&
        Math.abs(p.achievedSuccessRps -
          p.successfulCalculations / (p.observedSchedulingWindowMs / 1000)) < 0.01,
      'Successful latency or observed throughput not consistent');
    }
  }
  need(report.totalPlannedSlots === 3900 &&
    report.totalPlannedSlots === total(report.phases, 'plannedSlots') &&
    report.totalActualAttempts === total(report.phases, 'attempted') &&
    report.totalSuccessfulCalculations === total(report.phases, 'successfulCalculations') &&
    report.totalActualAttempts > 0 &&
    report.totalSuccessfulCalculations > 0,
  'Aggregate sustained slot accounting incomplete');
  for (const [sumKey, stageKey] of [
    ['serviceTotalCpuUsec', 'serviceCpuUsecDelta'],
    ['serviceTotalThrottledPeriods', 'serviceCpuThrottledPeriodsDelta'],
    ['serviceTotalThrottledUsec', 'serviceCpuThrottledUsecDelta'],
    ['driverTotalCpuUsec', 'driverCpuUsecDelta'],
    ['driverTotalThrottledPeriods', 'driverCpuThrottledPeriodsDelta'],
    ['driverTotalThrottledUsec', 'driverCpuThrottledUsecDelta'],
  ]) need(validCount(report[sumKey]) &&
    report[sumKey] >= total(report.phases, stageKey),
  'Non-monotonic or incomplete cgroup resource totals');
  for (const name of ['service', 'driver']) {
    const peak = report[name + 'PeakMemoryBytes'];
    need(validCount(peak) && peak > 0 && peak <= CAP &&
      peak >= Math.max(...report.phases.map(p => p[name + 'PeakMemoryBytes'])),
    'Cgroup memory peak must be bounded and cover both stages');
  }
  return report;
}
