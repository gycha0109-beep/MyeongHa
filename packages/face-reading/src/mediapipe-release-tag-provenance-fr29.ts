import { MEDIAPIPE_EYE_LANDMARK_ADAPTER_EVIDENCE_FR25 } from './mediapipe-eye-landmark-adapter-fr25.js';
import { FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16 } from './provider-adapter-evidence-fr16.js';
import { PROVIDER_RELEASE_ATTESTATION_FR18 } from './provider-release-attestation-fr18.js';
import { FaceAuthorityValidationError } from './validation.js';

export interface MediaPipeReleaseTagProvenanceFR29V1 {
  readonly schemaVersion: 'fr29-v1';
  readonly evidenceRef: 'evidence.face.mediapipe_release_tag_provenance.fr29';
  readonly evidenceVersion: '0.1.0';
  readonly authorityState: 'release_tag_source_identity_only';
  readonly packageIdentity: {
    readonly packageName: '@mediapipe/tasks-vision';
    readonly packageVersion: '0.10.35';
    readonly resolvedTarballUrl: 'https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.35.tgz';
    readonly integrity: string;
  };
  readonly officialRelease: {
    readonly repository: 'google-ai-edge/mediapipe';
    readonly releaseId: 314747935;
    readonly releaseName: 'MediaPipe v0.10.35';
    readonly tagName: 'v0.10.35';
    readonly tagRefClass: 'lightweight_tag_to_commit';
    readonly tagCommitSha: 'f8ef212d5c962c0e853db7e59d217056b187084b';
    readonly tagTreeSha: '42b9645cb31588b47bc1ef67ad8115ae7bdfb7ae';
    readonly publishedAt: '2026-04-28T17:55:39Z';
    readonly releaseTagSourceIdentityVerified: true;
  };
  readonly topologyWitness: {
    readonly path: 'mediapipe/tasks/web/vision/face_landmarker/face_landmarks_connections.ts';
    readonly releaseTagBlobSha: '644de9d8c7cd90880d92b2393b4913fa93ace927';
    readonly historicalFR16CommitSha: string;
    readonly historicalFR16BlobSha: '644de9d8c7cd90880d92b2393b4913fa93ace927';
    readonly byteIdenticalAcrossHistoricalFR16AndReleaseTag: true;
    readonly releaseTagContainsRequiredEyeAndBrowSymbols: true;
  };
  readonly normalizedLandmarkWitness: {
    readonly path: 'mediapipe/tasks/web/components/containers/landmark.d.ts';
    readonly releaseTagBlobSha: '48cdab12bcaf3c88d95b18b7f9d5ce9731e1c9fe';
    readonly historicalFR25BlobSha: string;
    readonly byteIdenticalToHistoricalFR25Witness: false;
    readonly releaseTagDeclaredFields: readonly ['x', 'y', 'z', 'visibility'];
    readonly runtimeObservedSupplementalField: 'faceLandmarks[].visibility';
    readonly runtimeObservedSupplementalFieldDeclaredByReleaseTag: true;
  };
  readonly faceLandmarkerResultWitness: {
    readonly path: 'mediapipe/tasks/web/vision/face_landmarker/face_landmarker_result.d.ts';
    readonly releaseTagBlobSha: '56001bc0779ae58daa1cfd8dca565332ae892027';
    readonly historicalFR25BlobSha: string;
    readonly byteIdenticalToHistoricalFR25Witness: false;
    readonly releaseTagRootFields: readonly ['faceLandmarks', 'faceBlendshapes', 'facialTransformationMatrixes'];
    readonly rootFieldSetAlignedWithFR25Adapter: true;
  };
  readonly publishedPackageMetadata: {
    readonly browserEntry: 'vision_bundle.mjs';
    readonly typeEntry: 'vision.d.ts';
    readonly repositoryFieldObserved: false;
    readonly gitHeadFieldObserved: false;
    readonly trustedArtifactToTagBuildAttestationObserved: false;
  };
  readonly publishedNpmArtifactSourceEquivalenceVerified: false;
  readonly providerConformanceClaimed: false;
  readonly productionProviderActivationAllowed: false;
  readonly anatomicalLateralityResolved: false;
  readonly traditionalSemanticAuthority: false;
}

export interface MediaPipeReleaseTagProvenanceReadinessFR29V1 {
  readonly officialReleaseTagSourceIdentityReady: true;
  readonly topologyWitnessReleaseTagAligned: true;
  readonly runtimeVisibilityReleaseTagDeclarationAligned: true;
  readonly faceLandmarkerResultRootShapeReleaseTagAligned: true;
  readonly publishedNpmArtifactSourceEquivalenceReady: false;
  readonly providerConformanceReady: false;
  readonly productionProviderActivationReady: false;
  readonly anatomicalLateralityReady: false;
  readonly traditionalSemanticAuthorityGranted: false;
  readonly blockers: readonly string[];
}

const HEX40 = /^[0-9a-f]{40}$/u;

function gitSha(value: string, path: string): void {
  if (!HEX40.test(value)) throw new FaceAuthorityValidationError(`${path} must be a 40-char lowercase git SHA.`);
}

function exactStrings(actual: readonly string[], expected: readonly string[], path: string): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new FaceAuthorityValidationError(`${path} mismatch.`);
  }
}

export const MEDIAPIPE_RELEASE_TAG_PROVENANCE_FR29: MediaPipeReleaseTagProvenanceFR29V1 = Object.freeze({
  schemaVersion: 'fr29-v1' as const,
  evidenceRef: 'evidence.face.mediapipe_release_tag_provenance.fr29' as const,
  evidenceVersion: '0.1.0' as const,
  authorityState: 'release_tag_source_identity_only' as const,
  packageIdentity: Object.freeze({
    packageName: '@mediapipe/tasks-vision' as const,
    packageVersion: '0.10.35' as const,
    resolvedTarballUrl: 'https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.35.tgz' as const,
    integrity: PROVIDER_RELEASE_ATTESTATION_FR18.consumerArtifactLock.integrity,
  }),
  officialRelease: Object.freeze({
    repository: 'google-ai-edge/mediapipe' as const,
    releaseId: 314747935 as const,
    releaseName: 'MediaPipe v0.10.35' as const,
    tagName: 'v0.10.35' as const,
    tagRefClass: 'lightweight_tag_to_commit' as const,
    tagCommitSha: 'f8ef212d5c962c0e853db7e59d217056b187084b' as const,
    tagTreeSha: '42b9645cb31588b47bc1ef67ad8115ae7bdfb7ae' as const,
    publishedAt: '2026-04-28T17:55:39Z' as const,
    releaseTagSourceIdentityVerified: true as const,
  }),
  topologyWitness: Object.freeze({
    path: 'mediapipe/tasks/web/vision/face_landmarker/face_landmarks_connections.ts' as const,
    releaseTagBlobSha: '644de9d8c7cd90880d92b2393b4913fa93ace927' as const,
    historicalFR16CommitSha: FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.topologySourceEvidence.sourceCommit,
    historicalFR16BlobSha: '644de9d8c7cd90880d92b2393b4913fa93ace927' as const,
    byteIdenticalAcrossHistoricalFR16AndReleaseTag: true as const,
    releaseTagContainsRequiredEyeAndBrowSymbols: true as const,
  }),
  normalizedLandmarkWitness: Object.freeze({
    path: 'mediapipe/tasks/web/components/containers/landmark.d.ts' as const,
    releaseTagBlobSha: '48cdab12bcaf3c88d95b18b7f9d5ce9731e1c9fe' as const,
    historicalFR25BlobSha: MEDIAPIPE_EYE_LANDMARK_ADAPTER_EVIDENCE_FR25.sourceWitness.normalizedLandmarkBlobSha,
    byteIdenticalToHistoricalFR25Witness: false as const,
    releaseTagDeclaredFields: Object.freeze(['x', 'y', 'z', 'visibility'] as const),
    runtimeObservedSupplementalField: 'faceLandmarks[].visibility' as const,
    runtimeObservedSupplementalFieldDeclaredByReleaseTag: true as const,
  }),
  faceLandmarkerResultWitness: Object.freeze({
    path: 'mediapipe/tasks/web/vision/face_landmarker/face_landmarker_result.d.ts' as const,
    releaseTagBlobSha: '56001bc0779ae58daa1cfd8dca565332ae892027' as const,
    historicalFR25BlobSha: MEDIAPIPE_EYE_LANDMARK_ADAPTER_EVIDENCE_FR25.sourceWitness.faceLandmarkerResultBlobSha,
    byteIdenticalToHistoricalFR25Witness: false as const,
    releaseTagRootFields: Object.freeze(['faceLandmarks', 'faceBlendshapes', 'facialTransformationMatrixes'] as const),
    rootFieldSetAlignedWithFR25Adapter: true as const,
  }),
  publishedPackageMetadata: Object.freeze({
    browserEntry: 'vision_bundle.mjs' as const,
    typeEntry: 'vision.d.ts' as const,
    repositoryFieldObserved: false as const,
    gitHeadFieldObserved: false as const,
    trustedArtifactToTagBuildAttestationObserved: false as const,
  }),
  publishedNpmArtifactSourceEquivalenceVerified: false as const,
  providerConformanceClaimed: false as const,
  productionProviderActivationAllowed: false as const,
  anatomicalLateralityResolved: false as const,
  traditionalSemanticAuthority: false as const,
});

export function validateMediaPipeReleaseTagProvenanceFR29(
  evidence: MediaPipeReleaseTagProvenanceFR29V1 = MEDIAPIPE_RELEASE_TAG_PROVENANCE_FR29,
): MediaPipeReleaseTagProvenanceFR29V1 {
  if (evidence.schemaVersion !== 'fr29-v1' || evidence.evidenceVersion !== '0.1.0') {
    throw new FaceAuthorityValidationError('FR-29 evidence schema/version mismatch.');
  }
  if (evidence.authorityState !== 'release_tag_source_identity_only') {
    throw new FaceAuthorityValidationError('FR-29 authorityState must remain release_tag_source_identity_only.');
  }
  if (evidence.packageIdentity.packageName !== PROVIDER_RELEASE_ATTESTATION_FR18.consumerArtifactLock.packageName ||
      evidence.packageIdentity.packageVersion !== PROVIDER_RELEASE_ATTESTATION_FR18.consumerArtifactLock.packageVersion ||
      evidence.packageIdentity.resolvedTarballUrl !== PROVIDER_RELEASE_ATTESTATION_FR18.consumerArtifactLock.resolvedTarballUrl ||
      evidence.packageIdentity.integrity !== PROVIDER_RELEASE_ATTESTATION_FR18.consumerArtifactLock.integrity) {
    throw new FaceAuthorityValidationError('FR-29 package artifact identity must remain aligned to FR-18.');
  }

  gitSha(evidence.officialRelease.tagCommitSha, 'fr29.officialRelease.tagCommitSha');
  gitSha(evidence.officialRelease.tagTreeSha, 'fr29.officialRelease.tagTreeSha');
  if (evidence.officialRelease.repository !== 'google-ai-edge/mediapipe' ||
      evidence.officialRelease.releaseId !== 314747935 || evidence.officialRelease.tagName !== 'v0.10.35' ||
      evidence.officialRelease.tagRefClass !== 'lightweight_tag_to_commit' || evidence.officialRelease.releaseTagSourceIdentityVerified !== true) {
    throw new FaceAuthorityValidationError('FR-29 official release tag identity mismatch.');
  }

  gitSha(evidence.topologyWitness.releaseTagBlobSha, 'fr29.topologyWitness.releaseTagBlobSha');
  gitSha(evidence.topologyWitness.historicalFR16CommitSha, 'fr29.topologyWitness.historicalFR16CommitSha');
  gitSha(evidence.topologyWitness.historicalFR16BlobSha, 'fr29.topologyWitness.historicalFR16BlobSha');
  if (evidence.topologyWitness.path !== FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.topologySourceEvidence.sourcePath ||
      evidence.topologyWitness.historicalFR16CommitSha !== FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.topologySourceEvidence.sourceCommit ||
      evidence.topologyWitness.releaseTagBlobSha !== PROVIDER_RELEASE_ATTESTATION_FR18.upstreamVersionSnapshot.topologySourceBlobSha ||
      evidence.topologyWitness.releaseTagBlobSha !== evidence.topologyWitness.historicalFR16BlobSha ||
      evidence.topologyWitness.byteIdenticalAcrossHistoricalFR16AndReleaseTag !== true ||
      evidence.topologyWitness.releaseTagContainsRequiredEyeAndBrowSymbols !== true) {
    throw new FaceAuthorityValidationError('FR-29 release-tag topology witness must remain byte-aligned to the historical FR-16 topology and FR-18 0.10.35 snapshot.');
  }

  gitSha(evidence.normalizedLandmarkWitness.releaseTagBlobSha, 'fr29.normalizedLandmarkWitness.releaseTagBlobSha');
  gitSha(evidence.normalizedLandmarkWitness.historicalFR25BlobSha, 'fr29.normalizedLandmarkWitness.historicalFR25BlobSha');
  if (evidence.normalizedLandmarkWitness.path !== MEDIAPIPE_EYE_LANDMARK_ADAPTER_EVIDENCE_FR25.sourceWitness.normalizedLandmarkPath ||
      evidence.normalizedLandmarkWitness.historicalFR25BlobSha !== MEDIAPIPE_EYE_LANDMARK_ADAPTER_EVIDENCE_FR25.sourceWitness.normalizedLandmarkBlobSha ||
      evidence.normalizedLandmarkWitness.releaseTagBlobSha === evidence.normalizedLandmarkWitness.historicalFR25BlobSha ||
      evidence.normalizedLandmarkWitness.byteIdenticalToHistoricalFR25Witness !== false) {
    throw new FaceAuthorityValidationError('FR-29 normalized-landmark release witness must remain distinct from the historical FR-25 declaration witness.');
  }
  exactStrings(evidence.normalizedLandmarkWitness.releaseTagDeclaredFields, ['x', 'y', 'z', 'visibility'], 'fr29.releaseTagDeclaredFields');
  if (evidence.normalizedLandmarkWitness.runtimeObservedSupplementalField !== MEDIAPIPE_EYE_LANDMARK_ADAPTER_EVIDENCE_FR25.runtimeShapeObservation.observedSupplementalLandmarkFields[0] ||
      evidence.normalizedLandmarkWitness.runtimeObservedSupplementalFieldDeclaredByReleaseTag !== true) {
    throw new FaceAuthorityValidationError('FR-29 release-tag visibility declaration must remain aligned to the FR-25 runtime observation.');
  }

  gitSha(evidence.faceLandmarkerResultWitness.releaseTagBlobSha, 'fr29.faceLandmarkerResultWitness.releaseTagBlobSha');
  gitSha(evidence.faceLandmarkerResultWitness.historicalFR25BlobSha, 'fr29.faceLandmarkerResultWitness.historicalFR25BlobSha');
  if (evidence.faceLandmarkerResultWitness.path !== MEDIAPIPE_EYE_LANDMARK_ADAPTER_EVIDENCE_FR25.sourceWitness.faceLandmarkerResultPath ||
      evidence.faceLandmarkerResultWitness.historicalFR25BlobSha !== MEDIAPIPE_EYE_LANDMARK_ADAPTER_EVIDENCE_FR25.sourceWitness.faceLandmarkerResultBlobSha ||
      evidence.faceLandmarkerResultWitness.releaseTagBlobSha === evidence.faceLandmarkerResultWitness.historicalFR25BlobSha ||
      evidence.faceLandmarkerResultWitness.byteIdenticalToHistoricalFR25Witness !== false ||
      evidence.faceLandmarkerResultWitness.rootFieldSetAlignedWithFR25Adapter !== true) {
    throw new FaceAuthorityValidationError('FR-29 FaceLandmarkerResult release witness boundary mismatch.');
  }
  exactStrings(evidence.faceLandmarkerResultWitness.releaseTagRootFields, ['faceLandmarks', 'faceBlendshapes', 'facialTransformationMatrixes'], 'fr29.releaseTagRootFields');

  if (evidence.publishedPackageMetadata.browserEntry !== PROVIDER_RELEASE_ATTESTATION_FR18.publishedPackageMetadata.browserEntry ||
      evidence.publishedPackageMetadata.typeEntry !== PROVIDER_RELEASE_ATTESTATION_FR18.publishedPackageMetadata.typeEntry ||
      evidence.publishedPackageMetadata.repositoryFieldObserved !== false ||
      evidence.publishedPackageMetadata.gitHeadFieldObserved !== false ||
      evidence.publishedPackageMetadata.trustedArtifactToTagBuildAttestationObserved !== false ||
      evidence.publishedNpmArtifactSourceEquivalenceVerified !== false) {
    throw new FaceAuthorityValidationError('FR-29 release-tag source identity must not be promoted to npm artifact source/build equivalence.');
  }

  if (evidence.providerConformanceClaimed !== false || evidence.productionProviderActivationAllowed !== false ||
      evidence.anatomicalLateralityResolved !== false || evidence.traditionalSemanticAuthority !== false) {
    throw new FaceAuthorityValidationError('FR-29 cannot promote provider conformance, production activation, anatomical laterality, or traditional semantics.');
  }
  return evidence;
}

export function assessMediaPipeReleaseTagProvenanceFR29(): MediaPipeReleaseTagProvenanceReadinessFR29V1 {
  validateMediaPipeReleaseTagProvenanceFR29();
  return Object.freeze({
    officialReleaseTagSourceIdentityReady: true as const,
    topologyWitnessReleaseTagAligned: true as const,
    runtimeVisibilityReleaseTagDeclarationAligned: true as const,
    faceLandmarkerResultRootShapeReleaseTagAligned: true as const,
    publishedNpmArtifactSourceEquivalenceReady: false as const,
    providerConformanceReady: false as const,
    productionProviderActivationReady: false as const,
    anatomicalLateralityReady: false as const,
    traditionalSemanticAuthorityGranted: false as const,
    blockers: Object.freeze([
      'the official MediaPipe v0.10.35 GitHub tag identifies release source, but the published @mediapipe/tasks-vision@0.10.35 package metadata exposes no repository or gitHead linkage to that tag',
      'no trusted npm artifact provenance/build attestation has been captured that proves the FR-18 tarball was built from the official v0.10.35 tag source',
      'release-tag source declarations and topology identity do not by themselves establish published npm bundle source equivalence',
      'FR-22 verified provider implementation registry remains empty and requires the full six-slot neutral observation capability set',
      'FR-23 reviewed provider conformance evidence registry remains empty',
      'provider LEFT/RIGHT labels remain provider provenance only and do not resolve anatomical laterality',
      'FR-29 grants no traditional physiognomy semantic authority',
    ]),
  });
}
