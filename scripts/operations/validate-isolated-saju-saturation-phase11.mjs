export const SATURATION_SCHEMA = 'myeongha-ops-saju-split-cgroup-controlled-saturation-phase11-v1';
export const SATURATION_RATES = Object.freeze([400, 800, 1200, 1600]);
export const SATURATION_SECONDS = 15;
export const SATURATION_WAVES_PER_SECOND = 100;
export const SATURATION_ROUNDS = 2;
export const SATURATION_MAX_IN_FLIGHT = 64;
const SOURCE = '9807ce89c08afc61b587560d515a475efd819032';
const CAP = 268435456;
const FAIL_FALSE = [
  'saturationKneeApproved', 'sajuSaturationCeilingProven',
  'productionSajuCpuMemoryCeilingProven', 'productionCapacityProven',
  'productionScalingThresholdApproved', 'drReady', 'serviceResumptionAllowed',
  'outputContainsIdentifiers',
];
const validInt = n => Number.isSafeInteger(n) && n >= 0;
const positive = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
const need = (yes, why) => { if (!yes) throw Error('ISOLATED_SAJU_SATURATION_INVALID: ' + why); };
const total = (rows, key) => rows.reduce((v, item) => v + item[key], 0);

export function validateSajuSaturationReport(report) {
  need(report?.schema === SATURATION_SCHEMA &&
    report.status === 'OBSERVED_BOUNDED_SPLIT_CGROUP_SATURATION' &&
    report.sourceSha === SOURCE &&
    report.actualSajuProductionHostUsed === true &&
    report.syntheticInputOnly === true &&
    report.networkScope === 'shared-offline-network-namespace-loopback-only' &&
    report.separateResourceCgroups === true &&
    report.boundedSyntheticProbeOnly === true &&
    report.wavesPerSecond === SATURATION_WAVES_PER_SECOND &&
    report.maxInFlightCap === SATURATION_MAX_IN_FLIGHT,
  'Source, mode, isolation, or explicit diagnostic-only scope not proven');
  for (const field of FAIL_FALSE) need(report[field] === false, 'Premature Production approval or privacy claim: ' + field);
  const quotas = report.kernelConstraints;
  need(quotas?.serviceCpuCores === 0.5 && quotas.driverCpuCores === 1 &&
    quotas.serviceMemoryLimitBytes === CAP && quotas.driverMemoryLimitBytes === CAP &&
    quotas.serviceSwapLimitBytes === 0 && quotas.driverSwapLimitBytes === 0,
  'Independent service and driver cgroup CPU/RAM/swap limits missing');
  need(report.postPressureRecoverySucceeded === true &&
    report.serviceMemoryOomKills === 0 && report.driverMemoryOomKills === 0,
  'Recovery or OOM safety not proven');
  need(Array.isArray(report.rates) &&
    report.rates.length === SATURATION_ROUNDS * SATURATION_RATES.length,
  'Exactly two fixed bounded 4-stage rounds required');
  for (let i = 0; i < report.rates.length; i++) {
    const stage = report.rates[i], rate = SATURATION_RATES[i % SATURATION_RATES.length],
      round = Math.floor(i / SATURATION_RATES.length) + 1;
    need(stage.targetRps === rate && stage.round === round &&
      stage.intervalSeconds === SATURATION_SECONDS &&
      stage.wavesPerSecond === SATURATION_WAVES_PER_SECOND &&
      stage.waveSize === rate / SATURATION_WAVES_PER_SECOND &&
      stage.plannedSlots === rate * SATURATION_SECONDS,
    'Measured target, repeated stage order, wave batching or bounded duration changed');
    for (const key of [
      'attempted', 'successfulCalculations', 'non200', 'transportFailures',
      'invalidResponses', 'skippedSchedulingLag', 'skippedInFlightCap',
      'maxInFlightObserved', 'serviceCpuUsecDelta',
      'serviceCpuThrottledPeriodsDelta', 'serviceCpuThrottledUsecDelta',
      'servicePeakMemoryBytes', 'driverCpuUsecDelta',
      'driverCpuThrottledPeriodsDelta', 'driverCpuThrottledUsecDelta',
      'driverPeakMemoryBytes',
    ]) need(validInt(stage[key]), 'Stage counter missing: ' + key);
    need(stage.attempted + stage.skippedSchedulingLag +
      stage.skippedInFlightCap === stage.plannedSlots &&
      stage.attempted === stage.successfulCalculations + stage.non200 +
        stage.transportFailures + stage.invalidResponses &&
      stage.maxInFlightObserved <= SATURATION_MAX_IN_FLIGHT &&
      (stage.attempted === 0 ? stage.maxInFlightObserved === 0 : stage.maxInFlightObserved > 0),
    'Actual scheduling/in-flight cap and per-request outcome accounting invalid');
    need(stage.servicePeakMemoryBytes > 0 && stage.servicePeakMemoryBytes <= CAP &&
      stage.driverPeakMemoryBytes > 0 && stage.driverPeakMemoryBytes <= CAP,
    'Peak memory not kernel bounded');
    need(positive(stage.observedSchedulingWindowMs) &&
      stage.observedSchedulingWindowMs >= (SATURATION_SECONDS - 1) * 1000 &&
      stage.observedSchedulingWindowMs <= (SATURATION_SECONDS + 60) * 1000 &&
      stage.observedIncludingDrainMs >= stage.observedSchedulingWindowMs &&
      stage.observedIncludingDrainMs <= (SATURATION_SECONDS + 60) * 1000,
    'Actual 15-second scheduling window or bounded drain time invalid');
    if (!stage.successfulCalculations) {
      need(stage.successfulP50Ms === null && stage.successfulP95Ms === null &&
        stage.successfulP99Ms === null && stage.achievedSuccessRps === 0,
      'Zero success stage cannot report successful latency');
    } else {
      need([stage.successfulP50Ms, stage.successfulP95Ms, stage.successfulP99Ms].every(
        n => typeof n === 'number' && Number.isFinite(n) && n >= 0) &&
        stage.successfulP50Ms <= stage.successfulP95Ms &&
        stage.successfulP95Ms <= stage.successfulP99Ms &&
        positive(stage.achievedSuccessRps) &&
        Math.abs(stage.achievedSuccessRps -
          stage.successfulCalculations / (stage.observedSchedulingWindowMs / 1000)) < 0.01,
      'Observed successful throughput or percentile latency invalid');
    }
  }
  need(report.totalPlannedSlots === 120000 &&
    report.totalPlannedSlots === total(report.rates, 'plannedSlots') &&
    report.totalActualAttempts === total(report.rates, 'attempted') &&
    report.totalSuccessfulCalculations === total(report.rates, 'successfulCalculations') &&
    report.totalActualAttempts > 0 && report.totalSuccessfulCalculations > 0,
  'Aggregate 2-round accounting incomplete');
  for (const [totalKey, stageKey] of [
    ['serviceTotalCpuUsec', 'serviceCpuUsecDelta'],
    ['serviceTotalThrottledPeriods', 'serviceCpuThrottledPeriodsDelta'],
    ['serviceTotalThrottledUsec', 'serviceCpuThrottledUsecDelta'],
    ['driverTotalCpuUsec', 'driverCpuUsecDelta'],
    ['driverTotalThrottledPeriods', 'driverCpuThrottledPeriodsDelta'],
    ['driverTotalThrottledUsec', 'driverCpuThrottledUsecDelta'],
  ]) need(validInt(report[totalKey]) && report[totalKey] >= total(report.rates, stageKey),
  'Kernel counter aggregation invalid: ' + totalKey);
  for (const entity of ['service','driver']) need(validInt(report[entity + 'PeakMemoryBytes']) &&
    report[entity + 'PeakMemoryBytes'] <= CAP &&
    report[entity + 'PeakMemoryBytes'] >= Math.max(...report.rates.map(x => x[entity+'PeakMemoryBytes'])),
  'Kernel peak memory aggregation invalid: ' + entity);
  return report;
}
