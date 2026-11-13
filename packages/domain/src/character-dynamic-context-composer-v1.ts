import {
  certifyModelTokenBudgetV1,
  ModelTokenBudgetErrorV1,
  type ModelTokenBudgetProfileV1,
  type ModelTokenBudgetReceiptV1,
  type ModelTokenCountAdapterV1,
} from './model-token-budget-profile-v1.js';
import {
  CHARACTER_MEMORY_RETRIEVAL_POLICY_VERSION_V1,
  countCharacterMemoryQueryTokensV1,
  detectExplicitMemoryCallbackRequestedV1,
  type CharacterMemoryRetrievalResultV1,
} from './character-memory-retrieval-v1.js';
import type { CharacterWorkingMemoryProjectionV1 } from './character-working-memory-projection-v1.js';

export const CHARACTER_DYNAMIC_CONTEXT_COMPOSER_VERSION_V1 =
  'character-dynamic-context-composer-v1' as const;

export type CharacterContextLayerV1 =
  | 'system_safety_product'
  | 'character_core'
  | 'current_relationship'
  | 'current_turn'
  | 'current_turn_state'
  | 'integrity_claim_decision'
  | 'disclosure_decision'
  | 'response_task'
  | 'immediate_dialogue'
  | 'bible_core'
  | 'unresolved_causal_event'
  | 'retrieved_memory'
  | 'shared_user_memory'
  | 'relationship_event_metadata'
  | 'older_dialogue'
  | 'resolved_low_salience_event'
  | 'bible_example'
  | 'repetition_suppression_hint'
  | 'trivia';

export interface CharacterContextSegmentV1 {
  readonly layer: CharacterContextLayerV1;
  readonly sourceRef: string;
  readonly text: string;
}

export interface CharacterContextTrustedSourceV1 {
  readonly sourceRef: string;
  readonly text: string;
}

export type CharacterContextScopeV1 = Readonly<{
  subjectId: string;
  characterId: string;
  threadId: string;
}>;

/**
 * The caller binds this port to its existing authoritative, pinned source
 * readers. It must verify the exact scope, layer, source ref AND source text.
 * There is no implicit/heuristic admission on unknown or missing sources.
 */
export interface CharacterContextSourceAdmissionPortV1 {
  readonly admit: (input: Readonly<{
    scope: CharacterContextScopeV1;
    segment: CharacterContextSegmentV1;
  }>) => boolean | Promise<boolean>;
}

export interface CharacterDynamicContextComposerInputV1<TRequest> {
  readonly expectedScope: CharacterContextScopeV1;
  readonly context: Pick<CharacterWorkingMemoryProjectionV1,
    'authority' | 'scope' | 'relationship' | 'relationshipEventIndex' | 'currentUserMessage' | 'recentConversation'>;
  readonly retrieval: CharacterMemoryRetrievalResultV1;
  /** Owner-authored, server-pinned cross-character memory; never an auto-proposal. */
  readonly sharedUserMemory?: readonly CharacterContextTrustedSourceV1[];
  /** These are trusted, source-pinned server inputs, never user-supplied labels. */
  readonly systemSafety: CharacterContextTrustedSourceV1;
  readonly characterCore: CharacterContextTrustedSourceV1;
  /** Server-pinned task instruction, mandatory even under context pressure. */
  readonly responseTask: CharacterContextTrustedSourceV1;
  /** Source-backed decisions from the independent Integrity/Claim gate. */
  readonly integrityClaimDecisions?: readonly CharacterContextTrustedSourceV1[];
  /** Sensitive-topic boundary decision; no private Character content. */
  readonly disclosureDecision?: CharacterContextTrustedSourceV1;
  /** Source-authorized recent expression repetition hints, low priority. */
  readonly repetitionSuppressionHints?: readonly CharacterContextTrustedSourceV1[];
  readonly bibleCore?: readonly CharacterContextTrustedSourceV1[];
  /** The caller must have already established these events through source authority. */
  readonly unresolvedCausalEvents?: readonly CharacterContextTrustedSourceV1[];
  readonly resolvedLowSalienceEvents?: readonly CharacterContextTrustedSourceV1[];
  readonly redundantBibleExamples?: readonly CharacterContextTrustedSourceV1[];
  readonly trivia?: readonly CharacterContextTrustedSourceV1[];
  /** Positive source admission is required before any Provider request build/count. */
  readonly sourceAdmission: CharacterContextSourceAdmissionPortV1;
  readonly profile: ModelTokenBudgetProfileV1;
  readonly adapter: ModelTokenCountAdapterV1<TRequest>;
  /**
   * Trusted provider-specific serializer. It must construct the *exact* body
   * that would be dispatched and the enforced output cap. No dispatch occurs.
   */
  readonly buildExactRequest: (
    segments: readonly CharacterContextSegmentV1[],
  ) => Readonly<{
    request: TRequest;
    requestFormat: string;
    serializedRequestBody: string;
    enforcedOutputTokenLimit: number;
  }>;
}

export interface CharacterDynamicContextComposerResultV1<TRequest> {
  readonly schemaVersion: typeof CHARACTER_DYNAMIC_CONTEXT_COMPOSER_VERSION_V1;
  readonly executionMode: 'offline_preflight_only';
  readonly scope: CharacterContextScopeV1;
  /** Private content: server only; MUST NOT be attached to telemetry. */
  readonly segments: readonly CharacterContextSegmentV1[];
  /** Exact immutable request body: server only; no Provider call is made. */
  readonly exactRequest: Readonly<{
    request: TRequest;
    requestFormat: string;
    serializedRequestBody: string;
    serializedRequestBodyBytes: number;
    enforcedOutputTokenLimit: number;
  }>;
  readonly budgetReceipt: ModelTokenBudgetReceiptV1;
  /** Redacted by construction: never contains segment text or raw request. */
  readonly trace: Readonly<{
    policyVersion: typeof CHARACTER_DYNAMIC_CONTEXT_COMPOSER_VERSION_V1;
    includedSourceRefs: readonly string[];
    dropped: readonly Readonly<{
      sourceRef: string;
      layer: CharacterContextLayerV1;
      reason: 'EXACT_REQUEST_BUDGET_PRESSURE';
    }>[];
    attemptedExactCounts: number;
    certifiedInputTokenUpperBound: number;
    availableInputTokens: number;
  }>;
}

export class CharacterDynamicContextComposerErrorV1 extends Error {
  override readonly name = 'CharacterDynamicContextComposerErrorV1';
  constructor(readonly code:
    | 'INVALID_AUTHORITY'
    | 'SCOPE_MISMATCH'
    | 'INVALID_SEGMENT'
    | 'DUPLICATE_SOURCE'
    | 'SOURCE_ADMISSION_DENIED'
    | 'INVALID_RETRIEVAL'
    | 'REQUEST_BUILD_FAILED',
  ) {
    super('Character Context assembly rejected: ' + code);
  }
}

function reject(code: CharacterDynamicContextComposerErrorV1['code']): never {
  throw new CharacterDynamicContextComposerErrorV1(code);
}

function requireSource(
  layer: CharacterContextLayerV1,
  input: CharacterContextTrustedSourceV1,
): CharacterContextSegmentV1 {
  if (
    typeof input?.sourceRef !== 'string' ||
    input.sourceRef.trim() !== input.sourceRef ||
    input.sourceRef.length === 0 ||
    input.sourceRef.length > 256 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/@-]*$/.test(input.sourceRef) ||
    typeof input.text !== 'string' ||
    input.text.trim().length === 0 ||
    input.text.length > 8000
  ) {
    reject('INVALID_SEGMENT');
  }
  return Object.freeze({ layer, sourceRef: input.sourceRef, text: input.text });
}

const EXTERNAL_SOURCE_LAYERS_V1: ReadonlySet<CharacterContextLayerV1> = new Set([
  'system_safety_product',
  'character_core',
  'response_task',
  'integrity_claim_decision',
  'disclosure_decision',
  'repetition_suppression_hint',
  'bible_core',
  'unresolved_causal_event',
  'resolved_low_salience_event',
  'bible_example',
  'trivia',
  'shared_user_memory',
]);

function serializeExistingDialogueMessage(
  message: CharacterWorkingMemoryProjectionV1['recentConversation'][number],
): string {
  return JSON.stringify({
    role: message.role,
    speakerCharacterId: message.speakerCharacterId,
    createdAt: message.createdAt,
    text: message.text,
  });
}

function sameScope(a: CharacterContextScopeV1, b: CharacterContextScopeV1): boolean {
  return a.subjectId === b.subjectId &&
    a.characterId === b.characterId &&
    a.threadId === b.threadId;
}

/**
 * Phase 4 offline foundation. Receives ONLY already-authorized retrieval
 * output and source-pinned server segments. It cannot query any source, mint
 * grants, read protected Saju, dispatch a Provider, or reserve costs.
 *
 * Exact provider request counting is reused from Phase 2; character/byte
 * heuristics are never used to decide what fits.
 */
export async function composeCharacterDynamicContextV1<TRequest>(
  input: CharacterDynamicContextComposerInputV1<TRequest>,
): Promise<CharacterDynamicContextComposerResultV1<TRequest>> {
  const { context, retrieval, expectedScope } = input;
  const authority = context.authority;
  if (
    authority.readOnly !== true ||
    authority.mayCreateDurableRecord !== false ||
    authority.mayChangeAccessGrant !== false ||
    authority.mayMutateRelationship !== false ||
    authority.includesProtectedSaju !== false
  ) {
    reject('INVALID_AUTHORITY');
  }
  if (!sameScope(expectedScope, context.scope) ||
      !sameScope(expectedScope, retrieval.scope) ||
      context.scope.relationshipRevision !== retrieval.scope.relationshipRevision) {
    reject('SCOPE_MISMATCH');
  }
  if (context.currentUserMessage.role !== 'user') reject('INVALID_AUTHORITY');
  const currentTime = Date.parse(context.currentUserMessage.createdAt);
  if (!Number.isFinite(currentTime)) reject('INVALID_AUTHORITY');
  // The retrieval and the exact context may share a Subject, Character and
  // thread yet belong to different turns. Never reuse a previous turn's
  // memory result for a newer query, even when the request budget permits it.
  // The private original text stays server-side and outside the redacted trace.
  const sourceTurn = retrieval.querySourceTurn;
  if (
    sourceTurn?.messageId !== context.currentUserMessage.messageId ||
    sourceTurn?.sequenceNo !== context.currentUserMessage.sequenceNo ||
    sourceTurn?.createdAt !== context.currentUserMessage.createdAt ||
    sourceTurn?.text !== context.currentUserMessage.text
  ) {
    reject('INVALID_RETRIEVAL');
  }
  // Treat canonical dialogue as source evidence, not untrusted prompt text.
  // The projection originally checks message order and speaker authority;
  // independently verify them again before source admission or exact count.
  // Another Character's turn, an injected current turn or a chronologically
  // impossible snippet must never appear in the assembled request.
  if (!Number.isSafeInteger(context.currentUserMessage.sequenceNo) ||
      context.currentUserMessage.sequenceNo < 1 ||
      typeof context.currentUserMessage.messageId !== 'string' ||
      context.currentUserMessage.messageId.length === 0 ||
      context.currentUserMessage.speakerCharacterId !== null ||
      !Array.isArray(context.recentConversation)) {
    reject('INVALID_AUTHORITY');
  }
  let lastSequence = 0;
  let lastTimestamp = Number.NEGATIVE_INFINITY;
  const dialogueMessageIds = new Set<string>();
  for (const message of context.recentConversation) {
    if (
      typeof message.messageId !== 'string' ||
      message.messageId.length === 0 ||
      message.messageId === context.currentUserMessage.messageId ||
      dialogueMessageIds.has(message.messageId) ||
      !Number.isSafeInteger(message.sequenceNo) ||
      message.sequenceNo <= lastSequence ||
      message.sequenceNo >= context.currentUserMessage.sequenceNo ||
      typeof message.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(message.createdAt)) ||
      Date.parse(message.createdAt) < lastTimestamp ||
      Date.parse(message.createdAt) > currentTime ||
      typeof message.text !== 'string' ||
      message.text.trim().length === 0 ||
      (message.role === 'user' && message.speakerCharacterId !== null) ||
      (message.role === 'assistant' &&
        message.speakerCharacterId !== expectedScope.characterId) ||
      (message.role !== 'user' && message.role !== 'assistant')
    ) {
      reject('INVALID_AUTHORITY');
    }
    dialogueMessageIds.add(message.messageId);
    lastSequence = message.sequenceNo;
    lastTimestamp = Date.parse(message.createdAt);
  }
  if ((context.relationship === null) !==
      (context.scope.relationshipRevision === null)) reject('SCOPE_MISMATCH');
  if (context.relationshipEventIndex?.exposure !== 'metadata_only' ||
      !Array.isArray(context.relationshipEventIndex.events) ||
      (context.relationship === null && context.relationshipEventIndex.events.length > 0)) {
    reject('INVALID_AUTHORITY');
  }
  // Search output flags are not themselves source authority. Recheck the
  // immutable lexical-mode contract and callback decision against the exact
  // canonical User text (including a caller-suppressed callback), before
  // source admission or any Provider request build/count.
  const retrievalTrace = retrieval.trace;
  const canonicalQueryTokenCount =
    countCharacterMemoryQueryTokensV1(context.currentUserMessage.text);
  const hasCanonicalCallback =
    detectExplicitMemoryCallbackRequestedV1(context.currentUserMessage.text);
  if (
    retrieval.schemaVersion !== CHARACTER_MEMORY_RETRIEVAL_POLICY_VERSION_V1 ||
    retrieval.retrievalMode !== 'lexical+metadata' ||
    !Array.isArray(retrieval.records) ||
    !Array.isArray(retrievalTrace?.selectedSourceRefs) ||
    !Number.isSafeInteger(retrievalTrace.queryTokenCount) ||
    retrievalTrace.queryTokenCount !== canonicalQueryTokenCount ||
    typeof retrievalTrace.explicitCallbackRequested !== 'boolean' ||
    (retrievalTrace.explicitCallbackRequested && !hasCanonicalCallback) ||
    typeof retrievalTrace.callbackFallbackUsed !== 'boolean' ||
    retrievalTrace.callbackFallbackUsed !==
      (retrievalTrace.explicitCallbackRequested && canonicalQueryTokenCount === 0) ||
    !Number.isSafeInteger(retrievalTrace.candidateCount) ||
    !Number.isSafeInteger(retrievalTrace.matchedCandidateCount) ||
    retrievalTrace.candidateCount < retrievalTrace.matchedCandidateCount ||
    retrievalTrace.matchedCandidateCount < retrieval.records.length ||
    !Number.isSafeInteger(retrievalTrace.unsupportedSchemaCount) ||
    retrievalTrace.unsupportedSchemaCount < 0
  ) {
    reject('INVALID_RETRIEVAL');
  }
  for (const item of retrieval.records) {
    const signals = item.signals;
    if (
      typeof signals.phraseMatch !== 'boolean' ||
      typeof signals.explicitCallbackMatch !== 'boolean' ||
      typeof signals.callbackFallbackUsed !== 'boolean' ||
      signals.callbackFallbackUsed !== retrievalTrace.callbackFallbackUsed ||
      signals.explicitCallbackMatch !== (
        retrievalTrace.explicitCallbackRequested &&
        (retrievalTrace.callbackFallbackUsed || signals.lexicalCoverage >= 0.5)
      ) ||
      (retrievalTrace.callbackFallbackUsed &&
        (item.record.recordKind !== 'memory' ||
         signals.lexicalCoverage !== 0 ||
         signals.phraseMatch)) ||
      (!retrievalTrace.callbackFallbackUsed && signals.lexicalCoverage <= 0)
    ) {
      reject('INVALID_RETRIEVAL');
    }
  }

  const selectedRefs = retrieval.records.map((item) => item.record.sourceRef);
  if (
    retrieval.trace.selectedSourceRefs.length !== selectedRefs.length ||
    retrieval.trace.selectedSourceRefs.some((ref, index) => ref !== selectedRefs[index]) ||
    retrieval.records.some((item, index) =>
      item.rank !== index + 1 ||
      item.record.granteeCharacterId !== expectedScope.characterId ||
      item.record.sourceRef !== item.record.recordKind + ':' +
        item.record.recordId + ':grant:' + item.record.grantId)
  ) {
    reject('INVALID_RETRIEVAL');
  }

  // The Composer is a second read-only authorization boundary. Recheck the
  // selected record's exact time/provenance metadata at the pinned User turn
  // even if retrieval previously admitted it. A reused/mutated retrieval
  // result must not launder later-granted or no-longer-valid evidence into
  // a model request. The server's separate asOf expiry rule stays upstream.
  const validTime = (value: unknown): value is string =>
    typeof value === 'string' && value.length > 0 && value.length <= 128 &&
    Number.isFinite(Date.parse(value));
  for (const item of retrieval.records) {
    const record = item.record;
    // A source-approved Fact, Memory or Character interpretation must retain
    // its original epistemic category and source kind across the retrieval ->
    // Composer boundary. Rejected/malformed projector metadata must never be
    // relabelled as verified personal knowledge in the exact model request.
    const approvedSourceKind = record.recordKind === 'life_fact'
      ? record.sourceKind === 'user_explicit' ||
        record.sourceKind === 'profile_edit' ||
        record.sourceKind === 'merge_import'
      : record.recordKind === 'memory' &&
        (record.sourceKind === 'user_approved' ||
         record.sourceKind === 'merge_import');
    if (
      !approvedSourceKind ||
      (record.claimKind !== 'fact' &&
       record.claimKind !== 'character_interpretation') ||
      (record.recordKind === 'life_fact' && record.claimKind !== 'fact') ||
      (record.grantReason !== 'user_choice' &&
       record.grantReason !== 'merge_import') ||
      !Number.isFinite(record.relevance) ||
      record.relevance < 0 || record.relevance > 1 ||
      !Number.isFinite(record.salience) ||
      record.salience < 0 || record.salience > 1 ||
      item.signals.relevance !== record.relevance ||
      item.signals.salience !== record.salience ||
      !Number.isFinite(item.signals.lexicalCoverage) ||
      item.signals.lexicalCoverage < 0 ||
      item.signals.lexicalCoverage > 1
    ) reject('INVALID_RETRIEVAL');
    const recordTimes = [
      record.createdAt,
      record.grantedAt,
      ...(record.confirmedAt === undefined ? [] : [record.confirmedAt]),
    ];
    const expectedEffectiveAt = record.recordKind === 'life_fact'
      ? record.confirmedAt ?? record.createdAt
      : record.createdAt;
    if (
      recordTimes.some(value => !validTime(value) ||
        Date.parse(value) > currentTime) ||
      !validTime(item.signals.effectiveAt) ||
      item.signals.effectiveAt !== expectedEffectiveAt
    ) reject('INVALID_RETRIEVAL');
    if (record.recordKind === 'life_fact') {
      const validFrom = record.validFrom;
      const validTo = record.validTo;
      if ((validFrom != null &&
           (!validTime(validFrom) || Date.parse(validFrom) > currentTime)) ||
          (validTo != null &&
           (!validTime(validTo) || Date.parse(validTo) < currentTime)) ||
          (validFrom != null && validTo != null &&
           Date.parse(validFrom) > Date.parse(validTo))) {
        reject('INVALID_RETRIEVAL');
      }
    }
  }

  if (
    (input.integrityClaimDecisions?.length ?? 0) > 8 ||
    (input.repetitionSuppressionHints?.length ?? 0) > 8
  ) reject('INVALID_SEGMENT');

  const mandatory: CharacterContextSegmentV1[] = [
    requireSource('system_safety_product', input.systemSafety),
    requireSource('character_core', input.characterCore),
  ];

  if (context.relationship !== null) {
    if (context.relationship.characterId !== expectedScope.characterId ||
        context.relationship.revision !== context.scope.relationshipRevision) {
      reject('SCOPE_MISMATCH');
    }
    // An existing Relationship snapshot is only evidence at or before this
    // canonical User turn. Prevent a later state update / interaction from
    // leaking into a replayed turn even when its revision and scope match.
    // This uses stored source timestamps, never guessed causal meaning.
    const updatedAt = Date.parse(context.relationship.updatedAt);
    const lastInteractionAt = context.relationship.lastInteractionAt === null
      ? null : Date.parse(context.relationship.lastInteractionAt);
    if (
      !Number.isFinite(updatedAt) ||
      updatedAt > currentTime ||
      (lastInteractionAt !== null &&
        (!Number.isFinite(lastInteractionAt) ||
          lastInteractionAt > updatedAt ||
          lastInteractionAt > currentTime))
    ) {
      reject('INVALID_AUTHORITY');
    }
    mandatory.push(requireSource('current_relationship', {
      sourceRef: 'relationship:' + context.relationship.stateId +
        ':revision:' + context.relationship.revision,
      text: JSON.stringify(context.relationship),
    }));
  }

  for (const entry of input.bibleCore ?? []) {
    mandatory.push(requireSource('bible_core', entry));
  }
  for (const entry of input.unresolvedCausalEvents ?? []) {
    mandatory.push(requireSource('unresolved_causal_event', entry));
  }

  const recent = [...context.recentConversation].sort(
    (a, b) => a.sequenceNo - b.sequenceNo,
  );
  if (recent.length > 0) {
    const immediate = recent[recent.length - 1]!;
    mandatory.push(requireSource('immediate_dialogue', {
      sourceRef: 'message:' + immediate.messageId,
      text: serializeExistingDialogueMessage(immediate),
    }));
  }
  mandatory.push(requireSource('current_turn_state', {
    sourceRef: 'turn:' + context.currentUserMessage.messageId + ':state',
    text: JSON.stringify({
      messageId: context.currentUserMessage.messageId,
      role: context.currentUserMessage.role,
      sequenceNo: context.currentUserMessage.sequenceNo,
      createdAt: context.currentUserMessage.createdAt,
      relationshipRevision: context.scope.relationshipRevision,
    }),
  }));
  // Conditional integrity and disclosure decisions come only from existing
  // preflight authorities and remain non-droppable under token pressure.
  for (const decision of input.integrityClaimDecisions ?? []) {
    mandatory.push(requireSource('integrity_claim_decision', decision));
  }
  if (input.disclosureDecision !== undefined) {
    mandatory.push(requireSource('disclosure_decision', input.disclosureDecision));
  }
  mandatory.push(requireSource('current_turn', {
    sourceRef: 'message:' + context.currentUserMessage.messageId,
    text: context.currentUserMessage.text,
  }));
  mandatory.push(requireSource('response_task', input.responseTask));

  const sorted = (entries: readonly CharacterContextTrustedSourceV1[] | undefined,
    layer: CharacterContextLayerV1): CharacterContextSegmentV1[] =>
    (entries ?? []).map((entry) => requireSource(layer, entry))
      .sort((a, b) => a.sourceRef.localeCompare(b.sourceRef));

  // The existing relationship ledger projection exposes only event
  // metadata. Do not transform event type/revision into invented causal
  // narratives or classify it as an unresolved, source-grounded event.
  const eventMetadata: CharacterContextSegmentV1[] = [];
  const observedRevisions = new Set<number>();
  for (const event of context.relationshipEventIndex.events) {
    if (
      context.scope.relationshipRevision === null ||
      !Number.isSafeInteger(event.stateRevisionAfter) ||
      event.stateRevisionAfter <= 0 ||
      event.stateRevisionAfter > context.scope.relationshipRevision ||
      observedRevisions.has(event.stateRevisionAfter) ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(event.eventType) ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(event.eventSchemaVersion) ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(event.policyVersion) ||
      !Number.isFinite(Date.parse(event.appliedAt)) ||
      Date.parse(event.appliedAt) > currentTime
    ) reject('INVALID_AUTHORITY');
    observedRevisions.add(event.stateRevisionAfter);
    eventMetadata.push(requireSource('relationship_event_metadata', {
      sourceRef: 'relationship-event:revision:' + event.stateRevisionAfter,
      text: JSON.stringify({
        exposure: 'metadata_only_no_causal_evidence',
        eventType: event.eventType,
        eventSchemaVersion: event.eventSchemaVersion,
        stateRevisionAfter: event.stateRevisionAfter,
        policyVersion: event.policyVersion,
        appliedAt: event.appliedAt,
      }),
    }));
  }
  eventMetadata.sort((a, b) => {
    const revisionA = Number(a.sourceRef.slice('relationship-event:revision:'.length));
    const revisionB = Number(b.sourceRef.slice('relationship-event:revision:'.length));
    return revisionB - revisionA;
  });

  // The first optional item is dropped first under exact-token pressure.
  const dropOrder: CharacterContextSegmentV1[] = [
    ...sorted(input.trivia, 'trivia'),
    ...sorted(input.redundantBibleExamples, 'bible_example'),
    ...sorted(input.resolvedLowSalienceEvents, 'resolved_low_salience_event'),
    ...sorted(input.repetitionSuppressionHints, 'repetition_suppression_hint'),
    ...eventMetadata,
    ...recent.slice(0, -1).map((message) => requireSource('older_dialogue', {
      sourceRef: 'message:' + message.messageId,
      text: serializeExistingDialogueMessage(message),
    })),
    ...[...(input.sharedUserMemory ?? [])].reverse().map(item =>
      requireSource('shared_user_memory', item)),
    ...[...retrieval.records].reverse().map((item) =>
      requireSource('retrieved_memory', {
        sourceRef: item.record.sourceRef,
        // Preserve the source-owned distinction between verified user facts
        // and Character interpretations; an insight is never a user fact.
        text: JSON.stringify({
          recordKind: item.record.recordKind,
          claimKind: item.record.claimKind,
          sourceKind: item.record.sourceKind,
          effectiveAt: item.signals.effectiveAt,
          summary: item.record.summary,
        }),
      })),
  ];

  const full = [...mandatory, ...dropOrder];
  if (full.length > 128) reject('INVALID_SEGMENT');
  const seen = new Set<string>();
  for (const item of full) {
    if (seen.has(item.sourceRef)) reject('DUPLICATE_SOURCE');
    seen.add(item.sourceRef);
  }
  // External Character/policy/event/Bible content needs a positive decision
  // from existing server-owned source authority. Check even optional items
  // that a later token-pressure pass may drop: a failed source cannot be
  // silently legitimized by pressure or reach the exact request builder.
  const pinnedScope = Object.freeze({ ...expectedScope });
  for (const segment of full) {
    if (!EXTERNAL_SOURCE_LAYERS_V1.has(segment.layer)) continue;
    let admitted = false;
    try {
      admitted = (await input.sourceAdmission?.admit({
        scope: pinnedScope,
        segment,
      })) === true;
    } catch {
      reject('SOURCE_ADMISSION_DENIED');
    }
    if (!admitted) reject('SOURCE_ADMISSION_DENIED');
  }

  const dropped: Array<{
    sourceRef: string;
    layer: CharacterContextLayerV1;
    reason: 'EXACT_REQUEST_BUDGET_PRESSURE';
  }> = [];
  let attempts = 0;

  while (true) {
    // Provider-specific render order is canonical and independent of drop order.
    const keep = new Set(dropOrder.slice(dropped.length).map((item) => item.sourceRef));
    const segments = Object.freeze([
      ...mandatory,
      ...dropOrder.filter((item) => keep.has(item.sourceRef)),
    ]);
    let built: ReturnType<typeof input.buildExactRequest>;
    try {
      built = input.buildExactRequest(segments);
    } catch {
      reject('REQUEST_BUILD_FAILED');
    }
    attempts += 1;
    const body = built.serializedRequestBody;
    const bytes = typeof body === 'string'
      ? new TextEncoder().encode(body).byteLength
      : 0;
    try {
      const receipt = await certifyModelTokenBudgetV1({
        profile: input.profile,
        adapter: input.adapter,
        request: built.request,
        requestFormat: built.requestFormat,
        serializedRequestBody: body,
        serializedRequestBodyBytes: bytes,
        enforcedOutputTokenLimit: built.enforcedOutputTokenLimit,
      });
      return Object.freeze({
        schemaVersion: CHARACTER_DYNAMIC_CONTEXT_COMPOSER_VERSION_V1,
        executionMode: 'offline_preflight_only' as const,
        scope: Object.freeze({ ...expectedScope }),
        segments,
        exactRequest: Object.freeze({
          ...built,
          serializedRequestBodyBytes: bytes,
        }),
        budgetReceipt: receipt,
        trace: Object.freeze({
          policyVersion: CHARACTER_DYNAMIC_CONTEXT_COMPOSER_VERSION_V1,
          includedSourceRefs: Object.freeze(segments.map((item) => item.sourceRef)),
          dropped: Object.freeze(dropped.map((item) => Object.freeze(item))),
          attemptedExactCounts: attempts,
          certifiedInputTokenUpperBound: receipt.certifiedInputTokenUpperBound,
          availableInputTokens: receipt.availableInputTokens,
        }),
      });
    } catch (error) {
      // An invalid profile, adapter, serializer, or unknown count must NEVER
      // turn into a discretionary context drop or an uncounted Provider call.
      if (!(error instanceof ModelTokenBudgetErrorV1) ||
          (error.code !== 'INPUT_BUDGET_EXCEEDED' &&
           error.code !== 'REQUEST_BODY_TOO_LARGE') ||
          dropped.length >= dropOrder.length) {
        throw error;
      }
      const item = dropOrder[dropped.length]!;
      dropped.push({
        sourceRef: item.sourceRef,
        layer: item.layer,
        reason: 'EXACT_REQUEST_BUDGET_PRESSURE',
      });
    }
  }
}
