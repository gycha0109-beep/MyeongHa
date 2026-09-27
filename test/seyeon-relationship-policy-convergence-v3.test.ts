import { describe, expect, it } from 'vitest';

import {
  CANDIDATE_B1_POLICY,
  CANDIDATE_B1_ROLLING_WINDOW_SHADOW,
  CANDIDATE_B2_COMBINED_SHADOW,
  ROUTES,
  patternedSchedule,
  simulateRelationshipCalibration,
  withStageMode,
} from './support/seyeon-relationship-calibration-harness-v2.js';
import { buildSeyeonRelationshipPolicyConvergenceReportV3 } from './support/seyeon-relationship-policy-convergence-v3.js';

describe('Se-yeon relationship policy convergence v3', () => {
  it('keeps rolling-window B2 resistant to the fixed-bucket boundary exploit', () => {
    const boundaryBurst = [
      { day: 7, event: 'PROMISE_KEPT' as const, sourceKey: 'd7-a' },
      { day: 7, event: 'PROMISE_KEPT' as const, sourceKey: 'd7-b' },
      { day: 8, event: 'PROMISE_KEPT' as const, sourceKey: 'd8-a' },
      { day: 8, event: 'PROMISE_KEPT' as const, sourceKey: 'd8-b' },
    ];

    const fixed = simulateRelationshipCalibration(
      boundaryBurst,
      CANDIDATE_B1_POLICY,
    );
    const rolling = simulateRelationshipCalibration(
      boundaryBurst,
      CANDIDATE_B1_ROLLING_WINDOW_SHADOW,
    );

    expect(fixed.creditedEvents).toBe(4);
    expect(rolling.creditedEvents).toBe(2);
    expect(rolling.suppressedEvents).toBe(2);
  });

  it('opens sustained narrow meaningful routes without opening visit-only farming', () => {
    const visitOnly = simulateRelationshipCalibration(
      patternedSchedule({
        weeks: 52,
        eventsPerWeek: 5,
        route: ROUTES.shallow,
      }),
      CANDIDATE_B2_COMBINED_SHADOW,
    );
    expect(visitOnly.stage).toBe('S0_FIRST_MEETING');

    for (const route of [
      ROUTES.sharedActivity,
      ROUTES.reliability,
      ROUTES.reciprocity,
      ROUTES.care,
      ROUTES.disclosureHeavy,
    ]) {
      const at39 = simulateRelationshipCalibration(
        patternedSchedule({ weeks: 39, eventsPerWeek: 5, route }),
        CANDIDATE_B2_COMBINED_SHADOW,
      );
      const at40 = simulateRelationshipCalibration(
        patternedSchedule({ weeks: 40, eventsPerWeek: 2, route }),
        CANDIDATE_B2_COMBINED_SHADOW,
      );

      expect(at39.stage).not.toBe('S4_SPECIAL');
      expect(at40.stage).toBe('S4_SPECIAL');
    }
  });

  it('preserves attained depth in the behavior-overlay shadow instead of rewriting history on conflict', () => {
    const established = patternedSchedule({
      weeks: 40,
      eventsPerWeek: 2,
      route: ROUTES.mixedOrganic,
    });
    const conflict = {
      day: 300,
      event: 'SPECIALNESS_INVALIDATED' as const,
      sourceKey: 'late-conflict',
    };

    const recompute = simulateRelationshipCalibration(
      [...established, conflict],
      CANDIDATE_B2_COMBINED_SHADOW,
    );
    const overlay = simulateRelationshipCalibration(
      [...established, conflict],
      withStageMode(CANDIDATE_B2_COMBINED_SHADOW, 'behavior_overlay'),
    );

    expect(recompute.stage).not.toBe('S4_SPECIAL');
    expect(overlay.stage).toBe('S4_SPECIAL');
    expect(overlay.conflictOpen).toBe(true);
  });

  it('records score saturation as an owner decision instead of silently changing the numeric model', () => {
    const longLived = simulateRelationshipCalibration(
      patternedSchedule({
        weeks: 52,
        eventsPerWeek: 2,
        route: ROUTES.mixedOrganic,
      }),
      CANDIDATE_B2_COMBINED_SHADOW,
    );

    expect(longLived.closeness).toBe(100);
    expect(longLived.trust).toBe(100);

    const report = buildSeyeonRelationshipPolicyConvergenceReportV3({
      routeDeadEndMitigated: true,
      bucketExploitMitigated: true,
      stageRegressionMitigated: true,
      repairFifthFamilyMitigated: false,
      repairMilestoneFarmingMitigated: true,
      scoreSaturationObserved: true,
    });

    expect(report.findings).toEqual({
      F01_ROUTE_DEAD_END: 'MITIGATED',
      F02_BUCKET_EXPLOIT: 'MITIGATED',
      F03_STAGE_REGRESSION: 'MITIGATED',
      F04_REPAIR_FIFTH_FAMILY: 'OWNER_DECISION_REQUIRED',
      F05_REPAIR_MILESTONE_FARMING: 'MITIGATED',
      F06_SCORE_SATURATION: 'OWNER_DECISION_REQUIRED',
    });
    expect(report.production).toEqual({
      relationshipEventAppend: false,
      relationshipStateMutation: false,
      policyApproved: false,
    });
    expect(report.src22).toEqual({
      status: 'OPEN',
      ownerDecisionRequired: true,
    });
  });
});
