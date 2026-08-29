import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { describe, expect, it } from 'vitest';
import {
  MEDIAPIPE_FACE_OVAL_INFERIOR_EXTREMUM_AUTHORITY_FR45,
  MEDIAPIPE_FACE_OVAL_SOURCE_EDGES_FR45,
  assertMediaPipeFaceOvalInferiorExtremumProductionReadyFR45,
  assessMediaPipeFaceOvalInferiorExtremumReadinessFR45,
  deriveMediaPipeFaceOvalImageInferiorExtremumFR45,
  inspectMediaPipeFaceOvalTopologyFR45,
  validateMediaPipeFaceOvalInferiorExtremumAuthorityFR45,
} from '../packages/face-reading/src/index.js';

function syntheticLandmarks(): Array<{ x: number; y: number; z: number }> {
  return Array.from({ length: 478 }, (_, index) => ({ x: index / 1000, y: 0.2, z: 0 }));
}

describe('FR-45 MediaPipe face oval inferior-extremum candidate', () => {
  it('pins exact v0.10.35 source witness and fail-closed authority', () => {
    const authority = validateMediaPipeFaceOvalInferiorExtremumAuthorityFR45();
    expect(authority.exactSourceWitness).toEqual({
      repository: 'google-ai-edge/mediapipe',
      ref: 'v0.10.35',
      path: 'mediapipe/tasks/web/vision/face_landmarker/face_landmarks_connections.ts',
      blobSha: '644de9d8c7cd90880d92b2393b4913fa93ace927',
      symbol: 'FACE_LANDMARKS_FACE_OVAL',
    });
    expect(Object.values(authority.authorityBoundary)).toEqual(Array(10).fill(false));
    expect(authority.candidateAlgorithm.exactTiePolicy).toBe('ambiguous_no_epsilon');
  });

  it('matches the exact published FACE_OVAL source edge sequence and simple-cycle structure', () => {
    expect(MEDIAPIPE_FACE_OVAL_SOURCE_EDGES_FR45).toHaveLength(36);
    expect(MEDIAPIPE_FACE_OVAL_SOURCE_EDGES_FR45[0]).toEqual({ start: 10, end: 338 });
    expect(MEDIAPIPE_FACE_OVAL_SOURCE_EDGES_FR45[17]).toEqual({ start: 377, end: 152 });
    expect(MEDIAPIPE_FACE_OVAL_SOURCE_EDGES_FR45[18]).toEqual({ start: 152, end: 148 });
    expect(MEDIAPIPE_FACE_OVAL_SOURCE_EDGES_FR45[35]).toEqual({ start: 109, end: 10 });

    const evidence = inspectMediaPipeFaceOvalTopologyFR45(FaceLandmarker);
    expect(evidence).toEqual({
      topologySymbol: 'FACE_LANDMARKS_FACE_OVAL',
      sourceRuntimeEdgeSequenceMatch: true,
      edgeCount: 36,
      vertexCount: 36,
      connectedComponentCount: 1,
      cycleRank: 1,
      maxVertexDegree: 2,
      topologyClass: 'simple_cycle',
      providerIndexSemanticAuthority: false,
    });
  });

  it('selects a unique image-space inferior extremum by geometry rather than hardcoded provider index semantics', () => {
    const landmarks = syntheticLandmarks();
    landmarks[377] = { x: 0.47, y: 0.91, z: 0 };
    landmarks[152] = { x: 0.50, y: 0.88, z: 0 };

    const result = deriveMediaPipeFaceOvalImageInferiorExtremumFR45(FaceLandmarker, landmarks);
    expect(result.state).toBe('unique_image_inferior_extremum');
    expect(result.selectedProviderLandmarkIndex).toBe(377);
    expect(result.selectedPoint).toEqual({ x: 0.47, y: 0.91 });
    expect(result.maxY).toBe(0.91);
    expect(result.providerIndexSemanticAuthority).toBe(false);
    expect(result.traditionalDigeEquivalenceAuthorized).toBe(false);
    expect(result.fr36VerticalReferencePromoted).toBe(false);
    expect(result.productionGeometryAuthorized).toBe(false);
  });

  it('returns exact ties as ambiguous without inventing epsilon or index priority', () => {
    const landmarks = syntheticLandmarks();
    landmarks[377] = { x: 0.47, y: 0.91, z: 0 };
    landmarks[152] = { x: 0.50, y: 0.91, z: 0 };

    const result = deriveMediaPipeFaceOvalImageInferiorExtremumFR45(FaceLandmarker, landmarks);
    expect(result.state).toBe('ambiguous_exact_tie');
    expect(result.selectedProviderLandmarkIndex).toBeNull();
    expect(result.selectedPoint).toBeNull();
    expect(result.tiedProviderLandmarkIndices).toEqual([377, 152]);
  });

  it('fails closed when exact published FACE_OVAL source/runtime order drifts', () => {
    const fakeRuntime = new Proxy(FaceLandmarker, {
      get(target, property, receiver) {
        if (property === 'FACE_LANDMARKS_FACE_OVAL') return [...target.FACE_LANDMARKS_FACE_OVAL].reverse();
        return Reflect.get(target, property, receiver);
      },
    });
    expect(() => inspectMediaPipeFaceOvalTopologyFR45(fakeRuntime)).toThrow(/edge sequence drifted/);
  });

  it('requires every referenced provider landmark to be finite', () => {
    const landmarks = syntheticLandmarks();
    landmarks[152] = { x: Number.NaN, y: 0.9, z: 0 };
    expect(() => deriveMediaPipeFaceOvalImageInferiorExtremumFR45(FaceLandmarker, landmarks)).toThrow(/missing\/non-finite/);
  });

  it('reports provider-neutral extraction ready while FR-35/FR-36/traditional promotion stays blocked', () => {
    const readiness = assessMediaPipeFaceOvalInferiorExtremumReadinessFR45();
    expect(readiness.releaseExactFaceOvalTopologyReady).toBe(true);
    expect(readiness.providerNeutralExtremumAlgorithmExecutable).toBe(true);
    expect(readiness.providerIndexSemanticAuthorityUsed).toBe(false);
    expect(readiness.fr35ChinInferiorContourBindingReady).toBe(false);
    expect(readiness.traditionalDigeEquivalenceReady).toBe(false);
    expect(readiness.fr36DigeVerticalReferenceReady).toBe(false);
    expect(readiness.productionMetricReady).toBe(false);
    expect(readiness.nextRequiredEvidence).toHaveLength(4);
  });

  it('cannot be promoted to production merely because the provider-neutral extremum is executable', () => {
    expect(() => assertMediaPipeFaceOvalInferiorExtremumProductionReadyFR45()).toThrow(/FR-35 binding.*地閣.*FR-36 promotion.*remain blocked/);
    expect(MEDIAPIPE_FACE_OVAL_INFERIOR_EXTREMUM_AUTHORITY_FR45.authorityBoundary.imageInferiorExtremumMeansTraditionalDige).toBe(false);
  });
});
