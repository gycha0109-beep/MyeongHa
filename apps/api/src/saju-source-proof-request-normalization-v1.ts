import type { BirthProfileReadResponseV1 } from './birth-profile-read.js';
import { bindCurrentBirthProfileRevisionForSajuV1 } from './saju-production-calculation-execution.js';
import {
  buildSajuProductionReadingRequestV1,
  type SajuProductionReadingRequestV1,
} from './saju-production-reading-http-adapter.js';

/** General Natal is the only source-proof slot in 2B-3C-4. */
export const SAJU_SOURCE_PROOF_GENERAL_NATAL_TEXT_V1 = '전체 사주' as const;

/**
 * Source-proof request projection from an already-authorized current Revision.
 * It deliberately reuses the existing MyeongHa Saju request builders.
 * Saju's parseProductHostReadingRequest v1 must return the exact same shape;
 * tests pin its source-side canonical normalization vectors.
 *
 * No client Birth, targetPersonRef, product manifest or authority is accepted.
 */
export function buildCurrentBirthGeneralNatalSourceProofRequestV1(
  profile: BirthProfileReadResponseV1,
): SajuProductionReadingRequestV1 {
  if (profile.profileKind !== 'self' || profile.archivedAt !== null
    || !Number.isSafeInteger(profile.currentRevision.revisionNo)
    || profile.currentRevision.revisionNo <= 0
    || profile.currentRevision.revisionId.trim() === '') {
    throw new Error('Current self Birth revision is not eligible for source proof.');
  }
  return buildSajuProductionReadingRequestV1({
    birthRevision: bindCurrentBirthProfileRevisionForSajuV1(profile),
    readingText: SAJU_SOURCE_PROOF_GENERAL_NATAL_TEXT_V1,
  });
}
