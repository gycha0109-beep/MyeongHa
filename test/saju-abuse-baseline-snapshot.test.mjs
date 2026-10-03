import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = 'docs/operations/SAJU_ABUSE_BASELINE_SNAPSHOT_2026-10-03.json';

function snapshot() {
  return JSON.parse(readFileSync(path, 'utf8'));
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
