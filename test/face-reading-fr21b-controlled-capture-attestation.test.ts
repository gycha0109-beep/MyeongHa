import { describe, expect, it } from 'vitest';
import {
  CONTROLLED_CAPTURE_AUTHORITY_FR21B,
  CONTROLLED_CAPTURE_CALIBRATION_EVIDENCE_FR21B,
  CONTROLLED_CAPTURE_PROFILES_FR21B,
  deriveControlledCaptureLateralityAssertionFR21B,
  resolveControlledCaptureReadinessFR21B,
  validateControlledCaptureAuthorityFR21B,
  validateControlledCaptureCalibrationEvidenceFR21B,
  validateControlledCaptureProfileAttestationFR21B,
  type ControlledCaptureCalibrationEvidenceFR21BV1,
  type ControlledCaptureProfileAttestationFR21BV1,
} from '../packages/face-reading/src/index.js';

const PROFILE_REF = 'capture.profile.test.front.v1';
const CALIBRATION_REF = 'evidence.capture.test.front.asymmetric.v1';

const REVIEWED_CALIBRATION: ControlledCaptureCalibrationEvidenceFR21BV1 = Object.freeze({
  schemaVersion: 'fr21b-calibration-v1' as const,
  evidenceRef: CALIBRATION_REF,
  profileRef: PROFILE_REF,
  targetRef: 'target.capture.asymmetric.left-marker.v1',
  targetKind: 'deterministic_asymmetric' as const,
  markerAnatomicalSide: 'left' as const,
  cameraFacing: 'front' as const,
  stages: Object.freeze([
    Object.freeze({ stage: 'preview' as const, markerImageSide: 'left' as const, artifactEvidenceRef: 'artifact.preview.front.v1' }),
    Object.freeze({ stage: 'raw_pixels' as const, markerImageSide: 'right' as const, artifactEvidenceRef: 'artifact.raw.front.v1' }),
    Object.freeze({ stage: 'encoded_pixels' as const, markerImageSide: 'right' as const, artifactEvidenceRef: 'artifact.encoded.front.v1' }),
    Object.freeze({ stage: 'canonical_pixels' as const, markerImageSide: 'right' as const, artifactEvidenceRef: 'artifact.canonical.front.v1' }),
  ]),
  encodedExifOrientation: 1,
  reviewState: 'reviewed' as const,
  evidenceRefs: Object.freeze(['evidence.capture.fixture.source.front.v1']),
  limitations: Object.freeze(['synthetic test fixture; not repository production authority']),
});

const VERIFIED_PROFILE: ControlledCaptureProfileAttestationFR21BV1 = Object.freeze({
  schemaVersion: 'fr21b-profile-v1' as const,
  profileRef: PROFILE_REF,
  implementation: Object.freeze({
    repository: 'example/capture-runtime',
    repositoryCommit: '1111111111111111111111111111111111111111',
    sourcePath: 'src/capture.ts',
    sourceBlobSha: '2222222222222222222222222222222222222222',
  }),
  cameraFacing: 'front' as const,
  rawCaptureOrientation: 'sensor_coordinate_frame' as const,
  previewMirrorPolicy: 'mirrored_relative_to_subject' as const,
  savedPixelMirrorPolicy: 'unmirrored_relative_to_subject' as const,
  exifOrientationPolicy: 'metadata_may_encode_transform' as const,
  canonicalizationTransform: 'fr19_sharp_auto_orient_then_reencode_same_supported_format' as const,
  finalAnatomicalLateralityAssertion: 'image_left_is_subject_anatomical_right' as const,
  reviewState: 'verified' as const,
  calibrationEvidenceRefs: Object.freeze([CALIBRATION_REF]),
  evidenceRefs: Object.freeze(['evidence.capture.implementation.source.front.v1']),
});

describe('FR-21B controlled direct capture attestation', () => {
  it('keeps the repository authority design-only with zero implemented profiles', () => {
    expect(validateControlledCaptureAuthorityFR21B()).toBe(CONTROLLED_CAPTURE_AUTHORITY_FR21B);
    expect(CONTROLLED_CAPTURE_PROFILES_FR21B).toHaveLength(0);
    expect(CONTROLLED_CAPTURE_CALIBRATION_EVIDENCE_FR21B).toHaveLength(0);
    expect(resolveControlledCaptureReadinessFR21B()).toMatchObject({
      productionReady: false,
      controlledCaptureState: 'not_implemented',
      calibrationState: 'design_only',
      anatomicalLateralityState: 'blocked',
      reason: 'no_verified_controlled_capture_implementation',
    });
  });

  it('defines standalone evidence validation without promoting the synthetic fixture into repository authority', () => {
    expect(validateControlledCaptureCalibrationEvidenceFR21B(REVIEWED_CALIBRATION)).toBe(REVIEWED_CALIBRATION);
    expect(validateControlledCaptureProfileAttestationFR21B(VERIFIED_PROFILE, [REVIEWED_CALIBRATION])).toBe(VERIFIED_PROFILE);
    expect(CONTROLLED_CAPTURE_AUTHORITY_FR21B.currentImplementation.profileRefs).toEqual([]);
    expect(CONTROLLED_CAPTURE_AUTHORITY_FR21B.anatomicalLaterality.productionLateralityBindingAllowed).toBe(false);
  });

  it('derives final anatomical orientation only from the asymmetric marker in canonical pixels', () => {
    expect(deriveControlledCaptureLateralityAssertionFR21B(REVIEWED_CALIBRATION))
      .toBe('image_left_is_subject_anatomical_right');
  });

  it('does not allow preview evidence to stand in for raw/encoded/canonical evidence', () => {
    const previewOnly = {
      ...REVIEWED_CALIBRATION,
      stages: [REVIEWED_CALIBRATION.stages[0]!],
    } as never;
    expect(() => validateControlledCaptureCalibrationEvidenceFR21B(previewOnly))
      .toThrow(/must observe preview\/raw\/encoded\/canonical stages/u);
  });

  it('rejects duplicate or collapsed capture stages', () => {
    const duplicate = {
      ...REVIEWED_CALIBRATION,
      stages: [
        ...REVIEWED_CALIBRATION.stages.slice(0, 3),
        { ...REVIEWED_CALIBRATION.stages[2]!, artifactEvidenceRef: 'artifact.encoded.duplicate.v1' },
      ],
    } as never;
    expect(() => validateControlledCaptureCalibrationEvidenceFR21B(duplicate)).toThrow(/duplicate/u);
  });

  it('binds preview mirror policy to the observed asymmetric preview rather than assuming selfie behavior', () => {
    const forgedProfile = {
      ...VERIFIED_PROFILE,
      previewMirrorPolicy: 'unmirrored_relative_to_subject' as const,
    };
    expect(() => validateControlledCaptureProfileAttestationFR21B(forgedProfile, [REVIEWED_CALIBRATION]))
      .toThrow(/preview mirror policy contradicts asymmetric calibration evidence/u);
  });

  it('binds saved-pixel mirror policy independently from preview behavior', () => {
    const forgedProfile = {
      ...VERIFIED_PROFILE,
      savedPixelMirrorPolicy: 'mirrored_relative_to_subject' as const,
    };
    expect(() => validateControlledCaptureProfileAttestationFR21B(forgedProfile, [REVIEWED_CALIBRATION]))
      .toThrow(/saved-pixel mirror policy contradicts asymmetric calibration evidence/u);
  });

  it('rejects a verified profile when calibration has not been reviewed', () => {
    const candidateEvidence = {
      ...REVIEWED_CALIBRATION,
      reviewState: 'research_candidate' as const,
    };
    expect(() => validateControlledCaptureProfileAttestationFR21B(VERIFIED_PROFILE, [candidateEvidence]))
      .toThrow(/verified profile requires reviewed calibration evidence/u);
  });

  it('rejects a verified profile with no deterministic asymmetric calibration evidence', () => {
    const noCalibration = {
      ...VERIFIED_PROFILE,
      calibrationEvidenceRefs: [],
    };
    expect(() => validateControlledCaptureProfileAttestationFR21B(noCalibration, []))
      .toThrow(/requires deterministic asymmetric calibration evidence/u);
  });

  it('rejects calibration evidence for the wrong camera facing', () => {
    const rearEvidence = {
      ...REVIEWED_CALIBRATION,
      cameraFacing: 'rear' as const,
    };
    expect(() => validateControlledCaptureProfileAttestationFR21B(VERIFIED_PROFILE, [rearEvidence]))
      .toThrow(/camera-facing mismatch/u);
  });

  it('rejects a final anatomical assertion that contradicts canonical asymmetric evidence', () => {
    const forgedProfile = {
      ...VERIFIED_PROFILE,
      finalAnatomicalLateralityAssertion: 'image_left_is_subject_anatomical_left' as const,
    };
    expect(() => validateControlledCaptureProfileAttestationFR21B(forgedProfile, [REVIEWED_CALIBRATION]))
      .toThrow(/final anatomical assertion is not supported/u);
  });

  it('rejects an absent-or-identity EXIF policy when the encoded artifact carries a transforming orientation', () => {
    const exifEvidence = {
      ...REVIEWED_CALIBRATION,
      encodedExifOrientation: 2 as const,
    };
    const forgedProfile = {
      ...VERIFIED_PROFILE,
      exifOrientationPolicy: 'absent_or_identity' as const,
    };
    expect(() => validateControlledCaptureProfileAttestationFR21B(forgedProfile, [exifEvidence]))
      .toThrow(/EXIF orientation policy contradicts encoded artifact evidence/u);
  });

  it('rejects identity canonicalization when encoded and canonical marker sides differ', () => {
    const transformedEvidence = {
      ...REVIEWED_CALIBRATION,
      stages: REVIEWED_CALIBRATION.stages.map((stage) =>
        stage.stage === 'canonical_pixels' ? { ...stage, markerImageSide: 'left' as const } : stage),
    };
    const forgedProfile = {
      ...VERIFIED_PROFILE,
      canonicalizationTransform: 'identity' as const,
      finalAnatomicalLateralityAssertion: 'image_left_is_subject_anatomical_left' as const,
    };
    expect(() => validateControlledCaptureProfileAttestationFR21B(forgedProfile, [transformedEvidence]))
      .toThrow(/identity canonicalization contradicts encoded\/canonical marker evidence/u);
  });

  it('rejects provider-side labels or other smuggled authority fields', () => {
    const forged = {
      ...VERIFIED_PROFILE,
      providerSideLabelAuthority: 'LEFT',
    } as never;
    expect(() => validateControlledCaptureProfileAttestationFR21B(forged, [REVIEWED_CALIBRATION]))
      .toThrow(/contains unauthorized field: providerSideLabelAuthority/u);
  });

  it('rejects turning the design-only authority into an implemented capture contract', () => {
    const forged = {
      ...CONTROLLED_CAPTURE_AUTHORITY_FR21B,
      currentImplementation: {
        controlledCaptureContractState: 'implemented',
        implementationRef: 'capture.fake',
        profileRefs: [PROFILE_REF],
      },
    } as never;
    expect(() => validateControlledCaptureAuthorityFR21B(forged))
      .toThrow(/must not invent an implemented controlled capture contract/u);
  });

  it('rejects opening anatomical laterality while no verified repository capture profile exists', () => {
    const forged = {
      ...CONTROLLED_CAPTURE_AUTHORITY_FR21B,
      anatomicalLaterality: {
        verifiedProfileRefs: [PROFILE_REF],
        finalAssertionRef: PROFILE_REF,
        productionLateralityBindingAllowed: true,
      },
    } as never;
    expect(() => validateControlledCaptureAuthorityFR21B(forged))
      .toThrow(/anatomical laterality must remain blocked/u);
  });

  it('rejects treating executed-looking calibration refs as evidence in the design-only snapshot', () => {
    const forged = {
      ...CONTROLLED_CAPTURE_AUTHORITY_FR21B,
      calibrationProtocol: {
        ...CONTROLLED_CAPTURE_AUTHORITY_FR21B.calibrationProtocol,
        evidenceRefs: [CALIBRATION_REF],
      },
    } as never;
    expect(() => validateControlledCaptureAuthorityFR21B(forged))
      .toThrow(/has no executed calibration evidence yet/u);
  });

  it('rejects malformed implementation provenance rather than accepting a dependency name as capture authority', () => {
    const malformed = {
      ...VERIFIED_PROFILE,
      implementation: {
        ...VERIFIED_PROFILE.implementation,
        repositoryCommit: 'latest',
      },
    } as never;
    expect(() => validateControlledCaptureProfileAttestationFR21B(malformed, [REVIEWED_CALIBRATION]))
      .toThrow(/40-char lowercase git SHA/u);
  });
});
