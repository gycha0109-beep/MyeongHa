import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const saneTime = (value) => Number.isFinite(value) && value >= 0;
const saneCount = (value) => Number.isSafeInteger(value) && value >= 0;
const safeKeys = (object, keys) => assert.deepEqual(Object.keys(object).sort(), keys.trim().split(/\s+/u).sort());
function quantiles(p) {
  assert([p.p50Ms, p.p95Ms, p.p99Ms].every(saneTime));
  assert(p.p50Ms <= p.p95Ms && p.p95Ms <= p.p99Ms);
}
function batch(p, requested, concurrency) {
  safeKeys(p, 'requested concurrency successful unavailable unexpected p50Ms p95Ms p99Ms');
  assert.equal(p.requested, requested);
  assert.equal(p.concurrency, concurrency);
  assert([p.successful, p.unavailable].every(saneCount));
  assert(p.successful > 0);
  assert.equal(p.unexpected, 0);
  assert.equal(p.successful + p.unavailable, requested);
  quantiles(p);
}
function window(p, durationSeconds, requestsPerSecond, concurrency) {
  safeKeys(p, `durationSeconds requestsPerSecond concurrency scheduled skipped peak elapsedMs
    successful unavailable transportFailures p50Ms p95Ms p99Ms dbAcquireFailures dbAcquireP95Ms
    dbQueryP95Ms authHeadersP95Ms sajuP95Ms saju`);
  assert.equal(p.durationSeconds, durationSeconds);
  assert.equal(p.requestsPerSecond, requestsPerSecond);
  assert.equal(p.concurrency, concurrency);
  assert.equal(p.scheduled, durationSeconds * requestsPerSecond);
  assert([p.successful, p.unavailable, p.transportFailures, p.skipped, p.peak, p.dbAcquireFailures].every(saneCount));
  assert.equal(p.successful + p.unavailable + p.transportFailures + p.skipped, p.scheduled);
  assert(p.successful > 0 && p.peak > 0 && p.peak <= concurrency);
  assert(p.dbAcquireFailures <= p.scheduled - p.skipped);
  assert(saneTime(p.elapsedMs) && p.elapsedMs >= durationSeconds * 1000 && p.elapsedMs <= durationSeconds * 1000 + 60000);
  quantiles(p);
  assert([p.dbAcquireP95Ms, p.dbQueryP95Ms, p.authHeadersP95Ms, p.sajuP95Ms].every(saneTime));
  safeKeys(p.saju, 'cpuCores cpuUsageUsec cpuThrottledPeriods memoryLimitBytes memoryPeakBytes oomKills');
  assert.equal(p.saju.cpuCores, 0.5);
  assert.equal(p.saju.memoryLimitBytes, 268435456);
  assert.equal(p.saju.oomKills, 0);
  assert([p.saju.memoryPeakBytes, p.saju.cpuUsageUsec, p.saju.cpuThrottledPeriods].every(saneCount));
  assert(p.saju.memoryPeakBytes > 0 && p.saju.memoryPeakBytes <= p.saju.memoryLimitBytes);
}
export function deriveIsolatedProductScalingReview(bytes, sourceSha, expectedSha256) {
  assert(Buffer.isBuffer(bytes));
  assert(/^[a-f0-9]{40}$/u.test(sourceSha));
  assert(/^[a-f0-9]{64}$/u.test(expectedSha256));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha256, expectedSha256);
  const p = JSON.parse(bytes);
  safeKeys(p, `schema status scope memberCount actualGoTrueJwtVerified realGoTrueHttp actualPostgres18Rls
    actualPinnedSajuProductionEngine sajuSourceSha cloudflareWorkerRuntimeMeasured databasePoolMax dbPeak
    baseline contended dbAcquireP95Ms dbQueryP95Ms authHttpCalls sajuCalculationCalls anonymousDenied
    healthUnaffected runtimeCleanupVerified actualSajuResourceCgroupConstrained sustained
    productionCapacityProven productionScalingThresholdApproved drReady serviceResumptionAllowed
    outputContainsIdentifiers githubMainSha dockerCleanupVerified`);
  assert.equal(p.schema, 'myeongha-ops-real-gotrue-pg18-saju-product-phase11-v1');
  assert.equal(p.status, 'OBSERVED_ISOLATED_REAL_CHAIN');
  assert.equal(p.scope, 'disposable-main-only-local-gotrue-postgres18-and-pinned-saju');
  assert.equal(p.githubMainSha, sourceSha);
  assert.equal(p.sajuSourceSha, '9807ce89c08afc61b587560d515a475efd819032');
  assert.equal(p.memberCount, 4);
  assert.equal(p.databasePoolMax, 2);
  assert([1, 2].includes(p.dbPeak));
  for (const key of [
    'actualGoTrueJwtVerified', 'realGoTrueHttp', 'actualPostgres18Rls', 'actualPinnedSajuProductionEngine',
    'anonymousDenied', 'healthUnaffected', 'runtimeCleanupVerified', 'actualSajuResourceCgroupConstrained',
    'dockerCleanupVerified',
  ]) assert.equal(p[key], true);
  for (const key of [
    'cloudflareWorkerRuntimeMeasured', 'productionCapacityProven', 'productionScalingThresholdApproved',
    'drReady', 'serviceResumptionAllowed', 'outputContainsIdentifiers',
  ]) assert.equal(p[key], false);
  assert([p.dbAcquireP95Ms, p.dbQueryP95Ms].every(saneTime));
  assert([p.authHttpCalls, p.sajuCalculationCalls].every(saneCount));
  safeKeys(p.sustained, 'ramp windows injectedDbUnavailable recoverySucceeded');
  assert.equal(p.sustained.injectedDbUnavailable, 1);
  assert.equal(p.sustained.recoverySucceeded, true);
  assert.equal(p.sustained.ramp.length, 2);
  assert.equal(p.sustained.windows.length, 2);
  batch(p.baseline, 12, 1);
  assert.equal(p.baseline.successful, 12);
  batch(p.sustained.ramp[0], 24, 2);
  batch(p.sustained.ramp[1], 24, 4);
  batch(p.contended, 32, 8);
  window(p.sustained.windows[0], 300, 1, 1);
  window(p.sustained.windows[1], 900, 4, 4);
  const shortProbes = [p.baseline, ...p.sustained.ramp, p.contended];
  const firstFailure = shortProbes.findIndex(probe => probe.unavailable > 0);
  const consistentBoundary = firstFailure > 0 &&
    shortProbes.slice(firstFailure).every(probe => probe.unavailable > 0);
  const poolBudgetReached = p.dbPeak === p.databasePoolMax;
  return {
    schema: 'myeongha-isolated-product-scaling-review-v1',
    evidenceSha256: sha256, sourceSha,
    scope: 'disposable-product-chain-review-only',
    shortProbes,
    firstObservedShortFailureConcurrency: shortProbes[firstFailure]?.concurrency ?? null,
    highestCleanShortConcurrencyBeforeFailure: consistentBoundary ? shortProbes[firstFailure - 1].concurrency : null,
    dbPoolBudgetReached: poolBudgetReached,
    reviewDbPoolHeadroom: consistentBoundary && poolBudgetReached,
    sustainedWindows: p.sustained.windows,
    highestObservedSustainedConcurrency: Math.max(...p.sustained.windows.map(window => window.peak)),
    sajuCpuThrottlingObserved: p.sustained.windows.some(window => window.saju.cpuThrottledPeriods > 0),
    productionCapacityProven: false,
    productionScalingThresholdApproved: false,
    automaticScalingEnabled: false,
    outputContainsIdentifiers: false,
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [proofFile, sourceSha, sha256] = process.argv.slice(2);
    assert.equal(process.argv.length, 5);
    console.log(JSON.stringify(deriveIsolatedProductScalingReview(readFileSync(proofFile), sourceSha, sha256)));
  } catch {
    console.error('ISOLATED_PRODUCT_SCALING_REVIEW: expected a verified <proof.json> <main-sha> <raw-json-sha256>');
    process.exitCode = 1;
  }
}
