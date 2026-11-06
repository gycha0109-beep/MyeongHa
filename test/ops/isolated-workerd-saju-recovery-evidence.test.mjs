import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('preserves the exact GitHub Linux workerd Saju outage/recovery proof without elevating production gates', () => {
  const bytes = readFileSync('docs/operations/REAL_GOTRUE_PG18_SAJU_WORKERD_RECOVERY_LINUX_OBSERVATION_20261106.json');
  expect(bytes.length).toBe(1414);
  expect(createHash('sha256').update(bytes).digest('hex'))
    .toBe('25742bd0be04281f7004ccacf419ca26310f808d2fcfff6abf6331a76fd54a49');
  expect(JSON.parse(bytes)).toMatchObject({
    schema: 'myeongha-ops-workerd-local-product-phase11-v1',
    status: 'OBSERVED_ISOLATED_WORKERD_PRODUCT',
    githubMainSha: 'af41b57575536ba39e5b4ff138dcca80252d30fc',
    sajuSourceSha: '9807ce89c08afc61b587560d515a475efd819032',
    wranglerVersion: '4.152.0',
    workerdVersion: '1.20261019.1',
    memberCount: 4,
    baseline: {
      requested: 12, concurrency: 1, successful: 12, unavailable: 0, unexpected: 0,
      p50Ms: 127.809, p95Ms: 141.546, p99Ms: 153.991,
    },
    sajuOutage: {
      calculationStatus: 503,
      healthStatus: 200,
      recovery: {
        requested: 4, concurrency: 4, successful: 4, unavailable: 0, unexpected: 0,
        p50Ms: 171.709, p95Ms: 176.095, p99Ms: 176.259,
      },
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
