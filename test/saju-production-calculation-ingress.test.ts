import { describe, expect, it } from 'vitest';
import {
  SajuProductionCalculationIngressErrorV1,
  ingestAuthorizedSajuProductionCalculationV1,
  type SajuBirthRevisionBindingV1,
} from '../packages/domain/src/index.js';

const BIRTH_REVISION = {
  birthRevisionRef: 'birth-revision:test:1',
  calendarType: 'solar',
  birthDate: '2001-07-14',
  birthTime: '15:20:00',
  timeKnown: true,
  isLeapMonth: false,
  sex: 'unspecified',
} as const satisfies SajuBirthRevisionBindingV1;

const PILLAR = {
  stem: { value: '갑', hanja: '甲', element: '목', yinYang: '양' },
  branch: { value: '자', hanja: '子', element: '수', yinYang: '양' },
} as const;

function responseFixture(): Record<string, unknown> {
  return {
    responseSchemaVersion: 'myeonghwa-production-calculation-http-v1',
    runtimeVersion: 'myeonghwa-production-calculation-runtime-v1',
    authority: {
      calculationPolicyId: 'myeonghwa-production-civil-midnight-v1',
      authorizationId: 'myeonghwa-production-calculation-default-authorization-v1',
      authorityRecordRef: 'docs/decisions/ADR-0006-production-calculation-default-v1.md',
      policyVersion: 'myeonghwa-production-calculation-policy-v1',
      contentHash: 'authority-content-hash',
    },
    snapshot: {
      snapshotId: 'snapshot:test:1',
      schemaVersion: 'canonical-saju-snapshot-v1',
      calculationHash: 'calculation-hash',
      createdAt: '2026-09-01T22:00:00.000Z',
      input: {
        calendarType: 'solar',
        date: { year: 2001, month: 7, day: 14 },
        time: { known: true, hour: 15, minute: 20 },
        sexForTraditionalCalculation: 'unspecified',
      },
      policy: {
        policyId: 'myeonghwa/production/civil-midnight-v1',
        policyVersion: 'myeonghwa-production-calculation-policy-v1',
        dayBoundary: 'midnight',
        trueSolarTime: {
          enabled: false,
          longitudeSource: 'not-applicable',
          applyEquationOfTime: false,
          applyHistoricalDst: false,
        },
        timeZonePolicy: { source: 'service-default', timeZone: 'Asia/Seoul' },
        unknownBirthTimePolicy: 'preserve-unknown-and-enumerate-boundaries',
      },
      normalized: {
        diagnostics: 'must-not-cross-ingress',
      },
      pillars: {
        year: { status: 'resolved', value: PILLAR },
        month: { status: 'resolved', value: PILLAR },
        day: { status: 'resolved', value: PILLAR },
        hour: { status: 'unavailable', reasonCode: 'TEST_HOUR_UNAVAILABLE' },
      },
      derivedFacts: {
        interpretation: 'must-not-cross-ingress',
        methodologyRanking: ['must-not-cross-ingress'],
      },
      luckCycle: {
        reading: 'must-not-cross-ingress',
      },
      completeness: {
        birthTimeKnown: true,
        fullyResolved: false,
        resolvedPaths: ['pillars.year', 'pillars.month', 'pillars.day'],
        ambiguousPaths: [],
        unavailablePaths: ['pillars.hour'],
      },
      provenance: {
        engine: {
          name: 'myeonghwa-saju-engine',
          version: 'engine-v1',
          sourceRepository: 'gycha0109-beep/Saju',
        },
        adapter: { name: 'manseryeok', version: '2.0.0' },
        policy: {
          id: 'myeonghwa/production/civil-midnight-v1',
          version: 'myeonghwa-production-calculation-policy-v1',
        },
        schema: { id: 'canonical-saju-snapshot', version: 'v1' },
        datasets: [{ name: 'internal-dataset', notes: 'not projected' }],
      },
    },
  };
}

function expectIngressError(
  execute: () => unknown,
  code: SajuProductionCalculationIngressErrorV1['code'],
): void {
  try {
    execute();
    throw new Error('Expected SajuProductionCalculationIngressErrorV1.');
  } catch (error) {
    expect(error).toBeInstanceOf(SajuProductionCalculationIngressErrorV1);
    expect((error as SajuProductionCalculationIngressErrorV1).code).toBe(code);
  }
}

describe('Saju production calculation ingress v1', () => {
  it('binds the authorized calculation-only response to a birth revision without promoting it to a Reading', () => {
    const artifact = ingestAuthorizedSajuProductionCalculationV1({
      response: responseFixture(),
      birthRevision: BIRTH_REVISION,
    });

    expect(artifact).toMatchObject({
      schemaVersion: 'myeongha-saju-production-calculation-ingress-v1',
      kind: 'saju_calculation_evidence',
      semanticAuthority: 'calculation_only',
      interpretationAuthorized: false,
      birthRevisionRef: 'birth-revision:test:1',
      source: {
        responseSchemaVersion: 'myeonghwa-production-calculation-http-v1',
        runtimeVersion: 'myeonghwa-production-calculation-runtime-v1',
        calculationPolicyId: 'myeonghwa-production-civil-midnight-v1',
        authorizationId: 'myeonghwa-production-calculation-default-authorization-v1',
        policyVersion: 'myeonghwa-production-calculation-policy-v1',
      },
      snapshot: {
        snapshotId: 'snapshot:test:1',
        policy: {
          policyId: 'myeonghwa/production/civil-midnight-v1',
          policyVersion: 'myeonghwa-production-calculation-policy-v1',
          dayBoundary: 'midnight',
        },
        pillars: {
          year: { status: 'resolved', value: PILLAR },
          hour: { status: 'unavailable', reasonCode: 'TEST_HOUR_UNAVAILABLE' },
        },
      },
    });

    const serialized = JSON.stringify(artifact);
    expect(serialized).not.toContain('2001-07-14');
    expect(serialized).not.toContain('15:20');
    expect(serialized).not.toContain('interpretation');
    expect(serialized).not.toContain('methodologyRanking');
    expect(serialized).not.toContain('diagnostics');
    expect(serialized).not.toContain('reading');
    expect(serialized).not.toContain('datasets');
    expect(Object.keys(artifact)).toEqual([
      'schemaVersion',
      'kind',
      'semanticAuthority',
      'interpretationAuthorized',
      'birthRevisionRef',
      'source',
      'snapshot',
    ]);
    expect(Object.isFrozen(artifact)).toBe(true);
  });

  it('fails closed on unsupported producer schema or runtime', () => {
    const wrongSchema = responseFixture();
    wrongSchema.responseSchemaVersion = 'myeonghwa-production-calculation-http-v2';
    expectIngressError(
      () =>
        ingestAuthorizedSajuProductionCalculationV1({
          response: wrongSchema,
          birthRevision: BIRTH_REVISION,
        }),
      'UNSUPPORTED_SCHEMA',
    );

    const wrongRuntime = responseFixture();
    wrongRuntime.runtimeVersion = 'myeonghwa-production-calculation-runtime-v2';
    expectIngressError(
      () =>
        ingestAuthorizedSajuProductionCalculationV1({
          response: wrongRuntime,
          birthRevision: BIRTH_REVISION,
        }),
      'UNSUPPORTED_SCHEMA',
    );
  });

  it('fails closed when ADR-0006 authority, snapshot policy, or provenance policy drifts', () => {
    const wrongAuthority = responseFixture();
    (wrongAuthority.authority as Record<string, unknown>).calculationPolicyId = 'caller-selected-policy';
    expectIngressError(
      () =>
        ingestAuthorizedSajuProductionCalculationV1({
          response: wrongAuthority,
          birthRevision: BIRTH_REVISION,
        }),
      'UNAUTHORIZED_CALCULATION',
    );

    const wrongPolicy = responseFixture();
    const wrongPolicySnapshot = wrongPolicy.snapshot as Record<string, unknown>;
    (wrongPolicySnapshot.policy as Record<string, unknown>).dayBoundary = 'jasi';
    expectIngressError(
      () =>
        ingestAuthorizedSajuProductionCalculationV1({
          response: wrongPolicy,
          birthRevision: BIRTH_REVISION,
        }),
      'UNAUTHORIZED_CALCULATION',
    );

    const wrongProvenance = responseFixture();
    const wrongProvenanceSnapshot = wrongProvenance.snapshot as Record<string, unknown>;
    const provenance = wrongProvenanceSnapshot.provenance as Record<string, unknown>;
    (provenance.policy as Record<string, unknown>).id = 'alternate-policy';
    expectIngressError(
      () =>
        ingestAuthorizedSajuProductionCalculationV1({
          response: wrongProvenance,
          birthRevision: BIRTH_REVISION,
        }),
      'UNAUTHORIZED_CALCULATION',
    );
  });

  it('fails closed when the calculation result is bound to a different birth revision', () => {
    expectIngressError(
      () =>
        ingestAuthorizedSajuProductionCalculationV1({
          response: responseFixture(),
          birthRevision: { ...BIRTH_REVISION, birthDate: '2001-07-15' },
        }),
      'BIRTH_REVISION_MISMATCH',
    );

    expectIngressError(
      () =>
        ingestAuthorizedSajuProductionCalculationV1({
          response: responseFixture(),
          birthRevision: { ...BIRTH_REVISION, birthTime: '15:21:00' },
        }),
      'BIRTH_REVISION_MISMATCH',
    );
  });

  it('rejects same-version shape expansion instead of silently accepting producer drift', () => {
    const response = responseFixture();
    response.interpretation = { text: 'forbidden same-version expansion' };
    expectIngressError(
      () =>
        ingestAuthorizedSajuProductionCalculationV1({ response, birthRevision: BIRTH_REVISION }),
      'INVALID_RESPONSE',
    );

    const nested = responseFixture();
    const snapshot = nested.snapshot as Record<string, unknown>;
    snapshot.alternateSnapshots = [];
    expectIngressError(
      () =>
        ingestAuthorizedSajuProductionCalculationV1({ response: nested, birthRevision: BIRTH_REVISION }),
      'INVALID_RESPONSE',
    );
  });
});
