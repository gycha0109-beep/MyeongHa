export const CHARACTER_SOURCE_AUTHORITIES_V1 = Object.freeze([
  'CANON',
  'SOFT_CANON',
  'AUTHOR_UNDEFINED',
  'INTENTIONALLY_OPEN',
  'WORLD_DEPENDENT',
] as const);

export type CharacterSourceAuthorityV1 =
  (typeof CHARACTER_SOURCE_AUTHORITIES_V1)[number];

export const CHARACTER_KNOWLEDGE_STATES_V1 = Object.freeze([
  'KNOWN',
  'PARTIAL',
  'UNKNOWN_TO_CHARACTER',
  'NOT_APPLICABLE',
] as const);

export type CharacterKnowledgeStateV1 =
  (typeof CHARACTER_KNOWLEDGE_STATES_V1)[number];

export const CHARACTER_DISCLOSURE_DEFAULTS_V1 = Object.freeze([
  'PUBLIC',
  'FAMILIAR',
  'ATTACHED',
  'DEEP_TRUST',
  'CONTEXTUAL',
  'NEVER',
  'NOT_APPLICABLE',
] as const);

export type CharacterDisclosureDefaultV1 =
  (typeof CHARACTER_DISCLOSURE_DEFAULTS_V1)[number];

export interface CharacterFactAuthorityRecordV1 {
  readonly factKey: string;
  readonly sourceAuthority: CharacterSourceAuthorityV1;
  readonly characterKnowledge: CharacterKnowledgeStateV1;
  readonly disclosureDefault: CharacterDisclosureDefaultV1;
  readonly sourceRef: string;
  readonly closureNote: string;
}

function fact(input: CharacterFactAuthorityRecordV1): CharacterFactAuthorityRecordV1 {
  if (input.factKey.trim().length === 0) {
    throw new TypeError('factKey must not be empty.');
  }
  if (input.sourceRef.trim().length === 0) {
    throw new TypeError('sourceRef must not be empty.');
  }
  if (input.closureNote.trim().length === 0) {
    throw new TypeError('closureNote must not be empty.');
  }
  if (
    input.sourceAuthority === 'AUTHOR_UNDEFINED' &&
    (input.characterKnowledge !== 'NOT_APPLICABLE' ||
      input.disclosureDefault !== 'NOT_APPLICABLE')
  ) {
    throw new TypeError(
      'AUTHOR_UNDEFINED is an authoring gap and must not be represented as Character ignorance or secrecy.',
    );
  }
  return Object.freeze({ ...input });
}

/**
 * Derived index of the Se-yeon Bible v0.2 Fact Authority & Biography Closure
 * Appendix. The authored Markdown remains the person-level authority.
 *
 * This is intentionally not generated from character-manifest.v0.schema.json.
 * That manifest remains EXPERIMENTAL_NOT_RUNTIME_BOUND.
 */
export const SEYEON_HIGH_ANSWERABILITY_FACT_AUTHORITY_V1 = Object.freeze({
  'identity.name': fact({
    factKey: 'identity.name',
    sourceAuthority: 'CANON',
    characterKnowledge: 'KNOWN',
    disclosureDefault: 'PUBLIC',
    sourceRef: 'docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md#B1',
    closureNote: '채택',
  }),
  'identity.exact_age': fact({
    factKey: 'identity.exact_age',
    sourceAuthority: 'AUTHOR_UNDEFINED',
    characterKnowledge: 'NOT_APPLICABLE',
    disclosureDefault: 'NOT_APPLICABLE',
    sourceRef: 'docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md#B1',
    closureNote: 'Production 전 closure 필요',
  }),
  'identity.birthday': fact({
    factKey: 'identity.birthday',
    sourceAuthority: 'AUTHOR_UNDEFINED',
    characterKnowledge: 'NOT_APPLICABLE',
    disclosureDefault: 'NOT_APPLICABLE',
    sourceRef: 'docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md#fact-authority-biography-closure-appendix',
    closureNote: 'High-answerability gap',
  }),
  'identity.blood_type': fact({
    factKey: 'identity.blood_type',
    sourceAuthority: 'AUTHOR_UNDEFINED',
    characterKnowledge: 'NOT_APPLICABLE',
    disclosureDefault: 'NOT_APPLICABLE',
    sourceRef: 'docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md#fact-authority-biography-closure-appendix',
    closureNote: '낮은 비용의 closure 후보',
  }),
  'identity.mbti_self_report': fact({
    factKey: 'identity.mbti_self_report',
    sourceAuthority: 'AUTHOR_UNDEFINED',
    characterKnowledge: 'NOT_APPLICABLE',
    disclosureDefault: 'NOT_APPLICABLE',
    sourceRef: 'docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md#fact-authority-biography-closure-appendix',
    closureNote: '성격 원인으로 사용하지 말고 self-report policy만 결정',
  }),
  'life.occupation_or_social_role': fact({
    factKey: 'life.occupation_or_social_role',
    sourceAuthority: 'AUTHOR_UNDEFINED',
    characterKnowledge: 'NOT_APPLICABLE',
    disclosureDefault: 'NOT_APPLICABLE',
    sourceRef: 'docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md#B1',
    closureNote: 'Production 전 closure 필요',
  }),
  'life.current_living_base': fact({
    factKey: 'life.current_living_base',
    sourceAuthority: 'AUTHOR_UNDEFINED',
    characterKnowledge: 'NOT_APPLICABLE',
    disclosureDefault: 'NOT_APPLICABLE',
    sourceRef: 'docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md#I5',
    closureNote: 'Production 전 closure 필요',
  }),
  'backstory.birth_or_growth_region': fact({
    factKey: 'backstory.birth_or_growth_region',
    sourceAuthority: 'AUTHOR_UNDEFINED',
    characterKnowledge: 'NOT_APPLICABLE',
    disclosureDefault: 'NOT_APPLICABLE',
    sourceRef: 'docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md#J1',
    closureNote: '생활권 이동 가설은 HYPOTHESIS이며 authority 아님',
  }),
  'family.structure': fact({
    factKey: 'family.structure',
    sourceAuthority: 'AUTHOR_UNDEFINED',
    characterKnowledge: 'NOT_APPLICABLE',
    disclosureDefault: 'NOT_APPLICABLE',
    sourceRef: 'docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md#J2',
    closureNote: '가족 방향 가설은 HYPOTHESIS이며 authority 아님',
  }),
  'family.current_relationship': fact({
    factKey: 'family.current_relationship',
    sourceAuthority: 'AUTHOR_UNDEFINED',
    characterKnowledge: 'NOT_APPLICABLE',
    disclosureDefault: 'NOT_APPLICABLE',
    sourceRef: 'docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md#J2',
    closureNote: 'Production 전 closure 필요',
  }),
  'backstory.major_turning_points': fact({
    factKey: 'backstory.major_turning_points',
    sourceAuthority: 'AUTHOR_UNDEFINED',
    characterKnowledge: 'NOT_APPLICABLE',
    disclosureDefault: 'NOT_APPLICABLE',
    sourceRef: 'docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md#J3',
    closureNote: '필요 최소 범위만 설계',
  }),
  'past_romance.existence': fact({
    factKey: 'past_romance.existence',
    sourceAuthority: 'AUTHOR_UNDEFINED',
    characterKnowledge: 'NOT_APPLICABLE',
    disclosureDefault: 'NOT_APPLICABLE',
    sourceRef: 'docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md#J4',
    closureNote: '존재 여부부터 closure 필요',
  }),
  'social.important_non_user_relationships': fact({
    factKey: 'social.important_non_user_relationships',
    sourceAuthority: 'AUTHOR_UNDEFINED',
    characterKnowledge: 'NOT_APPLICABLE',
    disclosureDefault: 'NOT_APPLICABLE',
    sourceRef: 'docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md#I3',
    closureNote: '일반적 사교성은 Canon이나 구체 관계는 미정',
  }),
  'life.current_responsibilities': fact({
    factKey: 'life.current_responsibilities',
    sourceAuthority: 'AUTHOR_UNDEFINED',
    characterKnowledge: 'NOT_APPLICABLE',
    disclosureDefault: 'NOT_APPLICABLE',
    sourceRef: 'docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md#I4',
    closureNote: 'Production 전 closure 필요',
  }),
} as const satisfies Readonly<Record<string, CharacterFactAuthorityRecordV1>>);

export type SeyeonHighAnswerabilityFactKeyV1 =
  keyof typeof SEYEON_HIGH_ANSWERABILITY_FACT_AUTHORITY_V1;

export function resolveSeyeonFactAuthorityV1(
  factKey: SeyeonHighAnswerabilityFactKeyV1,
): CharacterFactAuthorityRecordV1 {
  return SEYEON_HIGH_ANSWERABILITY_FACT_AUTHORITY_V1[factKey];
}
