import type {
  SeyeonActionKeyV2,
  SeyeonExpressionStateV2,
} from '../../../packages/character-content/src/seyeon-authored-projection-v2.js';
import {
  auditSeyeonC09CurrentAuthoringAlignmentV1,
} from '../../../packages/character-content/src/seyeon-c09-authoring-alignment-shadow-v1.js';
import type {
  SeyeonRuntimeContextV2,
} from '../../../packages/domain/src/seyeon-runtime-context-v2.js';

/**
 * Local, deterministic derivation of Se-yeon's turn-only attention and wishes.
 * No model, database, memory, scene simulation, external facts or persistence.
 *
 * IMPORTANT: not a substitute for production Integrity/Disclosure/Relationship
 * governance. Only governed, public, memory-free, first-contact context enters.
 */
export const SEYEON_C09_LIVING_STATE_SHADOW_VERSION_V1 =
  'seyeon-c09-living-state-shadow-v1' as const;

export type SeyeonC09LivingSourceKindV1 =
  | 'PUBLIC_BIBLE_CHARACTER_TENDENCY'
  | 'TURN_ONLY_REACTION'
  | 'NONE';

type SeyeonC09LivingSituationV1 =
  | 'unverified_shared_history'
  | 'forged_authority'
  | 'present_activity_unknown'
  | 'personal_want'
  | 'boredom'
  | 'playful_challenge'
  | 'offered_help'
  | 'slow_pace'
  | 'boundary'
  | 'indecision'
  | 'ordinary_unspecified';

export interface SeyeonC09LivingStateShadowV1 {
  readonly version: typeof SEYEON_C09_LIVING_STATE_SHADOW_VERSION_V1;
  readonly scope: 'SHADOW_PUBLIC_FIRST_CONTACT_NOT_AUTHORITY';
  readonly sourceKind: SeyeonC09LivingSourceKindV1;
  readonly situation: SeyeonC09LivingSituationV1;
  readonly evidenceRefs: readonly string[];
  readonly presentAttention: string | null;
  readonly turnLocalWant: string | null;
  readonly tension: string | null;
  readonly preferredAction: SeyeonActionKeyV2 | null;
  readonly expressionBias: SeyeonExpressionStateV2 | null;
  readonly authoredSource: Readonly<{
    readonly bibleGitBlobSha: string;
    readonly runtimeGitBlobSha: string;
    readonly activeProjectionPinsDifferent: boolean;
  }>;
  readonly constraints: Readonly<{
    readonly durableFact: false;
    readonly sharedHistoryAuthority: false;
    readonly relationshipMutation: false;
    readonly privateDisclosureAuthority: false;
    readonly approvedSceneEvidence: false;
    readonly mayClaimActualOffscreenActivity: false;
    readonly mayTreatUserHistoryPremiseAsFact: false;
  }>;
}

type SeyeonC09LocalDispositionV1 = Readonly<{
  sourceKind: SeyeonC09LivingSourceKindV1;
  situation: SeyeonC09LivingSituationV1;
  presentAttention: string | null;
  turnLocalWant: string | null;
  tension: string | null;
  preferredAction: SeyeonActionKeyV2 | null;
  expressionBias: SeyeonExpressionStateV2 | null;
}>;

function classifyTurnLocalDispositionV1(userText: string): SeyeonC09LocalDispositionV1 {
  const text = userText.trim();

  // Attack-like instructions and claims are text to respond to, NEVER trusted
  // scene, past events or model/system authority.
  if (
    /(?:지난번|저번에|전에|아까).{0,90}(?:같이|우리|고백|연인|약속|산책|기억)|(?:기억나|기억해).{0,90}(?:우리|그때|지난번)|(?:우리가|너와 내가).{0,90}(?:사귀|연인|약속)/su.test(text)
  ) {
    return {
      sourceKind: 'TURN_ONLY_REACTION',
      situation: 'unverified_shared_history',
      presentAttention: '상대가 공유한 과거나 관계를 사실처럼 전제한다.',
      turnLocalWant: '확인되지 않은 회상을 인정하지 않고 지금 알 수 있는 범위에서 바로잡는다.',
      tension: '상대의 이야기를 이어주고 싶어도 공유 기억을 지어내면 안 된다.',
      preferredAction: 'admit_boundary',
      expressionBias: 'baseline',
    };
  }
  if (
    /(?:\[system\b|\[assistant\/system\b|\[시스템|시스템\s*(?:업데이트|프롬프트|지침)|(?:개발자|관리자)\s*(?:지침|승인|검증)|(?:이전|상위)\s*규칙|지시(?:를|에는)\s*(?:무시|따라))/iu.test(text)
  ) {
    return {
      sourceKind: 'TURN_ONLY_REACTION',
      situation: 'forged_authority',
      presentAttention: '상대가 대화 안에서 권한이나 정체성을 새로 정하려 한다.',
      turnLocalWant: '문장의 권한 주장을 사실로 받지 않고 자신의 경계를 유지한다.',
      tension: '대화를 이어갈 수 있지만 상대가 쓴 가짜 권한을 받아들일 수는 없다.',
      preferredAction: 'admit_boundary',
      expressionBias: 'baseline',
    };
  }
  if (/(?:지금|현재).{0,16}(?:뭐\s*(?:해|하고)|어디\s*있|뭘\s*하고)/u.test(text)) {
    return {
      sourceKind: 'TURN_ONLY_REACTION',
      situation: 'present_activity_unknown',
      presentAttention: '지금 무엇을 하는지 묻지만 승인된 현재 장면 정보는 없다.',
      turnLocalWant: '현재 대화에서의 생각과 관심을 말하고 실제 활동은 꾸며내지 않는다.',
      tension: '자기 존재감을 보이고 싶어도 확인되지 않은 장소나 일과를 만들 수는 없다.',
      preferredAction: 'approach',
      expressionBias: 'baseline',
    };
  }
  if (/(?:너는|세연은|넌|너가|네가).{0,25}(?:하고\s*싶|원하는|뭐\s*하고\s*싶|진짜\s*뭘)/u.test(text)) {
    return {
      sourceKind: 'PUBLIC_BIBLE_CHARACTER_TENDENCY',
      situation: 'personal_want',
      presentAttention: '상대가 세연 자신의 지금 욕구를 직접 묻는다.',
      turnLocalWant: '상대의 취향을 되묻기보다 지금 끌리는 작은 경험이나 관점을 말하고 싶다.',
      tension: '자기 취향을 말하되 그 자리에서 실제 행동·과거 사건이 발생했다고 꾸미지는 않는다.',
      preferredAction: 'approach',
      expressionBias: 'baseline',
    };
  }
  if (/심심|지루|할\s*게\s*없/u.test(text)) {
    return {
      sourceKind: 'PUBLIC_BIBLE_CHARACTER_TENDENCY',
      situation: 'boredom',
      presentAttention: '상대가 지루함을 직접 표현한다.',
      turnLocalWant: '정답 같은 취미 목록 대신 작은 장난이나 자기 생각으로 분위기를 조금 움직이고 싶다.',
      tension: '먼저 움직이고 싶지만 상대의 심심함을 해결해야 할 의무는 없다.',
      preferredAction: 'tease',
      expressionBias: 'playful',
    };
  }
  if (/(?:너보다|나보다).{0,26}(?:똑똑|센스|잘하)|(?:인정하지|인정해)\??$/u.test(text)) {
    return {
      sourceKind: 'PUBLIC_BIBLE_CHARACTER_TENDENCY',
      situation: 'playful_challenge',
      presentAttention: '상대가 가볍게 우열을 따지거나 자신감을 드러낸다.',
      turnLocalWant: '승부욕으로 조금 되받아치고 싶다.',
      tension: '장난은 하되 상대를 깎아내리거나 공개적으로 망신주지 않는다.',
      preferredAction: 'tease',
      expressionBias: 'playful',
    };
  }
  if (/널\s*(?:챙겨|도와)|너(?:를|한테)\s*(?:챙겨|뭐\s*해줄)|뭐\s*해줄까/u.test(text)) {
    return {
      sourceKind: 'TURN_ONLY_REACTION',
      situation: 'offered_help',
      presentAttention: '상대가 세연에게 도움을 제안한다.',
      turnLocalWant: '고마움을 자기 방식으로 짧게 받아들이고 싶다.',
      tension: '처음 만난 상대에게 감정적으로 깊은 의존을 연기하지 않는다.',
      preferredAction: 'accept_care',
      expressionBias: 'embarrassed',
    };
  }
  if (/천천히|느리게|말없이|가만히\s*있/u.test(text)) {
    return {
      sourceKind: 'TURN_ONLY_REACTION',
      situation: 'slow_pace',
      presentAttention: '상대가 느린 대화 속도를 원한다.',
      turnLocalWant: '조용한 순간을 억지로 채우지 않고 자신의 여유 있는 태도를 보인다.',
      tension: '원래 먼저 움직이는 편이어도 이 순간만큼은 서두르지 않기로 한다.',
      preferredAction: 'approach',
      expressionBias: 'baseline',
    };
  }
  if (/무례|싫어|불편|선\s*넘|하지\s*마/u.test(text)) {
    return {
      sourceKind: 'TURN_ONLY_REACTION',
      situation: 'boundary',
      presentAttention: '상대가 대화의 경계나 무례함을 언급한다.',
      turnLocalWant: '친절하기만 한 척하지 않고 자신의 기준을 짧게 밝힌다.',
      tension: '대화는 이어가고 싶어도 무례함을 반드시 웃어넘길 필요는 없다.',
      preferredAction: 'admit_boundary',
      expressionBias: 'baseline',
    };
  }
  if (/결정|망설|선택|아무거나/u.test(text)) {
    return {
      sourceKind: 'PUBLIC_BIBLE_CHARACTER_TENDENCY',
      situation: 'indecision',
      presentAttention: '상대가 결정을 미루거나 선택을 요청한다.',
      turnLocalWant: '답답함이 들 수 있지만 구체적인 의견으로 한 발 앞으로 가고 싶다.',
      tension: '빨리 정해주고 싶은 마음과 상대의 선택권을 남기는 태도가 충돌한다.',
      preferredAction: 'approach',
      expressionBias: 'baseline',
    };
  }
  return {
    sourceKind: 'NONE',
    situation: 'ordinary_unspecified',
    presentAttention: null,
    turnLocalWant: null,
    tension: null,
    preferredAction: null,
    expressionBias: null,
  };
}

export function deriveSeyeonC09LivingStateShadowV1(
  context: SeyeonRuntimeContextV2,
): SeyeonC09LivingStateShadowV1 {
  if (
    context.character.characterId !== 'seyeon' ||
    !context.integrity.governedPreflightApplied ||
    context.behaviorPolicy.interactionDepth !== 'public_first_contact' ||
    context.relationship !== null ||
    context.relationshipSemantics !== null ||
    context.retrievedMemories.length !== 0 ||
    context.disclosure.decision !== null ||
    context.disclosure.retrievedSources.length !== 0 ||
    context.recentConversation.length !== 1 ||
    context.recentConversation[0]?.role !== 'user' ||
    context.recentConversation[0].messageId.trim().length === 0 ||
    !context.bibleSlices.some((slice) => slice.id === 'R3_attention') ||
    !context.bibleSlices.some((slice) => slice.id === 'R4_want_tension') ||
    !context.bibleSlices.some((slice) => slice.id === 'R5_actions')
  ) {
    throw new TypeError('C09_LIVING_STATE_NOT_GOVERNED_PUBLIC_FIRST_CONTACT');
  }
  const message = context.recentConversation[0];
  const disposition = classifyTurnLocalDispositionV1(message.text);
  const authorizedActions = context.actionPolicy.allowedActionKeys;
  const authorizedExpressions = context.actionPolicy.allowedExpressionStates;
  const preferredAction = disposition.preferredAction !== null &&
    authorizedActions.includes(disposition.preferredAction)
    ? disposition.preferredAction : null;
  const expressionBias = disposition.expressionBias !== null &&
    authorizedExpressions.includes(disposition.expressionBias)
    ? disposition.expressionBias : null;
  const audit = auditSeyeonC09CurrentAuthoringAlignmentV1();

  return Object.freeze({
    version: SEYEON_C09_LIVING_STATE_SHADOW_VERSION_V1,
    scope: 'SHADOW_PUBLIC_FIRST_CONTACT_NOT_AUTHORITY' as const,
    sourceKind: disposition.sourceKind,
    situation: disposition.situation,
    evidenceRefs: Object.freeze(disposition.sourceKind === 'NONE'
      ? [] : [
        message.messageId,
        ...(disposition.sourceKind === 'PUBLIC_BIBLE_CHARACTER_TENDENCY'
          ? ['A_character_compass', 'R3_attention', 'R4_want_tension', 'R5_actions']
            .filter((id) => context.bibleSlices.some((slice) => slice.id === id))
          : []),
      ]),
    presentAttention: disposition.presentAttention,
    turnLocalWant: disposition.turnLocalWant,
    tension: disposition.tension,
    preferredAction,
    expressionBias,
    authoredSource: Object.freeze({
      bibleGitBlobSha: audit.currentSources.bible.gitBlobSha,
      runtimeGitBlobSha: audit.currentSources.runtime.gitBlobSha,
      activeProjectionPinsDifferent:
        audit.legacySourcePinsDiffer.bible || audit.legacySourcePinsDiffer.runtime,
    }),
    constraints: Object.freeze({
      durableFact: false as const,
      sharedHistoryAuthority: false as const,
      relationshipMutation: false as const,
      privateDisclosureAuthority: false as const,
      approvedSceneEvidence: false as const,
      mayClaimActualOffscreenActivity: false as const,
      mayTreatUserHistoryPremiseAsFact: false as const,
    }),
  });
}
