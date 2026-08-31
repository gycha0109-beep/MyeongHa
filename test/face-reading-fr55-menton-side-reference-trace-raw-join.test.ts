import { describe, expect, it } from 'vitest';
import {
  MENTON_SIDE_REFERENCE_TRACE_RAW_JOIN_AUTHORITY_FR55,
  assessMentonSideReferenceTraceRawJoinReadinessFR55,
  assertMentonSideReferenceTraceJoinReadyForProductionFR55,
  joinMentonSideCandidatesToReferenceTraceFR55,
  validateMentonSideReferenceTraceRawJoinAuthorityFR55,
  type CentralChinInferiorReferenceTraceAnnotationFR54V1,
  type IndependentCentralChinScaffoldAnnotationFR50V1,
  type MentonSideReferenceTraceRawJoinAuthorityFR55V1,
} from '../packages/face-reading/src/index.js';

function referenceTrace(): CentralChinInferiorReferenceTraceAnnotationFR54V1 {
  return {
    schemaVersion: 'fr54-provider-blind-central-chin-reference-trace-v1',
    subjectId: 'subject-fr55-001',
    captureId: 'capture-fr55-001',
    annotatorId: 'trace-annotator-fr55-001',
    coordinateFrame: 'normalized_image_2d',
    captureView: 'frontal_en_face',
    expression: 'neutral',
    traceOrder: 'raw_annotator_draw_order',
    tracePoints: [
      { x: 0.30, y: 0.80 },
      { x: 0.34, y: 0.82 },
      { x: 0.50, y: 0.85 },
      { x: 0.66, y: 0.82 },
      { x: 0.70, y: 0.80 },
    ],
    mentonTracePointIndex: 2,
    visibleCoverageOnBothSidesOfMentonAttested: true,
    lateralExtentState: 'annotation_coverage_extent_non_authoritative',
    providerOutputVisibleDuringTraceAnnotation: false,
    traditionalLabelVisibleDuringTraceAnnotation: false,
    mentonSideCandidateVisibleDuringTraceAnnotation: false,
    softTissueMentalTubercleCandidateVisibleDuringTraceAnnotation: false,
    traceFrozenBeforeCandidateAnnotationOrComparison: true,
    fullLowerJawlineIntentionallyTraced: false,
    gonionOrOtobasionUsedAsTraceEndpoint: false,
    traceEndpointsAssertedAsFR35Endpoints: false,
  };
}

function mentonSideAnnotation(): IndependentCentralChinScaffoldAnnotationFR50V1 {
  return {
    schemaVersion: 'fr50-independent-central-chin-scaffold-v1',
    subjectId: 'subject-fr55-001',
    captureId: 'capture-fr55-001',
    annotatorId: 'candidate-annotator-fr55-001',
    coordinateFrame: 'normalized_image_2d',
    leftCheilion: { x: 0.34, y: 0.61 },
    leftMentonSide: { x: 0.34, y: 0.82 },
    softTissueMenton: { x: 0.50, y: 0.84 },
    rightMentonSide: { x: 0.66, y: 0.82 },
    rightCheilion: { x: 0.66, y: 0.61 },
    providerOutputVisibleDuringAnnotation: false,
    annotationFrozenBeforeProviderScoring: true,
    traditionalLabelVisibleDuringAnnotation: false,
  };
}

describe('FR-55 threshold-free Menton-side to reference-trace raw join', () => {
  it('defines only threshold-free normalized-image geometry with all decision rules unresolved', () => {
    const authority = validateMentonSideReferenceTraceRawJoinAuthorityFR55();
    expect(authority).toBe(MENTON_SIDE_REFERENCE_TRACE_RAW_JOIN_AUTHORITY_FR55);
    expect(authority.joinProtocol.geometryOperation).toBe('closest_point_on_raw_polyline_by_clamped_euclidean_segment_projection');
    expect(authority.joinProtocol.distanceUnit).toBe('normalized_image_coordinate_euclidean_distance');
    expect(authority.joinProtocol.exactTiePolicy).toBe('preserve_all_exact_minimum_segment_projections');
    expect(authority.joinProtocol.membershipThreshold).toBeNull();
    expect(authority.joinProtocol.anchorAgreementTolerance).toBeNull();
    expect(authority.joinProtocol.endpointSelectionRule).toBeNull();
    expect(authority.joinProtocol.candidateEquivalenceTolerance).toBeNull();
    expect(authority.joinProtocol.empiricalAcceptanceCriterion).toBeNull();
  });

  it('binds source annotations by exact subject and capture identity before joining geometry', () => {
    const joined = joinMentonSideCandidatesToReferenceTraceFR55({
      referenceTraceAnnotation: referenceTrace(),
      mentonSideAnnotation: mentonSideAnnotation(),
    });
    expect(joined.subjectId).toBe('subject-fr55-001');
    expect(joined.captureId).toBe('capture-fr55-001');
    expect(joined.identityBinding).toBe('subject_and_capture_exact_match_verified');
    expect(joined.referenceTraceAnnotatorId).toBe('trace-annotator-fr55-001');
    expect(joined.mentonSideAnnotatorId).toBe('candidate-annotator-fr55-001');
  });

  it('rejects cross-subject and cross-capture joins', () => {
    expect(() => joinMentonSideCandidatesToReferenceTraceFR55({
      referenceTraceAnnotation: referenceTrace(),
      mentonSideAnnotation: { ...mentonSideAnnotation(), subjectId: 'different-subject' },
    })).toThrow(/exact subjectId and captureId identity match/u);
    expect(() => joinMentonSideCandidatesToReferenceTraceFR55({
      referenceTraceAnnotation: referenceTrace(),
      mentonSideAnnotation: { ...mentonSideAnnotation(), captureId: 'different-capture' },
    })).toThrow(/exact subjectId and captureId identity match/u);
  });

  it('preserves every exact minimum projection rather than resolving a vertex tie by segment index', () => {
    const joined = joinMentonSideCandidatesToReferenceTraceFR55({
      referenceTraceAnnotation: referenceTrace(),
      mentonSideAnnotation: mentonSideAnnotation(),
    });
    expect(joined.leftCandidate.minimumDistance).toBe(0);
    expect(joined.rightCandidate.minimumDistance).toBe(0);
    expect(joined.leftCandidate.closestProjections).toHaveLength(2);
    expect(joined.rightCandidate.closestProjections).toHaveLength(2);
    expect(joined.leftCandidate.closestProjections.map((entry) => [entry.rawSegmentStartIndex, entry.rawSegmentEndIndex])).toEqual([[0, 1], [1, 2]]);
    expect(joined.rightCandidate.closestProjections.map((entry) => [entry.rawSegmentStartIndex, entry.rawSegmentEndIndex])).toEqual([[2, 3], [3, 4]]);
    expect(joined.leftCandidate.exactTiePolicy).toBe('preserve_all_exact_minimum_segment_projections');
    expect(joined.leftCandidate.membershipDecision).toBeNull();
    expect(joined.leftCandidate.endpointDecision).toBeNull();
  });

  it('reports raw nonzero candidate distance without converting it into membership', () => {
    const candidate = mentonSideAnnotation();
    const joined = joinMentonSideCandidatesToReferenceTraceFR55({
      referenceTraceAnnotation: referenceTrace(),
      mentonSideAnnotation: {
        ...candidate,
        leftMentonSide: { x: 0.34, y: 0.78 },
        rightMentonSide: { x: 0.66, y: 0.78 },
      },
    });
    expect(joined.leftCandidate.minimumDistance).toBeGreaterThan(0);
    expect(joined.rightCandidate.minimumDistance).toBeGreaterThan(0);
    expect(joined.leftCandidate.interpretation).toBe('raw_geometric_distance_only_no_membership_or_endpoint_inference');
    expect(joined.rightCandidate.interpretation).toBe('raw_geometric_distance_only_no_membership_or_endpoint_inference');
    expect(joined.membershipThreshold).toBeNull();
    expect(joined.endpointSelectionRule).toBeNull();
  });

  it('reports cross-annotation Menton offset as a raw number without an agreement decision', () => {
    const joined = joinMentonSideCandidatesToReferenceTraceFR55({
      referenceTraceAnnotation: referenceTrace(),
      mentonSideAnnotation: mentonSideAnnotation(),
    });
    expect(joined.midlineAnchorOffset.referenceTraceMenton).toEqual({ x: 0.50, y: 0.85 });
    expect(joined.midlineAnchorOffset.candidateAnnotationMenton).toEqual({ x: 0.50, y: 0.84 });
    expect(joined.midlineAnchorOffset.distance).toBeCloseTo(0.01, 12);
    expect(joined.midlineAnchorOffset.agreementDecision).toBeNull();
    expect(joined.anchorAgreementTolerance).toBeNull();
  });

  it('does not reinterpret reversed raw draw order as reversed anatomy', () => {
    const original = referenceTrace();
    const reversedTrace: CentralChinInferiorReferenceTraceAnnotationFR54V1 = {
      ...original,
      tracePoints: [...original.tracePoints].reverse(),
      mentonTracePointIndex: 2,
    };
    const forward = joinMentonSideCandidatesToReferenceTraceFR55({
      referenceTraceAnnotation: original,
      mentonSideAnnotation: mentonSideAnnotation(),
    });
    const reversed = joinMentonSideCandidatesToReferenceTraceFR55({
      referenceTraceAnnotation: reversedTrace,
      mentonSideAnnotation: mentonSideAnnotation(),
    });
    expect(reversed.leftCandidate.minimumDistance).toBe(forward.leftCandidate.minimumDistance);
    expect(reversed.rightCandidate.minimumDistance).toBe(forward.rightCandidate.minimumDistance);
    expect(MENTON_SIDE_REFERENCE_TRACE_RAW_JOIN_AUTHORITY_FR55.authorityBoundary.rawSegmentIndexMeansAnatomicalLaterality).toBe(false);
    expect(MENTON_SIDE_REFERENCE_TRACE_RAW_JOIN_AUTHORITY_FR55.authorityBoundary.candidateLeftRightLabelDefinesTraceDirection).toBe(false);
  });

  it('inherits FR-54 anti-circularity and rejects a candidate-visible reference trace', () => {
    expect(() => joinMentonSideCandidatesToReferenceTraceFR55({
      referenceTraceAnnotation: {
        ...referenceTrace(),
        mentonSideCandidateVisibleDuringTraceAnnotation: true as false,
      },
      mentonSideAnnotation: mentonSideAnnotation(),
    })).toThrow(/provider\/traditional\/candidate blind/u);
  });

  it('keeps zero raw distance, coverage vertices, normalized distance, and freeze attestation from becoming stronger authority', () => {
    const authority = MENTON_SIDE_REFERENCE_TRACE_RAW_JOIN_AUTHORITY_FR55;
    expect(authority.authorityBoundary.rawDistanceMeansTraceMembership).toBe(false);
    expect(authority.authorityBoundary.zeroDistanceMeansFR35Endpoint).toBe(false);
    expect(authority.authorityBoundary.nearestProjectionMeansAnatomicalEndpoint).toBe(false);
    expect(authority.authorityBoundary.traceCoverageBoundaryMeansAnatomicalEndpoint).toBe(false);
    expect(authority.authorityBoundary.normalizedImageDistanceMeansPhysicalDistance).toBe(false);
    expect(authority.authorityBoundary.exactTieResolutionMayUseIndexPriority).toBe(false);
    expect(authority.authorityBoundary.fr54ReferenceTraceMeansReviewedReferenceStandard).toBe(false);
    expect(authority.authorityBoundary.attestedFreezeOrderMeansCryptographicChronologyProof).toBe(false);
    expect(Object.values(authority.authorityBoundary).every((value) => value === false)).toBe(true);
  });

  it('rejects authority mutation that invents a membership threshold', () => {
    const mutated = {
      ...MENTON_SIDE_REFERENCE_TRACE_RAW_JOIN_AUTHORITY_FR55,
      joinProtocol: {
        ...MENTON_SIDE_REFERENCE_TRACE_RAW_JOIN_AUTHORITY_FR55.joinProtocol,
        membershipThreshold: 0.01,
      },
    } as unknown as MentonSideReferenceTraceRawJoinAuthorityFR55V1;
    expect(() => validateMentonSideReferenceTraceRawJoinAuthorityFR55(mutated)).toThrow(/must not invent membership/u);
  });

  it('reports raw join execution ready while real evidence, membership, endpoint, and production remain blocked', () => {
    const readiness = assessMentonSideReferenceTraceRawJoinReadinessFR55();
    expect(readiness.sameCaptureIdentityBindingReady).toBe(true);
    expect(readiness.thresholdFreeDistanceComputationReady).toBe(true);
    expect(readiness.exactTiePreservationReady).toBe(true);
    expect(readiness.rawJoinResearchExecutionReady).toBe(true);
    expect(readiness.realReferenceTraceDatasetPresent).toBe(false);
    expect(readiness.realPairedJoinDatasetPresent).toBe(false);
    expect(readiness.reviewedReferenceStandardReady).toBe(false);
    expect(readiness.membershipDecisionReady).toBe(false);
    expect(readiness.endpointSelectionReady).toBe(false);
    expect(readiness.providerMappingReady).toBe(false);
    expect(readiness.productionGeometryReady).toBe(false);
    expect(() => assertMentonSideReferenceTraceJoinReadyForProductionFR55()).toThrow(/threshold-free raw candidate-to-trace geometry only/u);
  });
});
