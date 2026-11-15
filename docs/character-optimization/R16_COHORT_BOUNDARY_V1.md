# 캐릭터 R16 평가 항목 교차 혼입 및 분할 경계 검사 v1

> 2026-11-14 · character-runtime-lab · GEPA 로드맵 2단계 · 공개 DRAFT Runtime 원문만 사용 · 원격/유료 호출 없음

## 목표

기존 각 캐릭터 R16 평가 항목을 **수정하거나 새로 만들지 않고**, 실제 저장소의 Runtime에서 평가 메타데이터를 추출해 다른 캐릭터의 항목을 섞거나 동일 항목/가족을 개발·검증에 동시에 배치하는 실수를 차단한다. 실제 대화의 한국어 자연스러움·캐릭터성·사실성 평가를 실시하는 기능이 아니다.

## 실제 R16 소스 현황

| 캐릭터 | 기존 DRAFT Runtime | R16 항목 | 범주 |
|---|---|---:|---|
| 여울 | YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md | 31 | 1~4 |
| 세연 | SEYEON_CHARACTER_RUNTIME_DRAFT_V0_1.md | 46 | 1~5 |
| 라현 | RAHYEON_CHARACTER_RUNTIME_DRAFT_V0_2.md | 41 | 1~4 |
| 백헌 | BAEKHEON_CHARACTER_RUNTIME_DRAFT_V0_1.md | 38 | 1~5 |

**총 156개**. 네 원본의 평가 설명 문장이 완전히 일치하는 캐릭터 간 그룹은 0건이다. 이것이 문장만 다른 의미적 중복, 실제 교차 캐릭터 오염이나 실측 품질을 증명하지는 않는다.

다른 5명(세린·미라·태겸·윤호·도윤)은 기존 경로에 R16 Runtime 원본이 없어 이번 범위 밖이다. 없는 내용을 만들어 승인 상태로 표시하지 않는다.

## 구현 및 안전

- 프로그램: scripts/character-optimization/r16-cohort-boundary-v1.mjs
- 검사: scripts/character-optimization/r16-cohort-boundary-v1.test.mjs

기존 R16 추출기와 티켓 계약을 재사용해 sourceRef, sourceSha256, 캐릭터 식별자, 범주, 설명 문구의 해시 및 DRAFT 상태를 대조한다.

- 캐릭터별 원본과 평가 항목을 다른 캐릭터로 바꿔 넣거나 임의 승인/평가/권한 필드를 추가하면 거부
- 동일 설명의 평가 항목이 다른 캐릭터에 있으면 건수와 관련 캐릭터만 보고하고 사람 판단 필요 유지
- 동일 평가 설명이 개발과 검증에 동시에 배치되면 거부 (서로 다른 캐릭터에서도 차단)
- 동일 캐릭터의 평가 가족이 개발·검증에 중복 배치되면 거부
- 같은 평가 항목 중복 등록, 원본 SHA 불일치, 봉인 최종평가 분할로의 임의 승격 거부
- 출력에는 평가 원문·원문 해시·개인 대화를 배제하고 캐릭터별 건수와 범주 및 의심 그룹 수만 보존

현재 네 원본 모두 DRAFT이며, 실제 사람이 배정한 개발/검증 티켓도 없어 티켓 수는 0이다. 테스트 점수나 사용자 판단을 자동 생성하지 않는다.

## 로컬 실행

~~~sh
node scripts/character-optimization/r16-cohort-boundary-v1.mjs
node --test scripts/character-optimization/r16-cohort-boundary-v1.test.mjs scripts/character-optimization/r16-probe-contract-v1.test.mjs scripts/character-optimization/contracts-v1.test.mjs
~~~

결과의 사람 검토, 독립 평가, 최적화 입력 승인, 외부 호출 승인, 운영 승격 필드는 항상 false다.

## 미완료

- 5명의 캐릭터 R16 Runtime 원본 확보/승인 및 현재 4개의 DRAFT 검토
- 별도 실제 응답과 사람 평가에 의한 의미 수준 교차 오염 및 허위 기억 검증
- 여울 비공개 평가 원본 288건의 사람 검토 6+30+8건, 새 독립 봉인 최종평가
- 정확한 하위 공급자/가격·실제 유료 승인/송신 게이트 및 운영 반영

실제 유료 모델 호출 0건, 여울 파일럿 전체 500원 상한 유지. 이번 변경은 평가 기준의 **출처·분할 계약 검증**이지 실제 챗봇 품질 향상 증거가 아니다.
