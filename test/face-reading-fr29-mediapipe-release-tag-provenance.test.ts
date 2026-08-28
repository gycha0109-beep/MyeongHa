import { describe, expect, it } from 'vitest';
import {
  MEDIAPIPE_RELEASE_TAG_PROVENANCE_FR29,
  assessMediaPipeReleaseTagProvenanceFR29,
  validateMediaPipeReleaseTagProvenanceFR29,
} from '../packages/face-reading/src/index.js';

describe('FR-29 MediaPipe release-tag provenance', () => {
  it('pins the official MediaPipe v0.10.35 GitHub release tag source identity', () => {
    const evidence = validateMediaPipeReleaseTagProvenanceFR29();
    expect(evidence.authorityState).toBe('release_tag_source_identity_only');
    expect(evidence.officialRelease).toMatchObject({
      repository: 'google-ai-edge/mediapipe',
      releaseId: 314747935,
      releaseName: 'MediaPipe v0.10.35',
      tagName: 'v0.10.35',
      tagRefClass: 'lightweight_tag_to_commit',
      tagCommitSha: 'f8ef212d5c962c0e853db7e59d217056b187084b',
      tagTreeSha: '42b9645cb31588b47bc1ef67ad8115ae7bdfb7ae',
      publishedAt: '2026-04-28T17:55:39Z',
      releaseTagSourceIdentityVerified: true,
    });
  });

  it('proves the FR-16 topology witness bytes are unchanged in the official release tag', () => {
    const witness = MEDIAPIPE_RELEASE_TAG_PROVENANCE_FR29.topologyWitness;
    expect(witness.releaseTagBlobSha).toBe('644de9d8c7cd90880d92b2393b4913fa93ace927');
    expect(witness.historicalFR16BlobSha).toBe(witness.releaseTagBlobSha);
    expect(witness.byteIdenticalAcrossHistoricalFR16AndReleaseTag).toBe(true);
    expect(witness.releaseTagContainsRequiredEyeAndBrowSymbols).toBe(true);
  });

  it('records that the release-tag landmark declaration now includes the runtime-observed visibility field', () => {
    const witness = MEDIAPIPE_RELEASE_TAG_PROVENANCE_FR29.normalizedLandmarkWitness;
    expect(witness.releaseTagBlobSha).toBe('48cdab12bcaf3c88d95b18b7f9d5ce9731e1c9fe');
    expect(witness.byteIdenticalToHistoricalFR25Witness).toBe(false);
    expect(witness.releaseTagDeclaredFields).toEqual(['x', 'y', 'z', 'visibility']);
    expect(witness.runtimeObservedSupplementalField).toBe('faceLandmarks[].visibility');
    expect(witness.runtimeObservedSupplementalFieldDeclaredByReleaseTag).toBe(true);
  });

  it('keeps the FaceLandmarkerResult root contract aligned while recording changed declaration bytes', () => {
    const witness = MEDIAPIPE_RELEASE_TAG_PROVENANCE_FR29.faceLandmarkerResultWitness;
    expect(witness.releaseTagBlobSha).toBe('56001bc0779ae58daa1cfd8dca565332ae892027');
    expect(witness.byteIdenticalToHistoricalFR25Witness).toBe(false);
    expect(witness.releaseTagRootFields).toEqual([
      'faceLandmarks',
      'faceBlendshapes',
      'facialTransformationMatrixes',
    ]);
    expect(witness.rootFieldSetAlignedWithFR25Adapter).toBe(true);
  });

  it('does not promote the release tag to published npm tarball source equivalence', () => {
    const evidence = MEDIAPIPE_RELEASE_TAG_PROVENANCE_FR29;
    expect(evidence.publishedPackageMetadata.repositoryFieldObserved).toBe(false);
    expect(evidence.publishedPackageMetadata.gitHeadFieldObserved).toBe(false);
    expect(evidence.publishedPackageMetadata.trustedArtifactToTagBuildAttestationObserved).toBe(false);
    expect(evidence.publishedNpmArtifactSourceEquivalenceVerified).toBe(false);

    const readiness = assessMediaPipeReleaseTagProvenanceFR29();
    expect(readiness.officialReleaseTagSourceIdentityReady).toBe(true);
    expect(readiness.topologyWitnessReleaseTagAligned).toBe(true);
    expect(readiness.runtimeVisibilityReleaseTagDeclarationAligned).toBe(true);
    expect(readiness.faceLandmarkerResultRootShapeReleaseTagAligned).toBe(true);
    expect(readiness.publishedNpmArtifactSourceEquivalenceReady).toBe(false);
    expect(readiness.providerConformanceReady).toBe(false);
    expect(readiness.productionProviderActivationReady).toBe(false);
    expect(readiness.anatomicalLateralityReady).toBe(false);
    expect(readiness.traditionalSemanticAuthorityGranted).toBe(false);
  });

  it('fails closed if tag source identity is promoted to npm artifact equivalence', () => {
    const evidence = MEDIAPIPE_RELEASE_TAG_PROVENANCE_FR29;
    expect(() => validateMediaPipeReleaseTagProvenanceFR29({
      ...evidence,
      publishedNpmArtifactSourceEquivalenceVerified: true,
    } as never)).toThrow(/must not be promoted to npm artifact source\/build equivalence/u);
  });

  it('fails closed if historical and release topology byte identity is withdrawn', () => {
    const evidence = MEDIAPIPE_RELEASE_TAG_PROVENANCE_FR29;
    expect(() => validateMediaPipeReleaseTagProvenanceFR29({
      ...evidence,
      topologyWitness: {
        ...evidence.topologyWitness,
        byteIdenticalAcrossHistoricalFR16AndReleaseTag: false,
      },
    } as never)).toThrow(/must remain byte-aligned/u);
  });

  it('fails closed on production, conformance, laterality, or traditional-semantic promotion', () => {
    const evidence = MEDIAPIPE_RELEASE_TAG_PROVENANCE_FR29;
    expect(() => validateMediaPipeReleaseTagProvenanceFR29({
      ...evidence,
      productionProviderActivationAllowed: true,
    } as never)).toThrow(/cannot promote provider conformance/u);
    expect(() => validateMediaPipeReleaseTagProvenanceFR29({
      ...evidence,
      traditionalSemanticAuthority: true,
    } as never)).toThrow(/cannot promote provider conformance/u);
  });
});
