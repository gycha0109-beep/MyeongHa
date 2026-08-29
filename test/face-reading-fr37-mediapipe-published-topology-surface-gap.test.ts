import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { describe, expect, it } from 'vitest';
import {
  MEDIAPIPE_PUBLISHED_FACE_LANDMARKER_NAMED_TOPOLOGIES_FR37,
  MEDIAPIPE_PUBLISHED_TOPOLOGY_SURFACE_GAP_AUTHORITY_FR37,
  assertThreeDivisionsProviderBindingsReadyFR37,
  assessMediaPipePublishedTopologySurfaceGapReadinessFR37,
  inspectMediaPipePublishedFaceLandmarkerTopologyFR37,
  validateMediaPipePublishedTopologySurfaceGapAuthorityFR37,
  type MediaPipePublishedTopologySurfaceGapAuthorityFR37V1,
} from '../packages/face-reading/src/index.js';

describe('FR-37 MediaPipe published topology surface gap', () => {
  it('reflects the exact published FaceLandmarker named topology surface at runtime', () => {
    const reflection = inspectMediaPipePublishedFaceLandmarkerTopologyFR37(FaceLandmarker);
    expect(reflection.packageName).toBe('@mediapipe/tasks-vision');
    expect(reflection.packageVersion).toBe('0.10.35');
    expect(reflection.runtimeClass).toBe('FaceLandmarker');
    expect(reflection.exactExpectedNamedTopologySurface).toBe(true);
    expect(reflection.observedNamedTopologyProperties).toEqual(
      [...MEDIAPIPE_PUBLISHED_FACE_LANDMARKER_NAMED_TOPOLOGIES_FR37].sort(),
    );
  });

  it('proves there is no direct named hairline, philtrum, or chin-specific binding', () => {
    const reflection = inspectMediaPipePublishedFaceLandmarkerTopologyFR37(FaceLandmarker);
    expect(reflection.hairlineDirectNamedBindingFound).toBe(false);
    expect(reflection.philtrumDirectNamedBindingFound).toBe(false);
    expect(reflection.chinSpecificDirectNamedBindingFound).toBe(false);
  });

  it('keeps all three FR-35 extension surfaces fail-closed', () => {
    expect(() => validateMediaPipePublishedTopologySurfaceGapAuthorityFR37()).not.toThrow();
    expect(MEDIAPIPE_PUBLISHED_TOPOLOGY_SURFACE_GAP_AUTHORITY_FR37.surfaceGaps.map((gap) => gap.surfaceSlot)).toEqual([
      'neutral.face.hairline_boundary',
      'neutral.face.philtrum_region',
      'neutral.face.chin_inferior_contour',
    ]);
    for (const gap of MEDIAPIPE_PUBLISHED_TOPOLOGY_SURFACE_GAP_AUTHORITY_FR37.surfaceGaps) {
      expect(gap.directNamedBindingProperty).toBeNull();
      expect(gap.candidateRelation).toBe('search_surface_only_not_binding');
      expect(gap.subgraphSelectionAuthorized).toBe(false);
      expect(gap.providerLandmarkRefs).toEqual([]);
      expect(gap.providerBindingReady).toBe(false);
    }
  });

  it('does not turn named-topology absence into an extraction-impossibility claim', () => {
    const reflection = inspectMediaPipePublishedFaceLandmarkerTopologyFR37(FaceLandmarker);
    const readiness = assessMediaPipePublishedTopologySurfaceGapReadinessFR37(reflection);
    expect(readiness.publishedRuntimeTopologyMeasured).toBe(true);
    expect(readiness.hairlineDirectNamedBindingAvailable).toBe(false);
    expect(readiness.philtrumDirectNamedBindingAvailable).toBe(false);
    expect(readiness.chinSpecificDirectNamedBindingAvailable).toBe(false);
    expect(readiness.providerBindingReady).toBe(false);
    expect(readiness.providerLandmarkAuthorityUsed).toBe(false);
    expect(readiness.extractionImpossibilityClaimed).toBe(false);
    expect(readiness.productionMetricReady).toBe(false);
  });

  it('rejects arbitrary FACE_OVAL/LIPS/CONTOURS/TESSELATION subgraph promotion', () => {
    const surfaceGaps = MEDIAPIPE_PUBLISHED_TOPOLOGY_SURFACE_GAP_AUTHORITY_FR37.surfaceGaps.map((gap, index) =>
      index === 1 ? { ...gap, subgraphSelectionAuthorized: true } : gap,
    );
    const invalid = {
      ...MEDIAPIPE_PUBLISHED_TOPOLOGY_SURFACE_GAP_AUTHORITY_FR37,
      surfaceGaps,
    } as unknown as MediaPipePublishedTopologySurfaceGapAuthorityFR37V1;
    expect(() => validateMediaPipePublishedTopologySurfaceGapAuthorityFR37(invalid)).toThrow(/cannot promote a candidate topology/u);
  });

  it('rejects provider landmark-index authority injection', () => {
    const surfaceGaps = MEDIAPIPE_PUBLISHED_TOPOLOGY_SURFACE_GAP_AUTHORITY_FR37.surfaceGaps.map((gap, index) =>
      index === 2 ? { ...gap, providerLandmarkRefs: [152] } : gap,
    );
    const invalid = {
      ...MEDIAPIPE_PUBLISHED_TOPOLOGY_SURFACE_GAP_AUTHORITY_FR37,
      surfaceGaps,
    } as unknown as MediaPipePublishedTopologySurfaceGapAuthorityFR37V1;
    expect(() => validateMediaPipePublishedTopologySurfaceGapAuthorityFR37(invalid)).toThrow(/cannot promote a candidate topology/u);
  });

  it('fails if the published runtime named topology surface drifts', () => {
    class DriftedFaceLandmarker {}
    Object.defineProperty(DriftedFaceLandmarker, 'FACE_LANDMARKS_HAIRLINE', { value: [] });
    expect(() => inspectMediaPipePublishedFaceLandmarkerTopologyFR37(DriftedFaceLandmarker)).toThrow(/named topology surface drift/u);
  });

  it('refuses Three Divisions provider-binding promotion after the probe', () => {
    expect(() => assertThreeDivisionsProviderBindingsReadyFR37()).toThrow(
      /reviewed subgraph algorithms\/provider bindings are still absent/u,
    );
  });
});
