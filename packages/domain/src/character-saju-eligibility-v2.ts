import type { SajuDomain } from '../../contracts/src/index.js';
import type { CharacterCapabilityContent } from '../../character-content/src/index.js';

/**
 * A3-alpha — distinguish historical Character-content capability from a
 * Product-owned standard Reading admission. This structural contract alone
 * cannot authorize access; the official variant must be minted and consumed
 * by the private server proof registry before any Saju Runtime V2 use.
 */
export type CharacterSajuEligibilityV2 =
  | Readonly<{
      readonly source: 'legacy_character_capability';
      readonly characterCapability: CharacterCapabilityContent;
    }>
  | CharacterSajuOfficialStandardEligibilityV2;

export interface CharacterSajuOfficialStandardEligibilityV2 {
  readonly source: 'official_standard_product_rule';
  readonly admittedDomain: SajuDomain;
  readonly productId: string;
  readonly policyRevision: string;
  readonly readingRef: string;
  readonly subjectId: string;
  readonly readerCharacterId: string;
  readonly threadId: string;
  readonly readerContentBundleId: string;
  readonly contentReleaseId: string;
  readonly officialArtifactResponseHash: string;
}
