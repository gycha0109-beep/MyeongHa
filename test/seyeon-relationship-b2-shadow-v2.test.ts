import { describe, expect, it } from 'vitest';

import {
  CANDIDATE_B1_POLICY,
  CANDIDATE_B1_ROLLING_WINDOW_SHADOW,
  CANDIDATE_B2_COMBINED_SHADOW,
  CANDIDATE_B2_ROUTE_SHADOW,
  ROUTES,
  patternedSchedule,
  simulateRelationshipCalibration,
} from './support/seyeon-relationship-calibration-harness-v2.js';

describe('Se-yeon relationship B1 vs B2 shadow comparison v2', () => {
  it('keeps the mixed organic pacing target unchanged in the route shadow', () => {
    const before = patternedSchedule({ weeks: 17, eventsPerWeek: 2 });
    const after = patternedSchedule({ weeks: 20, eventsPerWeek: 2 });

    expect(
      simulateRelationshipCalibration(before, CANDIDATE_B1_POLICY).stage,
    ).not.toBe('S4_SPECIAL');
    expect(
      simulateRelationshipCalibration(before, CANDIDATE_B2_ROUTE_SHADOW).stage,
    ).not.toBe('S4_SPECIAL');
    expect(
      simulateRelationshipCalibration(after, CANDIDATE_B1_POLICY).stage,
    ).toBe('S4_SPECIAL');
    expect(
      simulateRelationshipCalibration(after, CANDIDATE_B2_ROUTE_SHADOW).stage,
    ).toBe('S4_SPECIAL');
  });

  it('opens a slow sustained path for narrow meaningful routes without opening visit-only farming', () => {
    for (const route of [
      ROUTES.sharedActivity,
      ROUTES.reliability,
      ROUTES.reciprocity,
      ROUTES.disclosureHeavy,
    ]) {
      const events = patternedSchedule({
        weeks: 52,
        eventsPerWeek: 2,
        route,
      });
      expect(
        simulateRelationshipCalibration(events, CANDIDATE_B1_POLICY).stage,
      ).not.toBe('S4_SPECIAL');
      expect(
        simulateRelationshipCalibration(events, CANDIDATE_B2_ROUTE_SHADOW)
          .stage,
      ).toBe('S4_SPECIAL');
    }

    const visits = patternedSchedule({
      weeks: 52,
      eventsPerWeek: 2,
      route: ROUTES.shallow,
    });
    expect(
      simulateRelationshipCalibration(visits, CANDIDATE_B2_ROUTE_SHADOW).stage,
    ).toBe('S0_FIRST_MEETING');
  });

  it('requires forty positive weeks before a narrow route can use the alternate S4 path', () => {
    const before = simulateRelationshipCalibration(
      patternedSchedule({
        weeks: 39,
        eventsPerWeek: 2,
        route: ROUTES.reliability,
      }),
      CANDIDATE_B2_ROUTE_SHADOW,
    );
    const after = simulateRelationshipCalibration(
      patternedSchedule({
        weeks: 40,
        eventsPerWeek: 2,
        route: ROUTES.reliability,
      }),
      CANDIDATE_B2_ROUTE_SHADOW,
    );

    expect(before.stage).not.toBe('S4_SPECIAL');
    expect(after.stage).toBe('S4_SPECIAL');
  });

  it('keeps rolling-window anti-farming isolated from route qualification', () => {
    const boundaryBurst = [
      { day: 7, event: 'PROMISE_KEPT' as const, sourceKey: 'b2-1' },
      { day: 7, event: 'PROMISE_KEPT' as const, sourceKey: 'b2-2' },
      { day: 8, event: 'PROMISE_KEPT' as const, sourceKey: 'b2-3' },
      { day: 8, event: 'PROMISE_KEPT' as const, sourceKey: 'b2-4' },
    ];

    const fixedB1 = simulateRelationshipCalibration(
      boundaryBurst,
      CANDIDATE_B1_POLICY,
    );
    const rollingOnly = simulateRelationshipCalibration(
      boundaryBurst,
      CANDIDATE_B1_ROLLING_WINDOW_SHADOW,
    );
    const combined = simulateRelationshipCalibration(
      boundaryBurst,
      CANDIDATE_B2_COMBINED_SHADOW,
    );

    expect(fixedB1.creditedEvents).toBe(4);
    expect(rollingOnly.creditedEvents).toBe(2);
    expect(combined.creditedEvents).toBe(2);
  });

  it('does not pretend B2 resolves the separate stage-regression authority gap', () => {
    const established = patternedSchedule({
      weeks: 20,
      eventsPerWeek: 2,
      sourcePrefix: 'b2-conflict',
    });
    const state = simulateRelationshipCalibration(
      [
        ...established,
        {
          day: 141,
          event: 'SPECIALNESS_INVALIDATED',
          sourceKey: 'b2-specialness-invalidated',
        },
      ],
      CANDIDATE_B2_COMBINED_SHADOW,
    );

    expect(state.conflictOpen).toBe(true);
    expect(state.stage).toBe('S2_REGULAR');
  });
});
