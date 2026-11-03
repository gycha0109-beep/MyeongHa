import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';

const RATES = [10, 25, 50, 100, 200, 400];
const SECONDS = 6;
const MAX_IN_FLIGHT = 16;
const CAP = 268435456;
const BEARER = 'isolated-phase11-rate-ladder-synthetic-only';
const BODY = JSON.stringify({
  birth: { calendarType: 'solar', date: '2001-07-14', time: '15:20', sex: 'unspecified' },
});
const requireValid = (condition, message) => { if (!condition) throw Error(message); };
const round = value => Math.round(value * 1000) / 1000;
function counter(stats, key) {
  const line = stats.split(/\r?\n/u).find(entry => entry.startsWith(key + ' '));
  const value = Number(line?.split(/\s+/u)[1]);
  requireValid(line && Number.isSafeInteger(value) && value >= 0, 'Invalid cgroup counter');
  return value;
}
async function clientMetrics() {
  const read = async name => (await readFile('/sys/fs/cgroup/' + name, 'utf8')).trim();
  const [cpuMax, memMax, swapMax, cpu, peak, events] = await Promise.all([
    'cpu.max', 'memory.max', 'memory.swap.max', 'cpu.stat', 'memory.peak', 'memory.events',
  ].map(read));
  const maxMemory = Number(peak);
  requireValid(cpuMax === '100000 100000' &&
    memMax === String(CAP) && swapMax === '0' &&
    Number.isSafeInteger(maxMemory) && maxMemory > 0 && maxMemory <= CAP &&
    counter(events, 'oom_kill') === 0, 'Client cgroup constraints not enforced');
  return {
    cpuCores: 1, memoryLimitBytes: CAP, swapLimitBytes: 0,
    cpuUsageUsec: counter(cpu, 'usage_usec'),
    cpuThrottledPeriods: counter(cpu, 'nr_throttled'),
    cpuThrottledUsec: counter(cpu, 'throttled_usec'),
    memoryPeakBytes: maxMemory, oomKills: 0,
  };
}
async function serverMetrics() {
  const response = await fetch('http://127.0.0.1:43008/metrics', {
    signal: AbortSignal.timeout(2000), redirect: 'manual',
  });
  requireValid(response.status === 200 && !response.headers.has('location'),
    'Server cgroup measurement unavailable');
  const data = await response.json();
  requireValid(data.cpuCores === 0.5 && data.memoryLimitBytes === CAP &&
    data.swapLimitBytes === 0 && data.oomKills === 0 &&
    Number.isSafeInteger(data.memoryPeakBytes) && data.memoryPeakBytes > 0 &&
    data.memoryPeakBytes <= CAP &&
    ['cpuUsageUsec', 'cpuThrottledPeriods', 'cpuThrottledUsec'].every(key =>
      Number.isSafeInteger(data[key]) && data[key] >= 0),
  'Server cgroup measurement invalid');
  return data;
}
const percentile = (values, quantile) => {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const i = (v.length - 1) * quantile;
  return round(v[Math.floor(i)] + (v[Math.ceil(i)] - v[Math.floor(i)]) * (i - Math.floor(i)));
};
const delta = (after, before, key) => {
  const n = after[key] - before[key];
  requireValid(Number.isSafeInteger(n) && n >= 0, 'Non-monotonic kernel counter');
  return n;
};
async function calculation() {
  const started = performance.now();
  try {
    const res = await fetch('http://127.0.0.1:43007/api/calculations', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + BEARER, 'content-type': 'application/json' },
      body: BODY, redirect: 'manual', signal: AbortSignal.timeout(2500),
    });
    const bytes = await res.arrayBuffer();
    const latency = performance.now() - started;
    if (bytes.byteLength > 262144 || res.headers.has('location')) return { kind: 'invalid', latency };
    if (res.status !== 200) return { kind: 'non200', latency };
    const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (typeof data?.responseSchemaVersion !== 'string' ||
        typeof data?.snapshot?.calculationHash !== 'string' ||
        data.snapshot.calculationHash.length === 0) return { kind: 'invalid', latency };
    return { kind: 'success', latency };
  } catch {
    return { kind: 'transport', latency: performance.now() - started };
  }
}
async function measure(rate) {
  const [serviceBefore, driverBefore] = await Promise.all([serverMetrics(), clientMetrics()]);
  const intervalMs = 1000 / rate;
  const planned = rate * SECONDS;
  const start = performance.now();
  let skippedSchedulingLag = 0, skippedInFlightCap = 0, peakInFlight = 0;
  const pending = new Set(), attempts = [];
  for (let slot = 0; slot < planned; slot++) {
    const scheduled = start + slot * intervalMs;
    const now = performance.now();
    if (now < scheduled) await sleep(scheduled - now);
    if (performance.now() - scheduled >= intervalMs * 1.5) {
      skippedSchedulingLag++;
      continue;
    }
    if (pending.size >= MAX_IN_FLIGHT) {
      skippedInFlightCap++;
      continue;
    }
    const promise = calculation();
    pending.add(promise);
    attempts.push(promise);
    peakInFlight = Math.max(peakInFlight, pending.size);
    void promise.then(() => pending.delete(promise));
  }
  const schedulingMs = performance.now() - start;
  const completed = await Promise.all(attempts);
  const elapsedMs = performance.now() - start;
  const [serviceAfter, driverAfter] = await Promise.all([serverMetrics(), clientMetrics()]);
  requireValid(completed.length + skippedSchedulingLag + skippedInFlightCap === planned,
    'Request accounting incomplete');
  const successes = completed.filter(result => result.kind === 'success');
  const count = kind => completed.filter(result => result.kind === kind).length;
  return {
    targetRps: rate, intervalSeconds: SECONDS, plannedSlots: planned,
    attempted: completed.length, successfulCalculations: successes.length,
    non200: count('non200'), transportFailures: count('transport'),
    invalidResponses: count('invalid'), skippedSchedulingLag, skippedInFlightCap,
    maxInFlightObserved: peakInFlight,
    successfulP50Ms: percentile(successes.map(entry => entry.latency), 0.5),
    successfulP95Ms: percentile(successes.map(entry => entry.latency), 0.95),
    successfulP99Ms: percentile(successes.map(entry => entry.latency), 0.99),
    achievedSuccessRps: round(successes.length / (schedulingMs / 1000)),
    observedSchedulingWindowMs: round(schedulingMs),
    observedIncludingDrainMs: round(elapsedMs),
    serviceCpuUsecDelta: delta(serviceAfter, serviceBefore, 'cpuUsageUsec'),
    serviceCpuThrottledPeriodsDelta: delta(serviceAfter, serviceBefore, 'cpuThrottledPeriods'),
    serviceCpuThrottledUsecDelta: delta(serviceAfter, serviceBefore, 'cpuThrottledUsec'),
    servicePeakMemoryBytes: serviceAfter.memoryPeakBytes,
    driverCpuUsecDelta: delta(driverAfter, driverBefore, 'cpuUsageUsec'),
    driverCpuThrottledPeriodsDelta: delta(driverAfter, driverBefore, 'cpuThrottledPeriods'),
    driverCpuThrottledUsecDelta: delta(driverAfter, driverBefore, 'cpuThrottledUsec'),
    driverPeakMemoryBytes: driverAfter.memoryPeakBytes,
  };
}
async function main() {
  const [initialService, initialDriver] = await Promise.all([serverMetrics(), clientMetrics()]);
  requireValid((await calculation()).kind === 'success', 'Real calculation warmup failed');
  const rates = [];
  for (const r of RATES) {
    rates.push(await measure(r));
    await sleep(300);
  }
  const recovery = (await calculation()).kind === 'success';
  requireValid(recovery, 'Real calculation recovery failed');
  const [finalService, finalDriver] = await Promise.all([serverMetrics(), clientMetrics()]);
  const report = {
    schema: 'myeongha-ops-saju-split-cgroup-rate-ladder-phase11-v1',
    status: 'OBSERVED_SPLIT_CGROUP_RATE_LADDER',
    sourceSha: '9807ce89c08afc61b587560d515a475efd819032',
    actualSajuProductionHostUsed: true, syntheticInputOnly: true,
    networkScope: 'shared-offline-network-namespace-loopback-only',
    separateResourceCgroups: true,
    kernelConstraints: {
      serviceCpuCores: initialService.cpuCores, driverCpuCores: initialDriver.cpuCores,
      serviceMemoryLimitBytes: initialService.memoryLimitBytes,
      driverMemoryLimitBytes: initialDriver.memoryLimitBytes,
      serviceSwapLimitBytes: initialService.swapLimitBytes,
      driverSwapLimitBytes: initialDriver.swapLimitBytes,
    },
    rates,
    totalPlannedSlots: rates.reduce((s, x) => s + x.plannedSlots, 0),
    totalActualAttempts: rates.reduce((s, x) => s + x.attempted, 0),
    totalSuccessfulCalculations: rates.reduce((s, x) => s + x.successfulCalculations, 0),
    serviceTotalCpuUsec: delta(finalService, initialService, 'cpuUsageUsec'),
    serviceTotalThrottledPeriods: delta(finalService, initialService, 'cpuThrottledPeriods'),
    serviceTotalThrottledUsec: delta(finalService, initialService, 'cpuThrottledUsec'),
    driverTotalCpuUsec: delta(finalDriver, initialDriver, 'cpuUsageUsec'),
    driverTotalThrottledPeriods: delta(finalDriver, initialDriver, 'cpuThrottledPeriods'),
    driverTotalThrottledUsec: delta(finalDriver, initialDriver, 'cpuThrottledUsec'),
    servicePeakMemoryBytes: finalService.memoryPeakBytes,
    driverPeakMemoryBytes: finalDriver.memoryPeakBytes,
    serviceMemoryOomKills: finalService.oomKills, driverMemoryOomKills: finalDriver.oomKills,
    postPressureRecoverySucceeded: recovery,
    saturationKneeApproved: false, sajuSaturationCeilingProven: false,
    productionSajuCpuMemoryCeilingProven: false, productionCapacityProven: false,
    productionScalingThresholdApproved: false, drReady: false,
    serviceResumptionAllowed: false, outputContainsIdentifiers: false,
  };
  requireValid(report.totalPlannedSlots === 4710 &&
    report.totalSuccessfulCalculations <= report.totalActualAttempts &&
    report.rates.every(r => r.attempted + r.skippedSchedulingLag + r.skippedInFlightCap === r.plannedSlots),
  'Aggregate slots invalid');
  console.log(JSON.stringify(report));
}
main().catch(() => {
  console.error('ISOLATED_SAJU_SPLIT_DRIVER_INCOMPLETE');
  process.exitCode = 1;
});
