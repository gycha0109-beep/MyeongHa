import type { FaceEyePairResearchArtifactFR24V1 } from './face-eye-pair-research-bridge-fr24.js';
import {
  MEDIAPIPE_EYE_LANDMARK_ADAPTER_EVIDENCE_FR25,
  issueMediaPipeEyePairResearchArtifactFR25,
  type MediaPipeFaceLandmarkerResultFR25V1,
} from './mediapipe-eye-landmark-adapter-fr25.js';
import { FaceAuthorityValidationError } from './validation.js';

export const FR26_MEDIAPIPE_WASM_ROOT =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm' as const;
export const FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task' as const;

export interface MediaPipeFaceLandmarkerRuntimeEvidenceFR26V1 {
  readonly schemaVersion: 'fr26-v1';
  readonly runtimeId: 'runtime.face.mediapipe_face_landmarker.fr26';
  readonly runtimeVersion: '0.1.0';
  readonly authorityState: 'research_runtime_only';
  readonly runtimePackageName: '@mediapipe/tasks-vision';
  readonly runtimePackageVersion: '0.10.35';
  readonly wasm: {
    readonly rootRef: typeof FR26_MEDIAPIPE_WASM_ROOT;
    readonly independentByteDigest: null;
    readonly verificationState: 'reference_pinned_bytes_unverified';
  };
  readonly model: {
    readonly assetRef: typeof FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL;
    readonly independentByteDigest: null;
    readonly verificationState: 'reference_pinned_bytes_unverified';
  };
  readonly runningMode: 'IMAGE';
  readonly numFaces: 1;
  readonly outputFaceBlendshapes: false;
  readonly outputFacialTransformationMatrixes: false;
  readonly rawImagePersisted: false;
  readonly rawProviderResponsePersisted: false;
  readonly biometricEmbeddingPersisted: false;
  readonly productionProviderActivationAllowed: false;
  readonly anatomicalLateralityResolved: false;
  readonly traditionalSemanticAuthority: false;
}

export interface MediaPipeFaceLandmarkerRuntimeRequestFR26V1 {
  readonly schemaVersion: 'fr26-mediapipe-face-landmarker-request-v1';
  readonly providerRunRef: string;
  readonly canonicalAssetDigest: string;
  readonly image: unknown;
}

export interface MediaPipeFaceLandmarkerRuntimeInstanceFR26V1 {
  readonly detect: (image: unknown) => MediaPipeFaceLandmarkerResultFR25V1;
  readonly close: () => void;
}

export interface MediaPipeFaceLandmarkerRuntimeFactoryFR26V1 {
  readonly create: () => Promise<MediaPipeFaceLandmarkerRuntimeInstanceFR26V1>;
}

export interface MediaPipeEyePairResearchRunFR26V1 {
  readonly schemaVersion: 'fr26-mediapipe-eye-pair-research-run-v1';
  readonly runtimeVersion: '0.1.0';
  readonly authorityState: 'research_runtime_only';
  readonly providerRunRef: string;
  readonly canonicalAssetDigest: string;
  readonly runtime: MediaPipeFaceLandmarkerRuntimeEvidenceFR26V1;
  readonly eyePairArtifact: FaceEyePairResearchArtifactFR24V1;
  readonly rawImagePersisted: false;
  readonly rawProviderResponsePersisted: false;
  readonly biometricEmbeddingPersisted: false;
  readonly productionNeutralObservationIssued: false;
  readonly productionProviderActivationAllowed: false;
  readonly anatomicalLateralityResolved: false;
  readonly traditionalSemanticAuthority: false;
}

export interface MediaPipeFaceLandmarkerRuntimeReadinessFR26V1 {
  readonly runtimeExecutionPathImplemented: true;
  readonly researchEyeProjectionReady: true;
  readonly productionProviderActivationReady: false;
  readonly anatomicalLateralityReady: false;
  readonly traditionalSemanticAuthorityGranted: false;
  readonly blockers: readonly string[];
}

export const MEDIAPIPE_FACE_LANDMARKER_RUNTIME_EVIDENCE_FR26: MediaPipeFaceLandmarkerRuntimeEvidenceFR26V1 = Object.freeze({
  schemaVersion: 'fr26-v1' as const,
  runtimeId: 'runtime.face.mediapipe_face_landmarker.fr26' as const,
  runtimeVersion: '0.1.0' as const,
  authorityState: 'research_runtime_only' as const,
  runtimePackageName: '@mediapipe/tasks-vision' as const,
  runtimePackageVersion: '0.10.35' as const,
  wasm: Object.freeze({
    rootRef: FR26_MEDIAPIPE_WASM_ROOT,
    independentByteDigest: null,
    verificationState: 'reference_pinned_bytes_unverified' as const,
  }),
  model: Object.freeze({
    assetRef: FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL,
    independentByteDigest: null,
    verificationState: 'reference_pinned_bytes_unverified' as const,
  }),
  runningMode: 'IMAGE' as const,
  numFaces: 1 as const,
  outputFaceBlendshapes: false as const,
  outputFacialTransformationMatrixes: false as const,
  rawImagePersisted: false as const,
  rawProviderResponsePersisted: false as const,
  biometricEmbeddingPersisted: false as const,
  productionProviderActivationAllowed: false as const,
  anatomicalLateralityResolved: false as const,
  traditionalSemanticAuthority: false as const,
});

const REQUEST_KEYS = new Set(['schemaVersion', 'providerRunRef', 'canonicalAssetDigest', 'image']);
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const SAFE_RUN_REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;

function exactKeys(value: object, allowed: ReadonlySet<string>, path: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected !== undefined) {
    throw new FaceAuthorityValidationError(`${path} contains unauthorized field: ${unexpected}`);
  }
}

function validateRuntimeEvidenceFR26(): void {
  const evidence = MEDIAPIPE_FACE_LANDMARKER_RUNTIME_EVIDENCE_FR26;
  if (
    evidence.runtimePackageName !== MEDIAPIPE_EYE_LANDMARK_ADAPTER_EVIDENCE_FR25.runtimePackageName ||
    evidence.runtimePackageVersion !== MEDIAPIPE_EYE_LANDMARK_ADAPTER_EVIDENCE_FR25.runtimePackageVersion
  ) {
    throw new FaceAuthorityValidationError('FR-26 runtime package pin must remain aligned to FR-25.');
  }
  if (
    evidence.authorityState !== 'research_runtime_only' ||
    evidence.wasm.independentByteDigest !== null ||
    evidence.model.independentByteDigest !== null ||
    evidence.rawImagePersisted !== false ||
    evidence.rawProviderResponsePersisted !== false ||
    evidence.biometricEmbeddingPersisted !== false ||
    evidence.productionProviderActivationAllowed !== false ||
    evidence.anatomicalLateralityResolved !== false ||
    evidence.traditionalSemanticAuthority !== false
  ) {
    throw new FaceAuthorityValidationError(
      'FR-26 cannot promote unverified runtime assets, persistence, provider activation, laterality, or traditional semantics.',
    );
  }
  if (
    evidence.runningMode !== 'IMAGE' ||
    evidence.numFaces !== 1 ||
    evidence.outputFaceBlendshapes !== false ||
    evidence.outputFacialTransformationMatrixes !== false
  ) {
    throw new FaceAuthorityValidationError('FR-26 runtime options must remain pinned to the bounded single-image research path.');
  }
}

function validateRuntimeRequestFR26(request: MediaPipeFaceLandmarkerRuntimeRequestFR26V1): void {
  if (typeof request !== 'object' || request === null) {
    throw new FaceAuthorityValidationError('FR-26 request must be an object.');
  }
  exactKeys(request, REQUEST_KEYS, 'FR-26 request');
  if (request.schemaVersion !== 'fr26-mediapipe-face-landmarker-request-v1') {
    throw new FaceAuthorityValidationError('FR-26 request schemaVersion is unsupported.');
  }
  if (!SAFE_RUN_REF.test(request.providerRunRef)) {
    throw new FaceAuthorityValidationError('FR-26 providerRunRef must be a bounded opaque reference without whitespace.');
  }
  if (!SHA256.test(request.canonicalAssetDigest)) {
    throw new FaceAuthorityValidationError('FR-26 canonicalAssetDigest must be sha256:<64 lowercase hex>.');
  }
  if (request.image === null || request.image === undefined) {
    throw new FaceAuthorityValidationError('FR-26 image must be present as an opaque in-memory image source.');
  }
}

export const DEFAULT_MEDIAPIPE_FACE_LANDMARKER_RUNTIME_FACTORY_FR26: MediaPipeFaceLandmarkerRuntimeFactoryFR26V1 = Object.freeze({
  async create(): Promise<MediaPipeFaceLandmarkerRuntimeInstanceFR26V1> {
    validateRuntimeEvidenceFR26();
    const vision = await import('@mediapipe/tasks-vision');
    const fileset = await vision.FilesetResolver.forVisionTasks(FR26_MEDIAPIPE_WASM_ROOT);
    const landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL,
      },
      runningMode: 'IMAGE',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });

    return Object.freeze({
      detect(image: unknown): MediaPipeFaceLandmarkerResultFR25V1 {
        const detect = landmarker.detect.bind(landmarker) as unknown as (source: unknown) => unknown;
        return detect(image) as MediaPipeFaceLandmarkerResultFR25V1;
      },
      close(): void {
        landmarker.close();
      },
    });
  },
});

export async function runMediaPipeEyePairResearchFR26(
  request: MediaPipeFaceLandmarkerRuntimeRequestFR26V1,
  factory: MediaPipeFaceLandmarkerRuntimeFactoryFR26V1 = DEFAULT_MEDIAPIPE_FACE_LANDMARKER_RUNTIME_FACTORY_FR26,
): Promise<MediaPipeEyePairResearchRunFR26V1> {
  validateRuntimeEvidenceFR26();
  validateRuntimeRequestFR26(request);
  if (typeof factory !== 'object' || factory === null || typeof factory.create !== 'function') {
    throw new FaceAuthorityValidationError('FR-26 runtime factory must expose create().');
  }

  const runtime = await factory.create();
  if (typeof runtime !== 'object' || runtime === null || typeof runtime.detect !== 'function' || typeof runtime.close !== 'function') {
    throw new FaceAuthorityValidationError('FR-26 runtime factory returned an invalid runtime instance.');
  }

  try {
    const rawResult = runtime.detect(request.image);
    const eyePairArtifact = issueMediaPipeEyePairResearchArtifactFR25(rawResult, {
      providerRunRef: request.providerRunRef,
      canonicalAssetDigest: request.canonicalAssetDigest,
    });

    return Object.freeze({
      schemaVersion: 'fr26-mediapipe-eye-pair-research-run-v1' as const,
      runtimeVersion: '0.1.0' as const,
      authorityState: 'research_runtime_only' as const,
      providerRunRef: request.providerRunRef,
      canonicalAssetDigest: request.canonicalAssetDigest,
      runtime: MEDIAPIPE_FACE_LANDMARKER_RUNTIME_EVIDENCE_FR26,
      eyePairArtifact,
      rawImagePersisted: false as const,
      rawProviderResponsePersisted: false as const,
      biometricEmbeddingPersisted: false as const,
      productionNeutralObservationIssued: false as const,
      productionProviderActivationAllowed: false as const,
      anatomicalLateralityResolved: false as const,
      traditionalSemanticAuthority: false as const,
    });
  } finally {
    runtime.close();
  }
}

export function assessMediaPipeFaceLandmarkerRuntimeFR26(): MediaPipeFaceLandmarkerRuntimeReadinessFR26V1 {
  validateRuntimeEvidenceFR26();
  return Object.freeze({
    runtimeExecutionPathImplemented: true as const,
    researchEyeProjectionReady: true as const,
    productionProviderActivationReady: false as const,
    anatomicalLateralityReady: false as const,
    traditionalSemanticAuthorityGranted: false as const,
    blockers: Object.freeze([
      'FR-18 consumer lockfile attestation does not establish release-exact source equivalence for @mediapipe/tasks-vision@0.10.35',
      'FR-26 pins a versioned MediaPipe WASM reference but has not independently hashed the loaded WASM bytes',
      'FR-26 pins the face_landmarker float16/1 model reference but has not independently hashed the loaded model bytes',
      'MediaPipe Tasks metrics/privacy consent and production telemetry policy require explicit product review before activation',
      'FR-22 verified provider implementation registry remains empty',
      'FR-23 reviewed provider conformance evidence registry remains empty',
      'provider LEFT/RIGHT labels remain provider provenance only and do not resolve anatomical laterality',
      'FR-26 issues only the FR-24 research eye-pair artifact and grants no traditional physiognomy semantics',
    ]),
  });
}
