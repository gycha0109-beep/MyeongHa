import { describe, expect, it } from 'vitest';
import {
  FACE_AUTHORITY_RESEARCH_REGISTRY_V0,
  FACE_METHOD_REFS_V0,
  validateFaceAuthorityRegistry,
  validateFaceDefinitionLateralityContractFR21A,
  validateFacePairSwapInvariantOperationFR21A,
  type FaceAuthorityRegistry,
  type FaceDefinitionLateralityContractV1,
  type FaceMetricDefinition,
  type FacePairSwapInvariantOperationDefinitionV1,
} from '../packages/face-reading/src/index.js';

const REVIEWED_EYE_PAIR_OPERATION: FacePairSwapInvariantOperationDefinitionV1 = Object.freeze({
  operationRef: 'operation.neutral.eye_pair.absolute_difference.fr21a_v1',
  pairGroupRef: 'pair.neutral.eyes',
  reviewState: 'reviewed',
  transform: Object.freeze({
    kind: 'absolute_difference',
    inputRefs: Object.freeze(['left_eye', 'right_eye'] as const),
  }),
  formulaSpec: 'abs(left_eye-right_eye)',
  evidenceRefs: Object.freeze(['evidence.fr21a.eye_pair.swap_invariance']),
});

function productionBase(): FaceAuthorityRegistry {
  return {
    ...FACE_AUTHORITY_RESEARCH_REGISTRY_V0,
    passages: FACE_AUTHORITY_RESEARCH_REGISTRY_V0.passages.map((passage) =>
      passage.passageId === 'passage.shenxiang.face_three_divisions' ||
      passage.passageId === 'passage.shenxiang.sancai_three_divisions'
        ? { ...passage, verificationStatus: 'scan_checked' as const }
        : passage,
    ),
    methodologies: FACE_AUTHORITY_RESEARCH_REGISTRY_V0.methodologies.map((method) =>
      `${method.methodologyId}@${method.version}` === FACE_METHOD_REFS_V0.shenxiangThreeDivisions
        ? { ...method, reviewStatus: 'production_authorized' as const }
        : method,
    ),
    regionMaps: FACE_AUTHORITY_RESEARCH_REGISTRY_V0.regionMaps.map((map) =>
      `${map.regionMapId}@${map.version}` === 'regionmap.shenxiang.face_three_divisions@0.1.0'
        ? { ...map, mappingStatus: 'production_authorized' as const }
        : map,
    ),
  };
}

function productionSideInvariantMetric(): FaceMetricDefinition {
  return {
    metricKey: 'metric.test.fr21a.side_invariant',
    version: '1.0.0',
    methodologyRef: FACE_METHOD_REFS_V0.shenxiangThreeDivisions,
    sourceRefs: ['passage.shenxiang.face_three_divisions'],
    formula: 'abs(y(brow_midline)-y(hairline_midpoint))/normalized_face_height',
    requiredAnchorRefs: ['hairline_midpoint', 'brow_midline'],
    unit: 'normalized_distance',
    stabilityRequirements: ['frontal_static_view'],
    reviewStatus: 'production_authorized',
    laterality: {
      schemaVersion: 'fr21a-v1',
      outputRequirement: 'side_invariant',
      inputs: [
        { inputRef: 'hairline_midpoint', sensitivity: 'side_invariant' },
        {
          inputRef: 'brow_midline',
          sensitivity: 'side_invariant',
          consumerSlotRefs: ['neutral.face.brow_midline'],
        },
      ],
    },
  };
}

function productionPairMetric(overrides: Partial<FaceMetricDefinition> = {}): FaceMetricDefinition {
  return {
    metricKey: 'metric.test.fr21a.eye_pair_difference',
    version: '1.0.0',
    methodologyRef: FACE_METHOD_REFS_V0.shenxiangThreeDivisions,
    sourceRefs: ['passage.shenxiang.face_three_divisions'],
    formula: 'abs(left_eye-right_eye)',
    requiredAnchorRefs: ['left_eye', 'right_eye'],
    unit: 'normalized_distance',
    stabilityRequirements: ['frontal_static_view'],
    reviewStatus: 'production_authorized',
    laterality: {
      schemaVersion: 'fr21a-v1',
      outputRequirement: 'pair_swap_invariant',
      inputs: [
        {
          inputRef: 'left_eye',
          sensitivity: 'image_side_only',
          consumerSlotRefs: ['neutral.face.left_eye_region'],
        },
        {
          inputRef: 'right_eye',
          sensitivity: 'image_side_only',
          consumerSlotRefs: ['neutral.face.right_eye_region'],
        },
      ],
      pairOperationRef: REVIEWED_EYE_PAIR_OPERATION.operationRef,
    },
    ...overrides,
  };
}

describe('FR-21A production laterality contracts', () => {
  it('keeps the existing research corpus valid without adding implicit laterality defaults', () => {
    expect(() => validateFaceAuthorityRegistry(FACE_AUTHORITY_RESEARCH_REGISTRY_V0)).not.toThrow();
    expect(() => validateFaceDefinitionLateralityContractFR21A({
      authorityKey: 'metric.research.no-contract',
      status: 'research',
      expectedInputRefs: ['x'],
    })).not.toThrow();
    expect(() => validateFaceDefinitionLateralityContractFR21A({
      authorityKey: 'metric.production.no-contract',
      status: 'production_authorized',
      expectedInputRefs: ['x'],
    })).toThrow(/requires an explicit FR-21A laterality contract/u);
  });

  it('allows a production side-invariant metric with an explicit valid contract', () => {
    const registry = productionBase();
    expect(() => validateFaceAuthorityRegistry({
      ...registry,
      metrics: [...registry.metrics, productionSideInvariantMetric()],
    })).not.toThrow();
  });

  it('allows a reviewed pair swap-invariant metric only through the exact FR-20 pair group', () => {
    const registry = productionBase();
    expect(validateFacePairSwapInvariantOperationFR21A(REVIEWED_EYE_PAIR_OPERATION)).toBe(REVIEWED_EYE_PAIR_OPERATION);
    expect(() => validateFaceAuthorityRegistry({
      ...registry,
      metrics: [...registry.metrics, productionPairMetric()],
      lateralityPairOperations: [REVIEWED_EYE_PAIR_OPERATION],
    })).not.toThrow();
  });

  it('requires laterality contracts independently on production operationalizations and rules', () => {
    for (const authorityKey of ['op.test.fr21a', 'rule.test.fr21a']) {
      expect(() => validateFaceDefinitionLateralityContractFR21A({
        authorityKey,
        status: 'production_authorized',
        expectedInputRefs: ['input'],
      })).toThrow(/requires an explicit FR-21A laterality contract/u);
    }
  });

  it('does not infer pair safety merely because two image-side inputs exist', () => {
    const contract: FaceDefinitionLateralityContractV1 = {
      schemaVersion: 'fr21a-v1',
      outputRequirement: 'pair_swap_invariant',
      inputs: [
        { inputRef: 'left_eye', sensitivity: 'image_side_only', consumerSlotRefs: ['neutral.face.left_eye_region'] },
        { inputRef: 'right_eye', sensitivity: 'image_side_only', consumerSlotRefs: ['neutral.face.right_eye_region'] },
      ],
    };
    expect(() => validateFaceDefinitionLateralityContractFR21A({
      authorityKey: 'metric.test.pair-without-operation',
      status: 'production_authorized',
      expectedInputRefs: ['left_eye', 'right_eye'],
      contract,
      pairOperations: [REVIEWED_EYE_PAIR_OPERATION],
      formula: 'abs(left_eye-right_eye)',
    })).toThrow(/requires exactly two pair members and a reviewed pair operation/u);
  });

  it('blocks a non-reviewed pair transform at production promotion', () => {
    const researchOperation = {
      ...REVIEWED_EYE_PAIR_OPERATION,
      reviewState: 'research_candidate' as const,
    };
    expect(() => validateFaceDefinitionLateralityContractFR21A({
      authorityKey: 'metric.test.non-reviewed-pair',
      status: 'production_authorized',
      expectedInputRefs: ['left_eye', 'right_eye'],
      contract: productionPairMetric().laterality,
      pairOperations: [researchOperation],
      formula: 'abs(left_eye-right_eye)',
    })).toThrow(/production pair operation must be reviewed/u);
  });

  it('blocks pair group mismatch even when the operation itself is reviewed', () => {
    const browContract: FaceDefinitionLateralityContractV1 = {
      schemaVersion: 'fr21a-v1',
      outputRequirement: 'pair_swap_invariant',
      inputs: [
        { inputRef: 'left_eye', sensitivity: 'image_side_only', consumerSlotRefs: ['neutral.face.left_brow_region'] },
        { inputRef: 'right_eye', sensitivity: 'image_side_only', consumerSlotRefs: ['neutral.face.right_brow_region'] },
      ],
      pairOperationRef: REVIEWED_EYE_PAIR_OPERATION.operationRef,
    };
    expect(() => validateFaceDefinitionLateralityContractFR21A({
      authorityKey: 'metric.test.group-mismatch',
      status: 'production_authorized',
      expectedInputRefs: ['left_eye', 'right_eye'],
      contract: browContract,
      pairOperations: [REVIEWED_EYE_PAIR_OPERATION],
      formula: 'abs(left_eye-right_eye)',
    })).toThrow(/pair operation group does not match/u);
  });

  it('rejects an ordered side formula falsely paired with a swap-invariant declaration', () => {
    expect(() => validateFaceDefinitionLateralityContractFR21A({
      authorityKey: 'metric.test.ordered-formula',
      status: 'production_authorized',
      expectedInputRefs: ['left_eye', 'right_eye'],
      contract: productionPairMetric().laterality,
      pairOperations: [REVIEWED_EYE_PAIR_OPERATION],
      formula: 'left_eye-right_eye',
    })).toThrow(/formula uses ordered\/different side semantics/u);
  });

  it('rejects a forged swapInvariant flag rather than trusting a boolean claim', () => {
    const forged = {
      ...REVIEWED_EYE_PAIR_OPERATION,
      swapInvariant: false,
    } as never;
    expect(() => validateFacePairSwapInvariantOperationFR21A(forged)).toThrow(/unauthorized field: swapInvariant/u);
  });

  it('blocks anatomical-side promotion while capture laterality authority is unresolved', () => {
    const contract = {
      schemaVersion: 'fr21a-v1',
      outputRequirement: 'anatomical_side',
      inputs: [{ inputRef: 'eye', sensitivity: 'anatomical_side' }],
    } as const;
    expect(() => validateFaceDefinitionLateralityContractFR21A({
      authorityKey: 'rule.test.anatomical-side',
      status: 'production_authorized',
      expectedInputRefs: ['eye'],
      contract,
    })).toThrow(/anatomical-side .* blocked/u);
  });

  it('blocks provider landmark indices from becoming a hidden semantic-side authority', () => {
    const registry = productionBase();
    const metric = {
      ...productionSideInvariantMetric(),
      metricKey: 'metric.test.fr21a.provider-index-smuggle',
      extractorLandmarkRefs: [33, 263],
    };
    expect(() => validateFaceAuthorityRegistry({
      ...registry,
      metrics: [...registry.metrics, metric],
    })).toThrow(/provider-specific extractor landmark indices/u);
  });

  it('rejects forged provider/anatomical authority fields and unknown enums', () => {
    const forgedField = {
      schemaVersion: 'fr21a-v1',
      outputRequirement: 'side_invariant',
      inputs: [{ inputRef: 'x', sensitivity: 'side_invariant' }],
      anatomicalSideAuthorityRef: 'provider.LEFT',
    } as never;
    expect(() => validateFaceDefinitionLateralityContractFR21A({
      authorityKey: 'rule.test.forged-field',
      status: 'production_authorized',
      expectedInputRefs: ['x'],
      contract: forgedField,
    })).toThrow(/unauthorized field: anatomicalSideAuthorityRef/u);

    const forgedEnum = {
      schemaVersion: 'fr21a-v1',
      outputRequirement: 'image_side_only',
      inputs: [{ inputRef: 'x', sensitivity: 'side_invariant' }],
    } as never;
    expect(() => validateFaceDefinitionLateralityContractFR21A({
      authorityKey: 'rule.test.unknown-enum',
      status: 'production_authorized',
      expectedInputRefs: ['x'],
      contract: forgedEnum,
    })).toThrow(/unknown outputRequirement/u);
  });

  it('requires downstream input sensitivity to match the upstream production output contract', () => {
    const contract: FaceDefinitionLateralityContractV1 = {
      schemaVersion: 'fr21a-v1',
      outputRequirement: 'side_invariant',
      inputs: [{ inputRef: 'metric.ref', sensitivity: 'side_invariant' }],
    };
    expect(() => validateFaceDefinitionLateralityContractFR21A({
      authorityKey: 'op.test.upstream-mismatch',
      status: 'production_authorized',
      expectedInputRefs: ['metric.ref'],
      contract,
      expectedInputSensitivities: new Map([['metric.ref', 'pair_swap_invariant']]),
    })).toThrow(/does not match upstream output=pair_swap_invariant/u);
  });
});
