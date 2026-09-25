import type {
  SeyeonExperimentalEventKindV2,
  SeyeonRelationshipEventV2,
} from './seyeon-event-ledger-v2.js';

export const SEYEON_RELATIONSHIP_EPISODE_SCHEMA_VERSION_V2 =
  'seyeon-relationship-evidence-episode-shadow-v2' as const;
export const SEYEON_RELATIONSHIP_STATE_SHADOW_VERSION_V2 =
  'seyeon-relationship-state-shadow-v2' as const;

export type SeyeonRelationshipStageShadowV2 =
  | 'S0_FIRST_MEETING'
  | 'S1_FAMILIAR'
  | 'S2_REGULAR'
  | 'S3_OPENED'
  | 'S4_SPECIAL';

export type SeyeonRelationshipEpisodeFamilyV2 =
  | 'visit'
  | 'choice'
  | 'shared_activity'
  | 'commitment'
  | 'recognition'
  | 'care'
  | 'disclosure'
  | 'vulnerability'
  | 'conflict_repair'
  | 'return';

export type SeyeonRelationshipEpisodeStatusV2 =
  | 'open'
  | 'resolved'
  | 'terminal';

export type SeyeonRelationshipEpisodeOutcomeV2 =
  | 'visit'
  | 'choice'
  | 'shared_activity'
  | 'promise_open'
  | 'promise_kept'
  | 'promise_broken'
  | 'promise_broken_repaired'
  | 'recognition'
  | 'care'
  | 'disclosure'
  | 'vulnerability'
  | 'conflict_open'
  | 'conflict_repaired'
  | 'returned_after_absence';

export type SeyeonRelationshipMilestoneKindV2 =
  | 'commitment_follow_through'
  | 'repair_resolution'
  | 'recognition'
  | 'care'
  | 'vulnerability'
  | 'shared_activity';

export interface SeyeonRelationshipEvidenceEpisodeV2 {
  readonly schemaVersion: typeof SEYEON_RELATIONSHIP_EPISODE_SCHEMA_VERSION_V2;
  readonly authority: 'experimental_shadow_not_production_authority';
  readonly episodeId: string;
  readonly characterId: 'seyeon';
  readonly family: SeyeonRelationshipEpisodeFamilyV2;
  readonly rootEventId: string;
  readonly eventIds: readonly string[];
  readonly sourceMessageRefs: readonly string[];
  readonly openedAt: string;
  readonly resolvedAt: string | null;
  readonly status: SeyeonRelationshipEpisodeStatusV2;
  readonly outcome: SeyeonRelationshipEpisodeOutcomeV2;
  readonly positiveCreditAt: string | null;
  readonly milestoneKind: SeyeonRelationshipMilestoneKindV2 | null;
  readonly opensConflict: boolean;
  readonly conflictResolved: boolean;
}

export type SeyeonEpisodeSuppressionReasonV2 =
  | 'DUPLICATE_EPISODE'
  | 'ROLLING_FAMILY_WINDOW_LIMIT';

export interface SeyeonEpisodeCreditDecisionV2 {
  readonly episodeId: string;
  readonly family: SeyeonRelationshipEpisodeFamilyV2;
  readonly credited: boolean;
  readonly suppressionReason?: SeyeonEpisodeSuppressionReasonV2;
}

export interface SeyeonEpisodeCreditResultV2 {
  readonly creditedEpisodeIds: readonly string[];
  readonly suppressedEpisodeIds: readonly string[];
  readonly decisions: readonly SeyeonEpisodeCreditDecisionV2[];
  readonly milestoneKinds: readonly SeyeonRelationshipMilestoneKindV2[];
}

export type SeyeonCurrentRelationshipConditionV2 =
  | 'STABLE'
  | 'OPEN_CONFLICT'
  | 'RESOLVED_RECENTLY';

export type SeyeonRelationshipBehaviorAccessV2 =
  | 'STAGE_ALIGNED'
  | 'RESTRICTED_BY_CONFLICT'
  | 'CAUTIOUS_AFTER_REPAIR';

export interface SeyeonRelationshipStateShadowV2 {
  readonly schemaVersion: typeof SEYEON_RELATIONSHIP_STATE_SHADOW_VERSION_V2;
  readonly authority: 'experimental_shadow_not_production_authority';
  readonly characterId: 'seyeon';
  readonly attainedStage: SeyeonRelationshipStageShadowV2;
  readonly currentCandidateStage: SeyeonRelationshipStageShadowV2;
  readonly currentCondition: SeyeonCurrentRelationshipConditionV2;
  readonly behaviorAccess: SeyeonRelationshipBehaviorAccessV2;
  readonly unresolvedEpisodeIds: readonly string[];
  readonly causalEventIds: readonly string[];
}

export interface SeyeonRelationshipEpisodeProfileV2 {
  readonly familyCounts: Readonly<
    Record<SeyeonRelationshipEpisodeFamilyV2, number>
  >;
  readonly outcomeCounts: Readonly<
    Partial<Record<SeyeonRelationshipEpisodeOutcomeV2, number>>
  >;
  readonly milestoneKinds: readonly SeyeonRelationshipMilestoneKindV2[];
  readonly recentEpisodeIds: readonly string[];
  readonly unresolvedEpisodeIds: readonly string[];
}

export class SeyeonRelationshipSemanticsErrorV2 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeyeonRelationshipSemanticsErrorV2';
  }
}

const STAGE_ORDER: Readonly<Record<SeyeonRelationshipStageShadowV2, number>> =
  Object.freeze({
    S0_FIRST_MEETING: 0,
    S1_FAMILIAR: 1,
    S2_REGULAR: 2,
    S3_OPENED: 3,
    S4_SPECIAL: 4,
  });

function sortEvents(
  events: readonly SeyeonRelationshipEventV2[],
): readonly SeyeonRelationshipEventV2[] {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.characterId !== 'seyeon') {
      throw new SeyeonRelationshipSemanticsErrorV2(
        'Episode builder accepts only Se-yeon events.',
      );
    }
    if (ids.has(event.eventId)) {
      throw new SeyeonRelationshipSemanticsErrorV2(
        `Duplicate eventId: ${event.eventId}`,
      );
    }
    ids.add(event.eventId);
  }

  for (const event of events) {
    for (const predecessorId of event.causalPredecessorEventIds) {
      if (!ids.has(predecessorId)) {
        throw new SeyeonRelationshipSemanticsErrorV2(
          `Missing causal predecessor ${predecessorId} for ${event.eventId}.`,
        );
      }
    }
  }

  return Object.freeze(
    [...events].sort((left, right) => {
      const time = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
      return time !== 0 ? time : left.eventId.localeCompare(right.eventId);
    }),
  );
}

function descendantsOf(
  events: readonly SeyeonRelationshipEventV2[],
  predecessorId: string,
  kinds: readonly SeyeonExperimentalEventKindV2[],
): readonly SeyeonRelationshipEventV2[] {
  return events.filter(
    (event) =>
      kinds.includes(event.eventKind) &&
      event.causalPredecessorEventIds.includes(predecessorId),
  );
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

function episode(input: Omit<
  SeyeonRelationshipEvidenceEpisodeV2,
  'schemaVersion' | 'authority' | 'characterId'
>): SeyeonRelationshipEvidenceEpisodeV2 {
  return Object.freeze({
    schemaVersion: SEYEON_RELATIONSHIP_EPISODE_SCHEMA_VERSION_V2,
    authority: 'experimental_shadow_not_production_authority' as const,
    characterId: 'seyeon' as const,
    ...input,
    eventIds: Object.freeze([...input.eventIds]),
    sourceMessageRefs: uniqueStrings(input.sourceMessageRefs),
  });
}

function singletonFamily(
  kind: SeyeonExperimentalEventKindV2,
): SeyeonRelationshipEpisodeFamilyV2 | null {
  switch (kind) {
    case 'USER_REMEMBERED_SEYEON_DETAIL':
      return 'recognition';
    case 'SEYEON_ACCEPTED_HELP':
    case 'SEYEON_REQUESTED_HELP':
      return 'care';
    case 'SEYEON_SELF_DISCLOSED':
      return 'disclosure';
    case 'SEYEON_ADMITTED_WAITING':
      return 'vulnerability';
    case 'RETURNED_AFTER_ABSENCE':
      return 'return';
    default:
      return null;
  }
}

function singletonOutcome(
  kind: SeyeonExperimentalEventKindV2,
): SeyeonRelationshipEpisodeOutcomeV2 {
  switch (kind) {
    case 'USER_REMEMBERED_SEYEON_DETAIL':
      return 'recognition';
    case 'SEYEON_ACCEPTED_HELP':
    case 'SEYEON_REQUESTED_HELP':
      return 'care';
    case 'SEYEON_SELF_DISCLOSED':
      return 'disclosure';
    case 'SEYEON_ADMITTED_WAITING':
      return 'vulnerability';
    case 'RETURNED_AFTER_ABSENCE':
      return 'returned_after_absence';
    default:
      throw new SeyeonRelationshipSemanticsErrorV2(
        `Unsupported singleton kind: ${kind}`,
      );
  }
}

function singletonMilestone(
  kind: SeyeonExperimentalEventKindV2,
): SeyeonRelationshipMilestoneKindV2 | null {
  switch (kind) {
    case 'USER_REMEMBERED_SEYEON_DETAIL':
      return 'recognition';
    case 'SEYEON_ACCEPTED_HELP':
    case 'SEYEON_REQUESTED_HELP':
      return 'care';
    case 'SEYEON_ADMITTED_WAITING':
      return 'vulnerability';
    default:
      return null;
  }
}

export function buildSeyeonRelationshipEvidenceEpisodesV2(
  inputEvents: readonly SeyeonRelationshipEventV2[],
): readonly SeyeonRelationshipEvidenceEpisodeV2[] {
  const events = sortEvents(inputEvents);
  const processed = new Set<string>();
  const episodes: SeyeonRelationshipEvidenceEpisodeV2[] = [];

  for (const root of events) {
    if (processed.has(root.eventId)) continue;

    if (root.eventKind === 'PROMISE_MADE') {
      const outcomes = descendantsOf(events, root.eventId, [
        'PROMISE_KEPT',
        'PROMISE_BROKEN',
      ]);
      const lastOutcome = outcomes.at(-1) ?? null;
      const repairEvents =
        lastOutcome?.eventKind === 'PROMISE_BROKEN'
          ? descendantsOf(events, lastOutcome.eventId, [
              'RECONCILIATION_EVENT',
            ])
          : [];
      const lastRepair = repairEvents.at(-1) ?? null;
      const linked = [root, ...outcomes, ...repairEvents];
      linked.forEach((event) => processed.add(event.eventId));

      const outcome: SeyeonRelationshipEpisodeOutcomeV2 =
        lastOutcome === null
          ? 'promise_open'
          : lastOutcome.eventKind === 'PROMISE_KEPT'
            ? 'promise_kept'
            : lastRepair === null
              ? 'promise_broken'
              : 'promise_broken_repaired';
      const resolvedAt =
        lastRepair?.occurredAt ??
        (lastOutcome?.eventKind === 'PROMISE_KEPT'
          ? lastOutcome.occurredAt
          : null);

      episodes.push(
        episode({
          episodeId: `episode:${root.eventId}`,
          family: 'commitment',
          rootEventId: root.eventId,
          eventIds: linked.map((event) => event.eventId),
          sourceMessageRefs: linked.flatMap(
            (event) => event.sourceMessageRefs,
          ),
          openedAt: root.occurredAt,
          resolvedAt,
          status:
            outcome === 'promise_open' || outcome === 'promise_broken'
              ? 'open'
              : 'resolved',
          outcome,
          positiveCreditAt:
            outcome === 'promise_kept'
              ? lastOutcome!.occurredAt
              : outcome === 'promise_broken_repaired'
                ? lastRepair!.occurredAt
                : null,
          milestoneKind:
            outcome === 'promise_kept'
              ? 'commitment_follow_through'
              : outcome === 'promise_broken_repaired'
                ? 'repair_resolution'
                : null,
          opensConflict:
            outcome === 'promise_broken' ||
            outcome === 'promise_broken_repaired',
          conflictResolved: outcome === 'promise_broken_repaired',
        }),
      );
      continue;
    }

    if (
      root.eventKind === 'CONFLICT_EVENT' ||
      root.eventKind === 'SPECIALNESS_INVALIDATED' ||
      root.eventKind === 'PROMISE_BROKEN'
    ) {
      if (
        root.eventKind === 'PROMISE_BROKEN' &&
        root.causalPredecessorEventIds.length > 0
      ) {
        throw new SeyeonRelationshipSemanticsErrorV2(
          'Causal PROMISE_BROKEN must be folded into its PROMISE_MADE episode.',
        );
      }

      const repairs = descendantsOf(events, root.eventId, [
        'RECONCILIATION_EVENT',
      ]);
      const lastRepair = repairs.at(-1) ?? null;
      const linked = [root, ...repairs];
      linked.forEach((event) => processed.add(event.eventId));

      episodes.push(
        episode({
          episodeId: `episode:${root.eventId}`,
          family: 'conflict_repair',
          rootEventId: root.eventId,
          eventIds: linked.map((event) => event.eventId),
          sourceMessageRefs: linked.flatMap(
            (event) => event.sourceMessageRefs,
          ),
          openedAt: root.occurredAt,
          resolvedAt: lastRepair?.occurredAt ?? null,
          status: lastRepair === null ? 'open' : 'resolved',
          outcome:
            lastRepair === null ? 'conflict_open' : 'conflict_repaired',
          positiveCreditAt: lastRepair?.occurredAt ?? null,
          milestoneKind:
            lastRepair === null ? null : 'repair_resolution',
          opensConflict: true,
          conflictResolved: lastRepair !== null,
        }),
      );
      continue;
    }

    if (
      root.eventKind === 'PROMISE_KEPT' ||
      root.eventKind === 'RECONCILIATION_EVENT'
    ) {
      throw new SeyeonRelationshipSemanticsErrorV2(
        `${root.eventKind} requires a causal predecessor episode.`,
      );
    }

    const family = singletonFamily(root.eventKind);
    if (family !== null) {
      processed.add(root.eventId);
      episodes.push(
        episode({
          episodeId: `episode:${root.eventId}`,
          family,
          rootEventId: root.eventId,
          eventIds: [root.eventId],
          sourceMessageRefs: root.sourceMessageRefs,
          openedAt: root.occurredAt,
          resolvedAt: root.occurredAt,
          status: 'terminal',
          outcome: singletonOutcome(root.eventKind),
          positiveCreditAt: root.occurredAt,
          milestoneKind: singletonMilestone(root.eventKind),
          opensConflict: false,
          conflictResolved: false,
        }),
      );
      continue;
    }

    throw new SeyeonRelationshipSemanticsErrorV2(
      `Event kind ${root.eventKind} is outside the current episode shadow vocabulary.`,
    );
  }

  return Object.freeze(
    episodes.sort((left, right) => {
      const time = Date.parse(left.openedAt) - Date.parse(right.openedAt);
      return time !== 0
        ? time
        : left.episodeId.localeCompare(right.episodeId);
    }),
  );
}

export function creditSeyeonRelationshipEpisodesV2(
  episodes: readonly SeyeonRelationshipEvidenceEpisodeV2[],
  options: {
    readonly maxPositiveCreditsPerFamilyRolling7Days?: number;
    readonly repairCountsTowardMilestones?: boolean;
  } = {},
): SeyeonEpisodeCreditResultV2 {
  const maxCredits = options.maxPositiveCreditsPerFamilyRolling7Days ?? 2;
  if (!Number.isInteger(maxCredits) || maxCredits < 1 || maxCredits > 20) {
    throw new SeyeonRelationshipSemanticsErrorV2(
      'maxPositiveCreditsPerFamilyRolling7Days must be an integer from 1 to 20.',
    );
  }

  const seen = new Set<string>();
  const familyCreditTimes = new Map<
    SeyeonRelationshipEpisodeFamilyV2,
    number[]
  >();
  const creditedEpisodeIds: string[] = [];
  const suppressedEpisodeIds: string[] = [];
  const decisions: SeyeonEpisodeCreditDecisionV2[] = [];
  const milestoneKinds: SeyeonRelationshipMilestoneKindV2[] = [];

  const sorted = [...episodes]
    .filter((episode) => episode.positiveCreditAt !== null)
    .sort(
      (left, right) =>
        Date.parse(left.positiveCreditAt!) -
        Date.parse(right.positiveCreditAt!),
    );

  for (const episode of sorted) {
    if (seen.has(episode.episodeId)) {
      suppressedEpisodeIds.push(episode.episodeId);
      decisions.push({
        episodeId: episode.episodeId,
        family: episode.family,
        credited: false,
        suppressionReason: 'DUPLICATE_EPISODE',
      });
      continue;
    }
    seen.add(episode.episodeId);

    const at = Date.parse(episode.positiveCreditAt!);
    const lowerExclusive = at - 7 * 24 * 60 * 60 * 1000;
    const active = (familyCreditTimes.get(episode.family) ?? []).filter(
      (timestamp) => timestamp > lowerExclusive,
    );

    if (active.length >= maxCredits) {
      suppressedEpisodeIds.push(episode.episodeId);
      decisions.push({
        episodeId: episode.episodeId,
        family: episode.family,
        credited: false,
        suppressionReason: 'ROLLING_FAMILY_WINDOW_LIMIT',
      });
      familyCreditTimes.set(episode.family, active);
      continue;
    }

    active.push(at);
    familyCreditTimes.set(episode.family, active);
    creditedEpisodeIds.push(episode.episodeId);
    decisions.push({
      episodeId: episode.episodeId,
      family: episode.family,
      credited: true,
    });

    if (
      episode.milestoneKind !== null &&
      (episode.milestoneKind !== 'repair_resolution' ||
        options.repairCountsTowardMilestones === true)
    ) {
      milestoneKinds.push(episode.milestoneKind);
    }
  }

  return Object.freeze({
    creditedEpisodeIds: Object.freeze(creditedEpisodeIds),
    suppressedEpisodeIds: Object.freeze(suppressedEpisodeIds),
    decisions: Object.freeze(decisions),
    milestoneKinds: Object.freeze(milestoneKinds),
  });
}

export function projectSeyeonRelationshipStateShadowV2(input: {
  readonly previousAttainedStage?: SeyeonRelationshipStageShadowV2;
  readonly currentCandidateStage: SeyeonRelationshipStageShadowV2;
  readonly episodes: readonly SeyeonRelationshipEvidenceEpisodeV2[];
}): SeyeonRelationshipStateShadowV2 {
  const previous = input.previousAttainedStage ?? 'S0_FIRST_MEETING';
  const attainedStage =
    STAGE_ORDER[input.currentCandidateStage] > STAGE_ORDER[previous]
      ? input.currentCandidateStage
      : previous;

  const conditionEpisodes = input.episodes.filter(
    (episode) => episode.opensConflict,
  );
  const unresolved = conditionEpisodes.filter(
    (episode) => !episode.conflictResolved,
  );
  const latestConditionEpisode = conditionEpisodes
    .slice()
    .sort(
      (left, right) =>
        Date.parse(left.openedAt) - Date.parse(right.openedAt),
    )
    .at(-1);

  const currentCondition: SeyeonCurrentRelationshipConditionV2 =
    unresolved.length > 0
      ? 'OPEN_CONFLICT'
      : latestConditionEpisode?.conflictResolved === true
        ? 'RESOLVED_RECENTLY'
        : 'STABLE';

  const behaviorAccess: SeyeonRelationshipBehaviorAccessV2 =
    currentCondition === 'OPEN_CONFLICT'
      ? 'RESTRICTED_BY_CONFLICT'
      : currentCondition === 'RESOLVED_RECENTLY'
        ? 'CAUTIOUS_AFTER_REPAIR'
        : 'STAGE_ALIGNED';

  return Object.freeze({
    schemaVersion: SEYEON_RELATIONSHIP_STATE_SHADOW_VERSION_V2,
    authority: 'experimental_shadow_not_production_authority' as const,
    characterId: 'seyeon' as const,
    attainedStage,
    currentCandidateStage: input.currentCandidateStage,
    currentCondition,
    behaviorAccess,
    unresolvedEpisodeIds: Object.freeze(
      unresolved.map((episode) => episode.episodeId),
    ),
    causalEventIds: uniqueStrings(
      conditionEpisodes.flatMap((episode) => episode.eventIds),
    ),
  });
}

export function summarizeSeyeonRelationshipEpisodeProfileV2(
  episodes: readonly SeyeonRelationshipEvidenceEpisodeV2[],
  recentLimit = 8,
): SeyeonRelationshipEpisodeProfileV2 {
  if (!Number.isInteger(recentLimit) || recentLimit < 1 || recentLimit > 32) {
    throw new SeyeonRelationshipSemanticsErrorV2(
      'recentLimit must be an integer from 1 to 32.',
    );
  }

  const familyCounts: Record<SeyeonRelationshipEpisodeFamilyV2, number> = {
    visit: 0,
    choice: 0,
    shared_activity: 0,
    commitment: 0,
    recognition: 0,
    care: 0,
    disclosure: 0,
    vulnerability: 0,
    conflict_repair: 0,
    return: 0,
  };
  const outcomeCounts: Partial<
    Record<SeyeonRelationshipEpisodeOutcomeV2, number>
  > = {};
  const milestoneKinds = new Set<SeyeonRelationshipMilestoneKindV2>();

  for (const episode of episodes) {
    familyCounts[episode.family] += 1;
    outcomeCounts[episode.outcome] = (outcomeCounts[episode.outcome] ?? 0) + 1;
    if (episode.milestoneKind !== null) {
      milestoneKinds.add(episode.milestoneKind);
    }
  }

  const recentEpisodeIds = [...episodes]
    .sort(
      (left, right) =>
        Date.parse(right.openedAt) - Date.parse(left.openedAt),
    )
    .slice(0, recentLimit)
    .map((episode) => episode.episodeId);

  return Object.freeze({
    familyCounts: Object.freeze(familyCounts),
    outcomeCounts: Object.freeze(outcomeCounts),
    milestoneKinds: Object.freeze([...milestoneKinds]),
    recentEpisodeIds: Object.freeze(recentEpisodeIds),
    unresolvedEpisodeIds: Object.freeze(
      episodes
        .filter(
          (episode) => episode.opensConflict && !episode.conflictResolved,
        )
        .map((episode) => episode.episodeId),
    ),
  });
}
