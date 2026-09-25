import {
  SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2,
  SEYEON_EXPERIMENTAL_EVENT_KINDS_V2,
  type SeyeonCharacterInterpretationV2,
  type SeyeonEventFactV2,
  type SeyeonExperimentalEventKindV2,
  type SeyeonRelationshipEventV2,
  type SeyeonRelationshipProjectionV2,
} from './seyeon-event-ledger-v2.js';
import type { SeyeonDialogueEnvelopeV2 } from './seyeon-renderer-v2.js';
import type { SeyeonTurnInterpretationV2 } from './seyeon-turn-interpreter-v2.js';

export const SEYEON_EVENT_EXTRACTION_CANDIDATE_SCHEMA_VERSION_V2 =
  'seyeon-event-extraction-candidate-exp-v2' as const;
export const SEYEON_EVENT_RETRIEVAL_POLICY_VERSION_V2 =
  'seyeon-event-retrieval-exp-v0.1' as const;

export interface SeyeonEventExtractionMessageV2 {
  readonly messageId: string;
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

export interface SeyeonEventExtractionContextV2 {
  readonly turnId: string;
  readonly messages: readonly SeyeonEventExtractionMessageV2[];
  readonly priorEvents: readonly SeyeonRelationshipEventV2[];
  readonly interpretation: SeyeonTurnInterpretationV2;
  readonly envelope: SeyeonDialogueEnvelopeV2;
  readonly relationshipBefore: SeyeonRelationshipProjectionV2;
}

export type SeyeonEventExtractionCandidateV2 =
  | Readonly<{
      readonly schemaVersion: typeof SEYEON_EVENT_EXTRACTION_CANDIDATE_SCHEMA_VERSION_V2;
      readonly decision: 'none';
      readonly reason: string;
    }>
  | Readonly<{
      readonly schemaVersion: typeof SEYEON_EVENT_EXTRACTION_CANDIDATE_SCHEMA_VERSION_V2;
      readonly decision: 'event';
      readonly reason: string;
      readonly eventKind: SeyeonExperimentalEventKindV2;
      readonly sourceMessageRefs: readonly string[];
      readonly causalPredecessorEventIds: readonly string[];
      readonly facts: readonly SeyeonEventFactV2[];
      readonly characterInterpretation: SeyeonCharacterInterpretationV2 | null;
      readonly salience: number;
      readonly confidence: number;
      readonly dedupeBasis: string;
    }>;

export interface SeyeonEventRetrievalCandidateV2 {
  readonly event: SeyeonRelationshipEventV2;
  readonly semanticRelevance: number;
  readonly relationshipRelevance: number;
  readonly unresolvedConflictBonus: number;
  readonly recencyScore: number;
  readonly repetitionPenalty: number;
  readonly finalScore: number;
}

export class SeyeonEventExtractionErrorV2 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeyeonEventExtractionErrorV2';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unexpected !== undefined) {
    throw new SeyeonEventExtractionErrorV2(
      `${path} contains unexpected field: ${unexpected}`,
    );
  }
}

function boundedText(value: unknown, path: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new SeyeonEventExtractionErrorV2(`${path} must be text.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new SeyeonEventExtractionErrorV2(
      `${path} must be non-empty text within ${maxLength} characters.`,
    );
  }
  return normalized;
}

function boundedUnit(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new SeyeonEventExtractionErrorV2(`${path} must be between 0 and 1.`);
  }
  return value;
}

function parseRefs(
  value: unknown,
  path: string,
  allowedRefs: ReadonlySet<string>,
  maxLength: number,
): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxLength) {
    throw new SeyeonEventExtractionErrorV2(
      `${path} must contain between 1 and ${maxLength} refs.`,
    );
  }
  const refs = value.map((entry, index) =>
    boundedText(entry, `${path}[${index}]`, 512),
  );
  if (new Set(refs).size !== refs.length) {
    throw new SeyeonEventExtractionErrorV2(`${path} must not contain duplicates.`);
  }
  for (const ref of refs) {
    if (!allowedRefs.has(ref)) {
      throw new SeyeonEventExtractionErrorV2(
        `${path} contains ref absent from the extraction context: ${ref}`,
      );
    }
  }
  return Object.freeze(refs);
}

function parseOptionalRefs(
  value: unknown,
  path: string,
  allowedRefs: ReadonlySet<string>,
  maxLength: number,
): readonly string[] {
  if (!Array.isArray(value) || value.length > maxLength) {
    throw new SeyeonEventExtractionErrorV2(
      `${path} must contain at most ${maxLength} refs.`,
    );
  }
  const refs = value.map((entry, index) =>
    boundedText(entry, `${path}[${index}]`, 512),
  );
  if (new Set(refs).size !== refs.length) {
    throw new SeyeonEventExtractionErrorV2(`${path} must not contain duplicates.`);
  }
  for (const ref of refs) {
    if (!allowedRefs.has(ref)) {
      throw new SeyeonEventExtractionErrorV2(
        `${path} contains ref absent from prior Event context: ${ref}`,
      );
    }
  }
  return Object.freeze(refs);
}

function validateCausalRequirements(input: {
  readonly eventKind: SeyeonExperimentalEventKindV2;
  readonly causalPredecessorEventIds: readonly string[];
  readonly priorEvents: readonly SeyeonRelationshipEventV2[];
}): void {
  const priorById = new Map(
    input.priorEvents.map((event) => [event.eventId, event] as const),
  );
  if (priorById.size !== input.priorEvents.length) {
    throw new SeyeonEventExtractionErrorV2(
      'priorEvents must not contain duplicate event IDs.',
    );
  }

  const predecessorKinds = input.causalPredecessorEventIds.map(
    (eventId) => priorById.get(eventId)!.eventKind,
  );

  if (
    (input.eventKind === 'PROMISE_KEPT' ||
      input.eventKind === 'PROMISE_BROKEN') &&
    !predecessorKinds.includes('PROMISE_MADE')
  ) {
    throw new SeyeonEventExtractionErrorV2(
      `${input.eventKind} requires a prior PROMISE_MADE causal predecessor.`,
    );
  }

  if (
    input.eventKind === 'RECONCILIATION_EVENT' &&
    !predecessorKinds.some((kind) =>
      kind === 'CONFLICT_EVENT' ||
      kind === 'PROMISE_BROKEN' ||
      kind === 'SPECIALNESS_INVALIDATED'
    )
  ) {
    throw new SeyeonEventExtractionErrorV2(
      'RECONCILIATION_EVENT requires a prior unresolved conflict causal predecessor.',
    );
  }
}

export function validateSeyeonEventExtractionContextV2(
  context: SeyeonEventExtractionContextV2,
): void {
  if (context.messages.length === 0 || context.messages.length > 8) {
    throw new SeyeonEventExtractionErrorV2(
      'event extraction context must contain between 1 and 8 current-turn messages.',
    );
  }
  if (context.priorEvents.length > 8) {
    throw new SeyeonEventExtractionErrorV2(
      'event extraction context may contain at most 8 prior causal Event candidates.',
    );
  }
  const eventIds = context.priorEvents.map((event) => event.eventId);
  if (new Set(eventIds).size !== eventIds.length) {
    throw new SeyeonEventExtractionErrorV2(
      'event extraction context priorEvents must have unique event IDs.',
    );
  }
  if (context.priorEvents.some((event) => event.characterId !== 'seyeon')) {
    throw new SeyeonEventExtractionErrorV2(
      'event extraction context cannot contain another Character private Event.',
    );
  }
}

function parseEventKind(value: unknown): SeyeonExperimentalEventKindV2 {
  if (
    typeof value !== 'string' ||
    !SEYEON_EXPERIMENTAL_EVENT_KINDS_V2.includes(
      value as SeyeonExperimentalEventKindV2,
    )
  ) {
    throw new SeyeonEventExtractionErrorV2(
      'eventKind is not in the experimental Se-yeon event vocabulary.',
    );
  }
  return value as SeyeonExperimentalEventKindV2;
}

export function guardSeyeonEventExtractionCandidateV2(input: {
  readonly rawOutput: unknown;
  readonly context: SeyeonEventExtractionContextV2;
}): SeyeonEventExtractionCandidateV2 {
  validateSeyeonEventExtractionContextV2(input.context);
  if (!isRecord(input.rawOutput)) {
    throw new SeyeonEventExtractionErrorV2(
      'Se-yeon event extraction candidate must be an object.',
    );
  }
  const schemaVersion = input.rawOutput.schemaVersion;
  if (schemaVersion !== SEYEON_EVENT_EXTRACTION_CANDIDATE_SCHEMA_VERSION_V2) {
    throw new SeyeonEventExtractionErrorV2(
      'event extraction schemaVersion is invalid.',
    );
  }

  if (input.rawOutput.decision === 'none') {
    assertOnlyKeys(
      input.rawOutput,
      ['schemaVersion', 'decision', 'reason'],
      'eventExtraction',
    );
    return Object.freeze({
      schemaVersion: SEYEON_EVENT_EXTRACTION_CANDIDATE_SCHEMA_VERSION_V2,
      decision: 'none' as const,
      reason: boundedText(input.rawOutput.reason, 'reason', 1200),
    });
  }

  if (input.rawOutput.decision !== 'event') {
    throw new SeyeonEventExtractionErrorV2(
      'event extraction decision must be none or event.',
    );
  }

  assertOnlyKeys(
    input.rawOutput,
    [
      'schemaVersion',
      'decision',
      'reason',
      'eventKind',
      'sourceMessageRefs',
      'causalPredecessorEventIds',
      'facts',
      'characterInterpretation',
      'salience',
      'confidence',
      'dedupeBasis',
    ],
    'eventExtraction',
  );

  const messageRefs = new Set(
    input.context.messages.map((message) => message.messageId),
  );
  const sourceMessageRefs = parseRefs(
    input.rawOutput.sourceMessageRefs,
    'sourceMessageRefs',
    messageRefs,
    16,
  );
  const priorEventIds = new Set(
    input.context.priorEvents.map((event) => event.eventId),
  );
  const causalPredecessorEventIds = parseOptionalRefs(
    input.rawOutput.causalPredecessorEventIds,
    'causalPredecessorEventIds',
    priorEventIds,
    8,
  );
  const eventKind = parseEventKind(input.rawOutput.eventKind);
  validateCausalRequirements({
    eventKind,
    causalPredecessorEventIds,
    priorEvents: input.context.priorEvents,
  });

  if (!Array.isArray(input.rawOutput.facts) || input.rawOutput.facts.length === 0 || input.rawOutput.facts.length > 12) {
    throw new SeyeonEventExtractionErrorV2(
      'facts must contain between 1 and 12 source-backed facts.',
    );
  }
  const facts = Object.freeze(
    input.rawOutput.facts.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new SeyeonEventExtractionErrorV2(
          `facts[${index}] must be an object.`,
        );
      }
      assertOnlyKeys(entry, ['factKey', 'statement', 'sourceRefs'], `facts[${index}]`);
      return Object.freeze({
        factKey: boundedText(entry.factKey, `facts[${index}].factKey`, 128),
        statement: boundedText(entry.statement, `facts[${index}].statement`, 1200),
        sourceRefs: parseRefs(
          entry.sourceRefs,
          `facts[${index}].sourceRefs`,
          messageRefs,
          8,
        ),
      });
    }),
  );

  let characterInterpretation: SeyeonCharacterInterpretationV2 | null = null;
  if (input.rawOutput.characterInterpretation !== null) {
    if (!isRecord(input.rawOutput.characterInterpretation)) {
      throw new SeyeonEventExtractionErrorV2(
        'characterInterpretation must be an object or null.',
      );
    }
    assertOnlyKeys(
      input.rawOutput.characterInterpretation,
      ['statement', 'confidence', 'sourceRefs'],
      'characterInterpretation',
    );
    characterInterpretation = Object.freeze({
      statement: boundedText(
        input.rawOutput.characterInterpretation.statement,
        'characterInterpretation.statement',
        1200,
      ),
      confidence: boundedUnit(
        input.rawOutput.characterInterpretation.confidence,
        'characterInterpretation.confidence',
      ),
      sourceRefs: parseRefs(
        input.rawOutput.characterInterpretation.sourceRefs,
        'characterInterpretation.sourceRefs',
        messageRefs,
        8,
      ),
    });
  }

  const salience = boundedUnit(input.rawOutput.salience, 'salience');
  const confidence = boundedUnit(input.rawOutput.confidence, 'confidence');
  if (salience < 0.35 || confidence < 0.5) {
    throw new SeyeonEventExtractionErrorV2(
      'Durable event candidate must meet minimum salience and confidence thresholds.',
    );
  }

  return Object.freeze({
    schemaVersion: SEYEON_EVENT_EXTRACTION_CANDIDATE_SCHEMA_VERSION_V2,
    decision: 'event' as const,
    reason: boundedText(input.rawOutput.reason, 'reason', 1200),
    eventKind,
    sourceMessageRefs,
    causalPredecessorEventIds,
    facts,
    characterInterpretation,
    salience,
    confidence,
    dedupeBasis: boundedText(input.rawOutput.dedupeBasis, 'dedupeBasis', 256),
  });
}

export function materializeSeyeonEventCandidateV2(input: {
  readonly candidate: SeyeonEventExtractionCandidateV2;
  readonly context: SeyeonEventExtractionContextV2;
  readonly eventId: string;
  readonly dedupeKey: string;
  readonly occurredAt: string;
}): SeyeonRelationshipEventV2 | null {
  if (input.candidate.decision === 'none') return null;

  return Object.freeze({
    schemaVersion: SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2,
    authority: 'experimental_non_canonical_event' as const,
    eventId: boundedText(input.eventId, 'eventId', 256),
    dedupeKey: boundedText(input.dedupeKey, 'dedupeKey', 256),
    characterId: 'seyeon' as const,
    eventKind: input.candidate.eventKind,
    occurredAt: boundedText(input.occurredAt, 'occurredAt', 64),
    sourceTurnId: boundedText(input.context.turnId, 'context.turnId', 256),
    sourceMessageRefs: input.candidate.sourceMessageRefs,
    causalPredecessorEventIds: input.candidate.causalPredecessorEventIds,
    facts: input.candidate.facts,
    characterInterpretation: input.candidate.characterInterpretation,
    salience: input.candidate.salience,
    confidence: input.candidate.confidence,
  });
}

function eventRelationshipRelevance(eventKind: SeyeonExperimentalEventKindV2): number {
  switch (eventKind) {
    case 'SPECIALNESS_INVALIDATED':
    case 'CONFLICT_EVENT':
    case 'RECONCILIATION_EVENT':
      return 1;
    case 'SEYEON_REQUESTED_HELP':
    case 'SEYEON_ADMITTED_WAITING':
    case 'PROMISE_KEPT':
    case 'PROMISE_BROKEN':
      return 0.9;
    case 'USER_REMEMBERED_SEYEON_DETAIL':
    case 'SEYEON_ACCEPTED_HELP':
    case 'SEYEON_SELF_DISCLOSED':
      return 0.8;
    case 'PROMISE_MADE':
    case 'RETURNED_AFTER_ABSENCE':
      return 0.65;
  }
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function rankSeyeonEventRetrievalV2(input: {
  readonly events: readonly SeyeonRelationshipEventV2[];
  readonly semanticRelevanceByEventId: Readonly<Record<string, number>>;
  readonly now: string;
  readonly unresolvedConflictEventIds?: readonly string[];
  readonly recentlyMentionedEventIds?: readonly string[];
  readonly limit?: number;
}): readonly SeyeonEventRetrievalCandidateV2[] {
  const nowEpoch = Date.parse(input.now);
  if (!Number.isFinite(nowEpoch)) {
    throw new SeyeonEventExtractionErrorV2('now must be an ISO-compatible instant.');
  }
  const limit = input.limit ?? 8;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 32) {
    throw new SeyeonEventExtractionErrorV2('limit must be between 1 and 32.');
  }

  const unresolved = new Set(input.unresolvedConflictEventIds ?? []);
  const recentlyMentioned = new Set(input.recentlyMentionedEventIds ?? []);

  const ranked = input.events.map((event) => {
    const semanticRelevance = boundedUnit(
      input.semanticRelevanceByEventId[event.eventId] ?? 0,
      `semanticRelevanceByEventId.${event.eventId}`,
    );
    const relationshipRelevance = eventRelationshipRelevance(event.eventKind);
    const unresolvedConflictBonus = unresolved.has(event.eventId) ? 1 : 0;
    const eventEpoch = Date.parse(event.occurredAt);
    if (!Number.isFinite(eventEpoch)) {
      throw new SeyeonEventExtractionErrorV2(
        `event ${event.eventId} occurredAt is invalid.`,
      );
    }
    const ageDays = Math.max(0, (nowEpoch - eventEpoch) / 86_400_000);
    const recencyScore = clampUnit(1 / (1 + ageDays / 30));
    const repetitionPenalty = recentlyMentioned.has(event.eventId) ? 1 : 0;

    const finalScore =
      semanticRelevance * 0.42 +
      event.salience * 0.2 +
      relationshipRelevance * 0.18 +
      unresolvedConflictBonus * 0.14 +
      recencyScore * 0.06 -
      repetitionPenalty * 0.2;

    return Object.freeze({
      event,
      semanticRelevance,
      relationshipRelevance,
      unresolvedConflictBonus,
      recencyScore,
      repetitionPenalty,
      finalScore,
    });
  });

  ranked.sort(
    (left, right) =>
      right.finalScore - left.finalScore ||
      right.event.salience - left.event.salience ||
      right.event.occurredAt.localeCompare(left.event.occurredAt) ||
      left.event.eventId.localeCompare(right.event.eventId),
  );

  return Object.freeze(ranked.slice(0, limit));
}