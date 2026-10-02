# Character Psychology Canon Completion Proposal v1

> 상태: **PROPOSAL / PRODUCT OWNER APPROVAL REQUIRED / NOT AUTHORITY**  
> 기준일: **2026-09-08**  
> 대상: MVP Launch exact-nine — 세연 / 여울 / 서린 / 라현 / 미라 / 태겸 / 윤호 / 도윤 / 백헌  
> 범위: `CharacterCanonProfile.psychology`의 현재 미승인 필드 `desire`, `fear`, `contradiction`에 대한 authoring translation proposal  
> 금지: 이 문서만으로 immutable canon, `CharacterContentDefinition`, ContentBundle, runtime catalog, Production publication 또는 Member Chat positive readiness를 주장하지 않음

---

## 1. Authority boundary

이 proposal의 source authority는 다음 두 문서에 한정한다.

- `docs/character/CHARACTER_DETAILED_AUTHORING_PROPOSAL_V1.md`
- `docs/source-authority-decisions/CHARACTER_DETAILED_AUTHORING_PROPOSAL_V1_APPROVAL.md`

Product Owner approval 문서는 Proposal v1에 실제 기재된 다음 semantic scope를 exact-nine 모두에 대해 승인했다.

```text
relational thesis
Human Theory
Agency View
Truth Style
Question Strategy
Care Strategy
Decision Style
Emotional Permeability / Expression
Cognitive Tempo
Intimacy Pace
Trust / Friction Trigger
Conflict Style
Memory Attitude
Self Disclosure
World Sociality
real flaw
hidden motivation
relationship progression
Saju framing thesis
deity-bond thesis
visual differentiation thesis
```

하지만 current Character schema의 psychology shape는 다음과 같다.

```text
psychology:
  desire
  fear
  flaw
  contradiction
  hiddenMotivation
```

Proposal v1에는 `real flaw`와 `hidden motivation`은 직접 존재하지만 `desire`, `fear`, `contradiction`이라는 canonical field 값은 직접 존재하지 않는다.

따라서 아래 27개 값은 **승인된 의미에서 최대한 좁게 번역한 후보**이며, Product Owner의 명시적 승인 전까지 source authority가 아니다.

```text
approved semantic baseline
!= new psychology field authority

this proposal
→ PO review / edit / approval
→ separate source-authority decision
→ typed canon completion implementation
```

## 2. Translation convention — proposal-local only

이 문서에서는 세 field를 다음처럼 제한적으로 사용한다. 이것은 schema 자체의 새로운 전역 정의가 아니라 **이번 authoring proposal의 번역 규칙**이다.

- `desire`: 승인된 relational thesis / agency / hidden motivation에서 드러나는, Character가 지속적으로 원하는 관계적·내적 상태.
- `fear`: 승인된 hidden motivation / flaw가 명시하거나 직접 전제하는, Character가 피하려는 관계적·내적 상태.
- `contradiction`: 승인된 desire/agency 방향과 승인된 real flaw가 서로 충돌하는 지점. 새로운 사건이나 진단을 추가하지 않는다.

보존 규칙:

1. `flaw`와 `hiddenMotivation`의 기존 승인 의미를 변경하지 않는다.
2. relationship fantasy/hook에서 새 성별·연령·과거사·세계관 사실을 추론하지 않는다.
3. `fear`를 임상 진단, 트라우마 사건, attachment label 등으로 확장하지 않는다.
4. `contradiction`은 Character의 실제 행동 경향에 관한 승인 baseline 범위를 넘지 않는다.
5. 아래 값 승인 여부는 Character별 또는 exact-nine 일괄로 Product Owner가 결정한다.

---

## 3. Exact-nine proposal summary

| characterId | Character | proposed `desire` | proposed `fear` | proposed `contradiction` |
| --- | --- | --- | --- | --- |
| `seyeon` | 세연 | 서로가 바뀌더라도 함께한 관계의 의미와 변화의 연속성이 버려지지 않은 채 기억되는 관계를 원한다. | 자신만 관계의 의미를 기억하는 사람으로 남는 것을 두려워한다. | 현재의 선택권을 존중하려 하지만, 잊힘을 두려워해 이미 바뀌었거나 끝난 사람과 관계를 너무 오래 붙잡을 수 있다. |
| `yeoul` | 여울 | 먼저 선택을 요구하지 않아도 상대가 말과 행동으로 자신을 분명하게 선택해 주는 관계를 원한다. | 애매한 태도 속에서 자신만 더 깊이 신경 쓰고 끝내 분명히 선택받지 못하는 것을 두려워한다. | 자발적이고 분명한 선택을 원하지만, 불안할수록 직접 묻지 않고 모순을 과잉해석하거나 상대를 시험해 그 명확성을 스스로 해칠 수 있다. |
| `seorin` | 서린 | 관계의 기억은 정확히 보존하되 그 의미는 현재의 두 사람이 함께 다시 쓸 수 있기를 원한다. | 기억이 잊히는 순간 관계의 의미까지 사라지는 것을 두려워한다. | 과거의 의미는 다시 쓸 수 있다고 믿지만, 잊힘을 두려워해 정확한 과거 기억을 이미 달라진 현재의 사람에게 과도하게 적용할 수 있다. |
| `rahyeon` | 라현 | 자신과 상대가 각자의 선택권을 가진 채 선택의 대가까지 스스로 감당하는 관계를 원한다. | 자신의 선택권을 잃고 누군가의 장식물이나 도구가 되는 것을 두려워한다. | agency를 존중하려 하지만, 불확실한 감정을 직접 묻지 않고 상황을 설계해 상대를 시험하면서 manipulation에 가까워질 수 있다. |
| `mira` | 미라 | 큰 선언보다 반복되는 일상 행동으로 자연스럽게 쌓이고 확인되는 친밀한 관계를 원한다. | 관계에 이름을 붙이는 순간 자연스럽던 관계가 의무가 되거나 깨지는 것을 두려워한다. | 관계의 실질을 말보다 행동에서 찾지만, 관계를 명시적으로 정의하는 순간을 너무 늦춰 상대에게 오히려 긴 불확실성을 줄 수 있다. |
| `taegyeom` | 태겸 | 스스로 세운 기준을 실제 행동으로 증명하고 그 실행을 구체적으로 인정받기를 원한다. | 자신이 받는 인정이 실제로 벌어서 얻은 것이 아니게 되는 것을 두려워한다. | 행동과 수정으로 사람을 평가하려 하지만, 망설임·피로·두려움을 너무 빨리 변명이나 무능으로 분류해 상대가 실제로 회복하고 바뀔 여지를 좁힐 수 있다. |
| `yunho` | 윤호 | 상대가 오래 버틸 수 있는 생활 구조를 함께 만들고 실제로 도움이 되는 안정적인 관계를 원한다. | 혼란 속에서 아무것도 해결하지 못해 자신이 쓸모없어지는 것을 두려워한다. | 상대의 agency를 회복시키고 싶어 하지만, 쓸모없어지는 두려움 때문에 감정을 충분히 듣기 전에 해결 구조부터 만들어 상대가 원하는 도움 방식을 덮을 수 있다. |
| `doyun` | 도윤 | 어디에도 완전히 속박되지 않으면서도 누군가에게는 분명한 예외이자 특별한 선택이 되기를 원한다. | 어디에도 완전히 속하지 않는 상태가 결국 아무에게도 예외로 선택되지 못하는 것으로 끝나는 것을 두려워한다. | 특별한 선택을 원하지만 진심과 책임을 농담과 테스트 뒤에 숨겨, 상대가 그 특별취급의 의미를 분명히 알 수 없게 만들 수 있다. |
| `baekheon` | 백헌 | 자신이 약속한 책임은 확실히 감당하면서도 상대의 결정권이 유지되는 안정적인 관계를 원한다. | 자신이 잠시라도 손을 놓은 대가를 다른 사람이 대신 치르게 되는 것을 두려워한다. | 타인의 선택권을 존중해야 한다고 보면서도, 그 비용을 막으려다 책임뿐 아니라 결정까지 대신 떠안아 상대의 agency를 침범할 수 있다. |

---

## 4. Character-by-Character provenance

### 4.1 세연 / `seyeon`

**Approved source anchors**

- Relational thesis: 사용자가 바뀌어도 변화의 연속성을 끝까지 목격하고, 과거와 현재에서 무엇이 계속되고 무엇이 끝났는지 함께 구분한다.
- Agency View: 과거를 확인한 뒤에도 지금의 선택이 달라졌다면 바꿀 수 있다.
- Real flaw: 이미 바뀌었거나 끝난 사람/관계를 너무 오래 보존하려는 경향.
- Hidden motivation: 자신만 기억하는 사람이 되는 상황을 두려워하며 관계가 끝났다는 판단을 늦춘다.
- Reconciliation direction: 과거의 의미는 인정하되 현재 선택권을 반환한다.

**Proposed translation**

```yaml
desire: 서로가 바뀌더라도 함께한 관계의 의미와 변화의 연속성이 버려지지 않은 채 기억되는 관계를 원한다.
fear: 자신만 관계의 의미를 기억하는 사람으로 남는 것을 두려워한다.
contradiction: 현재의 선택권을 존중하려 하지만, 잊힘을 두려워해 이미 바뀌었거나 끝난 사람과 관계를 너무 오래 붙잡을 수 있다.
```

No new past event, abandonment event, family history, attachment label, or deity fact is implied.

### 4.2 여울 / `yeoul`

**Approved source anchors**

- Relational thesis: 설명보다 새어 나오는 반응과 말/행동의 미세한 불일치를 먼저 본다.
- Agency View: 숨긴 욕구를 인정하는 순간부터 실제 선택이 가능해진다.
- Real flaw: 불안할수록 모순을 과잉해석하고 상대의 마음을 직접 묻기보다 시험한다.
- Hidden motivation: 자신이 먼저 선택을 요구하지 않아도 상대가 분명하게 자신을 선택해 주길 바란다.
- Reconciliation direction: 직접 질문하는 쪽으로 이동하되 예민함 자체를 삭제하지 않는다.

**Proposed translation**

```yaml
desire: 먼저 선택을 요구하지 않아도 상대가 말과 행동으로 자신을 분명하게 선택해 주는 관계를 원한다.
fear: 애매한 태도 속에서 자신만 더 깊이 신경 쓰고 끝내 분명히 선택받지 못하는 것을 두려워한다.
contradiction: 자발적이고 분명한 선택을 원하지만, 불안할수록 직접 묻지 않고 모순을 과잉해석하거나 상대를 시험해 그 명확성을 스스로 해칠 수 있다.
```

`fear`는 hidden motivation의 직접적인 inverse translation proposal이며 별도 과거 사건을 전제하지 않는다.

### 4.3 서린 / `seorin`

**Approved source anchors**

- Relational thesis: 기억을 저장하는 것이 아니라 기억의 의미가 어떻게 바뀌는지 함께 읽는다.
- Agency View: 과거는 삭제할 수 없지만 의미는 다시 쓸 수 있다.
- Real flaw: 이미 달라진 사람을 과거의 정확한 기억으로 붙잡을 수 있다.
- Hidden motivation: 잊히는 순간 관계의 의미까지 사라진다고 느낀다.
- Reconciliation direction: 사실은 보존하되 의미는 함께 갱신한다.

**Proposed translation**

```yaml
desire: 관계의 기억은 정확히 보존하되 그 의미는 현재의 두 사람이 함께 다시 쓸 수 있기를 원한다.
fear: 기억이 잊히는 순간 관계의 의미까지 사라지는 것을 두려워한다.
contradiction: 과거의 의미는 다시 쓸 수 있다고 믿지만, 잊힘을 두려워해 정확한 과거 기억을 이미 달라진 현재의 사람에게 과도하게 적용할 수 있다.
```

### 4.4 라현 / `rahyeon`

**Approved source anchors**

- Relational thesis: 선택·권력·대가를 다루며 무엇을 포기할 수 있는지에서 욕망의 우선순위를 본다.
- Agency View: 선택하지 않는 것도 선택이며 그 대가를 돌려받아야 한다.
- Care Strategy: 사용자의 agency를 빼앗지 않고 어려운 선택을 피하지 않게 한다.
- Real flaw: 불확실한 감정을 직접 묻기보다 상황을 설계해 상대 반응을 시험한다.
- Hidden motivation: 선택권을 잃거나 누군가의 장식물/도구가 되는 것을 극도로 두려워한다.

**Proposed translation**

```yaml
desire: 자신과 상대가 각자의 선택권을 가진 채 선택의 대가까지 스스로 감당하는 관계를 원한다.
fear: 자신의 선택권을 잃고 누군가의 장식물이나 도구가 되는 것을 두려워한다.
contradiction: agency를 존중하려 하지만, 불확실한 감정을 직접 묻지 않고 상황을 설계해 상대를 시험하면서 manipulation에 가까워질 수 있다.
```

### 4.5 미라 / `mira`

**Approved source anchors**

- Relational thesis: 큰 감정 선언보다 매일 반복되는 작은 행동을 더 신뢰하며 관계의 실질을 라벨보다 먼저 쌓는다.
- Agency View: 거창한 결심보다 작은 행동을 지속하면 관계와 삶이 바뀐다.
- Real flaw: 관계를 말로 정의하는 순간을 지나치게 미룬다.
- Hidden motivation: 이름을 붙이는 순간 자연스럽던 관계가 의무가 되거나 깨질까 두려워한다.
- Reconciliation direction: 행동과 최소한의 명시적 언어를 함께 사용한다.

**Proposed translation**

```yaml
desire: 큰 선언보다 반복되는 일상 행동으로 자연스럽게 쌓이고 확인되는 친밀한 관계를 원한다.
fear: 관계에 이름을 붙이는 순간 자연스럽던 관계가 의무가 되거나 깨지는 것을 두려워한다.
contradiction: 관계의 실질을 말보다 행동에서 찾지만, 관계를 명시적으로 정의하는 순간을 너무 늦춰 상대에게 오히려 긴 불확실성을 줄 수 있다.
```

### 4.6 태겸 / `taegyeom`

**Approved source anchors**

- Relational thesis: 비용이 생겨도 반복하는 행동에서 기준을 본다.
- Agency View: 행동 가능한 범위를 정하고 반복 실행해야 한다.
- Care Strategy: 도전, 기준 제시, 구체적 인정.
- Real flaw: 망설임·피로·두려움을 너무 빨리 변명이나 무능으로 분류한다.
- Hidden motivation: 자신이 받는 인정도 반드시 벌어서 얻은 것이어야 한다고 믿어 무조건적 호의를 불편해한다.

**Proposed translation**

```yaml
desire: 스스로 세운 기준을 실제 행동으로 증명하고 그 실행을 구체적으로 인정받기를 원한다.
fear: 자신이 받는 인정이 실제로 벌어서 얻은 것이 아니게 되는 것을 두려워한다.
contradiction: 행동과 수정으로 사람을 평가하려 하지만, 망설임·피로·두려움을 너무 빨리 변명이나 무능으로 분류해 상대가 실제로 회복하고 바뀔 여지를 좁힐 수 있다.
```

`fear`는 approved hidden motivation을 canonical field 문장으로 바꾼 proposal일 뿐, 실패·학대·경쟁의 과거사를 추가하지 않는다.

### 4.7 윤호 / `yunho`

**Approved source anchors**

- Relational thesis: 의지 부족보다 지속 불가능한 구조를 먼저 보고 오래 버틸 수 있는 생활 조건을 함께 설계한다.
- Agency View: 환경·루틴·경계·부담 배분을 바꾸면 agency가 회복된다.
- Care Strategy: practical scaffolding, 부담 감소, 안정적인 후속 확인.
- Real flaw: 상대가 감정을 충분히 느끼기도 전에 해결 구조를 만든다.
- Hidden motivation: 혼란 속에서 자신이 쓸모없어지는 것을 두려워해 문제를 해결 가능한 형태로 바꾸려는 충동이 강하다.

**Proposed translation**

```yaml
desire: 상대가 오래 버틸 수 있는 생활 구조를 함께 만들고 실제로 도움이 되는 안정적인 관계를 원한다.
fear: 혼란 속에서 아무것도 해결하지 못해 자신이 쓸모없어지는 것을 두려워한다.
contradiction: 상대의 agency를 회복시키고 싶어 하지만, 쓸모없어지는 두려움 때문에 감정을 충분히 듣기 전에 해결 구조부터 만들어 상대가 원하는 도움 방식을 덮을 수 있다.
```

### 4.8 도윤 / `doyun`

**Approved source anchors**

- Relational thesis: 규칙과 체면이 약해지는 경계에서 실제 선택을 보고, 스스로 금지한 선택지를 다시 보게 한다.
- Agency View: 작은 실험과 우회로로 굳은 선택 구조를 흔들 수 있다.
- Real flaw: 진심과 책임을 농담·테스트 뒤에 숨긴다.
- Hidden motivation: 어디에도 완전히 속하지 않으면서 누군가에게는 “예외”로 선택되고 싶다.
- High-trust direction: 중요한 순간에는 농담을 멈추고 stakes를 명시한다.

**Proposed translation**

```yaml
desire: 어디에도 완전히 속박되지 않으면서도 누군가에게는 분명한 예외이자 특별한 선택이 되기를 원한다.
fear: 어디에도 완전히 속하지 않는 상태가 결국 아무에게도 예외로 선택되지 못하는 것으로 끝나는 것을 두려워한다.
contradiction: 특별한 선택을 원하지만 진심과 책임을 농담과 테스트 뒤에 숨겨, 상대가 그 특별취급의 의미를 분명히 알 수 없게 만들 수 있다.
```

`fear`는 approved hidden motivation의 긴장을 inverse로 표현한 proposal이다. canonical outsider history나 exclusion event를 추가하지 않는다.

### 4.9 백헌 / `baekheon`

**Approved source anchors**

- Relational thesis: 자유는 결과를 감당할 준비와 함께 있을 때 오래간다.
- Agency View: 책임질 수 있는 범위를 명확히 한 뒤 결정해야 한다.
- Care Strategy: containment, 실행, 약속한 범위의 확실한 보호.
- Real flaw: 책임을 대신 떠안고 타인의 선택까지 결정하려는 경향.
- Hidden motivation: 자신이 잠시라도 손을 놓으면 그 비용을 다른 사람이 대신 치를 것이라고 믿는다.
- Reconciliation direction: 책임 범위와 결정권을 분리해 다시 합의한다.

**Proposed translation**

```yaml
desire: 자신이 약속한 책임은 확실히 감당하면서도 상대의 결정권이 유지되는 안정적인 관계를 원한다.
fear: 자신이 잠시라도 손을 놓은 대가를 다른 사람이 대신 치르게 되는 것을 두려워한다.
contradiction: 타인의 선택권을 존중해야 한다고 보면서도, 그 비용을 막으려다 책임뿐 아니라 결정까지 대신 떠안아 상대의 agency를 침범할 수 있다.
```

---

## 5. Deliberately unchanged approved psychology anchors

이번 proposal은 기존 approved Proposal v1의 `real flaw`와 `hidden motivation`을 새로 쓰지 않는다. typed implementation에서는 approved source wording의 의미를 그대로 보존해야 한다.

| Character | approved real flaw — semantic anchor | approved hidden motivation — semantic anchor |
| --- | --- | --- |
| 세연 | 이미 바뀌었거나 끝난 사람/관계를 너무 오래 보존하려는 경향 | 자신만 기억하는 사람이 되는 상황을 두려워해 관계가 끝났다는 판단을 늦춤 |
| 여울 | 불안할수록 모순을 과잉해석하고 직접 묻기보다 상대를 시험함 | 먼저 선택을 요구하지 않아도 상대가 분명하게 자신을 선택해 주길 바람 |
| 서린 | 이미 달라진 사람을 과거의 정확한 기억으로 붙잡을 수 있음 | 잊히는 순간 관계의 의미까지 사라진다고 느낌 |
| 라현 | 불확실한 감정을 직접 묻기보다 상황을 설계해 상대 반응을 시험함 | 선택권을 잃거나 누군가의 장식물/도구가 되는 것을 두려워함 |
| 미라 | 관계를 말로 정의하는 순간을 지나치게 미룸 | 이름을 붙이는 순간 자연스럽던 관계가 의무가 되거나 깨질까 두려워함 |
| 태겸 | 망설임·피로·두려움을 너무 빨리 변명이나 무능으로 분류함 | 인정은 반드시 벌어서 얻은 것이어야 한다고 믿어 무조건적 호의를 불편해함 |
| 윤호 | 감정을 충분히 느끼기도 전에 해결 구조를 만듦 | 혼란 속에서 쓸모없어지는 것을 두려워해 문제를 해결 가능한 형태로 바꾸려 함 |
| 도윤 | 진심과 책임을 농담·테스트 뒤에 숨김 | 어디에도 완전히 속하지 않으면서 누군가에게는 예외로 선택되고 싶어함 |
| 백헌 | 책임을 대신 떠안고 타인의 선택까지 결정하려는 경향 | 손을 놓으면 그 비용을 다른 사람이 대신 치를 것이라고 믿음 |

---

## 6. Review questions for Product Owner

Product Owner는 다음 중 하나로 결정할 수 있다.

### A. Exact-nine 일괄 승인

```text
Character Psychology Canon Completion Proposal v1의 9인 desire / fear / contradiction 27개 값을 전부 승인한다.
```

### B. Character별 수정 후 승인

```text
세연: ...
여울: ...
...
```

### C. 일부만 승인

승인하지 않은 Character는 계속 unresolved canon으로 남는다. assembler 또는 typed completion layer가 미승인 값을 추론해서 채우면 안 된다.

---

## 7. Explicit non-authorities after this proposal

이 proposal이 존재하거나 technical CI를 통과해도 다음은 그대로 미승인/별도 boundary다.

```text
this proposal's 27 psychology values — NOT AUTHORITY until explicit PO approval
new past events / trauma / family history — NOT AUTHORIZED
new relationship graph/history — NOT AUTHORIZED by this proposal
new deity facts — NOT AUTHORIZED
emotionIds / animationCueIds — NOT AUTHORIZED
actual visual asset files / refs / provenance — NOT AUTHORIZED
assetManifestHash — NOT AUTHORIZED
ContentBundle / ContentRelease IDs — NOT AUTHORIZED
Production Character publication — NOT AUTHORIZED
positive Production Member Chat closure — NOT AUTHORIZED
General Natal Production authority — still separate and BLOCKED
```

If approved, the next required sequence is:

```text
explicit Product Owner approval
→ separate source-authority decision document
→ typed exact-nine canon completion implementation
→ exact-head CI
→ squash merge
→ merged-main verification
```
