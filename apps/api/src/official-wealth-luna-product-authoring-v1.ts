import {
  buildCharacterReadingPlanDecisionV1,
  type CharacterPerspectiveProfileV1,
  type CharacterRuntimeContextWithGroundingV1,
  type CharacterSajuGroundingBundleViewV1,
} from '../../../packages/domain/src/index.js';
import { buildWealthProductChapterPlacementV1 } from '../../../packages/domain/src/saju-wealth-chapter-placement-v1.js';
import type { OfficialReadingRecordV1 } from './official-reading-record-read.js';
import {
  buildNotionWealthSixChapterLunaSourceV1,
  type SignedNativeReadingToIssuedRecordBindingV1,
} from './official-wealth-luna-product-source-v1.js';

/**
 * The FINAL edit from Saju source-owned meaning to a six-chapter Luna prompt.
 *
 * Inputs must be supplied ONLY after current paid owner authorization, signed
 * Saju issue-proof verification, and pinned Character context admission. The
 * same existing selector + Reader plan used for bounded rendering is invoked:
 * no duplicate Claim engine, independent product mapper or free-text heuristic.
 *
 * An insufficient selected source returns a held result, not a generic
 * budgeting article or an ordinary six-heading template.
 */
export function authorApprovedWealthProductSourceV1(input:ReadOnlyInput):ReturnType<
  typeof buildNotionWealthSixChapterLunaSourceV1> {
  const { issued, context, grounding, perspective, verifiedBinding }=input;
  if (issued.approvedComponent!=='wealth' ||
      issued.sajuDomain!=='wealth' ||
      issued.productResponseState!=='delivered' ||
      issued.readerCharacterIds.length!==1 ||
      issued.readerCharacterIds[0]!==context.characterId ||
      issued.readerCharacterIds[0]!=='taegyeom' ||
      context.saju?.groundingRef===null ||
      context.saju?.groundingRef===undefined ||
      context.saju.readingRef!==issued.readingId ||
      context.saju.domain!=='wealth' ||
      perspective.characterId!==context.characterId ||
      perspective.sourceContentVersion!==context.contentVersion ||
      perspective.sourceSajuProfileVersion!==context.sajuProfile.profileVersion ||
      grounding.readingRef!==issued.readingId ||
      grounding.groundingHash!==context.saju.groundingRef.groundingHash ||
      grounding.sourceResponseHash!==context.saju.groundingRef.sourceResponseHash ||
      verifiedBinding.issuedReadingId!==issued.readingId) {
    throw new TypeError('Verified Wealth Reader authoring identity mismatch');
  }
  // Reuse the SAME deterministic selector and Reader plan; a caller cannot
  // provide a hand-written "approved plan" as a shortcut.
  const decision=buildCharacterReadingPlanDecisionV1({
    context,grounding,perspective,requestedDomain:'wealth',
  });
  const placement=buildWealthProductChapterPlacementV1({
    component:'wealth',decision,grounding,
  });
  return buildNotionWealthSixChapterLunaSourceV1({
    issued,placement,verifiedBinding,
    requiredProtectedDisclosures:Object.fromEntries(
      grounding.disclosures.map(disclosure=>[disclosure.disclosureRef,disclosure.text]),
    ),
  });
}

interface ReadOnlyInput {
  readonly issued:OfficialReadingRecordV1;
  readonly context:CharacterRuntimeContextWithGroundingV1;
  readonly grounding:CharacterSajuGroundingBundleViewV1;
  readonly perspective:CharacterPerspectiveProfileV1;
  readonly verifiedBinding:SignedNativeReadingToIssuedRecordBindingV1;
}
