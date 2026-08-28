import { describe, expect, it } from 'vitest';
import {
  FACE_OBSERVATION_PROVIDER_CONFORMANCE_EVIDENCE_FR23,
  FR23_REQUIRED_PROVIDER_CONFORMANCE_CHECKS,
  PROVIDER_RELEASE_ATTESTATION_FR18,
  assessFaceObservationProviderConformanceFR23,
  validateFaceObservationProviderConformanceEvidenceFR23,
  type FaceObservationProviderConformanceEvidenceFR23V1,
  type FaceObservationProviderImplementationAttestationFR22V1,
} from '../packages/face-reading/src/index.js';

const RUNTIME_DIGEST = `sha256:${'a'.repeat(64)}`;
const FIXTURE_DIGEST = `sha256:${'b'.repeat(64)}`;

function candidateImplementation(): FaceObservationProviderImplementationAttestationFR22V1 {
  return {
    schemaVersion: 'fr22-implementation-v1',
    implementationRef: 'provider.impl.facelab.fr23-fixture.v1',
    providerKey: 'visually_facelab',
    consumerContractRef: 'contract.face.observation_provider.fr22@0.1.0',
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
      runtimeArtifactDigest: RUNTIME_DIGEST,
    },
    supportedCapabilities: [
      'neutral_pose_quality',
      'neutral_brow_regions',
      'neutral_brow_midline_derivation',
      'neutral_eye_regions',
      'neutral_nose_region',
    ],
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

function candidateEvidence(
  implementation: FaceObservationProviderImplementationAttestationFR22V1,
): FaceObservationProviderConformanceEvidenceFR23V1 {
  return {
    schemaVersion: 'fr23-evidence-v1',
    evidenceRef: 'evidence.fr23.facelab.fixture-run.v1',
    evidenceVersion: '0.1.0',
    authorityState: 'implementation_conformance_only',
    implementationRef: implementation.implementationRef,
    consumerContractRef: implementation.consumerContractRef,
    providerContractVersion: implementation.providerContractVersion,
    runtimeArtifactDigest: RUNTIME_DIGEST,
    adapterSourcePin: { ...implementation.adapterSource },
    fixtureCorpusDigest: FIXTURE_DIGEST,
    suiteRef: 'suite.face.observation_provider.fr23@0.1.0',
    executionRef: 'execution.fr23.fixture.001',
    checks: FR23_REQUIRED_PROVIDER_CONFORMANCE_CHECKS.map((checkId, index) => ({
      checkId,
      result: 'pass' as const,
      assertionCount: index + 1,
      resultArtifactDigest: `sha256:${(index + 1).toString(16).repeat(64).slice(0, 64)}`,
    })),
    reviewState: 'candidate',
    reviewerEvidenceRefs: [],
    semanticAuthorityClaimed: false,
    anatomicalLateralityClaimed: false,
  };
}

describe('FR-23 provider conformance evidence', () => {
  it('keeps the merged evidence registry empty and provider activation closed', () => {
    expect(FACE_OBSERVATION_PROVIDER_CONFORMANCE_EVIDENCE_FR23).toHaveLength(0);
    const readiness = assessFaceObservationProviderConformanceFR23();
    expect(readiness.implementationConformanceReady).toBe(false);
    expect(readiness.providerActivationCandidate).toBe(false);
    expect(readiness.traditionalSemanticAuthorityGranted).toBe(false);
    expect(readiness.blockers.join(' ')).toMatch(/zero registered conformance evidence records/u);
    expect(readiness.blockers.join(' ')).toMatch(/explicitly disables provider activation/u);
  });

  it('validates a complete candidate conformance run without promoting it', () => {
    const implementation = candidateImplementation();
    const evidence = candidateEvidence(implementation);
    expect(validateFaceObservationProviderConformanceEvidenceFR23(evidence, implementation)).toBe(evidence);
    expect(evidence.checks).toHaveLength(FR23_REQUIRED_PROVIDER_CONFORMANCE_CHECKS.length);
    const readiness = assessFaceObservationProviderConformanceFR23({ implementation, evidence });
    expect(readiness.implementationConformanceReady).toBe(false);
    expect(readiness.providerActivationCandidate).toBe(false);
    expect(readiness.blockers.join(' ')).toMatch(/implementation reviewState=candidate/u);
    expect(readiness.blockers.join(' ')).toMatch(/not registered in FR-22/u);
    expect(readiness.blockers.join(' ')).toMatch(/evidence reviewState=candidate/u);
    expect(readiness.blockers.join(' ')).toMatch(/not registered in FR-23/u);
  });

  it('requires the conformance runtime digest to match the exact implementation runtime digest', () => {
    const implementation = candidateImplementation();
    const evidence = candidateEvidence(implementation);
    expect(() => validateFaceObservationProviderConformanceEvidenceFR23({
      ...evidence,
      runtimeArtifactDigest: `sha256:${'c'.repeat(64)}`,
    }, implementation)).toThrow(/exact independently recorded implementation runtime artifact digest/u);
  });

  it('requires the adapter source pin to match the implementation attestation exactly', () => {
    const implementation = candidateImplementation();
    const evidence = candidateEvidence(implementation);
    expect(() => validateFaceObservationProviderConformanceEvidenceFR23({
      ...evidence,
      adapterSourcePin: {
        ...evidence.adapterSourcePin,
        sourceBlobSha: '3333333333333333333333333333333333333333',
      },
    }, implementation)).toThrow(/adapter source pin must exactly match/u);
  });

  it('requires all ten conformance checks exactly once', () => {
    const implementation = candidateImplementation();
    const evidence = candidateEvidence(implementation);
    expect(() => validateFaceObservationProviderConformanceEvidenceFR23({
      ...evidence,
      checks: evidence.checks.slice(1),
    }, implementation)).toThrow(/every required conformance check exactly once/u);

    expect(() => validateFaceObservationProviderConformanceEvidenceFR23({
      ...evidence,
      checks: [...evidence.checks, evidence.checks[0]!],
    }, implementation)).toThrow(/contains duplicate/u);
  });

  it('rejects unknown checks and zero-assertion check artifacts', () => {
    const implementation = candidateImplementation();
    const evidence = candidateEvidence(implementation);
    expect(() => validateFaceObservationProviderConformanceEvidenceFR23({
      ...evidence,
      checks: evidence.checks.map((check, index) => index === 0
        ? { ...check, checkId: 'semantic_magic' }
        : check),
    } as never, implementation)).toThrow(/unknown conformance check/u);

    expect(() => validateFaceObservationProviderConformanceEvidenceFR23({
      ...evidence,
      checks: evidence.checks.map((check, index) => index === 0
        ? { ...check, assertionCount: 0 }
        : check),
    }, implementation)).toThrow(/assertionCount must be a positive integer/u);
  });

  it('does not permit reviewed evidence to sit on a candidate implementation', () => {
    const implementation = candidateImplementation();
    const evidence = candidateEvidence(implementation);
    expect(() => validateFaceObservationProviderConformanceEvidenceFR23({
      ...evidence,
      reviewState: 'reviewed',
      reviewerEvidenceRefs: ['review.fr23.fixture.001'],
    }, implementation)).toThrow(/reviewed evidence requires a verified FR-22 implementation/u);
  });

  it('cannot forge a verified implementation from current FR-16/FR-17 research sources', () => {
    const candidate = candidateImplementation();
    const forgedVerified = {
      ...candidate,
      reviewState: 'verified' as const,
      conformanceEvidenceRefs: ['evidence.fr23.facelab.fixture-run.v1'],
    };
    const evidence = {
      ...candidateEvidence(candidate),
      reviewState: 'reviewed' as const,
      reviewerEvidenceRefs: ['review.fr23.fixture.001'],
    };
    expect(() => validateFaceObservationProviderConformanceEvidenceFR23(evidence, forgedVerified))
      .toThrow(/executable FR-17 derivation|research-only direct topology/u);
  });

  it('rejects semantic/anatomical authority claims and hidden fields in evidence', () => {
    const implementation = candidateImplementation();
    const evidence = candidateEvidence(implementation);
    expect(() => validateFaceObservationProviderConformanceEvidenceFR23({
      ...evidence,
      semanticAuthorityClaimed: true,
    } as never, implementation)).toThrow(/cannot claim traditional semantic or anatomical-side authority/u);
    expect(() => validateFaceObservationProviderConformanceEvidenceFR23({
      ...evidence,
      anatomicalLateralityClaimed: true,
    } as never, implementation)).toThrow(/cannot claim traditional semantic or anatomical-side authority/u);
    expect(() => validateFaceObservationProviderConformanceEvidenceFR23({
      ...evidence,
      wealthMeaning: 'strong',
    } as never, implementation)).toThrow(/contains unauthorized field: wealthMeaning/u);
  });

  it('rejects malformed fixture and result artifact digests', () => {
    const implementation = candidateImplementation();
    const evidence = candidateEvidence(implementation);
    expect(() => validateFaceObservationProviderConformanceEvidenceFR23({
      ...evidence,
      fixtureCorpusDigest: 'sha256:not-valid',
    }, implementation)).toThrow(/fixtureCorpusDigest must be sha256/u);

    expect(() => validateFaceObservationProviderConformanceEvidenceFR23({
      ...evidence,
      checks: evidence.checks.map((check, index) => index === 0
        ? { ...check, resultArtifactDigest: 'sha256:not-valid' }
        : check),
    }, implementation)).toThrow(/resultArtifactDigest must be sha256/u);
  });
});
