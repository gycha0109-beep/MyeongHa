// Watchtower-Track: character-memory
// Deterministic multi-session, cross-Subject-safe evaluation of existing
// offline retrieval + exact serialized context. No new Memory or Provider call.
import {
  evaluateCharacterMemoryContextOfflineV1,
  type CharacterMemoryContextOfflineEvalCaseV1,
  type CharacterMemoryContextOfflineEvalResultV1,
} from './character-memory-context-offline-evaluation-v1.js';
import type { CharacterContextScopeV1 } from './character-dynamic-context-composer-v1.js';

export const CHARACTER_MEMORY_MULTI_SESSION_OFFLINE_EVAL_VERSION_V1 =
  'character-memory-multi-session-offline-eval-v1' as const;

export interface CharacterMemoryMultiSessionOfflineTurnV1<TRequest> {
  /** Fixture-only session label, not evidence of a Production session. */
  readonly sessionId: string;
  readonly turnOrdinal: number;
  readonly evaluationCase: CharacterMemoryContextOfflineEvalCaseV1<TRequest>;
}

export interface CharacterMemoryMultiSessionOfflineInputV1<TRequest> {
  readonly scenarioId: string;
  readonly expectedScope: CharacterContextScopeV1;
  readonly turns: readonly CharacterMemoryMultiSessionOfflineTurnV1<TRequest>[];
}

export interface CharacterMemoryMultiSessionOfflineReportV1 {
  readonly schemaVersion: typeof CHARACTER_MEMORY_MULTI_SESSION_OFFLINE_EVAL_VERSION_V1;
  readonly executionMode: 'offline_fixture_only';
  readonly scenarioId: string;
  readonly sessionCount: number;
  readonly turnCount: number;
  readonly passed: boolean;
  /** Number of gold-relevant memory sources repeated in a later session. */
  readonly expectedCrossSessionRecalls: number;
  /** Number of gold callbacks actually delivered in independently verified model-request memory. */
  readonly successfulCrossSessionRecalls: number;
  /** Strictly compares independent original source gold across sessions. */
  readonly repeatedMemorySourceLineagePreserved: boolean;
  /** Same canonical message identity may never change its original dialogue. */
  readonly repeatedCanonicalDialogueSourcePreserved: boolean;
  /** An original relationship-state event revision cannot be rewritten later. */
  readonly repeatedRelationshipEventSourcePreserved: boolean;
  /** Immutable original Relationship snapshot revisions agree across sessions. */
  readonly repeatedRelationshipStateRevisionPreserved: boolean;
  readonly perTurn: CharacterMemoryContextOfflineEvalResultV1;
}

function safeLabel(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value);
}

function sameScope(a: CharacterContextScopeV1, b: CharacterContextScopeV1): boolean {
  return a.subjectId === b.subjectId &&
    a.characterId === b.characterId &&
    a.threadId === b.threadId;
}

/**
 * Composes approved offline per-turn scores into a bounded multi-session
 * continuity score. Independent fixture gold, not model-generated content,
 * defines relevance at each point in time. A source is a callback only if the
 * gold explicitly marks it relevant in a DIFFERENT later session.
 *
 * This is retrieval-level continuity, NOT semantic multi-session reasoning,
 * durable consolidation, full Character persona, or model response grading.
 */
export function evaluateCharacterMemoryMultiSessionOfflineV1<TRequest>(
  input: CharacterMemoryMultiSessionOfflineInputV1<TRequest>,
): CharacterMemoryMultiSessionOfflineReportV1 {
  const turns: readonly CharacterMemoryMultiSessionOfflineTurnV1<TRequest>[] = input.turns;
  if (!safeLabel(input.scenarioId) ||
      !Array.isArray(input.turns) || turns.length < 2 || turns.length > 100 ||
      typeof input.expectedScope?.subjectId !== 'string' ||
      typeof input.expectedScope?.characterId !== 'string' ||
      typeof input.expectedScope?.threadId !== 'string') {
    throw new TypeError('Offline multi-session evaluation requires pinned scope and bounded turns.');
  }

  let lastOrdinal = 0;
  let lastAsOf = -Infinity;
  let lastCanonicalSequence = 0;
  const seenCanonicalTurnIds = new Set<string>();
  type CanonicalDialogueGold = Readonly<{
    messageId: string;
    sequenceNo: number;
    role: 'user' | 'assistant';
    speakerCharacterId: string | null;
    createdAt: string;
    text: string;
  }>;
  const canonicalDialogueById = new Map<string, CanonicalDialogueGold>();
  let repeatedCanonicalDialogueSourcePreserved = true;
  type OriginalRelationshipEvent = CharacterMemoryContextOfflineEvalCaseV1<TRequest>[
    'expectedOriginalRelationshipEvents'
  ][number];
  const relationshipEventByStateAndRevision = new Map<string, OriginalRelationshipEvent>();
  let repeatedRelationshipEventSourcePreserved = true;
  type OriginalRelationshipState = Readonly<{
    stateId: string;
    characterId: string;
    revision: number;
    closeness: number;
    trust: number;
    friction: number;
    relationshipStage: string;
    policyVersion: string;
    lastInteractionAt: string | null;
    updatedAt: string;
  }>;
  const relationshipStateByRevision = new Map<string, OriginalRelationshipState>();
  const latestRevisionByRelationshipState = new Map<string, number>();
  let repeatedRelationshipStateRevisionPreserved = true;
  let currentSession = '';
  const closedSessions = new Set<string>();
  const sessionIds = new Set<string>();
  const firstSeenInSession = new Map<string, string>();
  let expectedCrossSessionRecalls = 0;
  const callbacks: Array<Readonly<{ index: number; sourceRef: string }>> = [];
  for (const [index, turn] of turns.entries()) {
    const sessionId = turn.sessionId;
    const evidence = turn.evaluationCase;
    const time = Date.parse(evidence?.asOf);
    // Derive the original User-turn identity from *independently pinned*
    // protected fixture gold, not from the retrieval or Composer outputs.
    // Distinct offline sessions cannot reuse a canonical message ID or move
    // backwards in a single Subject/Character/thread message sequence.
    const pinnedState = evidence?.expectedProtectedSegments?.find(segment =>
      segment.layer === 'current_turn_state');
    const pinnedTurn = evidence?.expectedProtectedSegments?.find(segment =>
      segment.layer === 'current_turn');
    let parsedTurnState: unknown;
    try {
      parsedTurnState = JSON.parse(pinnedState?.text ?? '');
    } catch {
      // Malformed original-turn gold fails the input guard below.
    }
    const originalTurn = parsedTurnState !== null &&
      typeof parsedTurnState === 'object' && !Array.isArray(parsedTurnState)
      ? parsedTurnState as Record<string, unknown> : null;
    const canonicalId = originalTurn?.messageId;
    const canonicalSequence = originalTurn?.sequenceNo;
    const canonicalCreatedAt = originalTurn?.createdAt;
    if (!safeLabel(sessionId) ||
        !Number.isSafeInteger(turn.turnOrdinal) ||
        turn.turnOrdinal <= lastOrdinal ||
        !Number.isFinite(time) || time <= lastAsOf ||
        !sameScope(input.expectedScope, evidence.scope) ||
        !sameScope(input.expectedScope, evidence.retrieval.scope) ||
        !sameScope(input.expectedScope, evidence.context.scope) ||
        closedSessions.has(sessionId) ||
        originalTurn?.role !== 'user' ||
        typeof canonicalId !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,255}$/.test(canonicalId) ||
        !Number.isSafeInteger(canonicalSequence) ||
        (canonicalSequence as number) <= lastCanonicalSequence ||
        canonicalCreatedAt !== evidence.asOf ||
        pinnedState?.sourceRef !== 'turn:' + canonicalId + ':state' ||
        pinnedTurn?.sourceRef !== 'message:' + canonicalId ||
        !Array.isArray(evidence.expectedOriginalDialogue) ||
        seenCanonicalTurnIds.has(canonicalId)) {
      throw new TypeError('Multi-session evaluation cannot combine stale, foreign or reordered turns.');
    }
    if (currentSession !== '' && currentSession !== sessionId) {
      closedSessions.add(currentSession);
    }
    currentSession = sessionId;
    sessionIds.add(sessionId);
    seenCanonicalTurnIds.add(canonicalId as string);
    lastCanonicalSequence = canonicalSequence as number;
    lastOrdinal = turn.turnOrdinal;
    lastAsOf = time;

    // Per-turn gold can be internally coherent yet silently rewrite an old
    // message in a later session. Compare every original message's immutable
    // source fields across sessions, including the original current User turn
    // when it later appears as historical dialogue. This is independent of
    // assembled Context or retrieved claims, and reports no private prose.
    const canonicalCurrent: CanonicalDialogueGold = {
      messageId: canonicalId as string,
      sequenceNo: canonicalSequence as number,
      role: 'user',
      speakerCharacterId: null,
      createdAt: canonicalCreatedAt as string,
      text: pinnedTurn!.text,
    };
    for (const message of [...evidence.expectedOriginalDialogue, canonicalCurrent]) {
      const prior = canonicalDialogueById.get(message.messageId);
      if (prior === undefined) {
        canonicalDialogueById.set(message.messageId, message);
      } else if (
        prior.sequenceNo !== message.sequenceNo ||
        prior.role !== message.role ||
        prior.speakerCharacterId !== message.speakerCharacterId ||
        prior.createdAt !== message.createdAt ||
        prior.text !== message.text
      ) {
        repeatedCanonicalDialogueSourcePreserved = false;
      }
    }

    // Source event revisions are meaningful only within the original pinned
    // relationship STATE. Comparing revision alone would falsely conflate
    // unrelated relationship states; comparing a mutable Composer segment
    // would allow coordinated source-gold rewrites to evade this audit.
    const relationshipSource = evidence.expectedProtectedSegments.find(
      segment => segment.layer === 'current_relationship',
    );
    let relationshipStateId: string | null = null;
    let originalRelationship: OriginalRelationshipState | null = null;
    if (relationshipSource !== undefined) {
      try {
        const source: unknown = JSON.parse(relationshipSource.text);
        if (source !== null && typeof source === 'object' &&
            !Array.isArray(source)) {
          const value = source as Record<string, unknown>;
          if (typeof value.stateId === 'string' &&
              value.stateId.length > 0 && value.stateId.length <= 256 &&
              value.characterId === input.expectedScope.characterId &&
              Number.isSafeInteger(value.revision) &&
              (value.revision as number) >= 1 &&
              ['closeness', 'trust', 'friction'].every(field =>
                typeof value[field] === 'number' && Number.isFinite(value[field])) &&
              typeof value.relationshipStage === 'string' &&
              value.relationshipStage.length > 0 &&
              typeof value.policyVersion === 'string' &&
              value.policyVersion.length > 0 &&
              typeof value.updatedAt === 'string' &&
              Number.isFinite(Date.parse(value.updatedAt)) &&
              (value.lastInteractionAt === null ||
                (typeof value.lastInteractionAt === 'string' &&
                 Number.isFinite(Date.parse(value.lastInteractionAt))))) {
            relationshipStateId = value.stateId;
            originalRelationship = value as OriginalRelationshipState;
          }
        }
      } catch {
        // Bad independent source gold is not authoritative evidence.
      }
    }
    // A snapshot revision is immutable even when both independent per-turn
    // fixtures and their serialized requests have been rewritten coherently.
    // A genuinely newer revision may change scores/stage; a stale revision
    // for the SAME state must not reappear in later synthetic sessions.
    if (relationshipSource !== undefined && originalRelationship === null ||
        originalRelationship === null &&
          originalTurn?.relationshipRevision != null ||
        originalRelationship !== null &&
          originalTurn?.relationshipRevision !== originalRelationship.revision) {
      repeatedRelationshipStateRevisionPreserved = false;
    }
    if (originalRelationship !== null && relationshipStateId !== null) {
      // Keep the parsed source snapshot const while comparing field callbacks;
      // the mutable parser local must not leak nullable type into the closure.
      const snapshot = originalRelationship;
      const key = JSON.stringify([
        relationshipStateId, snapshot.revision,
      ]);
      const prior = relationshipStateByRevision.get(key);
      const lastRevision = latestRevisionByRelationshipState.get(relationshipStateId);
      if (lastRevision !== undefined &&
          snapshot.revision < lastRevision) {
        repeatedRelationshipStateRevisionPreserved = false;
      }
      const fields = [
        'characterId', 'closeness', 'trust', 'friction',
        'relationshipStage', 'policyVersion', 'lastInteractionAt', 'updatedAt',
      ] as const satisfies readonly (keyof OriginalRelationshipState)[];
      if (prior !== undefined &&
          fields.some(field => prior[field] !== snapshot[field])) {
        repeatedRelationshipStateRevisionPreserved = false;
      }
      if (prior === undefined) relationshipStateByRevision.set(key, snapshot);
      latestRevisionByRelationshipState.set(
        relationshipStateId,
        Math.max(lastRevision ?? 0, snapshot.revision),
      );
    }
    if (evidence.expectedOriginalRelationshipEvents.length > 0 &&
        relationshipStateId === null) {
      repeatedRelationshipEventSourcePreserved = false;
    }
    for (const event of evidence.expectedOriginalRelationshipEvents) {
      if (relationshipStateId === null) break;
      const key = JSON.stringify([relationshipStateId, event.stateRevisionAfter]);
      const original = relationshipEventByStateAndRevision.get(key);
      if (original === undefined) {
        relationshipEventByStateAndRevision.set(key, event);
      } else if (
        original.eventType !== event.eventType ||
        original.eventSchemaVersion !== event.eventSchemaVersion ||
        original.policyVersion !== event.policyVersion ||
        original.appliedAt !== event.appliedAt
      ) {
        repeatedRelationshipEventSourcePreserved = false;
      }
    }

    const goldRefs = evidence.expectedRelevantMemorySourceRefs;
    for (const ref of goldRefs) {
      const earlierSession = firstSeenInSession.get(ref);
      if (earlierSession !== undefined && earlierSession !== sessionId) {
        expectedCrossSessionRecalls += 1;
        callbacks.push({ index, sourceRef: ref });
      }
      if (earlierSession === undefined) firstSeenInSession.set(ref, sessionId);
    }
  }
  if (sessionIds.size < 2) {
    throw new TypeError('Multi-session evaluation needs at least two distinct synthetic sessions.');
  }
  const perTurn = evaluateCharacterMemoryContextOfflineV1(
    turns.map(turn => turn.evaluationCase),
  );
  // A memory sourceRef is a record+grant identity, not a mutable versioned
  // anecdote. Independent gold for that SAME identity must agree across all
  // turns; a newer/corrected Life Fact needs its own source identity. Do not
  // infer authority for silent rewrites or award continuity on two mutually
  // inconsistent, individually self-consistent synthetic session fixtures.
  type SourceGold = CharacterMemoryContextOfflineEvalCaseV1<TRequest>[
    'expectedRetrievedMemoryClaims'
  ][number];
  const stableFields = [
    'recordKind', 'claimKind', 'sourceKind', 'effectiveAt', 'summary',
    'recordId', 'recordType', 'schemaVersion', 'projectorVersion',
    'grantId', 'granteeCharacterId', 'grantReason', 'grantedAt',
    'sourceTurnId', 'sourceMessageId', 'sourceMergeActionId',
    'createdAt', 'createdByCharacterId', 'confirmedAt',
    'validFrom', 'validTo',
  ] as const satisfies readonly (keyof SourceGold)[];
  const originalGoldBySource = new Map<string, SourceGold>();
  const inconsistentSourceRefs = new Set<string>();
  for (const turn of turns) {
    for (const claim of turn.evaluationCase.expectedRetrievedMemoryClaims) {
      const original = originalGoldBySource.get(claim.sourceRef);
      if (original === undefined) {
        originalGoldBySource.set(claim.sourceRef, claim);
      } else if (stableFields.some(field => original[field] !== claim[field])) {
        inconsistentSourceRefs.add(claim.sourceRef);
      }
    }
  }
  const repeatedMemorySourceLineagePreserved = inconsistentSourceRefs.size === 0;
  // Search hits alone do not demonstrate delivery. An exact-request budget
  // drop can remove a permitted Memory after successful retrieval. A callback
  // counts only when the turn's independently validated serialized request
  // contains that Memory and all its source/provenance checks passed.
  const successfulCrossSessionRecalls = callbacks.filter(({ index, sourceRef }) => {
    const evidence = turns[index]?.evaluationCase;
    return perTurn.cases[index]?.passed === true &&
      repeatedCanonicalDialogueSourcePreserved &&
      repeatedRelationshipEventSourcePreserved &&
      repeatedRelationshipStateRevisionPreserved &&
      !inconsistentSourceRefs.has(sourceRef) &&
      evidence?.retrieval.records.some(item => item.record.sourceRef === sourceRef) === true &&
      evidence.context.segments.some(segment =>
        segment.layer === 'retrieved_memory' && segment.sourceRef === sourceRef);
  }).length;
  return Object.freeze({
    schemaVersion: CHARACTER_MEMORY_MULTI_SESSION_OFFLINE_EVAL_VERSION_V1,
    executionMode: 'offline_fixture_only' as const,
    scenarioId: input.scenarioId,
    sessionCount: sessionIds.size,
    turnCount: turns.length,
    passed: perTurn.failedCount === 0 &&
      repeatedMemorySourceLineagePreserved &&
      repeatedCanonicalDialogueSourcePreserved &&
      repeatedRelationshipEventSourcePreserved &&
      repeatedRelationshipStateRevisionPreserved &&
      expectedCrossSessionRecalls === successfulCrossSessionRecalls,
    expectedCrossSessionRecalls,
    successfulCrossSessionRecalls,
    repeatedMemorySourceLineagePreserved,
    repeatedCanonicalDialogueSourcePreserved,
    repeatedRelationshipEventSourcePreserved,
    repeatedRelationshipStateRevisionPreserved,
    perTurn,
  });
}
