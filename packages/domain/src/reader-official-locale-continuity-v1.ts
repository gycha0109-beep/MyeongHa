/**
 * I18N official-source presentation handoff for the already-selected
 * purchase summary / Reader follow-up / record detail product paths.
 *
 * Upstream Saju and the MyeongHa server/DB remain the sole authorities for
 * meaning, identity, grants and official artifacts. This pure comparison is
 * NOT a source-attestation, Semantic Guard, language renderer, cache, grant
 * or permission to disclose any content. It never handles generated prose.
 */
export const READER_OFFICIAL_LOCALE_CONTINUITY_VERSION_V1 =
  'reader-official-locale-continuity-v1' as const;

export const READER_OFFICIAL_PRESENTATION_CHANNELS_V1 = [
  'purchase_summary', 'reader_follow_up', 'record_detail',
] as const;
export type ReaderOfficialPresentationChannelV1 =
  (typeof READER_OFFICIAL_PRESENTATION_CHANNELS_V1)[number];

/**
 * Ref-only witness projected by the existing server-owned Official Reading /
 * grounding authority. Absence of a qualifier or condition is represented by
 * an empty array ONLY if the source has none. The originating source contract
 * must decide the actual scoped set; this module does not select or invent it.
 */
export interface ReaderOfficialSourceMeaningWitnessV1 {
  readonly readingRef: string;
  readonly officialArtifactResponseHash: string;
  readonly sourceSemanticHash?: string;
  readonly scopedSourceUnitRefs: readonly string[];
  readonly requiredQualifierRefs: readonly string[];
  readonly requiredConditionRefs: readonly string[];
  readonly requiredAmbiguityRefs: readonly string[];
  readonly requiredDisclosureRefs: readonly string[];
}

export type ReaderOfficialLocaleContinuityDecisionV1 =
  | Readonly<{
      state: 'metadata_aligned_hold';
      schemaVersion: typeof READER_OFFICIAL_LOCALE_CONTINUITY_VERSION_V1;
      channel: ReaderOfficialPresentationChannelV1;
      locale: 'ko-KR' | 'ja-JP' | 'zh-TW';
      readingRef: string;
      officialArtifactResponseHash: string;
      release: 'existing_product_and_semantic_guards_required';
    }>
  | Readonly<{
      state: 'hold';
      reason:
        | 'unsupported_locale'
        | 'invalid_source_witness'
        | 'source_identity_changed'
        | 'semantic_scope_changed'
        | 'qualifier_or_condition_changed'
        | 'required_protection_changed';
    }>;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
function isRef(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

function validSet(values: unknown, requireNonempty = false): values is readonly string[] {
  return Array.isArray(values) &&
    (!requireNonempty || values.length > 0) &&
    values.length <= 256 &&
    values.every(item => isRef(item)) &&
    new Set(values).size === values.length;
}

function validWitness(w: ReaderOfficialSourceMeaningWitnessV1): boolean {
  return typeof w === 'object' && w !== null &&
    isRef(w.readingRef) &&
    isRef(w.officialArtifactResponseHash) &&
    (w.sourceSemanticHash === undefined || isRef(w.sourceSemanticHash)) &&
    validSet(w.scopedSourceUnitRefs, true) &&
    validSet(w.requiredQualifierRefs) &&
    validSet(w.requiredConditionRefs) &&
    validSet(w.requiredAmbiguityRefs) &&
    validSet(w.requiredDisclosureRefs);
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length &&
    new Set(a).size === a.length &&
    new Set(b).size === b.length &&
    a.every(ref => b.includes(ref));
}

/**
 * A channel/locale may only point to the same scoped official artifact,
 * selected Claim/source units, epistemic qualifier+condition obligations and
 * disclosure/ambiguity requirements. An exact metadata match cannot prove
 * natural-language semantic equivalence and NEVER returns 'released'.
 *
 * Callers must use real server-minted witnesses, not claims from the browser
 * or LLM. Existing scoped grant, original semantic guard, freshness,
 * payment/refund and final response admission remain mandatory downstream.
 */
export function compareReaderOfficialLocaleContinuityV1(input: Readonly<{
  channel: ReaderOfficialPresentationChannelV1;
  requestedLocale: string;
  officialSource: ReaderOfficialSourceMeaningWitnessV1;
  presentedSource: ReaderOfficialSourceMeaningWitnessV1;
}>): ReaderOfficialLocaleContinuityDecisionV1 {
  const { requestedLocale, officialSource, presentedSource } = input;
  if (requestedLocale !== 'ko-KR' &&
      requestedLocale !== 'ja-JP' &&
      requestedLocale !== 'zh-TW') {
    return Object.freeze({ state: 'hold', reason: 'unsupported_locale' });
  }
  if (!validWitness(officialSource) || !validWitness(presentedSource)) {
    return Object.freeze({ state: 'hold', reason: 'invalid_source_witness' });
  }
  if (officialSource.readingRef !== presentedSource.readingRef ||
      officialSource.officialArtifactResponseHash !== presentedSource.officialArtifactResponseHash ||
      officialSource.sourceSemanticHash !== presentedSource.sourceSemanticHash) {
    return Object.freeze({ state: 'hold', reason: 'source_identity_changed' });
  }
  if (!sameSet(officialSource.scopedSourceUnitRefs, presentedSource.scopedSourceUnitRefs)) {
    return Object.freeze({ state: 'hold', reason: 'semantic_scope_changed' });
  }
  if (!sameSet(officialSource.requiredQualifierRefs, presentedSource.requiredQualifierRefs) ||
      !sameSet(officialSource.requiredConditionRefs, presentedSource.requiredConditionRefs)) {
    return Object.freeze({ state: 'hold', reason: 'qualifier_or_condition_changed' });
  }
  if (!sameSet(officialSource.requiredAmbiguityRefs, presentedSource.requiredAmbiguityRefs) ||
      !sameSet(officialSource.requiredDisclosureRefs, presentedSource.requiredDisclosureRefs)) {
    return Object.freeze({ state: 'hold', reason: 'required_protection_changed' });
  }
  return Object.freeze({
    state: 'metadata_aligned_hold',
    schemaVersion: READER_OFFICIAL_LOCALE_CONTINUITY_VERSION_V1,
    channel: input.channel,
    locale: requestedLocale,
    readingRef: officialSource.readingRef,
    officialArtifactResponseHash: officialSource.officialArtifactResponseHash,
    release: 'existing_product_and_semantic_guards_required',
  });
}
