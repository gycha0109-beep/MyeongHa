# 세연 C09 — Bible/Runtime 기반 단일 호출 캐릭터 프롬프트 구성 설계 v1

Watchtower-Track: character-memory

**상태:** 실행 가능한 연구용 Persona Prompt Composer 작성 / Provider 실행·Production 연결 **안 함** / 모델 품질·안전 동등성 **미검증**.

**목적:** 세연의 긴 Bible·Runtime을 모델에 그대로 붙여 넣지 않고, **매 턴 변하지 않는 고정 성격**, **현재 대화에서만 필요한 상황별 Runtime 규칙**, **서버가 권한을 확인한 동적 맥락**을 분리한다. 이 구성을 사용한 **턴 해석+대사 생성 단일 LLM 호출**이 실제로 세연의 성격과 대화 품질을 보존할 수 있는지 비교할 후보를 정의한다.

관련 실행 코드:
- `apps/api/src/seyeon-c09-persona-prompt-profile-shadow-v1.ts`
- `test/seyeon-c09-persona-prompt-profile-shadow-offline-v1.test.ts`
- 상위 후보 비교: `docs/character-memory-seyeon-llm-call-architecture-research-design-v1.md`

## 1. 현재 원본과 의미적 권위

이 문서 및 C09 코드에서 사용한 **실제 최신 브랜치 파일**:

| 파일 | 현재 Git Blob SHA | 상태 |
|---|---|---|
| `docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md` | `5fddbce24c5606d888b64ab3c8dbf3256b65e04d` | `DRAFT / NOT YET PRODUCTION AUTHORITY` |
| `docs/character/SEYEON_CHARACTER_RUNTIME_DRAFT_V0_1.md` | `d6bc911021e30aa70fde133c4350513008a721e7` | `DRAFT / NOT YET PRODUCTION AUTHORITY` |
| `docs/character/CHARACTER_RUNTIME_STANDARD_V1.md` | 공통 규칙과 Context 조립 순서의 근거 | Runtime 표준 |

**프로젝션 불일치 발견:** 기존 `packages/character-content/src/seyeon-authored-projection-v2.ts`는 Bible SHA `2ecccbf4a1a7cb595b8a30f300f678d0a1e06999`, Runtime SHA `84c2f800db40ca963b969743e4e2f5927ff8a01a`를 선언하지만 **현재 원본 SHA와 다르다**. 또한 `SEYEON_UNDEFINED_FIELDS_V2`의 `exact_age`, `occupation_or_social_role`, `confirmed_family_relationships`, `past_romance` 등 일부 표현은 현재 Bible B1·I3·J4·부록의 결정된 설정과 그대로 대응하지 않는다.

예: 현재 Bible B1에서 **Canon 기준시점 25세**와 **명하의 현직 연결자**가 정의되어 있다. 단 **정확한 출생연도**는 아직 미정이며 25세를 영구 고정 연령으로 출력해선 안 된다. 가족/과거 연애의 기본 설정은 정해졌지만 공개 가능 깊이는 별도 Disclosure 규칙을 따른다. 이 차이는 **캐릭터 설정 누락과 과잉 회피**로 이어질 수 있으므로 실제 단일 호출 모델에 연결하기 전에 Authoring Projection/Fact Authority 정합성을 별도 바로잡아야 한다. C09에서는 기존 Canon/Projection/Production 코드를 수정하거나 임의 승인하지 않는다.

**중요:** C09의 Persona 텍스트는 현재 원본으로부터 만든 **연구용 요약 프로필**이지 Canon 재작성 또는 권한 판정 자료가 아니다. 문서 지침이 공식 서버 ACL/Grant/원본 Fact Authority를 대체하지 않는다.

## 2. 원본에 이미 정의된 Context 조립 원칙

`CHARACTER_RUNTIME_STANDARD_V1.md`의 다음 조항을 그대로 적용한다.

- §3.1: System/Safety/Product Authority → Character Core Anchor → Relationship Projection → Turn State → 필요한 Claim·Disclosure Decision → Relevant Bible Slices → 승인된 Event Memory + Provenance → Recent Dialogue → Protected Domain Segment → Response Task.
- §3.1: **Bible 전체와 전체 대화 로그를 매 턴 넣지 않는다.**
- §10.1: Fixed Context는 **authority rules / character core anchor / hard unknown boundaries**로 작게 유지.
- §10.2: Dynamic Context는 **Bible slices / relationship projection / retrieved events / unresolved threads / recent dialogue** 중 현재 필요한 것만.
- §10.3: 압박 시 low-relevance trivia → 중복 Bible 예시 → 해결된 낮은 중요도 사건 → 공식 기록으로 대체 가능한 오래된 대화 순으로 제거. **authority/safety, 현재 메시지, 최근 대화 연속성, 관계 상태, unresolved causal events, relevant core는 보호**.
- §11: 출력 후 Canon/Persona/Relationship/Memory/Integrity/Risk guard 유지.
- §13: Persona Fidelity, Agency, Relationship Continuity, Memory Quality, Long-Horizon Stability, Anti-Repetition, Open-World Coherence로 평가.

따라서 Runtime 본문 전체 24,549자와 Bible 본문 전체 33,203자(이번 브랜치에서 조회한 문자 수)는 **프롬프트 하나에 모두 포함할 필수 지시문이 아니다**. 정확한 토큰 수와 비용은 모델별 tokenizer/Provider 사용량을 계측할 때만 산정한다.

## 3. 고정 시스템 프롬프트 — 매 턴 동일

**핵심 축:** Bible A1–A4, B1/B2, C1/C7/C8, E1–E3, F1 및 Runtime R1/R2/R5/R7/R10.6/R13/R14.

구성 요소:

1. **WHO:** 세연은 명하에서 태어난 인간이자 현재 연결자/첫 안내자. 밝고 편안한 존댓말을 쓰지만 단순한 튜토리얼 NPC나 상담 AI가 아니다.
2. **핵심 모순:** 밝음=행동성; 남 챙김↔도움받기 어려움; 빠른 선택↔느린 자기 감정 자각; 넓은 사교성↔중요한 사람에게는 조심; 친밀해져도 독립성·장난·거절·고집 유지.
3. **행동 원리:** 현재 장면에서 먼저 포착할 것→당장 원하는 것→사용자 선택권을 남기는 행동→자연스러운 대사. 모든 턴에서 똑같이 선택지를 나열하거나 억지로 게임을 시작하지 않는다.
4. **기본 표현:** 자연스럽고 활기 있는 존댓말. 장난은 맥락에서만. 상담사화·무조건 긍정·과잉 돌봄·순종적 연애 캐릭터화 방지.
5. **고정 금지 경계:** 사용자 주장을 사실화하지 않기, 미정 전기·고유명사·공동 과거·현재 사용자와의 관계 감정을 발명하지 않기, 별도 권한 없는 기억/사주/민감 개인사 제공하지 않기.
6. **현재 취향과 Canon 분리:** 순간적 관심·의견을 말할 수 있지만 자동으로 영구 취향·전문 능력·과거 사건으로 승격하지 않는다.

**코드에 실제 구현한 완성된 고정 프롬프트 원문**은 `ALWAYS_ON_PUBLIC_PERSONA_V1`에 8개 문장 블록으로 들어 있다. 각 블록 끝에 Bible/Runtime 원본 섹션을 명시하며, 저작 문서가 변경되면 소스 핀과 프로필을 함께 검토한다.

**포함하지 않는 것:** 현재 사용자와의 연애 관계 판정, 비공개 가족/연애 내용, 실제 기억 본문, 사주 결과 해석, 전체 World 규칙, 고정 예시 대사 수십 개.

## 4. 상황별 Runtime Slice — 필요할 때만

단일 호출 프롬프트를 일곱 가지 **공개 대화 중심 행동 포커스**로 설계했다. 아래의 트리거는 UX 테스트 사례를 설명하는 것이며, 현재 C09 Composer는 **사용자 문장을 입력받아 자동 분류하지 않는다**. Production 적용 시에는 신뢰할 수 있는 서버 라우팅·권한 검사를 거쳐 선택해야 한다.

| 공개 포커스 | 원본 근거 | 추가되는 행동 지침 | 절대 확대하지 않는 영역 |
|---|---|---|---|
| `smalltalk` | Bible A/E, Runtime R5/R7 | 세연 자신의 이야기·장난·현재 관찰로 대화를 움직임 | 무조건 게임/질문 메뉴 |
| `choice` | Bible C1/C7/C8, Runtime R3–R7 | 망설임을 현실적인 선택으로 좁힘 | 사용자의 중요한 결정 강탈 |
| `low_state` | Bible B2/F3, Runtime R5/R8/R13 | 가벼운 피곤함·심심함에 과잉 상담 대신 반응+작은 움직임 | 위해 신호를 가벼운 심심함으로 취급 |
| `conversation_pace` | Bible A/B, Runtime R5/R7 | 느린 대화 속도를 존중하고 완결된 세연의 태도 제시 | 속도 관련 발언을 고통으로 단정 |
| `conversation_boundary` | Bible B/E, Runtime R2/R7/R11 | 자신이 편한 범위·거절을 캐릭터답게 말함 | 대화 중 비공개 개인사 자동 unlock |
| `mundane` | Bible D1–D7, Runtime R2.5/R13 | 일상 취향을 필요할 때만 자연스럽게 활용 | 모든 발화에 특정 음식·사진·우산 삽입 |
| `present_opinion` | Bible C1/C8, Runtime R2.5/R4/R7 | 현재 원하는 것·의견을 자기 목소리로 직접 제시 | 순간적 취향을 영구 Canon으로 고정 |

**프로필 별 선택 규칙:** `core`는 상황 Slice 0개, `core_examples`도 0개, `core_focus`는 정확히 1~2개의 신뢰된 공개 포커스만 허용한다. 존재하지 않는 포커스, 중복 선택, 3개 이상의 포커스는 모델 호출 전 오류로 처리한다. **이 1~2개 상한은 비교 실험 초기 구현값**이며 최적 토큰 예산으로 입증된 수치가 아니다.

### 비공개·복잡한 상황은 공개 포커스와 분리

다음은 현재 C09 공개 Composer에서 **선택할 수 없다**. 설계 참조만 정의한다.

- `conflict`: Runtime R6/R9/R13; 현재 이력·장면·사실이 확인된 후 갈등/서운함/수습 표현.
- `intimacy`: Bible G/H + Runtime R10/R11; 공식 Relationship Projection 및 필요한 Event Ledger의 인과와 Reveal 권한이 확보된 경우만. 관계 단계 값만으로 자기노출 금지.
- `memory`: Runtime R12; 실제 기억 소유·Grant·출처·revision이 확인된 이후만. '세연은 기억력이 좋다'는 성격만으로 사용자 기억 창작 금지.
- `saju_reading`: Reading 출처/범위/Entitlement/Reader Knowledge 확인 후 별도 Character↔Saju Renderer 계약을 사용. 일반 캐릭터 채팅이 원본 명리 의미를 창작하는 도구가 되지 않는다.
- `risk`: 위험 언어·가짜 관리자·프롬프트 탈취·인젝션 등은 캐릭터 포커스가 아니라 **기존 서버 보안 정책과 별도 분류·Guard**의 관할. 단일 호출만으로 동등 보안성을 주장하지 않는다.

## 5. 실제 구성 결과 — 비교할 세 프로필

```ts
import {
  composeSeyeonC09PersonaPromptPlanV1,
} from '../apps/api/src/seyeon-c09-persona-prompt-profile-shadow-v1.js';

const a = composeSeyeonC09PersonaPromptPlanV1({
  profile: 'core',
}); // Always-On만

const b = composeSeyeonC09PersonaPromptPlanV1({
  profile: 'core_examples',
}); // Always-On + Bible E1/E2 원본 말투 예시

const c = composeSeyeonC09PersonaPromptPlanV1({
  profile: 'core_focus',
  selectedFocuses: ['low_state', 'present_opinion'],
}); // Always-On + 예시 + 선택한 Runtime 규칙 2개

// a/b/c.personaInstructions 는 텍스트뿐.
// 모델 호출도, 서버 승인도, 권한/기억 조회도 수행하지 않는다.
```

프로필 C의 **추가 입력** 예(연구용 구성 설명):

```text
[서버 소유 공통 권한 및 출력 규칙] — 매 호출에 명시
[세연 C09 고정 성격 프로필] — 작은 stable prefix
[상황별 공개 행동 규칙: low_state + present_opinion] — 이번 턴 필요한 것만
[서버가 이미 검증한 현재 관계와 공개 범위] — 미확인이면 public only
[허용된 최근 대화] — 서버 공식 이력으로 검증
[현재 사용자 메시지: "오늘 좀 심심해"] — 사용자 데이터, 지시권한 없음
[응답 규격: 기존 interpretation+draft 구조화 Schema]
             ↓
       LLM 통합 1회 (해석 + 대사 초안)
             ↓
 기존 interpretation / action / risk causality / renderer 구조 가드
             ↓
 독립 Semantic Review (유지하면 핵심 호출 2회)
 또는 제한된 로컬 검증 Shadow (의미 동등성 근거 없음)
```

**대조할 실제 프롬프트 프로필:** A/B/C 모두 user input·모델·출력 규격·서버 사전 검사·감지·Guard 조건은 같게 둔다. 달라지는 것은 **성격 설명의 양과 선택된 Runtime 규칙**뿐이다. 특정 프로필이 이겼다고 그 자체로 1회 호출의 보안 검증이 완료된 것은 아니다.

**중요 구분:** 생성 프롬프트를 1회로 통합하더라도 사전 Integrity/Disclosure 분류가 LLM으로 2회 실행되면 사용자 턴 총 호출 수는 그만큼 증가한다. 총 비용·지연은 end-to-end 집계한다.

## 6. 기존 코드에 붙일 때의 안전한 경계

- 기존 `packages/domain/src/seyeon-runtime-context-v2.ts`는 `ALWAYS_ON_SLICE_IDS`, `FOCUS_SLICE_IDS`, `resolveSeyeonBibleSliceSelectionV2`, `assembleSeyeonRuntimeContextV2`로 이미 Slice 선택을 구현한다. **이를 버리고 또 하나의 새 인가 엔진을 만들지 않는다.**
- 다만 이 조립기는 현재 `seyeon-authored-projection-v2.ts` 값을 읽으므로 소스 SHA 및 현재 Bible 사실과의 정합성 문제를 먼저 분리해서 해결해야 한다.
- C09 Composer는 오직 평가용 **personaInstructions**만 반환하는 순수 함수이며 `provider.generate`·DB·Memory·Relationship·Saju·HTTP Reply/Reveal에 연결되지 않는다.
- 후속 실제 연구 호출에서는 기존 `SEYEON_FAST_DIALOGUE_SHADOW_RESPONSE_SCHEMA_V1`(interpretation + draft)과 Interpretation/Risk/Renderer Guard를 그대로 사용한다. 새로운 ‘검토 완료’ 해시를 생성해서는 안 된다.
- 고정 프롬프트의 실행 문장은 캐릭터성 가이드일 뿐, 모델에 내용을 넣었다는 사실로 권한이 생기지 않는다. **공식 Source/Canon/Grant/Relationship/Reading 확인 후** 공개할 수 있는 최소 자료만 삽입한다.
- 원문 크기를 이유로 중요한 서사·갈등·모순을 전부 삭제하면 캐릭터가 평평해질 수 있다. 그러므로 `core` 단독이 아니라 `core_examples`, `core_focus`와 비교한다.

## 7. 검증 및 다음 구현 순서

**이번 작업에 포함한 것:** 고정 성격 문장 8개 블록, 원본 E1/E2 예시, 공개 상황별 7종 규칙, 프로필 A/B/C 컴포저, 원본 Git Blob SHA 핀, 오프라인 소스/선택 테스트.

**아직 완료하지 않은 것:** 실제 사용 맥락을 읽는 서버 라우터, 자동 focus 판정, Projection-최신 원본 동기화, 실제 모델 프롬프트 계측, 캐릭터·보안 동등성 테스트, Production 인증.

**차기 순서:**
1. 원본 Bible/Runtime과 기존 `seyeon-authored-projection-v2.ts`를 맞춘 뒤 사용자 관계·기억·사주 권한 경계에 영향이 없는지 확인.
2. 위 3개 프로필을 기존 **공개 첫 대화** Shadow의 **동일 구조화 출력과 같은 권한 검사**에 opt-in으로만 연결.
3. 오프라인 mock으로 프롬프트 내용·호출 횟수·출력 schema·거부 경로 확인.
4. 유료 승인 후 동일 모델에서 프로필 A/B/C의 캐릭터 반응, 관계 침범, 정상 질문 적격률, 긴 대화 반복, 비용/지연 비교. `full_runtime`은 더 긴 프롬프트가 실제 도움이 되는지를 보는 **실험용 기준군**으로만 비교.
5. 결과가 충분하면 별도 Independent Reviewer 유지/제거 효과를 다시 비교해 최적 구조를 선택.

**현재 결론:** 핵심 프롬프트 + 상황별 Runtime 선택은 명하 Runtime Standard의 원래 방식이며, C09 코드는 그 방향의 세 가지 평가 구성을 실제로 생성한다. 그러나 현재는 모델을 호출하지 않았고, **1회 호출 가능성·품질·보안이 입증된 것은 아니다.**
