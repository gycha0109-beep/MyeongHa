import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PROBE_SCHEMA = 'myeongha-loopback-capacity-probe-v1';
export const SCALING_REVIEW_SCHEMA_V1 = 'myeongha-observed-scaling-review-v1';

function invalid(reason) {
  throw new Error('OBSERVED_SCALING_REVIEW: ' + reason);
}

function integer(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function metric(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function validateProbe(probe) {
  if (!probe || typeof probe !== 'object' || Array.isArray(probe) ||
      probe.schema !== PROBE_SCHEMA ||
      probe.target !== '127.0.0.1-only' ||
      !['/api/health', '/api/readiness'].includes(probe.route) ||
      probe.dataPrivacy !== 'loopback-public-diagnostics-only' ||
      probe.outputContainsIdentifiers !== false ||
      probe.productionCapacityProven !== false ||
      probe.isolatedDbSaturationCeilingProven !== false ||
      probe.sajuCpuMemoryCeilingProven !== false ||
      !integer(probe.requestedConcurrency, 1, 8) ||
      probe.observedPeakConcurrency !== probe.requestedConcurrency ||
      !integer(probe.requestedSamples, 20, 500) ||
      probe.completedSamples !== probe.requestedSamples ||
      !integer(probe.successfulSamples, 0, probe.completedSamples) ||
      !integer(probe.non200Samples, 0, probe.completedSamples) ||
      !integer(probe.transportFailureSamples, 0, probe.completedSamples) ||
      probe.successfulSamples + probe.non200Samples +
        probe.transportFailureSamples !== probe.completedSamples ||
      !metric(probe.observedElapsedMs) || probe.observedElapsedMs === 0 ||
      !metric(probe.observedRequestsPerSecond) ||
      (probe.successfulSamples > 0 && !metric(probe.successfulLatencyP95Ms)) ||
      (probe.successfulSamples === 0 && probe.successfulLatencyP95Ms !== null)) {
    invalid('invalid Phase 11 measured public diagnostic report');
  }
  return probe;
}

export function deriveObservedScalingReviewV1(probes) {
  if (!Array.isArray(probes) || probes.length < 2 || probes.length > 40) {
    invalid('two to forty actual Phase 11 reports required');
  }
  const rows = probes.map(validateProbe);
  const route = rows[0].route;
  if (rows.some(row => row.route !== route)) {
    invalid('all measurements must use the same diagnostic route');
  }

  const levels = new Map();
  for (const probe of rows) {
    const concurrency = probe.requestedConcurrency;
    if (!levels.has(concurrency)) {
      levels.set(concurrency, {
        concurrency,
        runCount: 0,
        completedSamples: 0,
        failedSamples: 0,
        highestObservedSuccessfulP95Ms: null,
      });
    }
    const level = levels.get(concurrency);
    level.runCount++;
    level.completedSamples += probe.completedSamples;
    level.failedSamples += probe.non200Samples + probe.transportFailureSamples;
    if (probe.successfulLatencyP95Ms !== null) {
      level.highestObservedSuccessfulP95Ms = Math.max(
        level.highestObservedSuccessfulP95Ms ?? 0,
        probe.successfulLatencyP95Ms,
      );
    }
  }
  const observations = [...levels.values()].sort((a, b) => a.concurrency - b.concurrency)
    .map(row => Object.freeze({
      ...row,
      observedOutcome: row.failedSamples === 0 ? 'NO_FAILURE_OBSERVED' : 'FAILURE_OBSERVED',
    }));

  if (observations.length < 2) {
    invalid('at least two distinct measured concurrency levels required');
  }

  const degraded = observations.find(row => row.failedSamples > 0);
  const cleanBefore = observations.filter(
    row => row.failedSamples === 0 && (!degraded || row.concurrency < degraded.concurrency),
  );
  const cleanAfterFailure = degraded && observations.some(
    row => row.concurrency > degraded.concurrency && row.failedSamples === 0,
  );

  const status = !degraded
    ? 'NO_DEGRADATION_OBSERVED'
    : cleanAfterFailure
      ? 'NONMONOTONIC_OUTCOMES'
      : cleanBefore.length === 0
        ? 'NO_CLEAN_LOWER_CONCURRENCY'
        : 'OBSERVED_FAILURE_BOUNDARY';
  const candidate = status === 'OBSERVED_FAILURE_BOUNDARY'
    ? degraded.concurrency : null;

  return Object.freeze({
    schema: SCALING_REVIEW_SCHEMA_V1,
    target: '127.0.0.1-only',
    route,
    measurementCount: rows.length,
    observedConcurrencyLevels: observations,
    status,
    highestCleanConcurrencyBeforeFailure: candidate === null
      ? null : cleanBefore[cleanBefore.length - 1].concurrency,
    firstObservedFailureConcurrency: degraded?.concurrency ?? null,
    diagnosticScalingReviewAtOrAboveConcurrency: candidate,
    triggerScope: 'loopback-diagnostic-investigation-only',
    automaticScalingEnabled: false,
    productionCapacityProven: false,
    dbConnectionBudgetProven: false,
    sajuResourceCeilingProven: false,
    numericalProductionScalingThresholdApproved: false,
    outputContainsIdentifiers: false,
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--input') {
      invalid('usage: --input local-phase11-report-array.json');
    }
    const input = JSON.parse(await readFile(process.argv[3], 'utf8'));
    console.log(JSON.stringify(deriveObservedScalingReviewV1(input)));
  } catch (error) {
    console.error(error instanceof Error && error.message.startsWith('OBSERVED_SCALING_REVIEW:')
      ? error.message : 'OBSERVED_SCALING_REVIEW: input could not be analyzed');
    process.exitCode = 1;
  }
}
