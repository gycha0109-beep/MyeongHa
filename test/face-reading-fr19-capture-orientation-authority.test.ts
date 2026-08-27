import { describe, expect, it } from 'vitest';
import {
  CAPTURE_ORIENTATION_AUTHORITY_FR19,
  CAPTURE_ORIENTATION_EVIDENCE_FR19,
  PROVIDER_RELEASE_ATTESTATION_FR18,
  assessCaptureOrientationReadinessFR19,
  validateCaptureOrientationAuthorityFR19,
  validateCaptureOrientationEvidenceFR19,
} from '../packages/face-reading/src/index.js';

describe('FR-19 capture orientation authority', () => {
  it('validates the pinned source and image-library evidence', () => {
    expect(validateCaptureOrientationEvidenceFR19()).toBe(CAPTURE_ORIENTATION_EVIDENCE_FR19);
    expect(validateCaptureOrientationAuthorityFR19()).toBe(CAPTURE_ORIENTATION_AUTHORITY_FR19);
    expect(CAPTURE_ORIENTATION_EVIDENCE_FR19).toHaveLength(2);
  });

  it('pins the inspected K_beauty canonicalization source and Sharp version', () => {
    expect(CAPTURE_ORIENTATION_AUTHORITY_FR19.sourcePipeline).toMatchObject({
      repository: 'gycha0109-beep/K_beauty',
      repositoryCommit: '81c3b4139efdffc785439da005557dc38a6b4873',
      sourcePath: 'lib/image-upload-boundary-core.js',
      sourceBlobSha: '2215b9c08f61971521ae9ff9eab9cb7c5f392f98',
      imageLibrary: 'sharp',
      imageLibraryVersion: '0.35.3',
    });
  });

  it('resolves EXIF transform ambiguity but not source-pixel anatomical mirroring', () => {
    expect(CAPTURE_ORIENTATION_AUTHORITY_FR19.canonicalization).toMatchObject({
      exifOrientationAppliedToPixels: true,
      exifOrientationMayApplyMirrorTransform: true,
      outputOrientationMetadataRetained: false,
      canonicalPixelOrientationState: 'exif_transform_normalized',
    });
    expect(CAPTURE_ORIENTATION_AUTHORITY_FR19.anatomicalLaterality).toMatchObject({
      sourcePixelMirrorState: 'unresolved_source_pixels',
      sourcePixelMirrorAttestationRef: null,
      fileUploadCanEstablishAnatomicalUnmirroredPixels: false,
      productionLateralityBindingAllowed: false,
    });
  });

  it('keeps image coordinates explicitly non-anatomical', () => {
    expect(CAPTURE_ORIENTATION_AUTHORITY_FR19.canonicalization.coordinateOrigin).toBe('top_left');
    expect(CAPTURE_ORIENTATION_AUTHORITY_FR19.canonicalization.xAxisDirection).toBe('image_left_to_right');
    expect(CAPTURE_ORIENTATION_AUTHORITY_FR19.anatomicalLaterality.imageXAxisMayDefineAnatomicalSide).toBe(false);
    expect(CAPTURE_ORIENTATION_AUTHORITY_FR19.anatomicalLaterality.providerSideLabelMayBypassCaptureAuthority).toBe(false);
  });

  it('pins FR-18 and closes only the EXIF transform gap', () => {
    expect(CAPTURE_ORIENTATION_AUTHORITY_FR19.relationshipToFR18).toEqual({
      providerReleaseAttestationVersion: PROVIDER_RELEASE_ATTESTATION_FR18.attestationVersion,
      closesCaptureExifTransformGap: true,
      closesPublishedBundleProvenanceGap: false,
      closesAnatomicalMirrorGap: false,
      providerActivationAllowed: false,
    });
  });

  it('rejects drift from the inspected canonicalization source blob', () => {
    const forged = {
      ...CAPTURE_ORIENTATION_AUTHORITY_FR19,
      sourcePipeline: {
        ...CAPTURE_ORIENTATION_AUTHORITY_FR19.sourcePipeline,
        sourceBlobSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    } as never;
    expect(() => validateCaptureOrientationAuthorityFR19(forged)).toThrow(/pin the inspected K_beauty canonicalization source exactly/u);
  });

  it('rejects a fake claim that source pixels are anatomically unmirrored', () => {
    const forged = {
      ...CAPTURE_ORIENTATION_AUTHORITY_FR19,
      anatomicalLaterality: {
        ...CAPTURE_ORIENTATION_AUTHORITY_FR19.anatomicalLaterality,
        sourcePixelMirrorState: 'anatomical_unmirrored',
      },
    } as never;
    expect(() => validateCaptureOrientationAuthorityFR19(forged)).toThrow(/source-pixel mirror state must remain unresolved/u);
  });

  it('rejects treating selfie preview state as saved-pixel orientation authority', () => {
    const forged = {
      ...CAPTURE_ORIENTATION_AUTHORITY_FR19,
      anatomicalLaterality: {
        ...CAPTURE_ORIENTATION_AUTHORITY_FR19.anatomicalLaterality,
        selfiePreviewCanEstablishSavedPixelOrientation: true,
      },
    } as never;
    expect(() => validateCaptureOrientationAuthorityFR19(forged)).toThrow(/anatomical laterality must remain fail-closed/u);
  });

  it('rejects image x-axis and provider-side shortcuts', () => {
    for (const mutation of [
      { imageXAxisMayDefineAnatomicalSide: true },
      { providerSideLabelMayBypassCaptureAuthority: true },
      { productionLateralityBindingAllowed: true },
    ]) {
      const forged = {
        ...CAPTURE_ORIENTATION_AUTHORITY_FR19,
        anatomicalLaterality: {
          ...CAPTURE_ORIENTATION_AUTHORITY_FR19.anatomicalLaterality,
          ...mutation,
        },
      } as never;
      expect(() => validateCaptureOrientationAuthorityFR19(forged)).toThrow(/anatomical laterality must remain fail-closed/u);
    }
  });

  it('rejects smuggled camera/provider geometry fields', () => {
    const forged = {
      ...CAPTURE_ORIENTATION_AUTHORITY_FR19,
      anatomicalLaterality: {
        ...CAPTURE_ORIENTATION_AUTHORITY_FR19.anatomicalLaterality,
        frontCameraLandmarkIndex: 263,
      },
    } as never;
    expect(() => validateCaptureOrientationAuthorityFR19(forged)).toThrow(/contains unauthorized field: frontCameraLandmarkIndex/u);
  });

  it('rejects pretending FR-19 solves FR-18 publication provenance', () => {
    const forged = {
      ...CAPTURE_ORIENTATION_AUTHORITY_FR19,
      relationshipToFR18: {
        ...CAPTURE_ORIENTATION_AUTHORITY_FR19.relationshipToFR18,
        closesPublishedBundleProvenanceGap: true,
      },
    } as never;
    expect(() => validateCaptureOrientationAuthorityFR19(forged)).toThrow(/may close only the EXIF transform gap/u);
  });

  it('reports EXIF resolved while anatomical laterality remains blocked', () => {
    const readiness = assessCaptureOrientationReadinessFR19();
    expect(readiness).toMatchObject({
      productionReady: false,
      exifTransformState: 'resolved',
      anatomicalMirrorState: 'unresolved',
      lateralityBindingState: 'blocked',
    });
    expect(readiness.blockers.join(' ')).toMatch(/source pixel content was already mirrored/u);
    expect(readiness.blockers.join(' ')).toMatch(/provider left\/right symbol names/u);
    expect(readiness.blockers.join(' ')).toMatch(/published package topology provenance remains unresolved/u);
  });
});
