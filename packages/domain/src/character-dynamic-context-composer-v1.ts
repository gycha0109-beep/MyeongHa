import {
  certifyModelTokenBudgetV1,
  ModelTokenBudgetErrorV1,
  type ModelTokenBudgetProfileV1,
  type ModelTokenBudgetReceiptV1,
  type ModelTokenCountAdapterV1,
} from './model-token-budget-profile-v1.js';
import type { CharacterMemoryRetrievalResultV1 } from './character-memory-retrieval-v1.js';
import type { CharacterWorkingMemoryProjectionV1 } from './character-working-memory-projection-v1.js';

export const CHARACTER_DYNAMIC_CONTEXT_COMPOSER_VERSION_V1 =
  'character-dynamic-context-composer-v1' as const;

export type CharacterContextLayerV1 =
  | 'system_safety_product'
  | 'character_core'
  | 'current_relationship'
  | 'current_turn'
  | 'immediate_dialogue'
  | 'bible_core'
  | 'unresolved_causal_event'
  | 'retrieved_memory'
  | 'older_dialogue'
  | 'resolved_low_salience_event'
  | 'bible_example'
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

export interface CharacterDynamicContextComposerInputV1<TRequest> {
  readonly expectedScope: CharacterContextScopeV1;
  readonly context: Pick<CharacterWorkingMemoryProjectionV1,
    'authority' | 'scope' | 'relationship' | 'currentUserMessage' | 'recentConversation'>;
  readonly retrieval: CharacterMemoryRetrievalResultV1;
  /** These are trusted, source-pinned server inputs, never user-supplied labels. */
  readonly systemSafety: CharacterContextTrustedSourceV1;
  readonly characterCore: CharacterContextTrustedSourceV1;
  readonly bibleCore?: readonly CharacterContextTrustedSourceV1[];
  /** The caller must have already established these events through source authority. */
  readonly unresolvedCausalEvents?: readonly CharacterContextTrustedSourceV1[];
  readonly resolvedLowSalienceEvents?: readonly CharacterContextTrustedSourceV1[];
  readonly redundantBibleExamples?: readonly CharacterContextTrustedSourceV1[];
  readonly trivia?: readonly CharacterContextTrustedSourceV1[];
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
    typeof input.text !== 'string' ||
    input.text.trim().length === 0 ||
    input.text.length > 8000
  ) {
    reject('INVALID_SEGMENT');
  }
  return Object.freeze({ layer, sourceRef: input.sourceRef, text: input.text });
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

  const mandatory: CharacterContextSegmentV1[] = [
    requireSource('system_safety_product', input.systemSafety),
    requireSource('character_core', input.characterCore),
  ];

  if (context.relationship !== null) {
    if (context.relationship.characterId !== expectedScope.characterId ||
        context.relationship.revision !== context.scope.relationshipRevision) {
      reject('SCOPE_MISMATCH');
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
      text: immediate.text,
    }));
  }
  mandatory.push(requireSource('current_turn', {
    sourceRef: 'message:' + context.currentUserMessage.messageId,
    text: context.currentUserMessage.text,
  }));

  const sorted = (entries: readonly CharacterContextTrustedSourceV1[] | undefined,
    layer: CharacterContextLayerV1): CharacterContextSegmentV1[] =>
    (entries ?? []).map((entry) => requireSource(layer, entry))
      .sort((a, b) => a.sourceRef.localeCompare(b.sourceRef));

  // The first optional item is dropped first under exact-token pressure.
  const dropOrder: CharacterContextSegmentV1[] = [
    ...sorted(input.trivia, 'trivia'),
    ...sorted(input.redundantBibleExamples, 'bible_example'),
    ...sorted(input.resolvedLowSalienceEvents, 'resolved_low_salience_event'),
    ...recent.slice(0, -1).map((message) => requireSource('older_dialogue', {
      sourceRef: 'message:' + message.messageId,
      text: message.text,
    })),
    ...[...retrieval.records].reverse().map((item) =>
      requireSource('retrieved_memory', {
        sourceRef: item.record.sourceRef,
        text: item.record.summary,
      })),
  ];

  const full = [...mandatory, ...dropOrder];
  if (full.length > 128) reject('INVALID_SEGMENT');
  const seen = new Set<string>();
  for (const item of full) {
    if (seen.has(item.sourceRef)) reject('DUPLICATE_SOURCE');
    seen.add(item.sourceRef);
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
