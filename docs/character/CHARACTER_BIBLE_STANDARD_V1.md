# Character Bible Standard v1

> Status: WORKING STANDARD
> Document Type: VERSIONED TEMPLATE
> Applies To: Character Bible instance documents using Bible Standard v1
> Companion: `CHARACTER_RUNTIME_STANDARD_V1.md`

---

# 0. STANDARD CONTRACT

## 0.1 Standard와 Instance

명하의 Character 문서는 다음 원칙으로 분리한다.

```text
CHARACTER_*_STANDARD_Vn
= 해당 버전 문서의 공통 구조 / 컬럼 / 작성 규칙 / 상태 규칙

{CHARACTER}_CHARACTER_*_Vx
= Standard를 이용해 실제 Character 값을 채운 instance
```

따라서 이 문서는 특정 Character의 설정집이 아니라 **Character Bible을 만드는 템플릿**이다.

- Standard는 공통 컬럼과 각 컬럼의 의미를 정한다.
- Character 이름이 붙은 Bible은 이 Standard를 사용해 작성한 instance다.
- Standard에는 특정 Character의 취향 / 성격 / 대사 / 과거를 넣지 않는다.
- Character instance는 자신이 따르는 Bible Standard 버전을 header에 명시한다.

## 0.2 Bible의 역할

Character Bible은:

> **처음 보는 작가나 시스템이 읽고도 이 사람이 낯선 상황에서 무엇을 느끼고, 선택하고, 말하고, 숨기고, 좋아하고, 싫어할지를 상당 부분 예측할 수 있게 만드는 인간 원본**

이다.

Bible은 설정집이다. Runtime 프롬프트 매뉴얼이 아니다.

## 0.3 Bible과 다른 문서의 경계

```text
Character Bible   = 이 사람은 누구인가
Character Runtime = 이 사람이 지금 어떻게 행동하는가
World / Deity     = 세계에서 무엇이 사실인가
Visual Authority  = 시각 자산의 확정 규격
Memory / Relation = 사용자와 실제로 무엇이 있었는가
```

승인된 Bible은 person-level authority가 된다. 같은 내용을 별도 `Canon` 문서로 중복 관리하지 않는다.

세계관 / 신격 / 능력 / 시각 asset처럼 별도 authority가 필요한 층은 해당 authority가 소유하며 Bible은 사람을 이해하는 데 필요한 연결만 참조한다.

---

# 1. AUTHORING PRINCIPLES

1. 빈칸을 완성도 때문에 억지로 채우지 않는다.
2. 성격 형용사보다 실제 선택, 취향, 습관, 결함, 관계에서 드러나는 차이를 우선한다.
3. 심리학적 설명은 행동을 생성하기 위한 기반이지 독자에게 보여줄 논문이 아니다.
4. 관계가 깊어져도 기본 성격이 사라지지 않는다.
5. 친밀감은 personality replacement가 아니라 새로운 면의 reveal이다.
6. 과거는 현재 인물을 설명할 필요가 있을 때만 만든다.
7. archetype에서 cliché trauma를 역산하지 않는다.
8. “잘 먹히는 공략법” 같은 사용자 매뉴얼 언어보다 사람의 취향 / 경계 / 끌림으로 쓴다.
9. Runtime 규칙, retrieval, memory policy, token budget, prompt instruction은 Bible에 넣지 않는다.
10. Visual Architecture 전체를 Bible에 복제하지 않는다. 외모에 대한 자기 인식과 몸짓처럼 **인물성에 닿는 시각 정보**만 포함한다.

---

# 2. COMPLETENESS TEST

각 항목은 최소 하나 이상의 기능을 가져야 한다.

- **식별:** 다른 Character와 무엇이 다른가?
- **예측:** 낯선 상황에서 행동을 예측할 수 있는가?
- **생성:** 새로운 일상 / 대화 / 갈등 장면을 만들 수 있는가?
- **관계 변화:** 가까워질수록 무엇이 달라지는지 설명하는가?

아무 기능도 없다면 필수 설정으로 강제하지 않는다.

생일, 혈액형, MBTI, 좋아하는 색처럼 작품에 따라 유용할 수 있는 정보는 필요할 때 추가할 수 있지만 v1 공통 필수 컬럼은 아니다.

## 2.1 Answerability / Biography Closure

모든 biography를 전기처럼 완성할 필요는 없다. 다만 Production Character가 사용자에게 반복적으로 질문받을 가능성이 높은 사실은 **High-Answerability Fact**로 관리한다.

기본 Closure 대상 예:

- 정확한 나이 또는 명시적인 age policy
- 생일
- 혈액형
- 출생 / 성장 지역
- 현재 생활 기반 / 거주 형태
- 직업 / 교육 상태
- 가족 구성 / 형제자매
- 가족과의 현재 관계
- 주요 성장 / 학교 이력의 필요한 범위
- 현재 인물을 이해하는 데 필요한 주요 전환점
- 과거 연애의 존재 여부와 필요한 표면 범위
- 현재 중요한 비사용자 인간관계
- 현재 책임 / 의무
- MBTI 경험 / self-report policy

이 목록은 trivia를 강제하기 위한 것이 아니다.

> **사용자가 자연스럽게 물을 질문에 Runtime이 매번 authoring gap 때문에 회피해야 한다면 그 사실은 Closure 대상이다.**

반대로 낮은 가치의 예측 불가능한 trivia까지 미리 무한히 작성하지 않는다.

Production 전 Closure Pass에서는 각 High-Answerability Fact를 최소 하나로 분류한다.

- 실제 값을 채택한다.
- `SOFT_CANON`으로 범위 / 정책만 채택한다.
- 의도적으로 열어둘 이유가 있으면 `INTENTIONALLY_OPEN`으로 명시한다.
- 다른 authority가 결정해야 하면 `WORLD_DEPENDENT`로 명시한다.
- 아직 결정하지 못했다면 `AUTHOR_UNDEFINED`로 남기되 authoring debt로 추적한다.

---

# 3. CHARACTER BIBLE INSTANCE TEMPLATE

아래 A~K가 **Character Bible Standard v1의 instance 컬럼**이다.

Character 이름이 붙은 Bible 문서는 이 순서와 의미를 기본으로 사용한다.

# A. CHARACTER COMPASS

목적: 이 사람을 1분 안에 이해할 수 있게 한다.

- A1. 한 줄 정의
- A2. 표면적 매력 / Hook
- A3. 첫인상
- A4. 핵심 모순
- A5. 캐스트 내 고유성

# B. PERSON

목적: 사건이나 연애가 없어도 평상시 어떤 사람인지 정의한다.

- B1. 기본 정체성
- B2. 기본 성격
- B3. 사회적 얼굴과 혼자 있을 때
- B4. 강점
- B5. 못하는 것 / 한계

# C. INNER CORE

목적: 왜 이런 선택과 행동이 나오는지 설명한다.

- C1. 가치관 / 인간관
- C2. 지금 원하는 것
- C3. 독립적인 장기 욕망
- C4. 깊은 두려움 / 취약점
- C5. 자기 인식
- C6. 자기착각 / 사각지대
- C7. 진짜 결함
- C8. 선택 방식
- C9. 압박받을 때의 변화

# D. MUNDANE LIFE

목적: 큰 사건이 없는 날에도 이 사람이 실제로 살아 있게 만든다.

- D1. 좋아하는 것
- D2. 싫어하는 것
- D3. 취미 / 혼자 노는 법
- D4. 생활 습관
- D5. 이상한 버릇
- D6. 사소한 약점 / 창피한 부분
- D7. 생활 앵커

구체성은 양보다 중요하다. trivia 목록을 무한히 늘리지 않는다.

# E. EXPRESSION

목적: 내면이 말과 몸으로 어떻게 새어 나오는지 정의한다.

- E1. 기본 말투
- E2. 유머 / 장난
- E3. 감정별 변화
- E4. 몸짓 / 표정 / 자세
- E5. 대표적 반응

대표적 반응은 칭찬, 도움, 거절, 틀렸음을 알게 된 순간, 예상 밖의 진심 등 **Character를 드러내는 상황만** 선택한다.

# F. SOCIAL SELF

목적: 사용자의 연애 상대가 아닌 한 인간으로서 다른 사람과 어떻게 관계 맺는지 정의한다.

- F1. 관계 거리에 따른 태도
- F2. 집단 안에서의 위치
- F3. 배려와 도움
- F4. 도움받기 / 의존
- F5. 신뢰와 존중
- F6. 사소한 지뢰와 진짜 지뢰
- F7. 갈등과 화해

# G. LOVE & INTIMACY

목적: 이 사람에게 사랑과 친밀감이 무엇인지 정의한다.

- G1. 연애 / 사랑에 대한 생각
- G2. 끌림
- G3. 플러팅 / 성적 긴장
- G4. 애정 표현
- G5. 애정 받기
- G6. 질투 / 관계 불안
- G7. 거절과 경계
- G8. 진짜 호감이 생긴 뒤의 변화
- G9. 깊은 신뢰
- G10. 가장 깊은 자기노출

Character도 사용자를 선택하는 주체여야 한다. 관계는 일방향적인 “공략 성공”으로 쓰지 않는다.

# H. RELATIONSHIP REVEAL

목적: 가까워질수록 새로 발견되는 면과 끝까지 유지되는 면을 정의한다.

- H1. 누구나 금방 알 수 있는 면
- H2. 친해져야 알 수 있는 면
- H3. 좋아하는 사람이 생겨야 나타나는 면
- H4. 깊게 신뢰해야 보이는 면
- H5. 변하는 것
- H6. 끝까지 변하지 않는 것
- H7. 핵심 관계 판타지

숫자형 호감도 stage를 Bible에 직접 설계하지 않는다. 정성적인 관계 변화를 정의하고 Runtime이 이를 실행한다.

# I. LIFE WITHOUT THE USER

목적: 사용자가 접속하지 않아도 이 사람의 삶이 계속된다는 기반을 만든다.

- I1. 현재 관심사 / 고민
- I2. 독립적인 목표
- I3. 자기 인간관계
- I4. 책임과 의무
- I5. 사용자가 없을 때의 하루

# J. BACKSTORY

목적: 현재의 사람을 설명하는 데 필요한 만큼만 과거를 정의한다.

- J1. 성장환경
- J2. 가족
- J3. 중요한 과거 경험
- J4. 과거 인간관계 / 연애
- J5. 후회 / 비밀 / 미해결 문제

모든 항목을 억지로 채우지 않는다. 현재 행동과 연결되지 않는 장식용 비극은 만들지 않는다.

# K. VISUAL CHARACTERIZATION

목적: Visual Asset Spec을 복제하지 않고 **이 사람의 성격이 외형과 몸짓을 다루는 방식**만 정의한다.

- K1. 자기 외모에 대한 태도
- K2. 자기 연출
- K3. 대표 자세 / 표정 / 몸짓
- K4. 의외의 모습

---

# 4. FACT AUTHORITY / KNOWLEDGE / DISCLOSURE MODEL

기존의 `[UNDEFINED]` 하나에 "작가가 아직 안 정함", "Character가 모름", "Character가 알지만 말하지 않음"을 동시에 담지 않는다.

> **Authoring authority, Character knowledge, user disclosure는 서로 다른 축이다.**

## 4.1 Source Authority

| 값 | 의미 | Runtime 취급 |
|---|---|---|
| `CANON` | 해당 Bible version에서 채택된 확정 person-level fact | authority로 사용 가능 |
| `SOFT_CANON` | 범위 / 인상 / self-report처럼 의도적으로 약한 정밀도로 채택된 fact | 적힌 정밀도 이상으로 확장 금지 |
| `AUTHOR_UNDEFINED` | 작가가 아직 결정하지 않음 | 추론 / 창작 / durable fact 승격 금지 |
| `INTENTIONALLY_OPEN` | 작가가 의도적으로 값을 고정하지 않기로 결정 | 빈칸이 아니라 설계 결정. Runtime이 durable biography를 임의 확정하지 않음 |
| `WORLD_DEPENDENT` | World / Deity 등 다른 authority가 결정해야 함 | 해당 authority 없이 Character Bible이 확정하지 않음 |

Bible 자체가 Draft이면 `CANON` / `SOFT_CANON` 표기도 **그 Draft 내부에서 채택된 값**이라는 뜻이며, Production authority 승격 여부는 별도 release gate가 결정한다.

## 4.2 Character Knowledge

| 값 | 의미 |
|---|---|
| `KNOWN` | Character가 해당 사실을 알고 있음 |
| `PARTIAL` | Character가 일부만 알고 있거나 불확실하게 알고 있음 |
| `UNKNOWN_TO_CHARACTER` | 세계에는 사실이 존재할 수 있으나 Character 자신은 모름 |
| `NOT_APPLICABLE` | knowledge 축이 적용되지 않음 |

`AUTHOR_UNDEFINED`와 `UNKNOWN_TO_CHARACTER`를 혼동하지 않는다.

```text
AUTHOR_UNDEFINED
= 작가가 아직 사실을 만들지 않음

UNKNOWN_TO_CHARACTER
= 사실의 authority는 존재하지만 Character가 그 사실을 모름
```

## 4.3 Disclosure Default

| 값 | 의미 |
|---|---|
| `PUBLIC` | 초기 관계에서도 자연스럽게 공개 가능 |
| `FAMILIAR` | 어느 정도 친숙함 / 맥락이 필요 |
| `ATTACHED` | 실제 애착과 관계 history가 필요 |
| `DEEP_TRUST` | 깊은 신뢰와 적절한 상황이 필요 |
| `CONTEXTUAL` | 관계 stage보다 질문 맥락 / 사건 / 현재 상태가 우선 |
| `NEVER` | 해당 Character가 원칙적으로 공개하지 않는 것으로 채택된 설정 |
| `NOT_APPLICABLE` | disclosure 축이 적용되지 않음 |

Disclosure 값은 **기본 접근 깊이**다. 실제 turn의 공개 여부는 Runtime Disclosure Gate가 현재 trust, shared history, 질문 맥락, 이전 공개 이력을 함께 보고 결정한다.

## 4.4 Authoring State Compatibility

기존 instance의 표기는 v1 안에서 다음처럼 해석한다.

- `[UNDEFINED]` → 기본적으로 `source_authority: AUTHOR_UNDEFINED`
- `[HYPOTHESIS]` → authoring proposal. `CANON` / `SOFT_CANON`이 아니며 Production Runtime authority로 사용 금지
- 별도 표기 없음 → 해당 Bible Draft 내부에서 채택된 내용. 필요할 때 fact registry에서 `CANON` 또는 `SOFT_CANON` 정밀도를 명시

중요:

- `[UNDEFINED]`는 "Character가 비밀로 함"을 뜻하지 않는다.
- `[HYPOTHESIS]`는 "Character가 불확실하게 기억함"을 뜻하지 않는다.
- `PRIVATE` 같은 표현을 source authority 값으로 사용하지 않는다. private 여부는 disclosure 축이다.
- 현재 성격에서 과거 trauma / 가족사 / 연애사를 역산해 빈칸을 채우지 않는다.

## 4.5 Fact Registry / Closure Appendix

Character instance는 A~K의 인간 설정집 본문을 훼손하지 않기 위해 문서 말미에 선택적으로 **Fact Authority & Biography Closure Appendix**를 둘 수 있다.

권장 최소 컬럼:

```text
fact_key
value_or_policy
source_authority
character_knowledge
disclosure_default
source_section
closure_note
```

이 Appendix는 A~K와 경쟁하는 두 번째 Canon이 아니다.

- 실제 서술의 원본은 A~K다.
- Appendix는 high-answerability fact의 authority / knowledge / disclosure를 빠르게 확인하기 위한 index다.
- 값이 A~K와 충돌하면 A~K를 먼저 수정한 뒤 Appendix를 동기화한다.
- 장래 machine-readable Character Manifest가 도입되면 이 metadata를 Bible에서 **컴파일 / 추출**한다.
- Manifest를 사람이 별도 설정 원본처럼 수정하지 않는다.

---

# 5. INSTANCE HEADER TEMPLATE

모든 Character Bible v1 instance는 최소 다음 header를 가진다.

```text
# {Character} Character Bible {Version}

Status:
Document Type: CHARACTER BIBLE INSTANCE
Character:
Bible Standard: Character Bible Standard v1
Authority State:
World / Deity Layer:
Source:
```

필요 없는 header field는 무작정 늘리지 않는다.

---

# 6. INSTANCE AUTHORING RULES

1. A~K의 의미를 바꾸지 않는다.
2. 항목을 채울 근거가 없으면 `[UNDEFINED]`를 사용한다.
3. 검토용 가설은 `[HYPOTHESIS]`로 분리한다.
4. 동일 사실을 여러 섹션에 복붙하지 않는다. 필요한 경우 짧게 참조하거나 다른 관점에서만 기술한다.
5. 예시 대사는 Character를 이해시키기 위한 예시이며 고정 catchphrase가 아니다.
6. Character의 결함을 “좋은 사람”으로 보이게 만들기 위해 제거하지 않는다.
7. 사용자를 위해 존재하는 인물처럼 쓰지 않는다. I 영역을 통해 독립적인 삶을 확보한다.
8. H 영역에서 관계가 깊어진 뒤에도 H6의 core identity가 남아 있어야 한다.
9. J 영역은 archetype cliché를 채우는 공간이 아니다.
10. K 영역은 별도 Visual Authority와 충돌하지 않는다.

---

# 7. VERSIONING RULE

`Character Bible Standard v1`을 따르는 instance는 header에 반드시 다음을 명시한다.

```text
Bible Standard: Character Bible Standard v1
```

A~K 컬럼의 의미나 상태 규칙이 breaking change되면 새 Standard major version을 만든다.

단순 설명 보강이나 오탈자 수정처럼 instance contract를 깨지 않는 변경은 같은 major Standard 안에서 관리할 수 있다.

---

# 8. DEFINITION OF DONE

Character Bible v1 instance는 다음을 만족해야 한다.

- A~K 구조가 존재한다.
- 핵심 인물성이 A / B / C에서 식별된다.
- 큰 사건이 없어도 D를 통해 생활 장면을 생성할 수 있다.
- E를 통해 말과 몸의 표현 차이를 예측할 수 있다.
- F를 통해 사용자 외 관계에서도 존재할 수 있다.
- G / H를 통해 친밀감의 변화와 불변 core를 모두 설명할 수 있다.
- I를 통해 사용자 없이도 삶이 지속된다.
- J의 빈칸을 억지로 채우지 않는다.
- K가 Visual Authority를 중복하지 않는다.
- fact의 source authority / Character knowledge / disclosure 축이 혼동되지 않는다.
- 기존 `[UNDEFINED]` / `[HYPOTHESIS]` 표기는 v1 compatibility rule에 맞게 해석된다.
- High-Answerability biography의 unresolved gap이 Closure Pass에서 식별된다.
- Runtime instruction이 Bible 안으로 역류하지 않는다.
