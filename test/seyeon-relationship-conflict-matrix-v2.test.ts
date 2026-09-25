import { describe, expect, it } from 'vitest';

import {
  CANDIDATE_B1_POLICY,
  patternedSchedule,
  simulateRelationshipCalibration,
  withStageMode,
} from './support/seyeon-relationship-calibration-harness-v2.js';

describe('Se-yeon relationship conflict and absence sensitivity v2', () => {
  it('shows B1 recompute currently regresses an established deep stage while conflict is open', () => {
    const established = patternedSchedule({
      weeks: 20,
      eventsPerWeek: 2,
      sourcePrefix: 'established',
    });
    const before = simulateRelationshipCalibration(established);
    const afterConflict = simulateRelationshipCalibration([
      ...established,
      {
        day: 141,
        event: 'SPECIALNESS_INVALIDATED',
        sourceKey: 'specialness-invalidated',
      },
    ]);

    expect(before.stage).toBe('S4_SPECIAL');
    expect(afterConflict.conflictOpen).toBe(true);
    expect(afterConflict.stage).toBe('S2_REGULAR');
    expect(
      afterConflict.transitions.some(
        (transition) =>
          transition.from === 'S4_SPECIAL' &&
          transition.to === 'S2_REGULAR',
      ),
    ).toBe(true);
  });

  it('keeps stage history intact in the lock-progress shadow while still preserving conflict state', () => {
    const policy = withStageMode(
      CANDIDATE_B1_POLICY,
      'lock_progress_block_on_conflict',
    );
    const established = patternedSchedule({
      weeks: 20,
      eventsPerWeek: 2,
      sourcePrefix: 'lock',
    });
    const state = simulateRelationshipCalibration(
      [
        ...established,
        {
          day: 141,
          event: 'SPECIALNESS_INVALIDATED',
          sourceKey: 'lock-conflict',
        },
      ],
      policy,
    );

    expect(state.stage).toBe('S4_SPECIAL');
    expect(state.conflictOpen).toBe(true);
    expect(state.trust).toBeLessThan(100);
    expect(state.friction).toBeGreaterThan(0);
  });

  it('keeps stage history intact in the behavioral-overlay shadow while conflict changes relationship state', () => {
    const policy = withStageMode(CANDIDATE_B1_POLICY, 'behavior_overlay');
    const established = patternedSchedule({
      weeks: 20,
      eventsPerWeek: 2,
      sourcePrefix: 'overlay',
    });
    const state = simulateRelationshipCalibration(
      [
        ...established,
        {
          day: 141,
          event: 'PROMISE_BROKEN',
          sourceKey: 'overlay-conflict',
        },
      ],
      policy,
    );

    expect(state.stage).toBe('S4_SPECIAL');
    expect(state.conflictOpen).toBe(true);
    expect(state.friction).toBeGreaterThan(0);
  });

  it('requires explicit repair to clear unresolved conflict under all shadow modes', () => {
    for (const mode of [
      'recompute',
      'lock_progress_block_on_conflict',
      'behavior_overlay',
    ] as const) {
      const policy = withStageMode(CANDIDATE_B1_POLICY, mode);
      const established = patternedSchedule({
        weeks: 20,
        eventsPerWeek: 2,
        sourcePrefix: mode,
      });
      const conflicted = simulateRelationshipCalibration(
        [
          ...established,
          {
            day: 141,
            event: 'CONFLICT_EVENT',
            sourceKey: `${mode}-conflict`,
          },
        ],
        policy,
      );
      const repaired = simulateRelationshipCalibration(
        [
          ...established,
          {
            day: 141,
            event: 'CONFLICT_EVENT',
            sourceKey: `${mode}-conflict`,
          },
          {
            day: 148,
            event: 'RECONCILIATION_EVENT',
            sourceKey: `${mode}-repair`,
          },
        ],
        policy,
      );

      expect(conflicted.conflictOpen).toBe(true);
      expect(repaired.conflictOpen).toBe(false);
    }
  });

  it('does not apply relationship decay for 1, 30, 180, or 365 days of absence', () => {
    const established = patternedSchedule({
      weeks: 12,
      eventsPerWeek: 2,
      sourcePrefix: 'absence-base',
    });
    const before = simulateRelationshipCalibration(established);
    const lastDay = Math.max(...established.map((event) => event.day));

    for (const absenceDays of [1, 30, 180, 365]) {
      const after = simulateRelationshipCalibration([
        ...established,
        {
          day: lastDay + absenceDays,
          event: 'RETURNED_AFTER_ABSENCE',
          sourceKey: `return-${absenceDays}`,
        },
      ]);

      expect(after.closeness).toBeGreaterThanOrEqual(before.closeness);
      expect(after.trust).toBeGreaterThanOrEqual(before.trust);
      expect(after.friction).toBe(before.friction);
    }
  });
});
