# 명하 World / Character Concept v0.1 — Working Draft

> Status: **DRAFT / NON-AUTHORITY**  
> Date: **2026-08-30**  
> Scope: 세계관, 대리자, 기록, 명하관, 캐릭터 관계 경험의 개념 정리  
> Purpose: 구현 전에 제품/서사 개념을 누적 검토하기 위한 working document  
> Important: 본 문서는 `CHARACTER_WORLD_CONTENT_SPEC.md`, `AI_CHARACTER_RUNTIME_SPEC.md`, source-gap 문서, DB authority를 대체하지 않는다. 실행 schema, unlock evaluator, relationship mutation policy, DB migration을 새로 확정하지 않는다.

---

## 1. Product Identity Working Statement

명하는 단순 사주 사이트도, 단순 AI character chat도 아니다.

현재 working identity:

> **사주를 입구이자 지속적인 해석 기반으로 삼고, 각자의 서약을 가진 대리자들과 장기적인 관계를 맺으며, 태어난 기록과 살아가며 생긴 기록을 함께 읽어가는 캐릭터 기반 관계형 서비스.**

핵심 감각:

> **태어난 순간부터 존재한 기록을 함께 읽고, 살아가며 생긴 이야기를 계속 쌓아간다.**

Product principle candidate:

> **캐릭터와의 관계는 자유롭게, 그 관계가 존재하는 현실은 하나로.**

세계관은 사용자가 항상 따라야 하는 시나리오가 아니라, 모든 관계가 같은 현실에서 계속 이어진다는 것을 보장하는 기반이어야 한다.

---

## 2. World Design Boundary

### 2.1 지금 만들려는 것

- 캐릭터가 한 세계에 존재한다고 느껴지는 최소 공통 현실
- 사주/기록이 캐릭터 관계와 자연스럽게 연결되는 세계 규칙
- 신규 캐릭터를 수십~수백 명까지 추가해도 retcon이 폭발하지 않는 구조
- 캐릭터가 명하관 NPC나 사주 상담 NPC로 축소되지 않는 생활 가능성

### 2.2 지금 만들지 않는 것

- 전체 국가/대륙 지도
- 명하관 설립연도와 역대 관장
- 신들의 완전한 족보
- 세계 전쟁사
- 모든 계보/기관 이름
- 모든 캐릭터 쌍의 관계
- 대리자의 전체 분류 체계
- unlock DSL / evaluator
- season/operator reveal execution policy

설정은 실제 사용자 경험, 캐릭터 차별성, encounter, 관계 연속성에 기여할 때만 확정한다.

---

## 3. World Ontology V0.1

명하의 세계는 현대적 일상생활이 가능한 하나의 현실이다.

사람들은 공부하고, 일하고, 먹고, 연애하고, 가족과 살며, 이동하고, 각자의 생활권을 가진다. 명하관은 이 세계 전체가 아니며, 모든 주요 인물이 그곳에 거주하거나 근무하지 않는다.

이 세계에는 인간의 삶과 관련된 **기록**과 그것을 읽고 다루는 오래된 전통이 실제로 존재한다.

핵심 구분:

```text
태어난 기록
+ 살아가며 생긴 기록
+ 현재의 선택
→ 지금 읽을 수 있는 삶의 맥락
```

기록은 미래를 확정하는 시나리오가 아니다.

---

## 4. Records

### 4.1 선천 기록

사람이 태어난 순간 형성되는 구조적 기록.

명하 세계에서 사주/명식은 이를 체계적으로 읽는 주요 방법 중 하나다.

선천 기록은 다음을 의미하지 않는다.

- 미래 사건의 확정 목록
- 인간의 자유의지 제거
- 모든 현재 정보의 자동 획득

### 4.2 후천 기록

사람이 실제로 살아가며 남긴 관계, 선택, 사건, 기억, 실패, 성취의 기록.

출생정보만으로는 알 수 없다.

현재 직업, 최근 이별, 어제의 사건, 사용자의 후회 같은 정보는 사용자가 말하거나 적절한 기록 authority를 통해 제공되지 않으면 캐릭터가 자동으로 알 수 없다.

### 4.3 기록을 맡긴다는 것

Working fiction candidate:

> 삶에 일어난 모든 사실이 명하관에 자동 수집되는 것은 아니다. 삶은 흔적을 남기지만, 타인이 읽을 수 있는 형태로 기록을 맡기는 것은 별도의 행위다.

따라서 제품의 `기억해줘`, Life Record, approved memory는 세계관적으로도 의미를 가질 수 있다.

> **이 이야기를 이 관계 안에 남겨도 좋다.**

단, 실제 memory persistence와 access authority는 기존 runtime/privacy authority를 따른다.

---

## 5. Three Candidate Laws of the World

### W-LAW-01 — 기록은 명령하지 않는다

기록은 구조, 가능성, 흐름, 반복되는 패턴을 읽는 기반이지 인간에게 특정 삶을 강제하는 명령이 아니다.

### W-LAW-02 — 읽는다고 소유하는 것은 아니다

누군가의 기록에 접근할 수 있다는 사실은 그 사람의 삶을 소유하거나 모든 개인정보를 알 권리를 뜻하지 않는다.

### W-LAW-03 — 같은 기록도 다른 질문을 낳는다

Protected Saju semantics는 동일하게 유지되더라도, 무엇을 먼저 묻고 무엇을 강조하며 어디까지 개입하는지는 대리자의 서약, 가치관, 관계에 따라 달라질 수 있다.

Working phrase:

> **같은 기록, 다른 서약.**

---

## 6. Divine Principle / Deity Concept

### 6.1 Working Definition

신격은 인간 개인의 삶을 직접 관리하는 상담자나 관리자라기보다, 세계에 오래 존재해 온 어떤 **삶의 원리**가 이름과 형상을 얻은 존재에 가깝다.

현재는 신격을 `연애의 신`, `돈의 신`, `직업의 신`처럼 서비스 메뉴와 1:1 대응시키지 않는다.

보다 근원적인 원리 예시는 다음과 같은 축에서 탐색한다.

- 변화와 지속
- 선택과 책임
- 경계
- 관계와 단절
- 기억과 망각
- 드러냄과 감춤
- 질서와 일탈

위 예시는 vocabulary candidate일 뿐, 확정 deity registry가 아니다.

### 6.2 Ontological Ambiguity

신격이 실제로 인간과 같은 인격을 가진 초월자인지, 오래된 원리와 서약 전통이 특정한 형태로 실재화한 것인지 V0.1에서 완전히 해명하지 않는다.

다만 단순한 은유만은 아니다.

- 오래된 기록과 이름이 존재할 수 있음
- 서약의 전통이 존재할 수 있음
- 대리자에게 실질적인 변화/징표/감응이 발생할 수 있음

초월성은 인정하되 완전한 형이상학 설명은 열어둔다.

### 6.3 신격이 하지 않는 것

- 사용자의 현실 개인정보를 자동으로 알려주지 않음
- 사주 엔진을 우회하여 새로운 semantic truth를 만들지 않음
- 개인에게 매번 정답을 직접 전달하지 않음
- 캐릭터의 감정과 선택을 원격조종하지 않음

Working principle:

> **신격은 원리를 제공하지만, 인간을 이해하는 것은 대리자의 몫이다.**

---

## 7. Representatives / 대리자

### 7.1 Working Definition

대리자는 신 그 자체도, 신의 성격 복제품도, 신의 말을 전달하는 스피커도 아니다.

> **대리자는 특정 원리와 서약을 맺고 살아가는 독립적인 인격이다.**

대리자는 자기 경험, 가치관, 결함, 욕망, 인간관계, 생활을 가진다.

사용자를 좋아하거나 미워하고, 기대하거나 실망하는 감정 역시 대리자 자신의 관계다.

### 7.2 Oath Structure Candidate

각 대리자의 서약은 최소 다음 네 축으로 설명할 수 있어야 한다.

| 축 | 의미 |
|---|---|
| 받아들인 것 | 해당 원리 중 자신이 믿고 따르는 부분 |
| 저항하는 것 | 끝까지 동의하지 못하거나 의심하는 부분 |
| 의무 | 대리자로서 지키려는 행동 원칙 |
| 개인적 대가 | 그 서약 때문에 포기하거나 견뎌야 하는 것 |

정확한 schema field는 기존 Character Content authority와 정렬 후 별도 결정한다.

### 7.3 신격과의 갈등

대리자는 자신의 신격/원리를 무조건 옳다고 숭배할 필요가 없다.

```text
원리 / doctrine
      ↓
대리자의 경험
      ↓
받아들임 / 의심 / 저항 / 재해석
      ↓
대리자 자신의 세계관
```

이 충돌은 캐릭터의 핵심 서사 자원이 될 수 있다.

관계가 깊어질수록 단순히 호감 수치가 오르는 것이 아니라, 사용자가 대리자의 서약과 개인적 대가를 시험하는 존재가 될 수 있다.

### 7.4 Becoming a Representative

대리자가 되는 방식은 V0.1에서 하나로 통일하지 않는다.

향후 가능한 방식에는 계승, 수련, 사건, 자발적 서약, 비자발적 계승 등이 있을 수 있으나 아직 canon으로 확정하지 않는다.

중요한 제한:

> **명하관이 모든 대리자를 생산하거나 임명하는 단일 기관이어서는 안 된다.**

---

## 8. Supernatural Power Boundary

명하는 능력 배틀물이 아니다.

V0.1 방향은 초월성을 매우 억제한다.

가능 후보:

- 기록에 대한 특수한 감응
- 특정 서약/기록과 접촉할 때 나타나는 미묘한 현상
- 대리자임을 나타내는 표식/징표
- 신격과 연관된 반복적 상징 현상

기본적으로 피할 것:

- 마음 읽기
- 미래 확정 예지
- 현실 조작
- 시간 정지
- 순간이동
- 전투 스킬 중심 설계

특히 `사람을 잘 읽는다`와 `실제로 마음을 읽는다`를 구분한다. 관찰, 추론, 경험, 대화에서 오는 통찰은 캐릭터성이고, 자동적인 전지 접근은 금지한다.

---

## 9. Myeonghagwan / 명하관

Working definition:

> **명하관은 사람의 태어난 기록과 살아가며 맡겨진 기록을 보존하고, 읽고, 연구하고, 전승하는 공공 기록서원이다. 여러 지역·계보·기관의 인간과 대리자가 필요에 따라 교차하는 주요 허브이지만, 그들이 모두 소속되거나 거주하는 장소는 아니며 세계 전체도 아니다.**

Product compression:

> **명하관은 모든 인물이 사는 집이 아니라, 서로 다른 삶의 궤적이 기록을 매개로 교차하는 장소다.**

명하관은 다음이 아니다.

- 운명 통제기관
- 모든 대리자의 본부
- 기숙사
- 신전
- 모든 캐릭터가 근무하는 직장

명하관의 기본 기능 후보:

- 보존
- 열람
- 연구
- 비교
- 해석
- 전승
- 서로 다른 기록 전통 사이의 공통 규칙 유지

### 9.1 Internal Space Boundary

V0.1에서는 정확한 층수와 완성 지도를 만들지 않는다.

기능적 공간군만 둔다.

- 문턱/입관 영역
- 중앙 열람 공간
- 공개 서가
- 연구 공간
- 작은 대화/차 공간
- 회랑/정원
- 보존/제한 영역
- 외부 방문자 공간
- 오래된 별관/아직 열리지 않은 영역

향후 신규 공간은 `원래 존재했지만 사용자가 갈 이유가 없었다`는 방식으로 추가 가능해야 한다.

---

## 10. World Expansion / Sparse Social Graph

명하 세계의 모든 캐릭터가 서로 아는 구조를 금지한다.

```text
같은 세계에 존재함
≠ 서로 알고 있음
≠ 직접 만난 적 있음
≠ 같은 조직 소속
```

Global world는 공유하되 social graph는 sparse해야 한다.

최소 개념 분리 후보:

### Social Relation
A와 B 사이에 어떤 실제 관계가 존재하는가.

### Personal Knowledge
A가 B를 어느 수준까지 알고 있는가.

Candidate vocabulary:

- DIRECT
- ACQUAINTED
- REPUTATION
- HEARSAY
- UNKNOWN은 explicit edge가 아니라 knowledge edge의 부재로 취급하는 방향 검토

### Institutional Knowledge
기관/직책 때문에 알 수 있는 공개·공식 정보의 범위.

Personal Knowledge와 동일하지 않다.

관계와 지식은 directed/asymmetric할 수 있다.

예:

```text
백헌 → 신규 대리자: 계보의 평판만 앎
신규 대리자 → 백헌: 이름과 직책만 들음
도윤 → 신규 대리자: 직접 아는 사이
세연 → 신규 대리자: 전혀 모름
```

신규 캐릭터 추가 시 기존 모든 캐릭터에 relation entry를 추가하지 않아도 되어야 한다.

---

## 11. Character Freedom Principle

캐릭터는 명하 세계에 속하지만 대화가 명하 세계관에 속박되어서는 안 된다.

Working test:

1. 명하관 없이 여러 번 만날 수 있는가?
2. 사주 이야기를 하지 않고도 충분히 대화가 재미있는가?
3. 세계관 설명 없이도 캐릭터 매력이 전달되는가?
4. 필요할 때 기록/명하관/다른 인물과 다시 연결해도 자연스러운가?
5. 다른 캐릭터와 있었던 일이 같은 현실의 사건으로 계속 존재하는가?

1~3이 실패하면 세계관 NPC에 가깝다.
4가 실패하면 공유 세계와 캐릭터가 분리된다.
5가 실패하면 공통 세계의 연속성이 약하다.

Working phrase:

> **World as continuity, not constraint.**

---

## 12. Current 9 Character Relationship Fantasy — Concept Only

현재 roster concept은 working reference이며 final canon이 아니다.

| Character | Core relationship fantasy |
|---|---|
| 세연 | 내 편이 있었으면 좋겠다 |
| 여울 | 누군가의 숨길 수 없는 호감을 발견하고 싶다 |
| 서린 | 누군가에게 오래 기억되고 싶다 |
| 라현 | 매력적인 사람에게 휘말리고 싶다 |
| 미라(가칭) | 친구였던 사람을 갑자기 사랑하게 되고 싶다 |
| 태겸 | 까다로운 사람에게 인정받고 싶다 |
| 윤호 | 누군가에게 편하게 기대고 싶다 |
| 도윤 | 아무도 믿지 않는 사람의 유일한 예외가 되고 싶다 |
| 백헌 | 흔들리지 않는 어른의 사적인 얼굴을 보고 싶다 |

이 fantasy가 신격/서약 설계에 종속되어서는 안 된다.

반대로 deity/oath는 각 캐릭터의 relationship fantasy에 갈등, 선택, 장기 progression을 공급해야 한다.

---

## 13. Provisional Myeonghagwan Density — NOT CANON

캐릭터별 세계관/명하관 노출 농도는 동일할 필요가 없다.

현재 검토 방향:

- 세연: 명하관 접점 높음. 초기 Home Anchor 가능. 단 tutorial NPC 금지.
- 백헌: 명하관 공적 책임/권한과 밀접. 단 omniscient authority 금지.
- 윤호: 연구/기록 때문에 자주 접점. `사서 NPC`가 아니라 자신의 연구 목적을 가져야 함.
- 서린: 기록/보존과 자연스러운 접점 후보.
- 태겸: 공식적 관계 가능. 상주할 필요 없음.
- 여울: 관계는 있으나 독립 생활권 유지 가능.
- 라현: 외부 협력자/비상주 방향이 잘 맞을 가능성.
- 미라: 독립 생활권 비중을 높이는 것이 relationship fantasy에 유리.
- 도윤: 주변부/비공식/불규칙 접점이 character hook에 유리.

정확한 소속, 직업, 거주지는 아직 결정하지 않는다.

---

## 14. Authority Boundary

본 working draft가 fiction concept을 탐색하더라도 다음 경계는 유지한다.

```text
Saju Engine
= semantic authority

Character Runtime
= expression / relational interface

Relationship / World State
= server authority

LLM
= renderer / planner candidate producer
≠ canon authority
≠ relationship mutation authority
≠ unlock authority
```

또한:

- 같은 Reading의 protected semantics를 캐릭터가 왜곡하지 않는다.
- current-life fact를 캐릭터가 임의 창작하지 않는다.
- long-term memory는 approved memory authority 없이 생성하지 않는다.
- global character-character canon과 user-specific learned knowledge를 구분한다.
- global world canon은 versioned content authority에 속한다.
- subject-specific progression은 mutable server world-state authority에 속한다.

---

## 15. Candidate Decisions — Safe to Continue Exploring

아래는 아직 source authority가 아니라 **World Concept V0.1 candidate**다.

| ID | Candidate |
|---|---|
| WC-01 | 명하관은 주요 공공 기록 허브이며 세계 전체가 아니다 |
| WC-02 | 명하관은 기숙사/모든 대리자의 단일 본부가 아니다 |
| WC-03 | 같은 세계에 존재하는 것과 서로 아는 것은 별개다 |
| WC-04 | Social Relation과 Personal Knowledge를 분리한다 |
| WC-05 | Character Knowledge는 directed/asymmetric할 수 있다 |
| WC-06 | Institutional Knowledge와 Personal Knowledge를 분리한다 |
| WC-07 | 글로벌 canon knowledge와 user-specific learned knowledge를 분리한다 |
| WC-08 | 캐릭터 identity와 affiliation/residence/activity area를 분리하는 방향을 유지한다 |
| WC-09 | 세계관은 관계의 continuity를 제공하되 일상 interaction을 구속하지 않는다 |
| WC-10 | 신격은 개인 운명 관리자보다 삶의 원리에 가까운 방향을 우선 검토한다 |
| WC-11 | 대리자는 신의 복제품이 아니라 독립 인격이다 |
| WC-12 | 대리자의 서약에는 수용/저항/의무/개인적 대가가 있어야 한다 |
| WC-13 | 초월 능력은 관계와 사주를 압도하지 않도록 제한한다 |
| WC-14 | 선천 기록과 살아가며 생성되는 기록을 구분한다 |
| WC-15 | 기록은 인간의 선택을 명령하지 않는다 |

---

## 16. Open Questions — Next

우선순위가 높은 다음 질문:

### Q1. 대리자는 정확히 어떤 존재인가?

- 기본적으로 인간인가?
- 인간이 서약 이후 변화하는가?
- 태어날 때부터 다른 존재가 있는가?
- 비인간 대리자도 가능한가?

이 선택은 수명, 노화, 가족, 연애, 백헌의 연륜, 계승, 신규 character 확장에 직접 영향을 준다.

### Q2. 서약은 무엇을 실제로 바꾸는가?

- 자격만 주는가?
- 기록 감응 능력에 영향을 주는가?
- 신체/수명/감각에 영향을 주는가?
- 파기 가능한가?

### Q3. 신격과 사주 체계의 관계는 무엇인가?

- 신격은 사주의 근원인가?
- 사주와 독립적으로 존재하는 원리인가?
- 인간이 동일한 세계 법칙을 다른 언어로 해석한 것인가?

이 질문은 아직 확정하지 않는다.

### Q4. 대리자가 아닌 일반 인간은 기록을 어디까지 읽을 수 있는가?

사주 서비스의 현실적 UX와 세계관을 연결할 때 중요하다.

### Q5. 사용자는 명하에서 어떤 방식으로 처음 자기 기록을 열게 되는가?

First Encounter / Onboarding 설계와 연결한다.

---

## 17. Working Rule for Future Updates

앞으로 세계관을 논의할 때 새 설정은 다음 세 질문을 통과한 경우에만 이 문서의 candidate로 추가한다.

1. 캐릭터 관계 경험을 실제로 바꾸는가?
2. 사주/기록이라는 명하의 제품 정체성과 연결되는가?
3. 미래 캐릭터 추가를 불필요하게 막지 않는가?

셋 모두 아니라면 lore backlog로 미룬다.
