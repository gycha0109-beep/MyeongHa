import {
  FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL,
  FR26_MEDIAPIPE_WASM_ROOT,
  MEDIAPIPE_FACE_LANDMARKER_RUNTIME_EVIDENCE_FR26,
} from './mediapipe-face-landmarker-runtime-fr26.js';
import {
  FR27_EXPECTED_INSTALLED_WASM_DIGESTS,
  MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27,
  type MediaPipeRuntimeFileDigestFR27V1,
} from './mediapipe-real-runtime-evidence-fr27.js';
import { FaceAuthorityValidationError } from './validation.js';

export interface MediaPipeDefaultNetworkRuntimeEvidenceFR28V1 {
  readonly schemaVersion: 'fr28-v1';
  readonly evidenceRef: 'evidence.face.mediapipe_default_network_runtime.fr28';
  readonly evidenceVersion: '0.1.0';
  readonly authorityState: 'default_network_runtime_verification_only';
  readonly verifiedRuntimeRef: 'runtime.face.mediapipe_face_landmarker.fr26@0.1.0';
  readonly inheritedRealRuntimeEvidenceRef: 'evidence.face.mediapipe_real_runtime.fr27@0.1.0';
  readonly executionSource: {
    readonly repository: 'gycha0109-beep/MyeongHa';
    readonly executionHeadSha: string;
    readonly checkoutMergeSha: string;
    readonly workflowRunId: 33142936129;
    readonly workflowPath: '.github/workflows/face-reading-default-network-runtime-e2e.yml';
    readonly workflowBlobSha: string;
    readonly harnessPath: 'scripts/face-reading-fr28-default-network-runtime-e2e.mjs';
    readonly harnessBlobSha: string;
    readonly artifactId: 9674675558;
    readonly artifactArchiveDigest: string;
  };
  readonly packageResolution: {
    readonly packageName: '@mediapipe/tasks-vision';
    readonly packageVersion: '0.10.35';
    readonly browserResolutionMode: 'import_map_to_exact_installed_bundle';
    readonly installedBundleDigest: string;
    readonly remotePackageBundleClaimed: false;
  };
  readonly wasmReference: {
    readonly rootRef: typeof FR26_MEDIAPIPE_WASM_ROOT;
    readonly allShippedFilesByteEquivalentToInstalledPackage: true;
    readonly digests: readonly MediaPipeRuntimeFileDigestFR27V1[];
    readonly browserSelectedFiles: readonly ['vision_wasm_internal.js', 'vision_wasm_internal.wasm'];
  };
  readonly modelReference: {
    readonly assetRef: typeof FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL;
    readonly digest: string;
    readonly byteLength: 3758596;
    readonly referenceBytesVerified: true;
  };
  readonly networkObservation: {
    readonly browserFamily: 'Google Chrome';
    readonly browserVersion: '151.0.7922.173';
    readonly observationWindowMsAfterReplay: 1000;
    readonly requestPolicy: 'pinned_asset_get_only';
    readonly observedExternalRequestCounts: {
      readonly wasmLoader: 1;
      readonly wasmBinary: 2;
      readonly model: 2;
    };
    readonly allObservedResponses2xx: true;
    readonly unexpectedExternalRequestCount: 0;
    readonly telemetryAbsenceClaimed: false;
  };
  readonly execution: {
    readonly defaultFactoryInjected: false;
    readonly replayCount: 2;
    readonly deterministicReplay: true;
    readonly imageDimensions: readonly [640, 640];
    readonly researchRegionCount: 2;
    readonly boundaryVertexCounts: readonly [16, 16];
    readonly sideAuthority: 'provider_label_only';
    readonly consumerSlotAssignment: null;
  };
  readonly rawImagePersisted: false;
  readonly rawProviderResponsePersisted: false;
  readonly biometricEmbeddingPersisted: false;
  readonly productionNeutralObservationIssued: false;
  readonly productionProviderActivationAllowed: false;
  readonly providerConformanceClaimed: false;
  readonly anatomicalLateralityResolved: false;
  readonly traditionalSemanticAuthority: false;
}

export interface MediaPipeDefaultNetworkRuntimeReadinessFR28V1 {
  readonly defaultFactoryExecutionVerified: true;
  readonly wasmReferenceRootByteEquivalenceVerified: true;
  readonly modelReferenceBytesVerified: true;
  readonly boundedExternalRequestSetVerified: true;
  readonly telemetryAbsenceClaimed: false;
  readonly providerConformanceReady: false;
  readonly productionProviderActivationReady: false;
  readonly anatomicalLateralityReady: false;
  readonly traditionalSemanticAuthorityGranted: false;
  readonly blockers: readonly string[];
}

export const MEDIAPIPE_DEFAULT_NETWORK_RUNTIME_EVIDENCE_FR28: MediaPipeDefaultNetworkRuntimeEvidenceFR28V1 = Object.freeze({
  schemaVersion: 'fr28-v1' as const,
  evidenceRef: 'evidence.face.mediapipe_default_network_runtime.fr28' as const,
  evidenceVersion: '0.1.0' as const,
  authorityState: 'default_network_runtime_verification_only' as const,
  verifiedRuntimeRef: 'runtime.face.mediapipe_face_landmarker.fr26@0.1.0' as const,
  inheritedRealRuntimeEvidenceRef: 'evidence.face.mediapipe_real_runtime.fr27@0.1.0' as const,
  executionSource: Object.freeze({
    repository: 'gycha0109-beep/MyeongHa' as const,
    executionHeadSha: '0c7801b77e43225b1dd4d46339c8b94143bd161c',
    checkoutMergeSha: '96d0ffd9bd58ccd78ebd9281d6d9055429a6f1a4',
    workflowRunId: 33142936129 as const,
    workflowPath: '.github/workflows/face-reading-default-network-runtime-e2e.yml' as const,
    workflowBlobSha: '2a612638be414b2d2e32b8a67f3bcfa981cc2ab0',
    harnessPath: 'scripts/face-reading-fr28-default-network-runtime-e2e.mjs' as const,
    harnessBlobSha: 'd240bef680d109b42a7bc78bd9fed389c7f392fb',
    artifactId: 9674675558 as const,
    artifactArchiveDigest: 'sha256:95b3a939c363424f9c820769edd0e38f3df7c36bd6d35ed962cfce3728235471',
  }),
  packageResolution: Object.freeze({
    packageName: '@mediapipe/tasks-vision' as const,
    packageVersion: '0.10.35' as const,
    browserResolutionMode: 'import_map_to_exact_installed_bundle' as const,
    installedBundleDigest: MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27.installedPackageAssets.packageBundleDigest,
    remotePackageBundleClaimed: false as const,
  }),
  wasmReference: Object.freeze({
    rootRef: FR26_MEDIAPIPE_WASM_ROOT,
    allShippedFilesByteEquivalentToInstalledPackage: true as const,
    digests: FR27_EXPECTED_INSTALLED_WASM_DIGESTS,
    browserSelectedFiles: Object.freeze(['vision_wasm_internal.js', 'vision_wasm_internal.wasm'] as const),
  }),
  modelReference: Object.freeze({
    assetRef: FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL,
    digest: MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27.model.independentByteDigest,
    byteLength: 3758596 as const,
    referenceBytesVerified: true as const,
  }),
  networkObservation: Object.freeze({
    browserFamily: 'Google Chrome' as const,
    browserVersion: '151.0.7922.173' as const,
    observationWindowMsAfterReplay: 1000 as const,
    requestPolicy: 'pinned_asset_get_only' as const,
    observedExternalRequestCounts: Object.freeze({
      wasmLoader: 1 as const,
      wasmBinary: 2 as const,
      model: 2 as const,
    }),
    allObservedResponses2xx: true as const,
    unexpectedExternalRequestCount: 0 as const,
    telemetryAbsenceClaimed: false as const,
  }),
  execution: Object.freeze({
    defaultFactoryInjected: false as const,
    replayCount: 2 as const,
    deterministicReplay: true as const,
    imageDimensions: Object.freeze([640, 640] as const),
    researchRegionCount: 2 as const,
    boundaryVertexCounts: Object.freeze([16, 16] as const),
    sideAuthority: 'provider_label_only' as const,
    consumerSlotAssignment: null,
  }),
  rawImagePersisted: false as const,
  rawProviderResponsePersisted: false as const,
  biometricEmbeddingPersisted: false as const,
  productionNeutralObservationIssued: false as const,
  productionProviderActivationAllowed: false as const,
  providerConformanceClaimed: false as const,
  anatomicalLateralityResolved: false as const,
  traditionalSemanticAuthority: false as const,
});

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const HEX40 = /^[0-9a-f]{40}$/u;

function sha256(value: string, path: string): void {
  if (!SHA256.test(value)) throw new FaceAuthorityValidationError(`${path} must be sha256:<64 lowercase hex>.`);
}

function gitSha(value: string, path: string): void {
  if (!HEX40.test(value)) throw new FaceAuthorityValidationError(`${path} must be a 40-char lowercase git SHA.`);
}

function exactTuple(actual: readonly number[], expected: readonly number[], path: string): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new FaceAuthorityValidationError(`${path} mismatch.`);
  }
}

export function validateMediaPipeDefaultNetworkRuntimeEvidenceFR28(
  evidence: MediaPipeDefaultNetworkRuntimeEvidenceFR28V1 = MEDIAPIPE_DEFAULT_NETWORK_RUNTIME_EVIDENCE_FR28,
): MediaPipeDefaultNetworkRuntimeEvidenceFR28V1 {
  if (evidence.schemaVersion !== 'fr28-v1' || evidence.evidenceVersion !== '0.1.0') {
    throw new FaceAuthorityValidationError('FR-28 evidence schema/version mismatch.');
  }
  if (evidence.authorityState !== 'default_network_runtime_verification_only') {
    throw new FaceAuthorityValidationError('FR-28 authorityState must remain default_network_runtime_verification_only.');
  }
  if (evidence.verifiedRuntimeRef !== `${MEDIAPIPE_FACE_LANDMARKER_RUNTIME_EVIDENCE_FR26.runtimeId}@${MEDIAPIPE_FACE_LANDMARKER_RUNTIME_EVIDENCE_FR26.runtimeVersion}`) {
    throw new FaceAuthorityValidationError('FR-28 must pin the exact FR-26 runtime identity.');
  }
  if (evidence.inheritedRealRuntimeEvidenceRef !== `${MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27.evidenceRef}@${MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27.evidenceVersion}`) {
    throw new FaceAuthorityValidationError('FR-28 must pin the exact FR-27 real-runtime evidence identity.');
  }

  gitSha(evidence.executionSource.executionHeadSha, 'fr28.executionHeadSha');
  gitSha(evidence.executionSource.checkoutMergeSha, 'fr28.checkoutMergeSha');
  gitSha(evidence.executionSource.workflowBlobSha, 'fr28.workflowBlobSha');
  gitSha(evidence.executionSource.harnessBlobSha, 'fr28.harnessBlobSha');
  sha256(evidence.executionSource.artifactArchiveDigest, 'fr28.artifactArchiveDigest');

  if (evidence.packageResolution.packageName !== MEDIAPIPE_FACE_LANDMARKER_RUNTIME_EVIDENCE_FR26.runtimePackageName ||
      evidence.packageResolution.packageVersion !== MEDIAPIPE_FACE_LANDMARKER_RUNTIME_EVIDENCE_FR26.runtimePackageVersion ||
      evidence.packageResolution.browserResolutionMode !== 'import_map_to_exact_installed_bundle' ||
      evidence.packageResolution.remotePackageBundleClaimed !== false) {
    throw new FaceAuthorityValidationError('FR-28 package resolution boundary mismatch.');
  }
  if (evidence.packageResolution.installedBundleDigest !== MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27.installedPackageAssets.packageBundleDigest) {
    throw new FaceAuthorityValidationError('FR-28 installed package bundle digest must remain aligned to FR-27.');
  }
  sha256(evidence.packageResolution.installedBundleDigest, 'fr28.installedBundleDigest');

  if (evidence.wasmReference.rootRef !== FR26_MEDIAPIPE_WASM_ROOT || evidence.wasmReference.allShippedFilesByteEquivalentToInstalledPackage !== true) {
    throw new FaceAuthorityValidationError('FR-28 must verify byte equivalence for the exact FR-26 WASM reference root.');
  }
  if (evidence.wasmReference.digests.length !== FR27_EXPECTED_INSTALLED_WASM_DIGESTS.length) {
    throw new FaceAuthorityValidationError('FR-28 WASM digest set is incomplete.');
  }
  for (let index = 0; index < FR27_EXPECTED_INSTALLED_WASM_DIGESTS.length; index += 1) {
    const actual = evidence.wasmReference.digests[index]!;
    const expected = FR27_EXPECTED_INSTALLED_WASM_DIGESTS[index]!;
    if (actual.file !== expected.file || actual.digest !== expected.digest) {
      throw new FaceAuthorityValidationError(`FR-28 WASM digest mismatch: ${expected.file}`);
    }
    sha256(actual.digest, `fr28.wasm.${actual.file}`);
  }
  if (evidence.wasmReference.browserSelectedFiles.join('|') !== 'vision_wasm_internal.js|vision_wasm_internal.wasm') {
    throw new FaceAuthorityValidationError('FR-28 browser-selected WASM files mismatch.');
  }

  if (evidence.modelReference.assetRef !== FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL ||
      evidence.modelReference.digest !== MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27.model.independentByteDigest ||
      evidence.modelReference.referenceBytesVerified !== true) {
    throw new FaceAuthorityValidationError('FR-28 model reference evidence mismatch.');
  }
  sha256(evidence.modelReference.digest, 'fr28.modelReference.digest');

  if (evidence.networkObservation.requestPolicy !== 'pinned_asset_get_only' ||
      evidence.networkObservation.allObservedResponses2xx !== true ||
      evidence.networkObservation.unexpectedExternalRequestCount !== 0 ||
      evidence.networkObservation.telemetryAbsenceClaimed !== false) {
    throw new FaceAuthorityValidationError('FR-28 bounded network observation may not admit unexpected requests or claim telemetry absence.');
  }
  if (evidence.networkObservation.observedExternalRequestCounts.wasmLoader !== 1 ||
      evidence.networkObservation.observedExternalRequestCounts.wasmBinary !== 2 ||
      evidence.networkObservation.observedExternalRequestCounts.model !== 2) {
    throw new FaceAuthorityValidationError('FR-28 observed external request counts mismatch.');
  }

  if (evidence.execution.defaultFactoryInjected !== false || evidence.execution.replayCount !== 2 || evidence.execution.deterministicReplay !== true) {
    throw new FaceAuthorityValidationError('FR-28 requires two deterministic executions through the non-injected FR-26 default factory.');
  }
  exactTuple(evidence.execution.imageDimensions, [640, 640], 'fr28.imageDimensions');
  exactTuple(evidence.execution.boundaryVertexCounts, [16, 16], 'fr28.boundaryVertexCounts');
  if (evidence.execution.researchRegionCount !== 2 || evidence.execution.sideAuthority !== 'provider_label_only' || evidence.execution.consumerSlotAssignment !== null) {
    throw new FaceAuthorityValidationError('FR-28 research projection shape or side authority mismatch.');
  }

  if (evidence.rawImagePersisted !== false || evidence.rawProviderResponsePersisted !== false ||
      evidence.biometricEmbeddingPersisted !== false || evidence.productionNeutralObservationIssued !== false ||
      evidence.productionProviderActivationAllowed !== false || evidence.providerConformanceClaimed !== false ||
      evidence.anatomicalLateralityResolved !== false || evidence.traditionalSemanticAuthority !== false) {
    throw new FaceAuthorityValidationError('FR-28 cannot promote persistence, provider conformance, production activation, anatomical laterality, or traditional semantics.');
  }
  return evidence;
}

export function assessMediaPipeDefaultNetworkRuntimeFR28(): MediaPipeDefaultNetworkRuntimeReadinessFR28V1 {
  validateMediaPipeDefaultNetworkRuntimeEvidenceFR28();
  return Object.freeze({
    defaultFactoryExecutionVerified: true as const,
    wasmReferenceRootByteEquivalenceVerified: true as const,
    modelReferenceBytesVerified: true as const,
    boundedExternalRequestSetVerified: true as const,
    telemetryAbsenceClaimed: false as const,
    providerConformanceReady: false as const,
    productionProviderActivationReady: false as const,
    anatomicalLateralityReady: false as const,
    traditionalSemanticAuthorityGranted: false as const,
    blockers: Object.freeze([
      'FR-28 resolves the browser bare-package import through an import map to the exact installed @mediapipe/tasks-vision@0.10.35 bundle; it does not attest any future production bundler output',
      'FR-28 observes only a bounded one-second post-replay browser network window and explicitly does not prove telemetry absence or satisfy the MediaPipe Tasks production privacy/metrics review',
      'FR-18 consumer lockfile attestation still does not establish release-exact upstream source equivalence for @mediapipe/tasks-vision@0.10.35',
      'FR-22 verified provider implementation registry remains empty and requires the full six-slot neutral observation capability set',
      'FR-23 reviewed provider conformance evidence registry remains empty',
      'provider LEFT/RIGHT labels remain provider provenance only and do not resolve anatomical laterality',
      'FR-28 verifies only the FR-24 research eye-pair path and grants no traditional physiognomy semantics',
    ]),
  });
}
