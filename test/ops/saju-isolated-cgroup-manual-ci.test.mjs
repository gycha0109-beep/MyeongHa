import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { assertIsolatedSajuCgroupEvidence } from '../../scripts/operations/collect-isolated-saju-cgroup-phase11.mjs';

const workflow = readFileSync('.github/workflows/saju-isolated-cgroup-capacity-acceptance.yml', 'utf8');
const wrapper = readFileSync('scripts/operations/run-isolated-saju-cgroup-phase11-ci.sh', 'utf8');

const sample = {
  schema: 'myeongha-local-real-saju-capacity-observation-phase11-v1',
  status: 'OBSERVED',
  sajuSourceSha: '9807ce89c08afc61b587560d515a475efd819032',
  target: 'child-process-127.0.0.1-only',
  usesActualSajuProductionCalculationHost: true,
  syntheticInputOnly: true,
  attempted: 96,
  observedPostPressureRecovery: true,
  observations: [
    { concurrency: 1, attempted: 20, completed: 20, non200: 0, transportFailures: 0, observedServerPeakRssMiB: 80, observedServerCpuMs: 10 },
    { concurrency: 2, attempted: 20, completed: 20, non200: 0, transportFailures: 0, observedServerPeakRssMiB: 82, observedServerCpuMs: 20 },
    { concurrency: 4, attempted: 24, completed: 24, non200: 0, transportFailures: 0, observedServerPeakRssMiB: 84, observedServerCpuMs: 30 },
    { concurrency: 8, attempted: 32, completed: 32, non200: 0, transportFailures: 0, observedServerPeakRssMiB: 86, observedServerCpuMs: 40 },
  ],
  sajuSaturationCeilingProven: false,
  productionSajuCpuMemoryCeilingProven: false,
  productionCapacityProven: false,
  productionScalingThresholdApproved: false,
  drReady: false,
  serviceResumptionAllowed: false,
  outputContainsIdentifiers: false,
};

const kernel = {
  cpuMax: '50000 100000\n',
  cpuStat: 'usage_usec 190000\nnr_periods 30\nnr_throttled 10\nthrottled_usec 100000\n',
  memoryMax: '268435456\n',
  memorySwapMax: '0\n',
  memoryPeak: '165000000\n',
  memoryEvents: 'low 0\nhigh 0\nmax 0\noom 0\noom_kill 0\n',
};

describe('Phase 11 actual isolated Saju cgroup manual proof', () => {
  it('is main-only, public-source pinned, no Production credentials, with enforced kernel caps', () => {
    assert.match(workflow, /workflow_dispatch:/u);
    assert.doesNotMatch(workflow, /pull_request:/u);
    assert.match(workflow, /github\.ref == 'refs\/heads\/main'/u);
    assert.match(workflow, /repository: gycha0109-beep\/Saju/u);
    assert.match(workflow, /ref: 9807ce89c08afc61b587560d515a475efd819032/u);
    assert.match(workflow, /persist-credentials: false/u);
    assert.match(wrapper, /--network none/u);
    assert.match(wrapper, /--cpus=0\.50/u);
    assert.match(wrapper, /--memory=256m --memory-swap=256m/u);
    assert.match(wrapper, /--read-only --tmpfs/u);
    assert.match(wrapper, /--cap-drop=ALL --security-opt=no-new-privileges/u);
    assert.match(wrapper, /--user "\$\(id -u\):\$\(id -g\)"/u);
    assert.match(wrapper, /BLOCKED_INCOMPLETE/u);
    assert.match(wrapper, /outputContainsIdentifiers/u);
    assert.match(wrapper, /SAJU_PRODUCTION_SERVICE_BEARER/u);
    assert.match(wrapper, /realCalculationRequestsAttempted == 96/u);
    assert.doesNotMatch(workflow, /secrets\./u);
  });

  it('accepts only real engine measurements with measured CPU and memory hard limits', () => {
    const report = assertIsolatedSajuCgroupEvidence(sample, kernel);
    assert.equal(report.status, 'OBSERVED_CONSTRAINED');
    assert.equal(report.resourceConstraintEnforced, true);
    assert.equal(report.cpuQuotaCores, 0.5);
    assert.equal(report.memoryLimitBytes, 268435456);
    assert.equal(report.memorySwapLimitBytes, 0);
    assert.equal(report.observedCgroupPeakMemoryBytes, 165000000);
    assert.equal(report.successfulCalculations, 96);
    assert.equal(report.cpuThrottledPeriods, 10);
    assert.equal(report.productionCapacityProven, false);
    assert.equal(report.drReady, false);
    assert.equal(report.outputContainsIdentifiers, false);
  });

  it('fails closed on missing resource limits, OOM, partial measurements or readiness claims', () => {
    assert.throws(() => assertIsolatedSajuCgroupEvidence(sample, { ...kernel, cpuMax: 'max 100000\n' }));
    assert.throws(() => assertIsolatedSajuCgroupEvidence(sample, { ...kernel, memoryMax: 'max\n' }));
    assert.throws(() => assertIsolatedSajuCgroupEvidence(sample, { ...kernel, memorySwapMax: '1048576\n' }));
    assert.throws(() => assertIsolatedSajuCgroupEvidence(sample, { ...kernel, memoryEvents: kernel.memoryEvents.replace('oom_kill 0', 'oom_kill 1') }));
    assert.throws(() => assertIsolatedSajuCgroupEvidence({ ...sample, attempted: 95 }, kernel));
    assert.throws(() => assertIsolatedSajuCgroupEvidence({ ...sample, productionCapacityProven: true }, kernel));
    assert.throws(() => assertIsolatedSajuCgroupEvidence({ ...sample, observations: sample.observations.slice(0, 3) }, kernel));
  });
});
