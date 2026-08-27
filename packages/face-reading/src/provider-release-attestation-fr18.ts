import { FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16 } from './provider-adapter-evidence-fr16.js';
import { FaceAuthorityValidationError } from './validation.js';

export type ProviderReleaseEvidenceClassV1 =
  | 'consumer_dependency_pin'
  | 'public_package_metadata'
  | 'upstream_version_bump'
  | 'upstream_topology_snapshot';

export interface ProviderReleaseEvidenceRecordV1 {
  readonly evidenceRef: string;
  readonly evidenceClass: ProviderReleaseEvidenceClassV1;
  readonly sourceRef: string;
  readonly observedValue: string;
  readonly verificationState: 'repository_exact' | 'public_registry_metadata';
  readonly authorityState: 'research_only';
  readonly limitations: readonly string[];
}

export interface ProviderLateralitySymbolV1 {
  readonly providerTopologySymbol:
    | 'FACE_LANDMARKS_LEFT_EYE'
    | 'FACE_LANDMARKS_RIGHT_EYE'
    | 'FACE_LANDMARKS_LEFT_EYEBROW'
    | 'FACE_LANDMARKS_RIGHT_EYEBROW';
  readonly providerSideLabel: 'left' | 'right';
  readonly consumerSlot:
    | 'neutral.face.left_eye_region'
    | 'neutral.face.right_eye_region'
    | 'neutral.face.left_brow_region'
    | 'neutral.face.right_brow_region';
  readonly imageSpaceInferenceAllowed: false;
}

export interface ProviderReleaseAttestationFR18V1 {
  readonly schemaVersion: 'v1';
  readonly attestationVersion: string;
  readonly authorityState: 'research_only';
  readonly providerKey: 'mediapipe_tasks_vision';

  readonly consumerDependency: {
    readonly repository: 'gycha0109-beep/K_beauty';
    readonly repositoryCommit: string;
    readonly packageManifestPath: 'package.json';
    readonly packageManifestBlobSha: string;
    readonly packageName: '@mediapipe/tasks-vision';
    readonly packageVersion: '0.10.35';
    readonly evidenceRef: string;
  };

  readonly publishedPackageMetadata: {
    readonly packageName: '@mediapipe/tasks-vision';
    readonly packageVersion: '0.10.35';
    readonly browserEntry: 'vision_bundle.mjs';
    readonly typeEntry: 'vision.d.ts';
    readonly evidenceRef: string;
    readonly topologyBytesAttested: false;
  };

  readonly upstreamVersionSnapshot: {
    readonly repository: 'google-ai-edge/mediapipe';
    readonly versionBumpCommit: '9d38d191b060cbfeaeb0c1aa20e47201f032ea35';
    readonly versionFilePath: 'mediapipe/version.bzl';
    readonly topologySourcePath: 'mediapipe/tasks/web/vision/face_landmarker/face_landmarks_connections.ts';
    readonly topologySourceBlobSha: '644de9d8c7cd90880d92b2393b4913fa93ace927';
    readonly evidenceRefs: readonly string[];
    readonly snapshotMeaning: 'development_version_source_snapshot';
    readonly releaseExactForPublishedPackage: false;
  };

  readonly laterality: {
    readonly symbols: readonly ProviderLateralitySymbolV1[];
    readonly providerSymbolNamingObserved: true;
    readonly captureMirrorContractRef: null;
    readonly captureTransformState: 'unresolved';
    readonly imageSpaceXOrderingMayDefineAnatomicalSide: false;
    readonly productionLateralityBindingAllowed: false;
  };

  readonly publishedBundleTopologyEvidenceRef: null;
  readonly releaseExactState: 'unresolved';
  readonly providerActivationAllowed: false;
  readonly prohibitedPromotions: readonly [
    'development_version_snapshot_to_release_exact',
    'provider_left_right_symbol_to_image_x_order',
    'selfie_preview_orientation_to_canonical_orientation',
    'package_dependency_presence_to_runtime_geometry_authority',
  ];
}

export interface ProviderReleaseAttestationReadinessFR18V1 {
  readonly productionReady: false;
  readonly releaseExactState: 'unresolved';
  readonly lateralityState: 'unresolved';
  readonly blockers: readonly string[];
}

const HEX40 = /^[0-9a-f]{40}$/u;

const ALLOWED_EVIDENCE_KEYS = new Set([
  'evidenceRef', 'evidenceClass', 'sourceRef', 'observedValue', 'verificationState', 'authorityState', 'limitations',
]);
const ALLOWED_ATTESTATION_KEYS = new Set([
  'schemaVersion', 'attestationVersion', 'authorityState', 'providerKey', 'consumerDependency',
  'publishedPackageMetadata', 'upstreamVersionSnapshot', 'laterality', 'publishedBundleTopologyEvidenceRef',
  'releaseExactState', 'providerActivationAllowed', 'prohibitedPromotions',
]);
const ALLOWED_DEPENDENCY_KEYS = new Set([
  'repository', 'repositoryCommit', 'packageManifestPath', 'packageManifestBlobSha', 'packageName', 'packageVersion', 'evidenceRef',
]);
const ALLOWED_PACKAGE_METADATA_KEYS = new Set([
  'packageName', 'packageVersion', 'browserEntry', 'typeEntry', 'evidenceRef', 'topologyBytesAttested',
]);
const ALLOWED_SOURCE_SNAPSHOT_KEYS = new Set([
  'repository', 'versionBumpCommit', 'versionFilePath', 'topologySourcePath', 'topologySourceBlobSha', 'evidenceRefs',
  'snapshotMeaning', 'releaseExactForPublishedPackage',
]);
const ALLOWED_LATERALITY_KEYS = new Set([
  'symbols', 'providerSymbolNamingObserved', 'captureMirrorContractRef', 'captureTransformState',
  'imageSpaceXOrderingMayDefineAnatomicalSide', 'productionLateralityBindingAllowed',
]);
const ALLOWED_LATERALITY_SYMBOL_KEYS = new Set([
  'providerTopologySymbol', 'providerSideLabel', 'consumerSlot', 'imageSpaceInferenceAllowed',
]);

function exactKeys(value: object, allowed: ReadonlySet<string>, path: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected !== undefined) {
    throw new FaceAuthorityValidationError(`${path} contains unauthorized field: ${unexpected}`);
  }
}

function nonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) throw new FaceAuthorityValidationError(`${path} must be non-empty.`);
}

function commitSha(value: string, path: string): void {
  if (!HEX40.test(value)) throw new FaceAuthorityValidationError(`${path} must be a 40-char lowercase git SHA.`);
}

function unique(values: readonly string[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new FaceAuthorityValidationError(`${path} contains duplicate: ${value}`);
    seen.add(value);
  }
}

export const PROVIDER_RELEASE_EVIDENCE_FR18: readonly ProviderReleaseEvidenceRecordV1[] = Object.freeze([
  Object.freeze({
    evidenceRef: 'evidence.fr18.kbeauty.tasks_vision_dependency',
    evidenceClass: 'consumer_dependency_pin' as const,
    sourceRef: 'github:gycha0109-beep/K_beauty@81c3b4139efdffc785439da005557dc38a6b4873:package.json#blob-4cd6b7f65223857505578fcb8ca27a033e8361b6',
    observedValue: '@mediapipe/tasks-vision is pinned to 0.10.35 in the inspected K_beauty package manifest',
    verificationState: 'repository_exact' as const,
    authorityState: 'research_only' as const,
    limitations: Object.freeze([
      'dependency presence does not establish that the current FaceLab runtime executes MediaPipe geometry extraction',
      'dependency presence does not attest the bytes or topology exported by the published npm artifact',
    ]),
  }),
  Object.freeze({
    evidenceRef: 'evidence.fr18.npm.tasks_vision_0_10_35_metadata',
    evidenceClass: 'public_package_metadata' as const,
    sourceRef: 'unpkg:@mediapipe/tasks-vision@0.10.35/package.json',
    observedValue: 'published package metadata identifies version 0.10.35 and browser/module entry vision_bundle.mjs with types vision.d.ts',
    verificationState: 'public_registry_metadata' as const,
    authorityState: 'research_only' as const,
    limitations: Object.freeze([
      'package metadata proves package identity and entry points only',
      'FR-18 has not captured a cryptographic digest or source-map provenance linking published bundle topology bytes to an upstream source commit',
    ]),
  }),
  Object.freeze({
    evidenceRef: 'evidence.fr18.mediapipe.version_bump_0_10_35',
    evidenceClass: 'upstream_version_bump' as const,
    sourceRef: 'github:google-ai-edge/mediapipe@9d38d191b060cbfeaeb0c1aa20e47201f032ea35:mediapipe/version.bzl',
    observedValue: 'MEDIAPIPE_FULL_VERSION changed from 0.10.34 to 0.10.35 and the file describes it as the next/currently-in-development version',
    verificationState: 'repository_exact' as const,
    authorityState: 'research_only' as const,
    limitations: Object.freeze([
      'the version bump commit is a development source snapshot, not sufficient publication provenance for the npm 0.10.35 artifact',
    ]),
  }),
  Object.freeze({
    evidenceRef: 'evidence.fr18.mediapipe.face_connections_snapshot_0_10_35_dev',
    evidenceClass: 'upstream_topology_snapshot' as const,
    sourceRef: 'github:google-ai-edge/mediapipe@9d38d191b060cbfeaeb0c1aa20e47201f032ea35:mediapipe/tasks/web/vision/face_landmarker/face_landmarks_connections.ts#blob-644de9d8c7cd90880d92b2393b4913fa93ace927',
    observedValue: 'the 0.10.35 development-version source snapshot exports named left/right eye and eyebrow connection sets matching the FR-16 topology classes',
    verificationState: 'repository_exact' as const,
    authorityState: 'research_only' as const,
    limitations: Object.freeze([
      'named source symbols do not define the capture pipeline mirror transform',
      'this source snapshot is not yet proven byte-exact to the published npm 0.10.35 bundle',
    ]),
  }),
]);

const LATERALITY_SYMBOLS_FR18: readonly ProviderLateralitySymbolV1[] = Object.freeze([
  Object.freeze({
    providerTopologySymbol: 'FACE_LANDMARKS_LEFT_EYE' as const,
    providerSideLabel: 'left' as const,
    consumerSlot: 'neutral.face.left_eye_region' as const,
    imageSpaceInferenceAllowed: false as const,
  }),
  Object.freeze({
    providerTopologySymbol: 'FACE_LANDMARKS_RIGHT_EYE' as const,
    providerSideLabel: 'right' as const,
    consumerSlot: 'neutral.face.right_eye_region' as const,
    imageSpaceInferenceAllowed: false as const,
  }),
  Object.freeze({
    providerTopologySymbol: 'FACE_LANDMARKS_LEFT_EYEBROW' as const,
    providerSideLabel: 'left' as const,
    consumerSlot: 'neutral.face.left_brow_region' as const,
    imageSpaceInferenceAllowed: false as const,
  }),
  Object.freeze({
    providerTopologySymbol: 'FACE_LANDMARKS_RIGHT_EYEBROW' as const,
    providerSideLabel: 'right' as const,
    consumerSlot: 'neutral.face.right_brow_region' as const,
    imageSpaceInferenceAllowed: false as const,
  }),
]);

export const PROVIDER_RELEASE_ATTESTATION_FR18: ProviderReleaseAttestationFR18V1 = Object.freeze({
  schemaVersion: 'v1' as const,
  attestationVersion: '0.1.0',
  authorityState: 'research_only' as const,
  providerKey: 'mediapipe_tasks_vision' as const,
  consumerDependency: Object.freeze({
    repository: 'gycha0109-beep/K_beauty' as const,
    repositoryCommit: '81c3b4139efdffc785439da005557dc38a6b4873',
    packageManifestPath: 'package.json' as const,
    packageManifestBlobSha: '4cd6b7f65223857505578fcb8ca27a033e8361b6',
    packageName: '@mediapipe/tasks-vision' as const,
    packageVersion: '0.10.35' as const,
    evidenceRef: 'evidence.fr18.kbeauty.tasks_vision_dependency',
  }),
  publishedPackageMetadata: Object.freeze({
    packageName: '@mediapipe/tasks-vision' as const,
    packageVersion: '0.10.35' as const,
    browserEntry: 'vision_bundle.mjs' as const,
    typeEntry: 'vision.d.ts' as const,
    evidenceRef: 'evidence.fr18.npm.tasks_vision_0_10_35_metadata',
    topologyBytesAttested: false as const,
  }),
  upstreamVersionSnapshot: Object.freeze({
    repository: 'google-ai-edge/mediapipe' as const,
    versionBumpCommit: '9d38d191b060cbfeaeb0c1aa20e47201f032ea35' as const,
    versionFilePath: 'mediapipe/version.bzl' as const,
    topologySourcePath: 'mediapipe/tasks/web/vision/face_landmarker/face_landmarks_connections.ts' as const,
    topologySourceBlobSha: '644de9d8c7cd90880d92b2393b4913fa93ace927' as const,
    evidenceRefs: Object.freeze([
      'evidence.fr18.mediapipe.version_bump_0_10_35',
      'evidence.fr18.mediapipe.face_connections_snapshot_0_10_35_dev',
    ]),
    snapshotMeaning: 'development_version_source_snapshot' as const,
    releaseExactForPublishedPackage: false as const,
  }),
  laterality: Object.freeze({
    symbols: LATERALITY_SYMBOLS_FR18,
    providerSymbolNamingObserved: true as const,
    captureMirrorContractRef: null,
    captureTransformState: 'unresolved' as const,
    imageSpaceXOrderingMayDefineAnatomicalSide: false as const,
    productionLateralityBindingAllowed: false as const,
  }),
  publishedBundleTopologyEvidenceRef: null,
  releaseExactState: 'unresolved' as const,
  providerActivationAllowed: false as const,
  prohibitedPromotions: Object.freeze([
    'development_version_snapshot_to_release_exact',
    'provider_left_right_symbol_to_image_x_order',
    'selfie_preview_orientation_to_canonical_orientation',
    'package_dependency_presence_to_runtime_geometry_authority',
  ] as const),
});

function evidenceByRef(evidenceRef: string): ProviderReleaseEvidenceRecordV1 | null {
  return PROVIDER_RELEASE_EVIDENCE_FR18.find((entry) => entry.evidenceRef === evidenceRef) ?? null;
}

export function validateProviderReleaseEvidenceFR18(
  evidence: readonly ProviderReleaseEvidenceRecordV1[] = PROVIDER_RELEASE_EVIDENCE_FR18,
): readonly ProviderReleaseEvidenceRecordV1[] {
  unique(evidence.map((entry) => entry.evidenceRef), 'fr18.evidenceRefs');
  for (const entry of evidence) {
    exactKeys(entry, ALLOWED_EVIDENCE_KEYS, `FR-18 evidence ${entry.evidenceRef}`);
    nonEmpty(entry.evidenceRef, 'fr18.evidenceRef');
    nonEmpty(entry.sourceRef, `fr18.${entry.evidenceRef}.sourceRef`);
    nonEmpty(entry.observedValue, `fr18.${entry.evidenceRef}.observedValue`);
    if (entry.authorityState !== 'research_only') throw new FaceAuthorityValidationError(`FR-18 evidence must remain research_only: ${entry.evidenceRef}`);
    if (entry.limitations.length === 0) throw new FaceAuthorityValidationError(`FR-18 evidence requires limitations: ${entry.evidenceRef}`);
  }
  return evidence;
}

export function validateProviderReleaseAttestationFR18(
  attestation: ProviderReleaseAttestationFR18V1 = PROVIDER_RELEASE_ATTESTATION_FR18,
): ProviderReleaseAttestationFR18V1 {
  validateProviderReleaseEvidenceFR18();
  exactKeys(attestation, ALLOWED_ATTESTATION_KEYS, 'FR-18 attestation');
  if (attestation.schemaVersion !== 'v1') throw new FaceAuthorityValidationError('FR-18 schemaVersion must be v1.');
  nonEmpty(attestation.attestationVersion, 'fr18.attestationVersion');
  if (attestation.authorityState !== 'research_only') throw new FaceAuthorityValidationError('FR-18 authorityState must remain research_only.');
  if (attestation.providerKey !== 'mediapipe_tasks_vision') throw new FaceAuthorityValidationError('FR-18 providerKey mismatch.');

  exactKeys(attestation.consumerDependency, ALLOWED_DEPENDENCY_KEYS, 'FR-18 consumerDependency');
  commitSha(attestation.consumerDependency.repositoryCommit, 'fr18.consumerDependency.repositoryCommit');
  commitSha(attestation.consumerDependency.packageManifestBlobSha, 'fr18.consumerDependency.packageManifestBlobSha');
  const fr16Dependency = FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.dependencyEvidence;
  if (
    attestation.consumerDependency.repository !== fr16Dependency.repository ||
    attestation.consumerDependency.repositoryCommit !== fr16Dependency.repositoryCommit ||
    attestation.consumerDependency.packageManifestBlobSha !== fr16Dependency.packageManifestBlobSha ||
    attestation.consumerDependency.packageName !== fr16Dependency.packageName ||
    attestation.consumerDependency.packageVersion !== fr16Dependency.packageVersion
  ) {
    throw new FaceAuthorityValidationError('FR-18 consumer dependency must exactly match the merged FR-16 dependency evidence.');
  }
  if (evidenceByRef(attestation.consumerDependency.evidenceRef) === null) {
    throw new FaceAuthorityValidationError('FR-18 consumer dependency evidenceRef is unresolved.');
  }

  exactKeys(attestation.publishedPackageMetadata, ALLOWED_PACKAGE_METADATA_KEYS, 'FR-18 publishedPackageMetadata');
  if (attestation.publishedPackageMetadata.packageName !== attestation.consumerDependency.packageName ||
      attestation.publishedPackageMetadata.packageVersion !== attestation.consumerDependency.packageVersion) {
    throw new FaceAuthorityValidationError('FR-18 published package metadata must match the pinned consumer dependency.');
  }
  if (attestation.publishedPackageMetadata.topologyBytesAttested !== false) {
    throw new FaceAuthorityValidationError('FR-18 v0.1 has no published bundle topology-byte attestation.');
  }
  if (evidenceByRef(attestation.publishedPackageMetadata.evidenceRef) === null) {
    throw new FaceAuthorityValidationError('FR-18 package metadata evidenceRef is unresolved.');
  }

  exactKeys(attestation.upstreamVersionSnapshot, ALLOWED_SOURCE_SNAPSHOT_KEYS, 'FR-18 upstreamVersionSnapshot');
  commitSha(attestation.upstreamVersionSnapshot.versionBumpCommit, 'fr18.upstreamVersionSnapshot.versionBumpCommit');
  commitSha(attestation.upstreamVersionSnapshot.topologySourceBlobSha, 'fr18.upstreamVersionSnapshot.topologySourceBlobSha');
  if (attestation.upstreamVersionSnapshot.snapshotMeaning !== 'development_version_source_snapshot' ||
      attestation.upstreamVersionSnapshot.releaseExactForPublishedPackage !== false) {
    throw new FaceAuthorityValidationError('FR-18 version-bump source snapshot must not be promoted to release-exact publication evidence.');
  }
  unique(attestation.upstreamVersionSnapshot.evidenceRefs, 'fr18.upstreamVersionSnapshot.evidenceRefs');
  if (attestation.upstreamVersionSnapshot.evidenceRefs.length < 2) {
    throw new FaceAuthorityValidationError('FR-18 source snapshot requires both version-bump and topology evidence.');
  }
  attestation.upstreamVersionSnapshot.evidenceRefs.forEach((ref) => {
    if (evidenceByRef(ref) === null) throw new FaceAuthorityValidationError(`FR-18 source snapshot evidenceRef is unresolved: ${ref}`);
  });

  exactKeys(attestation.laterality, ALLOWED_LATERALITY_KEYS, 'FR-18 laterality');
  if (attestation.laterality.providerSymbolNamingObserved !== true) throw new FaceAuthorityValidationError('FR-18 provider symbol naming must be observed.');
  if (attestation.laterality.captureTransformState !== 'unresolved') throw new FaceAuthorityValidationError('FR-18 capture transform must remain unresolved.');
  if (attestation.laterality.captureMirrorContractRef !== null) throw new FaceAuthorityValidationError('FR-18 unresolved capture transform cannot carry a mirror contract ref.');
  if (attestation.laterality.imageSpaceXOrderingMayDefineAnatomicalSide !== false ||
      attestation.laterality.productionLateralityBindingAllowed !== false) {
    throw new FaceAuthorityValidationError('FR-18 laterality must not infer anatomical side from image-space ordering.');
  }

  unique(attestation.laterality.symbols.map((entry) => entry.providerTopologySymbol), 'fr18.laterality.symbols');
  unique(attestation.laterality.symbols.map((entry) => entry.consumerSlot), 'fr18.laterality.consumerSlots');
  if (attestation.laterality.symbols.length !== 4) throw new FaceAuthorityValidationError('FR-18 must attest exactly four left/right eye/brow symbols.');
  const fr16Slots = new Map(FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.slotEvidence.map((entry) => [entry.consumerSlot, entry.providerTopologySymbol] as const));
  for (const symbol of attestation.laterality.symbols) {
    exactKeys(symbol, ALLOWED_LATERALITY_SYMBOL_KEYS, `FR-18 laterality ${symbol.providerTopologySymbol}`);
    if (symbol.imageSpaceInferenceAllowed !== false) throw new FaceAuthorityValidationError(`FR-18 image-space inference is forbidden: ${symbol.providerTopologySymbol}`);
    const expectedProviderSymbol = fr16Slots.get(symbol.consumerSlot);
    if (expectedProviderSymbol !== symbol.providerTopologySymbol) {
      throw new FaceAuthorityValidationError(`FR-18 laterality symbol does not match FR-16 slot evidence: ${symbol.consumerSlot}`);
    }
    const expectedSide = symbol.providerTopologySymbol.includes('_LEFT_') ? 'left' : 'right';
    if (symbol.providerSideLabel !== expectedSide) throw new FaceAuthorityValidationError(`FR-18 provider side label mismatch: ${symbol.providerTopologySymbol}`);
  }

  if (attestation.publishedBundleTopologyEvidenceRef !== null || attestation.releaseExactState !== 'unresolved') {
    throw new FaceAuthorityValidationError('FR-18 v0.1 release-exact topology provenance remains unresolved.');
  }
  if (attestation.providerActivationAllowed !== false) {
    throw new FaceAuthorityValidationError('FR-18 provider activation must remain blocked while release exactness/laterality are unresolved.');
  }
  if (attestation.prohibitedPromotions.length !== 4) throw new FaceAuthorityValidationError('FR-18 prohibited promotion set is incomplete.');
  return attestation;
}

export function assessProviderReleaseAttestationReadinessFR18(
  attestation: ProviderReleaseAttestationFR18V1 = PROVIDER_RELEASE_ATTESTATION_FR18,
): ProviderReleaseAttestationReadinessFR18V1 {
  validateProviderReleaseAttestationFR18(attestation);
  return Object.freeze({
    productionReady: false,
    releaseExactState: 'unresolved' as const,
    lateralityState: 'unresolved' as const,
    blockers: Object.freeze([
      'published npm 0.10.35 bundle topology bytes are not cryptographically/provenance-attested to the inspected upstream source snapshot',
      'the upstream 0.10.35 version-bump commit is a development source snapshot rather than sufficient npm publication provenance',
      'capture/selfie mirroring and canonical orientation contract is unresolved',
      'image-space x ordering cannot be used as anatomical left/right authority',
      'current K_beauty FaceLab runtime still does not establish MediaPipe neutral geometry as its canonical observation authority',
    ]),
  });
}
