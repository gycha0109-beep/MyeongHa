import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { describe, expect, it } from 'vitest';
import {
  FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16,
  MEDIAPIPE_PUBLISHED_DERIVATION_GAP_RECONCILIATION_AUTHORITY_FR38,
  MEDIAPIPE_PUBLISHED_FACE_LANDMARKER_NAMED_TOPOLOGIES_FR37,
  NEUTRAL_DERIVATION_REGISTRY_FR17,
  assertThreeDivisionsNeutralDerivationsReadyFR38,
  assessMediaPipePublishedDerivationGapReconciliationReadinessFR38,
  inspectMediaPipePublishedBrowTopologyGraphsFR38,
  validateMediaPipePublishedDerivationGapReconciliationAuthorityFR38,
  type MediaPipePublishedDerivationGapReconciliationAuthorityFR38V1,
} from '../packages/face-reading/src/index.js';

describe('FR-38 published derivation gap reconciliation', () => {
  it('release-exactly attests both published eyebrow connection graphs', () => {
    const reflection = inspectMediaPipePublishedBrowTopologyGraphsFR38(FaceLandmarker);
    expect(reflection.packageName).toBe('@mediapipe/tasks-vision');
    expect(reflection.packageVersion).toBe('0.10.35');
    expect(reflection.releaseExactRuntimeGraphShapeAttested).toBe(true);
    expect(reflection.neutralCurveDerivationAuthorized).toBe(false);
    expect(reflection.leftBrow).toEqual({
      topologySymbol: 'FACE_LANDMARKS_LEFT_EYEBROW',
      edgeCount: 8,
      vertexCount: 10,
      connectedComponentCount: 2,
      cycleRank: 0,
      maxVertexDegree: 2,
    });
    expect(reflection.rightBrow).toEqual({
      topologySymbol: 'FACE_LANDMARKS_RIGHT_EYEBROW',
      edgeCount: 8,
      vertexCount: 10,
      connectedComponentCount: 2,
      cycleRank: 0,
      maxVertexDegree: 2,
    });
  });

  it('reconciles the FR-16 upstream witness with the exact published runtime without promoting it wholesale', () => {
    expect(FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.topologySourceEvidence.releaseExactForInstalledPackage).toBe(false);
    expect(MEDIAPIPE_PUBLISHED_FACE_LANDMARKER_NAMED_TOPOLOGIES_FR37).toContain('FACE_LANDMARKS_LEFT_EYEBROW');
    expect(MEDIAPIPE_PUBLISHED_FACE_LANDMARKER_NAMED_TOPOLOGIES_FR37).toContain('FACE_LANDMARKS_RIGHT_EYEBROW');
    expect(MEDIAPIPE_PUBLISHED_FACE_LANDMARKER_NAMED_TOPOLOGIES_FR37).not.toContain('FACE_LANDMARKS_NOSE');
    expect(() => validateMediaPipePublishedDerivationGapReconciliationAuthorityFR38()).not.toThrow();
  });

  it('keeps both neutral brow curves blocked even after release-exact graph-shape attestation', () => {
    const gaps = MEDIAPIPE_PUBLISHED_DERIVATION_GAP_RECONCILIATION_AUTHORITY_FR38.gaps;
    const brow = gaps.find((entry) => entry.verticalAnchorRef === 'brow')!;
    expect(brow.gapClass).toBe('published_named_surface_graph_attested_algorithm_blocked');
    expect(brow.releaseExactNamedSurfaceAvailable).toBe(true);
    expect(brow.releaseExactRuntimeGraphShapeAttested).toBe(true);
    expect(brow.reviewedNeutralDerivationAvailable).toBe(false);
    expect(brow.productionBindingReady).toBe(false);
    for (const ref of brow.fr17DerivationRefs) {
      const derivation = NEUTRAL_DERIVATION_REGISTRY_FR17.definitions.find((entry) => entry.derivationId === ref)!;
      expect(derivation.algorithmRef).toBeNull();
      expect(derivation.reviewState).toBe('blocked_unresolved');
    }
  });

  it('marks yintang as dependency-blocked behind the unreviewed brow curves', () => {
    const yintang = MEDIAPIPE_PUBLISHED_DERIVATION_GAP_RECONCILIATION_AUTHORITY_FR38.gaps.find(
      (entry) => entry.verticalAnchorRef === 'yintang',
    )!;
    expect(yintang.gapClass).toBe('derived_dependency_blocked');
    expect(yintang.fr17DerivationRefs).toEqual(['derivation.neutral.brow_midline.pending']);
    const midline = NEUTRAL_DERIVATION_REGISTRY_FR17.definitions.find(
      (entry) => entry.derivationId === 'derivation.neutral.brow_midline.pending',
    )!;
    expect(midline.reviewState).toBe('blocked_dependency');
    expect(midline.algorithmRef).toBeNull();
  });

  it('does not promote the FR-16 upstream FACE_LANDMARKS_NOSE witness to published 0.10.35 authority', () => {
    const noseSlot = FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.slotEvidence.find((entry) => entry.anchorRef === 'nose')!;
    expect(noseSlot.providerTopologySymbol).toBe('FACE_LANDMARKS_NOSE');
    for (const anchor of ['shangen', 'zhuntou'] as const) {
      const gap = MEDIAPIPE_PUBLISHED_DERIVATION_GAP_RECONCILIATION_AUTHORITY_FR38.gaps.find(
        (entry) => entry.verticalAnchorRef === anchor,
      )!;
      expect(gap.gapClass).toBe('upstream_master_only_not_release_exact');
      expect(gap.upstreamProviderTopologySymbols).toEqual(['FACE_LANDMARKS_NOSE']);
      expect(gap.directPublishedNamedTopologyRefs).toEqual([]);
      expect(gap.releaseExactNamedSurfaceAvailable).toBe(false);
      expect(gap.productionBindingReady).toBe(false);
    }
  });

  it('keeps the FR-35 hairline, philtrum, and chin extensions as direct named-topology gaps', () => {
    for (const anchor of ['hairline', 'renzhong', 'dige'] as const) {
      const gap = MEDIAPIPE_PUBLISHED_DERIVATION_GAP_RECONCILIATION_AUTHORITY_FR38.gaps.find(
        (entry) => entry.verticalAnchorRef === anchor,
      )!;
      expect(gap.gapClass).toBe('no_direct_published_named_surface');
      expect(gap.directPublishedNamedTopologyRefs).toEqual([]);
      expect(gap.searchSurfaceRefs.length).toBeGreaterThan(0);
      expect(gap.providerLandmarkIndexAuthority).toBe(false);
      expect(gap.productionBindingReady).toBe(false);
    }
  });

  it('reports exact progress without making any of the seven vertical references executable', () => {
    const reflection = inspectMediaPipePublishedBrowTopologyGraphsFR38(FaceLandmarker);
    const readiness = assessMediaPipePublishedDerivationGapReconciliationReadinessFR38(reflection);
    expect(readiness.exactPublishedRuntimeSurfaceVerified).toBe(true);
    expect(readiness.publishedBrowGraphShapeAttested).toBe(true);
    expect(readiness.leftBrowNeutralCurveReady).toBe(false);
    expect(readiness.rightBrowNeutralCurveReady).toBe(false);
    expect(readiness.browMidlineReady).toBe(false);
    expect(readiness.noseRegionReady).toBe(false);
    expect(readiness.hairlineBoundaryReady).toBe(false);
    expect(readiness.philtrumRegionReady).toBe(false);
    expect(readiness.chinInferiorContourReady).toBe(false);
    expect(readiness.allSevenVerticalReferencesExecutable).toBe(false);
    expect(readiness.productionMetricReady).toBe(false);
  });

  it('rejects an attempted nose promotion to a direct published named surface', () => {
    const gaps = MEDIAPIPE_PUBLISHED_DERIVATION_GAP_RECONCILIATION_AUTHORITY_FR38.gaps.map((gap) =>
      gap.verticalAnchorRef === 'shangen'
        ? {
            ...gap,
            gapClass: 'published_named_surface_graph_attested_algorithm_blocked' as const,
            directPublishedNamedTopologyRefs: ['FACE_LANDMARKS_CONTOURS' as const],
            releaseExactNamedSurfaceAvailable: true,
          }
        : gap,
    );
    const invalid = {
      ...MEDIAPIPE_PUBLISHED_DERIVATION_GAP_RECONCILIATION_AUTHORITY_FR38,
      gaps,
    } as unknown as MediaPipePublishedDerivationGapReconciliationAuthorityFR38V1;
    expect(() => validateMediaPipePublishedDerivationGapReconciliationAuthorityFR38(invalid)).toThrow(
      /gap reconciliation drift: shangen/u,
    );
  });

  it('rejects treating the published brow graph as an already reviewed neutral curve', () => {
    const gaps = MEDIAPIPE_PUBLISHED_DERIVATION_GAP_RECONCILIATION_AUTHORITY_FR38.gaps.map((gap) =>
      gap.verticalAnchorRef === 'brow'
        ? { ...gap, reviewedNeutralDerivationAvailable: true, productionBindingReady: true }
        : gap,
    );
    const invalid = {
      ...MEDIAPIPE_PUBLISHED_DERIVATION_GAP_RECONCILIATION_AUTHORITY_FR38,
      gaps,
    } as unknown as MediaPipePublishedDerivationGapReconciliationAuthorityFR38V1;
    expect(() => validateMediaPipePublishedDerivationGapReconciliationAuthorityFR38(invalid)).toThrow(
      /gap reconciliation drift: brow/u,
    );
  });

  it('refuses Three Divisions neutral-derivation promotion after reconciliation', () => {
    expect(() => assertThreeDivisionsNeutralDerivationsReadyFR38()).toThrow(
      /reviewed neutral derivation algorithms.*remain incomplete/u,
    );
  });
});
