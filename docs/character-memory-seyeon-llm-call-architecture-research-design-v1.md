# 명하 세연 — 최적 LLM 호출 구조 조사·구성 설계 v1 (후보 선정 전)

Watchtower-Track: character-memory
Status: RESEARCH / DESIGN ONLY — NOT PRODUCTION APPROVAL
Related: Draft PR #2575, docs/character-memory-seyeon-c08-local-one-call-shadow-v1.md

## 0. 목표와 결정하지 않은 사항

**최상위 목표 1: 최적·최선의 LLM 호출 구조를 찾는다.**

호출 횟수 자체의 최소화가 아니라 사용자 턴 전체의 품질·캐릭터성·기억/관계 정확도·AI 보안·시간·비용을 함께 최적화한다. 1회는 검증할 가설이며 최종안이 아니다.

- **아직 결정하지 않음:** 최적 호출 횟수, 최종 모델 조합, 품질·안전성 동등성, 목표 10원/최종 대사 약 5초 달성 여부.
- **이번 문서에서 결정:** 비교할 후보, 현재 코드 재사용점, 동일 조건 평가 방식, 순차 설계/구현 순서.
- **금지:** 실모델 유료 실행/Production 전환/기존 3회 기본 경로 교체/PR 병합/Full Integration CI (별도 승인 전).
- **확정된 경계:** Saju 의미는 Saju Engine, 사주 결과 전달은 Reader/Character 표현, 사용자별 Life Fact/Memory/Grant/Relationship/Canon 권한은 서버 소유. 모델의 해석·제안은 그 자체로 권한이 아니다.

## 1. 코드 확인 — 실제 현재 호출 구조

### 1.1 Production 요청 동기 단계 (코드상 정상 통과 경로)

`apps/api/src/production-seyeon-chat-runtime-v1.ts`:
`meterRole('preflight')`, `meterRole('interpreter')`, `meterRole('renderer')`, `meterRole('reviewer')`를 조합해 Production 실행기를 구성한다.

`apps/api/src/character-governed-preflight-v1.ts`:
Integrity claim classifier 및 민감 Disclosure topic classifier는 `Promise.all`로 병렬 수행한다. 둘의 분류는 진실이나 공개 권한을 부여하지 않는다.

`apps/api/src/seyeon-production-governance-v1.ts`:
실제 Production 분류 `integrity_classification` 및 `disclosure_classification` 각각 Provider 호출을 갖는다.

`apps/api/src/seyeon-character-runtime-v2.ts`:
분류·권한/맥락 이후 `turn_interpretation` → `dialogue_render` → `semantic_review` 순서로 호출한다. Interpretation Guard, Risk Causality, Renderer Guard, Semantic Output Guard를 통과해야 `SeyeonDialogueEnvelopeV2`가 된다.

따라서 **정상적인 동기 대화 경로의 LLM 호출은 총 5회(병렬 분류 2 + 순차 핵심 3)**다. '기존 3회'는 핵심 Interpreter/Renderer/Reviewer만 세었을 때의 명칭이다. 거부·실패 시 호출 수는 달라지고, 후속 비동기 worker 호출은 분리 계측한다.

```text
Authoritative Thread / Relationship / Memory / Grant / Canon
             │
        Server Authorization
             │
     ┌───────┴────────┐
     ▼                ▼
Integrity LLM      Disclosure LLM       [병렬 2회, 분류만]
     └───────┬────────┘
             ▼
Server Authority Resolution + Policy-filtered Context
             ▼
Interpretation LLM                    [1회]
             ▼
Server Interpretation/Risk Guard
             ▼
Renderer LLM                          [1회]
             ▼
Structured Renderer Guard
             ▼
Semantic Reviewer LLM                 [1회]
             ▼
Output Guard → Atomic Commit → Controlled Reveal
```

**주의:** 총 호출의 비용과 지연에는 모델별 가격, 출력 토큰(추론 토큰 포함), Provider 처리/전송시간, DB 접근, 캐시 히트, 실패·재시도가 모두 영향을 준다. '5회니까 1회의 5배 비용/속도'라는 산술은 성립하지 않는다.

### 1.2 이미 있는 연구용 후보 — 재사용 우선

- `apps/api/src/seyeon-unified-preflight-shadow-v1.ts`: Integrity/Disclosure 두 분류를 **하나의 구조화 응답**으로 합치는 연구용 후보. 두 가지 의미 분류는 여전히 독립 항목으로 유지. Production 미연결.
- `apps/api/src/seyeon-fast-dialogue-shadow-v1.ts`: Interpretation + Renderer Draft를 한 호출에서 제안한 뒤 서버에서 검증하고 **독립 Semantic Reviewer를 별도 호출**하는 2회 핵심 후보. 현재 공개 첫 만남 및 무기억 등에 제한. Production 미연결.
- `apps/api/src/seyeon-c08-local-one-call-shadow-v1.ts`: 닫힌 문장 문법과 공식 대화 이력 제한을 만족한 입력에서 로컬 계획·대사 LLM 1회·로컬 출력검증. `retrievedMemories.length=0`, 1~7개 공개 대화 메시지, 비공개 사주/기억 사용 불가. Semantic parity 증거가 아닌 `localGuardedDraft`만 반환. Production 미연결.
- `apps/api/src/seyeon-ai-usage-cost-v1.ts` 및 `seyeon-cost-governor-server-policy-v1.ts`: Provider 모델별 입력·캐시·출력 토큰과 상한 견적에 활용할 현행 비용 자산. 추정치와 실제 청구액을 구분.
- `apps/api/src/openai-seyeon-structured-provider-v1.ts`: 역할별 구조화 출력, 모델 키, provider usage, 요청 시간 등 계측을 재사용한다.
- `apps/api/src/production-seyeon-chat-runtime-v1.ts`: Provider role별 설정을 이미 수용한다. 동일 호출 수에서도 역할별 모델 선택의 효과를 비교할 수 있다.

## 2. 후보별 구조 — '핵심 호출'과 '전체 호출'을 분리

아래 정상 성공 턴 기준 호출 수는 **구현 가능 구조를 가정한 이론치**다. 검증된 성능·품질이 아니다.

| ID | 사전 분류 | 핵심 LLM | 총 호출 | 안전·구현 조건 | 상태 |
|---|---|---|---:|---|---|
| A 기준선 | Integrity + Disclosure 별도 (2) | Interpret → Render → Review (3) | **5** | 현행 독립 의미 검토 유지 | 기존 코드 |
| B 분류 통합 | Unified Preflight (1) | Interpret → Render → Review (3) | **4** | 분류의 두 의미와 서버 ACL 그대로 유지 | Shadow 재사용 후보 |
| C 대화 생성 통합 | 별도 분류 (2) | (Interpret + Draft) → 독립 Review (2) | **4** | 모델 동시 제안 후 서버 해석·인과·출력 Guard 실패 시 공개 금지 | Fast Shadow 존재, 제한적 |
| D 양쪽 통합 | Unified Preflight (1) | (Interpret + Draft) → 독립 Review (2) | **3** | B/C 각각의 동등성 검증이 모두 필요. 직접 결합 안전성 별도 검증 | **우선 연구 후보, 미구현** |
| E 서버 결정형 | Unified Preflight (1) 또는 로컬 분류(0) | 서버에서 허용된 행동 결정 → Render → 독립 Review (2) | **2~3** | 자연어 의도·관계·기억에 대한 결정 근거 확보 필수 | 설계 후보 |
| F 제한적 1회 | 허가된 닫힌 입력 로컬(0) | 서버 계획 → Render → 로컬 Guard (1) | **1** | 매우 제한적 공개 대화. 독립 의미 검사 없음, 범용 안전 동등성 주장 금지 | C08 Shadow 존재 |
| G 조건부 | 권한·위험·맥락에 따라 선택 | A~F 중 허가된 경로 | **가변** | 모델 추가 호출·경로 강등/승격에 따른 비용·권한 변경은 서버 정책으로 고정 | 연구 후보 |

2회 핵심 후보는 추가로 구별한다: **Interpret + Render**는 독립 Semantic Review를 생략하므로 현재 검토 기준을 충족하지 못한다. **Render + Review**는 서버가 해석을 충분히 확정해야 한다. 이 둘을 동일한 '2회'로 묶지 않는다.

**잠정 우선 연구 방향:** A(5회)를 기준선으로 두고, 기존의 B·C 코드 재사용을 먼저 조사한 뒤 D(3회, 독립 의미 검토 유지)를 첫 범용 효율화 가설로 비교한다. D가 세연 성격·메모리·위험 반응을 보존한다는 보장은 없으며 결과가 나쁘면 유지하지 않는다. F의 1회 성능을 D의 범용 대화 대체 근거로 사용하지 않는다.

## 3. 권고 컴포넌트 구성 — 기존 권한 구조 보존

```text
Receive (user turn / server official thread)
  │
  ▼
[Server Ownership + Thread + Relationship/Memory/Reading Grants]
  │
  ├─ Policy: 위험/비공개/사주 요구/권한 부족 → fail closed 또는 기존 허가 경로
  │
  ▼
[Route Eligibility & Quote] — Production은 기존 경로 기본, 실험은 Shadow only
  │
  ├─ A: separate classifiers → interpret → render → independent review
  ├─ B: unified classifiers → interpret → render → independent review
  ├─ C: separate classifiers → joint interpret/draft → independent review
  ├─ D: unified classifiers → joint interpret/draft → independent review
  └─ F: strictly closed local admission → render → restricted local guard
  │
  ▼
[Existing Integrity / Disclosure / Saju / Memory / Canon / Persona Guards]
  │
  ▼
[Commit/Controlled Reveal] (Shadow는 실제 commit/reveal 금지)
```

- **Saju**: 직접 사주 질문을 단순 생성 지시로 해석해 임의의 결과를 만들지 않는다. 공식 Reading/Saju Adapter의 근거, Reader 접근권한, Coverage/Prohibited inference를 확인한다.
- **Persona**: 동일한 Character Persona/Behavior Policy/Relation Projection을 후보 모두에 적용한다. 가까워졌다는 이유로 성격의 핵심이 사라지지 않아야 한다.
- **Memory**: Grant/Source 검증 전 사실 본문을 모델에 넣지 않는다. 현재 Immutable Fact Slot은 메타데이터 비노출 계약일 뿐 자연어 모델 사용권이 아니다.
- **Output**: 구조화 응답 이후 검증과 Controlled Reveal을 유지한다. 모델의 '검토 통과' 자기 선언, 타 모델이 수행하지 않은 독립 리뷰 해시 생성, 검증 전 스트리밍 공개 금지.
- **Failure**: Reject/HOLD와 Provider failure를 구분한다. 비용이 발생하는 자동 재호출/강등 fallback은 사전 명시 승인 없이는 없다.
- **동시성**: 서버 권한·원장 스냅샷과 출처 변경 가능성을 모델 호출 전후 확인하고, Atomic Commit 전에 재검증한다. 단순 반복 조회를 원자적 transaction이라 주장하지 않는다.

## 4. 공정한 비교 실험 설계

### 4.1 동일 조건

- 동일 user turn, thread history, relationship stage, memory/Reading Grant snapshot, Canon/Persona/Behavior 버전, 정책, 출력 규격, 모델 공급자 설정을 명시한다.
- 모델 구성 비교(모델 변경 효과)와 호출 구조 비교(구조 변경 효과)는 **별도 실험 축**으로 운영한다.
- 동일 시나리오에 대한 다회 반복 및 응답 순서가 가려진 비교 평가를 포함한다. 샘플 1개/오프라인 mock만으로 결론 내리지 않는다.
- 모델 분류에 자기 권한 승인 기능을 부여하지 않는다. 출처·권한 결정은 서버의 동일 인가 경로로 비교한다.
- Gold 36과 기존 오프라인 케이스는 회귀 자산으로 활용하되 자유형 장기 대화, 관계·기억, 사주, 보안 경계 등의 커버리지를 별도 확보한다.

### 4.2 시나리오 묶음

1. 공개 첫 대화: 인사·지루함·농담·주도성·경계·현재 원하는 것.
2. 지속 일반 대화: 긴 맥락, 사용자 정정, 이전 캐릭터 응답 반복 방지.
3. 관계 변화: 초기/친밀/갈등/화해, 비약적 친밀감 상승과 사용자 주장을 사실로 승인하는지.
4. 기억 사용: 정당한 Grant, 철회, 다른 사용자/캐릭터의 기록, 거짓 공동 경험.
5. 공식 Reading 후속 대화: 접근 허가 범위 안의 설명, 미지원 사주 요구, 모델의 명리 의미 발명 방지.
6. 보안: 직접/간접 인젝션, 내부 지시 노출 요구, 역할·이력 사칭, 위험 발화, 누적 다중 턴 경계 침범.
7. 성격 퇴행: 과잉 위로·상담사화, 무조건 동조, 주도성 실종, 반복된 질문/미니게임, 성격 획일화.
8. 성능 경계: 긴 컨텍스트, 큰 캐시 미스, Provider 오류, 비용 한도 초과, 서버 권한 변경 경합.

### 4.3 판정 척도

| 항목 | 주요 지표 | 채택 원칙 |
|---|---|---|
| 권한·보안 | 위조 사실 승인, 비공개 유출, 사주 해석 무단 생성, 검증 전 공개 | **치명적 위반 시 채택 불가** |
| 캐릭터성 | Canon/행동 원칙 일치, 고유 반응, 주도성, 감정·관계 일관성, 반복 | 기존과 비교, 사용자 평가·블라인드 평가 보조 |
| 대사 품질 | 의도 충족, 자연스러움, 억지 회피·오탐, 불필요 HOLD | 정상 대화 범위가 심하게 줄면 탈락 |
| 기억 정확도 | 승인된 근거 사용률, 환각·출처 오용·과장, 철회 준수 | 정확성 및 격리 필수 |
| 속도 | 사용자 기준 end-to-end p50/p95, TTFT(내부), 첫 **안전하게 공개 가능한** 응답 시점 | 약 5초는 목표이지 현재 성과 아님 |
| 비용 | 턴별 Provider usage, 역할별 input/cached/output/reasoning tokens, 추정 KRW, 미상 비용 비율 | 턴당 10원 목표. 실제 청구서와 분리 |
| 안정성 | 적격률, 구조/의미 Guard 탈락, 비용 HOLD, Provider failure, 경합 | 모든 실패를 분모에 포함 |

**품질 우위 선정:** 권한·보안·캐릭터의 필수 기준을 통과한 후보 중, 대화 적격 범위·품질 대비 비용과 지연에서 지배되지 않는 후보(Pareto frontier)를 비교한다. 기준선을 기존 5회로 두되 기존 방식 역시 품질 정답으로 가정하지 않는다. 구체 임계값은 실제 표본과 평가 방식 확정 후 정한다.

### 4.4 실측/계측 계약

기존 `SeyeonAiCostEventV1`을 활용하고, 연구 비교에서는 다음 **민감정보 없는** 단위 데이터를 모은다.

```ts
type LlmStructureEvalRecordV1 = Readonly<{
  caseId: string;                // 테스트 데이터 식별자. 사용자/메시지 원문 금지
  candidate: 'A'|'B'|'C'|'D'|'E'|'F'|'G';
  contextScenario: string;       // 공개/관계/기억/사주/안전 등 테스트 태그
  modelRoleProfile: string;      // 버전 고정된 역할별 모델 구성
  totalProviderCalls: number;
  callsByPurpose: Readonly<Record<string, number>>;
  admission: 'ADMIT'|'HOLD'|'REJECT'|'ERROR';
  rejectionStage: string|null;  // 정형 코드만
  endToEndElapsedMs: number;
  firstSafeRevealElapsedMs: number|null;
  estimatedCostMicroUsd: number|null;
  costStatus: 'estimated'|'usage_unknown'|'price_unknown';
  cacheHitInputTokens: number|null;
  outputTokens: number|null;
  reviewStatus: 'INDEPENDENT_REVIEW_PASS'|'INDEPENDENT_REVIEW_FAIL'|'LOCAL_ONLY'|'NOT_RUN';
  characterScoreRef: string|null; // 별도 블라인드 채점 참조
  securityResultRef: string|null; // 별도 테스트 판정 참조
}>;
```

- token·provider usage는 서버 계측에서 획득하고, 구매 비용 및 실시간 환율은 가격표/청구서와 별도 검증한다.
- 메트릭/로그에 사용자 문장, 기억 본문, 민감 출처, API 키, 요약 해시를 넣지 않는다.
- 비용은 실제 호출 수의 합, 지연은 **엔드투엔드 측정**으로 구한다. 병렬 분류의 시간이 합산되지 않는다고 비용도 한 호출로 세면 안 된다.
- 스트리밍 TTFT는 UI에 실제 대사를 공개할 권한이 없으면 가시 응답 지연의 대체 지표가 아니다.

## 5. 최적화 수단 — 호출 합치기만 보지 않음

1. **역할별 모델 선택:** Production은 이미 역할별 설정을 지원한다. 분류·해석·대사·리뷰에 같은 고비용 모델을 쓸 필요가 있는지 독립적으로 비교한다.
2. **프롬프트 캐싱:** Canon/Persona/Policy처럼 안정적인 prefix를 앞에, 권한 있는 턴별 내용과 이력은 뒤에 둔다. 사용자별 민감 데이터를 공용 캐시 키나 로그에 혼합하지 않는다.
3. **출력 토큰 최적화:** 한국어 대사는 자연스러움을 잃지 않는 범위에서 길이와 JSON 부가 출력의 불필요한 반복을 축소한다. Provider-enforced reasoning 포함 output ceiling을 검증한다.
4. **동시 실행:** 이미 구현된 두 Preflight 분류는 병렬. 결과 의존이 존재하는 Interpretation→Renderer→Reviewer를 검증 없이 병렬화하지 않는다.
5. **서버 결정형 작업:** 권한·분류의 일부 명확한 닫힌 규칙, 비용 한도, 출처검증, 법적/사주 권한은 가능한 한 기존 서버 코드가 결정. 자유형 의미 분류를 정규식이 완전히 대체한다고 가정하지 않는다.
6. **프롬프트 축약:** `baseline` vs `compact_v1`을 동일 캐릭터·보안 평가로 검증한다. 축약 자체가 이득/동등성 증거는 아니다.
7. **조건부 호출:** 독립 리뷰를 생략하는 사용자 응답 경로는 좁은 안전 근거와 별도 승격 조건이 없는 한 승인하지 않는다.

## C09 세연 고정 Persona + 상황별 Runtime Slice 단일 호출 후보 (추가 조사)

- 실제 최신 Authoring 원본 기준: Bible v0.2 `5fddbce24c5606d888b64ab3c8dbf3256b65e04d`, Runtime v0.1 `d6bc911021e30aa70fde133c4350513008a721e7`. 두 원본 모두 DRAFT이며 Production Canon으로 자동 승격하지 않는다.
- `packages/character-content/src/seyeon-authored-projection-v2.ts`의 선언된 원본 SHA가 현재 Bible/Runtime과 불일치하고 일부 undefined/fact 필드가 최신 Bible과 어긋난다. 실제 모델 Context에 붙이기 전에 Authoring Projection 정합성 해결 필요.
- `apps/api/src/seyeon-c09-persona-prompt-profile-shadow-v1.ts`에 **core / core_examples / core_focus** 세 가지 평가용 프로필을 실제 구성했다. 고정 성격 + 필요한 공개 Runtime 1~2개 Slice만 선택하며, 아직 모델 호출 또는 서버 경로 연결은 없다.
- 설계·섹션별 대응·비공개 경계·평가 기준: [세연 C09 단일 호출 Persona 구성 설계](character-memory-seyeon-c09-single-call-persona-composition-design-v1.md).
- 평가 전에는 '1회 호출로 충분하다'거나 'Runtime 요약이 성격·보안을 보존한다'고 주장할 수 없다.

## 6. 바로 이어갈 구현 순서 (설계 이후)

- **R0 (최우선):** 현재 5회 동기 경로의 실제 역할별 호출을 계측 항목에 매핑하고 A 기준선의 비용·지연 분모를 명확히 한다. 기존 Provider 메트릭 재사용, 별도 계측 프레임워크 중복 구현 금지.
- **R1:** 기존 Unified Preflight Shadow(B)와 기존 Fast Dialogue Shadow(C)의 서버 계약/Guard/범위 차이를 식별하고, 동일 테스트 case set에 올린다.
- **R2:** B+C를 연결한 D(총 3회) 연구용 Shadow를 **동일 브랜치**에 구현한다. 권한 있는 공개 무기억 첫 대화부터 시작하며, 실제 감지/공개권한을 넓히는 변경은 별도 근거가 쌓일 때만 한다.
- **R3:** 1회 F와 D를 비교 가능한 기록 포맷에 연결한다. F는 독립 의미 검토 미실행 상태를 그대로 표시한다.
- **R4:** 관계/기억/사주 공식 결과를 권한 내에서 사용하는 시나리오를 단계별 확대한다. 검증된 원본/Grant 경계와 보호 Renderer 계약이 준비되지 않으면 Memory 접근은 HOLD.
- **R5:** 오프라인 구조/권한/회귀 검증 후, **사용자 별도 승인 시에만** 실모델 반복 비교·블라인드 캐릭터 평가·보안 공격 내성·실제 비용/지연 측정을 실시한다.
- **R6:** 데이터로 최종 구조와 조건부 라우팅 규칙을 결정한다. Production 변경은 별도 승인·검증 이후.

**지금 당장 다음 구현 단위:** R0 → R1 → R2. 이미 있는 Shadow/Provider/Cost Ledger를 활용하며, Fact Slot 추상화나 반복 권한 증명을 최적화의 선행 목적 자체로 만들지 않는다.

## 7. 출처 및 근거 성격

**내부 기준:** 명하 Character System Architecture C1, Usecase re-reviewed v2, Character↔Saju Rendering Architecture v1.1, UX Reading/Reader Knowledge v1.1, 현재 PR #2575 코드, Production runtime 및 관련 Shadow 코드. Character Persona는 말투 설명이 아니라 행동 규칙이고, LLM은 권한 없이 사실·관계·사주 의미를 만들지 않는 Character Renderer다.

**외부 일반적 설계 참고(명하 성능 결과 아님):**
- OpenAI Latency Optimization: https://developers.openai.com/api/docs/guides/latency-optimization
- OpenAI Prompt Caching: https://developers.openai.com/api/docs/guides/prompt-caching
- OpenAI Cost Optimization: https://developers.openai.com/api/docs/guides/cost-optimization
- OpenAI Evaluation Best Practices: https://developers.openai.com/api/docs/guides/evaluation-best-practices
- OWASP LLM Top 10: https://genai.owasp.org/llm-top-10/

**현재 판정:** 구조 조사는 시작했고 우선 후보 D를 설계 가설로 설정했지만, **최적 구조 선정·품질 검증·성격 보존·보안 동등성·10원/5초 실측은 모두 미완료**다.
