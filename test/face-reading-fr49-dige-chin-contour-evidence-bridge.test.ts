import { describe, expect, it } from 'vitest';
import {
  DIGE_CHIN_CONTOUR_EVIDENCE_BRIDGE_AUTHORITY_FR49,
  assessDigeChinContourEvidenceBridgeReadinessFR49,
  assertDigeChinContourEvidenceBridgeReadyForProductionFR49,
  deriveDigeLowerBoundaryResearchCandidateFromIndependentMentonFR49,
  validateDigeChinContourEvidenceBridgeAuthorityFR49,
  type ChinInferiorIndependentAnnotationFR46V1,
} from '../packages/face-reading/src/index.js';

function independentMenton(): ChinInferiorIndependentAnnotationFR46V1 {
  return {
    subjectId: 'subject-fr49-001',
    captureId: 'capture-fr49-001',
    annotatorId: 'annotator-fr49-001',
    targetName: 'soft_tissue_menton',
    x: 0.5,
    y: 0.82,
    providerOutputVisibleDuringAnnotation: false,
    annotationFrozenBeforeProviderScoring: true,
  };
}

describe('FR-49 dige/chin contour evidence bridge', () => {
  it('preserves exact evidence layers without collapsing region, point, contour, or provider semantics', () => {
    const authority = validateDigeChinContourEvidenceBridgeAuthorityFR49();
    expect(authority).toBe(DIGE_CHIN_CONTOUR_EVIDENCE_BRIDGE_AUTHORITY_FR49);
    expect(authority.evidence).toHaveLength(5);

    const relation = authority.relation;
    expect(relation.traditionalDigeChinRegionSupported).toBe(true);
    expect(relation.historicalDigeBoneChinTerminologySupported).toBe(true);
    expect(relation.softTissueMentonDefinedFromChinContourSupported).toBe(true);
    expect(relation.softTissueMentonInferiorMidlineOrMidpointSupported).toBe(true);
    expect(relation.conceptualPointFromContourDefinitionAvailable).toBe(true);
    expect(relation.fr35NeutralChinContourTargetClassExternallyGrounded).toBe(true);

    expect(relation.traditionalDigeIsSinglePunctualLandmarkEstablished).toBe(false);
    expect(relation.fr35ExactContourGeometryEstablished).toBe(false);
    expect(relation.pointMaySubstituteForWholeContour).toBe(false);
    expect(relation.traditionalDigeEqualsSoftTissueMenton).toBe(false);
    expect(relation.providerFaceOvalEqualsSoftTissueChinContour).toBe(false);
    expect(relation.fr45InferiorExtremumEqualsSoftTissueMenton).toBe(false);
  });

  it('keeps the NLC witness transmission exact rather than normalizing 準 to 準頭', () => {
    const mayi = DIGE_CHIN_CONTOUR_EVIDENCE_BRIDGE_AUTHORITY_FR49.evidence[0];
    expect(mayi?.reviewedObservation).toContain('眉至準頭為中停');
    expect(mayi?.reviewedObservation).toContain('準至地閣為下停');
    expect(mayi?.reviewedObservation).not.toContain('準頭至地閣為下停');
  });

  it('derives only a neutral research y-coordinate from an already independent Menton observation', () => {
    const candidate = deriveDigeLowerBoundaryResearchCandidateFromIndependentMentonFR49(independentMenton());
    expect(candidate.verticalCoordinateY).toBe(0.82);
    expect(candidate.derivedFromProviderOutput).toBe(false);
    expect(candidate.providerMappingAuthorized).toBe(false);
    expect(candidate.traditionalDigePointEquivalenceAuthorized).toBe(false);
    expect(candidate.fr35WholeContourSubstitutionAuthorized).toBe(false);
    expect(candidate.productionGeometryAuthorized).toBe(false);
  });

  it('rejects provider-visible or unfrozen observations', () => {
    const base = independentMenton();
    expect(() => deriveDigeLowerBoundaryResearchCandidateFromIndependentMentonFR49({
      ...base,
      providerOutputVisibleDuringAnnotation: true as false,
    })).toThrow(/provider-blind independent soft-tissue Menton observation/u);
    expect(() => deriveDigeLowerBoundaryResearchCandidateFromIndependentMentonFR49({
      ...base,
      annotationFrozenBeforeProviderScoring: false as true,
    })).toThrow(/provider-blind independent soft-tissue Menton observation/u);
  });

  it('rejects invalid normalized coordinates without inventing a tolerance', () => {
    const base = independentMenton();
    expect(() => deriveDigeLowerBoundaryResearchCandidateFromIndependentMentonFR49({ ...base, y: 1.01 })).toThrow(/normalized coordinate/u);
    expect(() => deriveDigeLowerBoundaryResearchCandidateFromIndependentMentonFR49({ ...base, x: Number.NaN })).toThrow(/normalized coordinate/u);
  });

  it('opens the conceptual point-from-contour relation while keeping production gates closed', () => {
    const readiness = assessDigeChinContourEvidenceBridgeReadinessFR49();
    expect(readiness.traditionalDigeChinRegionEvidenceReady).toBe(true);
    expect(readiness.lowerThreeDivisionsDigeTerminationEvidenceReady).toBe(true);
    expect(readiness.softTissueMentonContourDefinitionReady).toBe(true);
    expect(readiness.conceptualPointFromContourRelationReady).toBe(true);
    expect(readiness.neutralResearchBoundaryCandidateAlgorithmReady).toBe(true);
    expect(readiness.fr35ExactContourGeometryReady).toBe(false);
    expect(readiness.providerMappingReady).toBe(false);
    expect(readiness.traditionalDigePointEquivalenceReady).toBe(false);
    expect(readiness.fr36ProductionVerticalReferenceReady).toBe(false);
    expect(readiness.productionGeometryReady).toBe(false);
  });

  it('keeps every production/equivalence/provider authority flag fail-closed', () => {
    expect(Object.values(DIGE_CHIN_CONTOUR_EVIDENCE_BRIDGE_AUTHORITY_FR49.authorityBoundary).every((value) => value === false)).toBe(true);
    expect(() => assertDigeChinContourEvidenceBridgeReadyForProductionFR49()).toThrow(/production Three Divisions remain blocked/u);
  });
});
