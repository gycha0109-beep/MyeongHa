import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const EXPECTED_SHA = '9807ce89c08afc61b587560d515a475efd819032';
const EXPECTED_MEMORY_BYTES = 256 * 1024 * 1024;
const EXPECTED_CPU_QUOTA = 50_000;
const EXPECTED_CPU_PERIOD = 100_000;

function requireCondition(value, reason) {
  if (!value) throw Error('ISOLATED_SAJU_CGROUP: ' + reason);
}
function valueFromLines(text, name) {
  const line = text.split(/\r?\n/u).find(item => item.startsWith(name + ' '));
  requireCondition(line !== undefined, 'Missing kernel counter ' + name);
  const value = Number(line.split(/\s+/u)[1]);
  requireCondition(Number.isSafeInteger(value) && value >= 0, 'Invalid kernel counter ' + name);
  return value;
}

export function assertIsolatedSajuCgroupEvidence(measurement, cgroup) {
  requireCondition(measurement?.schema === 'myeongha-local-real-saju-capacity-observation-phase11-v1',
    'Incorrect real Saju measurement schema');
  requireCondition(measurement?.status === 'OBSERVED' && measurement?.sajuSourceSha === EXPECTED_SHA,
    'Missing exact source or real observation');
  requireCondition(measurement?.target === 'child-process-127.0.0.1-only' &&
    measurement?.usesActualSajuProductionCalculationHost === true &&
    measurement?.syntheticInputOnly === true &&
    measurement?.attempted === 96 &&
    measurement?.observedPostPressureRecovery === true &&
    measurement?.observations?.length === 4,
  'Missing measured actual bounded Saju workload');

  const expectedConcurrency = [1, 2, 4, 8];
  const expectedAttempts = [20, 20, 24, 32];
  measurement.observations.forEach((item, i) => {
    requireCondition(item.concurrency === expectedConcurrency[i] &&
      item.attempted === expectedAttempts[i] &&
      item.completed + item.non200 + item.transportFailures === item.attempted &&
      item.observedServerPeakRssMiB > 0 &&
      item.observedServerCpuMs >= 0,
    'Incomplete actual engine observations');
  });

  const [quota, period] = cgroup.cpuMax.trim().split(/\s+/u).map(Number);
  requireCondition(quota === EXPECTED_CPU_QUOTA && period === EXPECTED_CPU_PERIOD,
    'CPU hard cap was not enforced');
  const memoryLimitBytes = Number(cgroup.memoryMax.trim());
  const memoryPeakBytes = Number(cgroup.memoryPeak.trim());
  requireCondition(memoryLimitBytes === EXPECTED_MEMORY_BYTES &&
    Number.isSafeInteger(memoryPeakBytes) && memoryPeakBytes > 0,
  'Memory hard cap was not enforced');
  requireCondition(memoryPeakBytes <= memoryLimitBytes,
    'Memory peak exceeded hard memory limit');

  const cpuThrottledPeriods = valueFromLines(cgroup.cpuStat, 'nr_throttled');
  const cpuThrottledMicroseconds = valueFromLines(cgroup.cpuStat, 'throttled_usec');
  const cpuUsedMicroseconds = valueFromLines(cgroup.cpuStat, 'usage_usec');
  const memoryOomKillEvents = valueFromLines(cgroup.memoryEvents, 'oom_kill');
  requireCondition(memoryOomKillEvents === 0, 'Container exhausted memory');
  for (const key of [
    'sajuSaturationCeilingProven',
    'productionSajuCpuMemoryCeilingProven',
    'productionCapacityProven',
    'productionScalingThresholdApproved',
    'drReady',
    'serviceResumptionAllowed',
    'outputContainsIdentifiers',
  ]) {
    requireCondition(measurement[key] === false, 'Unsafe Production readiness claim ' + key);
  }
  return Object.freeze({
    schema: 'myeongha-ops-real-saju-cgroup-phase11-v1',
    status: 'OBSERVED_CONSTRAINED',
    resourceConstraintEnforced: true,
    target: 'isolated-docker-network-none-loopback-only',
    nodeImageDigest: null,
    sourceSha: EXPECTED_SHA,
    actualSajuProductionHostUsed: true,
    realCalculationRequestsAttempted: 96,
    successfulCalculations: measurement.observations.reduce((sum, item) => sum + item.completed, 0),
    localLoopbackRecovery: true,
    cpuQuotaMicroseconds: quota,
    cpuPeriodMicroseconds: period,
    cpuQuotaCores: quota / period,
    cpuUsageMicroseconds: cpuUsedMicroseconds,
    cpuThrottledPeriods,
    cpuThrottledMicroseconds,
    memoryLimitBytes,
    observedCgroupPeakMemoryBytes: memoryPeakBytes,
    observedMemoryOomKillEvents: memoryOomKillEvents,
    observations: measurement.observations,
    sajuSaturationCeilingProven: false,
    productionSajuCpuMemoryCeilingProven: false,
    productionCapacityProven: false,
    productionScalingThresholdApproved: false,
    drReady: false,
    serviceResumptionAllowed: false,
    outputContainsIdentifiers: false,
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    requireCondition(process.argv.length === 3, 'Expected one local result path');
    const raw = await readFile(process.argv[2], 'utf8');
    const measurement = JSON.parse(raw);
    const cgroup = {
      cpuMax: await readFile('/sys/fs/cgroup/cpu.max', 'utf8'),
      cpuStat: await readFile('/sys/fs/cgroup/cpu.stat', 'utf8'),
      memoryMax: await readFile('/sys/fs/cgroup/memory.max', 'utf8'),
      memoryPeak: await readFile('/sys/fs/cgroup/memory.peak', 'utf8'),
      memoryEvents: await readFile('/sys/fs/cgroup/memory.events', 'utf8'),
    };
    console.log(JSON.stringify(assertIsolatedSajuCgroupEvidence(measurement, cgroup)));
  } catch {
    console.error('ISOLATED_SAJU_CGROUP: constrained observation invalid or incomplete');
    process.exitCode = 1;
  }
}
