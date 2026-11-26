# 명하 캐릭터·세계관 문서 분류 인덱스

> 기준 저장소: `gycha0109-beep/MyeongHa`
> 기준 브랜치/커밋: `main` / `5e27103`
> 분류 기준일: 2026-11-26
> 목적: 세계관 원전, 캐릭터 바이블, 캐릭터 런타임, 콘텐츠 계약, 승인 기록, 실험 문서를 구분한다.
>
> **문서 이동은 하지 않는다.** 기존 문서의 상대 경로 참조와 승인 이력을 보존하고, 이 문서를 탐색용 진입점으로 사용한다.

## 1. 권한 구조와 읽는 순서

문서는 다음 순서로 읽는다. 하위 문서는 상위 권한 문서의 사실을 임의로 변경할 수 없다.

1. **World Authority** — 명하 세계의 존재·역사·생활 규칙
2. **Character Bible** — 각 인물의 정체성·성격·과거·선택 기준
3. **Character Runtime** — Bible을 현재 대화의 인식·욕구·행동·표현으로 변환
4. **Content / Publication Contract** — 버전 관리, 검증, 번들, 배포 경계
5. **Decision / Gap Records** — 승인된 결정과 아직 미확정인 항목
6. **Experiment / Worklog** — 평가와 실험 기록. 그 자체로 Canon이나 Production 승인이 되지 않는다.

**승인 상태는 구분한다.** Author-approved draft, runtime-authority lane 승인, production publication은 서로 다른 단계다.

## 2. 명하 세계관·배경 원전

| 문서 | 위치 | 권한·역할 |
|---|---|---|
| MyeongHa World Root Canon v0.1 | [docs/world/MYEONGHA_WORLD_ROOT_CANON_V0_1.md](world/MYEONGHA_WORLD_ROOT_CANON_V0_1.md) | **AUTHOR-APPROVED ROOT CANON**. 명하의 존재론, 기원, 이치(理)·명(命), 연결자, 소명·소임, 사회·역사·시간축 |
| MyeongHa Physical & Life Root Canon v0.1 | [docs/world/MYEONGHA_PHYSICAL_LIFE_ROOT_CANON_V0_1.md](world/MYEONGHA_PHYSICAL_LIFE_ROOT_CANON_V0_1.md) | **AUTHOR-APPROVED ROOT CANON**. World Root의 하위 원전. 신체, 생애, 식사, 수면, 학습, 거주, 통신, 방문, 상업, 일상생활 |
| Korean / Hangul World Language Approval v1 | [docs/source-authority-decisions/MYEONGHA_KOREAN_HANGUL_WORLD_LANGUAGE_APPROVAL_V1.md](source-authority-decisions/MYEONGHA_KOREAN_HANGUL_WORLD_LANGUAGE_APPROVAL_V1.md) | **PRODUCT OWNER APPROVED**. 현대 명하의 공용어·공식 문자에 관한 World Root 결정 |

명하의 배경 설정을 확인할 때는 World Root를 먼저 읽고 Physical & Life Root를 이어서 읽는다. 언어 결정은 별도 승인 문서로 보완한다.

## 3. 캐릭터 바이블

### 3.1 공통 표준

- [Character Bible Standard v1](character/CHARACTER_BIBLE_STANDARD_V1.md) — **WORKING STANDARD / VERSIONED TEMPLATE**.
- 특정 캐릭터의 설정 원본이 아니다. 각 인물의 성격·가치·욕망·결함·관계·행동 예측에 필요한 항목과 작성 규칙을 정의한다.

### 3.2 개별 인물 설정 원본

| 캐릭터 | 현재 확인되는 문서 | 저장소에 기록된 상태 |
|---|---|---|
| 백헌 | [BAEKHEON_CHARACTER_BIBLE_DRAFT_V0_2.md](character/BAEKHEON_CHARACTER_BIBLE_DRAFT_V0_2.md) | AUTHOR-APPROVED DRAFT v0.2 / NOT PRODUCTION APPROVED. v0.1은 superseded |
| 라현 | [RAHYEON_CHARACTER_BIBLE_DRAFT_V0_5.md](character/RAHYEON_CHARACTER_BIBLE_DRAFT_V0_5.md) | Character design draft. 저자/Bible authority 승인 이력은 별도 결정 문서 참조. Production authority 아님 |
| 세연 | [SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md](character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md) | WORKING CHARACTER BIBLE / DRAFT. Runtime-authority lane 승인 기록과 Production publication은 구분 |
| 여울 | [YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md](character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md) | WORKING CHARACTER BIBLE / SOURCE-ALIGNED / INCOMPLETE |
| 태겸 | [TAEGYEOM_FAMILY_BIBLE_APPROVED_V0_2.md](character/TAEGYEOM_FAMILY_BIBLE_APPROVED_V0_2.md) | PO APPROVED DESIGN. 가족·전기 설정 자료이며 Production Canon은 아님 |

태겸의 현재 직업 결정은 [TAEGYEOM_OCCUPATION_CANON_V0_1.md](character/TAEGYEOM_OCCUPATION_CANON_V0_1.md)에 별도로 기록되어 있다. 가족 Bible의 과거 직업 방향보다 이 직업 결정이 우선한다.

현재 Launch roster는 9명이다. 그러나 이 디렉터리에서 개별 Bible instance를 확인할 수 있는 인물은 백헌·라현·세연·여울이며, 태겸은 가족 Bible 보조 설정이 있다. **서린·미라·윤호·도윤의 개별 Bible instance 문서는 현재 `docs/character/`에 확인되지 않는다.** 이는 해당 인물의 모든 설정 자료가 저장소 어디에도 없다는 뜻은 아니며, 이 디렉터리의 개별 Bible 문서 현황을 뜻한다.

## 4. 캐릭터 런타임

### 4.1 공통 실행 구조·정책·표준

| 문서 | 위치 | 역할 |
|---|---|---|
| AI / Character Runtime Specification v0.4 | [docs/AI_CHARACTER_RUNTIME_SPEC.md](AI_CHARACTER_RUNTIME_SPEC.md) | 시스템 수준 런타임 아키텍처와 Planner·Capability Gate·Retrieval·Context·Renderer·Guard·Commit 흐름 |
| Character Runtime Standard v1 | [character/CHARACTER_RUNTIME_STANDARD_V1.md](character/CHARACTER_RUNTIME_STANDARD_V1.md) | **WORKING STANDARD / VERSIONED TEMPLATE**. 개별 Runtime instance의 공통 실행 계약 |
| Character Chatbot Common Spec v1.1 | [character/CHARACTER_CHATBOT_COMMON_SPEC_V1_1.md](character/CHARACTER_CHATBOT_COMMON_SPEC_V1_1.md) | 모든 캐릭터의 성격 불변성, 지식·취향·감정·관계 상태, 기억 오염 방어 공통 정책 |

### 4.2 캐릭터별 Runtime instance

| 캐릭터 | 현재 문서 | 저장소에 기록된 상태 |
|---|---|---|
| 백헌 | [BAEKHEON_CHARACTER_RUNTIME_DRAFT_V0_1.md](character/BAEKHEON_CHARACTER_RUNTIME_DRAFT_V0_1.md) | PRODUCT OWNER APPROVED DESIGN DRAFT / NOT PRODUCTION APPROVED |
| 라현 | [RAHYEON_CHARACTER_RUNTIME_DRAFT_V0_2.md](character/RAHYEON_CHARACTER_RUNTIME_DRAFT_V0_2.md) | v0.2가 최신 검토 후보. v0.1은 superseded. DRAFT / NOT YET PRODUCTION AUTHORITY |
| 세연 | [SEYEON_CHARACTER_RUNTIME_DRAFT_V0_1.md](character/SEYEON_CHARACTER_RUNTIME_DRAFT_V0_1.md) | RUNTIME DESIGN DRAFT. Runtime-authority lane 승인 기록은 별도 결정 문서 참조 |
| 여울 | [YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md](character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md) | RUNTIME DESIGN DRAFT / NOT YET PRODUCTION AUTHORITY |

현재 `docs/character/`에는 서린·미라·윤호·도윤·태겸의 개별 Runtime instance 문서가 확인되지 않는다. 태겸의 Runtime Lab 실험 문서는 개별 Runtime authority instance와 다르다.

## 5. 캐릭터 콘텐츠 계약 — 세계관 원전과 구분

- [Character / World Content Specification v0.5](CHARACTER_WORLD_CONTENT_SPEC.md)는 캐릭터·세계 콘텐츠를 versioned canon content로 관리하기 위한 **저작·스키마·검증·번들·배포 계약**이다.
- 이 문서는 명하의 세계관 배경 자체를 정의하는 World Root Canon이 아니다.
- Git/versioned source → validation → immutable content bundle → content hash/version → runtime catalog → operational release의 관리 경계를 다룬다.

## 6. 캐릭터 저작·승인·출시 통제 문서

| 문서 | 분류 |
|---|---|
| [CHARACTER_CONCEPT_V1_WORKING_ROSTER.md](character/CHARACTER_CONCEPT_V1_WORKING_ROSTER.md) | Launch roster와 공식 표시 이름. 상세 Canon 완성과 Production publication은 별도 |
| [CHARACTER_LAUNCH_MVP_AUTHORITY_V1.md](source-authority-decisions/CHARACTER_LAUNCH_MVP_AUTHORITY_V1.md) | 9인 Launch roster 및 출시 사용 정책 승인 |
| [CHARACTER_DETAILED_AUTHORING_PROPOSAL_V1.md](character/CHARACTER_DETAILED_AUTHORING_PROPOSAL_V1.md) | 9인 상세 인물 설정 제안. 승인된 Canon instance와 구분 |
| [CHARACTER_DETAILED_AUTHORING_APPROVAL_MATRIX_V1.md](character/CHARACTER_DETAILED_AUTHORING_APPROVAL_MATRIX_V1.md) | 캐릭터별 승인 사실·미승인 값·작성 슬롯을 관리하는 통제표 |
| [CHARACTER_RUNTIME_AUTHORING_PROPOSAL_V1.md](character/CHARACTER_RUNTIME_AUTHORING_PROPOSAL_V1.md) | Runtime 값·표현·키 후보 제안 |
| [CHARACTER_RUNTIME_AUTHORING_PO_DECISION_GATE_V1.md](character/CHARACTER_RUNTIME_AUTHORING_PO_DECISION_GATE_V1.md) | Runtime 저작 및 typed translation 권한 결정. Production publication과 구분 |
| [CHARACTER_PARALLEL_PRODUCTION_PUBLICATION_LANES_V1.md](character/CHARACTER_PARALLEL_PRODUCTION_PUBLICATION_LANES_V1.md) | 캐릭터별 독립 승인·발행 경로 |
| [RAHYEON_BIBLE_RUNTIME_V0_5_V0_2_TYPED_APPROVAL.md](source-authority-decisions/RAHYEON_BIBLE_RUNTIME_V0_5_V0_2_TYPED_APPROVAL.md) | 라현 Bible/Runtime typed implementation 권한 기록 |
| [SEYEON_BIBLE_RUNTIME_V0_2_V0_1_APPROVAL.md](source-authority-decisions/SEYEON_BIBLE_RUNTIME_V0_2_V0_1_APPROVAL.md) | 세연 Runtime-authority lane 승인 기록 |

추가 승인 결정과 미해결 항목은 각각 `docs/source-authority-decisions/`와 `docs/source-authority-gaps/`에서 확인한다. 결정 문서는 승인된 범위만 권한을 부여하며, 제안서나 schema 통과만으로 Production Canon이 되지 않는다.

## 7. 별도 분류 — 일반 캐릭터 Bible/Runtime으로 취급하지 않을 문서

- **Face Reading 캐릭터 통합:** `docs/character/FACE_CHARACTER_*`, `docs/character/FACE_GOVERNED_*`, `docs/FACE_READING_*`. 관상 관찰·해석 결과를 캐릭터에 전달하는 경계와 실행 계약이다. 인물의 일반 성격 Bible이나 World Root가 아니다.
- **캐릭터 최적화 실험:** `docs/character-optimization/` (현재 42개 문서). GEPA, 후보 비교, 프롬프트·행동 실험 및 평가 자료다. Canon authority가 아니다.
- **캐릭터 Runtime Lab:** `docs/character-runtime-lab/` (현재 10개 문서). 언어 A/B, 시나리오, 오프라인 최적화와 런타임 평가 자료다. 개별 Runtime instance를 대체하지 않는다.
- **운영 기록:** `docs/operations/CHARACTER_MEMORY_WORKLOG.md`, `docs/operations/CHARACTER_RUNTIME_LAB_WORKLOG.md` 등. 진행·실험·운영 이력이다.

## 8. 저장소 문서 구조 현황

분류 기준 커밋에서 `docs/` 아래 문서는 855개다. 이 중 367개는 `docs/` 최상위에 있고, 나머지는 하위 디렉터리에 있다. 주요 디렉터리는 다음과 같다.

| 디렉터리 | 파일 수 | 주된 역할 |
|---|---:|---|
| `docs/character/` | 55 | Bible/Runtime 표준·instance, 저작·Face Character 계약 |
| `docs/world/` | 2 | 명하 World Root 및 Physical & Life Root |
| `docs/character-optimization/` | 42 | 캐릭터 최적화 실험 |
| `docs/character-runtime-lab/` | 10 | Runtime 평가·실험 |
| `docs/source-authority-decisions/` | 15 | 승인된 권한 결정 |
| `docs/source-authority-gaps/` | 23 | 미해결 권한 공백 |
| `docs/operations/` | 251 | 운영·작업·검증 기록 |
| `docs/architecture/` | 19 | 시스템 아키텍처 |
| `docs/security/` | 25 | 보안·권한 |
| `docs/ci/` | 15 | CI 검증·운영 |
| `docs/revenue/` | 17 | 수익·사업 운영 |

`docs/MASTER_SPEC_INDEX.md`는 기존 Product Spec Pack의 색인이다. `CHARACTER_WORLD_CONTENT_SPEC.md`는 참조하지만, 현재 World Root·Bible Standard·Runtime Standard를 한눈에 연결하는 탐색 인덱스 역할은 하지 않는다. 이 문서는 그 탐색 공백을 보완한다.

## 9. 권장 탐색 순서

- 명하 배경을 파악할 때: **World Root → Physical & Life Root → 언어 승인 결정**
- 인물 한 명을 파악할 때: **Bible Standard → 해당 인물 Bible → 해당 인물의 명(命)/직업 등 별도 승인 결정**
- 캐릭터 대화 동작을 파악할 때: **AI Runtime Spec → Runtime Standard → Common Chatbot Spec → 해당 인물 Runtime**
- 출시 가능 여부를 판단할 때: **Launch Authority → 개별 Bible/Runtime authority 결정 → Parallel Publication Lanes → 실제 publication evidence**

이 인덱스는 문서 위치와 문서 역할을 분류한다. 미완성 문서를 승인하거나, OPEN/HYPOTHESIS를 Canon으로 승격하거나, Production 배포 상태를 대신 판정하지 않는다.
