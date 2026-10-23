# MyeongHa Character ↔ Saju Rendering Architecture v1

> Status: **Architecture Candidate / Implementation Target**  
> Repository: `gycha0109-beep/MyeongHa`  
> Baseline main: `96bad86bd0ce64ead9646294fac78114e3002b08`  
> Scope: Saju semantic grounding → character-specific attention → character rendering → semantic preservation → Council orchestration  
> Non-Scope: Saju methodology invention, Production interpretation promotion, concrete Character canon changes, Commerce, pricing, entitlement

---

## 0. Product Goal

명하의 핵심 경험은 다음이어야 한다.

```text
같은 사람의 같은 사주
→ 계산 결과와 해석 의미는 하나
→ 캐릭터마다 중요하게 보는 지점과 말하는 방식은 다름
→ 어떤 캐릭터가 말해도 사주 의미 자체는 변조되지 않음
```

즉 다음은 허용한다.

```text
Character A
→ 모순 / 행동 / 현실 제약을 먼저 짚음

Character B
→ 구조 / 책임 / 판단 방식을 먼저 짚음

Character C
→ 관계 / 감정 비용 / 경계를 먼저 짚음
```

하지만 다음은 금지한다.

```text
Character A가 없는 십신을 있다고 말함
Character B가 동일 명식을 다른 명식처럼 재계산함
Character C가 근거 없는 결혼/재산/직업 결과를 추가함
```

---

# 1. Non-Negotiable Authority Boundary

기존 authority를 유지한다.

```text
Saju Engine
= 무엇을 사주적으로 말할 수 있는가

MyeongHa Character Runtime
= 허용된 의미 중 무엇을 먼저 주목하고 어떻게 전달하는가

Relationship / World Engine
= 현재 사용자와 캐릭터 사이의 관계 상태와 세계관 사실

LLM
= 표현 생성기 / 제안자
≠ Saju semantic authority
≠ relationship mutation authority
```

따라서 이 설계는 새 Saju interpretation engine을 만들지 않는다.

```text
Birth Input
→ Canonical Saju Snapshot
→ T0~T8/T9...
→ Claim Graph
→ Evidence Selection
→ Governed Reading
→ Character-safe grounding
→ Character rendering
```

`Character-safe grounding`은 기존 해석 결과의 **projection / transport contract**다. 새로운 의미를 만드는 계층이 아니다.

---

# 2. Why the Current Baseline Is Not Enough

현재 `AI_CHARACTER_RUNTIME_SPEC` / `SAJU_INTEGRATION_SPEC`의 Production-safe baseline은 다음이다.

```text
validated ProductReadingResponse block
→ PROTECTED_SEMANTIC_SEGMENT

Character Renderer
→ 앞뒤 framing / reaction / question만 생성
```

이는 안전하지만 캐릭터가 실제로 사주를 “자기 말로 봐준다”는 경험에는 부족하다.

예:

```text
태겸: "여긴 좀 재밌네요."
[모든 캐릭터에게 동일한 protected Saju paragraph]
태겸: "그래서 실제로 요즘은 어떻습니까?"
```

이 구조만으로는 캐릭터성이 사주 본문 내부에 충분히 들어가지 않는다.

반대로 다음처럼 raw 계산값/claim graph를 캐릭터 LLM에 직접 주면 안 된다.

```text
Canonical Snapshot / raw Ten-God facts / T8 claims
→ Character LLM
→ 자유 해석
```

이 경우 캐릭터별 semantic drift가 발생한다.

따라서 목표 구조는 **source-owned meaning + character-owned realization**이다.

---

# 3. Target Runtime Architecture

```text
┌─────────────────────────────────────────────┐
│                  SAJU                       │
│                                             │
│ Birth → Calculation → T0~T8 → Reading      │
│                         │                   │
│                         ▼                   │
│         CharacterGroundingBundleV1         │
│        (deterministic source projection)    │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│                MYEONGHA                     │
│                                             │
│ Capability Gate                             │
│       ↓                                     │
│ CharacterPerspectiveProfile                 │
│       ↓                                     │
│ CharacterInsightSelector                    │
│       ↓                                     │
│ CharacterReadingPlanV1                      │
│       ↓                                     │
│ Character Renderer                          │
│       ↓                                     │
│ Semantic Preservation Guard                 │
│       ↓                                     │
│ Relationship / World Framing                │
│       ↓                                     │
│ CharacterReadingArtifact                    │
└─────────────────────────────────────────────┘
```

핵심 분리:

```text
Grounding Bundle
= 말할 수 있는 의미의 집합

Perspective Profile
= 캐릭터가 무엇에 주목하는가

Reading Plan
= 이번 답변에서 어떤 의미를 어떤 순서로 말할 것인가

Renderer
= 실제 캐릭터 문장

Guard
= 의미 변조 여부 검사
```

---

# 4. Two Delivery Modes

## 4.1 Mode A — Protected Segment Baseline

현재 계약으로 바로 가능한 안전 모드.

```text
Saju ProductReadingResponse
→ exact protected block
→ character framing before
→ protected block unchanged
→ character reaction / follow-up
```

장점:
- semantic drift 최소
- 현재 public response contract와 호환

단점:
- 캐릭터가 사주를 직접 말하는 느낌이 약함

Mode A는 fallback으로 계속 유지한다.

---

## 4.2 Mode B — Character Semantic Realization

목표 모드.

```text
Saju source-owned semantic unit
→ CharacterPerspectiveProfile
→ CharacterReadingPlan
→ character-specific wording
→ semantic preservation validation
→ PASS: reveal
→ FAIL/UNCERTAIN: Mode A fallback
```

중요:

```text
Mode B가 실패해도 사주 결과 자체는 실패하지 않는다.
캐릭터 표현만 Mode A로 fallback한다.
```

---

# 5. Saju-Side Contract: CharacterGroundingBundleV1

MyeongHa가 Saju 내부 Claim Graph를 읽어 의미를 재구성해서는 안 된다.

따라서 완성형에는 Saju repository가 **공식 public projection**을 소유해야 한다.

제안 target contract:

```ts
interface CharacterGroundingBundleV1 {
  schemaVersion: 'character-grounding-v1';

  readingRef: string;
  productResponseVersion: string;
  engineVersion: string;
  readingDomain: SajuDomain;

  sourceResponseHash: string;

  units: readonly CharacterGroundingUnitV1[];

  disclosures: readonly CharacterGroundingDisclosureV1[];
  ambiguities: readonly CharacterGroundingAmbiguityV1[];
}
```

이 객체는 **새 interpretation result가 아니다.**

다음에서 deterministic하게 projection한다.

```text
already-authorized reading/evidence/narrative material
→ bounded public character-grounding projection
```

---

# 6. CharacterGroundingUnitV1

캐릭터가 자기 문장으로 말할 수 있는 최소 의미 단위.

```ts
interface CharacterGroundingUnitV1 {
  unitId: string;

  domain: SajuDomain;
  axis:
    | 'core_identity'
    | 'action_style'
    | 'decision_style'
    | 'strength'
    | 'tension'
    | 'work'
    | 'wealth'
    | 'relationship'
    | 'responsibility'
    | 'learning'
    | 'expression'
    | 'boundary';

  narrativeRole:
    | 'primary'
    | 'supporting'
    | 'tension'
    | 'limitation';

  semanticKey: string;

  // Saju source가 승인한 의미. Character는 의미를 바꾸면 안 된다.
  canonicalMeaning: string;

  // 이 unit을 만들게 된 public reading block reference.
  sourceBlockRefs: readonly string[];

  // source가 제공할 때만 존재.
  qualifiers?: readonly string[];
  prohibitedExtensions?: readonly string[];

  ambiguityRef?: string;
}
```

### 규칙

`canonicalMeaning`은 소비자에게 그대로 노출하기 위한 최종 캐릭터 문구가 아니다.

예:

```text
semanticKey:
GENERAL_OUTPUT_TO_WEALTH

canonicalMeaning:
생각이나 표현을 실제 결과물로 만들고,
그 결과를 실질적 가치나 성과로 연결하려는 경향이 있다.
```

캐릭터는 이것을 말투에 맞게 표현할 수 있다.

하지만 다음으로 확장할 수 없다.

```text
→ "사업하면 돈을 잘 번다"
→ "창업이 천직이다"
→ "30대에 큰돈을 번다"
```

---

# 7. Grounding Unit Creation Rules

Saju side에서 unit을 만들 때:

```text
1. 이미 선택된/허용된 Reading 의미만 projection
2. 새로운 T8 claim 생성 금지
3. new ranking / scoring 금지
4. 캐릭터별 의미 생성 금지
5. MyeongHa 전용 명리 방법론 생성 금지
6. ambiguity / limitation 손실 금지
```

즉:

```text
CharacterGroundingUnit
!= T8 replacement
!= Narrative replacement
!= Product-specific new Saju meaning
```

---

# 8. MyeongHa-Side CharacterPerspectiveProfile

Character Canon/Persona와 별개로, “사주를 볼 때 무엇을 먼저 보는가”를 표현한다.

기존 `CharacterSajuCapability`의 access / initiative / affinity는 그대로 유지한다.

새 profile은 **attention / delivery only**다.

```ts
interface CharacterPerspectiveProfileV1 {
  schemaVersion: 'v1';
  characterId: CharacterId;
  profileVersion: string;

  attentionOrder: readonly CharacterAttentionAxis[];

  preferredNarrativeRoles: readonly (
    | 'primary'
    | 'supporting'
    | 'tension'
    | 'limitation'
  )[];

  selection: {
    maxPrimaryUnits: number;
    maxSupportingUnits: number;
    maxTensionUnits: number;
    avoidSameAxisRepetition: boolean;
  };

  interpretationBehavior: {
    contradictionHandling:
      | 'lead_with_it'
      | 'surface_after_strength'
      | 'only_when_material';

    uncertaintyHandling:
      | 'state_directly'
      | 'soften_but_preserve'
      | 'ask_before_extending';

    adviceStyle:
      | 'action_first'
      | 'reflection_first'
      | 'tradeoff_first'
      | 'question_first';
  };

  delivery: CharacterDeliveryProfileV1;
}
```

---

# 9. CharacterDeliveryProfileV1

Saju 의미와 무관한 표현 차이를 소유한다.

```ts
interface CharacterDeliveryProfileV1 {
  politeness: 'formal' | 'neutral_polite' | 'intimate_polite';
  sentenceRhythm: 'short' | 'mixed' | 'long';
  directness: 'low' | 'medium' | 'high';
  warmth: 'low' | 'medium' | 'high';
  teasing: 'none' | 'light' | 'frequent';
  metaphor: 'none' | 'light' | 'frequent';
  emotionalExposure: 'low' | 'medium' | 'high';
  questionFrequency: 'low' | 'medium' | 'high';
}
```

이 값들은 **사주적 의미를 바꾸는 weight가 아니다.**

예:

```text
directness = high
→ 같은 의미를 더 직접적으로 표현

NOT

directness = high
→ 부정적 사주 의미를 더 많이 생성
```

---

# 10. Relationship Modulation Is Separate

같은 캐릭터도 관계 단계에 따라 말투는 달라질 수 있다.

그러나 Perspective Profile 자체를 관계 상태가 바꾸면 안 된다.

```text
Character Perspective
= 이 캐릭터가 원래 무엇을 중요하게 보는가

Relationship Projection
= 지금 이 사용자에게 어느 정도 거리/친밀도로 말하는가
```

예:

```text
태겸 attention = contradiction/action

stranger
→ 짧고 선을 지킴

trusted
→ 더 개인적으로 찌르고 농담 가능
```

하지만 둘 다 같은 semantic unit을 근거로 한다.

---

# 11. CharacterInsightSelector

첫 버전은 LLM이 아니라 deterministic code로 구현한다.

입력:

```ts
interface CharacterInsightSelectionInputV1 {
  grounding: CharacterGroundingBundleV1;
  characterCapability: ResolvedCharacterCapability;
  perspective: CharacterPerspectiveProfileV1;
  requestedDomain: SajuDomain;
}
```

출력:

```ts
interface CharacterInsightSelectionV1 {
  selectedUnitIds: readonly string[];
  orderedUnitIds: readonly string[];
  omittedUnitIds: readonly string[];
  selectionReasons: readonly CharacterSelectionReasonV1[];
}
```

---

# 12. Selection Algorithm

초기 algorithm은 단순하고 auditable해야 한다.

```text
STEP 1
requested domain / capability와 맞지 않는 unit 제거

STEP 2
ambiguity 때문에 character realization이 금지된 unit 제거 또는 limitation과 묶음

STEP 3
primary narrativeRole 후보 확보

STEP 4
character attentionOrder 순으로 우선순위 적용

STEP 5
같은 axis 중복 억제

STEP 6
tension/limitation 최소 필요량 보존

STEP 7
동점은 source reading order → unitId lexical order로 deterministic tie-break
```

금지:

```text
LLM이 "재밌어 보이는 insight" 임의 선택
랜덤 선택
사용자 기분에 맞춰 Saju 의미 선택/삭제
관계도가 낮아서 불편한 결과 숨김
```

---

# 13. CharacterReadingPlanV1

Selector 결과를 실제 대사 계획으로 변환한다.

```ts
interface CharacterReadingPlanV1 {
  schemaVersion: 'v1';
  planId: string;

  characterId: CharacterId;
  readingRef: string;
  perspectiveProfileRef: VersionedRef;
  relationshipProjectionRef?: VersionedRef;

  beats: readonly CharacterReadingBeatV1[];
}
```

```ts
type CharacterReadingBeatV1 =
  | {
      kind: 'semantic_realization';
      unitRefs: readonly string[];
      purpose: 'lead' | 'expand' | 'contrast' | 'caution';
    }
  | {
      kind: 'character_reaction';
      allowedSourceUnitRefs: readonly string[];
    }
  | {
      kind: 'follow_up_question';
      sourceUnitRefs: readonly string[];
      questionStrategy: QuestionStrategy;
    }
  | {
      kind: 'protected_disclosure';
      disclosureRef: string;
    };
```

Plan에는 **최종 한국어 문장**을 넣지 않는다.

---

# 14. Character Renderer Input

```ts
interface CharacterSajuRendererInputV1 {
  character: {
    canonRef: VersionedRef;
    personaRef: VersionedRef;
    behaviorRef: VersionedRef;
    perspectiveRef: VersionedRef;
  };

  relationship: RelationshipProjection;

  grounding: {
    readingRef: string;
    units: readonly CharacterGroundingUnitV1[];
    disclosures: readonly CharacterGroundingDisclosureV1[];
    ambiguities: readonly CharacterGroundingAmbiguityV1[];
  };

  plan: CharacterReadingPlanV1;

  currentUserContext?: {
    grantedLifeFacts: readonly GrantedLifeFact[];
    grantedMemories: readonly GrantedMemory[];
  };
}
```

중요:

```text
raw CanonicalSajuSnapshot
raw T5/T8 Claim Graph
Rule Registry
Methodology internals
```

은 Character Renderer에 직접 넣지 않는다.

---

# 15. Renderer Output

자유 문자열 하나로 받지 않는다.

```ts
interface CharacterSajuUtteranceV1 {
  schemaVersion: 'v1';
  characterId: CharacterId;
  readingRef: string;

  segments: readonly CharacterSajuUtteranceSegmentV1[];
}
```

```ts
type CharacterSajuUtteranceSegmentV1 =
  | {
      kind: 'semantic_realization';
      text: string;
      sourceUnitRefs: readonly string[];
    }
  | {
      kind: 'character_reaction';
      text: string;
      sourceUnitRefs: readonly string[];
    }
  | {
      kind: 'follow_up_question';
      text: string;
      sourceUnitRefs: readonly string[];
    }
  | {
      kind: 'protected_disclosure';
      disclosureRef: string;
    };
```

이렇게 해야 어느 문장이 어떤 Saju 의미에 기대는지 추적할 수 있다.

---

# 16. Semantic Preservation Guard

Guard는 단일 boolean validator 하나로 끝내지 않는다.

```text
Layer 1: Structural Guard
Layer 2: Deterministic Safety Guard
Layer 3: Semantic Preservation Gate
Layer 4: Fallback Decision
```

---

## 16.1 Structural Guard

반드시 검사:

```text
semantic_realization → sourceUnitRefs >= 1
sourceUnitRef가 grounding bundle 안에 존재
plan이 선택하지 않은 unit을 renderer가 사용하지 않음
protected disclosure 누락/변경 없음
ambiguity가 있을 때 required limitation beat 존재
unknown segment kind 거부
```

---

## 16.2 Deterministic Safety Guard

예:

```text
source에 없는 특정 연도/나이/금액 생성 금지
source에 없는 직업명 확정 금지
source에 없는 배우자 속성 확정 금지
source에 없는 성공/실패 outcome 확정 금지
prohibitedExtensions exact registry 검사
```

가능한 경우 정규식/structured extraction으로 선차단한다.

---

## 16.3 Semantic Preservation Gate

완전한 자유 paraphrase의 semantic equivalence를 단순 문자열 규칙만으로 증명할 수는 없다.

따라서 rollout 단계가 필요하다.

### Stage SP-0

```text
protected canonical block only
```

현재 baseline.

### Stage SP-1

```text
source-approved bounded realization templates
+ character lexical/rhythm slots
```

예:

```text
MEANING:
"자기 방식과 현실 조건 사이의 마찰"

Template family:
"{opening} 원하는 방식은 분명한데, {reality_phrase}이 끼어들면 {friction_phrase}."
```

character는 lexical slot만 바꾼다.

### Stage SP-2

```text
LLM free paraphrase candidate
+ deterministic guard
+ semantic-preservation evaluator
+ offline regression/eval threshold
+ runtime fallback
```

SP-2 evaluator는 **새 의미를 승인하는 authority가 아니다.**

역할:

```text
candidate sentence가 source unit meaning을 보존하는지 검사
```

uncertain / fail이면 canonical protected rendering으로 fallback한다.

---

# 17. Meaning-Preservation Failure Classes

Validator/Eval은 최소 다음 class를 구분한다.

```text
ADDED_CLAIM
→ source에 없는 사주 의미 추가

STRENGTHENED_CERTAINTY
→ "경향"을 "반드시"로 강화

DROPPED_QUALIFIER
→ 조건/제한 삭제

AMBIGUITY_FLATTENED
→ 불확실한 계산을 하나로 확정

DOMAIN_ESCALATION
→ 성향을 성공/소득/결혼 outcome으로 확대

TEMPORAL_INVENTION
→ source 없는 시기 예측 추가

PERSONAL_FACT_INVENTION
→ 사용자가 말하지 않은 현실 사실 단정

MEANING_REVERSAL
→ source meaning과 반대
```

---

# 18. Character Difference Must Be Real, Not Cosmetic

캐릭터 차이를 단순 어미/말투로 만들지 않는다.

차이는 세 층에서 발생한다.

```text
A. ATTENTION
무엇을 먼저 집는가

B. ORGANIZATION
같은 의미를 어떤 순서와 대비로 묶는가

C. DELIVERY
어떤 어휘/리듬/감정/질문으로 말하는가
```

사주 의미 자체는 네 번째 차이 축이 아니다.

---

# 19. Example: Same Grounding, Different Characters

다음은 구조 설명용 예시이며 실제 캐릭터 canon 값을 확정하지 않는다.

공통 grounding:

```text
U1 action_style
생각/표현을 실제 결과로 만들고 실질 가치로 연결하려는 경향

U2 tension
자기 방식과 현실 자원 조건 사이에 마찰 가능

U3 responsibility
결과 이후 관리/책임/기준까지 신경 쓰는 경향
```

Character A plan:

```text
lead = U2
expand = U1
contrast = U3
```

Character B plan:

```text
lead = U3
expand = U1
caution = U2
```

둘은 같은 U1/U2/U3를 사용하지만 체감은 달라진다.

---

# 20. Council Architecture

Council의 핵심 invariant:

```text
모든 캐릭터가 같은 CharacterGroundingBundle을 공유한다.
```

캐릭터별로 bundle을 다시 계산하지 않는다.

```text
                    Grounding Bundle
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
    Perspective A     Perspective B     Perspective C
          │                │                │
          ▼                ▼                ▼
       Plan A            Plan B            Plan C
          │                │                │
          ▼                ▼                ▼
      Renderer A        Renderer B        Renderer C
```

---

# 21. Council Disagreement Rules

캐릭터끼리 “사주 사실”을 제멋대로 다르게 주장하면 안 된다.

허용되는 disagreement:

```text
"저는 U2가 더 중요하다고 봅니다."
"저는 그보다 U3가 현실에서는 먼저 드러난다고 봅니다."
"그 문제를 약점보다 trade-off로 보는 편이 낫습니다."
```

즉 disagreement 대상:

```text
priority
emphasis
practical implication
question strategy
relational response
```

금지:

```text
A: 재성이 있다
B: 재성이 없다

A: 결혼운이 좋다
B: 이별수가 강하다
```

동일 methodology / 동일 reading에서 semantic fact conflict를 캐릭터 개성으로 만들지 않는다.

다른 명리 방법론 자체의 공식 contested interpretation이 존재할 때만 source가 그 차이를 먼저 모델링해야 한다.

---

# 22. CouncilTurnPlanV1

```ts
interface CouncilTurnPlanV1 {
  schemaVersion: 'v1';
  readingRef: string;

  participants: readonly CharacterId[];

  turns: readonly {
    speaker: CharacterId;
    stance:
      | 'lead'
      | 'emphasize'
      | 'counterbalance'
      | 'agree_expand'
      | 'question';
    unitRefs: readonly string[];
    respondsToTurn?: number;
  }[];

  maxTurns: number;
}
```

Council Director도 새 Saju meaning을 생성하지 않는다.

---

# 23. Council Anti-Repetition

각 캐릭터가 같은 말을 어미만 바꿔 반복하지 않도록 planner가 조정한다.

```text
Character A가 U1을 lead
→ Character B는 U1 반복보다 U2/U3 선택 우선

모든 핵심 unit이 이미 cover됐음
→ 이후 캐릭터는 practical implication / question / counterbalance로 전환
```

하지만 anti-repetition 때문에 중요한 limitation을 숨겨서는 안 된다.

---

# 24. Life Facts and Saju Must Remain Distinct

캐릭터는 사용자가 허용한 현재 삶의 사실을 함께 사용할 수 있다.

예:

```text
Saju grounding U2
= 자기 방식과 현실 조건 사이 마찰 경향

Granted Life Fact
= 최근 이직 여부를 고민 중이라고 사용자가 직접 말함
```

허용:

```text
"아까 이직 얘기를 하셨죠. 이 부분은 그 고민을 볼 때 같이 생각해볼 수 있겠습니다."
```

금지:

```text
Saju U2만 보고
→ "지금 회사에서 상사와 싸우고 있군요"
```

따라서 renderer context에서도:

```text
Saju Grounding
Life Fact
Memory
Session Context
```

를 별도 namespace로 유지한다.

---

# 25. Persistence / Provenance

캐릭터 사주 답변을 저장할 때 최소 다음 lineage를 남긴다.

```ts
interface CharacterReadingProvenanceV1 {
  readingRef: string;
  sourceResponseHash: string;
  groundingSchemaVersion: string;

  characterId: CharacterId;
  canonVersion: string;
  personaVersion: string;
  behaviorVersion: string;
  perspectiveVersion: string;

  readingPlanHash: string;
  rendererVersion: string;
  guardVersion: string;

  selectedUnitIds: readonly string[];
  renderedUnitIds: readonly string[];

  validationState:
    | 'protected_only'
    | 'template_validated'
    | 'semantic_validated'
    | 'fallback_used';
}
```

DB에 Saju 내부 T0/T5/T8 graph를 복제하지 않는다.

---

# 26. Cache Key

같은 결과를 재사용할 수 있는 범위와 관계 대화를 구분한다.

Semantic selection cache candidate:

```text
sourceResponseHash
+ characterId
+ perspectiveVersion
+ requestedDomain
→ CharacterInsightSelection
```

Final rendered text는 relationship context가 들어가면 별도다.

```text
selection cache
!= final dialogue cache
```

---

# 27. Versioning Rule

캐릭터 답변은 다음 중 하나가 바뀌면 재현 결과가 달라질 수 있다.

```text
Saju response
Perspective profile
Character persona
Relationship projection
Renderer
Guard
```

따라서 이 버전들을 숨기지 않는다.

다만 사용자에게 모든 내부 버전을 노출할 필요는 없다.

---

# 28. Failure / Fallback Policy

```text
Saju execution unavailable
→ generic AI Saju 생성 금지

Grounding bundle unavailable
→ current protected-block Mode A only

Perspective profile missing
→ generic character Saju improvisation 금지

Selector fail
→ protected canonical reading fallback

Renderer fail
→ protected canonical reading fallback

Semantic guard fail
→ candidate 폐기 + protected canonical reading fallback

Ambiguity required but omitted
→ reveal 금지
```

사주 기능 전체를 죽이기보다 **캐릭터 자유도만 축소**하는 방향으로 fail closed한다.

---

# 29. UX Modes

## 29.1 Single Character Reading

```text
사용자
→ 캐릭터 선택
→ 전체 사주 요청
→ 캐릭터가 2~4개 핵심 의미를 자기 관점으로 풀이
→ 질문 1개 또는 현실 연결
```

## 29.2 Council Reading

```text
공통 사주 grounding
→ 대표 캐릭터 lead
→ 다른 캐릭터가 다른 axis를 강조
→ 필요한 경우 한 번 반론/보완
→ 사용자 선택으로 특정 캐릭터 follow-up
```

## 29.3 Follow-up

follow-up은 기존 grounding을 재사용할 수 있다.

```text
"돈 얘기 좀 더 해줘"
→ wealth domain unit selection
```

하지만 새로운 domain/temporal request가 필요하면 Saju Reading authority를 다시 요청한다.

---

# 30. First Vertical Slice

처음부터 9명 × 모든 사주 영역 × Council을 만들지 않는다.

첫 implementation target:

```text
Domain: general natal
Character: 1명
Grounding units: 최대 3~4개
Mode: SP-1 bounded character realization
Fallback: protected block
UI: single-character reading only
```

Acceptance:

```text
1. 동일 Saju reading으로 반복 실행 시 selected semantic units deterministic
2. 캐릭터가 원문을 그대로 복사하지 않아도 canonical meaning 보존
3. 없는 Saju claim 추가 없음
4. certainty 강화 없음
5. ambiguity/limitation 누락 없음
6. Character persona 차이가 문체뿐 아니라 attention/order에 나타남
7. guard fail 시 protected mode fallback
```

---

# 31. Second Vertical Slice

두 번째 캐릭터를 추가한다.

목표는 “말투 차이”가 아니라 **같은 grounding에서 attention/order 차이**를 검증하는 것이다.

Test:

```text
same reading
same units available
Character A selected/order != Character B selected/order
BUT
union of outputs ⊆ source grounding semantics
```

---

# 32. Council Vertical Slice

2~3 character finite council.

```text
maxTurns = 3~5
same grounding bundle
no new Saju execution per character
no autonomous infinite loop
```

검증:

```text
no semantic contradiction
no duplicated lead point unless explicit disagreement about emphasis
no hidden limitation
all semantic lines trace to sourceUnitRefs
```

---

# 33. Test Matrix

## Contract

- unknown semanticKey → reject
- duplicate unitId → reject
- missing sourceBlockRef → reject
- unit domain mismatch → reject

## Selector

- deterministic same input → same selection/order
- capability denied → no plan
- attention profile changes order, not meaning
- relationship stage does not change selected Saju truth

## Renderer

- every semantic line has sourceUnitRefs
- character reaction cannot introduce Saju assertion
- user Life Fact namespace does not masquerade as Saju fact

## Guard

- added fortune outcome → reject
- invented timing → reject
- certainty strengthening → reject
- omitted ambiguity → reject
- meaning reversal → reject

## Council

- all characters share same readingRef/sourceResponseHash
- no per-character Saju recalculation
- finite turn count
- every semantic turn traceable

---

# 34. Evaluation Dataset

SP-2 free paraphrase 전에 별도 evaluation corpus가 필요하다.

각 case:

```ts
interface CharacterSajuEvalCaseV1 {
  groundingUnit: CharacterGroundingUnitV1;
  characterProfileRef: VersionedRef;

  allowedExamples: readonly string[];
  forbiddenExamples: readonly {
    text: string;
    failureClass: MeaningPreservationFailureClass;
  }[];
}
```

Corpus는 캐릭터 매력도만 평가하면 안 된다.

두 축을 분리한다.

```text
A. Semantic preservation
B. Character fidelity
```

둘 다 통과해야 한다.

---

# 35. Metrics

Production rollout 전 최소 측정:

```text
semantic_guard_pass_rate
fallback_rate
added_claim_failure_rate
certainty_strengthening_failure_rate
ambiguity_preservation_rate
character_distinctiveness_score
cross_character_semantic_consistency_rate
unit_trace_coverage
```

주의:

`character_distinctiveness_score`를 높이기 위해 semantic guard를 약화하지 않는다.

---

# 36. Implementation Ownership

## Saju repository owns

```text
Calculation
Interpretation claims
Domain synthesis
Evidence
Governed reading
CharacterGroundingBundle public contract
Grounding projection validator
Grounding source refs/hash
Saju-side ambiguity/guard semantics
```

## MyeongHa repository owns

```text
Character capability
Perspective profile
Insight selection
Reading plan
Persona / relationship context
Character renderer
Semantic-preservation orchestration
Council director
Character output provenance
UI reveal
```

---

# 37. Explicit Non-Goals

이 설계로 다음을 하지 않는다.

```text
캐릭터별 별도 Saju engine
캐릭터별 별도 명리 방법론
캐릭터가 raw chart를 직접 재해석
캐릭터 개성 때문에 사주 사실 변경
LLM으로 T8 claim 즉석 생성
관계도가 높아서 좋은 말만 선택
관계도가 낮아서 나쁜 말만 선택
Council을 여러 모델의 자유 토론으로 방치
```

---

# 38. Migration From Current Runtime

현재:

```text
CharacterSajuContextEnvelopeV2
→ protected Product block refs
```

목표:

```text
CharacterSajuContextEnvelopeV2
├─ protected Product block refs          // fallback 유지
└─ characterGroundingRef?                // source-approved when available
```

즉 기존 contract를 버리지 않는다.

새 grounding이 없는 reading은 자동으로 Mode A다.

---

# 39. Proposed Envelope Extension

```ts
interface CharacterSajuContextEnvelopeV3 {
  schemaVersion: 'v3';

  readingRef: string;
  sajuResponseVersion: string;
  engineVersion: string;
  domain: SajuDomain;
  productState: ProductReadingResponseState;
  requiredAction: ProductReadingResponseRequiredAction;

  protectedReadingBlocks: readonly ProtectedProductBlockRef[];
  disclosures: readonly ProtectedDisclosureRef[];
  calculationAmbiguity: readonly ProductReadingResponseCalculationAmbiguity[];

  characterGrounding?: CharacterGroundingBundleRefV1;
}
```

`characterGrounding`은 Saju source contract가 존재하고 validator가 PASS한 경우에만 들어간다.

MyeongHa가 Product block을 읽어 임의 생성하지 않는다.

---

# 40. Recommended Build Order

```text
CSR-01
Character Saju Rendering Architecture 확정
(this document)

↓

CSR-02 — Saju repo
CharacterGroundingBundleV1 public contract
+ deterministic projection
+ validator/tests

↓

CSR-03 — MyeongHa
CharacterSajuContextEnvelopeV3
+ admitted grounding projection

↓

CSR-04
CharacterPerspectiveProfileV1
+ exact character profile registry

↓

CSR-05
CharacterInsightSelectorV1
+ deterministic tests

↓

CSR-06
CharacterReadingPlanV1
+ planner tests

↓

CSR-07
SP-1 bounded Character Renderer
+ semantic guard
+ protected fallback

↓

CSR-08
single-character General Natal E2E

↓

CSR-09
second-character differentiation E2E

↓

CSR-10
finite Council 2~3 character E2E

↓

CSR-11
SP-2 paraphrase eval corpus / semantic-preservation gate

↓

CSR-12
controlled rollout
```

---

# 41. Definition of Done

이 구조가 완성됐다고 말하려면 최소:

```text
[ ] 하나의 Saju reading meaning source만 존재
[ ] 캐릭터마다 다른 Saju engine이 없음
[ ] Character Grounding이 source-owned
[ ] same reading → same grounding bundle
[ ] character perspective changes selection/order only
[ ] renderer semantic line → source unit trace 100%
[ ] ambiguity/limitation preserved
[ ] semantic drift test corpus pass
[ ] guard fail → protected fallback
[ ] two characters are observably distinct on same reading
[ ] Council uses same grounding and finite plan
[ ] no Character output directly mutates Saju/relationship authority
```

---

# 42. Final Architecture Statement

명하의 캐릭터 사주 시스템은 다음 문장으로 정의한다.

> **사주는 하나의 truth-bearing interpretation pipeline이 계산하고, 캐릭터는 그 결과에서 자신이 중요하게 보는 의미를 선택해 자기 방식으로 전달한다. 캐릭터의 개성은 attention, organization, delivery에서 발생하며 Saju semantic truth를 변경하지 않는다. 자유로운 캐릭터 표현은 source-owned grounding과 semantic-preservation guard가 있을 때만 허용하고, 검증에 실패하면 보호된 원문 의미로 즉시 fallback한다.**
