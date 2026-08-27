import { CAPTURE_ORIENTATION_AUTHORITY_FR19 } from './capture-orientation-authority-fr19.js';
import {
  FACELAB_NEUTRAL_BINDING_PROFILE_FR14,
  type NeutralAnchorConsumerSlotV1,
} from './neutral-provider-bindings-fr14.js';
import { FaceAuthorityValidationError } from './validation.js';

export type LateralitySemanticRequirementV1 =
  | 'side_invariant'
  | 'pair_swap_invariant'
  | 'anatomical_side';

export interface NeutralSlotLateralityClassificationV1 {
  readonly consumerSlot: NeutralAnchorConsumerSlotV1;
  readonly individualSemanticClass: 'side_invariant' | 'image_side_only';
  readonly pairGroupRef: string | null;
}

export interface NeutralPairSwapInvariantGroupV1 {
  readonly pairGroupRef: string;
  readonly memberSlots: readonly [NeutralAnchorConsumerSlotV1, NeutralAnchorConsumerSlotV1];
  readonly allowedRequirement: 'pair_swap_invariant';
  readonly requiresReviewedSwapInvariantOperation: true;
  readonly anatomicalSideMeaningAllowed: false;
}

export interface LateralityConsumptionPolicyFR20V1 {
  readonly schemaVersion: 'v1';
  readonly policyVersion: string;
  readonly authorityState: 'research_only';
  readonly captureOrientationAuthorityVersion: string;
  readonly neutralBindingProfileVersion: string;
  readonly currentCaptureState: 'file_upload_unknown_source_mirror';
  readonly classifications: readonly NeutralSlotLateralityClassificationV1[];
  readonly pairGroups: readonly NeutralPairSwapInvariantGroupV1[];
  readonly anatomicalSideConsumptionAllowed: false;
  readonly prohibitedPromotions: readonly [
    'individual_image_side_to_anatomical_side',
    'ordered_pair_to_swap_invariant_pair',
    'pair_member_label_to_anatomical_side',
    'unknown_source_mirror_to_anatomical_side',
  ];
}

export interface PairSwapInvariantOperationV1 {
  readonly operationRef: string;
  readonly pairGroupRef: string;
  readonly reviewState: 'research_candidate' | 'reviewed';
  readonly swapInvariant: true;
  readonly formulaSpec: string;
  readonly evidenceRefs: readonly string[];
}

export interface LateralityConsumptionDecisionV1 {
  readonly allowed: boolean;
  readonly requirement: LateralitySemanticRequirementV1;
  readonly reason:
    | 'side_invariant_allowed'
    | 'reviewed_pair_swap_invariant_allowed'
    | 'individual_image_side_not_semantic'
    | 'pair_operation_required'
    | 'pair_operation_not_reviewed'
    | 'pair_operation_not_swap_invariant'
    | 'pair_group_mismatch'
    | 'anatomical_side_blocked';
}

const ALLOWED_POLICY_KEYS = new Set([
  'schemaVersion', 'policyVersion', 'authorityState', 'captureOrientationAuthorityVersion',
  'neutralBindingProfileVersion', 'currentCaptureState', 'classifications', 'pairGroups',
  'anatomicalSideConsumptionAllowed', 'prohibitedPromotions',
]);
const ALLOWED_CLASSIFICATION_KEYS = new Set(['consumerSlot', 'individualSemanticClass', 'pairGroupRef']);
const ALLOWED_PAIR_GROUP_KEYS = new Set([
  'pairGroupRef', 'memberSlots', 'allowedRequirement', 'requiresReviewedSwapInvariantOperation', 'anatomicalSideMeaningAllowed',
]);
const ALLOWED_OPERATION_KEYS = new Set([
  'operationRef', 'pairGroupRef', 'reviewState', 'swapInvariant', 'formulaSpec', 'evidenceRefs',
]);

function exactKeys(value: object, allowed: ReadonlySet<string>, path: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected !== undefined) throw new FaceAuthorityValidationError(`${path} contains unauthorized field: ${unexpected}`);
}

function nonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) throw new FaceAuthorityValidationError(`${path} must be non-empty.`);
}

function unique(values: readonly string[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new FaceAuthorityValidationError(`${path} contains duplicate: ${value}`);
    seen.add(value);
  }
}

export const LATERALITY_CONSUMPTION_POLICY_FR20: LateralityConsumptionPolicyFR20V1 = Object.freeze({
  schemaVersion: 'v1' as const,
  policyVersion: '0.1.0',
  authorityState: 'research_only' as const,
  captureOrientationAuthorityVersion: CAPTURE_ORIENTATION_AUTHORITY_FR19.authorityVersion,
  neutralBindingProfileVersion: FACELAB_NEUTRAL_BINDING_PROFILE_FR14.profileVersion,
  currentCaptureState: 'file_upload_unknown_source_mirror' as const,
  classifications: Object.freeze([
    Object.freeze({
      consumerSlot: 'neutral.face.brow_midline' as const,
      individualSemanticClass: 'side_invariant' as const,
      pairGroupRef: null,
    }),
    Object.freeze({
      consumerSlot: 'neutral.face.nose_region' as const,
      individualSemanticClass: 'side_invariant' as const,
      pairGroupRef: null,
    }),
    Object.freeze({
      consumerSlot: 'neutral.face.left_brow_region' as const,
      individualSemanticClass: 'image_side_only' as const,
      pairGroupRef: 'pair.neutral.brows',
    }),
    Object.freeze({
      consumerSlot: 'neutral.face.right_brow_region' as const,
      individualSemanticClass: 'image_side_only' as const,
      pairGroupRef: 'pair.neutral.brows',
    }),
    Object.freeze({
      consumerSlot: 'neutral.face.left_eye_region' as const,
      individualSemanticClass: 'image_side_only' as const,
      pairGroupRef: 'pair.neutral.eyes',
    }),
    Object.freeze({
      consumerSlot: 'neutral.face.right_eye_region' as const,
      individualSemanticClass: 'image_side_only' as const,
      pairGroupRef: 'pair.neutral.eyes',
    }),
  ]),
  pairGroups: Object.freeze([
    Object.freeze({
      pairGroupRef: 'pair.neutral.brows',
      memberSlots: Object.freeze([
        'neutral.face.left_brow_region',
        'neutral.face.right_brow_region',
      ] as const),
      allowedRequirement: 'pair_swap_invariant' as const,
      requiresReviewedSwapInvariantOperation: true as const,
      anatomicalSideMeaningAllowed: false as const,
    }),
    Object.freeze({
      pairGroupRef: 'pair.neutral.eyes',
      memberSlots: Object.freeze([
        'neutral.face.left_eye_region',
        'neutral.face.right_eye_region',
      ] as const),
      allowedRequirement: 'pair_swap_invariant' as const,
      requiresReviewedSwapInvariantOperation: true as const,
      anatomicalSideMeaningAllowed: false as const,
    }),
  ]),
  anatomicalSideConsumptionAllowed: false as const,
  prohibitedPromotions: Object.freeze([
    'individual_image_side_to_anatomical_side',
    'ordered_pair_to_swap_invariant_pair',
    'pair_member_label_to_anatomical_side',
    'unknown_source_mirror_to_anatomical_side',
  ] as const),
});

export function validateLateralityConsumptionPolicyFR20(
  policy: LateralityConsumptionPolicyFR20V1 = LATERALITY_CONSUMPTION_POLICY_FR20,
): LateralityConsumptionPolicyFR20V1 {
  exactKeys(policy, ALLOWED_POLICY_KEYS, 'FR-20 policy');
  if (policy.schemaVersion !== 'v1') throw new FaceAuthorityValidationError('FR-20 schemaVersion must be v1.');
  nonEmpty(policy.policyVersion, 'fr20.policyVersion');
  if (policy.authorityState !== 'research_only') throw new FaceAuthorityValidationError('FR-20 authorityState must remain research_only.');
  if (policy.captureOrientationAuthorityVersion !== CAPTURE_ORIENTATION_AUTHORITY_FR19.authorityVersion) {
    throw new FaceAuthorityValidationError('FR-20 must pin the merged FR-19 capture orientation authority version.');
  }
  if (policy.neutralBindingProfileVersion !== FACELAB_NEUTRAL_BINDING_PROFILE_FR14.profileVersion) {
    throw new FaceAuthorityValidationError('FR-20 must pin the FR-14 neutral binding profile version.');
  }
  if (policy.currentCaptureState !== 'file_upload_unknown_source_mirror') {
    throw new FaceAuthorityValidationError('FR-20 v0.1 current capture state must remain file_upload_unknown_source_mirror.');
  }
  if (policy.anatomicalSideConsumptionAllowed !== false) {
    throw new FaceAuthorityValidationError('FR-20 anatomical-side semantic consumption must remain blocked.');
  }

  const expectedSlots = FACELAB_NEUTRAL_BINDING_PROFILE_FR14.bindings.map((entry) => entry.consumerSlot);
  unique(policy.classifications.map((entry) => entry.consumerSlot), 'fr20.classificationSlots');
  if (policy.classifications.length !== expectedSlots.length) {
    throw new FaceAuthorityValidationError('FR-20 must classify exactly every FR-14 neutral consumer slot.');
  }
  const classificationBySlot = new Map(policy.classifications.map((entry) => [entry.consumerSlot, entry] as const));
  for (const slot of expectedSlots) {
    if (!classificationBySlot.has(slot)) throw new FaceAuthorityValidationError(`FR-20 missing neutral slot classification: ${slot}`);
  }
  for (const classification of policy.classifications) {
    exactKeys(classification, ALLOWED_CLASSIFICATION_KEYS, `FR-20 classification ${classification.consumerSlot}`);
    if (classification.individualSemanticClass === 'side_invariant' && classification.pairGroupRef !== null) {
      throw new FaceAuthorityValidationError(`FR-20 side-invariant slot cannot carry pairGroupRef: ${classification.consumerSlot}`);
    }
    if (classification.individualSemanticClass === 'image_side_only' && classification.pairGroupRef === null) {
      throw new FaceAuthorityValidationError(`FR-20 image-side-only slot requires pairGroupRef: ${classification.consumerSlot}`);
    }
  }

  unique(policy.pairGroups.map((group) => group.pairGroupRef), 'fr20.pairGroupRefs');
  const pairedSlots: string[] = [];
  for (const group of policy.pairGroups) {
    exactKeys(group, ALLOWED_PAIR_GROUP_KEYS, `FR-20 pair group ${group.pairGroupRef}`);
    nonEmpty(group.pairGroupRef, 'fr20.pairGroupRef');
    if (group.memberSlots.length !== 2 || group.memberSlots[0] === group.memberSlots[1]) {
      throw new FaceAuthorityValidationError(`FR-20 pair group requires two distinct members: ${group.pairGroupRef}`);
    }
    if (group.allowedRequirement !== 'pair_swap_invariant' ||
        group.requiresReviewedSwapInvariantOperation !== true ||
        group.anatomicalSideMeaningAllowed !== false) {
      throw new FaceAuthorityValidationError(`FR-20 pair group contract mismatch: ${group.pairGroupRef}`);
    }
    for (const slot of group.memberSlots) {
      const classification = classificationBySlot.get(slot);
      if (classification === undefined || classification.individualSemanticClass !== 'image_side_only' || classification.pairGroupRef !== group.pairGroupRef) {
        throw new FaceAuthorityValidationError(`FR-20 pair member classification mismatch: ${group.pairGroupRef}/${slot}`);
      }
      pairedSlots.push(slot);
    }
  }
  unique(pairedSlots, 'fr20.pairedSlots');
  const expectedPairedSlots = policy.classifications.filter((entry) => entry.individualSemanticClass === 'image_side_only').map((entry) => entry.consumerSlot).sort();
  if (pairedSlots.sort().join('|') !== expectedPairedSlots.join('|')) {
    throw new FaceAuthorityValidationError('FR-20 every image-side-only slot must belong to exactly one reviewed pair group definition.');
  }

  if (policy.prohibitedPromotions.length !== 4) throw new FaceAuthorityValidationError('FR-20 prohibited promotion set is incomplete.');
  return policy;
}

export function validatePairSwapInvariantOperationFR20(
  operation: PairSwapInvariantOperationV1,
  policy: LateralityConsumptionPolicyFR20V1 = LATERALITY_CONSUMPTION_POLICY_FR20,
): PairSwapInvariantOperationV1 {
  validateLateralityConsumptionPolicyFR20(policy);
  exactKeys(operation, ALLOWED_OPERATION_KEYS, `FR-20 pair operation ${operation.operationRef}`);
  nonEmpty(operation.operationRef, 'fr20.operationRef');
  nonEmpty(operation.formulaSpec, `fr20.${operation.operationRef}.formulaSpec`);
  const group = policy.pairGroups.find((entry) => entry.pairGroupRef === operation.pairGroupRef);
  if (group === undefined) throw new FaceAuthorityValidationError(`FR-20 pair operation references unknown group: ${operation.pairGroupRef}`);
  if (operation.swapInvariant !== true) throw new FaceAuthorityValidationError(`FR-20 pair operation must be explicitly swap-invariant: ${operation.operationRef}`);
  if (operation.evidenceRefs.length === 0) throw new FaceAuthorityValidationError(`FR-20 pair operation requires evidenceRefs: ${operation.operationRef}`);
  unique(operation.evidenceRefs, `fr20.${operation.operationRef}.evidenceRefs`);
  return operation;
}

export function resolveLateralityConsumptionFR20(input: {
  readonly consumerSlots: readonly NeutralAnchorConsumerSlotV1[];
  readonly requirement: LateralitySemanticRequirementV1;
  readonly pairOperation?: PairSwapInvariantOperationV1;
  readonly policy?: LateralityConsumptionPolicyFR20V1;
}): LateralityConsumptionDecisionV1 {
  const policy = input.policy ?? LATERALITY_CONSUMPTION_POLICY_FR20;
  validateLateralityConsumptionPolicyFR20(policy);
  unique(input.consumerSlots, 'fr20.request.consumerSlots');

  if (input.requirement === 'anatomical_side') {
    return Object.freeze({ allowed: false, requirement: input.requirement, reason: 'anatomical_side_blocked' as const });
  }

  const classificationBySlot = new Map(policy.classifications.map((entry) => [entry.consumerSlot, entry] as const));
  if (input.consumerSlots.some((slot) => !classificationBySlot.has(slot))) {
    throw new FaceAuthorityValidationError('FR-20 request references a consumer slot not classified by the policy.');
  }

  if (input.requirement === 'side_invariant') {
    const invalid = input.consumerSlots.find((slot) => classificationBySlot.get(slot)?.individualSemanticClass !== 'side_invariant');
    if (invalid !== undefined) {
      return Object.freeze({ allowed: false, requirement: input.requirement, reason: 'individual_image_side_not_semantic' as const });
    }
    return Object.freeze({ allowed: true, requirement: input.requirement, reason: 'side_invariant_allowed' as const });
  }

  if (input.pairOperation === undefined) {
    return Object.freeze({ allowed: false, requirement: input.requirement, reason: 'pair_operation_required' as const });
  }
  const operation = input.pairOperation;
  if (operation.swapInvariant !== true) {
    return Object.freeze({ allowed: false, requirement: input.requirement, reason: 'pair_operation_not_swap_invariant' as const });
  }
  const group = policy.pairGroups.find((entry) => entry.pairGroupRef === operation.pairGroupRef);
  if (group === undefined) return Object.freeze({ allowed: false, requirement: input.requirement, reason: 'pair_group_mismatch' as const });
  const requested = [...input.consumerSlots].sort().join('|');
  const expected = [...group.memberSlots].sort().join('|');
  if (requested !== expected) return Object.freeze({ allowed: false, requirement: input.requirement, reason: 'pair_group_mismatch' as const });
  if (operation.reviewState !== 'reviewed') {
    return Object.freeze({ allowed: false, requirement: input.requirement, reason: 'pair_operation_not_reviewed' as const });
  }
  validatePairSwapInvariantOperationFR20(operation, policy);
  return Object.freeze({ allowed: true, requirement: input.requirement, reason: 'reviewed_pair_swap_invariant_allowed' as const });
}
