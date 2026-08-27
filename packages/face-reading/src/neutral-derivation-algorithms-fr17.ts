import type { NeutralObservationGeometryV1 } from './neutral-observation-schema-fr15.js';
import type { ProviderTopologyClassV1 } from './provider-adapter-evidence-fr16.js';
import { FaceAuthorityValidationError } from './validation.js';

export interface NeutralDerivationAlgorithmDefinitionV1 {
  readonly algorithmRef: string;
  readonly version: string;
  readonly inputTopologyClasses: readonly ProviderTopologyClassV1[];
  readonly outputGeometryKind: NeutralObservationGeometryV1['kind'];
  readonly deterministic: true;
  readonly reviewState: 'research_candidate' | 'reviewed';
  readonly transformationSpec: string;
  readonly evidenceRefs: readonly string[];
  readonly calibrationRefs: readonly string[];
}

/**
 * FR-17 v0.1 intentionally authorizes no neutral derivation algorithm.
 *
 * Provider topology existence is not sufficient authority to invent:
 * - nose polygons,
 * - single brow curves from disconnected chains,
 * - brow-midline points.
 *
 * A future reviewed algorithm must be added here in a new registry version,
 * with deterministic transformation specification, evidence, and calibration.
 */
export const FR17_NEUTRAL_DERIVATION_ALGORITHMS: readonly NeutralDerivationAlgorithmDefinitionV1[] = Object.freeze([]);

export function getNeutralDerivationAlgorithmFR17(
  algorithmRef: string,
): NeutralDerivationAlgorithmDefinitionV1 | null {
  return FR17_NEUTRAL_DERIVATION_ALGORITHMS.find((entry) => entry.algorithmRef === algorithmRef) ?? null;
}

export function assertNeutralDerivationAlgorithmRefFR17(
  algorithmRef: string,
  expected: {
    readonly inputTopologyClasses: readonly ProviderTopologyClassV1[];
    readonly outputGeometryKind: NeutralObservationGeometryV1['kind'];
    readonly minimumReviewState: 'research_candidate' | 'reviewed';
  },
): NeutralDerivationAlgorithmDefinitionV1 {
  const algorithm = getNeutralDerivationAlgorithmFR17(algorithmRef);
  if (algorithm === null) {
    throw new FaceAuthorityValidationError(`FR-17 unresolved neutral derivation algorithmRef: ${algorithmRef}`);
  }
  if (algorithm.deterministic !== true) {
    throw new FaceAuthorityValidationError(`FR-17 derivation algorithm must be deterministic: ${algorithmRef}`);
  }
  if (algorithm.outputGeometryKind !== expected.outputGeometryKind) {
    throw new FaceAuthorityValidationError(`FR-17 derivation algorithm output geometry mismatch: ${algorithmRef}`);
  }
  const expectedClasses = [...expected.inputTopologyClasses].sort().join('|');
  const actualClasses = [...algorithm.inputTopologyClasses].sort().join('|');
  if (expectedClasses !== actualClasses) {
    throw new FaceAuthorityValidationError(`FR-17 derivation algorithm input topology mismatch: ${algorithmRef}`);
  }
  if (expected.minimumReviewState === 'reviewed' && algorithm.reviewState !== 'reviewed') {
    throw new FaceAuthorityValidationError(`FR-17 derivation algorithm is not reviewed: ${algorithmRef}`);
  }
  if (algorithm.evidenceRefs.length === 0 || algorithm.calibrationRefs.length === 0) {
    throw new FaceAuthorityValidationError(`FR-17 derivation algorithm lacks evidence/calibration authority: ${algorithmRef}`);
  }
  return algorithm;
}
