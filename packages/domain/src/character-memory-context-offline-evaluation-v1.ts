// Watchtower-Track: character-memory
// Deterministic, source-scoped offline evaluation of already-built Context.
// No Provider/grader, DB reads, user data telemetry or metric thresholds.
import type {
  CharacterContextScopeV1,
  CharacterContextSegmentV1,
  CharacterDynamicContextComposerResultV1,
} from './character-dynamic-context-composer-v1.js';
import type {
  CharacterMemoryRetrievalResultV1,
} from './character-memory-retrieval-v1.js';
import type {
  CharacterWorkingMemoryRecentMessageV1,
  CharacterWorkingMemoryRelationshipEventSourceV1,
} from './character-working-memory-projection-v1.js';

export const CHARACTER_MEMORY_CONTEXT_OFFLINE_EVALUATION_VERSION_V1 =
  'character-memory-context-offline-evaluation-v1' as const;

export type CharacterMemoryContextOfflineEvalCaseV1<TRequest> = Readonly<{
  caseId: string;
  scope: CharacterContextScopeV1;
  /** Independent synthetic evaluation instant; equal to the pinned current turn time. */
  asOf: string;
  retrieval: CharacterMemoryRetrievalResultV1;
  context: CharacterDynamicContextComposerResultV1<TRequest>;
  /** Independent fixture decoder of final serialized request; no model dispatch. */
  inspectSerializedRequestSegments: (value: Readonly<{
    requestFormat: string;
    serializedRequestBody: string;
  }>) => unknown;
  /**
   * Independent server-pinned synthetic gold for every non-droppable source,
   * including the current turn and policy/Character core. This is not derived
   * from the context result or from the decoded model request.
   */
  expectedProtectedSegments: readonly CharacterContextSegmentV1[];
  /**
   * Independent, source-pinned canonical dialogue gold captured BEFORE the
   * final context/request is produced or mutated. Older dialogue is optional
   * under token pressure, but every included message must match its source.
   */
  expectedOriginalDialogue: readonly CharacterWorkingMemoryRecentMessageV1[];
  /**
   * Independently pinned original relationship event metadata; no causal
   * payload is inferred from the revision/event type. Optional under budget.
   */
  expectedOriginalRelationshipEvents:
    readonly CharacterWorkingMemoryRelationshipEventSourceV1[];
  /**
   * Independently pinned synthetic memory-source truth, captured BEFORE
   * mutating either retrieval, Composer segments or the serialized request.
   * Without this, coordinated edits of all three could fabricate biography.
   */
  expectedRetrievedMemoryClaims: readonly Readonly<{
    sourceRef: string;
    recordKind: string;
    claimKind: string;
    sourceKind: string;
    effectiveAt: string;
    summary: string;
    /** Independently pinned original record and grant lineage. */
    recordId: string;
    recordType: string;
    schemaVersion: string;
    projectorVersion: string;
    grantId: string;
    granteeCharacterId: string;
    grantReason: 'user_choice' | 'merge_import';
    grantedAt: string;
    sourceTurnId?: string | null | undefined;
    sourceMessageId: string | null;
    sourceMergeActionId: string | null;
    createdAt: string;
    createdByCharacterId?: string | null | undefined;
    confirmedAt?: string | undefined;
    validFrom?: string | null | undefined;
    validTo?: string | null | undefined;
  }>[];
  /** Externally supplied synthetic gold; the model never supplies security truth. */
  expectedRelevantMemorySourceRefs: readonly string[];
  /** Gold context selection after approved token pressure. */
  expectedIncludedMemorySourceRefs: readonly string[];
  forbiddenSourceRefs: readonly string[];
  /** Known synthetic private content that must never appear in diagnostics. */
  forbiddenTraceFragments: readonly string[];
}>;

export type CharacterMemoryContextOfflineEvalResultV1 = Readonly<{
  schemaVersion: typeof CHARACTER_MEMORY_CONTEXT_OFFLINE_EVALUATION_VERSION_V1;
  executionMode: 'offline_fixture_only';
  caseCount: number;
  passedCount: number;
  failedCount: number;
  cases: readonly Readonly<{
    caseId: string;
    passed: boolean;
    retrieval: Readonly<{
      truePositive: number;
      falsePositive: number;
      falseNegative: number;
      precision: number;
      recall: number;
    }>;
    contextMemory: Readonly<{
      expectedIncluded: number;
      unexpectedIncluded: number;
      missingIncluded: number;
    }>;
    checks: Readonly<{
      scopePinned: boolean;
      retrievalTraceMatchesSelection: boolean;
      serializedRequestSegmentsMatchContext: boolean;
      protectedSourceGoldPreserved: boolean;
      retrievalQueryTurnSourceGoldPreserved: boolean;
      originalDialogueSourcePreserved: boolean;
      originalRelationshipMetadataPreserved: boolean;
      independentMemorySourceClaimsPreserved: boolean;
      provenanceAndEpistemicLabelsPreserved: boolean;
      temporalEvidenceWithinAsOf: boolean;
      deniedSourcesAbsent: boolean;
      diagnosticsRedacted: boolean;
      exactRequestByteCountAndBudgetValid: boolean;
      dropOrderValid: boolean;
    }>;
  }>[];
}>;

const PROTECTED_CONTEXT_LAYERS_V1 = new Set<CharacterContextSegmentV1['layer']>([
  'system_safety_product',
  'character_core',
  'current_relationship',
  'current_turn',
  'current_turn_state',
  'integrity_claim_decision',
  'disclosure_decision',
  'response_task',
  'immediate_dialogue',
  'bible_core',
  'unresolved_causal_event',
]);

const ALWAYS_REQUIRED_LAYERS_V1 = [
  'system_safety_product',
  'character_core',
  'current_turn',
  'current_turn_state',
  'response_task',
] as const;

const DROP_PRIORITY_V1: Readonly<Record<string, number>> = Object.freeze({
  trivia: 0,
  bible_example: 1,
  resolved_low_salience_event: 2,
  repetition_suppression_hint: 3,
  relationship_event_metadata: 4,
  older_dialogue: 5,
  retrieved_memory: 6,
});

function sameScope(
  a: CharacterContextScopeV1,
  b: CharacterContextScopeV1,
): boolean {
  return a.subjectId === b.subjectId &&
    a.characterId === b.characterId &&
    a.threadId === b.threadId;
}

function requireUniqueRefs(values: readonly string[]): Set<string> {
  if (!Array.isArray(values) || values.some(value =>
    typeof value !== 'string' || value.length === 0 || value.length > 256)) {
    throw new TypeError('Offline evaluation requires bounded source identifiers.');
  }
  const refs = new Set(values);
  if (refs.size !== values.length) {
    throw new TypeError('Offline evaluation gold contains duplicate source identifiers.');
  }
  return refs;
}

function ratio(hit: number, total: number): number {
  return total === 0 ? 1 : hit / total;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeExactRequestSegments<TRequest>(
  item: CharacterMemoryContextOfflineEvalCaseV1<TRequest>,
): readonly CharacterContextSegmentV1[] | null {
  if (typeof item.inspectSerializedRequestSegments !== 'function') return null;
  let raw: unknown;
  try {
    raw = item.inspectSerializedRequestSegments({
      requestFormat: item.context.exactRequest.requestFormat,
      serializedRequestBody: item.context.exactRequest.serializedRequestBody,
    });
  } catch {
    return null;
  }
  const typed: readonly unknown[] = raw as readonly unknown[];
  if (!Array.isArray(raw) || typed.length === 0 || typed.length > 128 ||
      typed.some(x => !isRecord(x) || Object.keys(x).length !== 3 ||
        !Object.hasOwn(x, 'layer') || !Object.hasOwn(x, 'sourceRef') ||
        !Object.hasOwn(x, 'text') || typeof x.layer !== 'string' ||
        typeof x.sourceRef !== 'string' || typeof x.text !== 'string')) return null;
  return typed as readonly CharacterContextSegmentV1[];
}

/**
 * Evaluate frozen, already-composed offline test artifacts against independent
 * synthetic gold. Never self-grade from a generated answer and never return
 * user text, source summaries or exact serialized request bodies.
 */
export function evaluateCharacterMemoryContextOfflineV1<TRequest>(
  cases: readonly CharacterMemoryContextOfflineEvalCaseV1<TRequest>[],
): CharacterMemoryContextOfflineEvalResultV1 {
  // Preserve TypeScript's readonly, generic case type after the runtime
  // Array.isArray guard (which otherwise widens the mapped value to any[]).
  const typedCases: readonly CharacterMemoryContextOfflineEvalCaseV1<TRequest>[] = cases;
  if (!Array.isArray(cases) || cases.length === 0 || cases.length > 200) {
    throw new TypeError('Offline evaluation requires between 1 and 200 cases.');
  }
  const seen = new Set<string>();
  const results = typedCases.map(item => {
    if (typeof item.caseId !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(item.caseId) ||
        seen.has(item.caseId)) {
      throw new TypeError('Offline evaluation requires unique, safe case identifiers.');
    }
    seen.add(item.caseId);
    const relevant = requireUniqueRefs(item.expectedRelevantMemorySourceRefs);
    const expectedIncluded = requireUniqueRefs(item.expectedIncludedMemorySourceRefs);
    const forbidden = requireUniqueRefs(item.forbiddenSourceRefs);
    const typedFragments: readonly string[] = item.forbiddenTraceFragments;
    if ([...expectedIncluded].some(ref => !relevant.has(ref)) ||
        [...relevant].some(ref => forbidden.has(ref)) ||
        !Array.isArray(item.forbiddenTraceFragments) ||
        typedFragments.some(fragment =>
          typeof fragment !== 'string' || fragment.length < 4)) {
      throw new TypeError('Offline evaluation contains contradictory or invalid synthetic gold.');
    }
    const retrievedRefs = item.retrieval.records.map(x => x.record.sourceRef);
    const retrievedSet = new Set(retrievedRefs);
    const selectedTrace = item.retrieval.trace.selectedSourceRefs;
    const includedRefs = item.context.segments.map(x => x.sourceRef);
    const decoded = decodeExactRequestSegments(item);
    const requestRefs = decoded?.map(x => x.sourceRef) ?? [];
    const serializedRequestSegmentsMatchContext = decoded !== null &&
      decoded.length === item.context.segments.length &&
      new Set(requestRefs).size === requestRefs.length &&
      decoded.every((segment, index) => {
        const expected = item.context.segments[index];
        return expected !== undefined && segment.layer === expected.layer &&
          segment.sourceRef === expected.sourceRef && segment.text === expected.text;
      });
    const protectedGold: readonly CharacterContextSegmentV1[] =
      item.expectedProtectedSegments;
    if (!Array.isArray(protectedGold) ||
        protectedGold.length < ALWAYS_REQUIRED_LAYERS_V1.length ||
        protectedGold.length > 64 ||
        protectedGold.some(value =>
          typeof value !== 'object' || value === null ||
          !PROTECTED_CONTEXT_LAYERS_V1.has(value.layer) ||
          typeof value.sourceRef !== 'string' ||
          typeof value.text !== 'string' ||
          value.text.length === 0) ||
        new Set(protectedGold.map(value => value.sourceRef)).size !==
          protectedGold.length ||
        ALWAYS_REQUIRED_LAYERS_V1.some(layer =>
          protectedGold.filter(value => value.layer === layer).length !== 1)) {
      throw new TypeError('Offline evaluation requires unique, complete, independently pinned protected source gold.');
    }
    const expectedProtected = protectedGold;
    const protectedFromContext = item.context.segments.filter(
      value => PROTECTED_CONTEXT_LAYERS_V1.has(value.layer),
    );
    const protectedFromRequest = decoded?.filter(
      value => PROTECTED_CONTEXT_LAYERS_V1.has(value.layer),
    ) ?? [];
    const exactProtectedSequence = (
      actual: readonly CharacterContextSegmentV1[],
    ): boolean => actual.length === expectedProtected.length &&
      actual.every((value, index) =>
        value.layer === expectedProtected[index]?.layer &&
        value.sourceRef === expectedProtected[index]?.sourceRef &&
        value.text === expectedProtected[index]?.text);
    const protectedSourceGoldPreserved =
      exactProtectedSequence(protectedFromContext) &&
      decoded !== null &&
      exactProtectedSequence(protectedFromRequest);
    // Source-pinned evaluation must independently grade WHICH canonical User
    // turn was used for retrieval, not just whether the final Context/request
    // agree with each other. Compare against original protected fixture gold,
    // never against the assembled current-turn segment being evaluated.
    const originalCurrentTurn = expectedProtected.find(segment =>
      segment.layer === 'current_turn');
    const originalTurnState = expectedProtected.find(segment =>
      segment.layer === 'current_turn_state');
    let rawTurnState: unknown;
    try {
      rawTurnState = JSON.parse(originalTurnState?.text ?? '');
    } catch {
      // Invalid/missing original turn state cannot certify retrieval.
    }
    const pinnedTurnState = isRecord(rawTurnState) ? rawTurnState : null;
    const retrievalTurn = item.retrieval.querySourceTurn;
    const retrievalQueryTurnSourceGoldPreserved =
      originalCurrentTurn !== undefined &&
      originalTurnState !== undefined &&
      pinnedTurnState !== null &&
      pinnedTurnState.role === 'user' &&
      typeof pinnedTurnState.messageId === 'string' &&
      pinnedTurnState.messageId.length > 0 &&
      Number.isSafeInteger(pinnedTurnState.sequenceNo) &&
      typeof pinnedTurnState.sequenceNo === 'number' &&
      pinnedTurnState.sequenceNo > 0 &&
      typeof pinnedTurnState.createdAt === 'string' &&
      pinnedTurnState.createdAt === item.asOf &&
      originalCurrentTurn.sourceRef ===
        'message:' + pinnedTurnState.messageId &&
      originalTurnState.sourceRef ===
        'turn:' + pinnedTurnState.messageId + ':state' &&
      retrievalTurn?.messageId === pinnedTurnState.messageId &&
      retrievalTurn?.sequenceNo === pinnedTurnState.sequenceNo &&
      retrievalTurn?.createdAt === pinnedTurnState.createdAt &&
      retrievalTurn?.text === originalCurrentTurn.text;
    // These primitive guards validate fixture provenance independently of
    // retrieval claims. The gold is supplied by a separately trusted source,
    // never rebuilt from the output being graded.
    const boundedSourceText = (value: unknown): value is string =>
      typeof value === 'string' && value.length > 0 && value.length <= 256;
    const nullableSourceText = (value: unknown): value is string | null | undefined =>
      value == null || boundedSourceText(value);
    const boundedSourceTime = (value: unknown): value is string =>
      typeof value === 'string' && value.length > 0 && value.length <= 128 &&
      Number.isFinite(Date.parse(value));
    const nullableSourceTime = (value: unknown): value is string | null | undefined =>
      value == null || boundedSourceTime(value);
    // Canonical same-thread dialogue gold is separate from the Composer and
    // independently supplied for this offline fixture. Do not infer it from
    // context.segments, the request body, or sourceRefs in a trace.
    const originalDialogue = item.expectedOriginalDialogue;
    const goldAsOf = Date.parse(item.asOf);
    if (!Array.isArray(originalDialogue) || originalDialogue.length > 64 ||
        originalDialogue.some((message, index) =>
          message === null || typeof message !== 'object' ||
          !boundedSourceText(message.messageId) ||
          !/^[A-Za-z0-9][A-Za-z0-9._:/@-]*$/.test(message.messageId) ||
          !Number.isSafeInteger(message.sequenceNo) || message.sequenceNo < 1 ||
          (message.role !== 'user' && message.role !== 'assistant') ||
          (message.role === 'user' && message.speakerCharacterId !== null) ||
          (message.role === 'assistant' &&
            message.speakerCharacterId !== item.scope.characterId) ||
          typeof message.text !== 'string' || message.text.length === 0 ||
          message.text.length > 8000 ||
          !boundedSourceTime(message.createdAt) ||
          Date.parse(message.createdAt) > goldAsOf ||
          (index > 0 && (
            message.sequenceNo <= originalDialogue[index - 1]!.sequenceNo ||
            Date.parse(message.createdAt) <
              Date.parse(originalDialogue[index - 1]!.createdAt)
          ))) ||
        new Set(originalDialogue.map(message => message.messageId)).size !==
          originalDialogue.length) {
      throw new TypeError('Offline evaluation requires canonical, bounded, independently pinned dialogue-source gold.');
    }
    const dialogueByRef = new Map(originalDialogue.map(message =>
      ['message:' + message.messageId, message] as const));
    const finalDialogue = item.context.segments.filter(segment =>
      segment.layer === 'immediate_dialogue' ||
      segment.layer === 'older_dialogue');
    const latestDialogue = originalDialogue.at(-1);
    const immediateDialogue = finalDialogue.filter(segment =>
      segment.layer === 'immediate_dialogue');
    const olderDialogue = finalDialogue.filter(segment =>
      segment.layer === 'older_dialogue');
    const originalDialogueSourcePreserved =
      (latestDialogue === undefined
        ? immediateDialogue.length === 0
        : immediateDialogue.length === 1 &&
          immediateDialogue[0]!.sourceRef ===
            'message:' + latestDialogue.messageId) &&
      finalDialogue.length <= originalDialogue.length &&
      new Set(finalDialogue.map(segment => segment.sourceRef)).size ===
        finalDialogue.length &&
      finalDialogue.every(segment => {
        const original = dialogueByRef.get(segment.sourceRef);
        return original !== undefined &&
          (segment.layer === 'immediate_dialogue') ===
            (original.messageId === latestDialogue?.messageId) &&
          segment.text === JSON.stringify({
            role: original.role,
            speakerCharacterId: original.speakerCharacterId,
            createdAt: original.createdAt,
            text: original.text,
          });
      }) &&
      olderDialogue.every((segment, index) =>
        index === 0 ||
        dialogueByRef.get(olderDialogue[index - 1]!.sourceRef)!.sequenceNo <
          dialogueByRef.get(segment.sourceRef)!.sequenceNo) &&
      item.context.trace.dropped.every(segment =>
        segment.layer !== 'older_dialogue' ||
        (dialogueByRef.has(segment.sourceRef) &&
          segment.sourceRef !== 'message:' + latestDialogue?.messageId));

    // This metadata is not authoritative causal memory: compare the exact
    // original revision/type/policy/time against source-pinned fixture gold.
    // Optional context may omit an event only when the trace records a drop.
    const relationshipGoldSource = expectedProtected.find(
      value => value.layer === 'current_relationship',
    );
    let pinnedRelationshipRevision: number | null = null;
    if (relationshipGoldSource !== undefined) {
      let rawRelationship: unknown;
      try {
        rawRelationship = JSON.parse(relationshipGoldSource.text);
      } catch {
        throw new TypeError('Offline evaluation requires valid original relationship source gold.');
      }
      if (!isRecord(rawRelationship) ||
          !Number.isSafeInteger(rawRelationship.revision) ||
          (rawRelationship.revision as number) < 1) {
        throw new TypeError('Offline evaluation requires a positive pinned relationship revision.');
      }
      pinnedRelationshipRevision = rawRelationship.revision as number;
    }
    const eventGold = item.expectedOriginalRelationshipEvents;
    if (!Array.isArray(eventGold) || eventGold.length > 64 ||
        (pinnedRelationshipRevision === null && eventGold.length > 0) ||
        eventGold.some(event =>
          !isRecord(event) ||
          typeof event.eventType !== 'string' ||
          !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(event.eventType) ||
          typeof event.eventSchemaVersion !== 'string' ||
          !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(event.eventSchemaVersion) ||
          typeof event.policyVersion !== 'string' ||
          !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(event.policyVersion) ||
          typeof event.stateRevisionAfter !== 'number' ||
          !Number.isSafeInteger(event.stateRevisionAfter) ||
          event.stateRevisionAfter < 1 ||
          (pinnedRelationshipRevision !== null &&
            event.stateRevisionAfter > pinnedRelationshipRevision) ||
          !boundedSourceTime(event.appliedAt) ||
          Date.parse(event.appliedAt) > goldAsOf) ||
        new Set(eventGold.map(event => event.stateRevisionAfter)).size !==
          eventGold.length) {
      throw new TypeError('Offline evaluation requires unique, bounded, original relationship event gold.');
    }
    const metadataByRef = new Map(eventGold.map(event =>
      ['relationship-event:revision:' + event.stateRevisionAfter, event] as const));
    const includedEventMetadata = item.context.segments.filter(segment =>
      segment.layer === 'relationship_event_metadata');
    const droppedEventMetadata = item.context.trace.dropped.filter(segment =>
      segment.layer === 'relationship_event_metadata');
    const includedEventRefs = includedEventMetadata.map(segment => segment.sourceRef);
    const droppedEventRefs = droppedEventMetadata.map(segment => segment.sourceRef);
    const originalRelationshipMetadataPreserved =
      includedEventMetadata.every(segment => {
        const source = metadataByRef.get(segment.sourceRef);
        return source !== undefined &&
          segment.text === JSON.stringify({
            exposure: 'metadata_only_no_causal_evidence',
            eventType: source.eventType,
            eventSchemaVersion: source.eventSchemaVersion,
            stateRevisionAfter: source.stateRevisionAfter,
            policyVersion: source.policyVersion,
            appliedAt: source.appliedAt,
          });
      }) &&
      includedEventMetadata.every((segment, index) =>
        index === 0 ||
        metadataByRef.get(includedEventMetadata[index - 1]!.sourceRef)!
          .stateRevisionAfter >
        metadataByRef.get(segment.sourceRef)!.stateRevisionAfter) &&
      droppedEventMetadata.every((segment, index) =>
        metadataByRef.has(segment.sourceRef) &&
        (index === 0 ||
          metadataByRef.get(droppedEventMetadata[index - 1]!.sourceRef)!
            .stateRevisionAfter >
          metadataByRef.get(segment.sourceRef)!.stateRevisionAfter)) &&
      new Set([...includedEventRefs, ...droppedEventRefs]).size ===
        eventGold.length &&
      eventGold.every(event =>
        includedEventRefs.includes('relationship-event:revision:' +
          event.stateRevisionAfter) ||
        droppedEventRefs.includes('relationship-event:revision:' +
          event.stateRevisionAfter));

    const independentMemoryClaims = item.expectedRetrievedMemoryClaims;
    if (!Array.isArray(independentMemoryClaims) ||
        independentMemoryClaims.length > 64 ||
        independentMemoryClaims.some(claim =>
          claim === null || typeof claim !== 'object' ||
          typeof claim.sourceRef !== 'string' || claim.sourceRef.length < 1 ||
          claim.sourceRef.length > 256 ||
          typeof claim.recordKind !== 'string' || claim.recordKind.length < 1 ||
          typeof claim.claimKind !== 'string' || claim.claimKind.length < 1 ||
          typeof claim.sourceKind !== 'string' || claim.sourceKind.length < 1 ||
          typeof claim.summary !== 'string' || claim.summary.length < 1 ||
          claim.summary.length > 8000 ||
          typeof claim.effectiveAt !== 'string' ||
          !Number.isFinite(Date.parse(claim.effectiveAt)) ||
          !boundedSourceText(claim.recordId) ||
          !boundedSourceText(claim.recordType) ||
          !boundedSourceText(claim.schemaVersion) ||
          !boundedSourceText(claim.projectorVersion) ||
          !boundedSourceText(claim.grantId) ||
          !boundedSourceText(claim.granteeCharacterId) ||
          !['user_choice', 'merge_import'].includes(claim.grantReason) ||
          !boundedSourceTime(claim.grantedAt) ||
          !nullableSourceText(claim.sourceTurnId) ||
          !nullableSourceText(claim.sourceMessageId) ||
          !nullableSourceText(claim.sourceMergeActionId) ||
          !boundedSourceTime(claim.createdAt) ||
          !nullableSourceText(claim.createdByCharacterId) ||
          !nullableSourceTime(claim.confirmedAt) ||
          !nullableSourceTime(claim.validFrom) ||
          !nullableSourceTime(claim.validTo)) ||
        new Set(independentMemoryClaims.map(claim => claim.sourceRef)).size !==
          independentMemoryClaims.length) {
      throw new TypeError('Offline evaluation requires bounded, unique, independently pinned memory-source gold.');
    }
    const goldClaimsByRef = new Map(
      independentMemoryClaims.map(claim => [claim.sourceRef, claim] as const),
    );
    const independentMemorySourceClaimsPreserved =
      goldClaimsByRef.size === item.retrieval.records.length &&
      item.retrieval.records.every(({ record, signals }) => {
        const gold = goldClaimsByRef.get(record.sourceRef);
        return gold !== undefined &&
          gold.recordKind === record.recordKind &&
          gold.claimKind === record.claimKind &&
          gold.sourceKind === record.sourceKind &&
          gold.summary === record.summary &&
          gold.effectiveAt === signals.effectiveAt &&
          gold.recordId === record.recordId &&
          gold.recordType === record.recordType &&
          gold.schemaVersion === record.schemaVersion &&
          gold.projectorVersion === record.projectorVersion &&
          gold.grantId === record.grantId &&
          gold.granteeCharacterId === record.granteeCharacterId &&
          gold.grantReason === record.grantReason &&
          gold.grantedAt === record.grantedAt &&
          gold.sourceTurnId === record.sourceTurnId &&
          gold.sourceMessageId === record.sourceMessageId &&
          gold.sourceMergeActionId === record.sourceMergeActionId &&
          gold.createdAt === record.createdAt &&
          gold.createdByCharacterId === record.createdByCharacterId &&
          gold.confirmedAt === record.confirmedAt &&
          gold.validFrom === record.validFrom &&
          gold.validTo === record.validTo;
      });
    const memorySegments = item.context.segments.filter(
      x => x.layer === 'retrieved_memory',
    );
    const memoryRefs = new Set(memorySegments.map(x => x.sourceRef));
    const truePositive = retrievedRefs.filter(ref => relevant.has(ref)).length;
    const falsePositive = retrievedRefs.filter(ref => !relevant.has(ref)).length;
    const falseNegative = [...relevant].filter(ref => !retrievedSet.has(ref)).length;
    const unexpectedIncluded = [...memoryRefs].filter(ref => !expectedIncluded.has(ref)).length;
    const missingIncluded = [...expectedIncluded].filter(ref => !memoryRefs.has(ref)).length;
    const asOfMs = Date.parse(item.asOf);
    if (typeof item.asOf !== 'string' || item.asOf.length > 128 ||
        !Number.isFinite(asOfMs)) {
      throw new TypeError('Offline evaluation requires a valid bounded asOf timestamp.');
    }
    const currentTurnState = item.context.segments.find(
      segment => segment.layer === 'current_turn_state',
    );
    let anchoredTurnAt: unknown;
    try {
      const parsed: unknown = JSON.parse(currentTurnState?.text ?? '');
      if (parsed !== null && typeof parsed === 'object' &&
          !Array.isArray(parsed)) {
        anchoredTurnAt = (parsed as Record<string, unknown>).createdAt;
      }
    } catch {
      // An absent or altered authoritative turn state must fail the metric.
    }
    const temporalEvidenceWithinAsOf =
      typeof anchoredTurnAt === 'string' &&
      Date.parse(anchoredTurnAt) === asOfMs &&
      item.retrieval.records.every(({ record, signals }) => {
        const sourceTimes = [
          record.createdAt,
          record.grantedAt,
          ...(record.confirmedAt === undefined ? [] : [record.confirmedAt]),
        ];
        const effectiveAt = record.recordKind === 'life_fact'
          ? record.confirmedAt ?? record.createdAt
          : record.createdAt;
        return sourceTimes.every(time => Number.isFinite(Date.parse(time)) &&
          Date.parse(time) <= asOfMs) &&
          Number.isFinite(Date.parse(signals.effectiveAt)) &&
          signals.effectiveAt === effectiveAt &&
          Date.parse(signals.effectiveAt) <= asOfMs &&
          (record.recordKind !== 'life_fact' ||
            ((record.validFrom === undefined || record.validFrom === null ||
              (Number.isFinite(Date.parse(record.validFrom)) &&
               Date.parse(record.validFrom) <= asOfMs)) &&
             (record.validTo === undefined || record.validTo === null ||
              (Number.isFinite(Date.parse(record.validTo)) &&
               Date.parse(record.validTo) >= asOfMs))));
      });

    const checks = {
      scopePinned: sameScope(item.scope, item.retrieval.scope) &&
        sameScope(item.scope, item.context.scope),
      retrievalTraceMatchesSelection:
        selectedTrace.length === retrievedRefs.length &&
        selectedTrace.every((ref, i) => ref === retrievedRefs[i]) &&
        retrievedSet.size === retrievedRefs.length &&
        item.retrieval.records.every((x, i) => x.rank === i + 1) &&
        item.context.trace.includedSourceRefs.length === includedRefs.length &&
        item.context.trace.includedSourceRefs.every((ref, i) => ref === includedRefs[i]),
      serializedRequestSegmentsMatchContext,
      protectedSourceGoldPreserved,
      retrievalQueryTurnSourceGoldPreserved,
      originalDialogueSourcePreserved,
      originalRelationshipMetadataPreserved,
      independentMemorySourceClaimsPreserved,
      provenanceAndEpistemicLabelsPreserved: memorySegments.every(segment => {
        const retrieved = item.retrieval.records.find(
          record => record.record.sourceRef === segment.sourceRef,
        );
        if (retrieved === undefined) return false;
        let content: unknown;
        try {
          content = JSON.parse(segment.text);
        } catch {
          return false;
        }
        if (content === null || typeof content !== 'object' ||
            Array.isArray(content)) return false;
        const value = content as Record<string, unknown>;
        return value.recordKind === retrieved.record.recordKind &&
          value.claimKind === retrieved.record.claimKind &&
          value.sourceKind === retrieved.record.sourceKind &&
          value.effectiveAt === retrieved.signals.effectiveAt &&
          value.summary === retrieved.record.summary;
      }),
      temporalEvidenceWithinAsOf,
      deniedSourcesAbsent: decoded !== null && [...forbidden].every(ref =>
        !retrievedSet.has(ref) &&
        !includedRefs.includes(ref) &&
        !requestRefs.includes(ref) &&
        !selectedTrace.includes(ref) &&
        !item.context.trace.includedSourceRefs.includes(ref)),
      diagnosticsRedacted: (() => {
        const trace = JSON.stringify(item.context.trace);
        return typedFragments.every(value => !trace.includes(value)) &&
          item.context.segments.every(segment =>
            segment.text.length < 16 || !trace.includes(segment.text));
      })(),
      exactRequestByteCountAndBudgetValid:
        item.context.exactRequest.serializedRequestBodyBytes ===
          new TextEncoder().encode(item.context.exactRequest.serializedRequestBody).length &&
        item.context.budgetReceipt.certifiedInputTokenUpperBound <=
          item.context.budgetReceipt.availableInputTokens &&
        item.context.trace.certifiedInputTokenUpperBound ===
          item.context.budgetReceipt.certifiedInputTokenUpperBound &&
        item.context.trace.availableInputTokens ===
          item.context.budgetReceipt.availableInputTokens,
      dropOrderValid: item.context.trace.dropped.every((x, i, entries) =>
        DROP_PRIORITY_V1[x.layer] !== undefined &&
        x.reason === 'EXACT_REQUEST_BUDGET_PRESSURE' &&
        !includedRefs.includes(x.sourceRef) &&
        (i === 0 || DROP_PRIORITY_V1[entries[i - 1]!.layer]! <=
          DROP_PRIORITY_V1[x.layer]!)),
    };
    const passed = falsePositive === 0 && falseNegative === 0 &&
      unexpectedIncluded === 0 && missingIncluded === 0 &&
      Object.values(checks).every(Boolean);
    return Object.freeze({
      caseId: item.caseId,
      passed,
      retrieval: Object.freeze({
        truePositive, falsePositive, falseNegative,
        precision: ratio(truePositive, retrievedRefs.length),
        recall: ratio(truePositive, relevant.size),
      }),
      contextMemory: Object.freeze({
        expectedIncluded: expectedIncluded.size,
        unexpectedIncluded, missingIncluded,
      }),
      checks: Object.freeze(checks),
    });
  });
  const passedCount = results.filter(result => result.passed).length;
  return Object.freeze({
    schemaVersion: CHARACTER_MEMORY_CONTEXT_OFFLINE_EVALUATION_VERSION_V1,
    executionMode: 'offline_fixture_only' as const,
    caseCount: results.length,
    passedCount,
    failedCount: results.length - passedCount,
    cases: Object.freeze(results),
  });
}
