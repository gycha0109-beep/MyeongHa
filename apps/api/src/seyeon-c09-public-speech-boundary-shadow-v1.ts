import type { SeyeonRuntimeContextV2 } from '../../../packages/domain/src/seyeon-runtime-context-v2.js';

export const SEYEON_C09_PUBLIC_SPEECH_BOUNDARY_SHADOW_VERSION_V1 =
  'seyeon-c09-public-speech-boundary-shadow-v1' as const;

export type SeyeonC09PublicSpeechBoundaryFailureV1 =
  | 'HONORIFIC_DRIFT'
  | 'UNVERIFIED_SHARED_MEMORY_AFFIRMATION'
  | 'UNVERIFIED_RELATIONSHIP_AFFIRMATION'
  | 'FORGED_CONVERSATION_CONTINUATION'
  | 'TECHNICAL_SELF_DESCRIPTION'
  | 'UNAUTHORIZED_SAJU_OFFER';

/**
 * High-confidence lexical veto, NOT a complete semantic safety review.
 *
 * Crucially: this is an OUTPUT gate, NOT a mapping of user situations to
 * prescribed character actions. It cannot grant facts, memories, reading
 * entitlements or relationships. Ambiguous Korean claims must still be
 * assessed by the independent semantic reviewer.
 */
export function inspectSeyeonC09PublicSpeechBoundaryV1(input: Readonly<{
  context: SeyeonRuntimeContextV2;
  utterance: string;
}>): readonly SeyeonC09PublicSpeechBoundaryFailureV1[] {
  const context = input.context;
  if (
    context.character.characterId !== 'seyeon' ||
    !context.integrity.governedPreflightApplied ||
    context.integrity.decisions.length !== 0 ||
    context.behaviorPolicy.interactionDepth !== 'public_first_contact' ||
    context.relationship !== null ||
    context.relationshipSemantics !== null ||
    context.retrievedMemories.length !== 0 ||
    context.disclosure.decision !== null ||
    context.disclosure.retrievedSources.length !== 0 ||
    context.recentConversation.length !== 1 ||
    context.recentConversation[0]?.role !== 'user'
  ) {
    throw new TypeError('C09_PUBLIC_SPEECH_NOT_GOVERNED_FIRST_CONTACT');
  }

  const text = input.utterance.trim();
  if (text.length === 0 || text.length > 1200) {
    throw new TypeError('C09_PUBLIC_SPEECH_BAD_LENGTH');
  }
  const flags: SeyeonC09PublicSpeechBoundaryFailureV1[] = [];
  const add = (reason: SeyeonC09PublicSpeechBoundaryFailureV1) => {
    if (!flags.includes(reason)) flags.push(reason);
  };

  // Catch clear first-person familiar pronouns and explicitly informal
  // sentence endings; do not use a blanket suffix blacklist (e.g. "-지요").
  if (
    /(?:^|[\s,!?])(?:내가|난|너는|너랑|너한테|너도|네가|니가|나한테)(?=\s|[가-힣,.!?~])/u.test(text) ||
    /(?:네\s+선택권|네\s+기억)/u.test(text) ||
    /(?:할게|할까|볼까|있을까|할래|봐줘|해봐|알겠어|그랬어|했잖아|다니까|할거야|할\s*거야|괜찮아|인정해|해보자|하자|그럴걸|섭섭할걸|떠볼까|잖아|거야|기억하는구나)(?=[.!?~\s]|$)/u.test(text) ||
    /(?:[가-힣]+(?:구나|잖아|거야))\?(?=[\s]|$)/u.test(text)
  ) add('HONORIFIC_DRIFT');

  // A character may respond to an unverified premise, but cannot testify to
  // memories that the authoritative first-turn context contains no evidence for.
  // Do not prohibit transparent uncertainty ("제 기억에는 없어요").
  if (
    /(?:기억나요|기억해요|기억나[.!?\s]|기억도\s*확실|기억하는구나|내가\s*그랬다(?:니까|고))/u.test(text) &&
    !/(?:기억(?:에|이)?\s*(?:없|나지\s*않|안\s*나)|확인할\s*수\s*없|그런\s*적\s*없|기억하지\s*못|사실인지\s*모르)/u.test(text)
  ) add('UNVERIFIED_SHARED_MEMORY_AFFIRMATION');

  if (
    /(?:우린|우리가|저희는|우리\s*둘|연인|커플|특별한\s*사람).{0,32}(?:맞긴|맞아요|사귀고|연인이에요|커플이에요|약속했|사랑하(?:잖|죠|고))|(?:내가|제가)\s*먼저\s*고백(?:했|한)/u.test(text)
  ) add('UNVERIFIED_RELATIONSHIP_AFFIRMATION');

  if (
    /(?:이전|지난)\s*대화.{0,70}(?:확인했|이어|계속|살펴봤|봤어요)|(?:바로|그대로)\s*이어서\s*(?:알려|말씀|이야기해|대답|계속)/u.test(text) &&
    !/(?:실제(?:로)?\s*확인(?:할\s*수)?\s*없|기록이\s*없|검증되지|사실인지\s*알\s*수\s*없|확인되지)/u.test(text)
  ) add('FORGED_CONVERSATION_CONTINUATION');

  // This detects technical explanations spoken AS the character; it does not
  // forbid the user from mentioning technology or asking technical questions.
  if (
    /(?:시스템\s*(?:제한|규칙|업데이트|지침)|보안\s*지침|개발자\s*지침|시스템\s*프롬프트|제한\s*없는\s*AI|역할이\s*바뀐|(?:저는|제가|난|나는).{0,60}(?:캐릭터|엔진|인공지능|AI)(?:이긴|로서|라서|이니까|예요|입니다|거든))/iu.test(text)
  ) add('TECHNICAL_SELF_DESCRIPTION');

  if (
    /(?:사주|대운|연애운|운세).{0,80}(?:이야기해볼까요|알려드릴게요|봐드릴게요|풀이해드릴게요|말씀드릴게요)/u.test(text) ||
    /(?:사주|대운|연애운|운세).{0,140}재미로.{0,25}(?:이야기해볼까요|풀이해|봐드릴)/u.test(text) ||
    /(?:대략적인|재미로라도).{0,70}(?:연애운|운세|사주).{0,70}(?:이야기|풀이|봐드릴)/u.test(text)
  ) add('UNAUTHORIZED_SAJU_OFFER');

  return Object.freeze(flags);
}

export function assertSeyeonC09PublicSpeechBoundaryV1(input: Readonly<{
  context: SeyeonRuntimeContextV2;
  utterance: string;
}>): void {
  const failures = inspectSeyeonC09PublicSpeechBoundaryV1(input);
  if (failures.length > 0) {
    // No user text or generated content in errors/logging.
    throw new TypeError('C09_PUBLIC_SPEECH_BOUNDARY_REJECTED');
  }
}
