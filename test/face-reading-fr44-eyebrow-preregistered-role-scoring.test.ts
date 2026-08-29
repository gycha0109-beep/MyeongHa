import { describe, expect, it } from 'vitest';
import {
  EYEBROW_PREREGISTERED_ROLE_SCORING_AUTHORITY_FR44,
  assertEyebrowProviderRoleScoringProductionReadyFR44,
  buildEyebrowRoleScoringReportFR44,
  scoreEyebrowSideRoleAssignmentFR44,
  symmetricMeanNearestNeighborDistanceFR44,
  validateEyebrowPreregisteredRoleScoringAuthorityFR44,
  type EyebrowCaptureRoleScoringInputFR44V1,
  type EyebrowNormalizedPointFR44V1,
  type EyebrowRoleValidationDatasetFR43V1,
  type EyebrowSideRoleScoringInputFR44V1,
} from '../packages/face-reading/src/index.js';

const upper = Object.freeze([
  { x: 0.2, y: 0.30 },
  { x: 0.3, y: 0.29 },
  { x: 0.4, y: 0.30 },
]);
const lower = Object.freeze([
  { x: 0.2, y: 0.40 },
  { x: 0.3, y: 0.39 },
  { x: 0.4, y: 0.40 },
]);

function dataset(): EyebrowRoleValidationDatasetFR43V1 {
  const captures = [
    ['baseline', 'neutral_frontal_baseline'],
    ['repeat', 'repeat_neutral_capture'],
    ['pose', 'pose_perturbation'],
    ['expression', 'expression_perturbation'],
  ] as const;
  return {
    schemaVersion: 'fr43-dataset-v1',
    datasetRef: 'dataset.fr44.synthetic',
    subjects: [{ subjectRef: 'subject.alpha', independentSubject: true }],
    captures: captures.map(([suffix, stratum], index) => ({
      captureRef: `capture.alpha.${suffix}`,
      subjectRef: 'subject.alpha',
      stratum,
      canonicalAssetDigest: `sha256:${suffix}`,
      capturedAt: `2026-08-29T00:0${index}:00Z`,
      imageWidth: 640,
      imageHeight: 640,
      deviceRef: 'device.fixture',
      neutralInstructionApplied: stratum === 'neutral_frontal_baseline' || stratum === 'repeat_neutral_capture',
      poseLabel: stratum === 'pose_perturbation' ? 'yaw_positive' : null,
      expressionLabel: stratum === 'expression_perturbation' ? 'brow_raise' : null,
      groundTruthLockedBeforeProviderRun: true,
      providerComponentRolePrediction: null,
    })),
    groundTruthRecords: captures.map(([suffix]) => ({
      captureRef: `capture.alpha.${suffix}`,
      annotatorRef: 'annotator.alpha',
      blindedToProviderComponents: true,
      upperRimAnnotationRef: `annotation.${suffix}.upper`,
      lowerRimAnnotationRef: `annotation.${suffix}.lower`,
      medialEndpointAnnotationRef: `annotation.${suffix}.medial`,
      lateralEndpointAnnotationRef: `annotation.${suffix}.lateral`,
      providerSerializationOrderUsedAsGroundTruth: false,
    })),
    groundTruthFrozen: true,
    providerRunsExecutedAfterFreeze: true,
  };
}

function shifted(points: readonly EyebrowNormalizedPointFR44V1[], dy: number): readonly EyebrowNormalizedPointFR44V1[] {
  return points.map((point) => ({ x: point.x, y: point.y + dy }));
}

function side(
  sideLabel: 'provider_left' | 'provider_right',
  assignment: 'component_1_upper' | 'component_2_upper' = 'component_1_upper',
): EyebrowSideRoleScoringInputFR44V1 {
  const component1 = assignment === 'component_1_upper' ? shifted(upper, 0.002) : shifted(lower, -0.002);
  const component2 = assignment === 'component_1_upper' ? shifted(lower, -0.002) : shifted(upper, 0.002);
  return {
    side: sideLabel,
    providerComponents: [
      { serializationOrdinal: 1, points: component1 },
      { serializationOrdinal: 2, points: component2 },
    ],
    independentGroundTruth: {
      annotatorRef: 'annotator.alpha',
      upperRimPoints: upper,
      lowerRimPoints: lower,
      providerComponentsHiddenDuringAnnotation: true,
    },
  };
}

function scoringInputs(): EyebrowCaptureRoleScoringInputFR44V1[] {
  return dataset().captures.map((capture) => ({
    captureRef: capture.captureRef,
    left: side('provider_left', 'component_1_upper'),
    right: side('provider_right', 'component_1_upper'),
  }));
}

describe('FR-44 preregistered eyebrow component-role scoring', () => {
  it('pins an observational scoring rule with no acceptance thresholds', () => {
    expect(() => validateEyebrowPreregisteredRoleScoringAuthorityFR44()).not.toThrow();
    const authority = EYEBROW_PREREGISTERED_ROLE_SCORING_AUTHORITY_FR44;
    expect(authority.authorityState).toBe('scoring_rule_preregistered_acceptance_thresholds_unset');
    expect(authority.metricContract.imageVerticalOrderUsed).toBe(false);
    expect(authority.metricContract.providerSerializationOrderUsedAsGroundTruth).toBe(false);
    expect(Object.values(authority.acceptanceThresholds).every((value) => value === null)).toBe(true);
    expect(Object.values(authority.authorityBoundary).every((value) => value === false)).toBe(true);
  });

  it('computes symmetric mean nearest-neighbor distance deterministically', () => {
    expect(symmetricMeanNearestNeighborDistanceFR44(upper, upper)).toBe(0);
    const value = symmetricMeanNearestNeighborDistanceFR44(upper, shifted(upper, 0.01));
    expect(value).toBeCloseTo(0.01, 12);
  });

  it('selects the lower-cost assignment without granting anatomical authority', () => {
    const score = scoreEyebrowSideRoleAssignmentFR44(side('provider_left', 'component_1_upper'));
    expect(score.observedBestAssignment).toBe('component_1_upper_component_2_lower');
    expect(score.component1UpperAssignmentCost).toBeLessThan(score.component2UpperAssignmentCost);
    expect(score.absoluteAssignmentCostMargin).toBeGreaterThan(0);
    expect(score.acceptanceThresholdApplied).toBe(false);
    expect(score.anatomicalRoleMappingAuthorized).toBe(false);

    const reverse = scoreEyebrowSideRoleAssignmentFR44(side('provider_right', 'component_2_upper'));
    expect(reverse.observedBestAssignment).toBe('component_2_upper_component_1_lower');
  });

  it('reports exact ties as ambiguous instead of inventing an epsilon', () => {
    const identical = Object.freeze([
      { x: 0.2, y: 0.35 },
      { x: 0.3, y: 0.35 },
    ]);
    const score = scoreEyebrowSideRoleAssignmentFR44({
      side: 'provider_left',
      providerComponents: [
        { serializationOrdinal: 1, points: identical },
        { serializationOrdinal: 2, points: identical },
      ],
      independentGroundTruth: {
        annotatorRef: 'annotator.alpha',
        upperRimPoints: identical,
        lowerRimPoints: identical,
        providerComponentsHiddenDuringAnnotation: true,
      },
    });
    expect(score.observedBestAssignment).toBe('assignment_tie');
    expect(score.absoluteAssignmentCostMargin).toBe(0);
  });

  it('builds a stratified observational report but leaves validation and calibration unset', () => {
    const report = buildEyebrowRoleScoringReportFR44(dataset(), scoringInputs());
    expect(report.schemaVersion).toBe('fr44-report-v1');
    expect(report.summary.captureCount).toBe(4);
    expect(report.summary.scoredSideCount).toBe(8);
    expect(report.summary.assignmentCounts.component_1_upper_component_2_lower).toBe(8);
    expect(report.summary.bilateralConcordantCaptureCount).toBe(4);
    expect(report.summary.perStratumCaptureCounts).toEqual({
      neutral_frontal_baseline: 1,
      repeat_neutral_capture: 1,
      pose_perturbation: 1,
      expression_perturbation: 1,
    });
    expect(report.summary.mappingAccuracy).toBeNull();
    expect(report.summary.repeatabilityError).toBeNull();
    expect(report.summary.poseError).toBeNull();
    expect(report.summary.expressionError).toBeNull();
    expect(report.summary.calibrationThresholdsDefined).toBe(false);
    expect(report.summary.providerComponentRoleMappingValidated).toBe(false);
    expect(report.researchCandidateAdmitted).toBe(false);
    expect(report.productionGeometryAuthorized).toBe(false);
    expect(report.captureScores.every((capture) => capture.mappingPassFailDecision === null)).toBe(true);
  });

  it('rejects capture mismatch, provider-visible annotation, and non-normalized coordinates', () => {
    const inputs = scoringInputs();
    expect(() => buildEyebrowRoleScoringReportFR44(dataset(), inputs.slice(1))).toThrow(/exactly one scoring input/u);

    const contaminated = side('provider_left');
    expect(() => scoreEyebrowSideRoleAssignmentFR44({
      ...contaminated,
      independentGroundTruth: {
        ...contaminated.independentGroundTruth,
        providerComponentsHiddenDuringAnnotation: false as true,
      },
    })).toThrow(/must remain blinded/u);

    const invalid = side('provider_left');
    expect(() => scoreEyebrowSideRoleAssignmentFR44({
      ...invalid,
      providerComponents: [
        { serializationOrdinal: 1, points: [{ x: 1.2, y: 0.3 }, { x: 0.2, y: 0.3 }] },
        invalid.providerComponents[1],
      ],
    })).toThrow(/finite normalized image coordinates/u);
  });

  it('refuses production readiness from scoring-rule preregistration alone', () => {
    expect(() => assertEyebrowProviderRoleScoringProductionReadyFR44()).toThrow(/reviewed calibration thresholds and validation evidence are still absent/u);
  });
});
