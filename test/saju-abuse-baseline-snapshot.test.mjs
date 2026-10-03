import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const initialPath = 'docs/operations/SAJU_ABUSE_BASELINE_SNAPSHOT_2026-10-03.json';
const followUpPath = 'docs/operations/SAJU_ABUSE_BASELINE_SNAPSHOT_2026-10-03_0633Z.json';
const guestFollowUpPath = 'docs/operations/SAJU_ABUSE_BASELINE_SNAPSHOT_2026-10-03_0817Z.json';
const exclusionsPath = 'docs/operations/SAJU_ABUSE_SYNTHETIC_EXCLUSIONS_V1.json';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function snapshot() {
  return readJson(initialPath);
}

describe('initial Saju abuse baseline snapshot', () => {
  it('records an insufficient organic baseline without authorizing enforcement', () => {
    const value = snapshot();

    expect(value.schemaVersion).toBe('myeongha-saju-abuse-baseline-snapshot-v1');
    expect(value.analyzerReport.schemaVersion).toBe(
      'myeongha-saju-abuse-baseline-report-v1',
    );
    expect(value.analyzerReport.authenticatedAttempts.total).toBe(0);
    expect(value.analyzerReport.policyDecision).toMatchObject({
      produced: false,
      numericLimit: null,
      windowSeconds: null,
      enforcementAuthorized: false,
    });
    expect(value.disposition).toEqual({
      organicBaseline: 'INSUFFICIENT',
      numericAdmissionPolicy: 'HOLD',
      enforcement: 'HOLD',
      issueClosureAllowed: false,
    });
  });

  it('keeps synthetic identifiers and pseudonymous client keys out of the snapshot', () => {
    const serialized = JSON.stringify(snapshot());

    expect(serialized).not.toContain('requestId');
    expect(serialized).not.toContain('clientKey');
    expect(serialized).not.toMatch(/[a-f0-9]{64}/u);
  });

  it('keeps both public Saju execution routes explicitly represented', () => {
    const perRoute = snapshot().analyzerReport.perRoute;

    expect(Object.keys(perRoute).sort()).toEqual([
      'api.me.saju.calculation',
      'api.me.saju.preview-reading',
    ]);
    expect(perRoute['api.me.saju.calculation'].authenticatedAttempts.total).toBe(0);
    expect(perRoute['api.me.saju.preview-reading'].authenticatedAttempts.total).toBe(0);
  });

  it('records the provider query cap as not reached', () => {
    const authority = snapshot().authority;

    expect(authority.connectorRecordCap).toBe(100);
    expect(authority.returnedMatchingInvocationCount).toBe(2);
    expect(authority.capReached).toBe(false);
  });
});


describe('follow-up Saju abuse baseline snapshot after Preview smoke', () => {
  it('records both governed Saju routes as synthetic coverage while keeping organic baseline empty', () => {
    const value = readJson(followUpPath);

    expect(value.authority.previewSmokeRunId).toBe(37101519866);
    expect(value.authority.governedSyntheticRouteCoverage).toEqual({
      'api.me.saju.calculation': 2,
      'api.me.saju.preview-reading': 1,
    });
    expect(value.authority.returnedMatchingInvocationCount).toBe(3);
    expect(value.authority.capReached).toBe(false);
    expect(value.analyzerReport.inputQuality).toMatchObject({
      parsedEventCount: 6,
      configuredSyntheticRequestCount: 7,
      syntheticExcludedRequestCount: 3,
      syntheticExcludedEventCount: 6,
      unmatchedAuthenticatedAdmissionCount: 0,
      orphanOutcomeCount: 0,
    });
    expect(value.analyzerReport.authenticatedAttempts.total).toBe(0);
    expect(value.disposition).toEqual({
      organicBaseline: 'INSUFFICIENT',
      numericAdmissionPolicy: 'HOLD',
      enforcement: 'HOLD',
      issueClosureAllowed: false,
    });
  });

  it('does not persist synthetic request ids or pseudonymous client keys in the follow-up snapshot', () => {
    const serialized = JSON.stringify(readJson(followUpPath));

    expect(serialized).not.toContain('requestId');
    expect(serialized).not.toContain('clientKey');
    expect(serialized).not.toMatch(/[a-f0-9]{64}/u);
  });

  it('keeps the Preview smoke exclusions in the canonical authority', () => {
    const exclusions = readJson(exclusionsPath);

    expect(
      exclusions.requests.filter(
        (request) => request.evidenceRef === 'GitHub Actions run 37101519866 / PR #1560',
      ),
    ).toHaveLength(3);
  });
});


describe('follow-up Saju abuse baseline snapshot after Member and Guest smoke', () => {
  it('proves normal Member and Guest Production flows without authorizing enforcement', () => {
    const value = readJson(guestFollowUpPath);

    expect(value.authority.guestSmokeRunId).toBe(37106609427);
    expect(value.authority.productionDeploymentSha).toBe(
      '88efcac5ab59025fda73b686abf72b29bfcd5ec3',
    );
    expect(value.authority.governedSyntheticCoverage).toEqual({
      member: {
        'api.me.saju.calculation': 2,
        'api.me.saju.preview-reading': 1,
      },
      guest: {
        'api.me.saju.calculation': 1,
        'api.me.saju.preview-reading': 1,
      },
    });
    expect(value.authority.returnedMatchingInvocationCount).toBe(5);
    expect(value.authority.capReached).toBe(false);
    expect(value.analyzerReport.inputQuality).toMatchObject({
      parsedEventCount: 10,
      configuredSyntheticRequestCount: 12,
      syntheticExcludedRequestCount: 5,
      syntheticExcludedEventCount: 10,
      unmatchedAuthenticatedAdmissionCount: 0,
      orphanOutcomeCount: 0,
    });
    expect(value.analyzerReport.authenticatedAttempts.total).toBe(0);
    expect(value.analyzerReport.policyDecision).toEqual({
      produced: false,
      numericLimit: null,
      windowSeconds: null,
      enforcementAuthorized: false,
      note: 'Baseline evidence does not automatically choose or authorize an admission policy.',
    });
    expect(value.disposition).toEqual({
      normalMemberProductionFlow: 'PROVEN',
      normalGuestProductionFlow: 'PROVEN',
      organicBaseline: 'INSUFFICIENT',
      numericAdmissionPolicy: 'HOLD',
      enforcement: 'HOLD',
      issueClosureAllowed: false,
    });
  });

  it('does not persist synthetic request ids or pseudonymous client keys in the Guest follow-up snapshot', () => {
    const serialized = JSON.stringify(readJson(guestFollowUpPath));

    expect(serialized).not.toContain('requestId');
    expect(serialized).not.toContain('clientKey');
    expect(serialized).not.toMatch(/[a-f0-9]{64}/u);
  });

  it('pins all twelve governed synthetic Saju request ids exactly once', () => {
    const exclusions = readJson(exclusionsPath);
    const ids = exclusions.requests.map((request) => request.requestId);

    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);
    expect(
      exclusions.requests.filter(
        (request) => request.evidenceRef === 'GitHub Actions run 37106609427 / PR #1564',
      ),
    ).toHaveLength(5);
  });
});
