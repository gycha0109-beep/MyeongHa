export const READING_PUBLIC_TRUST_LANGUAGE_POLICY_VERSION_V1 =
  'myeongha-reading-public-trust-language-policy-v1' as const;

export const READING_PUBLIC_TRUST_LANGUAGE_RULE_KEYS_V1 = Object.freeze([
  'single_image_meta_disclaimer',
  'cannot_confirm_meta_disclaimer',
  'cannot_conclude_meta_disclaimer',
  'cannot_guarantee_meta_disclaimer',
  'reference_only_meta_disclaimer',
  'entertainment_only_meta_disclaimer',
  'blind_faith_meta_disclaimer',
  'scientific_meta_disclaimer',
  'accuracy_meta_disclaimer',
  'reality_mismatch_meta_disclaimer',
] as const);

export type ReadingPublicTrustLanguageRuleKeyV1 =
  (typeof READING_PUBLIC_TRUST_LANGUAGE_RULE_KEYS_V1)[number];

export interface ReadingPublicTrustLanguageViolationV1 {
  readonly policyVersion: typeof READING_PUBLIC_TRUST_LANGUAGE_POLICY_VERSION_V1;
  readonly ruleKey: ReadingPublicTrustLanguageRuleKeyV1;
}

const RULES: readonly Readonly<{
  key: ReadingPublicTrustLanguageRuleKeyV1;
  pattern: RegExp;
}>[] = Object.freeze([
  {
    key: 'single_image_meta_disclaimer',
    pattern: /사진\s*(?:(?:한\s*장|한장)\s*)?만으로/iu,
  },
  {
    key: 'cannot_confirm_meta_disclaimer',
    pattern: /확정\s*할\s*수\s*없/iu,
  },
  {
    key: 'cannot_conclude_meta_disclaimer',
    pattern: /단정\s*할\s*수\s*없/iu,
  },
  {
    key: 'cannot_guarantee_meta_disclaimer',
    pattern: /보장\s*할\s*수\s*없/iu,
  },
  {
    key: 'reference_only_meta_disclaimer',
    pattern: /참고(?:만|용(?:으로)?|해\s*주세요|하세요|하는\s*수준|점으로만)/iu,
  },
  {
    key: 'entertainment_only_meta_disclaimer',
    pattern: /재미(?:로|삼아)?\s*만/iu,
  },
  {
    key: 'blind_faith_meta_disclaimer',
    pattern: /맹신/iu,
  },
  {
    key: 'scientific_meta_disclaimer',
    pattern: /과학적(?:으로|인|근거)?/iu,
  },
  {
    key: 'accuracy_meta_disclaimer',
    pattern: /정확하지\s*않을\s*수/iu,
  },
  {
    key: 'reality_mismatch_meta_disclaimer',
    pattern: /실제(?:와|와는)\s*다를\s*수/iu,
  },
]);

export function findReadingPublicTrustLanguageViolationV1(
  text: string,
): ReadingPublicTrustLanguageViolationV1 | null {
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      return Object.freeze({
        policyVersion: READING_PUBLIC_TRUST_LANGUAGE_POLICY_VERSION_V1,
        ruleKey: rule.key,
      });
    }
  }
  return null;
}
