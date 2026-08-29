import {
  MEDIAPIPE_FACE_OVAL_INFERIOR_EXTREMUM_AUTHORITY_FR45,
  validateMediaPipeFaceOvalInferiorExtremumAuthorityFR45,
} from './mediapipe-face-oval-inferior-extremum-fr45.js';
import { FaceAuthorityValidationError } from './validation.js';

export interface MediaPipeFaceOvalInferiorExtremumRuntimeEvidenceFR45V1 {
  readonly schemaVersion: 'fr45-runtime-evidence-v1';
  readonly evidenceRef: 'evidence.face.mediapipe_face_oval_inferior_extremum.fr45.runtime';
  readonly evidenceVersion: '0.1.0';
  readonly upstreamAuthorityRef: 'authority.face.mediapipe_face_oval_inferior_extremum.fr45@0.1.0';
  readonly evidenceLevel: 'single_fixture_real_runtime';
  readonly packageName: '@mediapipe/tasks-vision';
  readonly packageVersion: '0.10.35';
  readonly workflowRunId: 33260433549;
  readonly discoveryHeadCommit: '8d714a2e31e4d25fe822e2fe45ddc3ec125c1fc3';
  readonly artifactId: 9717098645;
  readonly chromeVersion: 'Google Chrome 151.0.7922.173';
  readonly fixture: {
    readonly repository: 'google-ai-edge/mediapipe-samples-web';
    readonly commit: 'bbb8974ffd450650ad5a1e7c1656c9debb8e38bf';
    readonly blobSha: '7ec9d163603c98159d283b6ceb9086f9794d1dc9';
    readonly digest: 'sha256:75171e877e92b7a126cca2e7a388fc430225e07e9cd2e9e801eaa67ea6d7f4d9';
    readonly byteLength: 578267;
  };
  readonly runtimeObservation: {
    readonly faceCount: 1;
    readonly landmarkCount: 478;
    readonly deterministicReplay: true;
    readonly topologyClass: 'simple_cycle';
    readonly topologyEdgeCount: 36;
    readonly topologyVertexCount: 36;
    readonly state: 'unique_image_inferior_extremum';
    readonly observedProviderLandmarkIndex: 152;
    readonly normalizedX: 0.5117782354354858;
    readonly normalizedY: 0.5969638824462891;
    readonly tiedProviderLandmarkIndices: readonly [152];
  };
  readonly evidenceBoundary: {
    readonly observedProviderLandmarkIndexIsEvidenceOnly: true;
    readonly singleFixtureMeansGeneralizedAnatomicalIdentity: false;
    readonly providerIndexSemanticAuthority: false;
    readonly chinInferiorContourBindingAuthorized: false;
    readonly traditionalDigeEquivalenceAuthorized: false;
    readonly fr36VerticalReferencePromoted: false;
    readonly productionGeometryAuthorized: false;
    readonly productionThreeDivisionsMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
  };
}

const UPSTREAM_REF = `${MEDIAPIPE_FACE_OVAL_INFERIOR_EXTREMUM_AUTHORITY_FR45.authorityRef}@${MEDIAPIPE_FACE_OVAL_INFERIOR_EXTREMUM_AUTHORITY_FR45.authorityVersion}` as const;

export const MEDIAPIPE_FACE_OVAL_INFERIOR_EXTREMUM_RUNTIME_EVIDENCE_FR45:
MediaPipeFaceOvalInferiorExtremumRuntimeEvidenceFR45V1 = Object.freeze({
  schemaVersion: 'fr45-runtime-evidence-v1' as const,
  evidenceRef: 'evidence.face.mediapipe_face_oval_inferior_extremum.fr45.runtime' as const,
  evidenceVersion: '0.1.0' as const,
  upstreamAuthorityRef: UPSTREAM_REF,
  evidenceLevel: 'single_fixture_real_runtime' as const,
  packageName: '@mediapipe/tasks-vision' as const,
  packageVersion: '0.10.35' as const,
  workflowRunId: 33260433549 as const,
  discoveryHeadCommit: '8d714a2e31e4d25fe822e2fe45ddc3ec125c1fc3' as const,
  artifactId: 9717098645 as const,
  chromeVersion: 'Google Chrome 151.0.7922.173' as const,
  fixture: Object.freeze({
    repository: 'google-ai-edge/mediapipe-samples-web' as const,
    commit: 'bbb8974ffd450650ad5a1e7c1656c9debb8e38bf' as const,
    blobSha: '7ec9d163603c98159d283b6ceb9086f9794d1dc9' as const,
    digest: 'sha256:75171e877e92b7a126cca2e7a388fc430225e07e9cd2e9e801eaa67ea6d7f4d9' as const,
    byteLength: 578267 as const,
  }),
  runtimeObservation: Object.freeze({
    faceCount: 1 as const,
    landmarkCount: 478 as const,
    deterministicReplay: true as const,
    topologyClass: 'simple_cycle' as const,
    topologyEdgeCount: 36 as const,
    topologyVertexCount: 36 as const,
    state: 'unique_image_inferior_extremum' as const,
    observedProviderLandmarkIndex: 152 as const,
    normalizedX: 0.5117782354354858 as const,
    normalizedY: 0.5969638824462891 as const,
    tiedProviderLandmarkIndices: Object.freeze([152] as const),
  }),
  evidenceBoundary: Object.freeze({
    observedProviderLandmarkIndexIsEvidenceOnly: true as const,
    singleFixtureMeansGeneralizedAnatomicalIdentity: false as const,
    providerIndexSemanticAuthority: false as const,
    chinInferiorContourBindingAuthorized: false as const,
    traditionalDigeEquivalenceAuthorized: false as const,
    fr36VerticalReferencePromoted: false as const,
    productionGeometryAuthorized: false as const,
    productionThreeDivisionsMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
  }),
});

export function validateMediaPipeFaceOvalInferiorExtremumRuntimeEvidenceFR45(
  evidence: MediaPipeFaceOvalInferiorExtremumRuntimeEvidenceFR45V1 = MEDIAPIPE_FACE_OVAL_INFERIOR_EXTREMUM_RUNTIME_EVIDENCE_FR45,
): MediaPipeFaceOvalInferiorExtremumRuntimeEvidenceFR45V1 {
  validateMediaPipeFaceOvalInferiorExtremumAuthorityFR45();
  if (evidence.schemaVersion !== 'fr45-runtime-evidence-v1' ||
      evidence.evidenceRef !== 'evidence.face.mediapipe_face_oval_inferior_extremum.fr45.runtime' ||
      evidence.evidenceVersion !== '0.1.0' || evidence.upstreamAuthorityRef !== UPSTREAM_REF ||
      evidence.evidenceLevel !== 'single_fixture_real_runtime' || evidence.packageName !== '@mediapipe/tasks-vision' ||
      evidence.packageVersion !== '0.10.35' || evidence.workflowRunId !== 33260433549 ||
      evidence.discoveryHeadCommit !== '8d714a2e31e4d25fe822e2fe45ddc3ec125c1fc3' ||
      evidence.artifactId !== 9717098645 || evidence.chromeVersion !== 'Google Chrome 151.0.7922.173') {
    throw new FaceAuthorityValidationError('FR-45 runtime evidence identity/provenance drift.');
  }
  const observation = evidence.runtimeObservation;
  if (observation.faceCount !== 1 || observation.landmarkCount !== 478 || observation.deterministicReplay !== true ||
      observation.topologyClass !== 'simple_cycle' || observation.topologyEdgeCount !== 36 || observation.topologyVertexCount !== 36 ||
      observation.state !== 'unique_image_inferior_extremum' || observation.observedProviderLandmarkIndex !== 152 ||
      observation.normalizedX !== 0.5117782354354858 || observation.normalizedY !== 0.5969638824462891 ||
      observation.tiedProviderLandmarkIndices.length !== 1 || observation.tiedProviderLandmarkIndices[0] !== 152) {
    throw new FaceAuthorityValidationError('FR-45 pinned runtime observation drift.');
  }
  if (evidence.evidenceBoundary.observedProviderLandmarkIndexIsEvidenceOnly !== true ||
      Object.entries(evidence.evidenceBoundary)
        .filter(([key]) => key !== 'observedProviderLandmarkIndexIsEvidenceOnly')
        .some(([, value]) => value !== false)) {
    throw new FaceAuthorityValidationError('FR-45 runtime evidence boundary must preserve index-as-evidence-only and all promotions false.');
  }
  return evidence;
}
