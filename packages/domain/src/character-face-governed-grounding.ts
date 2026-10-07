import type {
  CharacterFaceGovernedInterpretationHandoffV1,
  CharacterFaceGovernedInterpretationUnitV1,
} from './character-face-governed-interpretation.js';

export const CHARACTER_FACE_GOVERNED_GROUNDING_SCHEMA_VERSION_V1 =
  'face-governed-character-grounding-v1' as const;
export const CHARACTER_FACE_GOVERNED_GROUNDING_REF_SCHEMA_VERSION_V1 =
  'face-governed-character-grounding-ref-v1' as const;
export const CHARACTER_FACE_GOVERNED_GROUNDING_PROJECTION_VERSION_V1 =
  'face-governed-character-grounding-projection-v1' as const;
export const CHARACTER_FACE_GOVERNED_REALIZATION_POLICY_REGISTRY_VERSION_V1 =
  'face-governed-character-realization-policy-v1' as const;
export const CHARACTER_FACE_GOVERNED_REALIZATION_POLICY_V1 =
  'protected_meaning_exact_v1' as const;
export const CHARACTER_FACE_GOVERNED_MODE_V1 =
  'governed_traditional_interpretation' as const;

export interface CharacterFaceGovernedGroundingUnitV1
  extends CharacterFaceGovernedInterpretationUnitV1 {
  readonly realizationPolicyRef:
    typeof CHARACTER_FACE_GOVERNED_REALIZATION_POLICY_V1;
}

export interface CharacterFaceGovernedGroundingBundleV1 {
  readonly schemaVersion: typeof CHARACTER_FACE_GOVERNED_GROUNDING_SCHEMA_VERSION_V1;
  readonly projectionVersion: typeof CHARACTER_FACE_GOVERNED_GROUNDING_PROJECTION_VERSION_V1;
  readonly realizationPolicyRegistryVersion:
    typeof CHARACTER_FACE_GOVERNED_REALIZATION_POLICY_REGISTRY_VERSION_V1;
  readonly mode: typeof CHARACTER_FACE_GOVERNED_MODE_V1;
  readonly topicKey: string;
  readonly sourceContractVersion: string;
  readonly sourceAuthorityRef: string;
  readonly sourceResultHash: string;
  readonly authorizationReceiptRef: string;
  readonly handoffHash: string;
  readonly faceEngineVersion: string;
  readonly faceReadingRef?: string;
  readonly methodologyPackRefs: readonly string[];
  readonly bindingGroupRefs: readonly string[];
  readonly units: readonly CharacterFaceGovernedGroundingUnitV1[];
  readonly unavailableSections: readonly string[];
  readonly prohibitedInferences: readonly string[];
  readonly provenanceRefs: readonly string[];
  readonly bundleHash: string;
}

export interface CharacterFaceGovernedGroundingRefV1 {
  readonly schemaVersion: typeof CHARACTER_FACE_GOVERNED_GROUNDING_REF_SCHEMA_VERSION_V1;
  readonly projectionVersion: typeof CHARACTER_FACE_GOVERNED_GROUNDING_PROJECTION_VERSION_V1;
  readonly mode: typeof CHARACTER_FACE_GOVERNED_MODE_V1;
  readonly topicKey: string;
  readonly sourceContractVersion: string;
  readonly sourceAuthorityRef: string;
  readonly sourceResultHash: string;
  readonly authorizationReceiptRef: string;
  readonly handoffHash: string;
  readonly faceEngineVersion: string;
  readonly faceReadingRef?: string;
  readonly methodologyPackRefs: readonly string[];
  readonly bundleHash: string;
}

export interface CharacterFaceGovernedGroundingAdmissionV1 {
  readonly handoff: CharacterFaceGovernedInterpretationHandoffV1;
  readonly grounding: CharacterFaceGovernedGroundingBundleV1;
  readonly groundingRef: CharacterFaceGovernedGroundingRefV1;
}
