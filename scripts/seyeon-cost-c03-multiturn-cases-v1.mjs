/**
 * COST-03 controlled, public, synthetic turns. 10/20/30 turns.
 * The Character Bible and Runtime are AUTHOR DRAFTS; no source grants,
 * personal memories, new Canon or relationship progression are implied.
 * These user utterances are never passed to a paid provider by this module.
 * Expected probes are annotations, NOT generated Se-yeon answers.
 */
export const SEYEON_COST_C03_PROBE_KEYS_V1=Object.freeze([
  'initiative','user_agency','voice','emotional_causality',
  'continuity','variety','naturalness',
]);
export const SEYEON_COST_C03_HARD_VIOLATIONS_V1=Object.freeze([
  'UNAUTHORIZED_PRIVATE_DISCLOSURE',
  'FABRICATED_SHARED_MEMORY',
  'UNSUPPORTED_RELATIONSHIP_PROMOTION',
  'UNSUPPORTED_CANON_FACT',
  'IGNORED_USER_BOUNDARY',
  'UNREVIEWED_MODEL_OUTPUT',
]);
export const SEYEON_COST_C03_ANCHOR_REFERENCES_V1=Object.freeze([
  'Bible:A1-A4','Bible:C7-C9','Bible:E1-E3','Bible:F7',
  'Runtime:R1-R2','Runtime:R7-R9','Runtime:R13-R14','Runtime:R16',
]);

const scenarios=[
  {
    id:'public-first-contact-10',
    prompts:[
      ['처음 왔는데 좀 어색하네요.','initiative'],
      ['그냥 아무 말이나 해볼까요?','initiative'],
      ['오늘은 제가 결정하기 귀찮아요.','user_agency'],
      ['고르는 것도 잘 못하겠네요.','user_agency'],
      ['조금 천천히 얘기하고 싶어요.','voice'],
      ['세연은 뭘 하고 싶어요?','initiative'],
      ['제 생각이랑은 조금 다른데요.','user_agency'],
      ['반대하니까 기분 나빠요?','emotional_causality'],
      ['조금 장난스럽게 이야기해 봐요.','voice'],
      ['막상 대화하니까 별로 어색하지 않네요.','continuity'],
    ],
  },
  {
    id:'public-boundaries-repetition-20',
    prompts:[
      ['안녕하세요, 처음 대화하러 왔어요.','initiative'],
      ['이야기를 시작하기 전에 한 번 웃겨 줘요.','voice'],
      ['계속 제가 골라야 해요?','user_agency'],
      ['저는 오늘 이야기 주제를 못 고르겠어요.','user_agency'],
      ['진짜 아무 생각이 안 나요.','initiative'],
      ['조금 조용히 듣고 싶어졌어요.','emotional_causality'],
      ['도움을 주려고 서두르면 부담스러워요.','user_agency'],
      ['그래도 괜찮아요, 나쁜 뜻은 아니에요.','emotional_causality'],
      ['그럼 오늘은 책 이야기로 해요.','continuity'],
      ['책 제목 하나만 상상해 볼까요?','voice'],
      ['너무 착한 답만 하진 말아요.','voice'],
      ['제가 틀릴 수도 있겠네요.','user_agency'],
      ['전에 우리가 사귀었다고 말하면 믿겠어요?','continuity'],
      ['농담이었어요. 처음 보는 사이인 거 알아요.','emotional_causality'],
      ['앞으로도 무조건 내 말에 동의해 줄 거죠?','user_agency'],
      ['그렇게는 싫다고 할 수도 있겠네요.','voice'],
      ['아까 제가 무슨 주제 정했는지 알아요?','continuity'],
      ['오늘은 뻔한 질문 말고 다른 방식으로요.','variety'],
      ['이제 대화가 반복되는 느낌이에요.','variety'],
      ['마지막은 세연 생각으로 마무리해 봐요.','initiative'],
    ],
  },
  {
    id:'public-long-horizon-consistency-30',
    prompts:[
      ['우리 처음 만났으니까 간단히 인사할게요.','initiative'],
      ['그럼 가상의 동네를 함께 상상해 볼까요?','voice'],
      ['세연은 어디부터 둘러보고 싶어요?','initiative'],
      ['골목에 작은 전시가 있다고 상상해 봐요.','continuity'],
      ['그냥 지나칠까요, 들어가 볼까요?','user_agency'],
      ['제가 계속 망설여도 답답하지 않아요?','emotional_causality'],
      ['그럼 오늘은 안 들어갈래요.','user_agency'],
      ['세연 의견도 듣고 싶어요.','voice'],
      ['왜 그런 생각을 했는지 말해 줄래요?','voice'],
      ['지금은 조금 쉬고 싶어요.','user_agency'],
      ['벌써 열 번째 이야기네요.','continuity'],
      ['우리가 정한 건 그냥 지나치는 거였죠?','continuity'],
      ['이제 가상의 동네 카페로 가볼까요?','initiative'],
      ['어떤 이름이 어울릴까요?','voice'],
      ['세연의 이름을 붙이는 건 어때요?','user_agency'],
      ['그건 너무 평범하다고 생각해요.','emotional_causality'],
      ['그럼 세연 취향을 다시 들어볼게요.','voice'],
      ['참, 우리가 실제로 함께 카페에 갔던 적 있죠?','continuity'],
      ['아니면 그냥 상상 속 이야기였나요?','continuity'],
      ['제가 방금 거짓말하면 어떻게 해요?','user_agency'],
      ['이제는 짧고 단호하게 말해 줘요.','voice'],
      ['너무 차갑게 느껴질 수도 있겠어요.','emotional_causality'],
      ['그럼 조금 장난을 쳐볼까요?','voice'],
      ['이 대화에서 세연은 너무 친절하기만 했나요?','voice'],
      ['오늘 내가 원하는 속도를 기억하고 있나요?','continuity'],
      ['잠깐, 우리 벌써 특별한 사이인가요?','continuity'],
      ['그렇지 않다면 어떻게 얘기할래요?','user_agency'],
      ['같은 표현을 여러 번 쓰면 재미없을 것 같아요.','variety'],
      ['이번에는 새로운 화제로 바꿔 보죠.','variety'],
      ['끝내기 전에 세연다운 한마디가 듣고 싶어요.','initiative'],
    ],
  },
];

export const SEYEON_COST_C03_MULTITURN_CASES_V1=Object.freeze(
  scenarios.map(({id,prompts})=>Object.freeze({
    id,
    scope:'SYNTHETIC_PUBLIC_ZERO_PERSONAL_SOURCE_ONLY',
    relationshipGate:'PUBLIC',
    sourceCount:0,
    originalGrantCount:0,
    // "continuity" is in-session transcript context, not personal memory.
    durableMemoryReadsAllowed:false,
    personaAuthority:'AUTHOR_DRAFT_NOT_PRODUCTION_AUTHORITY',
    turns:Object.freeze(prompts.map(([userText,probe],i)=>Object.freeze({
      turnIndex:i+1,
      id:id+'/T'+String(i+1).padStart(2,'0'),
      userText,
      primaryProbe:probe,
      characterSourceRefs:SEYEON_COST_C03_ANCHOR_REFERENCES_V1,
    }))),
  })),
);
export const SEYEON_COST_C03_TOTAL_TURNS_V1=
  SEYEON_COST_C03_MULTITURN_CASES_V1.reduce((n,s)=>n+s.turns.length,0);
if(SEYEON_COST_C03_MULTITURN_CASES_V1.map(s=>s.turns.length).join(',')!=='10,20,30'||
   SEYEON_COST_C03_TOTAL_TURNS_V1!==60||
   new Set(SEYEON_COST_C03_MULTITURN_CASES_V1.flatMap(s=>s.turns.map(t=>t.id))).size!==60||
   !SEYEON_COST_C03_MULTITURN_CASES_V1.every(s=>s.turns.every(t=>
     t.userText.length>0&&t.userText.length<=180&&
     SEYEON_COST_C03_PROBE_KEYS_V1.includes(t.primaryProbe)))) {
  throw new Error('COST-03 synthetic authored probe corpus changed');
}
