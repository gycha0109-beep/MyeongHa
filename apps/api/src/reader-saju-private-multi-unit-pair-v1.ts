import type {
  CharacterSajuConsultationPrivateBatchComparisonV1,
} from './character-saju-consultation-shadow-v1.js';

export const READER_SAJU_PRIVATE_MULTI_UNIT_PAIR_SCHEMA_VERSION_V1 =
  'reader-saju-private-multi-unit-pair-v1' as const;

export interface ReaderSajuPrivateMultiUnitPairScopeV1 {
  readonly readingRef: string;
  readonly sourceResponseHash: string;
  readonly groundingHash: string;
  readonly firstCharacterId: string;
  readonly secondCharacterId: string;
}

export type ReaderSajuPrivateMultiUnitPairResultV1 =
  | Readonly<{
      status: 'incomplete';
      missingCharacterIds: readonly string[];
    }>
  | Readonly<{
      status: 'different_source_units';
      firstUnitIds: readonly string[];
      secondUnitIds: readonly string[];
    }>
  | Readonly<{
      status: 'ready_for_private_review';
      schemaVersion: typeof READER_SAJU_PRIVATE_MULTI_UNIT_PAIR_SCHEMA_VERSION_V1;
      readingRef: string;
      sourceResponseHash: string;
      groundingHash: string;
      /** Source-unit stable even when Character narrative ordering differs. */
      unitIds: readonly string[];
      first: CharacterSajuConsultationPrivateBatchComparisonV1;
      second: CharacterSajuConsultationPrivateBatchComparisonV1;
      allSemanticEvaluationsAccepted: boolean;
      fullProductQualityProven: false;
      publicRevealAuthorized: false;
    }>;

function id(value: string, name: string): string {
  if (!value || typeof value !== 'string' || !value.trim()) {
    throw new TypeError('Private consultation pair ' + name + ' must be non-empty.');
  }
  return value;
}

/** Enforce exact official source identity without assuming identical character order. */
export function createReaderSajuPrivateMultiUnitPairCollectorV1(
  scope: ReaderSajuPrivateMultiUnitPairScopeV1,
) {
  const readingRef = id(scope.readingRef, 'readingRef');
  const sourceResponseHash = id(scope.sourceResponseHash, 'sourceResponseHash');
  const groundingHash = id(scope.groundingHash, 'groundingHash');
  const firstCharacterId = id(scope.firstCharacterId, 'firstCharacterId');
  const secondCharacterId = id(scope.secondCharacterId, 'secondCharacterId');
  if (firstCharacterId === secondCharacterId) {
    throw new TypeError('Private consultation comparison requires two different characters.');
  }
  const records = new Map<string, CharacterSajuConsultationPrivateBatchComparisonV1>();

  return Object.freeze({
    async recordPrivateBatchComparison(
      evidence: CharacterSajuConsultationPrivateBatchComparisonV1,
    ): Promise<void> {
      const unitIds = evidence.sourceUnitIds;
      if (evidence.schemaVersion !== 'myeongha-character-saju-consultation-multi-unit-shadow-v1' ||
          evidence.readingRef !== readingRef ||
          evidence.sourceResponseHash !== sourceResponseHash ||
          evidence.groundingHash !== groundingHash ||
          ![firstCharacterId, secondCharacterId].includes(evidence.characterId) ||
          records.has(evidence.characterId) ||
          evidence.revealState !== 'forbidden' ||
          unitIds.length < 3 || unitIds.length > 4 ||
          unitIds.length !== evidence.units.length ||
          new Set(unitIds).size !== unitIds.length) {
        throw new TypeError('Private consultation batch violates source or reader identity.');
      }
      for (const [index, unit] of evidence.units.entries()) {
        if (unit.sourceUnitId !== unitIds[index] ||
            !unit.baselineText?.trim() || !unit.candidateText?.trim() ||
            !unit.candidateHash?.trim() || unit.sourceBlockRefs.length === 0 ||
            !['accepted', 'rejected'].includes(unit.evaluation) ||
            (unit.evaluation === 'accepted' && unit.failureCodes.length !== 0) ||
            (unit.evaluation === 'rejected' && unit.failureCodes.length === 0)) {
          throw new TypeError('Private consultation batch contains an invalid evidence unit.');
        }
      }
      records.set(evidence.characterId, Object.freeze({
        ...evidence,
        sourceUnitIds: Object.freeze([...evidence.sourceUnitIds]),
        units: Object.freeze(evidence.units.map((unit) => Object.freeze({
          ...unit,
          sourceBlockRefs: Object.freeze([...unit.sourceBlockRefs]),
          failureCodes: Object.freeze([...unit.failureCodes]),
        }))),
      }));
    },

    readPrivateReview(): ReaderSajuPrivateMultiUnitPairResultV1 {
      const first = records.get(firstCharacterId);
      const second = records.get(secondCharacterId);
      if (!first || !second) return Object.freeze({
        status: 'incomplete' as const,
        missingCharacterIds: Object.freeze(
          [firstCharacterId, secondCharacterId].filter((value) => !records.has(value)),
        ),
      });
      const firstSet = new Set(first.sourceUnitIds);
      const secondSet = new Set(second.sourceUnitIds);
      if (firstSet.size !== secondSet.size ||
          [...firstSet].some((unitId) => !secondSet.has(unitId))) {
        return Object.freeze({
          status: 'different_source_units' as const,
          firstUnitIds: Object.freeze([...first.sourceUnitIds]),
          secondUnitIds: Object.freeze([...second.sourceUnitIds]),
        });
      }
      const secondById = new Map(second.units.map((unit) => [unit.sourceUnitId, unit]));
      for (const unit of first.units) {
        const other = secondById.get(unit.sourceUnitId);
        if (!other ||
            other.baselineText !== unit.baselineText ||
            other.sourceBlockRefs.length !== unit.sourceBlockRefs.length ||
            other.sourceBlockRefs.some((ref, index) => ref !== unit.sourceBlockRefs[index])) {
          throw new TypeError('Consultation pair does not share an exact source-owned baseline.');
        }
      }
      return Object.freeze({
        status: 'ready_for_private_review' as const,
        schemaVersion: READER_SAJU_PRIVATE_MULTI_UNIT_PAIR_SCHEMA_VERSION_V1,
        readingRef,
        sourceResponseHash,
        groundingHash,
        unitIds: Object.freeze([...first.sourceUnitIds]),
        first,
        second,
        allSemanticEvaluationsAccepted: [first, second].every((record) =>
          record.units.every((unit) => unit.evaluation === 'accepted')),
        fullProductQualityProven: false as const,
        publicRevealAuthorized: false as const,
      });
    },
  });
}
