import { describe, expect, it } from 'vitest';
import {
  MEDIAPIPE_FACE_OVAL_INFERIOR_EXTREMUM_RUNTIME_EVIDENCE_FR45,
  validateMediaPipeFaceOvalInferiorExtremumRuntimeEvidenceFR45,
} from '../packages/face-reading/src/mediapipe-face-oval-inferior-extremum-runtime-evidence-fr45.js';

describe('FR-45 pinned real-runtime face-oval evidence', () => {
  it('pins the successful real-browser discovery run and exact observation', () => {
    const evidence = validateMediaPipeFaceOvalInferiorExtremumRuntimeEvidenceFR45();
    expect(evidence.workflowRunId).toBe(33260433549);
    expect(evidence.discoveryHeadCommit).toBe('8d714a2e31e4d25fe822e2fe45ddc3ec125c1fc3');
    expect(evidence.artifactId).toBe(9717098645);
    expect(evidence.runtimeObservation).toEqual({
      faceCount: 1,
      landmarkCount: 478,
      deterministicReplay: true,
      topologyClass: 'simple_cycle',
      topologyEdgeCount: 36,
      topologyVertexCount: 36,
      state: 'unique_image_inferior_extremum',
      observedProviderLandmarkIndex: 152,
      normalizedX: 0.5117782354354858,
      normalizedY: 0.5969638824462891,
      tiedProviderLandmarkIndices: [152],
    });
  });

  it('preserves provider index 152 as single-fixture evidence only', () => {
    const boundary = MEDIAPIPE_FACE_OVAL_INFERIOR_EXTREMUM_RUNTIME_EVIDENCE_FR45.evidenceBoundary;
    expect(boundary.observedProviderLandmarkIndexIsEvidenceOnly).toBe(true);
    expect(boundary.singleFixtureMeansGeneralizedAnatomicalIdentity).toBe(false);
    expect(boundary.providerIndexSemanticAuthority).toBe(false);
    expect(boundary.chinInferiorContourBindingAuthorized).toBe(false);
    expect(boundary.traditionalDigeEquivalenceAuthorized).toBe(false);
    expect(boundary.fr36VerticalReferencePromoted).toBe(false);
    expect(boundary.productionGeometryAuthorized).toBe(false);
    expect(boundary.productionThreeDivisionsMetricAllowed).toBe(false);
    expect(boundary.productionF1Allowed).toBe(false);
    expect(boundary.productionF6Allowed).toBe(false);
  });
});
