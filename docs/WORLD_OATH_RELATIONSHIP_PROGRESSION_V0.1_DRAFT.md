# 명하 Oath-Driven Relationship Progression v0.1 — Working Draft

> Status: **PROTOTYPE / NON-AUTHORITY**  
> Date: **2026-08-30**  
> Parent drafts: `WORLD_OATH_MODEL_V0.1_DRAFT.md`, `WORLD_REPRESENTATIVE_GIFT_BURDEN_V0.1_DRAFT.md`  
> Purpose: 서약을 캐릭터 관계 progression의 '공략 대상'이 아니라, 발견·신뢰·결정적 관계 장면을 만드는 축으로 사용할 수 있는지 검증한다.  
> Important: relationship stage evaluator, unlock DSL, reward/entitlement implementation은 정의하지 않는다.

---

## 1. Core Proposal

사용자 아이디어:

> 캐릭터마다 대리자가 될 때 정한 핵심 서약이 있고, 관계가 깊어지면서 그 서약을 알아가는 것이 첫 번째 큰 과제, 그 서약의 가장 깊은 경계에 닿는 것이 두 번째 큰 과제가 되며, 각 단계에 관계 보상이 붙는다.

이 구조는 `그냥 대화하다 호감도 상승`보다 강한 progression을 만들 수 있다.

단, **모든 캐릭터의 두 번째 과제를 '서약 파기'로 통일하지 않는다.**

---

## 2. One Core Oath Per Representative

Launch-era 기본형 후보:

> **대리자는 서약 성립 시 하나의 핵심 서약(Core Oath)을 가진다.**

이 서약은 캐릭터의 핵심 canon이며 평상시 대화 중 임의로 바뀌지 않는다.

- 서약은 캐릭터마다 한 문장으로 설명 가능해야 함
- 단순 personality tag가 아니라 대리자성의 핵심 조건
- 사용자가 처음부터 정확한 문구를 알 필요는 없음
- 세부 행동 규칙이나 습관을 모두 별도 '서약'으로 늘리지 않음

이렇게 하면 서약이 무한히 증식하는 문제를 막을 수 있다.

---

## 3. Relationship Progression Grammar

공통 구조는 두 개의 큰 Gate만 둔다.

### Gate A — Oath Reveal / 서약을 알게 됨

사용자는 캐릭터를 먼저 경험한다.

```text
행동 패턴을 봄
→ 반복되는 이상한 원칙을 느낌
→ 왜 저렇게까지 하는지 궁금해짐
→ 과거/사건/신뢰가 쌓임
→ 정확한 핵심 서약을 알게 됨
```

이 단계의 재미는 `정보 수집` 자체보다:

> **지금까지 봐온 행동들이 한 문장으로 다시 이해되는 순간**

에 있다.

### Gate B — Oath Boundary / 서약의 가장 깊은 경계에 닿음

두 번째 Gate는 모든 캐릭터가 서약을 깨는 것이 아니다.

캐릭터별로 서로 다른 resolution을 가진다.

가능한 유형:

- **Break**: 실제로 서약을 어김. 매우 드문 비극/대전환형
- **Exception**: 서약은 유지하지만 사용자에게만 허용되는 예외가 생김
- **Reinterpretation**: 서약의 의미를 더 깊게 이해하며 행동 방식이 변함
- **Entrustment**: 서약의 burden 일부를 사용자에게 맡길 정도로 신뢰함
- **Invocation**: 평소 쓰지 않는 가장 깊은 Gift/manifestation을 사용자를 위해 사용함
- **Witness**: 누구에게도 보여주지 않던 서약의 대가/취약성을 사용자에게 보여줌
- **Reaffirmation**: 사용자와의 관계 때문에 오히려 서약을 더 강하게 지키기로 선택함

즉 공통 진행 문법은 유지하되 결말은 캐릭터마다 달라야 한다.

---

## 4. Why Universal 'Break the Oath' Fails

모든 캐릭터를:

```text
서약을 알아냄
→ 사랑으로 서약을 깨뜨림
```

으로 만들면 다음 문제가 생긴다.

1. 두세 캐릭터만 지나도 관계 전개가 예측됨
2. 사용자가 캐릭터를 '타락시키는 것'이 공통 승리조건처럼 보임
3. 서약의 무게가 오히려 약해짐
4. 캐릭터가 자기 가치관을 지키는 매력이 사라짐
5. 모든 루트가 같은 로맨스 공식을 재도색한 형태가 됨

따라서 `Break`는 가능한 resolution 중 하나일 뿐 기본값이 아니다.

---

## 5. Reward Design

보상은 숫자 호감도보다 **그 캐릭터와만 가능한 관계 변화**가 우선이다.

### Gate A Reward Candidate — Oath Reveal

- 정확한 서약 문구 공개
- 대리자가 된 과거 episode 공개
- 신격/서약 관련 비공개 character profile 일부 unlock
- 사용자를 대하는 특정 말투/호칭 변화
- 캐릭터의 Gift가 처음 제대로 드러나는 scene

### Gate B Reward Candidate — Oath Boundary

- 그 캐릭터만의 결정적 관계 scene
- 평소 허용되지 않던 행동/접근/신뢰 표현
- Gift의 rare manifestation
- 사용자가 특정 burden을 함께 맡는 관계적 권리
- 캐릭터가 먼저 연락하거나 특정 상황에서 사용자를 찾는 return behavior
- 둘만의 기록/약속/장소/호칭 등 persistent relationship marker

보상은 `무료 → 유료` 같은 entitlement와 동일시하지 않는다. 실제 monetization은 별도 track에서 결정한다.

---

## 6. Oath Must Be Discoverable Through Behavior

서약은 profile card에서 처음부터 읽는 lore가 아니다.

좋은 구조:

```text
사용자: "왜 저 사람은 저럴 때마다 꼭 저렇게 하지?"
↓
관계가 쌓임
↓
과거가 드러남
↓
"아, 그게 서약 때문이었구나."
```

즉 `서약을 알아낸다`는 것은 퀴즈 정답을 맞히는 것이 아니라 **한 사람을 이해하는 것**이다.

---

## 7. Baekheon Example

백헌 prototype core oath:

> **내가 내린 결정의 귀결에서 도망치지 않는다.**

### Gate A — Reveal

사용자는 처음에는 백헌이 단순히 책임감이 강한 사람이라고 생각한다.

관계를 쌓으며:

- 책임을 아래에 떠넘기는 사람을 유난히 싫어함
- 중요한 결정 후에는 끝까지 후속 결과를 확인함
- 자신의 피로보다 `내가 결정한 일`을 우선함

을 경험한다.

이후 과거와 함께 정확한 서약을 알게 된다.

보상은 `백헌이라는 사람의 공적 태도가 왜 생겼는지 이해하는 것`과 그의 private history 접근이다.

### Gate B — Do NOT Default to Breaking

백헌이 사용자를 사랑해서 책임을 버리는 것은 그의 매력을 파괴할 가능성이 높다.

백헌에게 더 적합한 후보:

- **Entrustment**: 책임은 자신이 유지하되, 사용자가 일부 부담을 함께 맡도록 처음 허용
- **Witness**: 책임자로서 보여주지 않던 피로/두려움을 사용자에게만 보여줌
- **Invocation**: 평소 함부로 하지 않는 강한 Gift 사용을 사용자를 위해 선택
- **Reaffirmation**: 사용자를 지키기 위해 오히려 더 어려운 책임을 받아들임

즉 백헌의 두 번째 Gate는 `무너뜨리는 것`보다 **그의 책임 안으로 들어갈 만큼 신뢰받는 것**이 더 적합하다.

---

## 8. Character Route Diversity Rule

Launch roster에서 Gate B resolution type을 의도적으로 분산한다.

예시:

```text
캐릭터 A → Exception
캐릭터 B → Reinterpretation
캐릭터 C → Entrustment
캐릭터 D → Invocation
캐릭터 E → Witness
캐릭터 F → Reaffirmation
캐릭터 G → 실제 Break 가능
```

같은 유형이 반복될 수는 있지만 모든 캐릭터의 핵심 보상을 동일 유형으로 만들지 않는다.

---

## 9. Working Decision Candidates

| ID | Candidate | Status |
|---|---|---|
| OREL-01 | 대리자는 하나의 Core Oath를 가진다 | CANDIDATE |
| OREL-02 | Core Oath exact wording은 초기 사용자에게 자동 공개하지 않는다 | CANDIDATE |
| OREL-03 | 첫 큰 관계 Gate는 Oath Reveal이다 | CANDIDATE |
| OREL-04 | 두 번째 큰 Gate는 Oath Boundary이며 literal Break로 통일하지 않는다 | CANDIDATE-FIX |
| OREL-05 | Gate B resolution은 character-specific이어야 한다 | CANDIDATE-FIX |
| OREL-06 | 관계 보상은 숫자보다 character-exclusive behavior/scene/marker를 우선한다 | CANDIDATE |
| OREL-07 | 서약 reveal은 lore exposition이 아니라 기존 행동을 재해석하게 만들어야 한다 | CANDIDATE-FIX |

---

## 10. Validation Question

다음 검증은 9명을 모두 작성하기보다 백헌/여울/도윤처럼 관계 판타지가 다른 3명에게 Gate A와 Gate B를 각각 적용해 본다.

검증 기준:

> **같은 `서약을 알아간다 → 깊은 경계에 닿는다` 문법을 쓰면서도 세 루트가 완전히 다른 관계 경험으로 느껴지는가?**

그렇지 않으면 이 progression grammar 자체를 폐기하거나 축소한다.
