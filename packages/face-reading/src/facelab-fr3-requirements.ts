import {
  FACELAB_COMPATIBILITY_REPORT_V0,
  type FaceLabCompatibilityReport,
} from './facelab-compat.js';

export type FaceLabFr3CapabilityKey =
  | 'neutral_pose_quality'
  | 'ear_outline_visibility'
  | 'ear_to_brow_relation'
  | 'brow_endpoints_and_extent'
  | 'nose_bridge_centerline'
  | 'nose_tip_contour'
  | 'neutral_mouth_geometry';

export interface FaceLabFr3CapabilityRequirement {
  readonly capabilityKey: FaceLabFr3CapabilityKey;
  readonly requiredFor: readonly string[];
  readonly outputClass: 'source_neutral_geometry' | 'source_neutral_quality';
  readonly forbiddenOutputs: readonly string[];
}

export interface FaceLabFr3ReadinessResult {
  readonly ready: boolean;
  readonly compatibilityState: FaceLabCompatibilityReport['state'];
  readonly missingCapabilities: readonly FaceLabFr3CapabilityKey[];
  readonly blockers: readonly string[];
}

export const FACELAB_FR3_CAPABILITY_REQUIREMENTS_V0: readonly FaceLabFr3CapabilityRequirement[] = [
  {
    capabilityKey: 'neutral_pose_quality',
    requiredFor: ['all FR-3 static observations'],
    outputClass: 'source_neutral_quality',
    forbiddenOutputs: ['physiognomy label', 'fortune claim', 'beauty score'],
  },
  {
    capabilityKey: 'ear_outline_visibility',
    requiredFor: ['criterion.listening.outline_complete'],
    outputClass: 'source_neutral_geometry',
    forbiddenOutputs: ['採聽官成', 'ear fortune label'],
  },
  {
    capabilityKey: 'ear_to_brow_relation',
    requiredFor: ['criterion.listening.high_relative_to_brow'],
    outputClass: 'source_neutral_geometry',
    forbiddenOutputs: ['採聽官成', 'youth fortune label'],
  },
  {
    capabilityKey: 'brow_endpoints_and_extent',
    requiredFor: [
      'criterion.longevity.broad_long',
      'criterion.longevity.extends_to_temple',
      'criterion.longevity.high_forehead_position',
    ],
    outputClass: 'source_neutral_geometry',
    forbiddenOutputs: ['保壽官成', 'lifespan claim'],
  },
  {
    capabilityKey: 'nose_bridge_centerline',
    requiredFor: ['criterion.discernment.bridge_straight'],
    outputClass: 'source_neutral_geometry',
    forbiddenOutputs: ['審辨官成', 'career claim', 'wealth claim'],
  },
  {
    capabilityKey: 'nose_tip_contour',
    requiredFor: ['criterion.discernment.tip_round_full'],
    outputClass: 'source_neutral_geometry',
    forbiddenOutputs: ['審辨官成', 'wealth claim'],
  },
  {
    capabilityKey: 'neutral_mouth_geometry',
    requiredFor: ['criterion.intake.square_broad', 'criterion.intake.lips_substantial'],
    outputClass: 'source_neutral_geometry',
    forbiddenOutputs: ['出納官成', 'personality claim'],
  },
];

export function assessFaceLabFr3Readiness(input?: {
  readonly compatibilityReport?: FaceLabCompatibilityReport;
  readonly availableCapabilities?: readonly FaceLabFr3CapabilityKey[];
}): FaceLabFr3ReadinessResult {
  const compatibilityReport = input?.compatibilityReport ?? FACELAB_COMPATIBILITY_REPORT_V0;
  const available = new Set(input?.availableCapabilities ?? []);
  const missingCapabilities = FACELAB_FR3_CAPABILITY_REQUIREMENTS_V0
    .map((requirement) => requirement.capabilityKey)
    .filter((capabilityKey) => !available.has(capabilityKey));

  const blockers: string[] = [];
  if (compatibilityReport.state !== 'production_neutral_contract_available') {
    blockers.push(`FaceLab compatibility state=${compatibilityReport.state}`);
  }
  if (missingCapabilities.length > 0) {
    blockers.push(`missing FR-3 capabilities: ${missingCapabilities.join(', ')}`);
  }

  return {
    ready: blockers.length === 0,
    compatibilityState: compatibilityReport.state,
    missingCapabilities,
    blockers,
  };
}
