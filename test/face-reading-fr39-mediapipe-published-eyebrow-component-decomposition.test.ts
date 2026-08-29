import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { describe, expect, it } from 'vitest';
import {
  MEDIAPIPE_PUBLISHED_EYEBROW_COMPONENT_DECOMPOSITION_AUTHORITY_FR39,
  assertNeutralEyebrowCurveReadyFR39,
  assessMediaPipePublishedEyebrowComponentDecompositionReadinessFR39,
  inspectMediaPipePublishedEyebrowComponentsFR39,
  validateMediaPipePublishedEyebrowComponentDecompositionAuthorityFR39,
  type MediaPipePublishedEyebrowComponentDecompositionAuthorityFR39V1,
} from '../packages/face-reading/src/index.js';

describe('FR-39 published eyebrow component decomposition evidence', () => {
  it('decomposes each exact published eyebrow graph into two complete open paths', () => {
    const evidence = inspectMediaPipePublishedEyebrowComponentsFR39(FaceLandmarker);
    expect(evidence.left.topologySymbol).toBe('FACE_LANDMARKS_LEFT_EYEBROW');
    expect(evidence.right.topologySymbol).toBe('FACE_LANDMARKS_RIGHT_EYEBROW');

    for (const side of [evidence.left, evidence.right]) {
      expect(side.providerComponentCount).toBe(2);
      expect(side.components).toHaveLength(2);
      expect(side.allProviderEdgesAccountedForExactlyOnce).toBe(true);
      const edgeKeys = side.components.flatMap((component) =>
        component.providerEdgeEvidence.map((edge) => `${Math.min(edge.start, edge.end)}:${Math.max(edge.start, edge.end)}`),
      );
      expect(edgeKeys).toHaveLength(8);
      expect(new Set(edgeKeys).size).toBe(8);
      for (const component of side.components) {
        expect(component.topologyClass).toBe('open_path');
        expect(component.edgeCount).toBe(4);
        expect(component.vertexCount).toBe(5);
        expect(component.endpointCount).toBe(2);
        expect(component.cycleRank).toBe(0);
        expect(component.maxVertexDegree).toBe(2);
      }
    }
  });

  it('keeps evidence serialization order explicitly non-semantic', () => {
    const evidence = inspectMediaPipePublishedEyebrowComponentsFR39(FaceLandmarker);
    for (const side of [evidence.left, evidence.right]) {
      expect(side.components.map((component) => component.serializationOrdinal)).toEqual([1, 2]);
      for (const component of side.components) {
        expect(component.serializationOrderHasSemanticMeaning).toBe(false);
        expect(component.neutralRole).toBeNull();
        expect(component.selectedAsNeutralCurve).toBe(false);
      }
    }
  });

  it('does not authorize selecting, bridging, or averaging provider components', () => {
    expect(() => validateMediaPipePublishedEyebrowComponentDecompositionAuthorityFR39()).not.toThrow();
    const boundary = MEDIAPIPE_PUBLISHED_EYEBROW_COMPONENT_DECOMPOSITION_AUTHORITY_FR39.authorityBoundary;
    expect(boundary.firstComponentSelectionAllowed).toBe(false);
    expect(boundary.secondComponentSelectionAllowed).toBe(false);
    expect(boundary.bridgeDisconnectedComponentsAllowed).toBe(false);
    expect(boundary.pointwiseAverageWithoutCorrespondenceAllowed).toBe(false);
    expect(boundary.bezierSmoothingAllowed).toBe(false);
    expect(boundary.providerIndexSemanticsAuthorized).toBe(false);
    expect(boundary.providerComponentToTraditionalBrowEquivalenceAuthorized).toBe(false);
    expect(boundary.neutralSingleCurveAlgorithmAuthorized).toBe(false);
  });

  it('reports structural evidence progress while keeping neutral semantics unresolved', () => {
    const evidence = inspectMediaPipePublishedEyebrowComponentsFR39(FaceLandmarker);
    const readiness = assessMediaPipePublishedEyebrowComponentDecompositionReadinessFR39(evidence);
    expect(readiness.exactPublishedPackagePinned).toBe(true);
    expect(readiness.leftProviderComponentsMeasured).toBe(true);
    expect(readiness.rightProviderComponentsMeasured).toBe(true);
    expect(readiness.allEdgesPartitionedExactlyOnce).toBe(true);
    expect(readiness.componentStructuralSymmetryObserved).toBe(true);
    expect(readiness.componentAnatomicalRoleResolved).toBe(false);
    expect(readiness.crossComponentCorrespondenceResolved).toBe(false);
    expect(readiness.neutralBrowCurveReady).toBe(false);
    expect(readiness.browMidlineReady).toBe(false);
    expect(readiness.productionMetricReady).toBe(false);
  });

  it('rejects silently assigning the first serialized component as the neutral brow curve', () => {
    const invalid = {
      ...MEDIAPIPE_PUBLISHED_EYEBROW_COMPONENT_DECOMPOSITION_AUTHORITY_FR39,
      authorityBoundary: {
        ...MEDIAPIPE_PUBLISHED_EYEBROW_COMPONENT_DECOMPOSITION_AUTHORITY_FR39.authorityBoundary,
        firstComponentSelectionAllowed: true,
      },
    } as unknown as MediaPipePublishedEyebrowComponentDecompositionAuthorityFR39V1;
    expect(() => validateMediaPipePublishedEyebrowComponentDecompositionAuthorityFR39(invalid)).toThrow(
      /authority boundary must remain fully fail-closed/u,
    );
  });

  it('rejects treating deterministic provider component order as anatomical order', () => {
    const invalid = {
      ...MEDIAPIPE_PUBLISHED_EYEBROW_COMPONENT_DECOMPOSITION_AUTHORITY_FR39,
      authorityBoundary: {
        ...MEDIAPIPE_PUBLISHED_EYEBROW_COMPONENT_DECOMPOSITION_AUTHORITY_FR39.authorityBoundary,
        serializationOrdinalIsAnatomicalOrder: true,
      },
    } as unknown as MediaPipePublishedEyebrowComponentDecompositionAuthorityFR39V1;
    expect(() => validateMediaPipePublishedEyebrowComponentDecompositionAuthorityFR39(invalid)).toThrow(
      /authority boundary must remain fully fail-closed/u,
    );
  });

  it('keeps the unresolved neutral questions explicit', () => {
    expect(MEDIAPIPE_PUBLISHED_EYEBROW_COMPONENT_DECOMPOSITION_AUTHORITY_FR39.unresolvedNeutralQuestions).toEqual([
      'which_provider_component_if_any_corresponds_to_neutral_brow_curve',
      'whether_both_components_jointly_define_a_neutral_brow_region_or_curve',
      'whether_cross_component_correspondence_is_methodologically_valid',
      'how_pose_capture_and_expression_stability_must_be_measured',
    ]);
  });

  it('refuses neutral eyebrow promotion after provider component decomposition', () => {
    expect(() => assertNeutralEyebrowCurveReadyFR39()).toThrow(
      /no neutral eyebrow single-curve algorithm or component role has been reviewed/u,
    );
  });
});
