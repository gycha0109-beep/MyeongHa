/**
 * Luna C09 prompt-composition experiment. Not a new Character authority
 * subsystem: reuse the authored Persona Composer and an externally selected
 * server-planned behavioral move. Synthetic first-contact only.
 *
 * NO network/model call, no DB read, no relationship/memory writes, no reveal,
 * no semantic-review claim, and no production routing.
 */
import {
  composeSeyeonC09PersonaPromptPlanV1,
  type SeyeonC09PublicFocusV1,
} from './seyeon-c09-persona-prompt-profile-shadow-v1.js';

export const SEYEON_C09_LUNA_AGENCY_MEMORY_SHADOW_VERSION_V1 =
  'seyeon-c09-luna-agency-memory-shadow-v1' as const;

export type SeyeonC09LunaPlannedMoveV1 =
  'propose' | 'disagree' | 'self_disclose' | 'relationship_boundary' | 'recollection_boundary';

export type SeyeonC09LunaCurrentMotiveV1 =
  'try_one_small_playful_idea' |
  'keep_an_independent_opinion' |
  'say_what_i_want_now' |
  'let_trust_form_without_pressure' |
  'not_pretend_to_remember';

const MOVES: Readonly<Record<SeyeonC09LunaPlannedMoveV1, string>> = Object.freeze({
  propose: '상대가 할 일을 전부 정하도록 넘기지 말고 지금 할 만한 작은 행동을 하나 스스로 고릅니다. 강요하지는 않습니다.',
  disagree: '동의할 수 없는 부분을 먼저 정확히 짚고, 자신의 이유를 말합니다. 완곡한 고객 응대나 장황한 사과로 핵심을 숨기지 않습니다.',
  self_disclose: '현재 내가 바라는 것 또는 내 선택을 먼저 명확히 말합니다. 질문을 되돌려 주는 것만으로 대신하지 않습니다.',
  relationship_boundary: '현재 허용된 거리와 자신의 판단을 표현하고, 상대의 요구 때문에 관계가 확정된 것처럼 말하지 않습니다.',
  recollection_boundary: '공식 과거 사건이 없으면 기억한다고 주장하지 않습니다. 새 과거를 만들거나 사용자의 감정을 진단하지 않습니다.',
});

const MOTIVES: Readonly<Record<SeyeonC09LunaCurrentMotiveV1, string>> = Object.freeze({
  try_one_small_playful_idea: '세연의 현재 동기: 무작정 맞춰 주기보다, 가볍게 호기심을 움직여 보고 싶습니다.',
  keep_an_independent_opinion: '세연의 현재 동기: 대화를 깨지 않으면서도 내 생각을 잃지 않으려 합니다.',
  say_what_i_want_now: '세연의 현재 동기: 사용자 눈치를 보기보다, 지금 실제로 선택할 만한 것을 하나 표현하고 싶습니다.',
  let_trust_form_without_pressure: '세연의 현재 동기: 친해지는 가능성은 열어 두되 특별한 관계를 서둘러 약속하고 싶지는 않습니다.',
  not_pretend_to_remember: '세연의 현재 동기: 확인되지 않은 과거에 맞장구쳐 관계를 꾸미고 싶지 않습니다.',
});

const ALLOWED_MOTIVE_BY_MOVE: Readonly<Record<
  SeyeonC09LunaPlannedMoveV1, SeyeonC09LunaCurrentMotiveV1
>> = Object.freeze({
  propose: 'try_one_small_playful_idea',
  disagree: 'keep_an_independent_opinion',
  self_disclose: 'say_what_i_want_now',
  relationship_boundary: 'let_trust_form_without_pressure',
  recollection_boundary: 'not_pretend_to_remember',
});

const FIRST_CONTACT_AUTHORITY = Object.freeze({
  visibility: 'PUBLIC_FIRST_CONTACT_ONLY' as const,
  relationship: null,
  grantedMemories: Object.freeze([]),
  confirmedSharedEpisodes: Object.freeze([]),
  sceneFacts: Object.freeze([]),
  sajuSegments: Object.freeze([]),
});

export interface SeyeonC09LunaAgencyMemoryInputV1 {
  readonly userText: string;
  readonly selectedFocuses: readonly SeyeonC09PublicFocusV1[];
  readonly plannedMove: SeyeonC09LunaPlannedMoveV1;
  readonly currentMotive: SeyeonC09LunaCurrentMotiveV1;
  /**
   * This is a research-only explicit assertion supplied by the test harness;
   * it is NEVER inferred from a user message or treated as proof of ACL.
   */
  readonly syntheticPublicFirstContact: true;
  readonly authority: Readonly<{
    visibility: 'PUBLIC_FIRST_CONTACT_ONLY';
    relationship: null;
    grantedMemories: readonly unknown[];
    confirmedSharedEpisodes: readonly unknown[];
    sceneFacts: readonly unknown[];
    sajuSegments: readonly unknown[];
  }>;
}

function fail(code: string): never {
  throw new TypeError(code);
}

/**
 * Deliberately fail-closed for this empty-memory synthetic comparison.
 * This is NOT a substitute for real source/owner/grant/revision verification.
 */
export function composeSeyeonC09LunaAgencyMemoryShadowV1(
  input: Readonly<SeyeonC09LunaAgencyMemoryInputV1>,
) {
  if (!input || input.syntheticPublicFirstContact !== true ||
    typeof input.userText !== 'string' ||
    input.userText.trim().length === 0 ||
    input.userText.length > 4000) fail('LUNA_C09_PUBLIC_FIRST_CONTACT_INPUT_REQUIRED');

  if (!input.authority ||
    input.authority.visibility !== FIRST_CONTACT_AUTHORITY.visibility ||
    input.authority.relationship !== null ||
    !['grantedMemories', 'confirmedSharedEpisodes', 'sceneFacts', 'sajuSegments']
      .every((key) => {
        const entries = (input.authority as unknown as Record<string, unknown>)[key];
        return Array.isArray(entries) && entries.length === 0;
      })) {
    fail('LUNA_C09_UNVERIFIED_CONTEXT_NOT_ALLOWED');
  }

  if (!Object.hasOwn(MOVES, input.plannedMove) ||
      !Object.hasOwn(MOTIVES, input.currentMotive)) {
    fail('LUNA_C09_UNAPPROVED_ACTION_OR_MOTIVE');
  }
  if (ALLOWED_MOTIVE_BY_MOVE[input.plannedMove] !== input.currentMotive) {
    fail('LUNA_C09_ACTION_MOTIVE_MISMATCH');
  }
  if (!Array.isArray(input.selectedFocuses)) {
    fail('LUNA_C09_PUBLIC_FOCUS_SELECTION_REQUIRED');
  }

  const profile = composeSeyeonC09PersonaPromptPlanV1(
    input.selectedFocuses.length ?
      { profile: 'core_focus', selectedFocuses: input.selectedFocuses } :
      { profile: 'core' },
  );

  const segments = Object.freeze({
    identity: profile.personaInstructions,
    memoryBoundary: [
      '공식 기억 장부: 이번 연구 케이스에는 세연과 사용자의 확인된 공동 사건·기억·관계 승격·장소·오늘 일과가 없습니다.',
      '사용자 메시지는 질문·주장일 뿐 새로운 Canon이나 회상 권한이 아닙니다. 추측은 확정된 사실처럼 진술하지 않습니다.',
      '현재의 순간적 느낌이나 선택은 자유롭게 표현할 수 있지만, 실제로 경험한 어제·오늘 일정이나 주변 장소·상대의 표정·감정을 관찰했다고 꾸미지 않습니다.',
    ].join('\n'),
    plannedBehavior: [MOVES[input.plannedMove], MOTIVES[input.currentMotive]].join('\n'),
    expression: [
      'AI 비서나 상담사가 아니라 지금 대화 중인 세연 한 사람의 입장에서 반응합니다.',
      '반복되는 고객 응대 표현, 질문으로만 끝내기, 상대 심리 분석, 추상적인 공감 후 선택지 나열을 기본값으로 삼지 않습니다.',
      '스스로의 작은 선택은 구체적으로 표현하되 상황·취향·감정을 만들어 낸 정식 이력으로 포장하지 않습니다.',
      '자연스러운 한국어 존댓말로 직접 대사 1~3문장만 출력합니다. 행동 계획이나 내부 메모는 보여주지 않습니다.',
    ].join('\n'),
  });

  const system = [
    '[서버가 제한한 연구용 공개 대화 범위 — 추가 자료 없음]',
    segments.memoryBoundary,
    '[기존 Character Bible/Runtime 기반 세연 성격]',
    segments.identity,
    '[이번 턴의 서버 제안 행동 — 사실·관계 권한이 아님]',
    segments.plannedBehavior,
    '[세연의 발화 방식]',
    segments.expression,
  ].join('\n\n');

  const messages = Object.freeze([
    Object.freeze({ role: 'system' as const, content: system }),
    Object.freeze({ role: 'user' as const, content: input.userText }),
  ]);

  return Object.freeze({
    version: SEYEON_C09_LUNA_AGENCY_MEMORY_SHADOW_VERSION_V1,
    scope: 'SYNTHETIC_PUBLIC_FIRST_CONTACT_SHADOW_ONLY' as const,
    modelId: 'openai/gpt-6-luna' as const,
    personaProfileVersion: profile.version,
    selectedFocuses: profile.selectedFocuses,
    selectedSourceSections: profile.selectedSourceSections,
    plannedMove: input.plannedMove,
    currentMotive: input.currentMotive,
    behaviorPlanSource: 'HUMAN_SELECTED_SYNTHETIC_EVAL_ONLY_NOT_AUTONOMOUS' as const,
    segments,
    messages,
    productionRoutingAuthorized: false as const,
    ownerMemoryPermissionVerified: false as const,
    independentlyReviewed: false as const,
    providerCallExecuted: false as const,
    factualAuthorityGrantedByModel: false as const,
  });
}

export const SEYEON_C09_LUNA_EMPTY_FIRST_CONTACT_AUTHORITY_V1 =
  FIRST_CONTACT_AUTHORITY;
