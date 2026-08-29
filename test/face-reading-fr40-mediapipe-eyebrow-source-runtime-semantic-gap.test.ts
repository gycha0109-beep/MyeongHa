import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { describe, expect, it } from 'vitest';
import {
  MEDIAPIPE_EYEBROW_SOURCE_RUNTIME_SEMANTIC_GAP_AUTHORITY_FR40,
  assertEyebrowNeutralRepresentationCandidateAdmittedFR40,
  assessMediaPipeEyebrowSourceRuntimeSemanticGapReadinessFR40,
  inspectMediaPipeEyebrowExactSourceRuntimeAgreementFR40,
  validateMediaPipeEyebrowSourceRuntimeSemanticGapAuthorityFR40,
  type MediaPipeEyebrowSourceRuntimeSemanticGapAuthorityFR40V1,
} from '../packages/face-reading/src/index.js';

describe('FR-40 exact eyebrow source/runtime semantic gap', () => {
  it('pins the exact v0.10.35 MediaPipe source witnesses reviewed for FR-40', () => {
    const witnesses = MEDIAPIPE_EYEBROW_SOURCE_RUNTIME_SEMANTIC_GAP_AUTHORITY_FR40.sourceWitnesses;
    expect(witnesses).toEqual([
      {
        repository: 'google-ai-edge/mediapipe',
        ref: 'v0.10.35',
        path: 'mediapipe/tasks/web/vision/face_landmarker/face_landmarks_connections.ts',
        blobSha: '644de9d8c7cd90880d92b2393b4913fa93ace927',
        sourceReviewState: 'exact_tag_source_checked',
      },
      {
        repository: 'google-ai-edge/mediapipe',
        ref: 'v0.10.35',
        path: 'mediapipe/tasks/web/vision/face_landmarker/face_landmarker.ts',
        blobSha: '6d9b2f713345fb576301f40c3d520829ab5f23be',
        sourceReviewState: 'exact_tag_source_checked',
      },
    ]);
  });

  it('attests exact edge-sequence agreement between tagged source and installed runtime', () => {
    const agreement = inspectMediaPipeEyebrowExactSourceRuntimeAgreementFR40(FaceLandmarker);
    expect(agreement.leftExactAgreement).toBe(true);
    expect(agreement.rightExactAgreement).toBe(true);
    expect(agreement.componentSemanticsResolvedByMediaPipeSource).toBe(false);
  });

  it('preserves the exact source edge sequences as provider evidence without neutral semantics', () => {
    const [left, right] = MEDIAPIPE_EYEBROW_SOURCE_RUNTIME_SEMANTIC_GAP_AUTHORITY_FR40.semanticObservations;
    expect(left.exactSourceEdgePairs).toEqual([
      [276, 283], [283, 282], [282, 295], [295, 285],
      [300, 293], [293, 334], [334, 296], [296, 336],
    ]);
    expect(right.exactSourceEdgePairs).toEqual([
      [46, 53], [53, 52], [52, 65], [65, 55],
      [70, 63], [63, 105], [105, 66], [66, 107],
    ]);
    for (const observation of [left, right]) {
      expect(observation.sourceCommentScope).toBe('whole_eyebrow_only');
      expect(observation.publicStaticApiDocScope).toBe('whole_eyebrow_only');
      expect(observation.componentSpecificNamedSymbolsFound).toBe(false);
      expect(observation.componentSpecificAnatomicalLabelsFound).toBe(false);
      expect(observation.componentOrderingSemanticsFound).toBe(false);
      expect(observation.neutralCurveSemanticsFound).toBe(false);
    }
  });

  it('keeps all bounded neutral-representation candidates blocked with no algorithmRef', () => {
    expect(() => validateMediaPipeEyebrowSourceRuntimeSemanticGapAuthorityFR40()).not.toThrow();
    const candidates = MEDIAPIPE_EYEBROW_SOURCE_RUNTIME_SEMANTIC_GAP_AUTHORITY_FR40.candidates;
    expect(candidates.map((candidate) => candidate.candidateClass)).toEqual([
      'single_provider_component_curve',
      'paired_provider_components_region',
      'correspondence_derived_centerline',
    ]);
    for (const candidate of candidates) {
      expect(candidate.algorithmRef).toBeNull();
      expect(candidate.requiredEvidenceKeys.length).toBeGreaterThan(0);
      expect(candidate.forbiddenShortcutRefs.length).toBeGreaterThan(0);
      expect(candidate.researchCandidateAdmitted).toBe(false);
      expect(candidate.reviewed).toBe(false);
    }
  });

  it('does not infer upper/lower, inner/outer, or component priority from source order', () => {
    const boundary = MEDIAPIPE_EYEBROW_SOURCE_RUNTIME_SEMANTIC_GAP_AUTHORITY_FR40.authorityBoundary;
    expect(boundary.sourceOrderMeansComponentPriority).toBe(false);
    expect(boundary.firstFourEdgesMeanPreferredNeutralCurve).toBe(false);
    expect(boundary.secondFourEdgesMeanPreferredNeutralCurve).toBe(false);
    expect(boundary.disconnectedPathsMeanUpperLowerBoundaries).toBe(false);
    expect(boundary.disconnectedPathsMeanInnerOuterBoundaries).toBe(false);
    expect(boundary.indexwiseCrossComponentCorrespondenceAllowed).toBe(false);
    expect(boundary.endpointBridgingAllowed).toBe(false);
    expect(boundary.candidateAdmissionWithoutExternalNeutralEvidenceAllowed).toBe(false);
  });

  it('reports exact source/runtime progress without admitting a neutral brow representation', () => {
    const agreement = inspectMediaPipeEyebrowExactSourceRuntimeAgreementFR40(FaceLandmarker);
    const readiness = assessMediaPipeEyebrowSourceRuntimeSemanticGapReadinessFR40(agreement);
    expect(readiness.exactTagSourceReviewed).toBe(true);
    expect(readiness.exactSourceRuntimeEdgeAgreement).toBe(true);
    expect(readiness.wholeEyebrowSymbolSemanticsConfirmed).toBe(true);
    expect(readiness.componentSpecificSourceSemanticsAvailable).toBe(false);
    expect(readiness.admittedNeutralRepresentationCandidates).toBe(0);
    expect(readiness.neutralBrowCurveReady).toBe(false);
    expect(readiness.browMidlineReady).toBe(false);
    expect(readiness.productionMetricReady).toBe(false);
  });

  it('rejects candidate admission without new external neutral evidence', () => {
    const candidates = MEDIAPIPE_EYEBROW_SOURCE_RUNTIME_SEMANTIC_GAP_AUTHORITY_FR40.candidates.map((candidate, index) =>
      index === 0 ? { ...candidate, researchCandidateAdmitted: true, algorithmRef: 'algorithm.fake.first-chain' } : candidate,
    );
    const invalid = {
      ...MEDIAPIPE_EYEBROW_SOURCE_RUNTIME_SEMANTIC_GAP_AUTHORITY_FR40,
      candidates,
    } as unknown as MediaPipeEyebrowSourceRuntimeSemanticGapAuthorityFR40V1;
    expect(() => validateMediaPipeEyebrowSourceRuntimeSemanticGapAuthorityFR40(invalid)).toThrow(
      /cannot be promoted without external neutral evidence/u,
    );
  });

  it('rejects interpreting exact source edge pairs as neutral landmark authority', () => {
    const invalid = {
      ...MEDIAPIPE_EYEBROW_SOURCE_RUNTIME_SEMANTIC_GAP_AUTHORITY_FR40,
      authorityBoundary: {
        ...MEDIAPIPE_EYEBROW_SOURCE_RUNTIME_SEMANTIC_GAP_AUTHORITY_FR40.authorityBoundary,
        exactSourceEdgePairMeansNeutralLandmarkAuthority: true,
      },
    } as unknown as MediaPipeEyebrowSourceRuntimeSemanticGapAuthorityFR40V1;
    expect(() => validateMediaPipeEyebrowSourceRuntimeSemanticGapAuthorityFR40(invalid)).toThrow(
      /authority boundary must remain fully fail-closed/u,
    );
  });

  it('refuses neutral candidate promotion after exact source/runtime attestation', () => {
    expect(() => assertEyebrowNeutralRepresentationCandidateAdmittedFR40()).toThrow(
      /no eyebrow neutral representation candidate is admitted/u,
    );
  });
});
