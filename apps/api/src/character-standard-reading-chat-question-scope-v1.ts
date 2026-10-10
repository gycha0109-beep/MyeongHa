import { createHash } from 'node:crypto';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import {
  assertServerPreparedStandardChatPreflightV2,
  type CharacterStandardReadingChatTurnPreflightV2,
} from './character-standard-reading-chat-turn-preflight-v2.js';
import {
  assertServerPreparedStandardChatGroundingV2,
  type CharacterStandardChatGroundingV2,
} from './character-standard-reading-chat-grounding-v2.js';
import {
  selectCharacterStandardFollowupEvidenceV1,
  type CharacterStandardFollowupEvidenceDecisionV1,
  type ValidatedStandardFollowupAnchorAuthorityPortV1,
} from './character-standard-reading-chat-followup-evidence-v1.js';

export const STANDARD_FOLLOWUP_QUESTION_SCOPE_VERSION_V1 =
  'myeongha-standard-followup-question-scope-v1' as const;

type AdmittedEvidenceV1 = Exclude<
  CharacterStandardFollowupEvidenceDecisionV1,
  { readonly mode: 'hold' }
>;

export type CharacterStandardFollowupQuestionScopeDecisionV1 =
  | Readonly<{
      schemaVersion: typeof STANDARD_FOLLOWUP_QUESTION_SCOPE_VERSION_V1;
      mode: 'bounded_explanation_candidate' | 'protected_only_candidate';
      intent: 'explain_last_validated_answer';
      questionHash: string;
      scopeHash: string;
      evidence: AdmittedEvidenceV1;
    }>
  | Readonly<{
      schemaVersion: typeof STANDARD_FOLLOWUP_QUESTION_SCOPE_VERSION_V1;
      mode: 'hold';
      reason: 'unsupported_question' | 'new_authority_required' |
        'clarification_required' | 'insufficient_evidence';
    }>;

const serverMintedQuestionScopes = new WeakSet<object>();

/** A structural clone or caller-crafted hash can never authorize downstream rendering. */
export function assertServerPreparedStandardFollowupQuestionScopeV1(
  candidate: unknown,
): asserts candidate is Exclude<
  CharacterStandardFollowupQuestionScopeDecisionV1,
  { readonly mode: 'hold' }
> {
  if (typeof candidate !== 'object' || candidate === null ||
      !serverMintedQuestionScopes.has(candidate)) {
    throw new Error('Official Reader follow-up question scope is unavailable.');
  }
}

function hold(reason: Extract<
  CharacterStandardFollowupQuestionScopeDecisionV1,
  { readonly mode: 'hold' }
>['reason']): CharacterStandardFollowupQuestionScopeDecisionV1 {
  return Object.freeze({
    schemaVersion: STANDARD_FOLLOWUP_QUESTION_SCOPE_VERSION_V1,
    mode: 'hold' as const,
    reason,
  });
}

// Exact source-domain words are not free-text topic matching: they are
// one narrow, affirmative reference to the *already purchased* Reading.
const DOMAIN_NAMES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  general: Object.freeze(['종합']),
  family: Object.freeze(['가족']),
  relationship: Object.freeze(['관계', '연애']),
  compatibility: Object.freeze(['궁합']),
  career: Object.freeze(['직업', '진로']),
  business: Object.freeze(['사업']),
  wealth: Object.freeze(['재물', '금전']),
  life_stage: Object.freeze(['인생 단계']),
  question_specific: Object.freeze(['개별 질문']),
});

const REFERENCES_TO_PRIOR_ANSWER = Object.freeze([
  /^그 부분을 (?:조금 )?더 (?:쉽게 )?설명해 ?주세요[.!?]?$/u,
  /^방금 (?:말씀하신|설명하신) 내용을 (?:조금 )?더 (?:쉽게 )?설명해 ?주세요[.!?]?$/u,
  /^방금 (?:말씀하신|설명하신) 내용이 무슨 뜻인가요[.!?]?$/u,
  /^그건 무슨 뜻인가요[.!?]?$/u,
] as const);

const EXACT_READING_REFERENCE =
  /^방금 본 (.+) 해석을 (?:조금 )?더 (?:쉽게 )?설명해 ?주세요[.!?]?$/u;

/**
 * Lexical check only. Does not select a Unit or prove an Official Reading grant.
 * Unlike follow-up pronouns, initial entry must refer explicitly to the
 * already purchased Reading's admitted domain.
 */
export function classifyExactOfficialReadingReferenceV1(
  text: unknown,
  admittedDomain: string,
): 'admitted' | 'unsupported_question' | 'new_authority_required' {
  if (typeof text !== 'string' || text.length > 240 ||
      /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u.test(text)) {
    return 'unsupported_question';
  }
  const normalized = text.normalize('NFKC').trim().replace(/ +/gu, ' ');
  if (normalized.length === 0 || normalized.length > 160) return 'unsupported_question';
  const reference = EXACT_READING_REFERENCE.exec(normalized);
  if (reference !== null) {
    return DOMAIN_NAMES[admittedDomain]?.includes(reference[1] ?? '') === true
      ? 'admitted'
      : 'new_authority_required';
  }
  return SOURCE_CHANGE_REQUEST.test(normalized)
    ? 'new_authority_required'
    : 'unsupported_question';
}

const SOURCE_CHANGE_REQUEST =
  /(?:[0-9]{4}\s*년|내년|내후년|작년|올해|이번\s*달|다음\s*달|다음\s*해|언제|몇\s*월|월운|세운|대운|새로\s*계산|다시\s*계산|다른\s*사람|새로운\s*사주|궁합\s*봐|실시간|미래\s*예측)/u;

function classify(text: unknown, admittedDomain: string):
  'admitted' | 'unsupported_question' | 'new_authority_required' {
  if (typeof text !== 'string' || text.length > 240 ||
      /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u.test(text)) {
    return 'unsupported_question';
  }
  const normalized = text.normalize('NFKC').trim().replace(/ +/gu, ' ');
  if (normalized.length === 0 || normalized.length > 160) return 'unsupported_question';

  if (REFERENCES_TO_PRIOR_ANSWER.some(pattern => pattern.test(normalized))) {
    return 'admitted';
  }
  return classifyExactOfficialReadingReferenceV1(text, admittedDomain);
}

/**
 * A3-iota: conservative language admission for a follow-up to the last committed
 * semantic-guard-passed assistant answer.
 *
 * A free-text model classification cannot issue evidence. This narrow exact-form
 * classifier ONLY admits a request to explain the most recent validated focus,
 * in the same existing official Reading and domain. Unknown, speculative,
 * multi-intent and novel-period questions fail closed without rendering.
 *
 * Even an admitted candidate is NOT permission for an AI answer, persistence,
 * public release, or a new Saju calculation. PR3 and atomic Commit are separate.
 */
export async function classifyCharacterStandardFollowupQuestionScopeV1(input: Readonly<{
  preflight: CharacterStandardReadingChatTurnPreflightV2;
  grounded: CharacterStandardChatGroundingV2;
  anchorAuthorityPort: ValidatedStandardFollowupAnchorAuthorityPortV1;
}>): Promise<CharacterStandardFollowupQuestionScopeDecisionV1> {
  assertServerPreparedStandardChatPreflightV2(input.preflight);
  assertServerPreparedStandardChatGroundingV2(input.grounded);

  const questionText = input.preflight.receivePlan.normalizedRequest.text;
  if (typeof questionText !== 'string') return hold('unsupported_question');

  const kind = classify(questionText, input.grounded.scope.sajuDomain);
  if (kind !== 'admitted') return hold(kind);

  const evidence = await selectCharacterStandardFollowupEvidenceV1(input);
  if (evidence.mode === 'hold') return hold(evidence.reason);

  const questionHash = `sha256:v1:${createHash('sha256')
    .update(questionText)
    .digest('hex')}`;
  const withoutHash = {
    schemaVersion: STANDARD_FOLLOWUP_QUESTION_SCOPE_VERSION_V1,
    mode: evidence.mode === 'protected_only'
      ? 'protected_only_candidate' as const
      : 'bounded_explanation_candidate' as const,
    intent: 'explain_last_validated_answer' as const,
    questionHash,
    evidence,
  };
  const result = Object.freeze({
    ...withoutHash,
    scopeHash: `sha256:v1:${createHash('sha256')
      .update(canonicalJson(withoutHash)).digest('hex')}`,
  });
  serverMintedQuestionScopes.add(result);
  return result;
}
