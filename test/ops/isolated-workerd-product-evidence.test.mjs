import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('preserves the GitHub Linux workerd observation and its acceptance boundaries', () => {
  const bytes = readFileSync('docs/operations/REAL_GOTRUE_PG18_SAJU_WORKERD_LINUX_OBSERVATION_20261106.json');
  expect(bytes.length).toBe(1125);
  expect(createHash('sha256').update(bytes).digest('hex'))
    .toBe('19e80a33d2e0b119b89dff74d04a6d0d7b4281593b521f05995139c83f15135c');

  expect(JSON.parse(bytes)).toMatchObject({
    schema: 'myeongha-ops-workerd-local-product-phase11-v1',
    status: 'OBSERVED_ISOLATED_WORKERD_PRODUCT',
    githubMainSha: '28150e3992991e15b7b508c4c6210848836ad704',
    sajuSourceSha: '9807ce89c08afc61b587560d515a475efd819032',
    wranglerVersion: '4.152.0',
    workerdVersion: '1.20261019.1',
    memberCount: 4,
    baseline: {
      requested: 12, concurrency: 1, successful: 12, unavailable: 0, unexpected: 0,
      p50Ms: 118.339, p95Ms: 134.804, p99Ms: 138.106,
    },
    actualGoTrueJwtVerified: true,
    actualPostgres18Rls: true,
    actualPinnedSajuProductionEngine: true,
    localWorkerdProductPathMeasured: true,
    anonymousDenied: true,
    healthUnaffected: true,
    runtimeCleanupVerified: true,
    dockerCleanupVerified: true,
    productionWorkerAdmissionMeasured: false,
    hostedHyperdriveMeasured: false,
    productionCapacityProven: false,
    productionScalingThresholdApproved: false,
    drReady: false,
    serviceResumptionAllowed: false,
    outputContainsIdentifiers: false,
  });
});
