export const SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2 =
  'seyeon-event-ledger-exp-v2' as const;
export const SEYEON_RELATIONSHIP_PROJECTION_SCHEMA_VERSION_V2 =
  'seyeon-relationship-projection-exp-v2' as const;
export const SEYEON_RELATIONSHIP_EVIDENCE_POLICY_VERSION_V2 =
  'seyeon-relationship-evidence-policy-exp-v0.1' as const;

export const SEYEON_EXPERIMENTAL_EVENT_KINDS_V2 = Object.freeze([
  'PROMISE_MADE',
  'PROMISE_KEPT',
  'PROMISE_BROKEN',
  'USER_REMEMBERED_SEYEON_DETAIL',
  'SEYEON_ACCEPTED_HELP',
  'SEYEON_REQUESTED_HELP',
  'SEYEON_SELF_DISCLOSED',
  'SEYEON_ADMITTED_WAITING',
  'SPECIALNESS_INVALIDATED',
  'CONFLICT_EVENT',
  'RECONCILIATION_EVENT',
  'RETURNED_AFTER_ABSENCE',
] as const);

export type SeyeonExperimentalEventKindV2 =
  (typeof SEYEON_EXPERIMENTAL_EVENT_KINDS_V2)[number];

export interface SeyeonEventFactV2 {
  readonly factKey: string;
  readonly statement: string;
  readonly sourceRefs: readonly string[];
}

export interface SeyeonCharacterInterpretationV2 {
  readonly statement: string;
  readonly confidence: number;
  readonly sourceRefs: readonly string[];
}

export interface SeyeonRelationshipEventV2 {
  readonly schemaVersion: typeof SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2;
  readonly authority: 'experimental_non_canonical_event';
  readonly eventId: string;
  readonly dedupeKey: string;
  readonly characterId: 'seyeon';
  readonly eventKind: SeyeonExperimentalEventKindV2;
  readonly occurredAt: string;
  readonly sourceTurnId: string;
  readonly sourceMessageRefs: readonly string[];
  readonly facts: readonly SeyeonEventFactV2[];
  readonly characterInterpretation: SeyeonCharacterInterpretationV2 | null;
  readonly salience: number;
  readonly confidence: number;
}

export interface SeyeonEventCorrectionV2 {
  readonly schemaVersion: typeof SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2;
  readonly authority: 'experimental_non_canonical_event';
  readonly action: 'correct';
  readonly ledgerEntryId: string;
  readonly dedupeKey: string;
  readonly targetEventId: string;
  readonly replacementEvent: SeyeonRelationshipEventV2;
  readonly reason: string;
  readonly sourceRefs: readonly string[];
  readonly recordedAt: string;
}

export interface SeyeonEventRetractionV2 {
  readonly schemaVersion: typeof SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2;
  readonly authority: 'experimental_non_canonical_event';
  readonly action: 'retract';
  readonly ledgerEntryId: string;
  readonly dedupeKey: string;
  readonly targetEventId: string;
  readonly reason: string;
  readonly sourceRefs: readonly string[];
  readonly recordedAt: string;
}

export type SeyeonEventLedgerEntryV2 =
  | Readonly<{
      readonly schemaVersion: typeof SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2;
      readonly authority: 'experimental_non_canonical_event';
      readonly action: 'record';
      readonly ledgerEntryId: string;
      readonly dedupeKey: string;
      readonly event: SeyeonRelationshipEventV2;
      readonly recordedAt: string;
    }>
  | SeyeonEventCorrectionV2
  | SeyeonEventRetractionV2;

export type SeyeonConflictStateV2 =
  | 'none'
  | 'open'
  | 'repairing'
  | 'resolved_recently';

export type SeyeonRepairStateV2 =
  | 'none'
  | 'needed'
  | 'in_progress'
  | 'completed';

export interface SeyeonRelationshipProjectionV2 {
  readonly schemaVersion: typeof SEYEON_RELATIONSHIP_PROJECTION_SCHEMA_VERSION_V2;
  readonly authority: 'derived_experimental_projection';
  readonly characterId: 'seyeon';
  readonly policyVersion: typeof SEYEON_RELATIONSHIP_EVIDENCE_POLICY_VERSION_V2;
  readonly revision: number;
  readonly evidence: Readonly<{
    readonly familiarity: number;
    readonly trust: number;
    readonly reciprocity: number;
    readonly disclosure: number;
    readonly agencyRespect: number;
  }>;
  readonly conflictState: SeyeonConflictStateV2;
  readonly repairState: SeyeonRepairStateV2;
  readonly causalEventIds: Readonly<{
    readonly familiarity: readonly string[];
    readonly trust: readonly string[];
    readonly reciprocity: readonly string[];
    readonly disclosure: readonly string[];
    readonly agencyRespect: readonly string[];
    readonly conflict: readonly string[];
    readonly repair: readonly string[];
  }>;
  readonly lastMeaningfulEventAt: string | null;
}

export class SeyeonEventLedgerErrorV2 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeyeonEventLedgerErrorV2';
  }
}

function boundedText(value: string, path: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new SeyeonEventLedgerErrorV2(
      `${path} must be non-empty text within ${maxLength} characters.`,
    );
  }
  return normalized;
}

function boundedUnit(value: number, path: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new SeyeonEventLedgerErrorV2(`${path} must be between 0 and 1.`);
  }
  return value;
}

function parseIsoInstant(value: string, path: string): string {
  const normalized = boundedText(value, path, 64);
  const epoch = Date.parse(normalized);
  if (!Number.isFinite(epoch)) {
    throw new SeyeonEventLedgerErrorV2(`${path} must be an ISO-compatible instant.`);
  }
  return new Date(epoch).toISOString();
}

function uniqueRefs(
  refs: readonly string[],
  path: string,
  maxLength: number,
): readonly string[] {
  if (refs.length === 0 || refs.length > maxLength) {
    throw new SeyeonEventLedgerErrorV2(
      `${path} must contain between 1 and ${maxLength} refs.`,
    );
  }
  const normalized = refs.map((ref, index) =>
    boundedText(ref, `${path}[${index}]`, 512),
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new SeyeonEventLedgerErrorV2(`${path} must not contain duplicates.`);
  }
  return Object.freeze(normalized);
}

function validateEventKind(
  value: SeyeonExperimentalEventKindV2,
): SeyeonExperimentalEventKindV2 {
  if (!SEYEON_EXPERIMENTAL_EVENT_KINDS_V2.includes(value)) {
    throw new SeyeonEventLedgerErrorV2(
      'eventKind is not part of the Se-yeon experimental event vocabulary.',
    );
  }
  return value;
}

function validateEvent(event: SeyeonRelationshipEventV2): SeyeonRelationshipEventV2 {
  if (event.schemaVersion !== SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2) {
    throw new SeyeonEventLedgerErrorV2('event.schemaVersion is invalid.');
  }
  if (event.authority !== 'experimental_non_canonical_event') {
    throw new SeyeonEventLedgerErrorV2(
      'Se-yeon event must remain explicitly experimental/non-canonical.',
    );
  }
  if (event.characterId !== 'seyeon') {
    throw new SeyeonEventLedgerErrorV2('Se-yeon ledger accepts only seyeon events.');
  }
  if (event.facts.length === 0 || event.facts.length > 12) {
    throw new SeyeonEventLedgerErrorV2(
      'event.facts must contain between 1 and 12 source-backed facts.',
    );
  }

  const facts = Object.freeze(
    event.facts.map((fact, index) =>
      Object.freeze({
        factKey: boundedText(fact.factKey, `event.facts[${index}].factKey`, 128),
        statement: boundedText(
          fact.statement,
          `event.facts[${index}].statement`,
          1200,
        ),
        sourceRefs: uniqueRefs(
          fact.sourceRefs,
          `event.facts[${index}].sourceRefs`,
          8,
        ),
      }),
    ),
  );

  const characterInterpretation =
    event.characterInterpretation === null
      ? null
      : Object.freeze({
          statement: boundedText(
            event.characterInterpretation.statement,
            'event.characterInterpretation.statement',
            1200,
          ),
          confidence: boundedUnit(
            event.characterInterpretation.confidence,
            'event.characterInterpretation.confidence',
          ),
          sourceRefs: uniqueRefs(
            event.characterInterpretation.sourceRefs,
            'event.characterInterpretation.sourceRefs',
            8,
          ),
        });

  return Object.freeze({
    schemaVersion: SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2,
    authority: 'experimental_non_canonical_event' as const,
    eventId: boundedText(event.eventId, 'event.eventId', 256),
    dedupeKey: boundedText(event.dedupeKey, 'event.dedupeKey', 256),
    characterId: 'seyeon' as const,
    eventKind: validateEventKind(event.eventKind),
    occurredAt: parseIsoInstant(event.occurredAt, 'event.occurredAt'),
    sourceTurnId: boundedText(event.sourceTurnId, 'event.sourceTurnId', 256),
    sourceMessageRefs: uniqueRefs(
      event.sourceMessageRefs,
      'event.sourceMessageRefs',
      16,
    ),
    facts,
    characterInterpretation,
    salience: boundedUnit(event.salience, 'event.salience'),
    confidence: boundedUnit(event.confidence, 'event.confidence'),
  });
}

function eventPolicy(eventKind: SeyeonExperimentalEventKindV2) {
  switch (eventKind) {
    case 'PROMISE_MADE':
      return { familiarity: 1, trust: 0, reciprocity: 0, disclosure: 0, agencyRespect: 0 } as const;
    case 'PROMISE_KEPT':
      return { familiarity: 1, trust: 2, reciprocity: 1, disclosure: 0, agencyRespect: 0 } as const;
    case 'PROMISE_BROKEN':
      return { familiarity: 0, trust: -2, reciprocity: -1, disclosure: 0, agencyRespect: 0 } as const;
    case 'USER_REMEMBERED_SEYEON_DETAIL':
      return { familiarity: 1, trust: 1, reciprocity: 2, disclosure: 0, agencyRespect: 0 } as const;
    case 'SEYEON_ACCEPTED_HELP':
      return { familiarity: 1, trust: 1, reciprocity: 2, disclosure: 1, agencyRespect: 0 } as const;
    case 'SEYEON_REQUESTED_HELP':
      return { familiarity: 1, trust: 2, reciprocity: 1, disclosure: 2, agencyRespect: 0 } as const;
    case 'SEYEON_SELF_DISCLOSED':
      return { familiarity: 1, trust: 1, reciprocity: 0, disclosure: 1, agencyRespect: 0 } as const;
    case 'SEYEON_ADMITTED_WAITING':
      return { familiarity: 1, trust: 1, reciprocity: 1, disclosure: 2, agencyRespect: 0 } as const;
    case 'SPECIALNESS_INVALIDATED':
      return { familiarity: 0, trust: -2, reciprocity: -1, disclosure: 0, agencyRespect: 0 } as const;
    case 'CONFLICT_EVENT':
      return { familiarity: 0, trust: -1, reciprocity: 0, disclosure: 0, agencyRespect: 0 } as const;
    case 'RECONCILIATION_EVENT':
      return { familiarity: 1, trust: 1, reciprocity: 1, disclosure: 0, agencyRespect: 1 } as const;
    case 'RETURNED_AFTER_ABSENCE':
      return { familiarity: 1, trust: 0, reciprocity: 1, disclosure: 0, agencyRespect: 0 } as const;
  }
}

function clampEvidence(value: number): number {
  return Math.max(-12, Math.min(12, value));
}

function emptyProjection(): SeyeonRelationshipProjectionV2 {
  return Object.freeze({
    schemaVersion: SEYEON_RELATIONSHIP_PROJECTION_SCHEMA_VERSION_V2,
    authority: 'derived_experimental_projection' as const,
    characterId: 'seyeon' as const,
    policyVersion: SEYEON_RELATIONSHIP_EVIDENCE_POLICY_VERSION_V2,
    revision: 0,
    evidence: Object.freeze({
      familiarity: 0,
      trust: 0,
      reciprocity: 0,
      disclosure: 0,
      agencyRespect: 0,
    }),
    conflictState: 'none' as const,
    repairState: 'none' as const,
    causalEventIds: Object.freeze({
      familiarity: Object.freeze([]),
      trust: Object.freeze([]),
      reciprocity: Object.freeze([]),
      disclosure: Object.freeze([]),
      agencyRespect: Object.freeze([]),
      conflict: Object.freeze([]),
      repair: Object.freeze([]),
    }),
    lastMeaningfulEventAt: null,
  });
}

function appendCausal(
  existing: readonly string[],
  eventId: string,
  changed: boolean,
): readonly string[] {
  return changed ? Object.freeze([...existing, eventId]) : existing;
}

export function reduceSeyeonRelationshipProjectionV2(
  events: readonly SeyeonRelationshipEventV2[],
): SeyeonRelationshipProjectionV2 {
  let projection = emptyProjection();

  for (const rawEvent of events) {
    const event = validateEvent(rawEvent);
    const effect = eventPolicy(event.eventKind);
    const weighted = event.confidence >= 0.5 && event.salience >= 0.35;

    const familiarityDelta = weighted ? effect.familiarity : 0;
    const trustDelta = weighted ? effect.trust : 0;
    const reciprocityDelta = weighted ? effect.reciprocity : 0;
    const disclosureDelta = weighted ? effect.disclosure : 0;
    const agencyRespectDelta = weighted ? effect.agencyRespect : 0;

    let conflictState = projection.conflictState;
    let repairState = projection.repairState;
    let conflictChanged = false;
    let repairChanged = false;

    if (weighted) {
      if (
        event.eventKind === 'CONFLICT_EVENT' ||
        event.eventKind === 'PROMISE_BROKEN' ||
        event.eventKind === 'SPECIALNESS_INVALIDATED'
      ) {
        conflictState = 'open';
        repairState = 'needed';
        conflictChanged = true;
        repairChanged = true;
      } else if (event.eventKind === 'RECONCILIATION_EVENT') {
        conflictState = projection.conflictState === 'open'
          ? 'resolved_recently'
          : projection.conflictState;
        repairState = 'completed';
        conflictChanged = projection.conflictState === 'open';
        repairChanged = true;
      }
    }

    projection = Object.freeze({
      ...projection,
      revision: projection.revision + 1,
      evidence: Object.freeze({
        familiarity: clampEvidence(
          projection.evidence.familiarity + familiarityDelta,
        ),
        trust: clampEvidence(projection.evidence.trust + trustDelta),
        reciprocity: clampEvidence(
          projection.evidence.reciprocity + reciprocityDelta,
        ),
        disclosure: clampEvidence(
          projection.evidence.disclosure + disclosureDelta,
        ),
        agencyRespect: clampEvidence(
          projection.evidence.agencyRespect + agencyRespectDelta,
        ),
      }),
      conflictState,
      repairState,
      causalEventIds: Object.freeze({
        familiarity: appendCausal(
          projection.causalEventIds.familiarity,
          event.eventId,
          familiarityDelta !== 0,
        ),
        trust: appendCausal(
          projection.causalEventIds.trust,
          event.eventId,
          trustDelta !== 0,
        ),
        reciprocity: appendCausal(
          projection.causalEventIds.reciprocity,
          event.eventId,
          reciprocityDelta !== 0,
        ),
        disclosure: appendCausal(
          projection.causalEventIds.disclosure,
          event.eventId,
          disclosureDelta !== 0,
        ),
        agencyRespect: appendCausal(
          projection.causalEventIds.agencyRespect,
          event.eventId,
          agencyRespectDelta !== 0,
        ),
        conflict: appendCausal(
          projection.causalEventIds.conflict,
          event.eventId,
          conflictChanged,
        ),
        repair: appendCausal(
          projection.causalEventIds.repair,
          event.eventId,
          repairChanged,
        ),
      }),
      lastMeaningfulEventAt: weighted
        ? event.occurredAt
        : projection.lastMeaningfulEventAt,
    });
  }

  return projection;
}

export class InMemorySeyeonEventLedgerV2 {
  readonly #entries: SeyeonEventLedgerEntryV2[] = [];
  readonly #dedupeKeys = new Set<string>();
  readonly #knownEventIds = new Set<string>();

  appendEvent(input: {
    readonly ledgerEntryId: string;
    readonly recordedAt: string;
    readonly event: SeyeonRelationshipEventV2;
  }): SeyeonEventLedgerEntryV2 {
    const event = validateEvent(input.event);
    const ledgerEntryId = boundedText(input.ledgerEntryId, 'ledgerEntryId', 256);
    const recordedAt = parseIsoInstant(input.recordedAt, 'recordedAt');

    if (this.#dedupeKeys.has(event.dedupeKey)) {
      return this.#entries.find((entry) => entry.dedupeKey === event.dedupeKey)!;
    }
    if (this.#knownEventIds.has(event.eventId)) {
      throw new SeyeonEventLedgerErrorV2('eventId must be unique in the ledger.');
    }

    const entry = Object.freeze({
      schemaVersion: SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2,
      authority: 'experimental_non_canonical_event' as const,
      action: 'record' as const,
      ledgerEntryId,
      dedupeKey: event.dedupeKey,
      event,
      recordedAt,
    });
    this.#entries.push(entry);
    this.#dedupeKeys.add(event.dedupeKey);
    this.#knownEventIds.add(event.eventId);
    return entry;
  }

  correctEvent(input: {
    readonly ledgerEntryId: string;
    readonly dedupeKey: string;
    readonly targetEventId: string;
    readonly replacementEvent: SeyeonRelationshipEventV2;
    readonly reason: string;
    readonly sourceRefs: readonly string[];
    readonly recordedAt: string;
  }): SeyeonEventLedgerEntryV2 {
    const dedupeKey = boundedText(input.dedupeKey, 'dedupeKey', 256);
    if (this.#dedupeKeys.has(dedupeKey)) {
      return this.#entries.find((entry) => entry.dedupeKey === dedupeKey)!;
    }
    const active = new Set(this.activeEvents().map((event) => event.eventId));
    const targetEventId = boundedText(input.targetEventId, 'targetEventId', 256);
    if (!active.has(targetEventId)) {
      throw new SeyeonEventLedgerErrorV2(
        'Correction target must be an active event.',
      );
    }

    const replacementEvent = validateEvent(input.replacementEvent);
    if (this.#knownEventIds.has(replacementEvent.eventId)) {
      throw new SeyeonEventLedgerErrorV2(
        'Replacement eventId must be new and unique.',
      );
    }

    const entry = Object.freeze({
      schemaVersion: SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2,
      authority: 'experimental_non_canonical_event' as const,
      action: 'correct' as const,
      ledgerEntryId: boundedText(input.ledgerEntryId, 'ledgerEntryId', 256),
      dedupeKey,
      targetEventId,
      replacementEvent,
      reason: boundedText(input.reason, 'reason', 1200),
      sourceRefs: uniqueRefs(input.sourceRefs, 'sourceRefs', 8),
      recordedAt: parseIsoInstant(input.recordedAt, 'recordedAt'),
    });
    this.#entries.push(entry);
    this.#dedupeKeys.add(dedupeKey);
    this.#knownEventIds.add(replacementEvent.eventId);
    return entry;
  }

  retractEvent(input: {
    readonly ledgerEntryId: string;
    readonly dedupeKey: string;
    readonly targetEventId: string;
    readonly reason: string;
    readonly sourceRefs: readonly string[];
    readonly recordedAt: string;
  }): SeyeonEventLedgerEntryV2 {
    const dedupeKey = boundedText(input.dedupeKey, 'dedupeKey', 256);
    if (this.#dedupeKeys.has(dedupeKey)) {
      return this.#entries.find((entry) => entry.dedupeKey === dedupeKey)!;
    }
    const active = new Set(this.activeEvents().map((event) => event.eventId));
    const targetEventId = boundedText(input.targetEventId, 'targetEventId', 256);
    if (!active.has(targetEventId)) {
      throw new SeyeonEventLedgerErrorV2(
        'Retraction target must be an active event.',
      );
    }

    const entry = Object.freeze({
      schemaVersion: SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2,
      authority: 'experimental_non_canonical_event' as const,
      action: 'retract' as const,
      ledgerEntryId: boundedText(input.ledgerEntryId, 'ledgerEntryId', 256),
      dedupeKey,
      targetEventId,
      reason: boundedText(input.reason, 'reason', 1200),
      sourceRefs: uniqueRefs(input.sourceRefs, 'sourceRefs', 8),
      recordedAt: parseIsoInstant(input.recordedAt, 'recordedAt'),
    });
    this.#entries.push(entry);
    this.#dedupeKeys.add(dedupeKey);
    return entry;
  }

  activeEvents(): readonly SeyeonRelationshipEventV2[] {
    const active = new Map<string, SeyeonRelationshipEventV2>();

    for (const entry of this.#entries) {
      if (entry.action === 'record') {
        active.set(entry.event.eventId, entry.event);
      } else if (entry.action === 'correct') {
        active.delete(entry.targetEventId);
        active.set(entry.replacementEvent.eventId, entry.replacementEvent);
      } else {
        active.delete(entry.targetEventId);
      }
    }

    return Object.freeze([...active.values()]);
  }

  projectRelationship(): SeyeonRelationshipProjectionV2 {
    return reduceSeyeonRelationshipProjectionV2(this.activeEvents());
  }

  get entries(): readonly SeyeonEventLedgerEntryV2[] {
    return Object.freeze([...this.#entries]);
  }
}
