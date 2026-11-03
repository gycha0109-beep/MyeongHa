import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PINNED_SAJU_SHA = '9807ce89c08afc61b587560d515a475efd819032';
export const SPLIT_SCHEMA = 'myeongha-ops-saju-split-cgroup-rate-ladder-phase11-v1';
const CPU_MEMORY_BYTES = 268435456;
const RATES = [10, 25, 50, 100, 200, 400];
const FLAGS = [
  'saturationKneeApproved', 'sajuSaturationCeilingProven',
  'productionSajuCpuMemoryCeilingProven', 'productionCapacityProven',
  'productionScalingThresholdApproved', 'drReady', 'serviceResumptionAllowed',
  'outputContainsIdentifiers',
];
const ROOT_KEYS = [
  'schema', 'status', 'sourceSha', 'actualSajuProductionHostUsed',
  'syntheticInputOnly', 'networkScope', 'separateResourceCgroups',
  'kernelConstraints', 'rates', 'totalPlannedSlots',
  'totalActualAttempts', 'totalSuccessfulCalculations', 'serviceTotalCpuUsec',
  'serviceTotalThrottledPeriods', 'serviceTotalThrottledUsec',
  'driverTotalCpuUsec', 'driverTotalThrottledPeriods', 'driverTotalThrottledUsec',
  'servicePeakMemoryBytes', 'driverPeakMemoryBytes', 'serviceMemoryOomKills',
  'driverMemoryOomKills', 'postPressureRecoverySucceeded',
  'nodeImageDigest', 'githubMainSha', ...FLAGS,
];
const CONSTRAINT_KEYS = [
  'serviceCpuCores', 'driverCpuCores', 'serviceMemoryLimitBytes',
  'driverMemoryLimitBytes', 'serviceSwapLimitBytes', 'driverSwapLimitBytes',
];
const STAGE_KEYS = [
  'targetRps', 'intervalSeconds', 'plannedSlots', 'attempted',
  'successfulCalculations', 'non200', 'transportFailures', 'invalidResponses',
  'skippedSchedulingLag', 'skippedInFlightCap', 'maxInFlightObserved',
  'successfulP50Ms', 'successfulP95Ms', 'successfulP99Ms',
  'achievedSuccessRps', 'observedSchedulingWindowMs', 'observedIncludingDrainMs',
  'serviceCpuUsecDelta', 'serviceCpuThrottledPeriodsDelta', 'serviceCpuThrottledUsecDelta',
  'servicePeakMemoryBytes', 'driverCpuUsecDelta', 'driverCpuThrottledPeriodsDelta',
  'driverCpuThrottledUsecDelta', 'driverPeakMemoryBytes',
];

function assert(condition, message) {
  if (!condition) throw Error('ISOLATED_SAJU_SPLIT_EVIDENCE: ' + message);
}
function exactlyKeys(value, keys, label) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value),
    label + ' is not a record');
  const actual = Object.keys(value).sort();
  assert(actual.length === keys.length &&
    actual.every((key, index) => key === [...keys].sort()[index]),
  label + ' contains an unexpected or missing key');
}
const count = x => Number.isSafeInteger(x) && x >= 0;
const positive = x => typeof x === 'number' && Number.isFinite(x) && x > 0;

function sum(items, key) {
  return items.reduce((total, item) => total + item[key], 0);
}

export function validateSplitLinuxEvidence(proof, expectedMainSha) {
  assert(/^[a-f0-9]{40}$/u.test(expectedMainSha), 'Expected main SHA is invalid');
  exactlyKeys(proof, ROOT_KEYS, 'Root');
  assert(proof.schema === SPLIT_SCHEMA && proof.status === 'OBSERVED_SPLIT_CGROUP_RATE_LADDER',
    'Proof is not a successful split-cgroup observation');
  assert(proof.githubMainSha === expectedMainSha &&
    proof.sourceSha === PINNED_SAJU_SHA, 'Immutable source SHA mismatch');
  assert(/^node@sha256:[a-f0-9]{64}$/u.test(proof.nodeImageDigest),
    'Runtime digest is not pinned');
  assert(proof.actualSajuProductionHostUsed === true && proof.syntheticInputOnly === true &&
    proof.networkScope === 'shared-offline-network-namespace-loopback-only' &&
    proof.separateResourceCgroups === true,
  'Source, synthetic-only workload, or loopback isolation not proven');
  for (const flag of FLAGS) assert(proof[flag] === false, 'Unsafe or missing false flag: ' + flag);
  assert(proof.postPressureRecoverySucceeded === true &&
    proof.serviceMemoryOomKills === 0 && proof.driverMemoryOomKills === 0,
  'Post-pressure recovery or zero OOM not proven');
  exactlyKeys(proof.kernelConstraints, CONSTRAINT_KEYS, 'Kernel constraints');
  const c = proof.kernelConstraints;
  assert(c.serviceCpuCores === 0.5 && c.driverCpuCores === 1 &&
    c.serviceMemoryLimitBytes === CPU_MEMORY_BYTES &&
    c.driverMemoryLimitBytes === CPU_MEMORY_BYTES &&
    c.serviceSwapLimitBytes === 0 && c.driverSwapLimitBytes === 0,
  'Kernel CPU / memory / zero swap mismatch');
  assert(Array.isArray(proof.rates) && proof.rates.length === 6,
    'Six exact rate stages are required');
  for (let i = 0; i < RATES.length; i++) {
    const r = proof.rates[i];
    exactlyKeys(r, STAGE_KEYS, 'Stage ' + i);
    assert(r.targetRps === RATES[i] && r.intervalSeconds === 6 &&
      r.plannedSlots === RATES[i] * 6, 'Target rate or planned slots mismatch');
    for (const key of [
      'attempted', 'successfulCalculations', 'non200', 'transportFailures',
      'invalidResponses', 'skippedSchedulingLag', 'skippedInFlightCap',
      'maxInFlightObserved', 'serviceCpuUsecDelta', 'serviceCpuThrottledPeriodsDelta',
      'serviceCpuThrottledUsecDelta', 'driverCpuUsecDelta',
      'driverCpuThrottledPeriodsDelta', 'driverCpuThrottledUsecDelta',
      'servicePeakMemoryBytes', 'driverPeakMemoryBytes',
    ]) assert(count(r[key]), 'Invalid nonnegative counter ' + key + ' in stage ' + i);
    assert(r.attempted + r.skippedSchedulingLag + r.skippedInFlightCap === r.plannedSlots &&
      r.successfulCalculations + r.non200 + r.transportFailures +
      r.invalidResponses === r.attempted, 'Unaccounted attempted or skipped slots');
    assert(r.maxInFlightObserved <= 16 &&
      (r.attempted === 0 ? r.maxInFlightObserved === 0 : r.maxInFlightObserved >= 1),
    'Observed concurrency outside bounds');
    assert(r.servicePeakMemoryBytes > 0 && r.servicePeakMemoryBytes <= CPU_MEMORY_BYTES &&
      r.driverPeakMemoryBytes > 0 && r.driverPeakMemoryBytes <= CPU_MEMORY_BYTES,
    'Invalid independent cgroup peak memory');
    assert(positive(r.observedSchedulingWindowMs) &&
      r.observedIncludingDrainMs >= r.observedSchedulingWindowMs &&
      positive(r.observedIncludingDrainMs),
    'Invalid stage time window');
    if (r.successfulCalculations === 0) {
      assert(r.successfulP50Ms === null && r.successfulP95Ms === null &&
        r.successfulP99Ms === null && r.achievedSuccessRps === 0,
      'No successful request may have latency or throughput');
    } else {
      assert([r.successfulP50Ms, r.successfulP95Ms, r.successfulP99Ms]
        .every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0) &&
        r.successfulP50Ms <= r.successfulP95Ms &&
        r.successfulP95Ms <= r.successfulP99Ms, 'Inconsistent success latency percentiles');
      const recalculatedRps = r.successfulCalculations / (r.observedSchedulingWindowMs / 1000);
      assert(positive(r.achievedSuccessRps) &&
        Math.abs(recalculatedRps - r.achievedSuccessRps) <= 0.01,
      'Observed successful throughput inconsistent with window');
    }
  }
  assert(proof.totalPlannedSlots === 4710 &&
    proof.totalPlannedSlots === sum(proof.rates, 'plannedSlots') &&
    proof.totalActualAttempts === sum(proof.rates, 'attempted') &&
    proof.totalSuccessfulCalculations === sum(proof.rates, 'successfulCalculations'),
  'Aggregate attempts / successful calculations mismatch');
  for (const pair of [
    ['serviceTotalCpuUsec', 'serviceCpuUsecDelta'],
    ['serviceTotalThrottledPeriods', 'serviceCpuThrottledPeriodsDelta'],
    ['serviceTotalThrottledUsec', 'serviceCpuThrottledUsecDelta'],
    ['driverTotalCpuUsec', 'driverCpuUsecDelta'],
    ['driverTotalThrottledPeriods', 'driverCpuThrottledPeriodsDelta'],
    ['driverTotalThrottledUsec', 'driverCpuThrottledUsecDelta'],
  ]) {
    assert(count(proof[pair[0]]) && proof[pair[0]] >= sum(proof.rates, pair[1]),
      'Aggregate cgroup counter smaller than measured stages: ' + pair[0]);
  }
  for (const prefix of ['service', 'driver']) {
    const peak = proof[prefix + 'PeakMemoryBytes'];
    assert(count(peak) && peak > 0 && peak <= CPU_MEMORY_BYTES &&
      peak >= Math.max(...proof.rates.map(r => r[prefix + 'PeakMemoryBytes'])),
    'Aggregate peak memory invalid: ' + prefix);
  }
  return {
    schema: proof.schema,
    status: proof.status,
    githubMainSha: proof.githubMainSha,
    sourceSha: proof.sourceSha,
    planned: proof.totalPlannedSlots,
    attempted: proof.totalActualAttempts,
    success: proof.totalSuccessfulCalculations,
    skippedScheduling: sum(proof.rates, 'skippedSchedulingLag'),
    skippedAtConcurrencyLimit: sum(proof.rates, 'skippedInFlightCap'),
    httpErrors: sum(proof.rates, 'non200'),
    transportFailures: sum(proof.rates, 'transportFailures'),
    invalidResponses: sum(proof.rates, 'invalidResponses'),
    highestRateSuccessRps: proof.rates.at(-1).achievedSuccessRps,
    highestRateP95Ms: proof.rates.at(-1).successfulP95Ms,
    highestRateP99Ms: proof.rates.at(-1).successfulP99Ms,
    serviceCpuUsec: proof.serviceTotalCpuUsec,
    serviceThrottledPeriods: proof.serviceTotalThrottledPeriods,
    driverCpuUsec: proof.driverTotalCpuUsec,
    driverThrottledPeriods: proof.driverTotalThrottledPeriods,
    servicePeakMemoryBytes: proof.servicePeakMemoryBytes,
    driverPeakMemoryBytes: proof.driverPeakMemoryBytes,
    recovered: true,
    productionReady: false,
  };
}

export function verifyEvidenceFile(inputPath, expectedSha256, expectedMainSha) {
  assert(/^[a-f0-9]{64}$/u.test(expectedSha256), 'Expected SHA-256 is invalid');
  const bytes = readFileSync(resolve(inputPath));
  const actualDigest = createHash('sha256').update(bytes).digest('hex');
  assert(actualDigest === expectedSha256, 'Original JSON SHA-256 mismatch');
  const proof = JSON.parse(bytes.toString('utf8'));
  return { sha256: actualDigest, ...validateSplitLinuxEvidence(proof, expectedMainSha) };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args.length !== 3) {
    console.error('Usage: node verify-saju-split-rate-ladder-proof-phase11.mjs <json> <sha256> <main-sha>');
    process.exitCode = 2;
  } else {
    try {
      console.log(JSON.stringify(verifyEvidenceFile(...args), null, 2));
    } catch {
      console.error('SPLIT_SAJU_PROOF_BLOCKED: original evidence failed independent verification');
      process.exitCode = 1;
    }
  }
}
