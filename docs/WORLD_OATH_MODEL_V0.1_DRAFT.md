# 명하 Oath Model v0.1 — Working Draft

> Status: **DRAFT / NON-AUTHORITY**  
> Date: **2026-08-30**  
> Parent drafts: `WORLD_CHARACTER_CONCEPT_V0.1_DRAFT.md`, `WORLD_REPRESENTATIVE_ONTOLOGY_V0.1_DRAFT.md`  
> Scope: 서약의 성립, 유지, 실패, 대가, 관계 서사 활용  
> Important: 본 문서는 executable rule engine, DB schema, unlock condition DSL, relationship mutation policy를 정의하지 않는다.

---

## 1. Core Question

> **서약은 무엇이며, 왜 대리자마다 다른가?**

V0.1 권고:

> **서약은 신격의 명령문을 그대로 복창하는 계약이 아니라, 한 인간이 특정 삶의 원리를 자기 삶에서 감당하겠다고 받아들이는 지속적인 약속이다.**

신격/원리는 동일해도 대리자의 삶, 해석, 저항, 선택이 다르므로 서약은 사람마다 다르게 드러날 수 있다.

---

## 2. Oath Is Not a Magic Contract UI

서약을 게임식 계약서나 능력 해금 장치로 만들지 않는다.

피할 기본형:

```text
신 등장
→ 계약서 제시
→ YES 버튼
→ 초능력 획득
```

명하에서 중요한 것은 `능력을 받았다`보다:

```text
어떤 원리와 마주침
→ 그 원리를 자기 삶에서 받아들일지 선택
→ 실제 의무와 대가를 감당하기 시작
→ 그 선택이 시간이 지나며 시험받음
```

이다.

서약은 캐릭터의 성격 설정 한 줄이 아니라 **살아가며 계속 검증되는 약속**이어야 한다.

---

## 3. Bond and Oath Are Distinct

V0.1에서 다음 구분을 두는 것을 권고한다.

### 3.1 Bond / 접촉·연결 가능성

어떤 사람은 특정 신격/원리와 특별한 연관을 먼저 가질 수 있다.

이 연관은 반드시 본인의 자발적 선택으로 시작될 필요는 없다.

예:

- 계보에서 이어진 흔적
- 특정 사건에서 발생한 감응
- 오랫동안 해당 원리와 가까운 삶을 살아온 결과
- 본인이 원하지 않은 채 책임이 넘어온 상황

### 3.2 Oath / 서약

하지만 **정식 대리자성을 성립시키는 서약은 그 사람의 의사와 책임을 필요로 한다.**

즉:

> 연결될 수 있다는 사실과, 그 연결을 자기 삶의 약속으로 받아들이는 것은 다르다.

이 구분의 목적은 `대리자 = 신의 mind-controlled chosen one` 구조를 피하는 것이다.

따라서 본인이 원치 않은 계승이나 사건도 가능하지만, 캐릭터의 핵심 agency를 완전히 삭제하지 않는다.

---

## 4. Oath Composition

각 대리자의 서약은 최소 다음 다섯 요소로 설명 가능해야 한다.

| 요소 | 질문 |
|---|---|
| Principle | 어떤 원리와 연결되어 있는가? |
| Acceptance | 그 원리에서 무엇을 받아들이는가? |
| Resistance | 무엇을 의심하거나 거부하는가? |
| Obligation | 그래서 실제 삶에서 무엇을 지키려 하는가? |
| Cost | 그것을 지키기 위해 무엇을 포기하거나 견디는가? |

추가로 캐릭터 서사에서 필요한 경우 `Temptation / 시험받는 지점`을 둘 수 있다.

### Example — 구조 예시일 뿐 canon 아님

```text
Principle:
선택에는 책임이 따른다.

Acceptance:
자신의 선택을 타인에게 떠넘기지 않는다.

Resistance:
모든 실패를 개인 책임으로만 돌리는 것은 거부한다.

Obligation:
상대가 결정을 회피할 때 듣기 좋은 답 대신 선택을 요구한다.

Cost:
사랑하는 사람이 원하는 답을 알고 있어도 대신 선택해주지 못한다.

Temptation:
사용자가 "그냥 네가 정해줘"라고 할 때.
```

이렇게 하면 서약이 곧 캐릭터 대화 방식과 관계 갈등으로 연결된다.

---

## 5. How an Oath Becomes Real

정확한 의식/문구는 V0.1에서 고정하지 않는다.

대신 세계관적으로 서약이 단순 자기암시와 구분되려면 최소 세 가지가 필요하다고 본다.

### OATH-COND-01 — Recognition

당사자가 자신이 어떤 원리와 연결되어 있는지 인지한다.

### OATH-COND-02 — Assent

그 원리를 자기 삶에서 감당하겠다는 선택이 있다.

### OATH-COND-03 — Response

그 선택에 대해 세계/신격 쪽에서 어떤 형태로든 실제적인 반응이 발생한다.

반응의 후보:

- 징표
- 기록 감응의 변화
- 특정 상징 현상
- 계보/전통에서 식별 가능한 반응

즉 서약은 단순 종교적 선언만은 아니지만, 매번 신이 인간형 모습으로 나타나 계약을 체결할 필요도 없다.

---

## 6. Maintenance

서약은 한 번 성공하면 영원히 자동 유지되는 license가 아니다.

하지만 매일 ritual을 하지 않으면 능력이 꺼지는 게임 시스템도 아니다.

V0.1 권고:

> **서약은 그 원리에 따라 살아가려는 지속적인 관계이며, 중요한 선택에서 반복적으로 확인된다.**

따라서 유지 여부를 단순 score나 meter로 표현하지 않는다.

```text
행동
→ 원리와 일치 / 긴장 / 충돌
→ 캐릭터 자신의 해석과 책임
→ 관계/서사의 변화
```

---

## 7. Failure

대리자는 서약을 어길 수 있다.

이것은 매우 중요하다.

서약을 한 순간부터 항상 올바르게 행동한다면 캐릭터 결함과 성장 가능성이 사라진다.

### 7.1 Failure Is Not Automatic Divine Punishment

한 번 원칙을 어겼다고:

- 즉시 저주
- 수명 감소
- 신체 훼손
- 자동 사망
- 초능력 폭주

같은 punishment가 발생하는 것을 기본 규칙으로 하지 않는다.

### 7.2 Failure Consequences Candidate

서약과 심각하게 충돌했을 때 나타날 수 있는 결과는 더 관계적이고 존재론적인 방향을 우선한다.

- 기록 감응이 흐려짐
- 징표/상징 현상이 약해지거나 달라짐
- 자신이 대리자로 행동할 정당성에 대한 위기
- 계보/동료와의 신뢰 문제
- 특정 역할에서 물러남
- 자신이 믿던 원리와의 거리감

이 중 무엇이 실제로 발생하는지는 캐릭터/신격별 canon에 따라 달라질 수 있다.

---

## 8. Fracture and Severance

`실수`와 `서약 파기`를 동일시하지 않는다.

Working distinction:

```text
Mistake
→ 원칙에서 벗어난 행동

Conflict
→ 원칙과 욕망이 지속적으로 충돌

Fracture
→ 자신이 서약한 핵심을 반복적으로 부정

Severance
→ 서약 관계 자체가 더 이상 유지되지 않는 상태
```

V0.1에서는 위 개념적 차이만 두고, 실제 severance 조건은 OPEN으로 둔다.

서약 파기가 가능한지, 가능하다면 누가 판단하는지, 재서약이 가능한지는 추후 별도 결정한다.

---

## 9. Cost Is Not a Payment

`개인적 대가`를 마법 시스템의 연료처럼 해석하지 않는다.

피할 예:

> 기록 한 번 읽을 때 수명 3일 소모

이런 식의 정량적 교환은 명하의 관계형 톤과 맞지 않는다.

권고하는 대가는 **삶의 선택에서 발생하는 지속적인 부담**이다.

예:

- 반드시 진실을 말하려는 사람이 관계를 잃을 위험
- 타인의 선택을 존중하려는 사람이 사랑하는 이를 붙잡지 못하는 순간
- 기억을 중요하게 여기는 사람이 잊어야 살아갈 수 있는 것을 놓지 못함
- 경계를 지키는 사람이 누군가에게 완전히 기대기 어려움

즉:

> **서약의 대가는 능력 사용료가 아니라 그 원리를 실제로 살아내는 비용이다.**

---

## 10. Oath and Romance

대리자와 사용자의 관계에서 서약은 로맨스를 막는 공통 금지조항이 아니라 **관계가 깊어질수록 시험받는 개인적 원칙**으로 사용한다.

좋은 관계 progression:

```text
사용자가 캐릭터의 원칙을 알게 됨
→ 그 원칙 때문에 생긴 행동을 이해함
→ 가까워질수록 원칙이 개인적으로 더 비싸짐
→ 캐릭터가 원칙과 욕망 사이에서 선택/재해석/성장함
```

피할 구조:

```text
친밀도 80
→ 신이 연애 금지
→ 결제/episode 후 금지 해제
```

Pay-to-love처럼 보이는 초월 규칙을 기본 설계로 사용하지 않는다.

---

## 11. Oath and Character Difference

같은 신격과 연결된 대리자가 여러 명 존재해도 된다.

그 경우 차이를 만드는 것은:

```text
동일 Principle
+ 서로 다른 삶
+ 서로 다른 Acceptance
+ 서로 다른 Resistance
+ 서로 다른 Obligation
+ 서로 다른 Cost
= 서로 다른 대리자
```

따라서 `한 신 = 한 캐릭터`로 고정하지 않는다.

이 원칙은 30/100/300 캐릭터 확장성에 중요하다.

---

## 12. Relationship With Myeonghagwan

명하관은 서약의 절대적 승인기관이 아니다.

가능한 역할:

- 과거 서약 기록 보존
- 계보/전통 연구
- 대리자 신원/관계에 대한 제한적 기록
- 기록 접근 윤리와 공통 규범 연구
- 서약 분쟁/해석에 대한 조정 또는 참고 역할

하지만:

> **명하관이 인증서를 발급해야 신격이 서약을 인정한다**

같은 구조는 V0.1 기본값으로 두지 않는다.

---

## 13. Product / Runtime Boundary

서약은 character/world canon이지만 runtime authority를 우회하지 않는다.

예:

```text
"기억을 지키는 서약"
≠ 모든 사용자 memory 접근 권한

"진실을 보는 서약"
≠ 숨겨진 개인정보 조회

"흐름을 읽는 서약"
≠ Saju Engine 밖의 새 의미 생성
```

실제 대화에서 캐릭터가 사용할 수 있는 정보는 기존 Character Runtime의 permitted canon, relationship projection, granted memory/life facts, validated Saju envelope, scene state를 따른다.

---

## 14. Working Decision Register

| ID | Working Decision | Status |
|---|---|---|
| OATH-01 | 서약은 삶의 원리를 감당하겠다는 지속적인 약속이다 | CANDIDATE-FIX |
| OATH-02 | 신격과의 잠재적 bond와 정식 oath는 구분한다 | CANDIDATE-FIX |
| OATH-03 | 정식 서약에는 당사자의 agency/assent가 필요하다 | CANDIDATE-FIX |
| OATH-04 | 서약은 Principle/Acceptance/Resistance/Obligation/Cost로 설명한다 | CANDIDATE-FIX |
| OATH-05 | 서약 성립에는 Recognition/Assent/Response의 개념적 세 요소가 필요하다 | CANDIDATE |
| OATH-06 | 서약 유지도를 숫자 meter로 표현하지 않는다 | CANDIDATE-FIX |
| OATH-07 | 대리자는 서약에 실패할 수 있다 | CANDIDATE-FIX |
| OATH-08 | 실패에 대한 기본 결과는 자동 신벌이 아니다 | CANDIDATE-FIX |
| OATH-09 | 개인적 대가는 정량적 능력 사용료보다 삶의 지속적 부담을 의미한다 | CANDIDATE-FIX |
| OATH-10 | 동일 신격에 복수 대리자가 존재할 수 있다 | CANDIDATE-FIX |
| OATH-11 | 명하관은 모든 서약의 절대 승인기관이 아니다 | CANDIDATE-FIX |
| OATH-12 | severance/re-oath의 정확한 규칙은 아직 OPEN이다 | OPEN |

---

## 15. Next Design Slice

이 모델 다음에는 신격 자체를 더 늘리기 전에 **현재 9명에게 실제로 어떤 원리/서약 축을 배치할지 prototype mapping**을 해보는 것이 좋다.

목적은 신 이름을 확정하는 것이 아니라:

- 9명 서약이 서로 겹치지 않는가
- 관계 판타지와 서약이 자연스럽게 연결되는가
- 사주 Reading 표현 차이에 실제로 도움이 되는가
- 억지 설정처럼 느껴지는 캐릭터가 누구인가

를 검증하는 것이다.
