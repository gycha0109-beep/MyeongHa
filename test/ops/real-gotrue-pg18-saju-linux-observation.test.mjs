import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('preserves the first actual isolated GoTrue, PostgreSQL18 and Saju observation', () => {
  const bytes = readFileSync('docs/operations/REAL_GOTRUE_PG18_SAJU_LINUX_OBSERVATION_20261105.json');
  expect(bytes.length).toBe(1336);
  expect(createHash('sha256').update(bytes).digest('hex'))
    .toBe('cbb0ae2a1c7f9a3b36cd6a23fa0899c32ede31eb946867cf1fd00eec4c9d30ed');

  const observation = JSON.parse(bytes);
  expect(observation).toMatchObject({
    status: 'OBSERVED_ISOLATED_REAL_CHAIN',
    githubMainSha: '429b82e6eace9963d39bb97bf6d642e9516d4d26',
    sajuSourceSha: '9807ce89c08afc61b587560d515a475efd819032',
    memberCount: 4,
    actualGoTrueJwtVerified: true,
    actualPostgres18Rls: true,
    actualPinnedSajuProductionEngine: true,
    databasePoolMax: 2,
    dbPeak: 2,
    baseline: { requested: 12, successful: 12, unavailable: 0, unexpected: 0 },
    contended: { requested: 32, successful: 18, unavailable: 14, unexpected: 0 },
    authHttpCalls: 44,
    sajuCalculationCalls: 30,
    anonymousDenied: true,
    healthUnaffected: true,
    cloudflareWorkerRuntimeMeasured: false,
    actualSajuResourceCgroupConstrained: false,
    productionCapacityProven: false,
    productionScalingThresholdApproved: false,
    drReady: false,
    serviceResumptionAllowed: false,
    outputContainsIdentifiers: false,
  });
});
