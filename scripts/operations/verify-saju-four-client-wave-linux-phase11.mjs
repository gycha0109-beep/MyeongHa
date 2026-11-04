import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SCHEMA = 'myeongha-ops-saju-split-cgroup-four-client-waves-phase11-v1';
const SOURCE = '9807ce89c08afc61b587560d515a475efd819032';
const CAP = 268435456;
const FALSE_FIELDS = [
  'saturationKneeApproved', 'sajuSaturationCeilingProven',
  'productionSajuCpuMemoryCeilingProven', 'productionCapacityProven',
  'productionScalingThresholdApproved', 'drReady', 'serviceResumptionAllowed',
  'outputContainsIdentifiers',
];
const ROOT_FIELDS = [
  'schema','status','sourceSha','actualSajuProductionHostUsed',
  'syntheticInputOnly','networkScope','separateResourceCgroups',
  'clientWaveSize','kernelConstraints','phases','totalPlannedSlots',
  'totalActualAttempts','totalSuccessfulCalculations',
  'serviceTotalCpuUsec','serviceTotalThrottledPeriods','serviceTotalThrottledUsec',
  'driverTotalCpuUsec','driverTotalThrottledPeriods','driverTotalThrottledUsec',
  'servicePeakMemoryBytes','driverPeakMemoryBytes','serviceMemoryOomKills',
  'driverMemoryOomKills','postPressureRecoverySucceeded',
  'nodeImageDigest','githubMainSha',...FALSE_FIELDS,
];
const STAGE_FIELDS = [
  'profile','durationSeconds','targetRps','concurrencyLimit','clientWaveSize',
  'plannedSlots','attempted','successfulCalculations','non200','transportFailures',
  'invalidResponses','skippedSchedulingLag','skippedInFlightCap','maxInFlightObserved',
  'successfulP50Ms','successfulP95Ms','successfulP99Ms','achievedSuccessRps',
  'observedSchedulingWindowMs','observedIncludingDrainMs',
  'serviceCpuUsecDelta','serviceCpuThrottledPeriodsDelta','serviceCpuThrottledUsecDelta',
  'servicePeakMemoryBytes','driverCpuUsecDelta','driverCpuThrottledPeriodsDelta',
  'driverCpuThrottledUsecDelta','driverPeakMemoryBytes',
];
const C = [
  'serviceCpuCores','driverCpuCores','serviceMemoryLimitBytes','driverMemoryLimitBytes',
  'serviceSwapLimitBytes','driverSwapLimitBytes',
];
function requireProof(ok, reason) {
  if (!ok) throw Error('SAJU_FOUR_WAVE_PROOF_INVALID: ' + reason);
}
const counter = x => Number.isSafeInteger(x) && x >= 0;
const finite = x => typeof x === 'number' && Number.isFinite(x);
function exactKeys(obj, keys, label) {
  requireProof(obj && typeof obj === 'object' && !Array.isArray(obj), label + ' must be a record');
  const actual = Object.keys(obj).sort(), required = [...keys].sort();
  requireProof(actual.length === required.length && actual.every((x,i) => x === required[i]),
    'Unknown or missing ' + label + ' fields');
}
export function validateFourClientWaveLinuxProof(p, expectedMainSha) {
  requireProof(/^[a-f0-9]{40}$/u.test(expectedMainSha), 'Expected main SHA invalid');
  exactKeys(p,ROOT_FIELDS,'root');
  requireProof(p.schema === SCHEMA && p.status === 'OBSERVED_FOUR_CLIENT_WAVES' &&
    p.sourceSha === SOURCE && p.githubMainSha === expectedMainSha &&
    /^node@sha256:[a-f0-9]{64}$/u.test(p.nodeImageDigest),
  'Pinned Saju/main/runtime or proof status not valid');
  requireProof(p.actualSajuProductionHostUsed === true && p.syntheticInputOnly === true &&
    p.networkScope === 'shared-offline-network-namespace-loopback-only' &&
    p.separateResourceCgroups === true && p.clientWaveSize === 4,
  'Offline actual-engine/split client wave scope not established');
  for (const flag of FALSE_FIELDS) requireProof(p[flag] === false,
    'Production/PII claim not allowed: ' + flag);
  requireProof(p.postPressureRecoverySucceeded === true &&
    p.serviceMemoryOomKills === 0 && p.driverMemoryOomKills === 0,
  'Real post-pressure recovery or OOM absence missing');
  exactKeys(p.kernelConstraints,C,'constraints');
  const k = p.kernelConstraints;
  requireProof(k.serviceCpuCores === 0.5 && k.driverCpuCores === 1 &&
    k.serviceMemoryLimitBytes === CAP && k.driverMemoryLimitBytes === CAP &&
    k.serviceSwapLimitBytes === 0 && k.driverSwapLimitBytes === 0,
  'Actual kernel resource quotas missing');
  requireProof(Array.isArray(p.phases) && p.phases.length === 1, 'Only one 15m wave expected');
  const s = p.phases[0];
  exactKeys(s,STAGE_FIELDS,'stage');
  requireProof(s.profile === 'four-client-waves-15m' && s.durationSeconds === 900 &&
    s.targetRps === 4 && s.concurrencyLimit === 4 && s.clientWaveSize === 4 &&
    s.plannedSlots === 3600 && s.maxInFlightObserved === 4,
  'Actual 4 outstanding client HTTP operations or fixed 15m profile not proven');
  for (const key of [
    'attempted','successfulCalculations','non200','transportFailures','invalidResponses',
    'skippedSchedulingLag','skippedInFlightCap','serviceCpuUsecDelta',
    'serviceCpuThrottledPeriodsDelta','serviceCpuThrottledUsecDelta',
    'servicePeakMemoryBytes','driverCpuUsecDelta','driverCpuThrottledPeriodsDelta',
    'driverCpuThrottledUsecDelta','driverPeakMemoryBytes',
  ]) requireProof(counter(s[key]),'Stage counter invalid: ' + key);
  requireProof(s.attempted + s.skippedSchedulingLag + s.skippedInFlightCap === s.plannedSlots &&
    s.successfulCalculations + s.non200 + s.transportFailures +
      s.invalidResponses === s.attempted,
  'Attempted, skipped and response totals do not reconcile');
  requireProof(s.servicePeakMemoryBytes > 0 && s.servicePeakMemoryBytes <= CAP &&
    s.driverPeakMemoryBytes > 0 && s.driverPeakMemoryBytes <= CAP,
  'Memory cgroup peak out of bound');
  requireProof(finite(s.observedSchedulingWindowMs) &&
    s.observedSchedulingWindowMs >= 899000 &&
    finite(s.observedIncludingDrainMs) &&
    s.observedIncludingDrainMs >= s.observedSchedulingWindowMs &&
    s.observedIncludingDrainMs <= 960000,
  'Actual 15m monotonic measurement window missing');
  if (s.successfulCalculations > 0) {
    requireProof([s.successfulP50Ms,s.successfulP95Ms,s.successfulP99Ms]
      .every(x => finite(x) && x >= 0) &&
      s.successfulP50Ms <= s.successfulP95Ms &&
      s.successfulP95Ms <= s.successfulP99Ms &&
      finite(s.achievedSuccessRps) && s.achievedSuccessRps > 0 &&
      Math.abs(s.achievedSuccessRps -
        s.successfulCalculations / (s.observedSchedulingWindowMs / 1000)) < 0.01,
    'Successful response latency or throughput invalid');
  } else {
    requireProof(s.successfulP50Ms === null && s.successfulP95Ms === null &&
      s.successfulP99Ms === null && s.achievedSuccessRps === 0,
    'Missing successful response must have no percentile');
  }
  requireProof(p.totalPlannedSlots === 3600 &&
    p.totalActualAttempts === s.attempted &&
    p.totalSuccessfulCalculations === s.successfulCalculations,
  'Aggregate wave request totals invalid');
  for (const [overall,stage] of [
    ['serviceTotalCpuUsec','serviceCpuUsecDelta'],
    ['serviceTotalThrottledPeriods','serviceCpuThrottledPeriodsDelta'],
    ['serviceTotalThrottledUsec','serviceCpuThrottledUsecDelta'],
    ['driverTotalCpuUsec','driverCpuUsecDelta'],
    ['driverTotalThrottledPeriods','driverCpuThrottledPeriodsDelta'],
    ['driverTotalThrottledUsec','driverCpuThrottledUsecDelta'],
  ]) requireProof(counter(p[overall]) && p[overall] >= s[stage],
    'Kernel aggregate invalid: ' + overall);
  for (const x of ['service','driver']) {
    requireProof(counter(p[x+'PeakMemoryBytes']) &&
      p[x+'PeakMemoryBytes'] >= s[x+'PeakMemoryBytes'] &&
      p[x+'PeakMemoryBytes'] <= CAP, 'Peak memory not bounded: ' + x);
  }
  return {
    schema:p.schema,status:p.status,githubMainSha:p.githubMainSha,sourceSha:p.sourceSha,
    planned:p.totalPlannedSlots,attempted:p.totalActualAttempts,
    success:p.totalSuccessfulCalculations,clientWaveSize:4,
    observedMaxInFlight:s.maxInFlightObserved,
    skippedScheduling:s.skippedSchedulingLag,skippedConcurrency:s.skippedInFlightCap,
    non200:s.non200,transportFailures:s.transportFailures,invalidResponses:s.invalidResponses,
    successfulP95Ms:s.successfulP95Ms,successfulP99Ms:s.successfulP99Ms,
    successRateRps:s.achievedSuccessRps,serviceCpuUsec:p.serviceTotalCpuUsec,
    driverCpuUsec:p.driverTotalCpuUsec,serviceThrottling:p.serviceTotalThrottledPeriods,
    driverThrottling:p.driverTotalThrottledPeriods,servicePeakMemoryBytes:p.servicePeakMemoryBytes,
    driverPeakMemoryBytes:p.driverPeakMemoryBytes,recovery:true,productionReady:false,
  };
}
export function verifyFourClientWaveFile(filepath,sha256,mainSha) {
  requireProof(/^[a-f0-9]{64}$/u.test(sha256),'Expected SHA256 invalid');
  const bytes=readFileSync(resolve(filepath));
  const actual=createHash('sha256').update(bytes).digest('hex');
  requireProof(actual === sha256,'Raw Linux JSON SHA256 mismatch');
  return { sha256:actual, ...validateFourClientWaveLinuxProof(JSON.parse(bytes.toString('utf8')),mainSha) };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 5) {
    console.error('Usage: node verify-saju-four-client-wave-linux-phase11.mjs <json> <sha256> <github-main-sha>');
    process.exitCode=2;
  } else {
    try { console.log(JSON.stringify(verifyFourClientWaveFile(...process.argv.slice(2)),null,2)); }
    catch { console.error('FOUR_CLIENT_WAVE_PROOF_BLOCKED: actual Linux proof invalid'); process.exitCode=1; }
  }
}
