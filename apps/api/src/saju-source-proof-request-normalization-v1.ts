import type { BirthProfileReadResponseV1 } from './birth-profile-read.js';
import { bindCurrentBirthProfileRevisionForSajuV1 } from './saju-production-calculation-execution.js';
import {
  buildSajuProductionReadingRequestV1,
  type SajuProductionReadingRequestV1,
} from './saju-production-reading-http-adapter.js';

/** Phase 2B-3C-5: fixed internal rehearsal slots, never caller-selected products. */
export const SAJU_SOURCE_PROOF_GENERAL_NATAL_TEXT_V1 = '전체 사주' as const;
export const SAJU_SOURCE_PROOF_RELATIONSHIP_TEXT_V1 = '연애운' as const;
export type SajuHeldProofRehearsalReadingTextV1 =
  | typeof SAJU_SOURCE_PROOF_GENERAL_NATAL_TEXT_V1
  | typeof SAJU_SOURCE_PROOF_RELATIONSHIP_TEXT_V1;

/**
 * Source-proof request projection from an already-authorized current Revision.
 * It deliberately reuses the existing MyeongHa Saju request builders.
 * Saju's parseProductHostReadingRequest v1 must return the exact same shape;
 * tests pin its source-side canonical normalization vectors.
 *
 * No client Birth, targetPersonRef, product manifest or authority is accepted.
 */
export function buildCurrentBirthSourceProofRehearsalRequestV1(
  profile: BirthProfileReadResponseV1,
  readingText: SajuHeldProofRehearsalReadingTextV1,
): SajuProductionReadingRequestV1 {
  if (readingText !== SAJU_SOURCE_PROOF_GENERAL_NATAL_TEXT_V1
    && readingText !== SAJU_SOURCE_PROOF_RELATIONSHIP_TEXT_V1) {
    throw new Error('Unsupported source proof rehearsal reading text.');
  }
  if (profile.profileKind !== 'self' || profile.archivedAt !== null
    || !Number.isSafeInteger(profile.currentRevision.revisionNo)
    || profile.currentRevision.revisionNo <= 0
    || profile.currentRevision.revisionId.trim() === '') {
    throw new Error('Current self Birth revision is not eligible for source proof.');
  }
  return buildSajuProductionReadingRequestV1({
    birthRevision: bindCurrentBirthProfileRevisionForSajuV1(profile),
    readingText,
  });
}

/** Keep the 2B-3C-4 General Natal caller and its exact semantics unchanged. */
export function buildCurrentBirthGeneralNatalSourceProofRequestV1(
  profile: BirthProfileReadResponseV1,
): SajuProductionReadingRequestV1 {
  return buildCurrentBirthSourceProofRehearsalRequestV1(
    profile,
    SAJU_SOURCE_PROOF_GENERAL_NATAL_TEXT_V1,
  );
}
