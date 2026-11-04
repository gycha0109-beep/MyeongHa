import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SCHEMA = 'myeongha-ops-saju-split-cgroup-controlled-saturation-phase11-v1';
const SAJU_SHA = '9807ce89c08afc61b587560d515a475efd819032';
const RATES = [400, 800, 1200, 1600];
const MEMORY_CAP = 268435456;
const FALSE_FLAGS = [
  'saturationKneeApproved', 'sajuSaturationCeilingProven',
  'productionSajuCpuMemoryCeilingProven', 'productionCapacityProven',
  'productionScalingThresholdApproved', 'drReady', 'serviceResumptionAllowed',
  'outputContainsIdentifiers',
];
const ROOT_KEYS = [
  'schema', 'status', 'sourceSha', 'actualSajuProductionHostUsed',
  'syntheticInputOnly', 'networkScope', 'separateResourceCgroups',
  'boundedSyntheticProbeOnly', 'wavesPerSecond', 'maxInFlightCap',
  'kernelConstraints', 'rates', 'totalPlannedSlots', 'totalActualAttempts',
  'totalSuccessfulCalculations', 'serviceTotalCpuUsec',
  'serviceTotalThrottledPeriods', 'serviceTotalThrottledUsec',
  'driverTotalCpuUsec', 'driverTotalThrottledPeriods', 'driverTotalThrottledUsec',
  'servicePeakMemoryBytes', 'driverPeakMemoryBytes', 'serviceMemoryOomKills',
  'driverMemoryOomKills', 'postPressureRecoverySucceeded',
  ...FALSE_FLAGS, 'nodeImageDigest', 'githubMainSha',
];
const STAGE_KEYS = [
  'targetRps', 'round', 'intervalSeconds', 'wavesPerSecond', 'waveSize',
  'plannedSlots', 'attempted', 'successfulCalculations', 'non200',
  'transportFailures', 'invalidResponses', 'skippedSchedulingLag',
  'skippedInFlightCap', 'maxInFlightObserved', 'successfulP50Ms',
  'successfulP95Ms', 'successfulP99Ms', 'achievedSuccessRps',
  'observedSchedulingWindowMs', 'observedIncludingDrainMs',
  'serviceCpuUsecDelta', 'serviceCpuThrottledPeriodsDelta',
  'serviceCpuThrottledUsecDelta', 'servicePeakMemoryBytes',
  'driverCpuUsecDelta', 'driverCpuThrottledPeriodsDelta',
  'driverCpuThrottledUsecDelta', 'driverPeakMemoryBytes',
];
const QUOTA_KEYS = [
  'serviceCpuCores', 'driverCpuCores', 'serviceMemoryLimitBytes',
  'driverMemoryLimitBytes', 'serviceSwapLimitBytes', 'driverSwapLimitBytes',
];
const COUNTERS = [
  'plannedSlots', 'attempted', 'successfulCalculations', 'non200',
  'transportFailures', 'invalidResponses', 'skippedSchedulingLag',
  'skippedInFlightCap', 'maxInFlightObserved', 'serviceCpuUsecDelta',
  'serviceCpuThrottledPeriodsDelta', 'serviceCpuThrottledUsecDelta',
  'servicePeakMemoryBytes', 'driverCpuUsecDelta',
  'driverCpuThrottledPeriodsDelta', 'driverCpuThrottledUsecDelta',
  'driverPeakMemoryBytes',
];
const requireProof = (pass, reason) => {
  if (!pass) throw Error('ISOLATED_SAJU_SATURATION_PROOF_INVALID: ' + reason);
};
const validCount = n => Number.isSafeInteger(n) && n >= 0;
const positive = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
const sum = (rows, key) => rows.reduce((n, row) => n + row[key], 0);
function exactlyKeys(value, keys, name) {
  requireProof(value && typeof value === 'object' && !Array.isArray(value),
    name + ' must be a nonarray object');
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  requireProof(actual.length === expected.length &&
    actual.every((x,i) => x === expected[i]), name + ' unexpected or missing fields');
}
export function validateSaturationLinuxProof(proof, expectedMainSha) {
  requireProof(/^[a-f0-9]{40}$/u.test(expectedMainSha), 'Expected main SHA invalid');
  exactlyKeys(proof, ROOT_KEYS, 'root');
  requireProof(proof.schema === SCHEMA &&
    proof.status === 'OBSERVED_BOUNDED_SPLIT_CGROUP_SATURATION' &&
    proof.githubMainSha === expectedMainSha &&
    proof.sourceSha === SAJU_SHA &&
    /^node@sha256:[a-f0-9]{64}$/u.test(proof.nodeImageDigest),
  'Actual main, Saju source, runtime digest, schema or observation status invalid');
  requireProof(proof.actualSajuProductionHostUsed === true &&
    proof.syntheticInputOnly === true &&
    proof.networkScope === 'shared-offline-network-namespace-loopback-only' &&
    proof.separateResourceCgroups === true &&
    proof.boundedSyntheticProbeOnly === true &&
    proof.wavesPerSecond === 100 && proof.maxInFlightCap === 64,
  'Actual synthetic source, offline runtime or sender resource isolation missing');
  for (const k of FALSE_FLAGS) requireProof(proof[k] === false,
    'Unapproved production/readiness or identifying data: ' + k);
  requireProof(proof.postPressureRecoverySucceeded === true &&
    proof.serviceMemoryOomKills === 0 && proof.driverMemoryOomKills === 0,
  'Post-pressure actual Saju recovery or zero OOM not proven');
  exactlyKeys(proof.kernelConstraints, QUOTA_KEYS, 'quotas');
  const c = proof.kernelConstraints;
  requireProof(c.serviceCpuCores === 0.5 && c.driverCpuCores === 1 &&
    c.serviceMemoryLimitBytes === MEMORY_CAP &&
    c.driverMemoryLimitBytes === MEMORY_CAP &&
    c.serviceSwapLimitBytes === 0 && c.driverSwapLimitBytes === 0,
  'Actual isolated Linux service/driver quotas not enforced');
  requireProof(Array.isArray(proof.rates) && proof.rates.length === 8,
    'Exactly two rounds at four rates required');
  for (let i=0;i<8;i++) {
    const s = proof.rates[i], rate = RATES[i % 4], round = Math.floor(i/4)+1;
    exactlyKeys(s, STAGE_KEYS, 'stage '+i);
    requireProof(s.targetRps === rate && s.round === round &&
      s.intervalSeconds === 15 && s.wavesPerSecond === 100 &&
      s.waveSize === rate/100 && s.plannedSlots === rate*15,
    'Bounded stage rate, repeat order, 15s duration, or wave size not proven');
    for (const k of COUNTERS) requireProof(validCount(s[k]), 'Invalid kernel/response counter '+k);
    requireProof(s.attempted + s.skippedSchedulingLag +
      s.skippedInFlightCap === s.plannedSlots &&
      s.successfulCalculations + s.non200 + s.transportFailures +
        s.invalidResponses === s.attempted &&
      s.maxInFlightObserved <= 64 &&
      (s.attempted ? s.maxInFlightObserved >= 1 : s.maxInFlightObserved === 0),
    'Actual 120k scheduled slots and attempted outcomes do not reconcile');
    requireProof(s.servicePeakMemoryBytes > 0 &&
      s.servicePeakMemoryBytes <= MEMORY_CAP &&
      s.driverPeakMemoryBytes > 0 &&
      s.driverPeakMemoryBytes <= MEMORY_CAP,
    'Bounded kernel memory peak not established');
    requireProof(positive(s.observedSchedulingWindowMs) &&
      s.observedSchedulingWindowMs >= 14000 &&
      s.observedSchedulingWindowMs <= 75000 &&
      positive(s.observedIncludingDrainMs) &&
      s.observedIncludingDrainMs >= s.observedSchedulingWindowMs &&
      s.observedIncludingDrainMs <= 75000,
    'Real 15s sustained monotonic window or bounded drain absent');
    if (s.successfulCalculations === 0) {
      requireProof(s.successfulP50Ms === null &&
        s.successfulP95Ms === null && s.successfulP99Ms === null &&
        s.achievedSuccessRps === 0,
      'No successful responses cannot claim latency or throughput');
    } else {
      requireProof([s.successfulP50Ms,s.successfulP95Ms,s.successfulP99Ms]
        .every(x => typeof x === 'number' && Number.isFinite(x) && x >= 0) &&
        s.successfulP50Ms <= s.successfulP95Ms &&
        s.successfulP95Ms <= s.successfulP99Ms &&
        positive(s.achievedSuccessRps) &&
        Math.abs(s.achievedSuccessRps -
          s.successfulCalculations/(s.observedSchedulingWindowMs/1000)) < 0.01,
      'Measured successful latency/throughput inconsistent');
    }
  }
  requireProof(proof.totalPlannedSlots === 120000 &&
    proof.totalPlannedSlots === sum(proof.rates, 'plannedSlots') &&
    proof.totalActualAttempts === sum(proof.rates, 'attempted') &&
    proof.totalSuccessfulCalculations === sum(proof.rates,'successfulCalculations') &&
    proof.totalActualAttempts > 0 && proof.totalSuccessfulCalculations > 0,
  'Aggregate stage/request accounting invalid');
  for (const [k,stage] of [
    ['serviceTotalCpuUsec','serviceCpuUsecDelta'],
    ['serviceTotalThrottledPeriods','serviceCpuThrottledPeriodsDelta'],
    ['serviceTotalThrottledUsec','serviceCpuThrottledUsecDelta'],
    ['driverTotalCpuUsec','driverCpuUsecDelta'],
    ['driverTotalThrottledPeriods','driverCpuThrottledPeriodsDelta'],
    ['driverTotalThrottledUsec','driverCpuThrottledUsecDelta'],
  ]) requireProof(validCount(proof[k]) && proof[k] >= sum(proof.rates,stage),
    'Separate Linux cgroup counter delta/total invalid: '+k);
  for (const entity of ['service','driver'])
    requireProof(validCount(proof[entity+'PeakMemoryBytes']) &&
      proof[entity+'PeakMemoryBytes'] <= MEMORY_CAP &&
      proof[entity+'PeakMemoryBytes'] >=
        Math.max(...proof.rates.map(s => s[entity+'PeakMemoryBytes'])),
    'Bounded cgroup memory peak invalid');
  return {
    schema: proof.schema, status: proof.status, githubMainSha: proof.githubMainSha,
    sourceSha: proof.sourceSha, planned: proof.totalPlannedSlots,
    attempted: proof.totalActualAttempts,
    successful: proof.totalSuccessfulCalculations,
    skippedScheduling: sum(proof.rates,'skippedSchedulingLag'),
    skippedConcurrency: sum(proof.rates,'skippedInFlightCap'),
    non200: sum(proof.rates,'non200'),
    transportFailures: sum(proof.rates,'transportFailures'),
    invalidResponses: sum(proof.rates,'invalidResponses'),
    serviceThrottledPeriods: proof.serviceTotalThrottledPeriods,
    driverThrottledPeriods: proof.driverTotalThrottledPeriods,
    servicePeakMemoryBytes: proof.servicePeakMemoryBytes,
    driverPeakMemoryBytes: proof.driverPeakMemoryBytes,
    rateStages: proof.rates.map(s => ({
      round: s.round, targetRps: s.targetRps, attempted: s.attempted,
      success: s.successfulCalculations, skippedScheduling: s.skippedSchedulingLag,
      skippedConcurrency: s.skippedInFlightCap,
      observedInFlight: s.maxInFlightObserved,
      successfulP95Ms: s.successfulP95Ms, successRps: s.achievedSuccessRps,
      serviceCpuUsec: s.serviceCpuUsecDelta,
      serviceThrottledPeriods: s.serviceCpuThrottledPeriodsDelta,
      driverCpuUsec: s.driverCpuUsecDelta,
      driverThrottledPeriods: s.driverCpuThrottledPeriodsDelta,
    })),
    recovery: true, productionReady: false,
  };
}
export function verifySaturationLinuxProofFile(filepath, sha256, expectedMainSha) {
  requireProof(/^[a-f0-9]{64}$/u.test(sha256),'SHA256 argument invalid');
  const source = readFileSync(resolve(filepath));
  const digest = createHash('sha256').update(source).digest('hex');
  requireProof(digest === sha256,'Original raw Linux JSON bytes SHA256 mismatch');
  return { sha256: digest,
    ...validateSaturationLinuxProof(JSON.parse(source.toString('utf8')), expectedMainSha) };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 5) {
    console.error('Usage: node verify-saju-saturation-linux-proof-phase11.mjs <json> <original-sha256> <main-sha>');
    process.exitCode = 2;
  } else {
    try { console.log(JSON.stringify(verifySaturationLinuxProofFile(...process.argv.slice(2)), null, 2)); }
    catch { console.error('SATURATION_PROOF_BLOCKED: actual original Linux observation not validated'); process.exitCode = 1; }
  }
}
