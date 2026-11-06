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
    readonly relevance: number;
    readonly salience: number;
    readonly effectiveAt: string;
  }>;
}

export interface CharacterMemoryRetrievalResultV1 {
  readonly schemaVersion: typeof CHARACTER_MEMORY_RETRIEVAL_POLICY_VERSION_V1;
  readonly scope: CharacterWorkingMemoryProjectionV1['scope'];
  readonly retrievalMode: 'lexical+metadata';
  readonly records: readonly CharacterMemoryRetrievedRecordV1[];
  readonly trace: Readonly<{
    readonly queryTokenCount: number;
    readonly explicitCallbackRequested: boolean;
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

function tokenMatches(queryToken: string, recordToken: string): boolean {
  return recordToken === queryToken ||
    recordToken.startsWith(queryToken) ||
    (queryToken.length >= 3 && queryToken.startsWith(recordToken));
}

export function detectExplicitMemoryCallbackRequestedV1(text: string): boolean {
  const normalized = normalize(requireText(text, 'callback text'));
  return /지난번|저번|그때|전에|아까|기억(?:나|해)|말했(?:잖|던)|얘기했|지난\s*대화|last time|remember|previously|earlier/i
    .test(normalized);
}

function effectiveTimestamp(record: CharacterWorkingMemoryProjectedRecordV1): string {
  const value = record.recordKind === 'life_fact'
    ? record.confirmedAt ?? record.createdAt
    : record.createdAt;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new TypeError('Retrieved record has no valid source timestamp.');
  }
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
  if (Number.isNaN(nowMs)) throw new TypeError('now must be a valid timestamp.');
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 20) {
    throw new TypeError('retrieval limit must be between 1 and 20.');
  }
  const queryText = requireText(
    projection.currentUserMessage.text,
    'projection.currentUserMessage.text',
  );
  const queryTokens = tokens(queryText);
  const callbackRequested = input.explicitCallbackRequested ??
    detectExplicitMemoryCallbackRequestedV1(queryText);

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
    const sourceTimestamps = [
      record.createdAt,
      record.grantedAt,
      ...(record.confirmedAt === undefined ? [] : [record.confirmedAt]),
    ];
    if (sourceTimestamps.some((timestamp) => Date.parse(timestamp) > nowMs)) {
      excluded.push(Object.freeze({
        sourceRef: record.sourceRef,
        reason: 'SOURCE_TIMESTAMP_IN_FUTURE',
      }));
      continue;
    }
    if (
      record.recordKind === 'life_fact' &&
      record.validFrom !== undefined &&
      record.validFrom !== null &&
      Date.parse(record.validFrom) > nowMs
    ) {
      excluded.push(Object.freeze({
        sourceRef: record.sourceRef,
        reason: 'NOT_YET_VALID',
      }));
      continue;
    }
    if (
      record.recordKind === 'life_fact' &&
      record.validTo !== undefined &&
      record.validTo !== null &&
      Date.parse(record.validTo) < nowMs
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
    if (lexicalCoverage <= 0) {
      excluded.push(Object.freeze({
        sourceRef: record.sourceRef,
        reason: 'NO_LEXICAL_MATCH',
      }));
      continue;
    }
    const phraseMatch = normalize(record.summary).includes(normalize(queryText));
    candidates.push(Object.freeze({
      record,
      signals: Object.freeze({
        lexicalCoverage,
        phraseMatch,
        explicitCallbackMatch: callbackRequested,
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
    records: Object.freeze(records),
    trace: Object.freeze({
      queryTokenCount: queryTokens.length,
      explicitCallbackRequested: callbackRequested,
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
