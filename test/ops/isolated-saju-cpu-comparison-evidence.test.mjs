import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('preserves the Linux Saju CPU comparison without widening its scope', () => {
  const bytes = readFileSync('docs/operations/REAL_GOTRUE_PG18_SAJU_CPU_COMPARISON_LINUX_OBSERVATION_20261106.json');
  expect(bytes.length).toBe(3147);
  expect(createHash('sha256').update(bytes).digest('hex'))
    .toBe('646c94a4bb4fb51113b4e8f809c161e4a42f659ab33ae7d5b43037b6283aa3cb');

  const proof = JSON.parse(bytes);
  expect(proof).toMatchObject({
    githubMainSha: '4bcad41cda3287c75cbe741f2a2331145514d0d0',
    runtimeCleanupVerified: true, dockerCleanupVerified: true,
    cloudflareWorkerRuntimeMeasured: false, productionCapacityProven: false,
    productionScalingThresholdApproved: false, drReady: false,
    cpuComparison: {
      reference: { scheduled: 240, successful: 240, skipped: 0, dbAcquireFailures: 0,
        saju: { cpuCores: 0.5, cpuThrottledPeriods: 0, oomKills: 0 } },
      pressure: { scheduled: 240, successful: 219, unavailable: 1, skipped: 20, dbAcquireFailures: 0,
        saju: { cpuCores: 0.01, cpuThrottledPeriods: 364, oomKills: 0 } },
      recoverySucceeded: true,
    },
  });
  expect(proof.cpuComparison.imageId).toMatch(/^sha256:[a-f0-9]{64}$/u);
});
