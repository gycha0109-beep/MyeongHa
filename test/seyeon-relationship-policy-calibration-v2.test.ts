import { describe, expect, it } from 'vitest';

import {
  CALIBRATION_POLICY_STATUS,
  patternedSchedule,
  repeatEvent,
  simulateRelationshipCalibration,
} from './support/seyeon-relationship-calibration-harness-v2.js';

describe('Se-yeon relationship policy calibration candidate B1 v2', () => {
  it('is explicitly test-only evidence and not production relationship authority', () => {
    expect(CALIBRATION_POLICY_STATUS).toBe(
      'CALIBRATION_ONLY_NOT_PRODUCTION_AUTHORITY',
    );
  });

  it('keeps ordinary pacing near the candidate-B basis without requiring self-disclosure', () => {
    const before = simulateRelationshipCalibration(
      patternedSchedule({ weeks: 17, eventsPerWeek: 2 }),
    );
    const after = simulateRelationshipCalibration(
      patternedSchedule({ weeks: 20, eventsPerWeek: 2 }),
    );

    expect(before.stage).not.toBe('S4_SPECIAL');
    expect(after.stage).toBe('S4_SPECIAL');

    const route = patternedSchedule({ weeks: 20, eventsPerWeek: 2 });
    expect(
      route.some(
        (event) =>
          event.event === 'SHARED_PERSONAL_FACT' ||
          event.event === 'SEYEON_SELF_DISCLOSED',
      ),
    ).toBe(false);
  });

  it('lets a high-frequency but diverse route reach S4 around ten weeks, not in the first month', () => {
    const firstMonth = simulateRelationshipCalibration(
      patternedSchedule({ weeks: 4, eventsPerWeek: 4 }),
    );
    const aroundTenWeeks = simulateRelationshipCalibration(
      patternedSchedule({ weeks: 10, eventsPerWeek: 4 }),
    );

    expect(firstMonth.stage).not.toBe('S4_SPECIAL');
    expect(aroundTenWeeks.stage).toBe('S4_SPECIAL');
  });

  it('does not let five meaningful events per week compress S4 into eight weeks', () => {
    const eightWeeks = simulateRelationshipCalibration(
      patternedSchedule({ weeks: 8, eventsPerWeek: 5 }),
    );
    const tenWeeks = simulateRelationshipCalibration(
      patternedSchedule({ weeks: 10, eventsPerWeek: 5 }),
    );

    expect(eightWeeks.stage).not.toBe('S4_SPECIAL');
    expect(eightWeeks.distinctPositiveWeeks).toBe(8);
    expect(tenWeeks.distinctPositiveWeeks).toBe(10);
    expect(tenWeeks.stage).toBe('S4_SPECIAL');
  });

  it('keeps a low-frequency route below S4 after six months', () => {
    const lowFrequency = simulateRelationshipCalibration(
      patternedSchedule({
        weeks: 26,
        eventsPerWeek: 1,
        everyNthWeek: 2,
      }),
    );

    expect(lowFrequency.stage).not.toBe('S4_SPECIAL');
  });

  it('prevents one repeated event family from farming relationship stage or trust', () => {
    const state = simulateRelationshipCalibration(
      repeatEvent({ event: 'RETURN_VISIT', count: 100 }),
    );

    expect(state.stage).toBe('S0_FIRST_MEETING');
    expect(state.trust).toBe(0);
    expect(state.distinctPositiveFamilies).toBe(1);
    expect(state.closeness).toBeLessThan(60);
  });

  it('does not let unresolved conflict qualify for S3/S4 and requires explicit repair', () => {
    const established = patternedSchedule({ weeks: 20, eventsPerWeek: 2 });
    const conflictDay = 141;
    const conflicted = simulateRelationshipCalibration([
      ...established,
      {
        day: conflictDay,
        event: 'SPECIALNESS_INVALIDATED',
        sourceKey: 'conflict',
      },
    ]);

    expect(conflicted.conflictOpen).toBe(true);
    expect(conflicted.stage).not.toBe('S4_SPECIAL');
    expect(conflicted.stage).not.toBe('S3_OPENED');

    const repaired = simulateRelationshipCalibration([
      ...established,
      {
        day: conflictDay,
        event: 'SPECIALNESS_INVALIDATED',
        sourceKey: 'conflict',
      },
      {
        day: conflictDay + 7,
        event: 'RECONCILIATION_EVENT',
        sourceKey: 'repair',
      },
    ]);

    expect(repaired.conflictOpen).toBe(false);
    expect(repaired.stage).toBe('S4_SPECIAL');
  });

  it('does not degrade scores merely because the user is absent and later returns', () => {
    const beforeAbsence = simulateRelationshipCalibration(
      patternedSchedule({ weeks: 8, eventsPerWeek: 2 }),
    );
    const afterReturn = simulateRelationshipCalibration([
      ...patternedSchedule({ weeks: 8, eventsPerWeek: 2 }),
      {
        day: 180,
        event: 'RETURNED_AFTER_ABSENCE',
        sourceKey: 'return-after-absence',
      },
    ]);

    expect(afterReturn.closeness).toBeGreaterThanOrEqual(
      beforeAbsence.closeness,
    );
    expect(afterReturn.trust).toBeGreaterThanOrEqual(beforeAbsence.trust);
    expect(afterReturn.friction).toBe(beforeAbsence.friction);
  });

  it('dedupes the same source identity before any score or milestone credit', () => {
    const repeated = Array.from({ length: 20 }, () => ({
      day: 1,
      event: 'PROMISE_KEPT' as const,
      sourceKey: 'same-logical-event',
    }));

    const state = simulateRelationshipCalibration(repeated);

    expect(state.closeness).toBe(4);
    expect(state.trust).toBe(5);
    expect(state.milestoneCount).toBe(1);
    expect(state.duplicateEvents).toBe(19);
  });
});
