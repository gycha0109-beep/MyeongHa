export type CalibrationStage =
  | 'S0_FIRST_MEETING'
  | 'S1_FAMILIAR'
  | 'S2_REGULAR'
  | 'S3_OPENED'
  | 'S4_SPECIAL';

export type CalibrationEventKey =
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

export type CalibrationEvidenceFamily =
  | 'visit'
  | 'choice'
  | 'disclosure'
  | 'shared_activity'
  | 'commitment'
  | 'recognition'
  | 'care'
  | 'vulnerability'
  | 'conflict'
  | 'repair'
  | 'return';

export type CalibrationSuppressionReason =
  | 'EXACT_DUPLICATE'
  | 'FAMILY_WINDOW_LIMIT';

export type CalibrationStageMode =
  | 'recompute'
  | 'lock_progress_block_on_conflict'
  | 'behavior_overlay';

export type CalibrationStageGateVariant =
  | 'b1_family_diversity'
  | 'b2_sustained_route_shadow';

export interface CalibrationEvent {
  readonly day: number;
  readonly event: CalibrationEventKey;
  readonly sourceKey: string;
}

export interface CalibrationEventRule {
  readonly closeness: number;
  readonly trust: number;
  readonly friction: number;
  readonly family: CalibrationEvidenceFamily;
  readonly milestone: boolean;
  readonly opensConflict?: boolean;
  readonly repairsConflict?: boolean;
}

export interface CalibrationPolicy {
  readonly policyId: string;
  readonly authority: 'calibration_only';
  readonly familyWindow: 'fixed_7_day_bucket' | 'rolling_7_day_window';
  readonly maxPositiveCreditsPerFamilyWindow: number;
  readonly stageMode: CalibrationStageMode;
  readonly stageGateVariant: CalibrationStageGateVariant;
  readonly eventRules: Readonly<Record<CalibrationEventKey, CalibrationEventRule>>;
}

export interface CalibrationTransition {
  readonly from: CalibrationStage;
  readonly to: CalibrationStage;
  readonly day: number;
  readonly sourceKey: string;
  readonly event: CalibrationEventKey;
}

export interface CalibrationEventDecision {
  readonly day: number;
  readonly event: CalibrationEventKey;
  readonly sourceKey: string;
  readonly credited: boolean;
  readonly suppressionReason?: CalibrationSuppressionReason;
}

export interface CalibrationState {
  readonly closeness: number;
  readonly trust: number;
  readonly friction: number;
  readonly stage: CalibrationStage;
  readonly distinctPositiveDays: number;
  readonly distinctPositiveWeeks: number;
  readonly distinctPositiveFamilies: number;
  readonly milestoneCount: number;
  readonly conflictOpen: boolean;
  readonly totalEvents: number;
  readonly creditedEvents: number;
  readonly suppressedEvents: number;
  readonly duplicateEvents: number;
  readonly transitions: readonly CalibrationTransition[];
  readonly decisions: readonly CalibrationEventDecision[];
  readonly firstReachedStage: Readonly<Partial<Record<CalibrationStage, number>>>;
}

export const CALIBRATION_POLICY_STATUS =
  'CALIBRATION_ONLY_NOT_PRODUCTION_AUTHORITY' as const;

export const EVENT_RULES_B1: Readonly<
  Record<CalibrationEventKey, CalibrationEventRule>
> = Object.freeze({
  RETURN_VISIT: {
    closeness: 1,
    trust: 0,
    friction: 0,
    family: 'visit',
    milestone: false,
  },
  CHOSE_CHARACTER: {
    closeness: 2,
    trust: 1,
    friction: 0,
    family: 'choice',
    milestone: false,
  },
  SHARED_PERSONAL_FACT: {
    closeness: 2,
    trust: 2,
    friction: 0,
    family: 'disclosure',
    milestone: false,
  },
  COMPLETED_READING: {
    closeness: 2,
    trust: 2,
    friction: 0,
    family: 'shared_activity',
    milestone: false,
  },
  FINISHED_EPISODE: {
    closeness: 3,
    trust: 2,
    friction: 0,
    family: 'shared_activity',
    milestone: true,
  },
  PROMISE_MADE: {
    closeness: 1,
    trust: 1,
    friction: 0,
    family: 'commitment',
    milestone: false,
  },
  PROMISE_KEPT: {
    closeness: 4,
    trust: 5,
    friction: 0,
    family: 'commitment',
    milestone: true,
  },
  USER_REMEMBERED_SEYEON_DETAIL: {
    closeness: 3,
    trust: 4,
    friction: 0,
    family: 'recognition',
    milestone: true,
  },
  SEYEON_ACCEPTED_HELP: {
    closeness: 3,
    trust: 4,
    friction: 0,
    family: 'care',
    milestone: true,
  },
  SEYEON_REQUESTED_HELP: {
    closeness: 3,
    trust: 5,
    friction: 0,
    family: 'care',
    milestone: true,
  },
  SEYEON_SELF_DISCLOSED: {
    closeness: 2,
    trust: 2,
    friction: 0,
    family: 'disclosure',
    milestone: false,
  },
  SEYEON_ADMITTED_WAITING: {
    closeness: 4,
    trust: 4,
    friction: 0,
    family: 'vulnerability',
    milestone: true,
  },
  CONFLICT_EVENT: {
    closeness: 0,
    trust: -6,
    friction: 8,
    family: 'conflict',
    milestone: false,
    opensConflict: true,
  },
  PROMISE_BROKEN: {
    closeness: 0,
    trust: -8,
    friction: 6,
    family: 'conflict',
    milestone: false,
    opensConflict: true,
  },
  SPECIALNESS_INVALIDATED: {
    closeness: 0,
    trust: -10,
    friction: 10,
    family: 'conflict',
    milestone: false,
    opensConflict: true,
  },
  RECONCILIATION_EVENT: {
    closeness: 3,
    trust: 5,
    friction: -6,
    family: 'repair',
    milestone: true,
    repairsConflict: true,
  },
  RETURNED_AFTER_ABSENCE: {
    closeness: 1,
    trust: 1,
    friction: 0,
    family: 'return',
    milestone: false,
  },
});

export const CANDIDATE_B1_POLICY: CalibrationPolicy = Object.freeze({
  policyId: 'seyeon-relationship-candidate-b1-v0.1',
  authority: 'calibration_only',
  familyWindow: 'fixed_7_day_bucket',
  maxPositiveCreditsPerFamilyWindow: 2,
  stageMode: 'recompute',
  stageGateVariant: 'b1_family_diversity',
  eventRules: EVENT_RULES_B1,
});

export const CANDIDATE_B1_ROLLING_WINDOW_SHADOW: CalibrationPolicy =
  Object.freeze({
    ...CANDIDATE_B1_POLICY,
    policyId: 'seyeon-relationship-candidate-b1-rolling-window-shadow-v0.1',
    familyWindow: 'rolling_7_day_window',
  });

export const CANDIDATE_B2_ROUTE_SHADOW: CalibrationPolicy = Object.freeze({
  ...CANDIDATE_B1_POLICY,
  policyId: 'seyeon-relationship-candidate-b2-route-shadow-v0.1',
  stageGateVariant: 'b2_sustained_route_shadow',
});

export const CANDIDATE_B2_COMBINED_SHADOW: CalibrationPolicy = Object.freeze({
  ...CANDIDATE_B2_ROUTE_SHADOW,
  policyId: 'seyeon-relationship-candidate-b2-combined-shadow-v0.1',
  familyWindow: 'rolling_7_day_window',
});

export const ROUTE_WITHOUT_FORCED_SELF_DISCLOSURE: readonly CalibrationEventKey[] =
  Object.freeze([
    'RETURN_VISIT',
    'COMPLETED_READING',
    'PROMISE_MADE',
    'PROMISE_KEPT',
    'USER_REMEMBERED_SEYEON_DETAIL',
    'FINISHED_EPISODE',
    'SEYEON_ACCEPTED_HELP',
  ]);

export const ROUTES = Object.freeze({
  shallow: ['RETURN_VISIT'] as readonly CalibrationEventKey[],
  sharedActivity: [
    'RETURN_VISIT',
    'COMPLETED_READING',
    'FINISHED_EPISODE',
    'RETURN_VISIT',
  ] as readonly CalibrationEventKey[],
  reliability: [
    'PROMISE_MADE',
    'PROMISE_KEPT',
    'RETURN_VISIT',
    'PROMISE_MADE',
    'PROMISE_KEPT',
  ] as readonly CalibrationEventKey[],
  reciprocity: [
    'USER_REMEMBERED_SEYEON_DETAIL',
    'SEYEON_ACCEPTED_HELP',
    'SEYEON_REQUESTED_HELP',
    'RETURN_VISIT',
  ] as readonly CalibrationEventKey[],
  care: [
    'SEYEON_ACCEPTED_HELP',
    'SEYEON_REQUESTED_HELP',
    'RETURN_VISIT',
    'SEYEON_ACCEPTED_HELP',
  ] as readonly CalibrationEventKey[],
  disclosureHeavy: [
    'SHARED_PERSONAL_FACT',
    'SEYEON_SELF_DISCLOSED',
    'RETURN_VISIT',
    'SEYEON_ADMITTED_WAITING',
  ] as readonly CalibrationEventKey[],
  mixedOrganic: ROUTE_WITHOUT_FORCED_SELF_DISCLOSURE,
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

export function resolveCandidateB1Stage(input: {
  readonly closeness: number;
  readonly trust: number;
  readonly distinctPositiveDays: number;
  readonly distinctPositiveWeeks: number;
  readonly distinctPositiveFamilies: number;
  readonly milestoneCount: number;
  readonly conflictOpen: boolean;
}): CalibrationStage {
  if (
    input.closeness >= 75 &&
    input.trust >= 65 &&
    input.distinctPositiveDays >= 40 &&
    input.distinctPositiveWeeks >= 10 &&
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

export function resolveCandidateB2RouteStage(input: {
  readonly closeness: number;
  readonly trust: number;
  readonly distinctPositiveDays: number;
  readonly distinctPositiveWeeks: number;
  readonly distinctPositiveFamilies: number;
  readonly milestoneCount: number;
  readonly conflictOpen: boolean;
}): CalibrationStage {
  if (
    input.closeness >= 75 &&
    input.trust >= 65 &&
    input.distinctPositiveDays >= 40 &&
    input.milestoneCount >= 3 &&
    !input.conflictOpen &&
    ((input.distinctPositiveWeeks >= 10 &&
      input.distinctPositiveFamilies >= 5) ||
      (input.distinctPositiveWeeks >= 40 &&
        input.distinctPositiveFamilies >= 2))
  ) {
    return 'S4_SPECIAL';
  }
  if (
    input.closeness >= 42 &&
    input.trust >= 30 &&
    input.distinctPositiveDays >= 12 &&
    !input.conflictOpen &&
    (input.distinctPositiveFamilies >= 4 ||
      (input.distinctPositiveWeeks >= 20 &&
        input.distinctPositiveFamilies >= 2))
  ) {
    return 'S3_OPENED';
  }
  if (
    input.closeness >= 20 &&
    input.trust >= 12 &&
    input.distinctPositiveDays >= 5 &&
    (input.distinctPositiveFamilies >= 3 ||
      (input.distinctPositiveWeeks >= 8 &&
        input.distinctPositiveFamilies >= 2))
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

const STAGE_ORDER: Readonly<Record<CalibrationStage, number>> = Object.freeze({
  S0_FIRST_MEETING: 0,
  S1_FAMILIAR: 1,
  S2_REGULAR: 2,
  S3_OPENED: 3,
  S4_SPECIAL: 4,
});

function resolveStageForMode(input: {
  readonly candidate: CalibrationStage;
  readonly current: CalibrationStage;
  readonly conflictOpen: boolean;
  readonly mode: CalibrationStageMode;
}): CalibrationStage {
  if (input.mode === 'recompute') return input.candidate;

  if (input.mode === 'behavior_overlay') {
    return STAGE_ORDER[input.candidate] > STAGE_ORDER[input.current]
      ? input.candidate
      : input.current;
  }

  if (input.conflictOpen) return input.current;
  return STAGE_ORDER[input.candidate] > STAGE_ORDER[input.current]
    ? input.candidate
    : input.current;
}

function fixedBucketKey(day: number, family: CalibrationEvidenceFamily): string {
  const week = Math.floor((Math.max(1, day) - 1) / 7);
  return `${week}:${family}`;
}

function isPositive(rule: CalibrationEventRule): boolean {
  return rule.closeness > 0 || rule.trust > 0;
}

export function simulateRelationshipCalibration(
  events: readonly CalibrationEvent[],
  policy: CalibrationPolicy = CANDIDATE_B1_POLICY,
): CalibrationState {
  const sorted = [...events].sort((a, b) => a.day - b.day);
  const seenSources = new Set<string>();
  const positiveDays = new Set<number>();
  const positiveWeeks = new Set<number>();
  const positiveFamilies = new Set<CalibrationEvidenceFamily>();
  const fixedWindowCredits = new Map<string, number>();
  const rollingWindowCredits = new Map<
    CalibrationEvidenceFamily,
    number[]
  >();
  const transitions: CalibrationTransition[] = [];
  const decisions: CalibrationEventDecision[] = [];
  const firstReachedStage: Partial<Record<CalibrationStage, number>> = {
    S0_FIRST_MEETING: 0,
  };

  let closeness = 0;
  let trust = 0;
  let friction = 0;
  let milestoneCount = 0;
  let conflictOpen = false;
  let stage: CalibrationStage = 'S0_FIRST_MEETING';
  let duplicateEvents = 0;
  let suppressedEvents = 0;
  let creditedEvents = 0;

  for (const input of sorted) {
    if (seenSources.has(input.sourceKey)) {
      duplicateEvents += 1;
      suppressedEvents += 1;
      decisions.push({
        ...input,
        credited: false,
        suppressionReason: 'EXACT_DUPLICATE',
      });
      continue;
    }
    seenSources.add(input.sourceKey);

    const rule = policy.eventRules[input.event];
    const positive = isPositive(rule);
    let eligibleForPositiveCredit = true;

    if (positive && policy.familyWindow === 'fixed_7_day_bucket') {
      const key = fixedBucketKey(input.day, rule.family);
      const credits = fixedWindowCredits.get(key) ?? 0;
      eligibleForPositiveCredit =
        credits < policy.maxPositiveCreditsPerFamilyWindow;
      if (eligibleForPositiveCredit) {
        fixedWindowCredits.set(key, credits + 1);
      }
    }

    if (positive && policy.familyWindow === 'rolling_7_day_window') {
      const history = rollingWindowCredits.get(rule.family) ?? [];
      const lowerExclusive = input.day - 7;
      const active = history.filter((day) => day > lowerExclusive);
      eligibleForPositiveCredit =
        active.length < policy.maxPositiveCreditsPerFamilyWindow;
      if (eligibleForPositiveCredit) active.push(input.day);
      rollingWindowCredits.set(rule.family, active);
    }

    if (positive && !eligibleForPositiveCredit) {
      suppressedEvents += 1;
      decisions.push({
        ...input,
        credited: false,
        suppressionReason: 'FAMILY_WINDOW_LIMIT',
      });
    } else {
      creditedEvents += 1;
      decisions.push({ ...input, credited: true });
    }

    if (positive && eligibleForPositiveCredit) {
      const day = Math.max(1, Math.floor(input.day));
      const week = Math.floor((day - 1) / 7);
      positiveDays.add(day);
      positiveWeeks.add(week);
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

    const stageInput = {
      closeness,
      trust,
      distinctPositiveDays: positiveDays.size,
      distinctPositiveWeeks: positiveWeeks.size,
      distinctPositiveFamilies: positiveFamilies.size,
      milestoneCount,
      conflictOpen,
    };
    const candidateStage =
      policy.stageGateVariant === 'b2_sustained_route_shadow'
        ? resolveCandidateB2RouteStage(stageInput)
        : resolveCandidateB1Stage(stageInput);
    const nextStage = resolveStageForMode({
      candidate: candidateStage,
      current: stage,
      conflictOpen,
      mode: policy.stageMode,
    });

    if (nextStage !== stage) {
      transitions.push({
        from: stage,
        to: nextStage,
        day: input.day,
        sourceKey: input.sourceKey,
        event: input.event,
      });
      if (firstReachedStage[nextStage] === undefined) {
        firstReachedStage[nextStage] = input.day;
      }
      stage = nextStage;
    }
  }

  return Object.freeze({
    closeness,
    trust,
    friction,
    stage,
    distinctPositiveDays: positiveDays.size,
    distinctPositiveWeeks: positiveWeeks.size,
    distinctPositiveFamilies: positiveFamilies.size,
    milestoneCount,
    conflictOpen,
    totalEvents: sorted.length,
    creditedEvents,
    suppressedEvents,
    duplicateEvents,
    transitions: Object.freeze(transitions),
    decisions: Object.freeze(decisions),
    firstReachedStage: Object.freeze(firstReachedStage),
  });
}

export function patternedSchedule(input: {
  readonly weeks: number;
  readonly eventsPerWeek: number;
  readonly everyNthWeek?: number;
  readonly route?: readonly CalibrationEventKey[];
  readonly sourcePrefix?: string;
}): CalibrationEvent[] {
  const everyNthWeek = input.everyNthWeek ?? 1;
  const route = input.route ?? ROUTE_WITHOUT_FORCED_SELF_DISCLOSURE;
  const sourcePrefix = input.sourcePrefix ?? 'source';
  const result: CalibrationEvent[] = [];
  let sequence = 0;

  for (let week = 0; week < input.weeks; week += everyNthWeek) {
    for (let index = 0; index < input.eventsPerWeek; index += 1) {
      const event = route[sequence % route.length]!;
      result.push({
        day: week * 7 + 1 + Math.min(index, 6),
        event,
        sourceKey: `${sourcePrefix}-${sequence}`,
      });
      sequence += 1;
    }
  }

  return result;
}

export function spacedSchedule(input: {
  readonly durationDays: number;
  readonly eventCount: number;
  readonly route?: readonly CalibrationEventKey[];
  readonly sourcePrefix?: string;
}): CalibrationEvent[] {
  const route = input.route ?? ROUTE_WITHOUT_FORCED_SELF_DISCLOSURE;
  const sourcePrefix = input.sourcePrefix ?? 'spaced';
  if (input.eventCount <= 0) return [];

  return Array.from({ length: input.eventCount }, (_, index) => {
    const day =
      input.eventCount === 1
        ? 1
        : 1 +
          Math.floor(
            (index * Math.max(0, input.durationDays - 1)) /
              (input.eventCount - 1),
          );
    return {
      day,
      event: route[index % route.length]!,
      sourceKey: `${sourcePrefix}-${index}`,
    };
  });
}

export function repeatEvent(input: {
  readonly event: CalibrationEventKey;
  readonly count: number;
  readonly startDay?: number;
  readonly dayStep?: number;
  readonly sourcePrefix?: string;
}): CalibrationEvent[] {
  const startDay = input.startDay ?? 1;
  const dayStep = input.dayStep ?? 1;
  const sourcePrefix = input.sourcePrefix ?? input.event.toLowerCase();

  return Array.from({ length: input.count }, (_, index) => ({
    day: startDay + index * dayStep,
    event: input.event,
    sourceKey: `${sourcePrefix}-${index}`,
  }));
}

export function seededRelationshipSchedule(input: {
  readonly seed: number;
  readonly durationDays: number;
  readonly eventCount: number;
  readonly route?: readonly CalibrationEventKey[];
}): CalibrationEvent[] {
  const route = input.route ?? ROUTE_WITHOUT_FORCED_SELF_DISCLOSURE;
  let state = input.seed >>> 0;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };

  return Array.from({ length: input.eventCount }, (_, index) => ({
    day: 1 + Math.floor(next() * Math.max(1, input.durationDays)),
    event: route[Math.floor(next() * route.length)]!,
    sourceKey: `seed-${input.seed}-${index}`,
  }));
}

export function withStageMode(
  policy: CalibrationPolicy,
  stageMode: CalibrationStageMode,
): CalibrationPolicy {
  return Object.freeze({
    ...policy,
    policyId: `${policy.policyId}-${stageMode}`,
    stageMode,
  });
}