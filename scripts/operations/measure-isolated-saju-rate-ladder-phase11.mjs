import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const SAJU_SHA = '9807ce89c08afc61b587560d515a475efd819032';
const SYNTHETIC_BEARER = 'isolated-phase11-rate-ladder-synthetic-only';
const BIRTH = JSON.stringify({
  birth: { calendarType: 'solar', date: '2001-07-14', time: '15:20', sex: 'unspecified' },
});
const RATES = Object.freeze([10, 25, 50, 100, 200, 400]);
const SECONDS_PER_RATE = 6;
const MAX_IN_FLIGHT = 16;
const REQUEST_DEADLINE_MS = 2500;
const MAX_RESPONSE_BYTES = 256 * 1024;
const CAP_BYTES = 256 * 1024 * 1024;

function requireEvidence(condition, message) {
  if (!condition) throw Error('ISOLATED_SAJU_RATE_LADDER: ' + message);
}
const round = value => Math.round(value * 1000) / 1000;

export function percentile(numbers, fraction) {
  if (!numbers.length) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lo = Math.floor(position);
  const hi = Math.ceil(position);
  return round(sorted[lo] + (sorted[hi] - sorted[lo]) * (position - lo));
}
export function parseStat(stat, key) {
  const match = stat.split(/\r?\n/u).find(line => line.startsWith(key + ' '));
  requireEvidence(Boolean(match), 'Missing required kernel counter');
  const number = Number(match.split(/\s+/u)[1]);
  requireEvidence(Number.isSafeInteger(number) && number >= 0, 'Malformed kernel counter');
  return number;
}
export function assertKernelConstraints(cpuMax, memoryMax, swapMax) {
  const pieces = cpuMax.trim().split(/\s+/u);
  requireEvidence(pieces.length === 2 && pieces[0] === '50000' && pieces[1] === '100000',
    'Kernel CPU quota does not enforce 0.5 CPU');
  requireEvidence(memoryMax.trim() === String(CAP_BYTES),
    'Kernel memory limit does not enforce 256 MiB');
  requireEvidence(swapMax.trim() === '0', 'Kernel swap must be disabled');
  return Object.freeze({
    cpuQuotaMicroseconds: 50_000,
    cpuPeriodMicroseconds: 100_000,
    cpuQuotaCores: 0.5,
    memoryLimitBytes: CAP_BYTES,
    memorySwapLimitBytes: 0,
  });
}
async function cgroup() {
  const root = '/sys/fs/cgroup';
  const [cpuMax, memoryMax, swapMax, cpuStat, memoryPeak, memoryEvents] = await Promise.all([
    'cpu.max', 'memory.max', 'memory.swap.max',
    'cpu.stat', 'memory.peak', 'memory.events',
  ].map(file => readFile(join(root, file), 'utf8')));
  const caps = assertKernelConstraints(cpuMax, memoryMax, swapMax);
  const peakBytes = Number(memoryPeak.trim());
  requireEvidence(Number.isSafeInteger(peakBytes) && peakBytes > 0 && peakBytes <= CAP_BYTES,
    'Kernel memory peak invalid or exceeded cap');
  const oomKills = parseStat(memoryEvents, 'oom_kill');
  requireEvidence(oomKills === 0, 'Kernel observed a memory kill');
  return {
    ...caps,
    cpuUsageMicroseconds: parseStat(cpuStat, 'usage_usec'),
    cpuThrottledPeriods: parseStat(cpuStat, 'nr_throttled'),
    cpuThrottledMicroseconds: parseStat(cpuStat, 'throttled_usec'),
    cgroupPeakMemoryBytes: peakBytes,
    memoryOomKills: oomKills,
  };
}
async function request(port) {
  const started = performance.now();
  try {
    const res = await fetch('http://127.0.0.1:' + port + '/api/calculations', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + SYNTHETIC_BEARER,
        'content-type': 'application/json',
      },
      body: BIRTH,
      signal: AbortSignal.timeout(REQUEST_DEADLINE_MS),
      redirect: 'manual',
    });
    const data = await res.arrayBuffer();
    const latencyMs = performance.now() - started;
    if (data.byteLength > MAX_RESPONSE_BYTES || res.headers.has('location')) {
      return { kind: 'invalid', latencyMs };
    }
    if (res.status !== 200) return { kind: 'non200', latencyMs };
    const response = JSON.parse(new TextDecoder().decode(data));
    if (typeof response?.responseSchemaVersion !== 'string' ||
      typeof response?.snapshot?.calculationHash !== 'string' ||
      response.snapshot.calculationHash.length === 0) {
      return { kind: 'invalid', latencyMs };
    }
    return { kind: 'success', latencyMs };
  } catch {
    return { kind: 'transport', latencyMs: performance.now() - started };
  }
}
function delta(current, earlier, key) {
  const value = current[key] - earlier[key];
  requireEvidence(Number.isSafeInteger(value) && value >= 0, 'Non-monotonic kernel counter');
  return value;
}

async function measureRate(port, targetRps) {
  const before = await cgroup();
  const expectedSlots = targetRps * SECONDS_PER_RATE;
  const intervalMs = 1000 / targetRps;
  const start = performance.now();
  const pending = new Set();
  const all = [];
  let skippedSchedulingLag = 0;
  let skippedInFlightCap = 0;
  let maxInFlightObserved = 0;

  for (let slot = 0; slot < expectedSlots; slot++) {
    const scheduledAt = start + slot * intervalMs;
    const now = performance.now();
    if (now < scheduledAt) await sleep(scheduledAt - now);
    if (performance.now() - scheduledAt >= intervalMs * 1.5) {
      skippedSchedulingLag++;
      continue;
    }
    if (pending.size >= MAX_IN_FLIGHT) {
      skippedInFlightCap++;
      continue;
    }
    const task = request(port);
    pending.add(task);
    maxInFlightObserved = Math.max(maxInFlightObserved, pending.size);
    all.push(task);
    void task.then(() => { pending.delete(task); });
  }
  const scheduledWindowMs = performance.now() - start;
  const completed = await Promise.all(all);
  const drainElapsedMs = performance.now() - start;
  const after = await cgroup();
  requireEvidence(completed.length + skippedInFlightCap + skippedSchedulingLag === expectedSlots,
    'Open-loop synthetic slot accounting was incomplete');

  const success = completed.filter(entry => entry.kind === 'success');
  const attempted = completed.length;
  return {
    targetRps,
    intervalSeconds: SECONDS_PER_RATE,
    plannedSlots: expectedSlots,
    attempted,
    successfulCalculations: success.length,
    non200: completed.filter(entry => entry.kind === 'non200').length,
    transportFailures: completed.filter(entry => entry.kind === 'transport').length,
    invalidResponses: completed.filter(entry => entry.kind === 'invalid').length,
    skippedInFlightCap,
    skippedSchedulingLag,
    maxInFlightObserved,
    successfulP50Ms: percentile(success.map(entry => entry.latencyMs), 0.5),
    successfulP95Ms: percentile(success.map(entry => entry.latencyMs), 0.95),
    successfulP99Ms: percentile(success.map(entry => entry.latencyMs), 0.99),
    achievedSuccessRps: round(success.length / (scheduledWindowMs / 1000)),
    observedSchedulingWindowMs: round(scheduledWindowMs),
    observedIncludingDrainMs: round(drainElapsedMs),
    cgroupCpuUsageMicrosecondsDelta: delta(after, before, 'cpuUsageMicroseconds'),
    cgroupCpuThrottledPeriodsDelta: delta(after, before, 'cpuThrottledPeriods'),
    cgroupCpuThrottledMicrosecondsDelta: delta(after, before, 'cpuThrottledMicroseconds'),
    cgroupPeakMemoryBytes: after.cgroupPeakMemoryBytes,
  };
}

export function validateLadderReport(report) {
  requireEvidence(report?.schema === 'myeongha-ops-saju-real-engine-cgroup-rate-ladder-phase11-v1' &&
    report?.status === 'OBSERVED_RATE_LADDER' &&
    report?.sourceSha === SAJU_SHA &&
    report?.actualSajuProductionHostUsed === true &&
    report?.syntheticInputOnly === true &&
    report?.networkScope === 'container-loopback-only' &&
    report?.driverSharesServiceCgroup === true &&
    report?.kernelConstraints?.cpuQuotaCores === 0.5 &&
    report?.kernelConstraints?.memoryLimitBytes === CAP_BYTES &&
    report?.kernelConstraints?.memorySwapLimitBytes === 0 &&
    report?.postPressureRecoverySucceeded === true &&
    report?.rates?.length === RATES.length,
  'Incomplete source, actual engine, workload or kernel evidence');
  for (let index = 0; index < RATES.length; index++) {
    const stage = report.rates[index];
    requireEvidence(stage.targetRps === RATES[index] &&
      stage.intervalSeconds === SECONDS_PER_RATE &&
      stage.plannedSlots === RATES[index] * SECONDS_PER_RATE &&
      stage.attempted + stage.skippedInFlightCap + stage.skippedSchedulingLag === stage.plannedSlots &&
      stage.successfulCalculations + stage.non200 + stage.transportFailures +
        stage.invalidResponses === stage.attempted &&
      stage.maxInFlightObserved <= MAX_IN_FLIGHT &&
      stage.cgroupCpuUsageMicrosecondsDelta >= 0 &&
      stage.cgroupCpuThrottledPeriodsDelta >= 0 &&
      stage.cgroupPeakMemoryBytes > 0 && stage.cgroupPeakMemoryBytes <= CAP_BYTES,
    'Synthetic rate stage lost accounting or exceeded the declared limits');
  }
  requireEvidence(report.totalPlannedSlots === RATES.reduce((n, rate) => n + rate * SECONDS_PER_RATE, 0) &&
    report.totalActualAttempts === report.rates.reduce((n, item) => n + item.attempted, 0) &&
    report.totalSuccessfulCalculations === report.rates.reduce((n, item) => n + item.successfulCalculations, 0) &&
    Number.isSafeInteger(report.totalCpuThrottledPeriods) && report.totalCpuThrottledPeriods >= 0 &&
    report.kernelCgroupPeakMemoryBytes > 0 && report.kernelCgroupPeakMemoryBytes <= CAP_BYTES &&
    report.memoryOomKills === 0 && report.saturationKneeApproved === false,
  'Aggregate kernel, workload or non-readiness evidence mismatch');
  for (const key of [
    'sajuSaturationCeilingProven', 'productionSajuCpuMemoryCeilingProven',
    'productionCapacityProven', 'productionScalingThresholdApproved',
    'drReady', 'serviceResumptionAllowed', 'outputContainsIdentifiers',
  ]) {
    requireEvidence(report[key] === false, 'Unsafe production-readiness claim');
  }
  return report;
}

async function main(argv) {
  requireEvidence(argv.length === 2 && argv[0] === '--saju-repo' &&
    resolve(argv[1]) === '/saju', 'Only the pinned /saju source mount is accepted');
  const repo = '/saju';
  const pkg = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'));
  requireEvidence(pkg.name === 'myeonghwa-saju-engine', 'Wrong Saju package identity');
  const sha = (await execFile('git', ['-C', repo, 'rev-parse', 'HEAD'],
    { timeout: 5000 })).stdout.trim();
  requireEvidence(sha === SAJU_SHA, 'Unexpected public Saju source revision');
  const dirty = (await execFile('git', ['-C', repo, 'status', '--porcelain'],
    { timeout: 5000 })).stdout.trim();
  requireEvidence(dirty.length === 0, 'Saju source mount was modified');

  const initial = await cgroup();
  const hostModule = await import(pathToFileURL(join(repo, 'dist', 'production-calculation-host.js')).href);
  requireEvidence(typeof hostModule.createMyeonghwaProductionCalculationHostServer === 'function',
    'Real Saju production calculation host missing');
  const server = hostModule.createMyeonghwaProductionCalculationHostServer({
    serviceBearer: SYNTHETIC_BEARER,
  });
  try {
    await new Promise((resolveListening, rejectListening) => {
      server.once('error', rejectListening);
      server.listen(0, '127.0.0.1', resolveListening);
    });
    const addr = server.address();
    requireEvidence(addr && typeof addr !== 'string' && addr.address === '127.0.0.1',
      'Actual Saju HTTP server is not loopback-only');
    requireEvidence((await request(addr.port)).kind === 'success',
      'Actual engine synthetic warmup failed');

    const rates = [];
    for (const rate of RATES) {
      rates.push(await measureRate(addr.port, rate));
      await sleep(300);
    }
    const recovery = await request(addr.port);
    requireEvidence(recovery.kind === 'success', 'Real Saju failed post-pressure recovery');
    const after = await cgroup();
    const report = {
      schema: 'myeongha-ops-saju-real-engine-cgroup-rate-ladder-phase11-v1',
      status: 'OBSERVED_RATE_LADDER',
      sourceSha: SAJU_SHA,
      actualSajuProductionHostUsed: true,
      syntheticInputOnly: true,
      networkScope: 'container-loopback-only',
      driverSharesServiceCgroup: true,
      kernelConstraints: {
        cpuQuotaMicroseconds: initial.cpuQuotaMicroseconds,
        cpuPeriodMicroseconds: initial.cpuPeriodMicroseconds,
        cpuQuotaCores: initial.cpuQuotaCores,
        memoryLimitBytes: initial.memoryLimitBytes,
        memorySwapLimitBytes: initial.memorySwapLimitBytes,
      },
      totalActualAttempts: rates.reduce((total, item) => total + item.attempted, 0),
      totalSuccessfulCalculations: rates.reduce((total, item) => total + item.successfulCalculations, 0),
      totalPlannedSlots: rates.reduce((total, item) => total + item.plannedSlots, 0),
      totalCpuThrottledPeriods: delta(after, initial, 'cpuThrottledPeriods'),
      totalCpuThrottledMicroseconds: delta(after, initial, 'cpuThrottledMicroseconds'),
      kernelCgroupPeakMemoryBytes: after.cgroupPeakMemoryBytes,
      memoryOomKills: after.memoryOomKills,
      postPressureRecoverySucceeded: true,
      rates,
      saturationKneeApproved: false,
      sajuSaturationCeilingProven: false,
      productionSajuCpuMemoryCeilingProven: false,
      productionCapacityProven: false,
      productionScalingThresholdApproved: false,
      drReady: false,
      serviceResumptionAllowed: false,
      outputContainsIdentifiers: false,
    };
    console.log(JSON.stringify(validateLadderReport(report)));
  } finally {
    server.closeAllConnections();
    await new Promise(resolveClose => server.close(() => resolveClose()));
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main(process.argv.slice(2)).catch(() => {
    console.error('ISOLATED_SAJU_RATE_LADDER: actual constrained observation incomplete; no readiness claim');
    process.exitCode = 1;
  });
}
