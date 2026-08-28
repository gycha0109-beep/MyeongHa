import {
  FR24_EYE_TOPOLOGY_SERIALIZATION_ORDER,
  FR24_EYE_TOPOLOGY_WITNESS_EDGES,
  issueFaceEyePairResearchArtifactFR24,
  type FaceEyePairResearchArtifactFR24V1,
  type FaceEyePairResearchProjectionInputFR24V1,
  type ProviderEyeTopologySymbolFR24,
} from './face-eye-pair-research-bridge-fr24.js';
import type { NormalizedPoint2DV1 } from './neutral-observation-schema-fr15.js';
import { FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16 } from './provider-adapter-evidence-fr16.js';
import { FaceAuthorityValidationError } from './validation.js';

export interface MediaPipeNormalizedLandmarkFR25V1 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly visibility?: number;
}

export interface MediaPipeFaceLandmarkerResultFR25V1 {
  readonly faceLandmarks: readonly (readonly MediaPipeNormalizedLandmarkFR25V1[])[];
  readonly faceBlendshapes: readonly unknown[];
  readonly facialTransformationMatrixes: readonly unknown[];
}

export interface MediaPipeEyeAdapterContextFR25V1 {
  readonly providerRunRef: string;
  readonly canonicalAssetDigest: string;
}

export interface MediaPipeEyeLandmarkAdapterEvidenceFR25V1 {
  readonly schemaVersion: 'fr25-v1';
  readonly adapterId: 'adapter.face.mediapipe_eye_landmarks.fr25';
  readonly adapterVersion: '0.1.0';
  readonly authorityState: 'research_adapter_only';
  readonly runtimePackageName: '@mediapipe/tasks-vision';
  readonly runtimePackageVersion: '0.10.35';
  readonly sourceWitness: {
    readonly repository: 'google-ai-edge/mediapipe';
    readonly sourceCommit: string;
    readonly sourceRefClass: 'upstream_master_structure_witness';
    readonly releaseExactForInstalledPackage: false;
    readonly normalizedLandmarkPath: 'mediapipe/tasks/web/components/containers/landmark.d.ts';
    readonly normalizedLandmarkBlobSha: string;
    readonly faceLandmarkerResultPath: 'mediapipe/tasks/web/vision/face_landmarker/face_landmarker_result.d.ts';
    readonly faceLandmarkerResultBlobSha: string;
  };
  readonly runtimeShapeObservation: {
    readonly packageVersion: '0.10.35';
    readonly sourceDeclarationSupplementalFields: readonly [];
    readonly observedSupplementalLandmarkFields: readonly ['faceLandmarks[].visibility'];
    readonly treatment: 'finite_validate_then_discard';
    readonly authorityState: 'runtime_shape_only';
  };
  readonly faceSelectionPolicy: 'exactly_one_face';
  readonly consumedProviderFields: readonly ['faceLandmarks[].x', 'faceLandmarks[].y'];
  readonly validatedButDiscardedProviderFields: readonly ['faceLandmarks[].z', 'faceLandmarks[].visibility'];
  readonly ignoredProviderResultFields: readonly ['faceBlendshapes', 'facialTransformationMatrixes'];
  readonly rawProviderResponsePersisted: false;
  readonly providerDepthPersisted: false;
  readonly productionProviderActivationAllowed: false;
  readonly anatomicalLateralityResolved: false;
  readonly traditionalSemanticAuthority: false;
}

export interface MediaPipeEyeAdapterReadinessFR25V1 {
  readonly rawResultAdapterReady: true;
  readonly researchEyeProjectionReady: true;
  readonly productionProviderActivationReady: false;
  readonly anatomicalLateralityReady: false;
  readonly traditionalSemanticAuthorityGranted: false;
  readonly blockers: readonly string[];
}

export const MEDIAPIPE_EYE_LANDMARK_ADAPTER_EVIDENCE_FR25: MediaPipeEyeLandmarkAdapterEvidenceFR25V1 = Object.freeze({
  schemaVersion: 'fr25-v1' as const,
  adapterId: 'adapter.face.mediapipe_eye_landmarks.fr25' as const,
  adapterVersion: '0.1.0' as const,
  authorityState: 'research_adapter_only' as const,
  runtimePackageName: '@mediapipe/tasks-vision' as const,
  runtimePackageVersion: '0.10.35' as const,
  sourceWitness: Object.freeze({
    repository: 'google-ai-edge/mediapipe' as const,
    sourceCommit: '30590fe8d3fdc57e63a0e9c5b2c0ececffb37301',
    sourceRefClass: 'upstream_master_structure_witness' as const,
    releaseExactForInstalledPackage: false as const,
    normalizedLandmarkPath: 'mediapipe/tasks/web/components/containers/landmark.d.ts' as const,
    normalizedLandmarkBlobSha: 'bb6104d89c8f9917cc173b5bfe2b347bab71b71c',
    faceLandmarkerResultPath: 'mediapipe/tasks/web/vision/face_landmarker/face_landmarker_result.d.ts' as const,
    faceLandmarkerResultBlobSha: '4af483ab3c1c61b268b9d92a28bab6160c60b47f',
  }),
  runtimeShapeObservation: Object.freeze({
    packageVersion: '0.10.35' as const,
    sourceDeclarationSupplementalFields: Object.freeze([] as const),
    observedSupplementalLandmarkFields: Object.freeze(['faceLandmarks[].visibility'] as const),
    treatment: 'finite_validate_then_discard' as const,
    authorityState: 'runtime_shape_only' as const,
  }),
  faceSelectionPolicy: 'exactly_one_face' as const,
  consumedProviderFields: Object.freeze(['faceLandmarks[].x', 'faceLandmarks[].y'] as const),
  validatedButDiscardedProviderFields: Object.freeze(['faceLandmarks[].z', 'faceLandmarks[].visibility'] as const),
  ignoredProviderResultFields: Object.freeze(['faceBlendshapes', 'facialTransformationMatrixes'] as const),
  rawProviderResponsePersisted: false as const,
  providerDepthPersisted: false as const,
  productionProviderActivationAllowed: false as const,
  anatomicalLateralityResolved: false as const,
  traditionalSemanticAuthority: false as const,
});

export const FR25_REQUIRED_EYE_PROVIDER_VERTICES: Readonly<Record<ProviderEyeTopologySymbolFR24, readonly number[]>> = Object.freeze(
  Object.fromEntries(FR24_EYE_TOPOLOGY_SERIALIZATION_ORDER.map((symbol) => [
    symbol,
    Object.freeze(Array.from(new Set(
      FR24_EYE_TOPOLOGY_WITNESS_EDGES[symbol].flatMap((edge) => [edge.start, edge.end]),
    )).sort((a, b) => a - b)),
  ])) as Record<ProviderEyeTopologySymbolFR24, readonly number[]>,
);

const ROOT_RESULT_KEYS = new Set(['faceLandmarks', 'faceBlendshapes', 'facialTransformationMatrixes']);
const CONTEXT_KEYS = new Set(['providerRunRef', 'canonicalAssetDigest']);
const RAW_LANDMARK_KEYS = new Set(['x', 'y', 'z', 'visibility']);
const HEX40 = /^[0-9a-f]{40}$/u;

function exactKeys(value: object, allowed: ReadonlySet<string>, path: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected !== undefined) {
    throw new FaceAuthorityValidationError(`${path} contains unauthorized field: ${unexpected}`);
  }
}

function validateWitnessSha(value: string, path: string): void {
  if (!HEX40.test(value)) throw new FaceAuthorityValidationError(`${path} must be a 40-char lowercase git SHA.`);
}

function validateAdapterEvidenceFR25(): void {
  const evidence = MEDIAPIPE_EYE_LANDMARK_ADAPTER_EVIDENCE_FR25;
  validateWitnessSha(evidence.sourceWitness.sourceCommit, 'fr25.sourceWitness.sourceCommit');
  validateWitnessSha(evidence.sourceWitness.normalizedLandmarkBlobSha, 'fr25.sourceWitness.normalizedLandmarkBlobSha');
  validateWitnessSha(evidence.sourceWitness.faceLandmarkerResultBlobSha, 'fr25.sourceWitness.faceLandmarkerResultBlobSha');
  if (evidence.sourceWitness.sourceCommit !== FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.topologySourceEvidence.sourceCommit ||
      evidence.sourceWitness.sourceRefClass !== 'upstream_master_structure_witness' ||
      evidence.sourceWitness.releaseExactForInstalledPackage !== false) {
    throw new FaceAuthorityValidationError('FR-25 raw landmark type evidence must remain aligned to the FR-16 upstream structure witness without release-exact promotion.');
  }
  if (evidence.runtimePackageName !== FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.dependencyEvidence.packageName ||
      evidence.runtimePackageVersion !== FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.dependencyEvidence.packageVersion ||
      evidence.runtimeShapeObservation.packageVersion !== evidence.runtimePackageVersion) {
    throw new FaceAuthorityValidationError('FR-25 runtime package pin and runtime-shape observation must match FR-16 dependency evidence.');
  }
  if (evidence.runtimeShapeObservation.sourceDeclarationSupplementalFields.length !== 0 ||
      evidence.runtimeShapeObservation.observedSupplementalLandmarkFields.join('|') !== 'faceLandmarks[].visibility' ||
      evidence.runtimeShapeObservation.treatment !== 'finite_validate_then_discard' ||
      evidence.runtimeShapeObservation.authorityState !== 'runtime_shape_only') {
    throw new FaceAuthorityValidationError('FR-25 supplemental runtime landmark fields must remain explicit runtime-shape-only evidence and must be discarded.');
  }
  if (evidence.authorityState !== 'research_adapter_only' ||
      evidence.productionProviderActivationAllowed !== false ||
      evidence.anatomicalLateralityResolved !== false ||
      evidence.traditionalSemanticAuthority !== false ||
      evidence.rawProviderResponsePersisted !== false ||
      evidence.providerDepthPersisted !== false) {
    throw new FaceAuthorityValidationError('FR-25 adapter evidence cannot promote provider activation, laterality, semantics, or raw/depth persistence.');
  }
}

function validateRawLandmarkFR25(
  landmark: MediaPipeNormalizedLandmarkFR25V1,
  path: string,
): NormalizedPoint2DV1 {
  if (typeof landmark !== 'object' || landmark === null) {
    throw new FaceAuthorityValidationError(`${path} must be a MediaPipe normalized landmark object.`);
  }
  exactKeys(landmark, RAW_LANDMARK_KEYS, path);
  if (!Number.isFinite(landmark.x) || landmark.x < 0 || landmark.x > 1) {
    throw new FaceAuthorityValidationError(`${path}.x must be finite within [0,1].`);
  }
  if (!Number.isFinite(landmark.y) || landmark.y < 0 || landmark.y > 1) {
    throw new FaceAuthorityValidationError(`${path}.y must be finite within [0,1].`);
  }
  if (!Number.isFinite(landmark.z)) {
    throw new FaceAuthorityValidationError(`${path}.z must be finite before it is discarded.`);
  }
  if (landmark.visibility !== undefined && !Number.isFinite(landmark.visibility)) {
    throw new FaceAuthorityValidationError(`${path}.visibility must be finite before it is discarded.`);
  }
  return Object.freeze({ x: landmark.x, y: landmark.y });
}

function projectTopologyPointsFR25(
  faceLandmarks: readonly MediaPipeNormalizedLandmarkFR25V1[],
  symbol: ProviderEyeTopologySymbolFR24,
): Readonly<Record<number, NormalizedPoint2DV1>> {
  const points: Record<number, NormalizedPoint2DV1> = {};
  for (const vertex of FR25_REQUIRED_EYE_PROVIDER_VERTICES[symbol]) {
    if (!(vertex in faceLandmarks) || faceLandmarks[vertex] === undefined) {
      throw new FaceAuthorityValidationError(`FR-25 faceLandmarks is missing required provider vertex: ${vertex}`);
    }
    points[vertex] = validateRawLandmarkFR25(faceLandmarks[vertex]!, `fr25.faceLandmarks[${vertex}]`);
  }
  return Object.freeze(points);
}

export function adaptMediaPipeFaceLandmarkerResultToFR24InputFR25(
  result: MediaPipeFaceLandmarkerResultFR25V1,
  context: MediaPipeEyeAdapterContextFR25V1,
): FaceEyePairResearchProjectionInputFR24V1 {
  validateAdapterEvidenceFR25();
  if (typeof result !== 'object' || result === null) {
    throw new FaceAuthorityValidationError('FR-25 result must be a MediaPipe FaceLandmarkerResult object.');
  }
  exactKeys(result, ROOT_RESULT_KEYS, 'FR-25 result');
  exactKeys(context, CONTEXT_KEYS, 'FR-25 context');
  if (!Array.isArray(result.faceLandmarks) || !Array.isArray(result.faceBlendshapes) || !Array.isArray(result.facialTransformationMatrixes)) {
    throw new FaceAuthorityValidationError('FR-25 result must match the witnessed FaceLandmarkerResult array fields.');
  }
  if (result.faceLandmarks.length !== 1) {
    throw new FaceAuthorityValidationError(`FR-25 requires exactly one detected face; received ${result.faceLandmarks.length}.`);
  }
  const faceLandmarks = result.faceLandmarks[0];
  if (!Array.isArray(faceLandmarks)) {
    throw new FaceAuthorityValidationError('FR-25 faceLandmarks[0] must be an array.');
  }

  return Object.freeze({
    providerRunRef: context.providerRunRef,
    canonicalAssetDigest: context.canonicalAssetDigest,
    topologyInputs: Object.freeze(Object.fromEntries(
      FR24_EYE_TOPOLOGY_SERIALIZATION_ORDER.map((symbol) => [
        symbol,
        Object.freeze({ pointsByProviderVertex: projectTopologyPointsFR25(faceLandmarks, symbol) }),
      ]),
    ) as Record<ProviderEyeTopologySymbolFR24, { readonly pointsByProviderVertex: Readonly<Record<number, NormalizedPoint2DV1>> }>),
  });
}

export function issueMediaPipeEyePairResearchArtifactFR25(
  result: MediaPipeFaceLandmarkerResultFR25V1,
  context: MediaPipeEyeAdapterContextFR25V1,
): FaceEyePairResearchArtifactFR24V1 {
  return issueFaceEyePairResearchArtifactFR24(
    adaptMediaPipeFaceLandmarkerResultToFR24InputFR25(result, context),
  );
}

export function assessMediaPipeEyeLandmarkAdapterFR25(): MediaPipeEyeAdapterReadinessFR25V1 {
  validateAdapterEvidenceFR25();
  return Object.freeze({
    rawResultAdapterReady: true as const,
    researchEyeProjectionReady: true as const,
    productionProviderActivationReady: false as const,
    anatomicalLateralityReady: false as const,
    traditionalSemanticAuthorityGranted: false as const,
    blockers: Object.freeze([
      'FR-25 raw Web type evidence is an upstream master structure witness, not release-exact source evidence for @mediapipe/tasks-vision@0.10.35',
      'FR-25 real @mediapipe/tasks-vision@0.10.35 execution exposed supplemental landmark visibility not declared by the pinned upstream type witness; it is finite-validated and discarded as runtime-shape-only data',
      'K_beauty currently provides no inspected FaceLandmarker runtime implementation to attest as a verified FR-22 provider implementation',
      'FR-22 verified implementation registry and FR-23 reviewed conformance evidence registry remain empty',
      'provider LEFT/RIGHT topology labels remain provider-label provenance only and do not resolve anatomical laterality',
      'FR-25 emits only the FR-24 research projection path and grants no traditional physiognomy semantics',
    ]),
  });
}
