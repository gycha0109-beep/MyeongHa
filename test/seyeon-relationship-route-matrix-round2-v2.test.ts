import { describe, expect, it } from 'vitest';

import {
  CANDIDATE_B1_POLICY,
  CANDIDATE_B2_COMBINED_SHADOW,
  ROUTES,
  patternedSchedule,
  simulateRelationshipCalibration,
  spacedSchedule,
} from './support/seyeon-relationship-calibration-harness-v2.js';

describe('Se-yeon relationship route matrix round two v2', () => {
  it('keeps visit-only interaction shallow under the combined B2 shadow', () => {
    const state = simulateRelationshipCalibration(
      patternedSchedule({
        weeks: 52,
        eventsPerWeek: 5,
        route: ROUTES.shallow,
      }),
      CANDIDATE_B2_COMBINED_SHADOW,
    );

    expect(state.stage).toBe('S0_FIRST_MEETING');
    expect(state.trust).toBe(0);
  });

  it('opens slow deep paths for sustained shared activity, reliability, reciprocity, care, and disclosure routes', () => {
    for (const route of [
      ROUTES.sharedActivity,
      ROUTES.reliability,
      ROUTES.reciprocity,
      ROUTES.care,
      ROUTES.disclosureHeavy,
    ]) {
      const events = patternedSchedule({
        weeks: 40,
        eventsPerWeek: 2,
        route,
      });
      const b1 = simulateRelationshipCalibration(events, CANDIDATE_B1_POLICY);
      const b2 = simulateRelationshipCalibration(
        events,
        CANDIDATE_B2_COMBINED_SHADOW,
      );

      expect(b1.stage).not.toBe('S4_SPECIAL');
      expect(b2.stage).toBe('S4_SPECIAL');
    }
  });

  it('does not let a narrow route reach S4 before the forty-positive-week alternate horizon', () => {
    for (const route of [
      ROUTES.reliability,
      ROUTES.reciprocity,
      ROUTES.care,
      ROUTES.disclosureHeavy,
    ]) {
      const state = simulateRelationshipCalibration(
        patternedSchedule({
          weeks: 39,
          eventsPerWeek: 5,
          route,
        }),
        CANDIDATE_B2_COMBINED_SHADOW,
      );

      expect(state.stage).not.toBe('S4_SPECIAL');
    }
  });

  it('keeps monthly and twice-monthly interaction below S4 after one year under B2', () => {
    for (const eventCount of [12, 24]) {
      const state = simulateRelationshipCalibration(
        spacedSchedule({
          durationDays: 365,
          eventCount,
          route: ROUTES.reliability,
        }),
        CANDIDATE_B2_COMBINED_SHADOW,
      );

      expect(state.stage).not.toBe('S4_SPECIAL');
    }
  });

  it('keeps the mixed route fast path near the prior B1 calibration instead of slowing every relationship to forty weeks', () => {
    const before = simulateRelationshipCalibration(
      patternedSchedule({ weeks: 17, eventsPerWeek: 2 }),
      CANDIDATE_B2_COMBINED_SHADOW,
    );
    const after = simulateRelationshipCalibration(
      patternedSchedule({ weeks: 20, eventsPerWeek: 2 }),
      CANDIDATE_B2_COMBINED_SHADOW,
    );

    expect(before.stage).not.toBe('S4_SPECIAL');
    expect(after.stage).toBe('S4_SPECIAL');
  });
});
