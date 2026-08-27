import {
  FACELAB_COMPATIBILITY_REPORT_V0,
  type FaceLabCompatibilityReport,
} from './facelab-compat.js';
import {
  FACE_SEMANTIC_ANCHOR_REGISTRY_FR13,
} from './semantic-anchor-authority-fr13.js';
import {
  getTraditionalFaceAnchorFR13,
} from './semantic-anchor-registry-fr13.js';
import { FaceAuthorityValidationError } from './validation.js';

export type NeutralAnchorConsumerSlotV1 =
  | 'neutral.face.brow_midline'
  | 'neutral.face.nose_region'
  | 'neutral.face.left_brow_region'
  | 'neutral.face.right_brow_region'
  | 'neutral.face.left_eye_region'
  | 'neutral.face.right_eye_region';

export type NeutralProviderCapabilityV1 =
  | 'neutral_pose_quality'
  | 'neutral_brow_regions'
  | 'neutral_brow_midline_derivation'
  | 'neutral_eye_regions'
  | 'neutral_nose_region';

export interface NeutralAnchorBindingRequirementV1 {
  readonly anchorRef: string;
  readonly consumerSlot: NeutralAnchorConsumerSlotV1;
  readonly requiredCapabilities: readonly NeutralProviderCapabilityV1[];
  readonly outputClass: 'source_neutral_geometry';
}

export interface NeutralProviderBindingProfileV1 {
  readonly schemaVersion: 'v1';
  readonly profileVersion: string;
  readonly providerKey: 'visually_facelab';
  readonly semanticAnchorRegistryRef: string;
  readonly consumerContractVersion: string;
  readonly providerContractVersion: string | null;
  readonly activationState: 'blocked' | 'candidate';
  readonly bindings: readonly NeutralAnchorBindingRequirementV1[];
}

export interface NeutralProviderBindingReadinessV1 {
  readonly ready: boolean;
  readonly providerKey: NeutralProviderBindingProfileV1['providerKey'];
  readonly profileVersion: string;
  readonly compatibilityState: FaceLabCompatibilityReport['state'];
  readonly missingCapabilities: readonly NeutralProviderCapabilityV1[];
  readonly blockers: readonly string[];
}

const REQUIRED_ANCHORS = Object.freeze([
  'brow_midline',
  'nose',
  'left_brow',
  'right_brow',
  'left_eye',
  'right_eye',
] as const);

export const NEUTRAL_ANCHOR_BINDING_REQUIREMENTS_FR14: readonly NeutralAnchorBindingRequirementV1[] = Object.freeze([
  {
    anchorRef: 'brow_midline',
    consumerSlot: 'neutral.face.brow_midline',
    requiredCapabilities: ['neutral_pose_quality', 'neutral_brow_regions', 'neutral_brow_midline_derivation'],
    outputClass: 'source_neutral_geometry',
  },
  {
    anchorRef: 'nose',
    consumerSlot: 'neutral.face.nose_region',
    requiredCapabilities: ['neutral_pose_quality', 'neutral_nose_region'],
    outputClass: 'source_neutral_geometry',
  },
  {
    anchorRef: 'left_brow',
    consumerSlot: 'neutral.face.left_brow_region',
    requiredCapabilities: ['neutral_pose_quality', 'neutral_brow_regions'],
    outputClass: 'source_neutral_geometry',
  },
  {
    anchorRef: 'right_brow',
    consumerSlot: 'neutral.face.right_brow_region',
    requiredCapabilities: ['neutral_pose_quality', 'neutral_brow_regions'],
    outputClass: 'source_neutral_geometry',
  },
  {
    anchorRef: 'left_eye',
    consumerSlot: 'neutral.face.left_eye_region',
    requiredCapabilities: ['neutral_pose_quality', 'neutral_eye_regions'],
    outputClass: 'source_neutral_geometry',
  },
  {
    anchorRef: 'right_eye',
    consumerSlot: 'neutral.face.right_eye_region',
    requiredCapabilities: ['neutral_pose_quality', 'neutral_eye_regions'],
    outputClass: 'source_neutral_geometry',
  },
]);

export const FACELAB_NEUTRAL_BINDING_PROFILE_FR14: NeutralProviderBindingProfileV1 = Object.freeze({
  schemaVersion: 'v1' as const,
  profileVersion: '0.1.0',
  providerKey: 'visually_facelab' as const,
  semanticAnchorRegistryRef: `${FACE_SEMANTIC_ANCHOR_REGISTRY_FR13.registryId}@${FACE_SEMANTIC_ANCHOR_REGISTRY_FR13.version}`,
  consumerContractVersion: 'myeongha-neutral-anchor-consumer-v1',
  providerContractVersion: null,
  activationState: 'blocked' as const,
  bindings: NEUTRAL_ANCHOR_BINDING_REQUIREMENTS_FR14,
});

const ALLOWED_BINDING_KEYS = new Set([
  'anchorRef',
  'consumerSlot',
  'requiredCapabilities',
  'outputClass',
]);

function nonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) {
    throw new FaceAuthorityValidationError(`${path} must be non-empty.`);
  }
}

function unique(values: readonly string[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new FaceAuthorityValidationError(`${path} contains duplicate: ${value}`);
    seen.add(value);
  }
}

export function validateNeutralProviderBindingProfileFR14(
  profile: NeutralProviderBindingProfileV1,
): NeutralProviderBindingProfileV1 {
  if (profile.schemaVersion !== 'v1') throw new FaceAuthorityValidationError('FR-14 binding profile schemaVersion must be v1.');
  nonEmpty(profile.profileVersion, 'fr14.profileVersion');
  nonEmpty(profile.consumerContractVersion, 'fr14.consumerContractVersion');
  const expectedAnchorRegistryRef = `${FACE_SEMANTIC_ANCHOR_REGISTRY_FR13.registryId}@${FACE_SEMANTIC_ANCHOR_REGISTRY_FR13.version}`;
  if (profile.semanticAnchorRegistryRef !== expectedAnchorRegistryRef) {
    throw new FaceAuthorityValidationError('FR-14 binding profile must pin the exact FR-13 semantic anchor registry.');
  }
  if (profile.activationState === 'candidate') {
    if (profile.providerContractVersion === null) {
      throw new FaceAuthorityValidationError('FR-14 candidate binding profile requires providerContractVersion.');
    }
    nonEmpty(profile.providerContractVersion, 'fr14.providerContractVersion');
  }
  if (profile.bindings.length !== REQUIRED_ANCHORS.length) {
    throw new FaceAuthorityValidationError('FR-14 binding profile must contain exactly the required neutral anchors.');
  }

  unique(profile.bindings.map((binding) => binding.anchorRef), 'fr14.anchorRefs');
  unique(profile.bindings.map((binding) => binding.consumerSlot), 'fr14.consumerSlots');
  const actualRefs = new Set(profile.bindings.map((binding) => binding.anchorRef));
  for (const required of REQUIRED_ANCHORS) {
    if (!actualRefs.has(required)) throw new FaceAuthorityValidationError(`FR-14 missing required neutral anchor: ${required}`);
  }

  for (const binding of profile.bindings) {
    const unexpected = Object.keys(binding).find((key) => !ALLOWED_BINDING_KEYS.has(key));
    if (unexpected !== undefined) {
      throw new FaceAuthorityValidationError(`FR-14 binding contains unauthorized provider-specific field: ${unexpected}`);
    }
    const anchor = getTraditionalFaceAnchorFR13(binding.anchorRef);
    if (anchor.authorityClass !== 'neutral_observation') {
      throw new FaceAuthorityValidationError(`FR-14 may bind only neutral_observation anchors: ${binding.anchorRef}`);
    }
    if (anchor.providerBindingStatus !== 'provider_contract_required') {
      throw new FaceAuthorityValidationError(`FR-14 anchor is not provider-contract eligible: ${binding.anchorRef}`);
    }
    if (binding.outputClass !== 'source_neutral_geometry') {
      throw new FaceAuthorityValidationError(`FR-14 outputClass must remain source_neutral_geometry: ${binding.anchorRef}`);
    }
    if (binding.requiredCapabilities.length === 0) {
      throw new FaceAuthorityValidationError(`FR-14 binding requires capabilities: ${binding.anchorRef}`);
    }
    unique(binding.requiredCapabilities, `fr14.${binding.anchorRef}.requiredCapabilities`);
  }

  return profile;
}

export function assessNeutralProviderBindingReadinessFR14(input?: {
  readonly profile?: NeutralProviderBindingProfileV1;
  readonly compatibilityReport?: FaceLabCompatibilityReport;
  readonly availableCapabilities?: readonly NeutralProviderCapabilityV1[];
}): NeutralProviderBindingReadinessV1 {
  const profile = input?.profile ?? FACELAB_NEUTRAL_BINDING_PROFILE_FR14;
  const report = input?.compatibilityReport ?? FACELAB_COMPATIBILITY_REPORT_V0;
  validateNeutralProviderBindingProfileFR14(profile);
  const available = new Set(input?.availableCapabilities ?? []);
  const required = [...new Set(profile.bindings.flatMap((binding) => binding.requiredCapabilities))];
  const missingCapabilities = required.filter((capability) => !available.has(capability));
  const blockers: string[] = [];

  if (profile.activationState !== 'candidate') blockers.push(`binding profile activationState=${profile.activationState}`);
  if (profile.providerContractVersion === null) blockers.push('provider neutral contract version is not pinned');
  if (report.state !== 'production_neutral_contract_available') {
    blockers.push(`FaceLab compatibility state=${report.state}`);
  }
  if (missingCapabilities.length > 0) {
    blockers.push(`missing neutral anchor capabilities: ${missingCapabilities.join(', ')}`);
  }

  return Object.freeze({
    ready: blockers.length === 0,
    providerKey: profile.providerKey,
    profileVersion: profile.profileVersion,
    compatibilityState: report.state,
    missingCapabilities: Object.freeze(missingCapabilities),
    blockers: Object.freeze(blockers),
  });
}
