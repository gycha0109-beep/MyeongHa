import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';

export const SUSTAINED_PROFILES = Object.freeze([
  Object.freeze({ name: 'single-user-5m', durationSeconds: 300, targetRps: 1, concurrencyLimit: 1 }),
  Object.freeze({ name: 'normal-concurrency-15m', durationSeconds: 900, targetRps: 4, concurrencyLimit: 4 }),
]);
export const SUSTAINED_SCHEMA = 'myeongha-ops-saju-split-cgroup-sustained-phase11-v1';
const CAP = 268435456;
const BEARER = 'isolated-phase11-rate-ladder-synthetic-only';
const BODY = JSON.stringify({
  birth: { calendarType: 'solar', date: '2001-07-14', time: '15:20', sex: 'unspecified' },
});
const ensure = (ok, error) => { if (!ok) throw Error(error); };
const round = n => Math.round(n * 1000) / 1000;
function getCounter(text, key) {
  const line = text.split(/\r?\n/u).find(value => value.startsWith(key + ' '));
  const num = Number(line?.split(/\s+/u)[1]);
  ensure(line && Number.isSafeInteger(num) && num >= 0, 'Invalid cgroup counter');
  return num;
}
async function ownCgroup() {
  const read = async file => (await readFile('/sys/fs/cgroup/' + file, 'utf8')).trim();
  const [cpuMax, memMax, swapMax, cpu, peak, events] = await Promise.all(
    ['cpu.max', 'memory.max', 'memory.swap.max', 'cpu.stat', 'memory.peak', 'memory.events'].map(read));
  const peakBytes = Number(peak);
  ensure(cpuMax === '100000 100000' && memMax === String(CAP) && swapMax === '0' &&
    Number.isSafeInteger(peakBytes) && peakBytes > 0 && peakBytes <= CAP &&
    getCounter(events, 'oom_kill') === 0, 'Driver resource quotas not enforced');
  return {
    cpuCores: 1, memoryLimitBytes: CAP, swapLimitBytes: 0,
    cpuUsageUsec: getCounter(cpu, 'usage_usec'),
    cpuThrottledPeriods: getCounter(cpu, 'nr_throttled'),
    cpuThrottledUsec: getCounter(cpu, 'throttled_usec'),
    memoryPeakBytes: peakBytes, oomKills: 0,
  };
}
async function serviceCgroup() {
  const res = await fetch('http://127.0.0.1:43008/metrics',
    { redirect: 'manual', signal: AbortSignal.timeout(2500) });
  ensure(res.status === 200 && !res.headers.has('location'), 'Server resource metric route unavailable');
  const data = await res.json();
  ensure(data.cpuCores === 0.5 && data.memoryLimitBytes === CAP &&
    data.swapLimitBytes === 0 && data.oomKills === 0 &&
    ['cpuUsageUsec', 'cpuThrottledPeriods', 'cpuThrottledUsec', 'memoryPeakBytes']
      .every(k => Number.isSafeInteger(data[k]) && data[k] >= 0) &&
    data.memoryPeakBytes > 0 && data.memoryPeakBytes <= CAP,
  'Server resource quotas not enforced');
  return data;
}
function delta(after, before, key) {
  const n = after[key] - before[key];
  ensure(Number.isSafeInteger(n) && n >= 0, 'Counter regressed');
  return n;
}
function percentile(values, p) {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y);
  const n = (a.length - 1) * p;
  return round(a[Math.floor(n)] + (a[Math.ceil(n)] - a[Math.floor(n)]) * (n - Math.floor(n)));
}
async function calculate() {
  const started = performance.now();
  try {
    const res = await fetch('http://127.0.0.1:43007/api/calculations', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + BEARER, 'content-type': 'application/json' },
      body: BODY, redirect: 'manual', signal: AbortSignal.timeout(2500),
    });
    const bytes = await res.arrayBuffer();
    const durationMs = performance.now() - started;
    if (res.headers.has('location') || bytes.byteLength > 262144) return { kind: 'invalid', durationMs };
    if (res.status !== 200) return { kind: 'non200', durationMs };
    const obj = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (typeof obj?.responseSchemaVersion !== 'string' ||
      typeof obj?.snapshot?.calculationHash !== 'string' ||
      !obj.snapshot.calculationHash.length) return { kind: 'invalid', durationMs };
    return { kind: 'success', durationMs };
  } catch {
    return { kind: 'transport', durationMs: performance.now() - started };
  }
}
async function stage(profile) {
  const { name, durationSeconds, targetRps, concurrencyLimit } = profile;
  const [beforeServer, beforeDriver] = await Promise.all([serviceCgroup(), ownCgroup()]);
  const plannedSlots = durationSeconds * targetRps;
  const intervalMs = 1000 / targetRps;
  const start = performance.now(), deadline = start + durationSeconds * 1000;
  const pending = new Set(), started = [];
  let skippedSchedulingLag = 0, skippedInFlightCap = 0, maxInFlightObserved = 0;
  for (let slot = 0; slot < plannedSlots; slot++) {
    const scheduled = start + slot * intervalMs;
    const now = performance.now();
    if (now < scheduled) await sleep(scheduled - now);
    const actual = performance.now();
    if (actual >= deadline || actual - scheduled > intervalMs) {
      skippedSchedulingLag++;
      continue;
    }
    if (pending.size >= concurrencyLimit) {
      skippedInFlightCap++;
      continue;
    }
    const task = calculate();
    pending.add(task);
    started.push(task);
    maxInFlightObserved = Math.max(maxInFlightObserved, pending.size);
    void task.then(() => pending.delete(task));
  }
  const now = performance.now();
  if (now < deadline) await sleep(deadline - now);
  const schedulingMs = performance.now() - start;
  const completed = await Promise.all(started);
  const elapsedMs = performance.now() - start;
  const [afterServer, afterDriver] = await Promise.all([serviceCgroup(), ownCgroup()]);
  ensure(completed.length + skippedSchedulingLag + skippedInFlightCap === plannedSlots,
    'Sustained slot accounting violated');
  const successes = completed.filter(x => x.kind === 'success');
  const count = kind => completed.filter(x => x.kind === kind).length;
  return {
    profile: name, durationSeconds, targetRps, concurrencyLimit,
    plannedSlots, attempted: completed.length, successfulCalculations: successes.length,
    non200: count('non200'), transportFailures: count('transport'),
    invalidResponses: count('invalid'), skippedSchedulingLag, skippedInFlightCap,
    maxInFlightObserved,
    successfulP50Ms: percentile(successes.map(x => x.durationMs), 0.5),
    successfulP95Ms: percentile(successes.map(x => x.durationMs), 0.95),
    successfulP99Ms: percentile(successes.map(x => x.durationMs), 0.99),
    achievedSuccessRps: round(successes.length / (schedulingMs / 1000)),
    observedSchedulingWindowMs: round(schedulingMs),
    observedIncludingDrainMs: round(elapsedMs),
    serviceCpuUsecDelta: delta(afterServer, beforeServer, 'cpuUsageUsec'),
    serviceCpuThrottledPeriodsDelta: delta(afterServer, beforeServer, 'cpuThrottledPeriods'),
    serviceCpuThrottledUsecDelta: delta(afterServer, beforeServer, 'cpuThrottledUsec'),
    servicePeakMemoryBytes: afterServer.memoryPeakBytes,
    driverCpuUsecDelta: delta(afterDriver, beforeDriver, 'cpuUsageUsec'),
    driverCpuThrottledPeriodsDelta: delta(afterDriver, beforeDriver, 'cpuThrottledPeriods'),
    driverCpuThrottledUsecDelta: delta(afterDriver, beforeDriver, 'cpuThrottledUsec'),
    driverPeakMemoryBytes: afterDriver.memoryPeakBytes,
  };
}
async function main() {
  const [beforeServer, beforeDriver] = await Promise.all([serviceCgroup(), ownCgroup()]);
  ensure((await calculate()).kind === 'success', 'Actual warm-up failed');
  const phases = [];
  for (const profile of SUSTAINED_PROFILES) {
    phases.push(await stage(profile));
    if (profile !== SUSTAINED_PROFILES.at(-1)) await sleep(300);
  }
  const recovered = (await calculate()).kind === 'success';
  ensure(recovered, 'Actual Saju failed post-sustained recovery');
  const [afterServer, afterDriver] = await Promise.all([serviceCgroup(), ownCgroup()]);
  const report = {
    schema: SUSTAINED_SCHEMA,
    status: 'OBSERVED_SUSTAINED_REAL_SAJU',
    sourceSha: '9807ce89c08afc61b587560d515a475efd819032',
    actualSajuProductionHostUsed: true, syntheticInputOnly: true,
    networkScope: 'shared-offline-network-namespace-loopback-only',
    separateResourceCgroups: true,
    kernelConstraints: {
      serviceCpuCores: beforeServer.cpuCores, driverCpuCores: beforeDriver.cpuCores,
      serviceMemoryLimitBytes: beforeServer.memoryLimitBytes,
      driverMemoryLimitBytes: beforeDriver.memoryLimitBytes,
      serviceSwapLimitBytes: beforeServer.swapLimitBytes,
      driverSwapLimitBytes: beforeDriver.swapLimitBytes,
    },
    phases, totalPlannedSlots: phases.reduce((sum, p) => sum + p.plannedSlots, 0),
    totalActualAttempts: phases.reduce((sum, p) => sum + p.attempted, 0),
    totalSuccessfulCalculations: phases.reduce((sum, p) => sum + p.successfulCalculations, 0),
    serviceTotalCpuUsec: delta(afterServer, beforeServer, 'cpuUsageUsec'),
    serviceTotalThrottledPeriods: delta(afterServer, beforeServer, 'cpuThrottledPeriods'),
    serviceTotalThrottledUsec: delta(afterServer, beforeServer, 'cpuThrottledUsec'),
    driverTotalCpuUsec: delta(afterDriver, beforeDriver, 'cpuUsageUsec'),
    driverTotalThrottledPeriods: delta(afterDriver, beforeDriver, 'cpuThrottledPeriods'),
    driverTotalThrottledUsec: delta(afterDriver, beforeDriver, 'cpuThrottledUsec'),
    servicePeakMemoryBytes: afterServer.memoryPeakBytes,
    driverPeakMemoryBytes: afterDriver.memoryPeakBytes,
    serviceMemoryOomKills: afterServer.oomKills, driverMemoryOomKills: afterDriver.oomKills,
    postPressureRecoverySucceeded: recovered,
    saturationKneeApproved: false, sajuSaturationCeilingProven: false,
    productionSajuCpuMemoryCeilingProven: false, productionCapacityProven: false,
    productionScalingThresholdApproved: false, drReady: false,
    serviceResumptionAllowed: false, outputContainsIdentifiers: false,
  };
  ensure(report.totalPlannedSlots === 3900 && report.totalActualAttempts > 0 &&
    report.phases.every(x => x.attempted + x.skippedSchedulingLag +
      x.skippedInFlightCap === x.plannedSlots),
  'Sustained aggregate was incomplete');
  console.log(JSON.stringify(report));
}
if (process.argv.length !== 2) {
  console.error('ISOLATED_SAJU_SUSTAINED_ARGUMENTS_INVALID');
  process.exitCode = 1;
} else {
  await main().catch(() => {
    console.error('ISOLATED_SAJU_SUSTAINED_INCOMPLETE: no Production capacity claim');
    process.exitCode = 1;
  });
}
