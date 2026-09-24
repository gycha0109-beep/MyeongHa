# Character Bible Standard v1

> Status: WORKING STANDARD
> Purpose: 명하 Character Bible의 공통 작성 스키마
> Boundary: Bible은 **그 인물이 누구인가**를 정의한다. Runtime이 어떻게 연기할지는 별도 문서에서 관리한다.

## 0. 원칙

1. Bible은 설정집이다. 프롬프트 매뉴얼이 아니다.
2. `Canon`을 별도 중복 문서로 만들지 않는다. 승인된 Bible이 Character person-level authority가 된다.
3. 세계관/신격/능력처럼 별도 authority가 필요한 층은 해당 authority 문서가 소유하고 Bible은 필요한 연결만 참조한다.
4. 빈칸을 완성도 때문에 억지로 채우지 않는다. 미정은 `[UNDEFINED]`, 검토 중 가설은 `[HYPOTHESIS]`로 남긴다.
5. 성격 형용사보다 실제 선택, 취향, 습관, 결함, 관계에서 드러나는 차이를 우선한다.
6. 관계가 깊어져도 기본 성격이 사라지지 않는다. 친밀감은 다른 면을 unlock한다.
7. Runtime 규칙, retrieval, memory policy, token budget, prompt instruction은 Bible에 넣지 않는다.

## A. CHARACTER COMPASS

- A1. 한 줄 정의
- A2. 표면적 매력 / Hook
- A3. 첫인상
- A4. 핵심 모순
- A5. 캐스트 내 고유성

## B. PERSON

- B1. 기본 정체성
- B2. 기본 성격
- B3. 사회적 얼굴과 혼자 있을 때
- B4. 강점
- B5. 못하는 것 / 한계

## C. INNER CORE

- C1. 가치관 / 인간관
- C2. 지금 원하는 것
- C3. 독립적인 장기 욕망
- C4. 깊은 두려움 / 취약점
- C5. 자기 인식
- C6. 자기착각 / 사각지대
- C7. 진짜 결함
- C8. 선택 방식
- C9. 압박받을 때의 변화

## D. MUNDANE LIFE

- D1. 좋아하는 것
- D2. 싫어하는 것
- D3. 취미 / 혼자 노는 법
- D4. 생활 습관
- D5. 이상한 버릇
- D6. 사소한 약점 / 창피한 부분
- D7. 생활 앵커

## E. EXPRESSION

- E1. 기본 말투
- E2. 유머 / 장난
- E3. 감정별 변화
- E4. 몸짓 / 표정 / 자세
- E5. 대표적 반응

## F. SOCIAL SELF

- F1. 관계 거리에 따른 태도
- F2. 집단 안에서의 위치
- F3. 배려와 도움
- F4. 도움받기 / 의존
- F5. 신뢰와 존중
- F6. 사소한 지뢰와 진짜 지뢰
- F7. 갈등과 화해

## G. LOVE & INTIMACY

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

## H. RELATIONSHIP REVEAL

- H1. 누구나 금방 알 수 있는 면
- H2. 친해져야 알 수 있는 면
- H3. 좋아하는 사람이 생겨야 나타나는 면
- H4. 깊게 신뢰해야 보이는 면
- H5. 변하는 것
- H6. 끝까지 변하지 않는 것
- H7. 핵심 관계 판타지

## I. LIFE WITHOUT THE USER

- I1. 현재 관심사 / 고민
- I2. 독립적인 목표
- I3. 자기 인간관계
- I4. 책임과 의무
- I5. 사용자가 없을 때의 하루

## J. BACKSTORY

- J1. 성장환경
- J2. 가족
- J3. 중요한 과거 경험
- J4. 과거 인간관계 / 연애
- J5. 후회 / 비밀 / 미해결 문제

## K. VISUAL CHARACTERIZATION

- K1. 자기 외모에 대한 태도
- K2. 자기 연출
- K3. 대표 자세 / 표정 / 몸짓
- K4. 의외의 모습

## 상태 규칙

- `[UNDEFINED]`: 아직 설정하지 않음. Runtime이 추론/창작하면 안 됨.
- `[HYPOTHESIS]`: 작가 검토용 가설. Production Runtime authority로 사용하면 안 됨.
- 별도 표기 없음: 해당 Bible 버전에서 채택된 설정. 단, Bible 자체가 Draft이면 Production authority 승격 여부는 별도 release gate가 결정한다.
