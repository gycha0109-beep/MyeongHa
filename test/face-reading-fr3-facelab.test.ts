import { describe, expect, it } from 'vitest';
import {
  FACELAB_COMPATIBILITY_REPORT_V0,
  FACELAB_FR3_CAPABILITY_REQUIREMENTS_V0,
  assessFaceLabFr3Readiness,
  type FaceLabFr3CapabilityKey,
} from '../packages/face-reading/src/index.js';

describe('FR-3 FaceLab readiness', () => {
  it('remains blocked against the current evaluation-only FaceLab contract', () => {
    const result = assessFaceLabFr3Readiness();

    expect(result.ready).toBe(false);
    expect(result.compatibilityState).toBe('evaluation_contract_only');
    expect(result.missingCapabilities).toHaveLength(FACELAB_FR3_CAPABILITY_REQUIREMENTS_V0.length);
  });

  it('does not become ready merely because geometry capability names are supplied', () => {
    const capabilities = FACELAB_FR3_CAPABILITY_REQUIREMENTS_V0.map(
      (requirement) => requirement.capabilityKey,
    );
    const result = assessFaceLabFr3Readiness({
      availableCapabilities: capabilities,
      compatibilityReport: FACELAB_COMPATIBILITY_REPORT_V0,
    });

    expect(result.ready).toBe(false);
    expect(result.missingCapabilities).toEqual([]);
    expect(result.blockers).toContain('FaceLab compatibility state=evaluation_contract_only');
  });

  it('becomes ready only with a production-neutral contract and every FR-3 capability', () => {
    const capabilities: readonly FaceLabFr3CapabilityKey[] = FACELAB_FR3_CAPABILITY_REQUIREMENTS_V0.map(
      (requirement) => requirement.capabilityKey,
    );
    const result = assessFaceLabFr3Readiness({
      availableCapabilities: capabilities,
      compatibilityReport: {
        ...FACELAB_COMPATIBILITY_REPORT_V0,
        state: 'production_neutral_contract_available',
        missingProductionCapabilities: [],
      },
    });

    expect(result).toMatchObject({
      ready: true,
      compatibilityState: 'production_neutral_contract_available',
      missingCapabilities: [],
      blockers: [],
    });
  });

  it('reports the exact missing capability instead of accepting partial provider coverage', () => {
    const capabilities = FACELAB_FR3_CAPABILITY_REQUIREMENTS_V0
      .map((requirement) => requirement.capabilityKey)
      .filter((capability) => capability !== 'nose_tip_contour');
    const result = assessFaceLabFr3Readiness({
      availableCapabilities: capabilities,
      compatibilityReport: {
        ...FACELAB_COMPATIBILITY_REPORT_V0,
        state: 'production_neutral_contract_available',
        missingProductionCapabilities: [],
      },
    });

    expect(result.ready).toBe(false);
    expect(result.missingCapabilities).toEqual(['nose_tip_contour']);
  });
});
