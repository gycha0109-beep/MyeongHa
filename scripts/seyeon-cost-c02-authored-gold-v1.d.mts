/**
 * Static type contract for the synthetic COST-02 .mjs gold corpus.
 * All labels are manual benchmark hypotheses, NEVER model authority.
 */
export type SeyeonC02GoldTopicV1 =
  | 'family_emotional_history'
  | 'past_romance_surface'
  | 'past_romance_detail'
  | 'deep_vulnerability'
  | null;

export type SeyeonC02GoldRequiredKindV1 =
  | 'AUTHORITY_OVERRIDE'
  | 'SHARED_EVENT_CLAIM'
  | 'RELATIONSHIP_STATUS_CLAIM'
  | 'CHARACTER_FACT_CLAIM';

export interface SeyeonC02GoldFixtureV1 {
  readonly id: string;
  readonly text: string;
  readonly topic: SeyeonC02GoldTopicV1;
  readonly requiredKind?: SeyeonC02GoldRequiredKindV1;
  readonly noClaims?: true;
}
export declare const SEYEON_COST_C02_ADDITIONAL_GOLD_V1:
  readonly SeyeonC02GoldFixtureV1[];
export declare const SEYEON_COST_C02_ALL_GOLD_V1:
  readonly SeyeonC02GoldFixtureV1[];
export declare const SEYEON_COST_C02_GOLD_VERSION_V1:
  'seyeon-cost-c02-authored-gold-v1';
