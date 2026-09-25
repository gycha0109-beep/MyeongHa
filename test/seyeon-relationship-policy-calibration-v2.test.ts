import { describe, expect, it } from 'vitest';

type Stage = 'S0_FIRST_MEETING' | 'S1_FAMILIAR' | 'S2_REGULAR' | 'S3_OPENED' | 'S4_SPECIAL';

type EventKey =
  | 'RETURN_VISIT'
  | 'CHOSE_CHARACTER'
  | 'SHARED_PERSONAL_FACT'
  | 'COMPLETED_READING'
  | 'FINISHED_EPISODE'
  | 'PROMISE_MADE'
  | 'PROMISE_KEPT'
  | 'USER_REMEMBERED_SEYEON_DETAIL'
  | 'SEYEON_ACCEPTED_HELP'
  | 'SEYEON_REQUESTED_HELP'
  | 'SEYEON_SELF_DISCLOSED'
  | 'SEYEON_ADMITTED_WAITING'
  | 'CONFLICT_EVENT'
  | 'PROMISE_BROKEN'
  | 'SPECIALNESS_INVALIDATED'
  | 'RECONCILIATION_EVENT'
  | 'RETURNED_AFTER_ABSENCE';

interface CalibrationEvent {
  readonly day: number;
  readonly event: EventKey;
  readonly sourceKey: string;
}

interface CalibrationState {
  readonly closeness: number;
  readonly trust: number;
  readonly friction: number;
  readonly stage: Stage;
  readonly distinctPositiveDays: number;
  readonly distinctPositiveFamilies: number;
  readonly milestoneCount: number;
  readonly conflictOpen: boolean;
}

const POLICY_STATUS =
  'CALIBRATION_ONLY_NOT_PRODUCTION_AUTHORITY' as const;

const EVENT_RULES: Readonly<
  Record<
    EventKey,
    Readonly<{
      closeness: number;
      trust: number;
      friction: number;
      family: string;
      milestone: boolean;
      opensConflict?: boolean;
      repairsConflict?: boolean;
    }>
  >
> = Object.freeze({
  RETURN_VISIT: { closeness: 1, trust: 0, friction: 0, family: 'visit', milestone: false },
  CHOSE_CHARACTER: { closeness: 2, trust: 1, friction: 0, family: 'choice', milestone: false },
  SHARED_PERSONAL_FACT: { closeness: 2, trust: 2, friction: 0, family: 'disclosure', milestone: false },
  COMPLETED_READING: { closeness: 2, trust: 2, friction: 0, family: 'shared_activity', milestone: false },
  FINISHED_EPISODE: { closeness: 3, trust: 2, friction: 0, family: 'shared_activity', milestone: true },
  PROMISE_MADE: { closeness: 1, trust: 1, friction: 0, family: 'commitment', milestone: false },
  PROMISE_KEPT: { closeness: 4, trust: 5, friction: 0, family: 'commitment', milestone: true },
  USER_REMEMBERED_SEYEON_DETAIL: { closeness: 3, trust: 4, friction: 0, family: 'recognition', milestone: true },
  SEYEON_ACCEPTED_HELP: { closeness: 3, trust: 4, friction: 0, family: 'care', milestone: true },
  SEYEON_REQUESTED_HELP: { closeness: 3, trust: 5, friction: 0, family: 'care', milestone: true },
  SEYEON_SELF_DISCLOSED: { closeness: 2, trust: 2, friction: 0, family: 'disclosure', milestone: false },
  SEYEON_ADMITTED_WAITING: { closeness: 4, trust: 4, friction: 0, family: 'vulnerability', milestone: true },
  CONFLICT_EVENT: { closeness: 0, trust: -6, friction: 8, family: 'conflict', milestone: false, opensConflict: true },
  PROMISE_BROKEN: { closeness: 0, trust: -8, friction: 6, family: 'conflict', milestone: false, opensConflict: true },
  SPECIALNESS_INVALIDATED: { closeness: 0, trust: -10, friction: 10, family: 'conflict', milestone: false, opensConflict: true },
  RECONCILIATION_EVENT: { closeness: 3, trust: 5, friction: -6, family: 'repair', milestone: true, repairsConflict: true },
  RETURNED_AFTER_ABSENCE: { closeness: 1, trust: 1, friction: 0, family: 'return', milestone: false },
});

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function positiveSoftCap(current: number, delta: number): number {
  if (delta <= 0) return delta;
  if (current < 60) return delta;
  if (current < 80) return Math.max(1, Math.ceil(delta * 0.5));
  if (current < 100) return Math.max(1, Math.ceil(delta * 0.25));
  return 0;
}

function resolveStage(input: {
  closeness: number;
  trust: number;
  distinctPositiveDays: number;
  distinctPositiveFamilies: number;
  milestoneCount: number;
  conflictOpen: boolean;
}): Stage {
  if (
    input.closeness >= 75 &&
    input.trust >= 65 &&
    input.distinctPositiveDays >= 40 &&
    input.distinctPositiveFamilies >= 5 &&
    input.milestoneCount >= 3 &&
    !input.conflictOpen
  ) {
    return 'S4_SPECIAL';
  }
  if (
    input.closeness >= 42 &&
    input.trust >= 30 &&
    input.distinctPositiveDays >= 12 &&
    input.distinctPositiveFamilies >= 4 &&
    !input.conflictOpen
  ) {
    return 'S3_OPENED';
  }
  if (
    input.closeness >= 20 &&
    input.trust >= 12 &&
    input.distinctPositiveDays >= 5 &&
    input.distinctPositiveFamilies >= 3
  ) {
    return 'S2_REGULAR';
  }
  if (
    input.closeness >= 8 &&
    input.trust >= 4 &&
    input.distinctPositiveDays >= 2 &&
    input.distinctPositiveFamilies >= 2
  ) {
    return 'S1_FAMILIAR';
  }
  return 'S0_FIRST_MEETING';
}

function simulate(events: readonly CalibrationEvent[]): CalibrationState {
  const seenSources = new Set<string>();
  const positiveDays = new Set<number>();
  const positiveFamilies = new Set<string>();
  const weeklyFamilyCredits = new Map<string, number>();
  let closeness = 0;
  let trust = 0;
  let friction = 0;
  let milestoneCount = 0;
  let conflictOpen = false;

  for (const input of [...events].sort((a, b) => a.day - b.day)) {
    if (seenSources.has(input.sourceKey)) continue;
    seenSources.add(input.sourceKey);

    const rule = EVENT_RULES[input.event];
    const week = Math.floor((input.day - 1) / 7);
    const creditKey = `${week}:${rule.family}`;
    const familyCredits = weeklyFamilyCredits.get(creditKey) ?? 0;
    const positive = rule.closeness > 0 || rule.trust > 0;
    const eligibleForPositiveCredit = !positive || familyCredits < 2;

    if (positive && eligibleForPositiveCredit) {
      weeklyFamilyCredits.set(creditKey, familyCredits + 1);
      positiveDays.add(input.day);
      positiveFamilies.add(rule.family);
      if (rule.milestone) milestoneCount += 1;
    }

    const closenessDelta =
      positive && !eligibleForPositiveCredit
        ? 0
        : positiveSoftCap(closeness, rule.closeness);
    const trustDelta =
      positive && !eligibleForPositiveCredit
        ? 0
        : positiveSoftCap(trust, rule.trust);

    closeness = clamp(closeness + closenessDelta);
    trust = clamp(trust + trustDelta);
    friction = clamp(friction + rule.friction);

    if (rule.opensConflict) conflictOpen = true;
    if (rule.repairsConflict) conflictOpen = false;
  }

  return Object.freeze({
    closeness,
    trust,
    friction,
    stage: resolveStage({
      closeness,
      trust,
      distinctPositiveDays: positiveDays.size,
      distinctPositiveFamilies: positiveFamilies.size,
      milestoneCount,
      conflictOpen,
    }),
    distinctPositiveDays: positiveDays.size,
    distinctPositiveFamilies: positiveFamilies.size,
    milestoneCount,
    conflictOpen,
  });
}

const ROUTE_WITHOUT_FORCED_SELF_DISCLOSURE: readonly EventKey[] = [
  'RETURN_VISIT',
  'COMPLETED_READING',
  'PROMISE_MADE',
  'PROMISE_KEPT',
  'USER_REMEMBERED_SEYEON_DETAIL',
  'FINISHED_EPISODE',
  'SEYEON_ACCEPTED_HELP',
];

function patternedSchedule(input: {
  weeks: number;
  eventsPerWeek: number;
  everyNthWeek?: number;
}): CalibrationEvent[] {
  const everyNthWeek = input.everyNthWeek ?? 1;
  const result: CalibrationEvent[] = [];
  let sequence = 0;

  for (let week = 0; week < input.weeks; week += everyNthWeek) {
    for (let index = 0; index < input.eventsPerWeek; index += 1) {
      const event =
        ROUTE_WITHOUT_FORCED_SELF_DISCLOSURE[
          sequence % ROUTE_WITHOUT_FORCED_SELF_DISCLOSURE.length
        ]!;
      result.push({
        day: week * 7 + 1 + index,
        event,
        sourceKey: `source-${sequence}`,
      });
      sequence += 1;
    }
  }

  return result;
}

describe('Se-yeon relationship policy calibration candidate B v2', () => {
  it('is explicitly test-only evidence and not production relationship authority', () => {
    expect(POLICY_STATUS).toBe('CALIBRATION_ONLY_NOT_PRODUCTION_AUTHORITY');
  });

  it('keeps ordinary pacing near the previously selected candidate-B basis without requiring self-disclosure', () => {
    const before = simulate(
      patternedSchedule({ weeks: 17, eventsPerWeek: 2 }),
    );
    const after = simulate(
      patternedSchedule({ weeks: 20, eventsPerWeek: 2 }),
    );

    expect(before.stage).not.toBe('S4_SPECIAL');
    expect(after.stage).toBe('S4_SPECIAL');
    expect(
      patternedSchedule({ weeks: 20, eventsPerWeek: 2 }).some(
        (event) =>
          event.event === 'SHARED_PERSONAL_FACT' ||
          event.event === 'SEYEON_SELF_DISCLOSED',
      ),
    ).toBe(false);
  });

  it('lets a high-frequency but diverse route reach S4 around ten weeks, not in the first month', () => {
    const firstMonth = simulate(
      patternedSchedule({ weeks: 4, eventsPerWeek: 4 }),
    );
    const aroundTenWeeks = simulate(
      patternedSchedule({ weeks: 10, eventsPerWeek: 4 }),
    );

    expect(firstMonth.stage).not.toBe('S4_SPECIAL');
    expect(aroundTenWeeks.stage).toBe('S4_SPECIAL');
  });

  it('keeps a low-frequency route below S4 after six months', () => {
    const lowFrequency = simulate(
      patternedSchedule({
        weeks: 26,
        eventsPerWeek: 1,
        everyNthWeek: 2,
      }),
    );

    expect(lowFrequency.stage).not.toBe('S4_SPECIAL');
  });

  it('prevents one repeated event family from farming relationship stage or trust', () => {
    const visits = Array.from({ length: 100 }, (_, index) => ({
      day: index + 1,
      event: 'RETURN_VISIT' as const,
      sourceKey: `visit-${index}`,
    }));

    const state = simulate(visits);

    expect(state.stage).toBe('S0_FIRST_MEETING');
    expect(state.trust).toBe(0);
    expect(state.distinctPositiveFamilies).toBe(1);
    expect(state.closeness).toBeLessThan(60);
  });

  it('does not let unresolved conflict qualify for S3/S4 and requires explicit repair', () => {
    const established = patternedSchedule({ weeks: 20, eventsPerWeek: 2 });
    const conflictDay = 141;
    const conflicted = simulate([
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

    const repaired = simulate([
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
    const beforeAbsence = simulate(
      patternedSchedule({ weeks: 8, eventsPerWeek: 2 }),
    );
    const afterReturn = simulate([
      ...patternedSchedule({ weeks: 8, eventsPerWeek: 2 }),
      {
        day: 180,
        event: 'RETURNED_AFTER_ABSENCE',
        sourceKey: 'return-after-absence',
      },
    ]);

    expect(afterReturn.closeness).toBeGreaterThanOrEqual(beforeAbsence.closeness);
    expect(afterReturn.trust).toBeGreaterThanOrEqual(beforeAbsence.trust);
    expect(afterReturn.friction).toBe(beforeAbsence.friction);
  });

  it('dedupes the same source identity before any score or milestone credit', () => {
    const repeated = Array.from({ length: 20 }, () => ({
      day: 1,
      event: 'PROMISE_KEPT' as const,
      sourceKey: 'same-logical-event',
    }));

    const state = simulate(repeated);

    expect(state.closeness).toBe(4);
    expect(state.trust).toBe(5);
    expect(state.milestoneCount).toBe(1);
  });
});
