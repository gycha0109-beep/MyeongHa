import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { deriveIsolatedProductScalingReview } from '../../scripts/operations/derive-isolated-product-scaling-review.mjs';

const bytes = readFileSync('docs/operations/REAL_GOTRUE_PG18_SAJU_SUSTAINED_LINUX_OBSERVATION_20261105.json');
const mainSha = '9ea61382aad65231d8fbda095a7f5b1da9f515b9';
const sha256 = '10513f4219f80eaf0f7d1b194683be6f00c4a8585505ac0ce6dd3eb53f9da90e';

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
