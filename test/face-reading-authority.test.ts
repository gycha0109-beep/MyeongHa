import { describe, expect, it } from 'vitest';
import {
  FACE_AUTHORITY_RESEARCH_REGISTRY_V0,
  FACE_COMPARISON_POLICY_V0,
  FACELAB_COMPATIBILITY_REPORT_V0,
  FACE_METHOD_REFS_V0,
  FaceAuthorityValidationError,
  adaptMyeongHaStaticFaceObservation,
  assertClaimsComparable,
  assertFaceLabProductionBridgeReady,
  evaluateThreeDivisionRelativeOrder,
  projectCharacterFaceGrounding,
  validateFaceAuthorityRegistry,
  type FaceAuthorityRegistry,
  type FaceClaim,
  type ProductFaceReadingSemanticV3,
  type SharedFaceObservationBundleV3,
} from '../packages/face-reading/src/index.js';

function withScanCheckedPassages(registry: FaceAuthorityRegistry, passageIds: readonly string[]): FaceAuthorityRegistry {
  const selected = new Set(passageIds);
  return {
    ...registry,
    passages: registry.passages.map((passage) =>
      selected.has(passage.passageId)
        ? { ...passage, verificationStatus: 'scan_checked' as const }
        : passage,
    ),
  };
}

describe('face source and methodology authority', () => {
  it('accepts the research-only seed registry', () => {
    expect(() => validateFaceAuthorityRegistry(FACE_AUTHORITY_RESEARCH_REGISTRY_V0)).not.toThrow();
  });

  it('rejects unknown witness ownership', () => {
    const invalid: FaceAuthorityRegistry = {
      ...FACE_AUTHORITY_RESEARCH_REGISTRY_V0,
      witnesses: [
        ...FACE_AUTHORITY_RESEARCH_REGISTRY_V0.witnesses,
        {
          witnessId: 'witness.invalid',
          workId: 'work.unknown',
          editionLabel: 'invalid',
          witnessStatus: 'candidate',
        },
      ],
    };
    expect(() => validateFaceAuthorityRegistry(invalid)).toThrow(FaceAuthorityValidationError);
  });

  it('rejects an unresolved methodology ref instead of accepting stringly-typed authority', () => {
    const invalid: FaceAuthorityRegistry = {
      ...FACE_AUTHORITY_RESEARCH_REGISTRY_V0,
      rules: [
        {
          ...FACE_AUTHORITY_RESEARCH_REGISTRY_V0.rules[0]!,
          ruleId: 'rule.invalid.methodology',
          methodologyRef: 'method.does_not_exist@1.0.0',
        },
      ],
    };
    expect(() => validateFaceAuthorityRegistry(invalid)).toThrow(/methodologyRef references unknown key/u);
  });

  it('does not promote unverified electronic text directly into a production rule', () => {
    const invalid: FaceAuthorityRegistry = {
      ...FACE_AUTHORITY_RESEARCH_REGISTRY_V0,
      rules: [
        {
          ruleId: 'rule.invalid.production',
          version: '1.0.0',
          methodologyRef: FACE_METHOD_REFS_V0.shenxiangThreeDivisions,
          sourceRefs: ['passage.shenxiang.face_three_divisions'],
          tier: 'F1',
          inputs: [],
          condition: { op: 'exists', input: 'threeDivisions' },
          output: {
            claimType: 'FACE_MORPHOLOGY_CLASSIFICATION',
            semanticKey: 'face.three_divisions.invalid',
          },
          rationale: 'test only',
          limitations: [],
          promotionStatus: 'production_authorized',
        },
      ],
    };
    expect(() => validateFaceAuthorityRegistry(invalid)).toThrow(/scan_checked/u);
  });

  it('does not allow a production rule to outrun a research methodology', () => {
    const base = withScanCheckedPassages(FACE_AUTHORITY_RESEARCH_REGISTRY_V0, [
      'passage.shenxiang.face_three_divisions',
    ]);
    const invalid: FaceAuthorityRegistry = {
      ...base,
      rules: [
        {
          ruleId: 'rule.invalid.method_status',
          version: '1.0.0',
          methodologyRef: FACE_METHOD_REFS_V0.shenxiangThreeDivisions,
          sourceRefs: ['passage.shenxiang.face_three_divisions'],
          tier: 'F1',
          inputs: [],
          condition: { op: 'exists', input: 'threeDivisions' },
          output: {
            claimType: 'FACE_MORPHOLOGY_CLASSIFICATION',
            semanticKey: 'face.three_divisions.invalid_method_status',
          },
          rationale: 'test only',
          limitations: [],
          promotionStatus: 'production_authorized',
        },
      ],
    };
    expect(() => validateFaceAuthorityRegistry(invalid)).toThrow(/methodology .* status=research/u);
  });

  it('blocks F6 promotion while the period-direction source conflict is unresolved', () => {
    const base = withScanCheckedPassages(FACE_AUTHORITY_RESEARCH_REGISTRY_V0, [
      'passage.shenxiang.face_three_divisions',
      'passage.shenxiang.sancai_three_divisions',
    ]);
    const methodologies = base.methodologies.map((method) =>
      `${method.methodologyId}@${method.version}` === FACE_METHOD_REFS_V0.shenxiangThreeDivisions
        ? { ...method, reviewStatus: 'production_authorized' as const }
        : method,
    );
    const invalid: FaceAuthorityRegistry = {
      ...base,
      methodologies,
      rules: [
        ...base.rules,
        {
          ruleId: 'rule.invalid.f6.period',
          version: '1.0.0',
          methodologyRef: FACE_METHOD_REFS_V0.shenxiangThreeDivisions,
          sourceRefs: ['passage.shenxiang.sancai_three_divisions'],
          tier: 'F6',
          inputs: [],
          condition: { op: 'exists', input: 'threeDivisionRelation' },
          output: {
            claimType: 'FACE_POSITION_PERIOD_INTERPRETATION',
            semanticKey: 'face.three_divisions.period.invalid',
          },
          rationale: 'test only',
          limitations: [],
          promotionStatus: 'production_authorized',
        },
      ],
    };
    expect(() => validateFaceAuthorityRegistry(invalid)).toThrow(/unresolved authority conflict/u);
  });
});

describe('three divisions FR-2 operationalization', () => {
  it('computes only strict relative order without an invented near-equal tolerance', () => {
    expect(evaluateThreeDivisionRelativeOrder({ upper: 1, middle: 1, lower: 1 })).toMatchObject({
      relation: 'all_equal_exact',
      calibrationApplied: false,
      nearEqualClassificationAvailable: false,
    });

    expect(evaluateThreeDivisionRelativeOrder({ upper: 1, middle: 1.00001, lower: 1 })).toMatchObject({
      relation: 'middle_longest',
      calibrationApplied: false,
      nearEqualClassificationAvailable: false,
    });
  });

  it('normalizes shares without changing the source-level relation', () => {
    const result = evaluateThreeDivisionRelativeOrder({ upper: 2, middle: 3, lower: 5 });
    expect(result.relation).toBe('lower_longest');
    expect(result.normalizedShares).toEqual({ upper: 0.2, middle: 0.3, lower: 0.5 });
    expect(result.totalLength).toBe(10);
  });

  it('rejects zero, negative, and non-finite measurements', () => {
    expect(() => evaluateThreeDivisionRelativeOrder({ upper: 0, middle: 1, lower: 1 })).toThrow(/upper/u);
    expect(() => evaluateThreeDivisionRelativeOrder({ upper: 1, middle: -1, lower: 1 })).toThrow(/middle/u);
    expect(() => evaluateThreeDivisionRelativeOrder({ upper: 1, middle: 1, lower: Number.NaN })).toThrow(/lower/u);
  });
});

describe('shared observation core boundary', () => {
  it('removes dynamic color appearance from the static MyeongHa adapter', () => {
    const bundle: SharedFaceObservationBundleV3 = {
      schemaVersion: 'v3',
      capabilityVersion: 'face-core-v1',
      extractorVersion: 'extractor-v1',
      modelVersion: 'model-v1',
      eligibility: { status: 'eligible', humanFaceCount: 1, reasons: [] },
      quality: { pose: {}, occludedRegions: ['left_ear'] },
      geometry: { metrics: [] },
      observations: {
        outline: { shape: 'oval' },
        colorAppearance: { skinTone: 'must-not-cross-boundary' },
      },
      evidenceRefs: ['evidence-1'],
    };

    const adapted = adaptMyeongHaStaticFaceObservation(bundle);
    expect(adapted.observationState).toBe('usable');
    expect(adapted.unavailableRegions).toEqual(['left_ear']);
    expect('colorAppearance' in adapted.observations).toBe(false);
  });

  it('blocks production FaceLab coupling while only evaluation tooling contract is available', () => {
    expect(FACELAB_COMPATIBILITY_REPORT_V0.state).toBe('evaluation_contract_only');
    expect(() => assertFaceLabProductionBridgeReady()).toThrow(/evaluation_contract_only/u);
  });

  it('permits a future stable neutral FaceLab contract without changing Face Reading semantics', () => {
    expect(() =>
      assertFaceLabProductionBridgeReady({
        ...FACELAB_COMPATIBILITY_REPORT_V0,
        state: 'production_neutral_contract_available',
        missingProductionCapabilities: [],
      }),
    ).not.toThrow();
  });
});

describe('comparison policy', () => {
  const claims: readonly FaceClaim[] = [
    {
      claimRef: 'claim-1',
      claimType: 'FACE_PALACE_STATUS',
      tier: 'F2',
      methodologyRef: FACE_METHOD_REFS_V0.twelvePalaces,
      sourceRefs: [],
      semanticKey: 'palace.wealth.prominent',
      salience: 'primary',
    },
  ];

  it('allows salience wording for a salience-only group', () => {
    expect(() =>
      assertClaimsComparable({
        policy: FACE_COMPARISON_POLICY_V0,
        groupKey: 'twelve_palaces.salience',
        claims,
        requestedLabel: 'most_salient',
      }),
    ).not.toThrow();
  });

  it('rejects strongest/weakest wording without ordinal authority', () => {
    expect(() =>
      assertClaimsComparable({
        policy: FACE_COMPARISON_POLICY_V0,
        groupKey: 'twelve_palaces.salience',
        claims,
        requestedLabel: 'strongest_weakest',
      }),
    ).toThrow(/permits most_salient/u);
  });
});

describe('MyeongHa grounding projection', () => {
  it('preserves semantic keys and prohibited inferences without inventing prose', () => {
    const claims: readonly FaceClaim[] = [
      {
        claimRef: 'claim-career-1',
        claimType: 'FACE_DOMAIN_PATTERN',
        tier: 'F7',
        methodologyRef: 'method.career.research_v0@0.1.0',
        sourceRefs: [],
        semanticKey: 'face.career.responsibility_axis',
        axis: 'career',
        pattern: 'responsibility_axis',
      },
    ];
    const reading: ProductFaceReadingSemanticV3 = {
      readingRef: 'face-reading-1',
      engineVersion: '0.1.0',
      methodologyPackRef: 'pack.face.research_v0@0.2.0',
      sourceSnapshotRef: 'observation-1',
      observationState: 'usable',
      diagnosisResolution: 'resolved',
      verdict: {
        semanticKey: 'face.verdict.research',
        claimRefs: ['claim-career-1'],
      },
      modules: {},
      lenses: [],
      unavailableSections: [],
      prohibitedInferences: ['medical_diagnosis', 'criminality', 'protected_trait_inference'],
    };

    expect(projectCharacterFaceGrounding({ groundingVersion: 'v1', reading, claims })).toEqual({
      groundingVersion: 'v1',
      faceReadingRef: 'face-reading-1',
      faceEngineVersion: '0.1.0',
      methodologyPackRef: 'pack.face.research_v0@0.2.0',
      semanticClaims: [
        {
          key: 'face.career.responsibility_axis',
          axis: 'career',
          pattern: 'responsibility_axis',
          claimRef: 'claim-career-1',
        },
      ],
      unavailableSections: [],
      prohibitedInferences: ['medical_diagnosis', 'criminality', 'protected_trait_inference'],
    });
  });
});
