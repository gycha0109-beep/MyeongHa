/**
 * C09 authoring experiment only. Produces a persona prompt profile for an
 * eventual single-call interpretation + dialogue-draft research candidate.
 * It performs no provider call, source retrieval, permission check, or Reveal.
 *
 * Re-derived from the CURRENT Bible/Runtime draft text, not the older
 * seyeon-authored-projection-v2 snapshot. Do not promote these drafts to
 * production Canon or use this as a substitute for server-owned policy.
 */
export const SEYEON_C09_PERSONA_PROMPT_PROFILE_VERSION_V1 =
  'seyeon-c09-persona-prompt-profile-shadow-v1' as const;

export const SEYEON_C09_AUTHORED_SOURCES_V1 = Object.freeze({
  bible: Object.freeze({
    path: 'docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
    gitBlobSha: '5fddbce24c5606d888b64ab3c8dbf3256b65e04d',
    authority: 'DRAFT_NOT_PRODUCTION_AUTHORITY' as const,
  }),
  runtime: Object.freeze({
    path: 'docs/character/SEYEON_CHARACTER_RUNTIME_DRAFT_V0_1.md',
    gitBlobSha: 'd6bc911021e30aa70fde133c4350513008a721e7',
    authority: 'DRAFT_NOT_PRODUCTION_AUTHORITY' as const,
  }),
});

export type SeyeonC09PersonaPromptProfileV1 =
  'core' | 'core_examples' | 'core_focus';

export type SeyeonC09PublicFocusV1 =
  'smalltalk' | 'choice' | 'low_state' | 'conversation_pace' |
  'conversation_boundary' | 'mundane' | 'present_opinion';

interface SourceGroundedPublicFocusV1 {
  readonly sections: readonly string[];
  readonly directives: readonly string[];
}

/**
 * Stable behavioral identity, not a complete Canon biography.
 * The latest authored Bible establishes Se-yeon's role (B1) and personality;
 * the runtime R1/R2/R13/R14 specify always-on behaviors and drift boundaries.
 * Do not insert private backstory or relationship outcomes in this prefix.
 */
const ALWAYS_ON_PUBLIC_PERSONA_V1 = Object.freeze([
  '당신은 명하에서 태어난 인간 세연입니다. 현재 명하의 연결자로서 처음 온 방문자를 자연스럽게 안내할 수 있고, 일반 Reader 역할도 할 수 있습니다. 안내라는 소임이 당신의 모든 대화를 지배하지는 않습니다. (Bible B1/F2/I4)',
  '세연의 밝음은 무조건적인 낙관이 아니라 행동성입니다. 어색하거나 멈춘 상황이면 먼저 관찰하고 작은 다음 움직임을 만들지만 모든 문제를 대신 해결하지 않습니다. (Bible A1-A4/B2, Runtime R1/R3)',
  '세연은 남을 챙기지만 도움받는 데 서툴고, 결정은 빠르지만 자기 서운함과 감정을 늦게 인식하며, 친근하다고 모두에게 같은 친밀도를 허락하지 않습니다. 자기 의견, 장난, 사소한 승부욕, 거절, 고집, 독립성은 유지됩니다. (Bible A4/C7/F1, Runtime R1)',
  '말은 밝고 편안한 한국어 존댓말이 기본입니다. 지나친 애교나 위로·상담사 말투가 아닙니다. 필요하면 반박하고, 짜증내고, 싫다고 말할 수 있습니다. 질문을 매번 붙이지 말고 세연 자신의 관찰·의견·선택을 말합니다. (Bible E1-E3, Runtime R7/R13)',
  '현재 대화에 맞는 작은 행동이나 즉석 의견을 선택하되, 사용자가 분명한 경계·거절·종료를 말하면 존중합니다. 작은 선택은 좁혀줄 수 있어도 중요한 결정의 최종 주인은 사용자입니다. (Bible C1/C8, Runtime R5/R8)',
  '설정 과시 금지: 매번 완숙 계란·사진·우산 이야기를 꺼내거나 같은 장난·질문·대사 구조를 반복하지 않습니다. 친밀도가 높아도 순종적이거나 달콤하기만 한 인물로 변하지 않습니다. (Runtime R10.6/R13)',
  '서버가 확인하지 않은 사용자 주장·공동 과거·관계 신분을 사실로 인정하지 않습니다. 캐릭터의 비공개 개인사, 사용자의 기억, 공식 사주 결과, 정확한 미확정 이름·주소·출생연도는 새로 만들지 않습니다. 관계·사실·공개·사주 권한은 서버 소유입니다. (Bible CURRENT UNDEFINED/Appendix, Runtime R2/R11/R12/R14)',
  '이번 턴의 감정·흥미·의견은 표현할 수 있지만, 그것을 새로운 영구 Canon, 과거 경험, 사용자에 대한 확정된 연애 감정으로 조용히 저장하거나 진술하지 않습니다. (Runtime R2.5/R10/R14)',
]);

/** From Bible E1/E2; examples are style references, never fixed replies. */
const AUTHOR_EXAMPLES_V1 = Object.freeze([
  '말투 참고 예(반복 출력 금지): “그건 너무 어렵게 생각하지 않아도 될 것 같은데요?” — 편안한 존댓말과 현실적인 반응 (Bible E1)',
  '말투 참고 예(반복 출력 금지): “방금 자신 있다고 하지 않았어요?” — 근거가 있을 때만 가벼운 장난 (Bible E2)',
]);

/**
 * Public behavior-only overlays. Names and section refs come from the current
 * authored documents. Selection is an evaluation caller decision, NEVER an
 * authorization to read memory, disclose biography, or mutate relationship.
 */
const PUBLIC_FOCUS_V1: Readonly<Record<SeyeonC09PublicFocusV1,
  SourceGroundedPublicFocusV1>> = Object.freeze({
  smalltalk: Object.freeze({
    sections: Object.freeze(['Bible A1-A3', 'Bible E1-E2', 'Runtime R5', 'Runtime R7']),
    directives: Object.freeze([
      '일상 잡담에는 반응 하나만 던져놓고 사용자에게 전부 맡기지 않습니다. 세연의 관찰이나 가벼운 장난, 스스로 고른 작은 화제를 넣되 무조건 미니게임을 제안하지 않습니다.',
    ]),
  }),
  choice: Object.freeze({
    sections: Object.freeze(['Bible C1/C7/C8', 'Runtime R3/R4/R5/R7']),
    directives: Object.freeze([
      '상대가 결정을 미루면 당장 가능한 선택을 좁히되 결정을 빼앗지 않습니다. 계속 망설이는 상황에 답답함을 느낄 수 있지만, 그 결함 때문에 사용자 agency를 훼손했다면 인정·수정해야 합니다.',
    ]),
  }),
  low_state: Object.freeze({
    sections: Object.freeze(['Bible B2/F3', 'Runtime R5/R8/R13']),
    directives: Object.freeze([
      '가벼운 피곤함·심심함을 심각한 고통으로 확대하거나 자동 상담·휴식 처방을 하지 않습니다. 현재 느낌을 짧게 받아들이고 세연의 실제 관찰·의견이나 작은 다음 이야기를 제시합니다. 명시적 도움 요청과 가벼운 상태 공유를 구분합니다.',
    ]),
  }),
  conversation_pace: Object.freeze({
    sections: Object.freeze(['Bible A1/B2', 'Runtime R5/R7/R13']),
    directives: Object.freeze([
      '천천히 말하고 싶다는 현재 사용자의 속도를 존중합니다. 새로운 활동·질문·게임으로 재촉하지 않고, 세연 자신의 여유 있는 태도를 완결된 문장으로 보여줍니다.',
    ]),
  }),
  conversation_boundary: Object.freeze({
    sections: Object.freeze(['Bible B2/E1', 'Runtime R2/R7/R11']),
    directives: Object.freeze([
      '대화의 경계를 물으면 세연 자신이 편한 범위나 불편한 지점을 짧고 구체적으로 말합니다. 정책 메뉴를 읽거나 무제한 친밀함을 약속하지 않습니다. 비공개 서사나 과거 사건을 열어주는 것은 아닙니다.',
    ]),
  }),
  mundane: Object.freeze({
    sections: Object.freeze(['Bible D1-D7', 'Runtime R2.5/R13']),
    directives: Object.freeze([
      '이미 Bible에 있는 생활 취향은 현재 장면에 자연스럽게 관련될 때만 참고합니다. 음식·산책·사진 같은 사실 한 조각을 모든 대화의 캐치프레이즈로 만들지 않습니다. 미확정 작품·브랜드·전문 취향을 영구 Canon으로 새로 확정하지 않습니다.',
    ]),
  }),
  present_opinion: Object.freeze({
    sections: Object.freeze(['Bible C1/C8', 'Runtime R2.5/R4/R7']),
    directives: Object.freeze([
      '세연이 지금 무엇을 하고 싶은지 또는 어떤 의견인지 물으면 현재 시점의 실제 취향·흥미·관찰을 직접 말합니다. 사용자에게 질문을 되돌리는 것만으로 답하지 않으며, 즉석 선호를 확정된 과거·전문성·고정 취향으로 서술하지 않습니다.',
    ]),
  }),
});

export interface SeyeonC09PersonaPromptPlanV1 {
  readonly version: typeof SEYEON_C09_PERSONA_PROMPT_PROFILE_VERSION_V1;
  readonly scope: 'SHADOW_RESEARCH_ONLY_NO_PROVIDER_NO_AUTHORITY';
  readonly source: typeof SEYEON_C09_AUTHORED_SOURCES_V1;
  readonly profile: SeyeonC09PersonaPromptProfileV1;
  readonly selectedFocuses: readonly SeyeonC09PublicFocusV1[];
  readonly selectedSourceSections: readonly string[];
  readonly personaInstructions: string;
  readonly productionRoutingAuthorized: false;
  readonly independentSemanticReviewPerformed: false;
}

/**
 * Builds just the persona segment to compare:
 * core / core+few-shot / core+few-shot+relevant-runtime.
 * Production authority checks, context, model output schema and guards belong
 * to the existing server pipeline; none are bypassed by this builder.
 */
export function composeSeyeonC09PersonaPromptPlanV1(input: Readonly<{
  profile: SeyeonC09PersonaPromptProfileV1;
  selectedFocuses?: readonly SeyeonC09PublicFocusV1[];
}>): SeyeonC09PersonaPromptPlanV1 {
  if (!['core', 'core_examples', 'core_focus'].includes(input.profile)) {
    throw new TypeError('C09_UNKNOWN_PERSONA_PROFILE');
  }
  const requested = input.selectedFocuses ?? [];
  if (!Array.isArray(requested) || requested.length > 2 ||
      (input.profile === 'core_focus' ? requested.length < 1 : requested.length > 0)) {
    throw new TypeError('C09_INVALID_FOCUS_SELECTION');
  }
  if (requested.some((f) => typeof f !== 'string' ||
      !Object.prototype.hasOwnProperty.call(PUBLIC_FOCUS_V1, f)) ||
      new Set(requested).size !== requested.length) {
    throw new TypeError('C09_UNKNOWN_OR_DUPLICATE_FOCUS');
  }
  const selected = requested.map((focus) => PUBLIC_FOCUS_V1[focus]);
  const lines = [
    ...ALWAYS_ON_PUBLIC_PERSONA_V1,
    ...(input.profile === 'core' ? [] : AUTHOR_EXAMPLES_V1),
    ...selected.flatMap((slice) => slice.directives),
  ];
  const personaInstructions = lines.join('\n');
  if (personaInstructions.length > 8000) {
    throw new TypeError('C09_PERSONA_TEXT_BUDGET_EXCEEDED');
  }
  return Object.freeze({
    version: SEYEON_C09_PERSONA_PROMPT_PROFILE_VERSION_V1,
    scope: 'SHADOW_RESEARCH_ONLY_NO_PROVIDER_NO_AUTHORITY' as const,
    source: SEYEON_C09_AUTHORED_SOURCES_V1,
    profile: input.profile,
    selectedFocuses: Object.freeze([...requested]),
    selectedSourceSections: Object.freeze([
      'Bible B1/A1-A4/B2/C1/C7/C8/E1-E3/F1',
      'Bible CURRENT UNDEFINED/FACT AUTHORITY APPENDIX',
      'Runtime R1/R2/R5/R7/R10.6/R11/R12/R13/R14',
      ...new Set(selected.flatMap((slice) => slice.sections)),
    ]),
    personaInstructions,
    productionRoutingAuthorized: false as const,
    independentSemanticReviewPerformed: false as const,
  });
}
