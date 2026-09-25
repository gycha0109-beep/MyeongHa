import { describe, expect, it } from 'vitest';

import {
  CANDIDATE_B1_POLICY,
  CANDIDATE_B1_ROLLING_WINDOW_SHADOW,
  patternedSchedule,
  repeatEvent,
  simulateRelationshipCalibration,
} from './support/seyeon-relationship-calibration-harness-v2.js';

describe('Se-yeon relationship anti-farming sensitivity v2', () => {
  it('suppresses exact retries before score or milestone credit', () => {
    const retries = Array.from({ length: 1_000 }, () => ({
      day: 1,
      event: 'PROMISE_KEPT' as const,
      sourceKey: 'same-logical-event',
    }));

    const state = simulateRelationshipCalibration(retries);

    expect(state.creditedEvents).toBe(1);
    expect(state.duplicateEvents).toBe(999);
    expect(state.milestoneCount).toBe(1);
    expect(state.closeness).toBe(4);
    expect(state.trust).toBe(5);
  });

  it('does not allow visit spam or promise-made spam to reach a deep stage', () => {
    const visits = simulateRelationshipCalibration(
      repeatEvent({ event: 'RETURN_VISIT', count: 1_000 }),
    );
    const promises = simulateRelationshipCalibration(
      repeatEvent({ event: 'PROMISE_MADE', count: 1_000 }),
    );

    expect(visits.stage).toBe('S0_FIRST_MEETING');
    expect(visits.trust).toBe(0);
    expect(promises.stage).toBe('S0_FIRST_MEETING');
    expect(promises.distinctPositiveFamilies).toBe(1);
  });

  it('exposes the fixed-bucket boundary credit amplification and shows the rolling-window shadow blocks it', () => {
    const boundaryBurst = [
      { day: 7, event: 'PROMISE_KEPT' as const, sourceKey: 'b-1' },
      { day: 7, event: 'PROMISE_KEPT' as const, sourceKey: 'b-2' },
      { day: 8, event: 'PROMISE_KEPT' as const, sourceKey: 'b-3' },
      { day: 8, event: 'PROMISE_KEPT' as const, sourceKey: 'b-4' },
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
    expect(fixed.trust).toBeGreaterThan(rolling.trust);
    expect(fixed.milestoneCount).toBe(4);
    expect(rolling.milestoneCount).toBe(2);
  });

  it('keeps normal weekly spacing equivalent between fixed and rolling windows', () => {
    const normal = repeatEvent({
      event: 'PROMISE_KEPT',
      count: 12,
      startDay: 1,
      dayStep: 8,
      sourcePrefix: 'normal',
    });

    const fixed = simulateRelationshipCalibration(normal, CANDIDATE_B1_POLICY);
    const rolling = simulateRelationshipCalibration(
      normal,
      CANDIDATE_B1_ROLLING_WINDOW_SHADOW,
    );

    expect(rolling.closeness).toBe(fixed.closeness);
    expect(rolling.trust).toBe(fixed.trust);
    expect(rolling.milestoneCount).toBe(fixed.milestoneCount);
  });

  it('shows conflict-repair cycling is not a monotonic trust farming strategy', () => {
    const cycles = Array.from({ length: 50 }, (_, index) => [
      {
        day: index * 7 + 1,
        event: 'CONFLICT_EVENT' as const,
        sourceKey: `conflict-${index}`,
      },
      {
        day: index * 7 + 3,
        event: 'RECONCILIATION_EVENT' as const,
        sourceKey: `repair-${index}`,
      },
    ]).flat();

    const state = simulateRelationshipCalibration(cycles);

    expect(state.stage).toBe('S0_FIRST_MEETING');
    expect(state.trust).toBeLessThan(10);
    expect(state.friction).toBeGreaterThanOrEqual(90);
    expect(state.milestoneCount).toBe(50);
  });

  it('records that repair can become the fifth evidence family and unlock S4 from an otherwise four-family route', () => {
    const fourFamilyRoute = [
      'PROMISE_KEPT',
      'USER_REMEMBERED_SEYEON_DETAIL',
      'SEYEON_ACCEPTED_HELP',
      'COMPLETED_READING',
    ] as const;
    const established = patternedSchedule({
      weeks: 20,
      eventsPerWeek: 2,
      route: fourFamilyRoute,
      sourcePrefix: 'four-family',
    });
    const before = simulateRelationshipCalibration(established);
    const after = simulateRelationshipCalibration([
      ...established,
      {
        day: 141,
        event: 'CONFLICT_EVENT',
        sourceKey: 'unlock-conflict',
      },
      {
        day: 143,
        event: 'RECONCILIATION_EVENT',
        sourceKey: 'unlock-repair',
      },
    ]);

    expect(before.stage).toBe('S3_OPENED');
    expect(before.distinctPositiveFamilies).toBe(4);
    expect(after.distinctPositiveFamilies).toBe(5);
    expect(after.stage).toBe('S4_SPECIAL');
  });
});