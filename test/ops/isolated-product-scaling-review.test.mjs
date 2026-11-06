import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { deriveIsolatedProductScalingReview } from '../../scripts/operations/derive-isolated-product-scaling-review.mjs';

const bytes = readFileSync('docs/operations/REAL_GOTRUE_PG18_SAJU_SUSTAINED_LINUX_OBSERVATION_20261105.json');
const mainSha = '9ea61382aad65231d8fbda095a7f5b1da9f515b9';
const sha256 = '10513f4219f80eaf0f7d1b194683be6f00c4a8585505ac0ce6dd3eb53f9da90e';
const overlapBytes = readFileSync('docs/operations/REAL_GOTRUE_PG18_SAJU_OVERLAP_LINUX_OBSERVATION_20261105.json');
const overlapMain = 'd08636181b0957721b5a318898510f4045264b96';
const overlapSha256 = 'c8691b44ab15ac67874a3526778bbf0593ab21b603e425dd00b7adec29db8941';
const cpuBytes = readFileSync('docs/operations/REAL_GOTRUE_PG18_SAJU_CPU_COMPARISON_LINUX_OBSERVATION_20261106.json');
const cpuMain = '4bcad41cda3287c75cbe741f2a2331145514d0d0';
const cpuSha256 = '646c94a4bb4fb51113b4e8f809c161e4a42f659ab33ae7d5b43037b6283aa3cb';

it('derives only a pool-headroom review from the original Linux product-chain observation', () => {
  expect(bytes.length).toBe(3503);
  const result = deriveIsolatedProductScalingReview(bytes, mainSha, sha256);
  expect(result).toMatchObject({
    firstObservedShortFailureConcurrency: 8,
    highestCleanShortConcurrencyBeforeFailure: 4,
    reviewDbPoolHeadroom: true,
    highestObservedSustainedConcurrency: 1,
    sajuCpuThrottlingObserved: false,
    productionCapacityProven: false,
    productionScalingThresholdApproved: false,
    automaticScalingEnabled: false,
  });
  expect(result.sustainedWindows.map(window => window.successful)).toEqual([300, 3600]);
});

it('rejects mismatched digests, sources, incomplete accounting and promotion flags', () => {
  expect(() => deriveIsolatedProductScalingReview(bytes, mainSha, '0'.repeat(64))).toThrow();
  expect(() => deriveIsolatedProductScalingReview(bytes, '0'.repeat(40), sha256)).toThrow();
  for (const change of [
    report => { report.sustained.windows[1].successful--; },
    report => { report.productionScalingThresholdApproved = true; },
    report => { report.dockerCleanupVerified = false; },
  ]) {
    const report = JSON.parse(bytes);
    change(report);
    const changed = Buffer.from(JSON.stringify(report));
    const changedSha = createHash('sha256').update(changed).digest('hex');
    expect(() => deriveIsolatedProductScalingReview(changed, mainSha, changedSha)).toThrow();
  }
});

it('verifies actual gateway overlap separately from short DB acquisition failures', () => {
  expect(overlapBytes.length).toBe(2897);
  const result = deriveIsolatedProductScalingReview(overlapBytes, overlapMain, overlapSha256);
  expect(result).toMatchObject({
    highestObservedSustainedConcurrency: 4, highestObservedGatewayConcurrency: 4,
    gatewayFourWayAdmissions: 900, shortDbAcquireFailures: [0, 0, 0, 16],
    reviewDbPoolHeadroom: true, productionScalingThresholdApproved: false,
    sustainedWindows: [{ successful: 3600, unavailable: 0, skipped: 0, dbAcquireFailures: 0 }],
  });
});

it('rejects an overlap claim when gateway evidence or short failure accounting disagrees', () => {
  for (const change of [
    report => { report.sustained.windows[0].apiPeak = 1; },
    report => { report.sustained.windows[0].apiFourWayAdmissions = 901; },
    report => { report.sustained.shortDbAcquireFailures[3] = 17; },
  ]) {
    const report = JSON.parse(overlapBytes);
    change(report);
    const changed = Buffer.from(JSON.stringify(report));
    const changedSha = createHash('sha256').update(changed).digest('hex');
    expect(() => deriveIsolatedProductScalingReview(changed, overlapMain, changedSha)).toThrow();
  }
});

it('recommends a bounded Saju CPU review from the verified paired Linux observation', () => {
  const result = deriveIsolatedProductScalingReview(cpuBytes, cpuMain, cpuSha256);
  expect(result).toMatchObject({
    cpuComparison: { reference: { sajuP95Ms: 2.939 }, pressure: { sajuP95Ms: 582.129 } },
    dbAcquisitionFailuresObserved: false, sajuCpuThrottlingObserved: true, reviewSajuCpuHeadroom: true,
    productionCapacityProven: false, productionScalingThresholdApproved: false, automaticScalingEnabled: false,
  });
  expect(result).not.toHaveProperty('reviewDbPoolHeadroom');
});

it('withholds the CPU review signal when the paired pressure window also has DB acquisition failures', () => {
  const record = JSON.parse(cpuBytes);
  record.cpuComparison.pressure.dbAcquireFailures = 1;
  const changed = Buffer.from(JSON.stringify(record));
  const changedSha = createHash('sha256').update(changed).digest('hex');
  const result = deriveIsolatedProductScalingReview(changed, cpuMain, changedSha);
  expect(result).toMatchObject({ dbAcquisitionFailuresObserved: true, reviewSajuCpuHeadroom: false });

  record.cpuComparison.pressure.saju.cpuCores = 0.5;
  const wrongQuota = Buffer.from(JSON.stringify(record));
  const wrongQuotaSha = createHash('sha256').update(wrongQuota).digest('hex');
  expect(() => deriveIsolatedProductScalingReview(wrongQuota, cpuMain, wrongQuotaSha)).toThrow();
});
