import type {
  CharacterSajuConsultationPrivateComparisonV1,
} from './character-saju-consultation-shadow-v1.js';

/**
 * Server-private, ephemeral evidence collector for comparing two admitted
 * Characters against the exact same official Saju source. No HTTP route,
 * database writer, scheduler, logging, or production publication.
 */
export const READER_SAJU_PRIVATE_PAIR_COMPARISON_VERSION_V1 =
  'reader-saju-private-pair-comparison-v1' as const;

export interface ReaderSajuPrivatePairScopeV1 {
  readonly readingRef: string;
  readonly sourceResponseHash: string;
  readonly groundingHash: string;
  readonly firstCharacterId: string;
  readonly secondCharacterId: string;
}

export type ReaderSajuPrivatePairComparisonV1 =
  | Readonly<{
      status: 'incomplete';
      missingCharacterIds: readonly string[];
    }>
  | Readonly<{
      status: 'different_source_units';
      firstSourceUnitId: string;
      secondSourceUnitId: string;
    }>
  | Readonly<{
      status: 'ready_for_private_review';
      schemaVersion: typeof READER_SAJU_PRIVATE_PAIR_COMPARISON_VERSION_V1;
      readingRef: string;
      sourceResponseHash: string;
      groundingHash: string;
      sourceUnitId: string;
      officialSourceRefs: readonly string[];
      officialMeaning: string;
      first: CharacterSajuConsultationPrivateComparisonV1;
      second: CharacterSajuConsultationPrivateComparisonV1;
      /** Automated model verdicts do not replace expert editorial review. */
      publicationAuthorized: false;
    }>;

function required(value: string, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError('Private Saju comparison requires ' + field + '.');
  }
  return value;
}

export function createReaderSajuPrivatePairCollectorV1(
  scope: ReaderSajuPrivatePairScopeV1,
) {
  const readingRef = required(scope.readingRef, 'readingRef');
  const sourceResponseHash = required(scope.sourceResponseHash, 'sourceResponseHash');
  const groundingHash = required(scope.groundingHash, 'groundingHash');
  const firstCharacterId = required(scope.firstCharacterId, 'firstCharacterId');
  const secondCharacterId = required(scope.secondCharacterId, 'secondCharacterId');
  if (firstCharacterId === secondCharacterId) {
    throw new TypeError('Private Saju comparison needs different characters.');
  }
  const byCharacter = new Map<string, CharacterSajuConsultationPrivateComparisonV1>();
  return Object.freeze({
    /** Server callback. Never pass to a browser or user-supplied evaluation port. */
    async recordPrivateComparison(
      record: CharacterSajuConsultationPrivateComparisonV1,
    ): Promise<void> {
      if (record.readingRef !== readingRef ||
          record.sourceResponseHash !== sourceResponseHash ||
          record.groundingHash !== groundingHash ||
          ![firstCharacterId, secondCharacterId].includes(record.characterId) ||
          byCharacter.has(record.characterId) ||
          !record.sourceUnitId ||
          !record.baselineText.trim() ||
          !record.candidateText.trim() ||
          record.sourceBlockRefs.length === 0) {
        throw new TypeError('Private Saju comparison source identity mismatch.');
      }
      byCharacter.set(record.characterId, Object.freeze({
        ...record,
        sourceBlockRefs: Object.freeze([...record.sourceBlockRefs]),
        failureCodes: Object.freeze([...record.failureCodes]),
      }));
    },
    /** Only privileged server-side review code may invoke this read. */
    readPrivateReview(): ReaderSajuPrivatePairComparisonV1 {
      const first = byCharacter.get(firstCharacterId);
      const second = byCharacter.get(secondCharacterId);
      if (first === undefined || second === undefined) {
        return Object.freeze({
          status: 'incomplete' as const,
          missingCharacterIds: Object.freeze(
            [firstCharacterId, secondCharacterId].filter((id) => !byCharacter.has(id)),
          ),
        });
      }
      if (first.sourceUnitId !== second.sourceUnitId) {
        return Object.freeze({
          status: 'different_source_units' as const,
          firstSourceUnitId: first.sourceUnitId,
          secondSourceUnitId: second.sourceUnitId,
        });
      }
      // The exact same source unit must produce the same protected baseline.
      if (first.baselineText !== second.baselineText ||
          first.sourceBlockRefs.length !== second.sourceBlockRefs.length ||
          first.sourceBlockRefs.some((ref, index) => second.sourceBlockRefs[index] !== ref)) {
        throw new TypeError('Private Saju comparison baseline differs for identical source.');
      }
      return Object.freeze({
        status: 'ready_for_private_review' as const,
        schemaVersion: READER_SAJU_PRIVATE_PAIR_COMPARISON_VERSION_V1,
        readingRef,
        sourceResponseHash,
        groundingHash,
        sourceUnitId: first.sourceUnitId,
        officialSourceRefs: first.sourceBlockRefs,
        officialMeaning: first.baselineText,
        first,
        second,
        publicationAuthorized: false as const,
      });
    },
  });
}
