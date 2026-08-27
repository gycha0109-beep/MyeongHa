import { describe, expect, it } from 'vitest';
import {
  LATERALITY_CONSUMPTION_POLICY_FR20,
  resolveLateralityConsumptionFR20,
  validateLateralityConsumptionPolicyFR20,
  validatePairSwapInvariantOperationFR20,
} from '../packages/face-reading/src/index.js';

const REVIEWED_EYE_PAIR_OPERATION = Object.freeze({
  operationRef: 'operation.neutral.eye_pair.absolute_difference_v1',
  pairGroupRef: 'pair.neutral.eyes',
  reviewState: 'reviewed' as const,
  swapInvariant: true as const,
  formulaSpec: 'absolute_difference(metric(left_eye), metric(right_eye))',
  evidenceRefs: Object.freeze(['evidence.test.eye-pair-swap-invariance']),
});

describe('FR-20 laterality consumption policy', () => {
  it('validates a complete classification for every FR-14 neutral slot', () => {
    expect(validateLateralityConsumptionPolicyFR20()).toBe(LATERALITY_CONSUMPTION_POLICY_FR20);
    expect(LATERALITY_CONSUMPTION_POLICY_FR20.classifications).toHaveLength(6);
    expect(LATERALITY_CONSUMPTION_POLICY_FR20.pairGroups).toHaveLength(2);
  });

  it('allows individual side-invariant slots under unknown source mirroring', () => {
    for (const consumerSlot of ['neutral.face.brow_midline', 'neutral.face.nose_region'] as const) {
      expect(resolveLateralityConsumptionFR20({
        consumerSlots: [consumerSlot],
        requirement: 'side_invariant',
      })).toEqual({
        allowed: true,
        requirement: 'side_invariant',
        reason: 'side_invariant_allowed',
      });
    }
  });

  it('does not treat an individual image-side eye or brow as semantic side authority', () => {
    for (const consumerSlot of [
      'neutral.face.left_eye_region',
      'neutral.face.right_eye_region',
      'neutral.face.left_brow_region',
      'neutral.face.right_brow_region',
    ] as const) {
      expect(resolveLateralityConsumptionFR20({
        consumerSlots: [consumerSlot],
        requirement: 'side_invariant',
      })).toMatchObject({
        allowed: false,
        reason: 'individual_image_side_not_semantic',
      });
    }
  });

  it('allows a reviewed eye-pair operation only when its formula is explicitly swap-invariant', () => {
    expect(validatePairSwapInvariantOperationFR20(REVIEWED_EYE_PAIR_OPERATION)).toBe(REVIEWED_EYE_PAIR_OPERATION);
    expect(resolveLateralityConsumptionFR20({
      consumerSlots: ['neutral.face.left_eye_region', 'neutral.face.right_eye_region'],
      requirement: 'pair_swap_invariant',
      pairOperation: REVIEWED_EYE_PAIR_OPERATION,
    })).toEqual({
      allowed: true,
      requirement: 'pair_swap_invariant',
      reason: 'reviewed_pair_swap_invariant_allowed',
    });
  });

  it('requires a governed pair operation rather than assuming any two-sided input is safe', () => {
    expect(resolveLateralityConsumptionFR20({
      consumerSlots: ['neutral.face.left_eye_region', 'neutral.face.right_eye_region'],
      requirement: 'pair_swap_invariant',
    })).toMatchObject({ allowed: false, reason: 'pair_operation_required' });
  });

  it('blocks research-only pair operations from semantic consumption', () => {
    const researchCandidate = {
      ...REVIEWED_EYE_PAIR_OPERATION,
      reviewState: 'research_candidate' as const,
    };
    expect(resolveLateralityConsumptionFR20({
      consumerSlots: ['neutral.face.left_eye_region', 'neutral.face.right_eye_region'],
      requirement: 'pair_swap_invariant',
      pairOperation: researchCandidate,
    })).toMatchObject({ allowed: false, reason: 'pair_operation_not_reviewed' });
  });

  it('blocks pair operations applied to the wrong pair group', () => {
    expect(resolveLateralityConsumptionFR20({
      consumerSlots: ['neutral.face.left_brow_region', 'neutral.face.right_brow_region'],
      requirement: 'pair_swap_invariant',
      pairOperation: REVIEWED_EYE_PAIR_OPERATION,
    })).toMatchObject({ allowed: false, reason: 'pair_group_mismatch' });
  });

  it('blocks every anatomical-side semantic request in the current file-upload state', () => {
    expect(resolveLateralityConsumptionFR20({
      consumerSlots: ['neutral.face.left_eye_region'],
      requirement: 'anatomical_side',
    })).toEqual({
      allowed: false,
      requirement: 'anatomical_side',
      reason: 'anatomical_side_blocked',
    });
  });

  it('rejects a forged policy that opens anatomical-side consumption', () => {
    const forged = {
      ...LATERALITY_CONSUMPTION_POLICY_FR20,
      anatomicalSideConsumptionAllowed: true,
    } as never;
    expect(() => validateLateralityConsumptionPolicyFR20(forged)).toThrow(/anatomical-side semantic consumption must remain blocked/u);
  });

  it('rejects classifying an individual side slot as side-invariant', () => {
    const forged = {
      ...LATERALITY_CONSUMPTION_POLICY_FR20,
      classifications: LATERALITY_CONSUMPTION_POLICY_FR20.classifications.map((entry) =>
        entry.consumerSlot === 'neutral.face.left_eye_region'
          ? { ...entry, individualSemanticClass: 'side_invariant', pairGroupRef: null }
          : entry),
    } as never;
    expect(() => validateLateralityConsumptionPolicyFR20(forged)).toThrow(/pair member classification mismatch|every image-side-only slot/u);
  });

  it('rejects pair definitions that allow anatomical-side meaning', () => {
    const forged = {
      ...LATERALITY_CONSUMPTION_POLICY_FR20,
      pairGroups: LATERALITY_CONSUMPTION_POLICY_FR20.pairGroups.map((entry, index) =>
        index === 0 ? { ...entry, anatomicalSideMeaningAllowed: true } : entry),
    } as never;
    expect(() => validateLateralityConsumptionPolicyFR20(forged)).toThrow(/pair group contract mismatch/u);
  });

  it('rejects a non-swap-invariant operation contract', () => {
    const forged = {
      ...REVIEWED_EYE_PAIR_OPERATION,
      swapInvariant: false,
    } as never;
    expect(() => validatePairSwapInvariantOperationFR20(forged)).toThrow(/must be explicitly swap-invariant/u);
  });

  it('rejects smuggled anatomical/provider fields in slot classification', () => {
    const forged = {
      ...LATERALITY_CONSUMPTION_POLICY_FR20,
      classifications: LATERALITY_CONSUMPTION_POLICY_FR20.classifications.map((entry, index) =>
        index === 0 ? { ...entry, anatomicalSide: 'left' } : entry),
    } as never;
    expect(() => validateLateralityConsumptionPolicyFR20(forged)).toThrow(/contains unauthorized field: anatomicalSide/u);
  });
});
