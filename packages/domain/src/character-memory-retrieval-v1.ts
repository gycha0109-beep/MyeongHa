import type {
  CharacterWorkingMemoryProjectedRecordV1,
  CharacterWorkingMemoryProjectionV1,
} from './character-working-memory-projection-v1.js';

export const CHARACTER_MEMORY_RETRIEVAL_POLICY_VERSION_V1 =
  'character-memory-retrieval-v1' as const;

export type CharacterMemoryRetrievalExclusionV1 = Readonly<{
  sourceRef: string;
  reason:
    | 'NO_LEXICAL_MATCH'
    | 'SOURCE_TIMESTAMP_IN_FUTURE'
    | 'SOURCE_TIMESTAMP_AFTER_CURRENT_TURN'
    | 'NOT_YET_VALID'
    | 'EXPIRED';
}>;

export interface CharacterMemoryRetrievedRecordV1 {
  readonly rank: number;
  readonly record: CharacterWorkingMemoryProjectedRecordV1;
  readonly signals: Readonly<{
    readonly lexicalCoverage: number;
    readonly phraseMatch: boolean;
    readonly explicitCallbackMatch: boolean;
    readonly callbackFallbackUsed: boolean;
    readonly relevance: number;
    readonly salience: number;
    readonly effectiveAt: string;
  }>;
}

export interface CharacterMemoryRetrievalResultV1 {
  readonly schemaVersion: typeof CHARACTER_MEMORY_RETRIEVAL_POLICY_VERSION_V1;
  readonly scope: CharacterWorkingMemoryProjectionV1['scope'];
  readonly retrievalMode: 'lexical+metadata';
  /**
   * Server-private binding to the exact canonical User message used to rank
   * memories. It is deliberately outside the redacted trace and must never
   * be sent to generic diagnostics or client observability.
   */
  readonly querySourceTurn: Readonly<Pick<
    CharacterWorkingMemoryProjectionV1['currentUserMessage'],
    'messageId' | 'sequenceNo' | 'createdAt' | 'text'
  >>;
  readonly records: readonly CharacterMemoryRetrievedRecordV1[];
  readonly trace: Readonly<{
    readonly queryTokenCount: number;
    readonly explicitCallbackRequested: boolean;
    readonly callbackFallbackUsed: boolean;
    readonly candidateCount: number;
    readonly matchedCandidateCount: number;
    readonly unsupportedSchemaCount: number;
    readonly selectedSourceRefs: readonly string[];
    readonly excluded: readonly CharacterMemoryRetrievalExclusionV1[];
  }>;
}

export interface RetrieveCharacterWorkingMemoryInputV1 {
  readonly projection: CharacterWorkingMemoryProjectionV1;
  readonly expectedScope: Readonly<{
    readonly subjectId: string;
    readonly characterId: string;
    readonly threadId: string;
  }>;
  readonly now: string;
  readonly limit: number;
  readonly explicitCallbackRequested?: boolean;
}

function requireText(value: unknown, name: string, maximum = 8000): string {
  if (typeof value !== 'string') throw new TypeError(name + ' must be text.');
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum) {
    throw new TypeError(name + ' must be non-empty text within its limit.');
  }
  return normalized;
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

function tokens(value: string): readonly string[] {
  const matches = normalize(value).match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  return Object.freeze([...new Set(matches)]);
}

// Remove only complete, explicitly known callback scaffold words. Prefix
// matching here hid real topics such as 지난달, 저번주, 기억력 and 대화형,
// which incorrectly activated the generic latest-memory fallback.
const CALLBACK_SCAFFOLD_TOKEN_V1 =
  /^(?:지난번(?:에|에는|은|을|도)?|저번(?:에|에는|은|을|도)?|그때(?:는|에|를|도)?|전에|아까(?:는|도)?|지난|대화(?:를|에서|했던|했|한)?|기억(?:나요|나|나세요|해요|하는|하나요|해|했|했던|하세요|하시나요|하십니까)?|얘기(?:했던|했|한|하던)?|말했(?:던|잖아|잖아요)?|말한|했|무슨|뭐|last|time|remember|previously|earlier|what|did|we|talk|about)$/i;

// A topical word must not match a short record token merely because it
// starts with it (지난달 != 지난; 기억력 != 기억). Permit the reverse
// match only for bounded Korean grammatical suffixes; exact and forward
// source-token matches keep the existing inflected-summary recall behavior.
const QUERY_GRAMMATICAL_SUFFIX_V1 =
  /^(?:은|는|이|가|을|를|에|에서|에게|의|도|만|와|과|로|으로|까지|부터|요|죠)$/;

function tokenMatches(queryToken: string, recordToken: string): boolean {
  return recordToken === queryToken ||
    recordToken.startsWith(queryToken) ||
    (queryToken.length >= 3 &&
      queryToken.startsWith(recordToken) &&
      QUERY_GRAMMATICAL_SUFFIX_V1.test(queryToken.slice(recordToken.length)));
}

/** Exact existing lexical search-token count for the canonical User turn.
 * The Composer reuses the same source-backed tokenizer to check an already
 * selected retrieval result, never to create a new callback or Memory grant.
 */
export function countCharacterMemoryQueryTokensV1(text: string): number {
  return tokens(requireText(text, 'canonical query text')).filter(
    token => !CALLBACK_SCAFFOLD_TOKEN_V1.test(token),
  ).length;
}

export function detectExplicitMemoryCallbackRequestedV1(text: string): boolean {
  const normalized = normalize(requireText(text, 'callback text'));
  return /지난번|저번|그때|전에|아까|기억(?:나|해)|기억하(?:세요|시나요|십니까)\s*[?？]|말했(?:잖|던)|얘기했|지난\s*대화|last time|remember|previously|earlier/i
    .test(normalized);
}

function validSourceTimestamp(value: unknown): number {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128 ||
      !Number.isFinite(Date.parse(value))) {
    throw new TypeError('Working Memory retrieval requires valid source timestamps.');
  }
  return Date.parse(value);
}

function effectiveTimestamp(record: CharacterWorkingMemoryProjectedRecordV1): string {
  const value = record.recordKind === 'life_fact'
    ? record.confirmedAt ?? record.createdAt
    : record.createdAt;
  validSourceTimestamp(value);
  return value;
}

function compareRetrieved(
  left: Omit<CharacterMemoryRetrievedRecordV1, 'rank'>,
  right: Omit<CharacterMemoryRetrievedRecordV1, 'rank'>,
): number {
  const a = left.signals;
  const b = right.signals;
  if (a.explicitCallbackMatch !== b.explicitCallbackMatch) {
    return a.explicitCallbackMatch ? -1 : 1;
  }
  if (a.phraseMatch !== b.phraseMatch) return a.phraseMatch ? -1 : 1;
  if (a.lexicalCoverage !== b.lexicalCoverage) return b.lexicalCoverage - a.lexicalCoverage;
  if (a.callbackFallbackUsed && b.callbackFallbackUsed) {
    const fallbackRecency = Date.parse(b.effectiveAt) - Date.parse(a.effectiveAt);
    if (fallbackRecency !== 0) return fallbackRecency;
  }
  if (a.salience !== b.salience) return b.salience - a.salience;
  if (a.relevance !== b.relevance) return b.relevance - a.relevance;
  const timeDelta = Date.parse(b.effectiveAt) - Date.parse(a.effectiveAt);
  if (timeDelta !== 0) return timeDelta;
  return left.record.sourceRef.localeCompare(right.record.sourceRef);
}

export function retrieveCharacterWorkingMemoryV1(
  input: RetrieveCharacterWorkingMemoryInputV1,
): CharacterMemoryRetrievalResultV1 {
  const projection = input.projection;
  const subjectId = requireText(input.expectedScope.subjectId, 'expectedScope.subjectId', 256);
  const characterId = requireText(input.expectedScope.characterId, 'expectedScope.characterId', 128);
  const threadId = requireText(input.expectedScope.threadId, 'expectedScope.threadId', 256);
  if (
    projection.scope.subjectId !== subjectId ||
    projection.scope.characterId !== characterId ||
    projection.scope.threadId !== threadId
  ) {
    throw new TypeError('Working Memory retrieval scope does not match the pinned Subject, Character, and thread.');
  }
  if (
    projection.authority.readOnly !== true ||
    projection.authority.mayCreateDurableRecord !== false ||
    projection.authority.mayChangeAccessGrant !== false ||
    projection.authority.mayMutateRelationship !== false ||
    projection.authority.includesProtectedSaju !== false
  ) {
    throw new TypeError('Working Memory retrieval requires a read-only, non-Saju projection.');
  }
  const now = requireText(input.now, 'now', 128);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new TypeError('now must be a valid timestamp.');
  // The request's authoritative current User turn cannot originate after the
  // server as-of instant. A malformed or future turn must not retrieve records.
  const currentTurnMs = validSourceTimestamp(projection.currentUserMessage.createdAt);
  if (currentTurnMs > nowMs) {
    throw new TypeError('Working Memory retrieval current turn is in the future.');
  }
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 20) {
    throw new TypeError('retrieval limit must be between 1 and 20.');
  }
  const queryText = requireText(
    projection.currentUserMessage.text,
    'projection.currentUserMessage.text',
  );
  const queryTokens = tokens(queryText).filter(
    (token) => !CALLBACK_SCAFFOLD_TOKEN_V1.test(token),
  );
  // An external callback hint may suppress retrieval, but must never create
  // a callback absent from the exact canonical User text. Otherwise a caller
  // could force a generic latest-memory fallback for an unrelated short turn.
  if (input.explicitCallbackRequested !== undefined &&
      typeof input.explicitCallbackRequested !== 'boolean') {
    throw new TypeError('Working Memory callback hint must be boolean.');
  }
  const callbackInCurrentTurn = detectExplicitMemoryCallbackRequestedV1(queryText);
  const callbackRequested = callbackInCurrentTurn &&
    input.explicitCallbackRequested !== false;
  const callbackFallbackUsed = callbackRequested && queryTokens.length === 0;

  const seenRefs = new Set<string>();
  const candidates: Array<Omit<CharacterMemoryRetrievedRecordV1, 'rank'>> = [];
  const excluded: CharacterMemoryRetrievalExclusionV1[] = [];

  for (const record of projection.projectedRecords) {
    const expectedSourceRef = record.recordKind + ':' + record.recordId + ':grant:' + record.grantId;
    if (record.sourceRef !== expectedSourceRef || record.granteeCharacterId !== characterId) {
      throw new TypeError('Working Memory retrieval received a record outside its exact grant scope.');
    }
    if (seenRefs.has(record.sourceRef)) {
      throw new TypeError('Working Memory retrieval source references must be unique.');
    }
    seenRefs.add(record.sourceRef);
    const effectiveAt = effectiveTimestamp(record);
    // Defense in depth: a positive upstream projection is not a reason to
    // accept malformed grant, confirmation or validity timestamps here.
    const sourceTimestamps = [
      record.createdAt,
      record.grantedAt,
      ...(record.confirmedAt === undefined ? [] : [record.confirmedAt]),
    ];
    const sourceTimeMs = sourceTimestamps.map(validSourceTimestamp);
    const validFromMs = record.recordKind === 'life_fact' &&
      record.validFrom != null
      ? validSourceTimestamp(record.validFrom) : null;
    const validToMs = record.recordKind === 'life_fact' &&
      record.validTo != null
      ? validSourceTimestamp(record.validTo) : null;
    if (validFromMs !== null && validToMs !== null &&
        validFromMs > validToMs) {
      throw new TypeError('Working Memory retrieval has an inverted fact-validity range.');
    }
    if (sourceTimeMs.some(timestamp => timestamp > nowMs)) {
      excluded.push(Object.freeze({
        sourceRef: record.sourceRef,
        reason: 'SOURCE_TIMESTAMP_IN_FUTURE',
      }));
      continue;
    }
    // A source created, granted or confirmed after the canonical User turn
    // cannot be used to answer that earlier turn even when the server reads
    // it later. Keep the existing server-asOf gate independently.
    if (sourceTimeMs.some(timestamp => timestamp > currentTurnMs)) {
      excluded.push(Object.freeze({
        sourceRef: record.sourceRef,
        reason: 'SOURCE_TIMESTAMP_AFTER_CURRENT_TURN',
      }));
      continue;
    }
    if (
      record.recordKind === 'life_fact' &&
      validFromMs !== null &&
      (validFromMs > nowMs || validFromMs > currentTurnMs)
    ) {
      excluded.push(Object.freeze({
        sourceRef: record.sourceRef,
        reason: 'NOT_YET_VALID',
      }));
      continue;
    }
    if (
      record.recordKind === 'life_fact' &&
      validToMs !== null &&
      validToMs < nowMs
    ) {
      excluded.push(Object.freeze({
        sourceRef: record.sourceRef,
        reason: 'EXPIRED',
      }));
      continue;
    }
    const summaryTokens = tokens(record.summary);
    const matchedTokens = queryTokens.filter((queryToken) =>
      summaryTokens.some((recordToken) => tokenMatches(queryToken, recordToken)),
    );
    const lexicalCoverage = queryTokens.length === 0
      ? 0
      : matchedTokens.length / queryTokens.length;
    if (
      lexicalCoverage <= 0 &&
      !(callbackFallbackUsed && record.recordKind === 'memory')
    ) {
      excluded.push(Object.freeze({
        sourceRef: record.sourceRef,
        reason: 'NO_LEXICAL_MATCH',
      }));
      continue;
    }
    const phraseMatch = queryTokens.length > 0 &&
      normalize(record.summary).includes(normalize(queryText));
    candidates.push(Object.freeze({
      record,
      signals: Object.freeze({
        lexicalCoverage,
        phraseMatch,
        explicitCallbackMatch: callbackRequested &&
          (callbackFallbackUsed || lexicalCoverage >= 0.5),
        callbackFallbackUsed,
        relevance: record.relevance,
        salience: record.salience,
        effectiveAt,
      }),
    }));
  }

  candidates.sort(compareRetrieved);
  const selected = candidates.slice(0, input.limit);
  const records = selected.map((candidate, index) => Object.freeze({
    rank: index + 1,
    record: candidate.record,
    signals: candidate.signals,
  }));
  return Object.freeze({
    schemaVersion: CHARACTER_MEMORY_RETRIEVAL_POLICY_VERSION_V1,
    scope: projection.scope,
    retrievalMode: 'lexical+metadata' as const,
    querySourceTurn: Object.freeze({
      messageId: projection.currentUserMessage.messageId,
      sequenceNo: projection.currentUserMessage.sequenceNo,
      createdAt: projection.currentUserMessage.createdAt,
      text: projection.currentUserMessage.text,
    }),
    records: Object.freeze(records),
    trace: Object.freeze({
      queryTokenCount: queryTokens.length,
      explicitCallbackRequested: callbackRequested,
      callbackFallbackUsed,
      candidateCount: projection.projectedRecords.length,
      matchedCandidateCount: candidates.length,
      unsupportedSchemaCount: projection.admissions.filter(
        (admission) => admission.outcome === 'UNSUPPORTED_SCHEMA',
      ).length,
      selectedSourceRefs: Object.freeze(records.map((item) => item.record.sourceRef)),
      excluded: Object.freeze(excluded),
    }),
  });
}
