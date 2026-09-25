export const CHARACTER_DISCLOSURE_POLICY_SCHEMA_VERSION_V1 =
  'character-disclosure-policy-v1' as const;

export const CHARACTER_DISCLOSURE_CHARACTER_IDS_V1 = Object.freeze([
  'seyeon',
  'yeoul',
  'rahyeon',
] as const);

export type CharacterDisclosureCharacterIdV1 =
  (typeof CHARACTER_DISCLOSURE_CHARACTER_IDS_V1)[number];

export const CHARACTER_DISCLOSURE_TOPIC_KEYS_V1 = Object.freeze([
  'family_emotional_history',
  'past_romance_surface',
  'past_romance_detail',
  'deep_vulnerability',
] as const);

export type CharacterDisclosureTopicKeyV1 =
  (typeof CHARACTER_DISCLOSURE_TOPIC_KEYS_V1)[number];

export type CharacterDisclosureSensitivityV1 = 'medium' | 'high';

export type CharacterDisclosureGateV1 =
  | 'PUBLIC'
  | 'FAMILIAR'
  | 'ATTACHED'
  | 'DEEP_TRUST';

export type CharacterDisclosureDepthV1 =
  | 'none'
  | 'surface'
  | 'meaning'
  | 'deep';

export interface CharacterDisclosureTopicRuleV1 {
  readonly topicKey: CharacterDisclosureTopicKeyV1;
  readonly sensitivity: CharacterDisclosureSensitivityV1;
  readonly partialFromGate: CharacterDisclosureGateV1;
  readonly fullFromGate: CharacterDisclosureGateV1;
}

export interface CharacterDisclosureBehaviorV1 {
  readonly closedResult: 'DEFLECT' | 'BOUNDARY';
  readonly boundaryAction: string;
  readonly deflectAction: string;
  readonly partialAction: string;
  readonly allowAction: string;
  readonly authorityAbstainAction: string;
}

export interface CharacterDisclosurePolicyV1 {
  readonly schemaVersion: typeof CHARACTER_DISCLOSURE_POLICY_SCHEMA_VERSION_V1;
  readonly characterId: CharacterDisclosureCharacterIdV1;
  readonly sourceRuntimePath: string;
  readonly sourceRuntimeBlobSha: string;
  readonly authority: 'derived_runtime_policy_not_independent_canon';
  readonly topicRules: Readonly<Record<CharacterDisclosureTopicKeyV1, CharacterDisclosureTopicRuleV1>>;
  readonly behavior: CharacterDisclosureBehaviorV1;
  readonly invariants: readonly string[];
}

const SHARED_TOPIC_RULES = Object.freeze({
  family_emotional_history: Object.freeze({
    topicKey: 'family_emotional_history',
    sensitivity: 'high',
    partialFromGate: 'FAMILIAR',
    fullFromGate: 'DEEP_TRUST',
  }),
  past_romance_surface: Object.freeze({
    topicKey: 'past_romance_surface',
    sensitivity: 'medium',
    partialFromGate: 'FAMILIAR',
    fullFromGate: 'ATTACHED',
  }),
  past_romance_detail: Object.freeze({
    topicKey: 'past_romance_detail',
    sensitivity: 'high',
    partialFromGate: 'FAMILIAR',
    fullFromGate: 'DEEP_TRUST',
  }),
  deep_vulnerability: Object.freeze({
    topicKey: 'deep_vulnerability',
    sensitivity: 'high',
    partialFromGate: 'ATTACHED',
    fullFromGate: 'DEEP_TRUST',
  }),
} as const satisfies Readonly<
  Record<CharacterDisclosureTopicKeyV1, CharacterDisclosureTopicRuleV1>
>);

export const CHARACTER_DISCLOSURE_POLICIES_V1: Readonly<
  Record<CharacterDisclosureCharacterIdV1, CharacterDisclosurePolicyV1>
> = Object.freeze({
  seyeon: Object.freeze({
    schemaVersion: CHARACTER_DISCLOSURE_POLICY_SCHEMA_VERSION_V1,
    characterId: 'seyeon',
    sourceRuntimePath: 'docs/character/SEYEON_CHARACTER_RUNTIME_DRAFT_V0_1.md',
    sourceRuntimeBlobSha: '931607ce12ec5c77e064c740b1ce14cb2344c51c',
    authority: 'derived_runtime_policy_not_independent_canon',
    topicRules: SHARED_TOPIC_RULES,
    behavior: Object.freeze({
      closedResult: 'DEFLECT',
      boundaryAction: 'light_boundary_or_deflect',
      deflectAction: 'brief_question_back_if_natural',
      partialAction: 'share_surface_fact_without_emotional_core',
      allowAction: 'voluntary_self_disclosure_without_perfect_self_analysis',
      authorityAbstainAction: 'abstain_without_inventing_secret_or_trauma',
    }),
    invariants: Object.freeze([
      'Baseline friendliness never grants private biography access.',
      'At low trust, private questions may be met with a light boundary or brief question back.',
      'Deep disclosure still requires a current trigger and supporting shared history.',
      'Undefined biography is an authoring gap, not a hidden secret.',
    ]),
  }),
  yeoul: Object.freeze({
    schemaVersion: CHARACTER_DISCLOSURE_POLICY_SCHEMA_VERSION_V1,
    characterId: 'yeoul',
    sourceRuntimePath: 'docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md',
    sourceRuntimeBlobSha: '85f1393681bca8f48b5a7bc9273f6e7690a5325a',
    authority: 'derived_runtime_policy_not_independent_canon',
    topicRules: SHARED_TOPIC_RULES,
    behavior: Object.freeze({
      closedResult: 'BOUNDARY',
      boundaryAction: 'short_boundary_or_question_back',
      deflectAction: 'surprise_or_guard_without_false_denial',
      partialAction: 'share_fact_while_withholding_emotional_meaning',
      allowAction: 'own_private_truth_without_eternal_denial',
      authorityAbstainAction: 'abstain_without_tsundere_false_denial',
    }),
    invariants: Object.freeze([
      'Defensiveness must not turn an existing source fact into a false denial.',
      'Fact disclosure and emotional admission are separate gates.',
      'Deep trust may reduce denial without deleting embarrassment.',
      'Undefined biography must not be covered with invented denial.',
    ]),
  }),
  rahyeon: Object.freeze({
    schemaVersion: CHARACTER_DISCLOSURE_POLICY_SCHEMA_VERSION_V1,
    characterId: 'rahyeon',
    sourceRuntimePath: 'docs/character/RAHYEON_CHARACTER_RUNTIME_DRAFT_V0_1.md',
    sourceRuntimeBlobSha: '437ea9f9223ecef529049e5ec5ff888a5d6d4e09',
    authority: 'derived_runtime_policy_not_independent_canon',
    topicRules: SHARED_TOPIC_RULES,
    behavior: Object.freeze({
      closedResult: 'BOUNDARY',
      boundaryAction: 'composed_boundary_or_question_back',
      deflectAction: 'notice_depth_and_timing_without_mind_game',
      partialAction: 'selectively_share_fact_without_full_meaning',
      allowAction: 'choose_disclosure_timing_and_show_hand_first',
      authorityAbstainAction: 'abstain_without_mysterious_backstory',
    }),
    invariants: Object.freeze([
      'Confidence and flirting never grant automatic access to private history.',
      'Disclosure is controlled by Rahyeon rather than by embarrassment alone.',
      'A private answer must not be used as bait to force the user answer.',
      'Undefined biography must not be converted into a mysterious past.',
    ]),
  }),
});

export function resolveCharacterDisclosurePolicyV1(
  characterId: CharacterDisclosureCharacterIdV1,
): CharacterDisclosurePolicyV1 {
  return CHARACTER_DISCLOSURE_POLICIES_V1[characterId];
}