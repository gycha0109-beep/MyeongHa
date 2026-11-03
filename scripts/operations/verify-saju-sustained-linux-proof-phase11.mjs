import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SCHEMA = 'myeongha-ops-saju-split-cgroup-sustained-phase11-v1';
const PINNED_SOURCE = '9807ce89c08afc61b587560d515a475efd819032';
const CAP = 268435456;
const EXPECTED = [
  { profile: 'single-user-5m', durationSeconds: 300, targetRps: 1, concurrencyLimit: 1, plannedSlots: 300 },
  { profile: 'normal-concurrency-15m', durationSeconds: 900, targetRps: 4, concurrencyLimit: 4, plannedSlots: 3600 },
];
const FALSE_FLAGS = [
  'saturationKneeApproved', 'sajuSaturationCeilingProven',
  'productionSajuCpuMemoryCeilingProven', 'productionCapacityProven',
  'productionScalingThresholdApproved', 'drReady', 'serviceResumptionAllowed',
  'outputContainsIdentifiers',
];
const ROOT_KEYS = [
  'schema', 'status', 'sourceSha', 'actualSajuProductionHostUsed', 'syntheticInputOnly',
  'networkScope', 'separateResourceCgroups', 'kernelConstraints', 'phases',
  'totalPlannedSlots', 'totalActualAttempts', 'totalSuccessfulCalculations',
  'serviceTotalCpuUsec', 'serviceTotalThrottledPeriods', 'serviceTotalThrottledUsec',
  'driverTotalCpuUsec', 'driverTotalThrottledPeriods', 'driverTotalThrottledUsec',
  'servicePeakMemoryBytes', 'driverPeakMemoryBytes', 'serviceMemoryOomKills',
  'driverMemoryOomKills', 'postPressureRecoverySucceeded', ...FALSE_FLAGS,
  'nodeImageDigest', 'githubMainSha',
];
const CONSTRAINT_KEYS = [
  'serviceCpuCores', 'driverCpuCores',
  'serviceMemoryLimitBytes', 'driverMemoryLimitBytes',
  'serviceSwapLimitBytes', 'driverSwapLimitBytes',
];
const PROFILE_KEYS = [
  'profile', 'durationSeconds', 'targetRps', 'concurrencyLimit', 'plannedSlots',
  'attempted', 'successfulCalculations', 'non200', 'transportFailures',
  'invalidResponses', 'skippedSchedulingLag', 'skippedInFlightCap',
  'maxInFlightObserved', 'successfulP50Ms', 'successfulP95Ms', 'successfulP99Ms',
  'achievedSuccessRps', 'observedSchedulingWindowMs', 'observedIncludingDrainMs',
  'serviceCpuUsecDelta', 'serviceCpuThrottledPeriodsDelta', 'serviceCpuThrottledUsecDelta',
  'servicePeakMemoryBytes', 'driverCpuUsecDelta', 'driverCpuThrottledPeriodsDelta',
  'driverCpuThrottledUsecDelta', 'driverPeakMemoryBytes',
];
const COUNTERS = [
  'attempted', 'successfulCalculations', 'non200', 'transportFailures',
  'invalidResponses', 'skippedSchedulingLag', 'skippedInFlightCap',
  'maxInFlightObserved', 'serviceCpuUsecDelta', 'serviceCpuThrottledPeriodsDelta',
  'serviceCpuThrottledUsecDelta', 'servicePeakMemoryBytes', 'driverCpuUsecDelta',
  'driverCpuThrottledPeriodsDelta', 'driverCpuThrottledUsecDelta', 'driverPeakMemoryBytes',
];
const expect = (ok, reason) => { if (!ok) throw Error('SAJU_SUSTAINED_PROOF_INVALID: ' + reason); };
const isCount = n => Number.isSafeInteger(n) && n >= 0;
const isFinitePositive = n => Number.isFinite(n) && n > 0;
const sum = (rows, key) => rows.reduce((n, row) => n + row[key], 0);
function exactKeys(value, expected, group) {
  expect(value && typeof value === 'object' && !Array.isArray(value), group + ' not a record');
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  expect(actual.length === wanted.length && actual.every((k, i) => k === wanted[i]),
    group + ' has missing or unexpected fields');
}

export function validateSustainedLinuxProof(proof, expectedMainSha) {
  expect(/^[a-f0-9]{40}$/u.test(expectedMainSha), 'Expected MyeongHa commit invalid');
  exactKeys(proof, ROOT_KEYS, 'Evidence root');
  expect(proof.schema === SCHEMA && proof.status === 'OBSERVED_SUSTAINED_REAL_SAJU',
    'Measurement status or schema not successful');
  expect(proof.sourceSha === PINNED_SOURCE && proof.githubMainSha === expectedMainSha,
    'Actual Saju source or exact GitHub main SHA mismatch');
  expect(/^node@sha256:[a-f0-9]{64}$/u.test(proof.nodeImageDigest),
    'Container image digest missing');
  expect(proof.actualSajuProductionHostUsed === true &&
    proof.syntheticInputOnly === true &&
    proof.networkScope === 'shared-offline-network-namespace-loopback-only' &&
    proof.separateResourceCgroups === true,
  'Saju source/workload/loopback resource isolation not proven');
  for (const flag of FALSE_FLAGS) expect(proof[flag] === false, 'Unsafe claim or identifying data: ' + flag);
  expect(proof.postPressureRecoverySucceeded === true &&
    proof.serviceMemoryOomKills === 0 && proof.driverMemoryOomKills === 0,
  'Actual final Saju recovery or OOM absence not proven');
  exactKeys(proof.kernelConstraints, CONSTRAINT_KEYS, 'Cgroup constraints');
  const c = proof.kernelConstraints;
  expect(c.serviceCpuCores === 0.5 && c.driverCpuCores === 1 &&
    c.serviceMemoryLimitBytes === CAP && c.driverMemoryLimitBytes === CAP &&
    c.serviceSwapLimitBytes === 0 && c.driverSwapLimitBytes === 0,
  'Kernel CPU/RAM/swap constraints do not match the contract');
  expect(Array.isArray(proof.phases) && proof.phases.length === EXPECTED.length,
    'Both exact sustained profiles required');
  for (let i = 0; i < EXPECTED.length; i++) {
    const profile = proof.phases[i];
    const expected = EXPECTED[i];
    exactKeys(profile, PROFILE_KEYS, 'Sustained stage ' + i);
    expect(Object.entries(expected).every(([k,v]) => profile[k] === v),
      'Wrong profile, rate, concurrency or duration');
    for (const key of COUNTERS) expect(isCount(profile[key]),
      'Invalid stage counter ' + key);
    expect(profile.attempted + profile.skippedSchedulingLag + profile.skippedInFlightCap === profile.plannedSlots &&
      profile.attempted === profile.successfulCalculations + profile.non200 +
        profile.transportFailures + profile.invalidResponses,
    'Scheduled slots and attempted outcomes do not reconcile');
    expect(profile.maxInFlightObserved <= profile.concurrencyLimit &&
      (profile.attempted === 0 ? profile.maxInFlightObserved === 0 : profile.maxInFlightObserved >= 1),
    'Invalid observed in-flight concurrency');
    expect(profile.servicePeakMemoryBytes > 0 && profile.servicePeakMemoryBytes <= CAP &&
      profile.driverPeakMemoryBytes > 0 && profile.driverPeakMemoryBytes <= CAP,
    'Stage peak memory not within enforced cgroup');
    expect(isFinitePositive(profile.observedSchedulingWindowMs) &&
      isFinitePositive(profile.observedIncludingDrainMs) &&
      profile.observedSchedulingWindowMs >= profile.durationSeconds * 1000 - 1000 &&
      profile.observedIncludingDrainMs >= profile.observedSchedulingWindowMs &&
      profile.observedIncludingDrainMs <= profile.durationSeconds * 1000 + 60000,
    'Real monotonic sustained elapsed time not demonstrated');
    if (profile.successfulCalculations === 0) {
      expect(profile.successfulP50Ms === null && profile.successfulP95Ms === null &&
        profile.successfulP99Ms === null && profile.achievedSuccessRps === 0,
      'No successful attempts cannot have success percentiles');
    } else {
      expect([profile.successfulP50Ms, profile.successfulP95Ms, profile.successfulP99Ms]
        .every(x => typeof x === 'number' && Number.isFinite(x) && x >= 0) &&
        profile.successfulP50Ms <= profile.successfulP95Ms &&
        profile.successfulP95Ms <= profile.successfulP99Ms,
      'Successful percentiles inconsistent');
      expect(isFinitePositive(profile.achievedSuccessRps) &&
        Math.abs(profile.achievedSuccessRps -
          profile.successfulCalculations/(profile.observedSchedulingWindowMs/1000)) < 0.01,
      'Successful throughput incompatible with elapsed time');
    }
  }
  expect(proof.totalPlannedSlots === 3900 &&
    proof.totalPlannedSlots === sum(proof.phases, 'plannedSlots') &&
    proof.totalActualAttempts === sum(proof.phases, 'attempted') &&
    proof.totalSuccessfulCalculations === sum(proof.phases, 'successfulCalculations') &&
    proof.totalActualAttempts > 0 && proof.totalSuccessfulCalculations > 0,
  'Aggregate 5m+15m counts do not reconcile');
  for (const [totalKey, stageKey] of [
    ['serviceTotalCpuUsec', 'serviceCpuUsecDelta'],
    ['serviceTotalThrottledPeriods', 'serviceCpuThrottledPeriodsDelta'],
    ['serviceTotalThrottledUsec', 'serviceCpuThrottledUsecDelta'],
    ['driverTotalCpuUsec', 'driverCpuUsecDelta'],
    ['driverTotalThrottledPeriods', 'driverCpuThrottledPeriodsDelta'],
    ['driverTotalThrottledUsec', 'driverCpuThrottledUsecDelta'],
  ]) expect(isCount(proof[totalKey]) && proof[totalKey] >= sum(proof.phases, stageKey),
    'Aggregate kernel CPU accounting invalid: ' + totalKey);
  for (const prefix of ['service','driver']) {
    const peak = proof[prefix+'PeakMemoryBytes'];
    expect(isCount(peak) && peak > 0 && peak <= CAP &&
      peak >= Math.max(...proof.phases.map(p => p[prefix+'PeakMemoryBytes'])),
    'Aggregate kernel peak memory invalid: ' + prefix);
  }
  return {
    schema: proof.schema, status: proof.status,
    githubMainSha: proof.githubMainSha,
    sourceSha: proof.sourceSha,
    planned: proof.totalPlannedSlots,
    attempted: proof.totalActualAttempts,
    successful: proof.totalSuccessfulCalculations,
    skippedScheduling: sum(proof.phases, 'skippedSchedulingLag'),
    skippedConcurrency: sum(proof.phases, 'skippedInFlightCap'),
    non200: sum(proof.phases, 'non200'),
    transportFailures: sum(proof.phases, 'transportFailures'),
    invalidResponses: sum(proof.phases, 'invalidResponses'),
    serviceCpuUsec: proof.serviceTotalCpuUsec,
    driverCpuUsec: proof.driverTotalCpuUsec,
    serviceThrottling: proof.serviceTotalThrottledPeriods,
    driverThrottling: proof.driverTotalThrottledPeriods,
    servicePeakMemoryBytes: proof.servicePeakMemoryBytes,
    driverPeakMemoryBytes: proof.driverPeakMemoryBytes,
    recovery: true,
    productionReady: false,
  };
}

export function verifySustainedLinuxProofFile(filename, expectedSha256, expectedMainSha) {
  expect(/^[a-f0-9]{64}$/u.test(expectedSha256), 'Expected SHA-256 invalid');
  const bytes = readFileSync(resolve(filename));
  const digest = createHash('sha256').update(bytes).digest('hex');
  expect(digest === expectedSha256, 'Original proof bytes SHA-256 mismatch');
  return { sha256: digest,
    ...validateSustainedLinuxProof(JSON.parse(bytes.toString('utf8')), expectedMainSha) };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args.length !== 3) {
    console.error('Usage: node verify-saju-sustained-linux-proof-phase11.mjs <proof-json> <sha256> <main-sha>');
    process.exitCode = 2;
  } else {
    try {
      console.log(JSON.stringify(verifySustainedLinuxProofFile(...args), null, 2));
    } catch {
      console.error('SAJU_SUSTAINED_PROOF_BLOCKED: independent original evidence verification failed');
      process.exitCode = 1;
    }
  }
}
