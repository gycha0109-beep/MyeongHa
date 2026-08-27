import { describe, expect, it } from 'vitest';
import {
  FACELAB_NEUTRAL_BINDING_PROFILE_FR14,
  NEUTRAL_ANCHOR_BINDING_REQUIREMENTS_FR14,
  assessNeutralProviderBindingReadinessFR14,
  validateNeutralProviderBindingProfileFR14,
  type FaceLabCompatibilityReport,
  type NeutralAnchorBindingRequirementV1,
  type NeutralProviderBindingProfileV1,
  type NeutralProviderCapabilityV1,
} from '../packages/face-reading/src/index.js';

const ALL_CAPABILITIES: readonly NeutralProviderCapabilityV1[] = [
  'neutral_pose_quality',
  'neutral_brow_regions',
  'neutral_brow_midline_derivation',
  'neutral_eye_regions',
  'neutral_nose_region',
];

const READY_REPORT: FaceLabCompatibilityReport = {
  state: 'production_neutral_contract_available',
  reusableInvariants: [],
  missingProductionCapabilities: [],
  forbiddenCouplings: [],
};

function futureCandidateProfile(): NeutralProviderBindingProfileV1 {
  return {
    ...FACELAB_NEUTRAL_BINDING_PROFILE_FR14,
    profileVersion: '0.2.0-test',
    providerContractVersion: 'facelab-neutral-contract-v1',
    activationState: 'candidate',
  };
}

describe('FR-14 neutral provider bindings', () => {
  it('validates the current versioned consumer binding profile', () => {
    expect(() => validateNeutralProviderBindingProfileFR14(FACELAB_NEUTRAL_BINDING_PROFILE_FR14)).not.toThrow();
    expect(NEUTRAL_ANCHOR_BINDING_REQUIREMENTS_FR14).toHaveLength(6);
  });

  it('keeps the real current Visually FaceLab bridge blocked', () => {
    const readiness = assessNeutralProviderBindingReadinessFR14({
      availableCapabilities: ALL_CAPABILITIES,
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.compatibilityState).toBe('evaluation_contract_only');
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        'binding profile activationState=blocked',
        'provider neutral contract version is not pinned',
        'FaceLab compatibility state=evaluation_contract_only',
      ]),
    );
  });

  it('opens only when a production-neutral provider contract and all capabilities exist', () => {
    const readiness = assessNeutralProviderBindingReadinessFR14({
      profile: futureCandidateProfile(),
      compatibilityReport: READY_REPORT,
      availableCapabilities: ALL_CAPABILITIES,
    });
    expect(readiness.ready).toBe(true);
    expect(readiness.missingCapabilities).toEqual([]);
    expect(readiness.blockers).toEqual([]);
  });

  it('remains blocked if even one neutral capability is missing', () => {
    const readiness = assessNeutralProviderBindingReadinessFR14({
      profile: futureCandidateProfile(),
      compatibilityReport: READY_REPORT,
      availableCapabilities: ALL_CAPABILITIES.filter(
        (capability) => capability !== 'neutral_eye_regions',
      ),
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.missingCapabilities).toContain('neutral_eye_regions');
  });

  it('binds only neutral observation anchors', () => {
    for (const binding of FACELAB_NEUTRAL_BINDING_PROFILE_FR14.bindings) {
      expect([
        'brow_midline',
        'nose',
        'left_brow',
        'right_brow',
        'left_eye',
        'right_eye',
      ]).toContain(binding.anchorRef);
    }
  });

  it('rejects a traditional anchor such as 山根 from the neutral provider profile', () => {
    const forgedBinding: NeutralAnchorBindingRequirementV1 = {
      ...FACELAB_NEUTRAL_BINDING_PROFILE_FR14.bindings[0]!,
      anchorRef: 'shangen',
    };
    const forged: NeutralProviderBindingProfileV1 = {
      ...FACELAB_NEUTRAL_BINDING_PROFILE_FR14,
      bindings: [
        forgedBinding,
        ...FACELAB_NEUTRAL_BINDING_PROFILE_FR14.bindings.slice(1),
      ],
    };
    expect(() => validateNeutralProviderBindingProfileFR14(forged)).toThrow(
      /neutral_observation/u,
    );
  });

  it('rejects provider-specific landmark/index fields smuggled into a binding', () => {
    const forgedBinding = {
      ...FACELAB_NEUTRAL_BINDING_PROFILE_FR14.bindings[0]!,
      providerLandmarkIndices: [1, 2, 3],
    } as NeutralAnchorBindingRequirementV1;
    const forged: NeutralProviderBindingProfileV1 = {
      ...FACELAB_NEUTRAL_BINDING_PROFILE_FR14,
      bindings: [
        forgedBinding,
        ...FACELAB_NEUTRAL_BINDING_PROFILE_FR14.bindings.slice(1),
      ],
    };
    expect(() => validateNeutralProviderBindingProfileFR14(forged)).toThrow(
      /unauthorized provider-specific field/u,
    );
  });

  it('requires one unique consumer slot per neutral anchor', () => {
    const duplicateSlot: NeutralProviderBindingProfileV1 = {
      ...FACELAB_NEUTRAL_BINDING_PROFILE_FR14,
      bindings: FACELAB_NEUTRAL_BINDING_PROFILE_FR14.bindings.map((binding, index) =>
        index === 1
          ? { ...binding, consumerSlot: FACELAB_NEUTRAL_BINDING_PROFILE_FR14.bindings[0]!.consumerSlot }
          : binding,
      ),
    };
    expect(() => validateNeutralProviderBindingProfileFR14(duplicateSlot)).toThrow(
      /consumerSlots contains duplicate/u,
    );
  });

  it('does not allow candidate activation without a pinned provider contract version', () => {
    const forged: NeutralProviderBindingProfileV1 = {
      ...FACELAB_NEUTRAL_BINDING_PROFILE_FR14,
      activationState: 'candidate',
      providerContractVersion: null,
    };
    expect(() => validateNeutralProviderBindingProfileFR14(forged)).toThrow(
      /requires providerContractVersion/u,
    );
  });
});
