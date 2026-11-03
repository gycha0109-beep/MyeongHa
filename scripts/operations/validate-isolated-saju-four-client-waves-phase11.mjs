export const FOUR_CLIENT_WAVE_SCHEMA = 'myeongha-ops-saju-split-cgroup-four-client-waves-phase11-v1';
const SOURCE_SHA = '9807ce89c08afc61b587560d515a475efd819032';
const CAP = 268435456;
const FALSE_FLAGS = [
  'saturationKneeApproved', 'sajuSaturationCeilingProven',
  'productionSajuCpuMemoryCeilingProven', 'productionCapacityProven',
  'productionScalingThresholdApproved', 'drReady', 'serviceResumptionAllowed',
  'outputContainsIdentifiers',
];
const requireSafe = (ok, reason) => { if (!ok) throw Error('SAJU_FOUR_CLIENT_WAVE_INCOMPLETE: ' + reason); };
const count = n => Number.isSafeInteger(n) && n >= 0;

export function validateFourClientWavesReport(report) {
  requireSafe(report && report.schema === FOUR_CLIENT_WAVE_SCHEMA &&
    report.status === 'OBSERVED_FOUR_CLIENT_WAVES' && report.sourceSha === SOURCE_SHA &&
    report.actualSajuProductionHostUsed === true && report.syntheticInputOnly === true &&
    report.networkScope === 'shared-offline-network-namespace-loopback-only' &&
    report.separateResourceCgroups === true && report.clientWaveSize === 4,
  'Actual pinned Saju and offline wave source not established');
  for (const key of FALSE_FLAGS) requireSafe(report[key] === false, 'Unsafe claim: ' + key);
  requireSafe(report.kernelConstraints?.serviceCpuCores === 0.5 &&
    report.kernelConstraints?.driverCpuCores === 1 &&
    report.kernelConstraints?.serviceMemoryLimitBytes === CAP &&
    report.kernelConstraints?.driverMemoryLimitBytes === CAP &&
    report.kernelConstraints?.serviceSwapLimitBytes === 0 &&
    report.kernelConstraints?.driverSwapLimitBytes === 0,
  'Enforced resource constraints not established');
  requireSafe(report.postPressureRecoverySucceeded === true &&
    report.serviceMemoryOomKills === 0 && report.driverMemoryOomKills === 0,
  'Recovered actual Saju, service OOM or driver OOM condition not proven');
  requireSafe(Array.isArray(report.phases) && report.phases.length === 1,
    'Exactly one bounded 15m wave stage required');
  const stage = report.phases[0];
  requireSafe(stage.profile === 'four-client-waves-15m' &&
    stage.durationSeconds === 900 && stage.targetRps === 4 &&
    stage.concurrencyLimit === 4 && stage.clientWaveSize === 4 &&
    stage.plannedSlots === 3600 && stage.maxInFlightObserved === 4,
  'Exactly 4 overlapping client request promises must be observed');
  for (const key of [
    'attempted', 'successfulCalculations', 'non200', 'transportFailures',
    'invalidResponses', 'skippedSchedulingLag', 'skippedInFlightCap',
    'serviceCpuUsecDelta', 'serviceCpuThrottledPeriodsDelta',
    'serviceCpuThrottledUsecDelta', 'servicePeakMemoryBytes',
    'driverCpuUsecDelta', 'driverCpuThrottledPeriodsDelta',
    'driverCpuThrottledUsecDelta', 'driverPeakMemoryBytes',
  ]) requireSafe(count(stage[key]), 'Stage counter unavailable ' + key);
  requireSafe(stage.attempted + stage.skippedSchedulingLag +
    stage.skippedInFlightCap === 3600 &&
    stage.attempted === stage.successfulCalculations + stage.non200 +
    stage.transportFailures + stage.invalidResponses,
  'Actual wave slots and response types do not balance');
  requireSafe(stage.servicePeakMemoryBytes > 0 && stage.servicePeakMemoryBytes <= CAP &&
    stage.driverPeakMemoryBytes > 0 && stage.driverPeakMemoryBytes <= CAP,
  'Unbounded cgroup memory');
  requireSafe(Number.isFinite(stage.observedSchedulingWindowMs) &&
    stage.observedSchedulingWindowMs >= 899000 &&
    Number.isFinite(stage.observedIncludingDrainMs) &&
    stage.observedIncludingDrainMs >= stage.observedSchedulingWindowMs &&
    stage.observedIncludingDrainMs <= 960000,
  'Real 15m elapsed time missing');
  if (stage.successfulCalculations > 0) {
    requireSafe([stage.successfulP50Ms, stage.successfulP95Ms, stage.successfulP99Ms]
      .every(n => Number.isFinite(n) && n >= 0) &&
      stage.successfulP50Ms <= stage.successfulP95Ms &&
      stage.successfulP95Ms <= stage.successfulP99Ms &&
      Number.isFinite(stage.achievedSuccessRps) && stage.achievedSuccessRps > 0 &&
      Math.abs(stage.achievedSuccessRps -
        stage.successfulCalculations / (stage.observedSchedulingWindowMs / 1000)) < 0.01,
    'Latency or actual successful throughput invalid');
  } else {
    requireSafe(stage.successfulP50Ms === null && stage.successfulP95Ms === null &&
      stage.successfulP99Ms === null && stage.achievedSuccessRps === 0,
    'No successful requests must have no success-only latency');
  }
  requireSafe(report.totalPlannedSlots === 3600 &&
    report.totalActualAttempts === stage.attempted &&
    report.totalSuccessfulCalculations === stage.successfulCalculations,
  'Aggregate wave counts inconsistent');
  for (const [k, sk] of [
    ['serviceTotalCpuUsec', 'serviceCpuUsecDelta'],
    ['driverTotalCpuUsec', 'driverCpuUsecDelta'],
    ['serviceTotalThrottledPeriods', 'serviceCpuThrottledPeriodsDelta'],
    ['driverTotalThrottledPeriods', 'driverCpuThrottledPeriodsDelta'],
    ['serviceTotalThrottledUsec', 'serviceCpuThrottledUsecDelta'],
    ['driverTotalThrottledUsec', 'driverCpuThrottledUsecDelta'],
  ]) requireSafe(count(report[k]) && report[k] >= stage[sk],
    'Kernel counter aggregate invalid: ' + k);
  requireSafe(count(report.servicePeakMemoryBytes) &&
    report.servicePeakMemoryBytes >= stage.servicePeakMemoryBytes &&
    report.servicePeakMemoryBytes <= CAP &&
    count(report.driverPeakMemoryBytes) &&
    report.driverPeakMemoryBytes >= stage.driverPeakMemoryBytes &&
    report.driverPeakMemoryBytes <= CAP,
  'Kernel cgroup memory peak invalid');
  return report;
}
