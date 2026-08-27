import { describe, expect, it } from 'vitest';
import {
  FACE_AUTHORITY_RESEARCH_REGISTRY_V0,
  FACE_COMPARISON_POLICY_V0,
  FaceAuthorityValidationError,
  adaptMyeongHaStaticFaceObservation,
  assertClaimsComparable,
  projectCharacterFaceGrounding,
  validateFaceAuthorityRegistry,
  type FaceAuthorityRegistry,
  type FaceClaim,
  type ProductFaceReadingSemanticV3,
  type SharedFaceObservationBundleV3,
} from '../packages/face-reading/src/index.js';

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

  it('does not promote unverified electronic text directly into a production rule', () => {
    const invalid: FaceAuthorityRegistry = {
      ...FACE_AUTHORITY_RESEARCH_REGISTRY_V0,
      rules: [
        {
          ruleId: 'rule.invalid.production',
          version: '1.0.0',
          methodologyRef: 'method.three_divisions.research_v0',
          sourceRefs: ['passage.shenxiang.three_divisions'],
          tier: 'F6',
          inputs: [],
          condition: { op: 'exists', input: 'threeDivisions' },
          output: {
            claimType: 'FACE_POSITION_PERIOD_INTERPRETATION',
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
});

describe('comparison policy', () => {
  const claims: readonly FaceClaim[] = [
    {
      claimRef: 'claim-1',
      claimType: 'FACE_PALACE_STATUS',
      tier: 'F2',
      methodologyRef: 'method.twelve_palaces.research_v0',
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
        methodologyRef: 'method.career.research_v0',
        sourceRefs: [],
        semanticKey: 'face.career.responsibility_axis',
        axis: 'career',
        pattern: 'responsibility_axis',
      },
    ];
    const reading: ProductFaceReadingSemanticV3 = {
      readingRef: 'face-reading-1',
      engineVersion: '0.1.0',
      methodologyPackRef: 'pack.face.research_v0@0.1.0',
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
      methodologyPackRef: 'pack.face.research_v0@0.1.0',
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
