import { describe, expect, it } from 'vitest';
import {
  CENTRAL_CHIN_REFERENCE_TRACE_AUTHORITY_FR54,
  assessCentralChinReferenceTraceReadinessFR54,
  assertCentralChinReferenceTraceReadyForProductionFR54,
  freezeCentralChinInferiorReferenceTraceFR54,
  validateCentralChinInferiorReferenceTraceAnnotationFR54,
  validateCentralChinReferenceTraceAuthorityFR54,
  type CentralChinInferiorReferenceTraceAnnotationFR54V1,
} from '../packages/face-reading/src/index.js';

function annotation(): CentralChinInferiorReferenceTraceAnnotationFR54V1 {
  return {
    schemaVersion: 'fr54-provider-blind-central-chin-reference-trace-v1',
    subjectId: 'subject-fr54-001',
    captureId: 'capture-fr54-001',
    annotatorId: 'annotator-fr54-001',
    coordinateFrame: 'normalized_image_2d',
    captureView: 'frontal_en_face',
    expression: 'neutral',
    traceOrder: 'raw_annotator_draw_order',
    tracePoints: [
      { x: 0.39, y: 0.79 },
      { x: 0.45, y: 0.83 },
      { x: 0.5, y: 0.85 },
      { x: 0.55, y: 0.83 },
      { x: 0.61, y: 0.79 },
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

describe('FR-54 provider-blind central chin reference trace protocol', () => {
  it('defines raw reference-trace acquisition without endpoint or membership authority', () => {
    const authority = validateCentralChinReferenceTraceAuthorityFR54();
    expect(authority).toBe(CENTRAL_CHIN_REFERENCE_TRACE_AUTHORITY_FR54);
    expect(authority.selectedScopeClass).toBe('central_inferior_soft_tissue_chin_boundary');
    expect(authority.protocol.traceRepresentation).toBe('raw_ordered_polyline');
    expect(authority.protocol.traceOrderMeaning).toBe('raw_annotator_draw_order_preserved_not_anatomical_direction');
    expect(authority.protocol.firstAndLastPointMeaning).toBe('annotation_coverage_extent_only_not_anatomical_endpoint');
    expect(authority.protocol.candidateBlindRequired).toBe(true);
    expect(authority.protocol.providerBlindRequired).toBe(true);
    expect(authority.protocol.traditionalLabelBlindRequired).toBe(true);
  });

  it('keeps exact Zupan landmark authority separate from Skomina geometric corroboration', () => {
    const authority = CENTRAL_CHIN_REFERENCE_TRACE_AUTHORITY_FR54;
    const zupan = authority.evidence.find((entry) => entry.evidenceId === 'evidence.fr54.zupan_2022_menton_and_menton_side');
    const skomina = authority.evidence.find((entry) => entry.evidenceId === 'evidence.fr54.skomina_2024_independent_geometric_corroboration');
    expect(zupan).toBeDefined();
    expect(zupan!.supports.softTissueMentonInferiorMidlineAnchor).toBe(true);
    expect(zupan!.supports.bilateralMentonSideCandidateDefinition).toBe(true);
    expect(skomina).toBeDefined();
    expect(skomina!.supports.independentCentralInferiorChinConstructionCorroborated).toBe(true);
    expect(skomina!.supports.softTissueMentonInferiorMidlineAnchor).toBe(false);
    expect(skomina!.supports.bilateralMentonSideCandidateDefinition).toBe(false);
    expect(authority.authorityBoundary.skominaNomenclatureMeansZupanLandmarkEquivalence).toBe(false);
  });

  it('freezes a raw ordered polyline with an interior Menton trace vertex without assigning anatomical draw direction', () => {
    const frozen = freezeCentralChinInferiorReferenceTraceFR54(annotation());
    expect(frozen.geometry.kind).toBe('raw_polyline');
    expect(frozen.geometry.points).toEqual(annotation().tracePoints);
    expect(frozen.traceOrder).toBe('raw_annotator_draw_order');
    expect(frozen.mentonTracePointIndex).toBe(2);
    expect(frozen.softTissueMentonAnchor).toEqual({ x: 0.5, y: 0.85 });
    expect(frozen.visibleCoverageOnBothSidesOfMentonAttested).toBe(true);
    expect(frozen.rawAnnotationOrderPreserved).toBe(true);
    expect(frozen.lateralExtentState).toBe('annotation_coverage_extent_non_authoritative');
    expect(frozen.referenceRole).toBe('provider_blind_reference_trace_candidate_not_reference_standard');
  });

  it('rejects a reference trace influenced by the Menton-side endpoint candidate', () => {
    expect(() => validateCentralChinInferiorReferenceTraceAnnotationFR54({
      ...annotation(),
      mentonSideCandidateVisibleDuringTraceAnnotation: true as false,
    })).toThrow(/provider\/traditional\/candidate blind/u);
  });

  it('rejects provider or traditional-label visibility during reference tracing', () => {
    expect(() => validateCentralChinInferiorReferenceTraceAnnotationFR54({
      ...annotation(),
      providerOutputVisibleDuringTraceAnnotation: true as false,
    })).toThrow(/provider\/traditional\/candidate blind/u);
    expect(() => validateCentralChinInferiorReferenceTraceAnnotationFR54({
      ...annotation(),
      traditionalLabelVisibleDuringTraceAnnotation: true as false,
    })).toThrow(/provider\/traditional\/candidate blind/u);
  });

  it('requires an interior Menton trace vertex and explicit observed coverage on both sides without deriving side from index order', () => {
    expect(() => validateCentralChinInferiorReferenceTraceAnnotationFR54({
      ...annotation(),
      mentonTracePointIndex: 0,
    })).toThrow(/index position alone does not establish anatomical side membership/u);
    expect(() => validateCentralChinInferiorReferenceTraceAnnotationFR54({
      ...annotation(),
      mentonTracePointIndex: 4,
    })).toThrow(/index position alone does not establish anatomical side membership/u);
    expect(() => validateCentralChinInferiorReferenceTraceAnnotationFR54({
      ...annotation(),
      visibleCoverageOnBothSidesOfMentonAttested: false as true,
    })).toThrow(/trace-state drift/u);
  });

  it('rejects degenerate, non-normalized, and full-jawline annotations', () => {
    const base = annotation();
    expect(() => validateCentralChinInferiorReferenceTraceAnnotationFR54({
      ...base,
      tracePoints: [base.tracePoints[0]!, base.tracePoints[1]!],
      mentonTracePointIndex: 1,
    })).toThrow(/structurally requires/u);
    expect(() => validateCentralChinInferiorReferenceTraceAnnotationFR54({
      ...base,
      tracePoints: [
        base.tracePoints[0]!,
        { x: 1.2, y: 0.83 },
        ...base.tracePoints.slice(2),
      ],
    })).toThrow(/finite normalized image point/u);
    expect(() => validateCentralChinInferiorReferenceTraceAnnotationFR54({
      ...base,
      fullLowerJawlineIntentionallyTraced: true as false,
    })).toThrow(/central-scope-only/u);
  });

  it('does not invent trace density, lateral extent, endpoint, tolerance, staffing, or consensus rules', () => {
    const protocol = CENTRAL_CHIN_REFERENCE_TRACE_AUTHORITY_FR54.protocol;
    expect(protocol.tracePointDensityRule).toBeNull();
    expect(protocol.lateralExtentSelectionRule).toBeNull();
    expect(protocol.endpointSelectionRule).toBeNull();
    expect(protocol.interpolationMethod).toBeNull();
    expect(protocol.smoothingMethod).toBeNull();
    expect(protocol.membershipDistanceTolerance).toBeNull();
    expect(protocol.minimumAnnotators).toBeNull();
    expect(protocol.minimumSubjects).toBeNull();
    expect(protocol.consensusRule).toBeNull();
  });

  it('keeps draw order, coverage endpoints, raw trace, candidate scoring, provider mapping and production fail-closed', () => {
    const frozen = freezeCentralChinInferiorReferenceTraceFR54(annotation());
    expect(CENTRAL_CHIN_REFERENCE_TRACE_AUTHORITY_FR54.authorityBoundary.rawDrawOrderMeansAnatomicalLeftRightOrder).toBe(false);
    expect(CENTRAL_CHIN_REFERENCE_TRACE_AUTHORITY_FR54.authorityBoundary.mentonInteriorIndexMeansGeometricSideMembership).toBe(false);
    expect(frozen.endpointAuthority).toBe(false);
    expect(frozen.denseContinuousCurveAuthority).toBe(false);
    expect(frozen.mentonSideMembershipScoringAuthorized).toBe(false);
    expect(frozen.distanceToleranceAuthorized).toBe(false);
    expect(frozen.providerMappingAuthorized).toBe(false);
    expect(frozen.traditionalDigeEquivalenceAuthorized).toBe(false);
    expect(frozen.referenceStandardAuthorized).toBe(false);
    expect(frozen.productionGeometryAuthorized).toBe(false);
    expect(Object.values(CENTRAL_CHIN_REFERENCE_TRACE_AUTHORITY_FR54.authorityBoundary).every((value) => value === false)).toBe(true);
  });

  it('reports research trace acquisition ready while empirical/reference-standard and endpoint stages stay blocked', () => {
    const readiness = assessCentralChinReferenceTraceReadinessFR54();
    expect(readiness.anatomicalScopeReady).toBe(true);
    expect(readiness.providerBlindReferenceTraceProtocolReady).toBe(true);
    expect(readiness.rawTraceResearchAcquisitionReady).toBe(true);
    expect(readiness.mentonAnchorContractReady).toBe(true);
    expect(readiness.candidateSeparationReady).toBe(true);
    expect(readiness.empiricalReferenceTraceDatasetPresent).toBe(false);
    expect(readiness.reviewedReferenceStandardReady).toBe(false);
    expect(readiness.mentonSideMembershipScoringReady).toBe(false);
    expect(readiness.endpointSelectionReady).toBe(false);
    expect(readiness.providerMappingReady).toBe(false);
    expect(readiness.productionGeometryReady).toBe(false);
    expect(() => assertCentralChinReferenceTraceReadyForProductionFR54()).toThrow(/reference-trace acquisition only/u);
  });
});
