import {
  prepareReaderVoiceLocaleCompositionV1,
  validateCharacterVoiceContinuityV1,
  type CharacterConversationSurfaceV1,
  type CharacterVoiceAuthorityV1,
} from '../../character-content/src/index.js';
import {
  compareReaderOfficialLocaleContinuityV1,
  type ReaderOfficialPresentationChannelV1,
  type ReaderOfficialSourceMeaningWitnessV1,
} from './reader-official-locale-continuity-v1.js';

/**
 * I18N-06d: read-only output-boundary handoff for the existing Reader owner.
 *
 * Neither an interface language preference nor an exact metadata comparison
 * can certify natural-language equivalence or authorize Reader output.
 * The Character output guard, Saju/Face semantic guard, current DB grants,
 * and final product release gate remain owned by their existing tracks.
 *
 * No new provider, LLM call, prompt, output language release, or DB mutation.
 */
export const READER_VOICE_LOCALE_OUTPUT_BOUNDARY_VERSION_V1 =
  'reader-voice-locale-output-boundary-v1' as const;

export interface ReaderVoiceLocaleOutputEvidenceV1 {
  readonly characterId: string;
  readonly sourceContentVersion: string;
  readonly surface: CharacterConversationSurfaceV1;
  /** Server-owned output locale, NOT X-MyeongHa-UI-Locale. */
  readonly responseLocale: string;
  /** References to actual published and owner-approved locale style entries. */
  readonly appliedStyleRefs: readonly string[];
  /** Owner-resolved situation keys only; a style cannot activate itself. */
  readonly activeContextRuleRefs: readonly string[];
  /** Keys must be derived and attested by the existing context owner. */
  readonly introducedRealityFactKeys: readonly string[];
  readonly authorizedRealityFactKeys: readonly string[];
  readonly proseStageDirections: readonly string[];
  readonly sajuVoiceOverrideRequested?: boolean;
}

/** Only the existing official source owner may assemble these witnesses. */
export interface ReaderVoiceLocaleOfficialSourceEvidenceV1 {
  readonly channel: ReaderOfficialPresentationChannelV1;
  readonly officialSource: ReaderOfficialSourceMeaningWitnessV1;
  readonly presentedSource: ReaderOfficialSourceMeaningWitnessV1;
}

export type ReaderVoiceLocaleOutputBoundaryDecisionV1 =
  | Readonly<{
      state: 'korean_existing_unchanged';
      schemaVersion: typeof READER_VOICE_LOCALE_OUTPUT_BOUNDARY_VERSION_V1;
      characterId: string;
      sourceContentVersion: string;
      release: 'existing_owner_guards_only';
      semanticValidity: 'not_attested_by_i18n';
    }>
  | Readonly<{
      state: 'hold';
      reason:
        | 'neutral_voice_unavailable'
        | 'invalid_output_evidence'
        | 'voice_identity_mismatch'
        | 'voice_surface_mismatch'
        | 'locale_evidence_mismatch'
        | 'voice_continuity_failed'
        | 'unapproved_style_reference'
        | 'unapproved_context_condition'
        | 'official_source_evidence_missing'
        | 'official_source_evidence_unexpected'
        | 'official_source_meaning_changed'
        | 'non_korean_release_not_admitted';
      foreignRelease: 'hold';
    }>;

const SURFACES: readonly string[] =
  ['general_chat', 'saju_product', 'face_product'];

function boundedText(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length > 0 && value.length <= 256 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}

function validRefs(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length <= 256 &&
    value.every(item => boundedText(item)) &&
    new Set(value).size === value.length;
}

const EVIDENCE_KEYS = Object.freeze([
  'characterId', 'sourceContentVersion', 'surface', 'responseLocale',
  'appliedStyleRefs', 'activeContextRuleRefs', 'introducedRealityFactKeys',
  'authorizedRealityFactKeys', 'proseStageDirections',
  'sajuVoiceOverrideRequested',
] as const);

function validEvidence(value: ReaderVoiceLocaleOutputEvidenceV1): boolean {
  if (value === null || typeof value !== 'object' ||
      Object.keys(value).some(key => !EVIDENCE_KEYS.some(allowed => allowed === key))) {
    return false;
  }
  return boundedText(value.characterId) &&
    boundedText(value.sourceContentVersion) &&
    boundedText(value.responseLocale) &&
    SURFACES.includes(value.surface) &&
    validRefs(value.appliedStyleRefs) &&
    validRefs(value.activeContextRuleRefs) &&
    validRefs(value.introducedRealityFactKeys) &&
    validRefs(value.authorizedRealityFactKeys) &&
    validRefs(value.proseStageDirections) &&
    (value.sajuVoiceOverrideRequested === undefined ||
      typeof value.sajuVoiceOverrideRequested === 'boolean');
}

function hold(
  reason: Extract<ReaderVoiceLocaleOutputBoundaryDecisionV1,
    { readonly state: 'hold' }>['reason'],
): ReaderVoiceLocaleOutputBoundaryDecisionV1 {
  return Object.freeze({ state: 'hold', reason, foreignRelease: 'hold' });
}

/**
 * Reads structured evidence only. Upstream evidence MUST come from existing
 * server-minted Character/context/official-reading authorities; it is not a
 * user-submitted proof. In particular, a caller must not use the returned KO
 * state in place of existing runtime/semantic/product admission.
 */
export function inspectReaderVoiceLocaleOutputBoundaryV1(input: Readonly<{
  selectedCharacterId: string;
  voiceAuthority: CharacterVoiceAuthorityV1;
  requestedVoiceLocale: string;
  evidence: ReaderVoiceLocaleOutputEvidenceV1;
  officialReading?: ReaderVoiceLocaleOfficialSourceEvidenceV1;
}>): ReaderVoiceLocaleOutputBoundaryDecisionV1 {
  const composition = prepareReaderVoiceLocaleCompositionV1({
    selectedCharacterId: input.selectedCharacterId,
    voiceAuthority: input.voiceAuthority,
    requestedVoiceLocale: input.requestedVoiceLocale,
  });
  if (composition.state === 'hold') {
    return hold('neutral_voice_unavailable');
  }

  const evidence = input.evidence;
  if (!validEvidence(evidence)) return hold('invalid_output_evidence');
  if (evidence.characterId !== composition.characterId ||
      evidence.sourceContentVersion !== composition.sourceContentVersion) {
    return hold('voice_identity_mismatch');
  }
  if (evidence.surface !== input.voiceAuthority.surface) {
    return hold('voice_surface_mismatch');
  }
  if (evidence.responseLocale !== input.requestedVoiceLocale) {
    return hold('locale_evidence_mismatch');
  }

  const voiceContinuity = validateCharacterVoiceContinuityV1({
    characterId: composition.characterId,
    characterContentVersion: composition.sourceContentVersion,
    voiceAuthorityCharacterId: input.voiceAuthority.characterId,
    voiceAuthorityContentVersion: input.voiceAuthority.contentVersion,
    surface: evidence.surface,
    ...(evidence.sajuVoiceOverrideRequested === undefined
      ? {}
      : { sajuVoiceOverrideRequested: evidence.sajuVoiceOverrideRequested }),
    introducedRealityFactKeys: evidence.introducedRealityFactKeys,
    authorizedRealityFactKeys: evidence.authorizedRealityFactKeys,
    proseStageDirections: evidence.proseStageDirections,
  });
  if (!voiceContinuity.ok) return hold('voice_continuity_failed');

  const isSaju = evidence.surface === 'saju_product';
  if (isSaju && input.officialReading === undefined) {
    return hold('official_source_evidence_missing');
  }
  if (!isSaju && input.officialReading !== undefined) {
    return hold('official_source_evidence_unexpected');
  }
  if (isSaju && input.officialReading !== undefined) {
    const sourceDecision = compareReaderOfficialLocaleContinuityV1({
      ...input.officialReading,
      requestedLocale: input.requestedVoiceLocale,
    });
    if (sourceDecision.state !== 'metadata_aligned_hold') {
      return hold('official_source_meaning_changed');
    }
  }

  const contextRules = composition.state === 'approved_delta_prepared'
    ? composition.styleRefs.contextRules
    : [];
  if (evidence.activeContextRuleRefs.some(ref =>
    !contextRules.some(rule => rule.conditionRef === ref))) {
    return hold('unapproved_context_condition');
  }
  const approvedStyleRefs = composition.state === 'approved_delta_prepared'
    ? [
        composition.styleRefs.firstPersonRef,
        composition.styleRefs.addresseeStyleRef,
        composition.styleRefs.politenessRegisterRef,
        composition.styleRefs.sentenceEndingRef,
        // A previously approved style is not automatically usable in every
        // context. The current situation must be owner-resolved first.
        ...contextRules
          .filter(rule => evidence.activeContextRuleRefs.includes(rule.conditionRef))
          .map(rule => rule.styleRef),
      ].filter((ref): ref is string => ref !== undefined)
    : [];

  if (evidence.appliedStyleRefs.some(ref => !approvedStyleRefs.includes(ref))) {
    return hold('unapproved_style_reference');
  }

  // A full locale guard requires future Character-owner approvals plus
  // natural-language semantic/persona validation by the Reader owner. This
  // deliberately NEVER returns a 'released' state for non-Korean output.
  if (composition.state !== 'korean_existing') {
    return hold('non_korean_release_not_admitted');
  }
  return Object.freeze({
    state: 'korean_existing_unchanged',
    schemaVersion: READER_VOICE_LOCALE_OUTPUT_BOUNDARY_VERSION_V1,
    characterId: composition.characterId,
    sourceContentVersion: composition.sourceContentVersion,
    release: 'existing_owner_guards_only',
    semanticValidity: 'not_attested_by_i18n',
  });
}
