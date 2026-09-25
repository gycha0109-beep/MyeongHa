import { describe, expect, it } from 'vitest';

import {
  ROUTES,
  patternedSchedule,
  simulateRelationshipCalibration,
  spacedSchedule,
} from './support/seyeon-relationship-calibration-harness-v2.js';

describe('Se-yeon relationship frequency and route sensitivity v2', () => {
  it('keeps mixed-route progression ordered by evidence density without allowing first-month S4', () => {
    const frequencies = [1, 2, 3, 4, 5, 7, 10] as const;
    const firstMonth = frequencies.map((eventsPerWeek) =>
      simulateRelationshipCalibration(
        patternedSchedule({ weeks: 4, eventsPerWeek }),
      ),
    );

    expect(firstMonth.every((state) => state.stage !== 'S4_SPECIAL')).toBe(true);

    const onePerWeek = simulateRelationshipCalibration(
      patternedSchedule({ weeks: 52, eventsPerWeek: 1 }),
    );
    const twoPerWeek = simulateRelationshipCalibration(
      patternedSchedule({ weeks: 20, eventsPerWeek: 2 }),
    );
    const fivePerWeekAtEightWeeks = simulateRelationshipCalibration(
      patternedSchedule({ weeks: 8, eventsPerWeek: 5 }),
    );
    const fivePerWeekAtTenWeeks = simulateRelationshipCalibration(
      patternedSchedule({ weeks: 10, eventsPerWeek: 5 }),
    );

    expect(onePerWeek.stage).toBe('S4_SPECIAL');
    expect(twoPerWeek.stage).toBe('S4_SPECIAL');
    expect(fivePerWeekAtEightWeeks.stage).not.toBe('S4_SPECIAL');
    expect(fivePerWeekAtTenWeeks.stage).toBe('S4_SPECIAL');
  });

  it('keeps monthly and twice-monthly meaningful interaction below S4 after one year', () => {
    const monthly = simulateRelationshipCalibration(
      spacedSchedule({
        durationDays: 365,
        eventCount: 12,
      }),
    );
    const twiceMonthly = simulateRelationshipCalibration(
      spacedSchedule({
        durationDays: 365,
        eventCount: 24,
      }),
    );

    expect(monthly.stage).not.toBe('S4_SPECIAL');
    expect(twiceMonthly.stage).not.toBe('S4_SPECIAL');
  });

  it('shows the current B1 evidence-family gate creates route dead-ends for narrow but meaningful routes', () => {
    const sharedActivity = simulateRelationshipCalibration(
      patternedSchedule({
        weeks: 52,
        eventsPerWeek: 2,
        route: ROUTES.sharedActivity,
      }),
    );
    const reliability = simulateRelationshipCalibration(
      patternedSchedule({
        weeks: 52,
        eventsPerWeek: 2,
        route: ROUTES.reliability,
      }),
    );
    const reciprocity = simulateRelationshipCalibration(
      patternedSchedule({
        weeks: 52,
        eventsPerWeek: 2,
        route: ROUTES.reciprocity,
      }),
    );
    const disclosureHeavy = simulateRelationshipCalibration(
      patternedSchedule({
        weeks: 52,
        eventsPerWeek: 2,
        route: ROUTES.disclosureHeavy,
      }),
    );
    const mixedOrganic = simulateRelationshipCalibration(
      patternedSchedule({
        weeks: 52,
        eventsPerWeek: 2,
        route: ROUTES.mixedOrganic,
      }),
    );

    expect(sharedActivity.stage).toBe('S1_FAMILIAR');
    expect(reliability.stage).toBe('S1_FAMILIAR');
    expect(reciprocity.stage).toBe('S2_REGULAR');
    expect(disclosureHeavy.stage).toBe('S2_REGULAR');
    expect(mixedOrganic.stage).toBe('S4_SPECIAL');

    expect(sharedActivity.distinctPositiveFamilies).toBe(2);
    expect(reliability.distinctPositiveFamilies).toBe(2);
    expect(reciprocity.distinctPositiveFamilies).toBe(3);
    expect(disclosureHeavy.distinctPositiveFamilies).toBe(3);
    expect(mixedOrganic.distinctPositiveFamilies).toBeGreaterThanOrEqual(5);
  });

  it('does not make disclosure-heavy interaction uniquely sufficient for S4', () => {
    const disclosureHeavy = simulateRelationshipCalibration(
      patternedSchedule({
        weeks: 52,
        eventsPerWeek: 4,
        route: ROUTES.disclosureHeavy,
      }),
    );
    const mixedWithoutForcedDisclosure = simulateRelationshipCalibration(
      patternedSchedule({
        weeks: 20,
        eventsPerWeek: 2,
        route: ROUTES.mixedOrganic,
      }),
    );

    expect(disclosureHeavy.stage).not.toBe('S4_SPECIAL');
    expect(mixedWithoutForcedDisclosure.stage).toBe('S4_SPECIAL');
  });

  it('keeps a forty-event one-week binge below S4 even after nine empty weeks', () => {
    const binge = simulateRelationshipCalibration(
      patternedSchedule({
        weeks: 1,
        eventsPerWeek: 40,
        sourcePrefix: 'binge',
      }),
    );
    const distributed = simulateRelationshipCalibration(
      patternedSchedule({
        weeks: 10,
        eventsPerWeek: 4,
        sourcePrefix: 'distributed',
      }),
    );

    expect(binge.stage).not.toBe('S4_SPECIAL');
    expect(binge.distinctPositiveWeeks).toBe(1);
    expect(distributed.stage).toBe('S4_SPECIAL');
    expect(distributed.distinctPositiveWeeks).toBe(10);
  });
});
