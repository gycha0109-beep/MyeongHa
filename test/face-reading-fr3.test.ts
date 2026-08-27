import { describe, expect, it } from 'vitest';
import {
  FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0,
  FACE_FR3_METHOD_REFS_V0,
  FACE_METHOD_REFS_V0,
  FaceAuthorityValidationError,
  buildFiveOfficerResearchClaims,
  evaluateFiveOfficerStaticSupport,
  validateFaceAuthorityRegistry,
  type FaceAuthorityRegistry,
} from '../packages/face-reading/src/index.js';

describe('FR-3 research authority', () => {
  it('validates the extended research registry', () => {
    expect(() => validateFaceAuthorityRegistry(FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0)).not.toThrow();
  });

  it('replaces the old five-officer placeholder with source-specific methodologies', () => {
    const refs = new Set(
      FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0.methodologies.map(
        (method) => `${method.methodologyId}@${method.version}`,
      ),
    );

    expect(refs.has(FACE_METHOD_REFS_V0.fiveOfficers)).toBe(false);
    expect(refs.has(FACE_FR3_METHOD_REFS_V0.shenxiangFiveOfficers)).toBe(true);
    expect(refs.has(FACE_FR3_METHOD_REFS_V0.liuzhuangFiveOfficers)).toBe(true);
    expect(refs.has(FACE_FR3_METHOD_REFS_V0.shenxiangSixFus)).toBe(true);
    expect(refs.has(FACE_FR3_METHOD_REFS_V0.liuzhuangSixFus)).toBe(true);
  });

  it('keeps Shenxiang and Liuzhuang six-fu region maps distinct', () => {
    const shenxiang = FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0.regionMaps.find(
      (map) => `${map.regionMapId}@${map.version}` === 'regionmap.shenxiang.six_fus@0.1.0',
    );
    const liuzhuang = FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0.regionMaps.find(
      (map) => `${map.regionMapId}@${map.version}` === 'regionmap.liuzhuang.six_fus@0.1.0',
    );

    expect(shenxiang).toBeDefined();
    expect(liuzhuang).toBeDefined();
    expect(shenxiang?.regions[0]?.geometryDefinition).not.toEqual(liuzhuang?.regions[0]?.geometryDefinition);
    expect(
      FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0.conflicts.some(
        (conflict) => conflict.conflictId === 'conflict.six_fus.region_mapping_v0' && conflict.status === 'open',
      ),
    ).toBe(true);
  });
});

describe('FR-3 five-officer static support evaluator', () => {
  it('gives a decisive complete static-support result without claiming traditional 官成', () => {
    const result = evaluateFiveOfficerStaticSupport({
      officerKey: 'discernment',
      criterionStates: {
        'criterion.discernment.bridge_straight': 'met',
        'criterion.discernment.tip_round_full': 'met',
      },
    });

    expect(result.staticSupportState).toBe('complete');
    expect(result.failedStaticCriterionIds).toEqual([]);
    expect(result.unavailableStaticCriterionIds).toEqual([]);
    expect(result.traditionalFormationState).toBe('not_authorized');
    expect(result.blockedTraditionalFormationCriterionIds).toContain('criterion.discernment.bright_color');
  });

  it('returns contradicted when a required static criterion is explicitly not met', () => {
    const result = evaluateFiveOfficerStaticSupport({
      officerKey: 'discernment',
      criterionStates: {
        'criterion.discernment.bridge_straight': 'not_met',
        'criterion.discernment.tip_round_full': 'met',
      },
    });

    expect(result.staticSupportState).toBe('contradicted');
    expect(result.failedStaticCriterionIds).toEqual(['criterion.discernment.bridge_straight']);
  });

  it('returns insufficient instead of treating missing observation as negative evidence', () => {
    const result = evaluateFiveOfficerStaticSupport({
      officerKey: 'discernment',
      criterionStates: {
        'criterion.discernment.bridge_straight': 'met',
      },
    });

    expect(result.staticSupportState).toBe('insufficient');
    expect(result.unavailableStaticCriterionIds).toEqual(['criterion.discernment.tip_round_full']);
  });

  it('rejects an unknown criterion instead of silently consuming arbitrary provider output', () => {
    expect(() =>
      evaluateFiveOfficerStaticSupport({
        officerKey: 'discernment',
        criterionStates: {
          'criterion.discernment.provider_magic_score': 'met',
        },
      }),
    ).toThrow(FaceAuthorityValidationError);
  });

  it('emits bounded F2/F3 claims and does not promote dynamic appearance into static evidence', () => {
    const input = {
      officerKey: 'discernment' as const,
      criterionStates: {
        'criterion.discernment.bridge_straight': 'met' as const,
        'criterion.discernment.tip_round_full': 'met' as const,
        'criterion.discernment.bright_color': 'met' as const,
      },
    };
    const assessment = evaluateFiveOfficerStaticSupport(input);
    const claims = buildFiveOfficerResearchClaims(input, assessment);

    expect(claims.filter((claim) => claim.tier === 'F2')).toHaveLength(2);
    expect(claims.filter((claim) => claim.tier === 'F3')).toHaveLength(1);
    expect(claims.some((claim) => claim.semanticKey.includes('bright_color'))).toBe(false);
    expect(claims.some((claim) => claim.semanticKey.includes('formed'))).toBe(false);
    expect(claims.at(-1)?.semanticKey).toBe('face.five_officers.discernment.static_support_complete');
  });
});

describe('FR-3 source-conflict promotion gate', () => {
  it('blocks a six-fu F3 production rule while the region-mapping conflict remains open', () => {
    const passages = FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0.passages.map((passage) =>
      passage.passageId === 'passage.shenxiang.six_fus.mapping'
        ? { ...passage, verificationStatus: 'scan_checked' as const }
        : passage,
    );
    const methodologies = FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0.methodologies.map((method) =>
      `${method.methodologyId}@${method.version}` === FACE_FR3_METHOD_REFS_V0.shenxiangSixFus
        ? { ...method, reviewStatus: 'production_authorized' as const }
        : method,
    );

    const invalid: FaceAuthorityRegistry = {
      ...FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0,
      passages,
      methodologies,
      rules: [
        ...FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0.rules,
        {
          ruleId: 'rule.invalid.six_fus.production',
          version: '1.0.0',
          methodologyRef: FACE_FR3_METHOD_REFS_V0.shenxiangSixFus,
          sourceRefs: ['passage.shenxiang.six_fus.mapping'],
          tier: 'F3',
          inputs: [],
          condition: { op: 'exists', input: 'sixFuConfiguration' },
          output: {
            claimType: 'FACE_CONFIGURATION_INTERPRETATION',
            semanticKey: 'face.six_fus.invalid_production',
          },
          rationale: 'test only',
          limitations: [],
          promotionStatus: 'production_authorized',
        },
      ],
    };

    expect(() => validateFaceAuthorityRegistry(invalid)).toThrow(/conflict\.six_fus\.region_mapping_v0/u);
  });
});
