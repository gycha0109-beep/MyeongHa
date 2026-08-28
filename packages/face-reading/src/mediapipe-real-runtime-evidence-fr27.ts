import {
  MEDIAPIPE_EYE_LANDMARK_ADAPTER_EVIDENCE_FR25,
} from './mediapipe-eye-landmark-adapter-fr25.js';
import {
  FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL,
  FR26_MEDIAPIPE_WASM_ROOT,
  MEDIAPIPE_FACE_LANDMARKER_RUNTIME_EVIDENCE_FR26,
} from './mediapipe-face-landmarker-runtime-fr26.js';
import { FaceAuthorityValidationError } from './validation.js';

export interface MediaPipeRuntimeFileDigestFR27V1 {
  readonly file: string;
  readonly digest: string;
}

export interface MediaPipeRealRuntimeVerificationEvidenceFR27V1 {
  readonly schemaVersion: 'fr27-v1';
  readonly evidenceRef: 'evidence.face.mediapipe_real_runtime.fr27';
  readonly evidenceVersion: '0.1.0';
  readonly authorityState: 'runtime_execution_verification_only';
  readonly verifiedRuntimeRef: 'runtime.face.mediapipe_face_landmarker.fr26@0.1.0';
  readonly verifiedAdapterRef: 'adapter.face.mediapipe_eye_landmarks.fr25@0.1.0';
  readonly runtimePackageName: '@mediapipe/tasks-vision';
  readonly runtimePackageVersion: '0.10.35';
  readonly executionSource: {
    readonly repository: 'gycha0109-beep/MyeongHa';
    readonly executionHeadSha: string;
    readonly checkoutMergeSha: string;
    readonly workflowRunId: 33142026425;
    readonly workflowPath: '.github/workflows/face-reading-real-runtime-e2e.yml';
    readonly workflowBlobSha: string;
    readonly harnessPath: 'scripts/face-reading-fr27-real-runtime-e2e.mjs';
    readonly harnessBlobSha: string;
    readonly fr26RuntimeBlobSha: string;
    readonly fr25AdapterBlobSha: string;
    readonly fr24BridgeBlobSha: string;
    readonly fr14ContractBlobSha: string;
    readonly fr14BindingBlobSha: string;
    readonly fr20PolicyBlobSha: string;
    readonly artifactId: 9674315540;
    readonly artifactArchiveDigest: string;
  };
  readonly installedPackageAssets: {
    readonly packageBundlePath: 'node_modules/@mediapipe/tasks-vision/vision_bundle.mjs';
    readonly packageBundleDigest: string;
    readonly wasmReferenceRoot: typeof FR26_MEDIAPIPE_WASM_ROOT;
    readonly wasmFiles: readonly MediaPipeRuntimeFileDigestFR27V1[];
    readonly wasmReferenceRootByteEquivalenceVerified: false;
  };
  readonly model: {
    readonly assetRef: typeof FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL;
    readonly independentByteDigest: string;
    readonly byteLength: 3758596;
    readonly referenceBytesVerified: true;
  };
  readonly fixture: {
    readonly repository: 'google-ai-edge/mediapipe-samples-web';
    readonly sourceCommit: string;
    readonly sourceBlobSha: string;
    readonly sourcePath: 'public/face_model.png';
    readonly independentByteDigest: string;
    readonly byteLength: 578267;
  };
  readonly execution: {
    readonly runnerOs: 'ubuntu-24.04';
    readonly nodeMajor: 24;
    readonly browserFamily: 'Google Chrome';
    readonly browserVersion: '151.0.7922.173';
    readonly factoryMode: 'instrumented_exact_package_assets';
    readonly defaultFactoryNetworkPathVerified: false;
    readonly realBrowserExecution: true;
    readonly replayCount: 2;
    readonly deterministicReplay: true;
    readonly imageDimensions: readonly [640, 640];
    readonly faceCounts: readonly [1, 1];
    readonly landmarkCounts: readonly [478, 478];
    readonly landmarkFieldSet: readonly ['visibility', 'x', 'y', 'z'];
    readonly blendshapeCounts: readonly [0, 0];
    readonly transformationMatrixCounts: readonly [0, 0];
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

export interface MediaPipeRealRuntimeVerificationReadinessFR27V1 {
  readonly realBrowserExecutionVerified: true;
  readonly deterministicResearchReplayVerified: true;
  readonly installedPackageAssetDigestsVerified: true;
  readonly modelReferenceBytesVerified: true;
  readonly runtimeLandmarkShapeVerified: true;
  readonly defaultFactoryNetworkPathVerified: false;
  readonly providerConformanceReady: false;
  readonly productionProviderActivationReady: false;
  readonly anatomicalLateralityReady: false;
  readonly traditionalSemanticAuthorityGranted: false;
  readonly blockers: readonly string[];
}

export const FR27_EXPECTED_INSTALLED_WASM_DIGESTS: readonly MediaPipeRuntimeFileDigestFR27V1[] = Object.freeze([
  Object.freeze({ file: 'vision_wasm_internal.js', digest: 'sha256:e7fd9858e8e8f221d9b96eddc11f8e077f263e0b7bbd79d3cbe882b134274f8c' }),
  Object.freeze({ file: 'vision_wasm_internal.wasm', digest: 'sha256:6a5c64584c2ab61c763b6e204afbdbc7ce1caf7f5216187322bca8df94f646bc' }),
  Object.freeze({ file: 'vision_wasm_module_internal.js', digest: 'sha256:1f1d6215324a1fe62f6742d49a3db911170987ca18ad8c1b75f1a1c82acf2b44' }),
  Object.freeze({ file: 'vision_wasm_module_internal.wasm', digest: 'sha256:617b8e0248dbd27e9d7ece4218004eae4cefb499196d1bb4fa0e3fef21708756' }),
  Object.freeze({ file: 'vision_wasm_nosimd_internal.js', digest: 'sha256:438d1fe8ff7f4d946025bc211c291543c037d8a3785ed4eee60f1f521b236296' }),
  Object.freeze({ file: 'vision_wasm_nosimd_internal.wasm', digest: 'sha256:8a3092d34c79d3f57e6ba8592105e8a90f6b07c27891ffecd14cca428bfd3e31' }),
]);

export const MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27: MediaPipeRealRuntimeVerificationEvidenceFR27V1 = Object.freeze({
  schemaVersion: 'fr27-v1' as const,
  evidenceRef: 'evidence.face.mediapipe_real_runtime.fr27' as const,
  evidenceVersion: '0.1.0' as const,
  authorityState: 'runtime_execution_verification_only' as const,
  verifiedRuntimeRef: 'runtime.face.mediapipe_face_landmarker.fr26@0.1.0' as const,
  verifiedAdapterRef: 'adapter.face.mediapipe_eye_landmarks.fr25@0.1.0' as const,
  runtimePackageName: '@mediapipe/tasks-vision' as const,
  runtimePackageVersion: '0.10.35' as const,
  executionSource: Object.freeze({
    repository: 'gycha0109-beep/MyeongHa' as const,
    executionHeadSha: 'cdf2aaab42830644bf8a47039f0fd11436ef1de6',
    checkoutMergeSha: '762c3dd9c821eb2ab266469cb7cdee526ede5765',
    workflowRunId: 33142026425 as const,
    workflowPath: '.github/workflows/face-reading-real-runtime-e2e.yml' as const,
    workflowBlobSha: '50afbd774ccb0e055388d8c71dbcb1e5875f45bf',
    harnessPath: 'scripts/face-reading-fr27-real-runtime-e2e.mjs' as const,
    harnessBlobSha: '3c991474f0375dba746832f9205a1c2ee3c06bf1',
    fr26RuntimeBlobSha: '9d5747978f9a563c3daba7e36859f7a4ec1c6dde',
    fr25AdapterBlobSha: '75d3aaf21e1c235014ef03c5c02e7a04b1c135a3',
    fr24BridgeBlobSha: '64c4ea1e139f1fbb5cd4e738a07bca3890c3b257',
    fr14ContractBlobSha: '889d34bc231c4dd4d23b1ab0aa8ef915d28f2345',
    fr14BindingBlobSha: '29d86db4dbf4d15142c55bf485090ee628934a3a',
    fr20PolicyBlobSha: '0a317b6965e2be75e2f2bdd874be2492cd0890dc',
    artifactId: 9674315540 as const,
    artifactArchiveDigest: 'sha256:cee951b0026ccd87f761d79beb14381946e7353e1f4620bb99c4547215ab7b93',
  }),
  installedPackageAssets: Object.freeze({
    packageBundlePath: 'node_modules/@mediapipe/tasks-vision/vision_bundle.mjs' as const,
    packageBundleDigest: 'sha256:55d7ab624fbb70dcc5adc4ae6d7ea9cfcb569139d3dbfbf2b1deafcb966bc0fe',
    wasmReferenceRoot: FR26_MEDIAPIPE_WASM_ROOT,
    wasmFiles: FR27_EXPECTED_INSTALLED_WASM_DIGESTS,
    wasmReferenceRootByteEquivalenceVerified: false as const,
  }),
  model: Object.freeze({
    assetRef: FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL,
    independentByteDigest: 'sha256:64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff',
    byteLength: 3758596 as const,
    referenceBytesVerified: true as const,
  }),
  fixture: Object.freeze({
    repository: 'google-ai-edge/mediapipe-samples-web' as const,
    sourceCommit: 'bbb8974ffd450650ad5a1e7c1656c9debb8e38bf',
    sourceBlobSha: '7ec9d163603c98159d283b6ceb9086f9794d1dc9',
    sourcePath: 'public/face_model.png' as const,
    independentByteDigest: 'sha256:75171e877e92b7a126cca2e7a388fc430225e07e9cd2e9e801eaa67ea6d7f4d9',
    byteLength: 578267 as const,
  }),
  execution: Object.freeze({
    runnerOs: 'ubuntu-24.04' as const,
    nodeMajor: 24 as const,
    browserFamily: 'Google Chrome' as const,
    browserVersion: '151.0.7922.173' as const,
    factoryMode: 'instrumented_exact_package_assets' as const,
    defaultFactoryNetworkPathVerified: false as const,
    realBrowserExecution: true as const,
    replayCount: 2 as const,
    deterministicReplay: true as const,
    imageDimensions: Object.freeze([640, 640] as const),
    faceCounts: Object.freeze([1, 1] as const),
    landmarkCounts: Object.freeze([478, 478] as const),
    landmarkFieldSet: Object.freeze(['visibility', 'x', 'y', 'z'] as const),
    blendshapeCounts: Object.freeze([0, 0] as const),
    transformationMatrixCounts: Object.freeze([0, 0] as const),
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

function exactStrings(actual: readonly string[], expected: readonly string[], path: string): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new FaceAuthorityValidationError(`${path} mismatch.`);
  }
}

export function validateMediaPipeRealRuntimeVerificationEvidenceFR27(
  evidence: MediaPipeRealRuntimeVerificationEvidenceFR27V1 = MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27,
): MediaPipeRealRuntimeVerificationEvidenceFR27V1 {
  if (evidence.schemaVersion !== 'fr27-v1' || evidence.evidenceVersion !== '0.1.0') {
    throw new FaceAuthorityValidationError('FR-27 evidence schema/version mismatch.');
  }
  if (evidence.authorityState !== 'runtime_execution_verification_only') {
    throw new FaceAuthorityValidationError('FR-27 authorityState must remain runtime_execution_verification_only.');
  }
  if (evidence.verifiedRuntimeRef !== `${MEDIAPIPE_FACE_LANDMARKER_RUNTIME_EVIDENCE_FR26.runtimeId}@${MEDIAPIPE_FACE_LANDMARKER_RUNTIME_EVIDENCE_FR26.runtimeVersion}`) {
    throw new FaceAuthorityValidationError('FR-27 must pin the exact FR-26 runtime identity.');
  }
  if (evidence.verifiedAdapterRef !== `${MEDIAPIPE_EYE_LANDMARK_ADAPTER_EVIDENCE_FR25.adapterId}@${MEDIAPIPE_EYE_LANDMARK_ADAPTER_EVIDENCE_FR25.adapterVersion}`) {
    throw new FaceAuthorityValidationError('FR-27 must pin the exact FR-25 adapter identity.');
  }
  if (evidence.runtimePackageName !== MEDIAPIPE_FACE_LANDMARKER_RUNTIME_EVIDENCE_FR26.runtimePackageName ||
      evidence.runtimePackageVersion !== MEDIAPIPE_FACE_LANDMARKER_RUNTIME_EVIDENCE_FR26.runtimePackageVersion) {
    throw new FaceAuthorityValidationError('FR-27 runtime package pin must match FR-26.');
  }

  gitSha(evidence.executionSource.executionHeadSha, 'fr27.executionHeadSha');
  gitSha(evidence.executionSource.checkoutMergeSha, 'fr27.checkoutMergeSha');
  gitSha(evidence.executionSource.workflowBlobSha, 'fr27.workflowBlobSha');
  gitSha(evidence.executionSource.harnessBlobSha, 'fr27.harnessBlobSha');
  gitSha(evidence.executionSource.fr26RuntimeBlobSha, 'fr27.fr26RuntimeBlobSha');
  gitSha(evidence.executionSource.fr25AdapterBlobSha, 'fr27.fr25AdapterBlobSha');
  gitSha(evidence.executionSource.fr24BridgeBlobSha, 'fr27.fr24BridgeBlobSha');
  gitSha(evidence.executionSource.fr14ContractBlobSha, 'fr27.fr14ContractBlobSha');
  gitSha(evidence.executionSource.fr14BindingBlobSha, 'fr27.fr14BindingBlobSha');
  gitSha(evidence.executionSource.fr20PolicyBlobSha, 'fr27.fr20PolicyBlobSha');
  sha256(evidence.executionSource.artifactArchiveDigest, 'fr27.artifactArchiveDigest');

  sha256(evidence.installedPackageAssets.packageBundleDigest, 'fr27.packageBundleDigest');
  if (evidence.installedPackageAssets.wasmReferenceRoot !== FR26_MEDIAPIPE_WASM_ROOT ||
      evidence.installedPackageAssets.wasmReferenceRootByteEquivalenceVerified !== false) {
    throw new FaceAuthorityValidationError('FR-27 may not promote installed-package WASM hashes into verification of the FR-26 CDN reference bytes.');
  }
  if (evidence.installedPackageAssets.wasmFiles.length !== FR27_EXPECTED_INSTALLED_WASM_DIGESTS.length) {
    throw new FaceAuthorityValidationError('FR-27 installed WASM digest set is incomplete.');
  }
  for (let index = 0; index < FR27_EXPECTED_INSTALLED_WASM_DIGESTS.length; index += 1) {
    const actual = evidence.installedPackageAssets.wasmFiles[index]!;
    const expected = FR27_EXPECTED_INSTALLED_WASM_DIGESTS[index]!;
    if (actual.file !== expected.file || actual.digest !== expected.digest) {
      throw new FaceAuthorityValidationError(`FR-27 installed WASM digest mismatch: ${expected.file}`);
    }
    sha256(actual.digest, `fr27.wasm.${actual.file}`);
  }

  if (evidence.model.assetRef !== FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL || evidence.model.referenceBytesVerified !== true) {
    throw new FaceAuthorityValidationError('FR-27 model evidence must verify the exact FR-26 model reference bytes.');
  }
  sha256(evidence.model.independentByteDigest, 'fr27.model.independentByteDigest');
  gitSha(evidence.fixture.sourceCommit, 'fr27.fixture.sourceCommit');
  gitSha(evidence.fixture.sourceBlobSha, 'fr27.fixture.sourceBlobSha');
  sha256(evidence.fixture.independentByteDigest, 'fr27.fixture.independentByteDigest');

  if (evidence.execution.factoryMode !== 'instrumented_exact_package_assets' || evidence.execution.defaultFactoryNetworkPathVerified !== false) {
    throw new FaceAuthorityValidationError('FR-27 v0.1 verifies the instrumented exact-package execution path, not the FR-26 default network factory path.');
  }
  if (evidence.execution.realBrowserExecution !== true || evidence.execution.replayCount !== 2 || evidence.execution.deterministicReplay !== true) {
    throw new FaceAuthorityValidationError('FR-27 requires two successful deterministic real-browser executions.');
  }
  exactTuple(evidence.execution.imageDimensions, [640, 640], 'fr27.imageDimensions');
  exactTuple(evidence.execution.faceCounts, [1, 1], 'fr27.faceCounts');
  exactTuple(evidence.execution.landmarkCounts, [478, 478], 'fr27.landmarkCounts');
  exactStrings(evidence.execution.landmarkFieldSet, ['visibility', 'x', 'y', 'z'], 'fr27.landmarkFieldSet');
  exactTuple(evidence.execution.blendshapeCounts, [0, 0], 'fr27.blendshapeCounts');
  exactTuple(evidence.execution.transformationMatrixCounts, [0, 0], 'fr27.transformationMatrixCounts');
  exactTuple(evidence.execution.boundaryVertexCounts, [16, 16], 'fr27.boundaryVertexCounts');
  if (evidence.execution.researchRegionCount !== 2 || evidence.execution.sideAuthority !== 'provider_label_only' || evidence.execution.consumerSlotAssignment !== null) {
    throw new FaceAuthorityValidationError('FR-27 research eye-pair output shape or side authority mismatch.');
  }

  if (evidence.rawImagePersisted !== false || evidence.rawProviderResponsePersisted !== false ||
      evidence.biometricEmbeddingPersisted !== false || evidence.productionNeutralObservationIssued !== false ||
      evidence.productionProviderActivationAllowed !== false || evidence.providerConformanceClaimed !== false ||
      evidence.anatomicalLateralityResolved !== false || evidence.traditionalSemanticAuthority !== false) {
    throw new FaceAuthorityValidationError('FR-27 cannot promote persistence, provider conformance, production activation, anatomical laterality, or traditional semantics.');
  }
  return evidence;
}

export function assessMediaPipeRealRuntimeVerificationFR27(): MediaPipeRealRuntimeVerificationReadinessFR27V1 {
  validateMediaPipeRealRuntimeVerificationEvidenceFR27();
  return Object.freeze({
    realBrowserExecutionVerified: true as const,
    deterministicResearchReplayVerified: true as const,
    installedPackageAssetDigestsVerified: true as const,
    modelReferenceBytesVerified: true as const,
    runtimeLandmarkShapeVerified: true as const,
    defaultFactoryNetworkPathVerified: false as const,
    providerConformanceReady: false as const,
    productionProviderActivationReady: false as const,
    anatomicalLateralityReady: false as const,
    traditionalSemanticAuthorityGranted: false as const,
    blockers: Object.freeze([
      'FR-27 hashes and fail-closed compares the installed @mediapipe/tasks-vision@0.10.35 WASM files but does not independently prove byte equivalence for the FR-26 jsDelivr WASM reference root',
      'FR-27 real-browser execution uses an instrumented factory serving the exact installed package WASM/model bytes; the FR-26 default network factory path remains unverified',
      'FR-22 verified provider implementation registry remains empty',
      'FR-23 reviewed provider conformance evidence registry remains empty',
      'MediaPipe Tasks production metrics/privacy/telemetry policy still requires explicit product review',
      'provider LEFT/RIGHT topology labels remain provider provenance only and do not resolve anatomical laterality',
      'FR-27 verifies only the FR-24 research projection path and grants no traditional physiognomy semantics',
    ]),
  });
}
