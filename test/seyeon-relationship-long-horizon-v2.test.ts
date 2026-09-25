import { describe, expect, it } from 'vitest';

import {
  ROUTES,
  patternedSchedule,
  repeatEvent,
  seededRelationshipSchedule,
  simulateRelationshipCalibration,
} from './support/seyeon-relationship-calibration-harness-v2.js';

describe('Se-yeon relationship long-horizon sensitivity v2', () => {
  it('keeps ten-thousand repeated visits from becoming a deep relationship', () => {
    const state = simulateRelationshipCalibration(
      repeatEvent({
        event: 'RETURN_VISIT',
        count: 10_000,
        sourcePrefix: 'long-visit',
      }),
    );

    expect(state.totalEvents).toBe(10_000);
    expect(state.stage).toBe('S0_FIRST_MEETING');
    expect(state.trust).toBe(0);
    expect(state.distinctPositiveFamilies).toBe(1);
  });

  it('remains bounded over ten-thousand diverse events', () => {
    const state = simulateRelationshipCalibration(
      patternedSchedule({
        weeks: 1_000,
        eventsPerWeek: 10,
        route: ROUTES.mixedOrganic,
        sourcePrefix: 'long-mixed',
      }),
    );

    expect(state.totalEvents).toBe(10_000);
    expect(state.closeness).toBeGreaterThanOrEqual(0);
    expect(state.closeness).toBeLessThanOrEqual(100);
    expect(state.trust).toBeGreaterThanOrEqual(0);
    expect(state.trust).toBeLessThanOrEqual(100);
    expect(state.friction).toBeGreaterThanOrEqual(0);
    expect(state.friction).toBeLessThanOrEqual(100);
    expect(state.stage).toBe('S4_SPECIAL');
  });

  it('records score saturation as a B1 long-horizon sensitivity finding', () => {
    const oneYear = simulateRelationshipCalibration(
      patternedSchedule({
        weeks: 52,
        eventsPerWeek: 2,
        route: ROUTES.mixedOrganic,
        sourcePrefix: 'saturation',
      }),
    );

    expect(oneYear.stage).toBe('S4_SPECIAL');
    expect(oneYear.closeness).toBe(100);
    expect(oneYear.trust).toBe(100);
  });

  it('produces deterministic seeded distributions across low, medium, and high meaningful-event counts', () => {
    const summarize = (eventCount: number) => {
      const stages = new Map<string, number>();
      for (let seed = 1; seed <= 100; seed += 1) {
        const state = simulateRelationshipCalibration(
          seededRelationshipSchedule({
            seed,
            durationDays: 365,
            eventCount,
          }),
        );
        stages.set(state.stage, (stages.get(state.stage) ?? 0) + 1);
      }
      return stages;
    };

    const low = summarize(12);
    const medium = summarize(40);
    const high = summarize(100);

    expect((low.get('S4_SPECIAL') ?? 0)).toBe(0);
    expect((medium.get('S4_SPECIAL') ?? 0)).toBeGreaterThan(0);
    expect((medium.get('S4_SPECIAL') ?? 0)).toBeLessThan(100);
    expect(high.get('S4_SPECIAL')).toBe(100);
  });
});
