import { describe, expect, it } from 'vitest';
import {
  FACE_OBSERVATION_PROVIDER_CONTRACT_FR22,
  FACE_OBSERVATION_PROVIDER_IMPLEMENTATIONS_FR22,
  PROVIDER_RELEASE_ATTESTATION_FR18,
  assessFaceObservationProviderActivationFR22,
  validateFaceObservationProviderContractFR22,
  validateFaceObservationProviderImplementationFR22,
  type FaceObservationProviderImplementationAttestationFR22V1,
} from '../packages/face-reading/src/index.js';

const CONTRACT_REF = 'contract.face.observation_provider.fr22@0.1.0';
const CAPABILITIES = [
  'neutral_pose_quality',
  'neutral_brow_regions',
  'neutral_brow_midline_derivation',
  'neutral_eye_regions',
  'neutral_nose_region',
] as const;

function candidateImplementation(): FaceObservationProviderImplementationAttestationFR22V1 {
  return {
    schemaVersion: 'fr22-implementation-v1',
    implementationRef: 'provider.impl.facelab.test.v1',
    providerKey: 'visually_facelab',
    consumerContractRef: CONTRACT_REF,
    providerContractVersion: 'facelab-neutral-v1',
    adapterSource: {
      repository: 'example/facelab-adapter',
      repositoryCommit: '1111111111111111111111111111111111111111',
      sourcePath: 'src/adapter.ts',
      sourceBlobSha: '2222222222222222222222222222222222222222',
    },
    runtimeArtifact: {
      packageName: '@mediapipe/tasks-vision',
      packageVersion: '0.10.35',
      artifactIdentityEvidenceRef: PROVIDER_RELEASE_ATTESTATION_FR18.consumerArtifactLock.evidenceRef,
      runtimeArtifactDigest: null,
    },
    supportedCapabilities: CAPABILITIES,
    slots: [
      {
        consumerSlot: 'neutral.face.brow_midline',
        outputGeometryKind: 'point',
        sourceMode: 'reviewed_neutral_derivation',
        sourceRef: 'derivation.neutral.brow_midline.pending',
      },
      {
        consumerSlot: 'neutral.face.nose_region',
        outputGeometryKind: 'region',
        sourceMode: 'reviewed_neutral_derivation',
        sourceRef: 'derivation.neutral.nose_region.pending',
      },
      {
        consumerSlot: 'neutral.face.left_brow_region',
        outputGeometryKind: 'curve',
        sourceMode: 'reviewed_neutral_derivation',
        sourceRef: 'derivation.neutral.left_brow_curve.pending',
      },
      {
        consumerSlot: 'neutral.face.right_brow_region',
        outputGeometryKind: 'curve',
        sourceMode: 'reviewed_neutral_derivation',
        sourceRef: 'derivation.neutral.right_brow_curve.pending',
      },
      {
        consumerSlot: 'neutral.face.left_eye_region',
        outputGeometryKind: 'region',
        sourceMode: 'direct_provider_topology',
        sourceRef: 'FACE_LANDMARKS_LEFT_EYE',
      },
      {
        consumerSlot: 'neutral.face.right_eye_region',
        outputGeometryKind: 'region',
        sourceMode: 'direct_provider_topology',
        sourceRef: 'FACE_LANDMARKS_RIGHT_EYE',
      },
    ],
    reviewState: 'candidate',
    conformanceEvidenceRefs: [],
    semanticAuthorityClaimed: false,
    anatomicalLateralityClaimed: false,
  };
}

function unimplementedSlots(
  implementation: FaceObservationProviderImplementationAttestationFR22V1,
): FaceObservationProviderImplementationAttestationFR22V1['slots'] {
  return implementation.slots.map((slot) => ({
    ...slot,
    sourceMode: 'unimplemented' as const,
    sourceRef: null,
  }));
}

describe('FR-22 MyeongHa-owned Face Observation Provider Contract', () => {
  it('validates the consumer contract while keeping the implementation registry and activation closed', () => {
    expect(validateFaceObservationProviderContractFR22()).toBe(FACE_OBSERVATION_PROVIDER_CONTRACT_FR22);
    expect(FACE_OBSERVATION_PROVIDER_IMPLEMENTATIONS_FR22).toHaveLength(0);
    expect(FACE_OBSERVATION_PROVIDER_CONTRACT_FR22.implementationRegistryState).toBe('no_verified_implementation');
    expect(FACE_OBSERVATION_PROVIDER_CONTRACT_FR22.providerActivationAllowed).toBe(false);
    const readiness = assessFaceObservationProviderActivationFR22();
    expect(readiness.contractReady).toBe(true);
    expect(readiness.implementationReady).toBe(false);
    expect(readiness.providerActivationAllowed).toBe(false);
    expect(readiness.thirdPartySourceEquivalenceRequiredForSemanticAuthority).toBe(false);
    expect(readiness.blockers.join(' ')).toMatch(/no verified implementation/u);
    expect(readiness.blockers.join(' ')).toMatch(/explicitly keeps provider activation disabled/u);
  });

  it('pins FR-14 neutral slots, FR-17 derivation registry, and FR-19/20 coordinate/laterality authorities', () => {
    const contract = FACE_OBSERVATION_PROVIDER_CONTRACT_FR22;
    expect(contract.neutralObservationContractVersion).toBe('myeongha-neutral-observation-v1');
    expect(contract.bindingProfileVersion).toBe('0.1.0');
    expect(contract.derivationRegistryRef).toMatch(/^registry\.face\.neutral_derivations\.fr17@/u);
    expect(contract.captureOrientationAuthorityVersion).toBeTruthy();
    expect(contract.lateralityPolicyVersion).toBeTruthy();
    expect(contract.slots.map((slot) => slot.consumerSlot).sort()).toEqual([
      'neutral.face.brow_midline',
      'neutral.face.left_brow_region',
      'neutral.face.left_eye_region',
      'neutral.face.nose_region',
      'neutral.face.right_brow_region',
      'neutral.face.right_eye_region',
    ]);
  });

  it('validates a bounded candidate without mistaking caller-supplied attestation for registry authority', () => {
    const candidate = candidateImplementation();
    expect(validateFaceObservationProviderImplementationFR22(candidate)).toBe(candidate);
    const readiness = assessFaceObservationProviderActivationFR22({ implementation: candidate });
    expect(readiness.implementationReady).toBe(false);
    expect(readiness.providerActivationAllowed).toBe(false);
    expect(readiness.blockers.join(' ')).toMatch(/reviewState=candidate/u);
    expect(readiness.blockers.join(' ')).toMatch(/runtime artifact digest/u);
    expect(readiness.blockers.join(' ')).toMatch(/not registered in the FR-22 verified implementation registry/u);
    expect(readiness.blockers.join(' ')).toMatch(/compatibility state=evaluation_contract_only/u);
    expect(readiness.blockers.join(' ')).toMatch(/provider-side neutral contract version is not pinned/u);
    expect(readiness.blockers.join(' ')).toMatch(/direct topology mapping remains research-only/u);
    expect(readiness.blockers.join(' ')).toMatch(/derivation is not executable/u);
    expect(readiness.blockers.join(' ')).toMatch(/explicitly keeps provider activation disabled/u);
  });

  it('rejects semantic, provider-index, and third-party provenance authority smuggling', () => {
    expect(() => validateFaceObservationProviderContractFR22({
      ...FACE_OBSERVATION_PROVIDER_CONTRACT_FR22,
      authorityBoundary: {
        ...FACE_OBSERVATION_PROVIDER_CONTRACT_FR22.authorityBoundary,
        traditionalSemanticOutputAllowed: true,
      },
    } as never)).toThrow(/must not grant semantic\/provider-side shortcut authority/u);

    expect(() => validateFaceObservationProviderContractFR22({
      ...FACE_OBSERVATION_PROVIDER_CONTRACT_FR22,
      authorityBoundary: {
        ...FACE_OBSERVATION_PROVIDER_CONTRACT_FR22.authorityBoundary,
        thirdPartySourceEquivalenceIsSemanticAuthority: true,
      },
    } as never)).toThrow(/must not grant semantic\/provider-side shortcut authority/u);

    expect(() => validateFaceObservationProviderContractFR22({
      ...FACE_OBSERVATION_PROVIDER_CONTRACT_FR22,
      slots: FACE_OBSERVATION_PROVIDER_CONTRACT_FR22.slots.map((slot, index) =>
        index === 0 ? { ...slot, landmarkIndex: 1 } : slot),
    } as never)).toThrow(/contains unauthorized field: landmarkIndex/u);
  });

  it('rejects opening activation in the zero-implementation FR-22 v0.1 snapshot', () => {
    expect(() => validateFaceObservationProviderContractFR22({
      ...FACE_OBSERVATION_PROVIDER_CONTRACT_FR22,
      providerActivationAllowed: true,
    } as never)).toThrow(/must remain unactivated with zero verified provider implementations/u);
  });

  it('requires the exact FR-18 consumer artifact identity evidence', () => {
    const candidate = candidateImplementation();
    expect(() => validateFaceObservationProviderImplementationFR22({
      ...candidate,
      runtimeArtifact: {
        ...candidate.runtimeArtifact,
        artifactIdentityEvidenceRef: 'evidence.fr18.fake',
      },
    } as never)).toThrow(/must pin the exact FR-18 consumer artifact identity evidence/u);
  });

  it('requires every implemented slot to declare its FR-14 capability prerequisites', () => {
    const candidate = candidateImplementation();
    expect(() => validateFaceObservationProviderImplementationFR22({
      ...candidate,
      supportedCapabilities: candidate.supportedCapabilities.filter((capability) => capability !== 'neutral_eye_regions'),
    })).toThrow(/implemented slot is missing required capability neutral_eye_regions/u);
  });

  it('allows direct provider topology only for FR-16 closed-cycle candidates', () => {
    const candidate = candidateImplementation();
    expect(() => validateFaceObservationProviderImplementationFR22({
      ...candidate,
      slots: candidate.slots.map((slot) => slot.consumerSlot === 'neutral.face.nose_region'
        ? { ...slot, sourceMode: 'direct_provider_topology' as const, sourceRef: 'FACE_LANDMARKS_NOSE' }
        : slot),
    })).toThrow(/direct provider topology is not an FR-16 closed-cycle candidate/u);
  });

  it('requires derivation refs to match the exact FR-17 consumer slot', () => {
    const candidate = candidateImplementation();
    expect(() => validateFaceObservationProviderImplementationFR22({
      ...candidate,
      slots: candidate.slots.map((slot) => slot.consumerSlot === 'neutral.face.nose_region'
        ? { ...slot, sourceRef: 'derivation.neutral.left_brow_curve.pending' }
        : slot),
    })).toThrow(/derivation sourceRef does not match the FR-17 slot registry/u);
  });

  it('rejects unimplemented slots carrying hidden source mappings', () => {
    const candidate = candidateImplementation();
    expect(() => validateFaceObservationProviderImplementationFR22({
      ...candidate,
      slots: candidate.slots.map((slot) => slot.consumerSlot === 'neutral.face.nose_region'
        ? { ...slot, sourceMode: 'unimplemented' as const }
        : slot),
    } as never)).toThrow(/unimplemented slot cannot carry sourceRef/u);
  });

  it('does not allow lockfile identity to substitute for independently recorded runtime artifact evidence', () => {
    const candidate = candidateImplementation();
    expect(() => validateFaceObservationProviderImplementationFR22({
      ...candidate,
      reviewState: 'verified',
      conformanceEvidenceRefs: ['evidence.conformance.fixture'],
      slots: unimplementedSlots(candidate),
    })).toThrow(/verified implementation requires an independently recorded runtime artifact digest/u);
  });

  it('rejects verified implementations without conformance evidence', () => {
    const candidate = candidateImplementation();
    expect(() => validateFaceObservationProviderImplementationFR22({
      ...candidate,
      runtimeArtifact: {
        ...candidate.runtimeArtifact,
        runtimeArtifactDigest: `sha256:${'a'.repeat(64)}`,
      },
      reviewState: 'verified',
      conformanceEvidenceRefs: [],
      slots: unimplementedSlots(candidate),
    })).toThrow(/verified implementation requires conformanceEvidenceRefs/u);
  });

  it('rejects verified implementations with any required slot unimplemented', () => {
    const candidate = candidateImplementation();
    expect(() => validateFaceObservationProviderImplementationFR22({
      ...candidate,
      runtimeArtifact: {
        ...candidate.runtimeArtifact,
        runtimeArtifactDigest: `sha256:${'b'.repeat(64)}`,
      },
      reviewState: 'verified',
      conformanceEvidenceRefs: ['evidence.conformance.fixture'],
      slots: unimplementedSlots(candidate),
    })).toThrow(/verified implementation cannot leave required neutral slots unimplemented/u);
  });

  it('rejects verified promotion of current FR-17 pending derivations', () => {
    const candidate = candidateImplementation();
    expect(() => validateFaceObservationProviderImplementationFR22({
      ...candidate,
      runtimeArtifact: {
        ...candidate.runtimeArtifact,
        runtimeArtifactDigest: `sha256:${'c'.repeat(64)}`,
      },
      reviewState: 'verified',
      conformanceEvidenceRefs: ['evidence.conformance.fixture'],
      slots: candidate.slots.map((slot) => slot.consumerSlot.includes('eye_region')
        ? { ...slot, sourceMode: 'unimplemented' as const, sourceRef: null }
        : slot),
    })).toThrow(/verified implementation requires an executable FR-17 derivation/u);
  });

  it('rejects verified promotion of FR-16 research-only direct eye topology', () => {
    const candidate = candidateImplementation();
    expect(() => validateFaceObservationProviderImplementationFR22({
      ...candidate,
      runtimeArtifact: {
        ...candidate.runtimeArtifact,
        runtimeArtifactDigest: `sha256:${'d'.repeat(64)}`,
      },
      reviewState: 'verified',
      conformanceEvidenceRefs: ['evidence.conformance.fixture'],
      slots: candidate.slots.map((slot) => slot.consumerSlot.includes('eye_region')
        ? slot
        : { ...slot, sourceMode: 'unimplemented' as const, sourceRef: null }),
    })).toThrow(/cannot promote FR-16 research-only direct topology/u);
  });

  it('rejects provider implementations claiming traditional semantic or anatomical-side authority', () => {
    const candidate = candidateImplementation();
    expect(() => validateFaceObservationProviderImplementationFR22({
      ...candidate,
      semanticAuthorityClaimed: true,
    } as never)).toThrow(/cannot claim traditional semantic or anatomical-side authority/u);
    expect(() => validateFaceObservationProviderImplementationFR22({
      ...candidate,
      anatomicalLateralityClaimed: true,
    } as never)).toThrow(/cannot claim traditional semantic or anatomical-side authority/u);
  });

  it('rejects hidden meaning fields, malformed runtime digests, and unknown source modes', () => {
    const candidate = candidateImplementation();
    expect(() => validateFaceObservationProviderImplementationFR22({
      ...candidate,
      wealthPalaceMeaning: 'prominent',
    } as never)).toThrow(/contains unauthorized field: wealthPalaceMeaning/u);

    expect(() => validateFaceObservationProviderImplementationFR22({
      ...candidate,
      runtimeArtifact: { ...candidate.runtimeArtifact, runtimeArtifactDigest: 'sha256:not-a-digest' },
    })).toThrow(/runtimeArtifactDigest must be sha256/u);

    expect(() => validateFaceObservationProviderImplementationFR22({
      ...candidate,
      slots: candidate.slots.map((slot, index) => index === 0
        ? { ...slot, sourceMode: 'provider_magic' }
        : slot),
    } as never)).toThrow(/unknown sourceMode/u);
  });
});
