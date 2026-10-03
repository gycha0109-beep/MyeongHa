import { describe, expect, it } from 'vitest';
import {
  SAJU_ABUSE_BASELINE_REPORT_SCHEMA_V1,
  SAJU_ABUSE_SYNTHETIC_EXCLUSIONS_SCHEMA_V1,
  analyzeSajuAbuseBaseline,
  parseSajuAbuseObservationText,
} from '../scripts/analyze-saju-abuse-baseline.mjs';

const CLIENT_A = 'a'.repeat(64);
const CLIENT_B = 'b'.repeat(64);

function admission(input = {}) {
  return {
    schemaVersion: 'myeongha-saju-abuse-observation-v1',
    mode: 'observe_only',
    routeId: 'api.me.saju.calculation',
    subjectKind: 'member',
    clientKeyVersion: 'myeongha-saju-abuse-client-hmac-sha256-v1',
    clientKey: CLIENT_A,
    requestId: 'req-1',
    occurredAt: '2026-10-03T00:00:00.000Z',
    ...input,
  };
}

function outcome(input = {}) {
  return {
    schemaVersion: 'myeongha-saju-abuse-outcome-v1',
    mode: 'observe_only',
    routeId: 'api.me.saju.calculation',
    requestId: 'req-1',
    httpStatus: 200,
    completedAt: '2026-10-03T00:00:01.000Z',
    ...input,
  };
}

describe('Saju abuse baseline analyzer', () => {
  it('correlates authenticated admissions with outcomes and leaves policy undecided', () => {
    const report = analyzeSajuAbuseBaseline({
      events: [
        admission(),
        outcome(),
        admission({
          clientKey: CLIENT_B,
          subjectKind: 'guest',
          requestId: 'req-2',
          occurredAt: '2026-10-03T00:01:00.000Z',
        }),
        outcome({
          requestId: 'req-2',
          httpStatus: 503,
          completedAt: '2026-10-03T00:01:01.000Z',
        }),
        outcome({
          requestId: 'unauthenticated-request',
          httpStatus: 401,
          completedAt: '2026-10-03T00:02:00.000Z',
        }),
      ],
      retentionNote: 'Synthetic unit-test window.',
    });

    expect(report.schemaVersion).toBe(SAJU_ABUSE_BASELINE_REPORT_SCHEMA_V1);
    expect(report.authenticatedAttempts).toEqual({
      total: 2,
      uniquePseudonymousClients: 2,
      subjectKindDistribution: { guest: 1, member: 1 },
      routeDistribution: { 'api.me.saju.calculation': 2 },
      perClientRequestCountHistogram: { '1': 2 },
    });
    expect(report.correlatedOutcomes).toMatchObject({
      matched: 2,
      coverageRatio: 1,
      statusCodeDistribution: { '200': 1, '503': 1 },
      statusClassDistribution: { '2xx': 1, '5xx': 1 },
      matchedFailureOutcomeCount: 1,
    });
    expect(report.inputQuality.orphanOutcomeCount).toBe(1);
    expect(report.policyDecision).toEqual({
      produced: false,
      numericLimit: null,
      windowSeconds: null,
      enforcementAuthorized: false,
      note: 'Baseline evidence does not automatically choose or authorize an admission policy.',
    });
  });

  it('excludes governed synthetic request ids before organic metrics', () => {
    const report = analyzeSajuAbuseBaseline({
      events: [
        admission({ requestId: 'synthetic-1' }),
        outcome({ requestId: 'synthetic-1' }),
        admission({
          requestId: 'organic-1',
          occurredAt: '2026-10-03T00:05:00.000Z',
        }),
        outcome({
          requestId: 'organic-1',
          completedAt: '2026-10-03T00:05:01.000Z',
        }),
      ],
      syntheticExclusions: {
        schemaVersion: SAJU_ABUSE_SYNTHETIC_EXCLUSIONS_SCHEMA_V1,
        requests: [
          {
            requestId: 'synthetic-1',
            reason: 'governed smoke',
            evidenceRef: 'run-1',
          },
        ],
      },
    });

    expect(report.inputQuality.configuredSyntheticRequestCount).toBe(1);
    expect(report.inputQuality.syntheticExcludedRequestCount).toBe(1);
    expect(report.inputQuality.syntheticExcludedEventCount).toBe(2);
    expect(report.authenticatedAttempts.total).toBe(1);
    expect(report.correlatedOutcomes.matched).toBe(1);
  });

  it('measures burst behavior only when an explicit window is supplied', () => {
    const events = [
      admission({ requestId: 'req-1', occurredAt: '2026-10-03T00:00:00.000Z' }),
      admission({ requestId: 'req-2', occurredAt: '2026-10-03T00:00:03.000Z' }),
      admission({ requestId: 'req-3', occurredAt: '2026-10-03T00:00:20.000Z' }),
    ];

    const withoutWindow = analyzeSajuAbuseBaseline({ events });
    expect(withoutWindow.burstEvidence).toEqual({
      burstWindowSeconds: null,
      maxAuthenticatedAttemptsBySingleClient: null,
      perClientBurstMaxHistogram: null,
      note: 'No burst window was supplied; no burst threshold was inferred.',
    });

    const withWindow = analyzeSajuAbuseBaseline({
      events,
      burstWindowSeconds: 5,
    });
    expect(withWindow.burstEvidence).toEqual({
      burstWindowSeconds: 5,
      maxAuthenticatedAttemptsBySingleClient: 2,
      perClientBurstMaxHistogram: { '2': 1 },
      note: 'Evidence only; this analysis does not choose a production rate limit.',
    });
  });

  it('reports a failure followed by a later attempt without claiming that it was a retry', () => {
    const report = analyzeSajuAbuseBaseline({
      events: [
        admission({ requestId: 'req-fail', occurredAt: '2026-10-03T00:00:00.000Z' }),
        outcome({
          requestId: 'req-fail',
          httpStatus: 503,
          completedAt: '2026-10-03T00:00:01.000Z',
        }),
        admission({
          requestId: 'req-after',
          occurredAt: '2026-10-03T00:00:06.000Z',
        }),
        outcome({
          requestId: 'req-after',
          completedAt: '2026-10-03T00:00:07.000Z',
        }),
      ],
    });

    expect(report.correlatedOutcomes.matchedFailureOutcomeCount).toBe(1);
    expect(report.correlatedOutcomes.failureFollowedByLaterAttemptCount).toBe(1);
    expect(report.correlatedOutcomes.failureFollowedByLaterAttemptIntervalMs).toEqual({
      count: 1,
      minMs: 5000,
      medianMs: 5000,
      maxMs: 5000,
    });
  });

  it('parses provider text containing prefixed admission and outcome events', () => {
    const text = [
      'noise line',
      'MYEONGHA_SAJU_ABUSE_OBSERVATION ' + JSON.stringify(admission()),
      'more noise',
      'MYEONGHA_SAJU_ABUSE_OBSERVATION ' + JSON.stringify(outcome()),
    ].join('\n');

    expect(parseSajuAbuseObservationText(text)).toEqual([
      admission(),
      outcome(),
    ]);
  });

  it('does not swallow validation failures from structured JSON input', () => {
    expect(() =>
      parseSajuAbuseObservationText(
        JSON.stringify([
          admission({
            clientKey: 'not-a-valid-client-key',
          }),
        ]),
      ),
    ).toThrow(/clientKey is invalid/u);
  });

  it('rejects conflicting duplicate evidence for the same schema/request id', () => {
    expect(() =>
      analyzeSajuAbuseBaseline({
        events: [
          admission(),
          admission({ occurredAt: '2026-10-03T00:00:02.000Z' }),
        ],
      }),
    ).toThrow(/conflicting duplicate event/u);
  });
});
