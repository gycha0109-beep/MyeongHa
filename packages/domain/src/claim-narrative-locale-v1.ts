/**
 * International presentation boundary for source-owned ClaimNarrativeProfile
 * (Personalized Interpretation Architecture v1.3, sections 44-47).
 * A selected template is NOT an authority to create a claim.
 * Never translate a Korean claim ad-hoc or silently fall back to Korean.
 */
export const NARRATIVE_OUTPUT_LOCALES_V1 = ['ko-KR', 'ja-JP', 'zh-TW'] as const;
export type NarrativeOutputLocaleV1 = typeof NARRATIVE_OUTPUT_LOCALES_V1[number];

export interface ClaimNarrativeProfileV1 {
  readonly profileId: string;
  readonly version: string;
  readonly claimType: string;
  readonly semanticKeys?: readonly string[];
  readonly allowedEpistemicTypes: readonly string[];
  readonly requiredMethodAttribution: boolean;
  readonly mandatoryQualifier?: string;
  readonly prohibitedPhrases?: readonly string[];
  readonly renderingHints?: readonly string[];
  readonly templates?: readonly {
    readonly templateKey: string;
    readonly language: string;
    readonly text: string;
  }[];
}

export type ClaimNarrativeLocaleDecisionV1 =
  | Readonly<{
    state: 'selected';
    profileId: string;
    version: string;
    semanticKey: string;
    language: NarrativeOutputLocaleV1;
    templateKey: string;
    text: string;
  }>
  | Readonly<{
    state: 'unavailable';
    reason: 'unsupported_locale' | 'claim_not_admitted' | 'template_missing' | 'template_ambiguous' | 'profile_invalid';
  }>;

export function selectClaimNarrativeLocaleTemplateV1(input: Readonly<{
  profile: ClaimNarrativeProfileV1;
  claimType: string;
  semanticKey: string;
  epistemicType: string;
  locale: string;
  templateKey: string;
}>): ClaimNarrativeLocaleDecisionV1 {
  const { profile, claimType, semanticKey, epistemicType, locale, templateKey } = input;
  if (!NARRATIVE_OUTPUT_LOCALES_V1.some((x) => x === locale)) {
    return Object.freeze({ state: 'unavailable', reason: 'unsupported_locale' });
  }
  if (
    typeof profile?.profileId !== 'string' || !profile.profileId.trim() ||
    typeof profile?.version !== 'string' || !profile.version.trim() ||
    typeof profile.claimType !== 'string' || !profile.claimType.trim() ||
    typeof templateKey !== 'string' || !templateKey.trim() ||
    !Array.isArray(profile.allowedEpistemicTypes)
  ) {
    return Object.freeze({ state: 'unavailable', reason: 'profile_invalid' });
  }
  if (
    claimType !== profile.claimType ||
    !profile.allowedEpistemicTypes.includes(epistemicType) ||
    (profile.semanticKeys && !profile.semanticKeys.includes(semanticKey))
  ) {
    return Object.freeze({ state: 'unavailable', reason: 'claim_not_admitted' });
  }
  const matches = (profile.templates ?? []).filter(
    (template) => template.templateKey === templateKey && template.language === locale,
  );
  if (matches.length === 0) return Object.freeze({ state: 'unavailable', reason: 'template_missing' });
  if (matches.length > 1) return Object.freeze({ state: 'unavailable', reason: 'template_ambiguous' });
  const template = matches[0];
  if (!template || !template.text.trim()) {
    return Object.freeze({ state: 'unavailable', reason: 'template_missing' });
  }
  // SELECT only. Mandatory qualifiers, method attribution, semantic preservation
  // and release admission still belong to the existing authoritative renderer.
  // Selection is not permission to publish.
  // This function only SELECTS an exact, already approved authored template.
  // It cannot interpolate user input, run an LLM, or change semantic provenance.
  return Object.freeze({
    state: 'selected',
    profileId: profile.profileId,
    version: profile.version,
    semanticKey,
    language: locale as NarrativeOutputLocaleV1,
    templateKey,
    text: template.text,
  });
}
