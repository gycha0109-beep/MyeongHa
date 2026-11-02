import { describe, expect, it } from 'vitest';
import {
  deriveObservedScalingReviewV1,
  SCALING_REVIEW_SCHEMA_V1,
} from '../scripts/derive-observed-scaling-review.mjs';

function report(concurrency, failures = 0, overrides = {}) {
  return {
    schema: 'myeongha-loopback-capacity-probe-v1',
    target: '127.0.0.1-only',
    route: '/api/health',
    requestedSamples: 100,
    completedSamples: 100,
    requestedConcurrency: concurrency,
    observedPeakConcurrency: concurrency,
    successfulSamples: 100 - failures,
    non200Samples: failures,
    transportFailureSamples: 0,
    observedElapsedMs: 200,
    observedRequestsPerSecond: 500,
    successfulLatencyP95Ms: failures === 100 ? null : 42 + concurrency,
    isolatedDbSaturationCeilingProven: false,
    sajuCpuMemoryCeilingProven: false,
    productionCapacityProven: false,
    dataPrivacy: 'loopback-public-diagnostics-only',
    outputContainsIdentifiers: false,
    ...overrides,
  };
}

describe('Phase 12 scaling-review trigger derived from observed Phase 11 diagnostics', () => {
  it('uses the first actual failed level, not a fabricated latency or RPS threshold', () => {
    const result = deriveObservedScalingReviewV1([
      report(4, 8), report(1), report(2), report(8, 22),
    ]);
    expect(result).toMatchObject({
      schema: SCALING_REVIEW_SCHEMA_V1,
      target: '127.0.0.1-only',
      measurementCount: 4,
      status: 'OBSERVED_FAILURE_BOUNDARY',
      highestCleanConcurrencyBeforeFailure: 2,
      firstObservedFailureConcurrency: 4,
      diagnosticScalingReviewAtOrAboveConcurrency: 4,
      triggerScope: 'loopback-diagnostic-investigation-only',
      automaticScalingEnabled: false,
      numericalProductionScalingThresholdApproved: false,
      productionCapacityProven: false,
      dbConnectionBudgetProven: false,
      sajuResourceCeilingProven: false,
      outputContainsIdentifiers: false,
    });
    expect(result.observedConcurrencyLevels.map(x => x.concurrency)).toEqual([1, 2, 4, 8]);
    expect(JSON.stringify(result)).not.toContain('500');
  });

  it('never claims a scaling trigger when no failure was observed', () => {
    const result = deriveObservedScalingReviewV1([report(1), report(2), report(4)]);
    expect(result.status).toBe('NO_DEGRADATION_OBSERVED');
    expect(result.firstObservedFailureConcurrency).toBeNull();
    expect(result.diagnosticScalingReviewAtOrAboveConcurrency).toBeNull();
  });

  it('does not invent a safe lower level if every measured level failed', () => {
    const result = deriveObservedScalingReviewV1([report(1, 2), report(2, 5)]);
    expect(result.status).toBe('NO_CLEAN_LOWER_CONCURRENCY');
    expect(result.firstObservedFailureConcurrency).toBe(1);
    expect(result.diagnosticScalingReviewAtOrAboveConcurrency).toBeNull();
  });

  it('exposes nonmonotonic outcomes rather than inventing a single ceiling', () => {
    const result = deriveObservedScalingReviewV1([
      report(1), report(2, 1), report(4),
    ]);
    expect(result.status).toBe('NONMONOTONIC_OUTCOMES');
    expect(result.diagnosticScalingReviewAtOrAboveConcurrency).toBeNull();
  });

  it('conservatively aggregates repeated reports at the same concurrency', () => {
    const result = deriveObservedScalingReviewV1([
      report(1), report(2), report(2, 1), report(4, 2),
    ]);
    expect(result.status).toBe('OBSERVED_FAILURE_BOUNDARY');
    expect(result.firstObservedFailureConcurrency).toBe(2);
    expect(result.highestCleanConcurrencyBeforeFailure).toBe(1);
    expect(result.observedConcurrencyLevels[1]).toMatchObject({
      concurrency: 2,
      runCount: 2,
      completedSamples: 200,
      failedSamples: 1,
      observedOutcome: 'FAILURE_OBSERVED',
    });
  });

  it('rejects inconsistent or unsafe reports and insufficient distinct evidence', () => {
    expect(() => deriveObservedScalingReviewV1([report(1)]))
      .toThrow('two to forty actual Phase 11 reports');
    expect(() => deriveObservedScalingReviewV1([report(1), report(1)]))
      .toThrow('two distinct measured concurrency');
    for (const patch of [
      { target: 'production' },
      { outputContainsIdentifiers: true },
      { productionCapacityProven: true },
      { observedPeakConcurrency: 1 },
      { completedSamples: 99 },
      { successfulSamples: 101 },
      { successfulLatencyP95Ms: -1 },
    ]) {
      expect(() => deriveObservedScalingReviewV1([report(1), report(2, 0, patch)]))
        .toThrow('invalid Phase 11 measured public diagnostic report');
    }
    expect(() => deriveObservedScalingReviewV1([
      report(1), report(2, 0, { route: '/api/readiness' }),
    ])).toThrow('same diagnostic route');
  });
});
