# 명하 개발 로드맵 — 작업 우선순위 및 완료 판정

> Watchtower-Track: character-memory  
> 갱신: 2026-10-15 (Asia/Seoul)  
> 저장소: `gycha0109-beep/MyeongHa`  
> 작성 기준: Draft PR [#1985](https://github.com/gycha0109-beep/MyeongHa/pull/1985) / 작업 브랜치 `feat/seyeon-offline-granted-turn-consent-gates-v1`  
> **최우선 미완료 작업: 세연 AI 추론 비용 최적화 (P0). 보안·기억 R5 테스트 통과는 비용 최적화 종료가 아니다.**

## 0. 이 문서의 상태 정의와 진행 규칙

- **IMPLEMENTED (후보 구현)**: 코드·mock/격리 DB 검증 있음. Production 적용/제품 완료가 아님.
- **MEASURED (실측 일부)**: 명시된 조건·표본에서 비용/시간을 측정함. 다른 세션·가격·모델의 일반화 불가.
- **HOLD / BLOCKED**: 합격 조건 미충족 또는 안전/비용/DB/Owner 승인 미완료. 다음 축으로 넘어가며 완료 처리 금지.
- **DONE**: 본 문서의 종료 조건과 필요한 승인·검증 근거(정확한 SHA, 실행 URL, 로그, 실측치)가 모두 기록됨.
- 매 작업 보고에 **완료 / 미완료 / 다음 실행 / 명시적 블로커**를 분리한다. CI SUCCESS만으로 비용/품질/운영 승격을 선언하지 않는다.
- 2026-10-15 COST-01 구현은 **실행 불가능한 무과금 5/3/2 구조 비교 스크립트·300건 합성 변형 라우팅 테스트**와 근거 문서를 추가했다. 실제 2회 인증/유료 비교/Production 경로를 열지 않는다.

## 1. P0 — 세연 대화 AI 비용 최적화: 최우선 복귀, 현재 HOLD

### 1.1 목표와 기존 경로

**목표:** 세연 캐릭터 품질·기억/권한 안전성·대화 응답성을 떨어뜨리지 않으면서 **턴당 유료 모델 호출 횟수, 입력/캐시/출력/추론 토큰, 실청구비**를 줄이는 것. 비용 제한·정산은 비용 절감과 별개의 안전장치이며 둘 다 필요하다.

| 항목 | 기존 경로 | 최적화 후보 | 검증 상태 |
|---|---|---|---|
| 사전 분류 | Terra Integrity + Terra Disclosure, 병렬 2회 | Luna 통합 Preflight 1회 | 후보 Shadow / 합성·제한적 실측 |
| 의미 해석 + 대사 작성 | Terra Interpreter 1회 + Renderer 1회 | Terra Interpretation+Draft 통합 1회 | 제한된 첫 만남/공개 대화만 |
| 독립 의미 검증 | Terra Semantic Review 1회 | Terra Semantic Review 1회 유지 | 생략 금지 |
| 정상 성공 시 API 호출 | **5회** | **3회** | 목표 구조, 운영 미적용 |
| Production 라우팅 | 기존 5회 실행 경로 | Shadow `SHADOW_ONLY_NOT_PRODUCTION` | **후보 기본 활성화 금지** |

관련 코드:
- `apps/api/src/seyeon-unified-preflight-shadow-v1.ts` 및 `apps/api/src/seyeon-unified-governance-candidate-v1.ts` (실제 존재/정확한 호출 관계는 수정 시 다시 확인)
- `apps/api/src/seyeon-fast-dialogue-shadow-v1.ts`, `apps/api/src/seyeon-character-runtime-v2.ts`
- `test/seyeon-fast-dialogue-shadow-v1.test.ts`, `test/seyeon-unified-governance-candidate-v1.test.ts`
- 비교기: `scripts/run-seyeon-dialogue-path-real-api-eval-v1.mjs`, `scripts/seyeon-dialogue-path-eval-core-v1.mjs`
- 상세 실측: [세연 기존 5회 vs 후보 3회 평가](character-memory-seyeon-real-api-path-eval-v1.md) / [후보 제약](character-memory-seyeon-fast-path-candidate-2026-10-09.md).

### 1.2 이미 확인된 제한적 실측 (운영 효과 확정 아님)

**2026-10-09, 공개 합성 첫 만남 8건, v2 기준** (출처: `docs/character-memory-seyeon-real-api-path-eval-v1.md`, [Actions #37820807931](https://github.com/gycha0109-beep/MyeongHa/actions/runs/37820807931)):

| 지표 | 기존 5회 | 후보 3회 |
|---|---:|---:|
| 자동 가드 승인 | 7/8 | 8/8 |
| 추정 비용 합계(표본 8건) | $0.186241 | $0.145591 |
| 비용 차이 | 기준 | **-$0.040650 / 약 21.8%** |
| P50 응답시간 | 11,080ms | 11,179ms |
| P95 응답시간 | 16,468ms | 15,565ms |

**판정: MEASURED/PARTIAL, NOT DONE.** 전체 동일 합격 조건 중 기존 7/8로 HOLD. 단일 소표본, 서로 다른 Luna/Terra 모델 배치, 제한된 공개 첫 만남이며 다중 턴·관계·장기 기억·인젝션·캐릭터 자연스러움의 품질 보증이 아니다. 가격은 저장소 정의 단가에 근거한 **추정값**으로 실제 청구액과 다를 수 있다.

**v3 16건 확장 계획 존재**: `scripts/seyeon-dialogue-path-eval-core-v1.mjs`에 N01–N10 중 해당 8건 + N19/N22 + X01–X06의 합성 16건, 최대 128회/$3 추정 제한, 재시도 0이 구현되어 있다. **현행 문서에서 v3 실제 실행 결과/품질 승인 증거는 확인되지 않았으므로 UNKNOWN/HOLD.** 계획 작성만으로 16/16 PASS나 비용 절감을 주장하지 않는다.

### 1.3 P0-안전 블로커: 유료 모델 평가 비용 사고

- `.github/workflows/seyeon-dialogue-path-real-api-eval-v1.yml` 및 `.github/workflows/seyeon-model-eval-v1.yml`의 `compare` job에는 **`if: ${{ false }}` 비용 사고 HOLD**가 있다. push, `workflow_dispatch` 모두 실제 유료 모델 평가를 실행하지 않는다.
- [보안/비용 평가 사고 문서](SEYEON_SECURITY_BOUNDARY_EVAL_COST_HOLD_AND_NEGATIVES_V1.md) 및 [#1816](https://github.com/gycha0109-beep/MyeongHa/issues/1816)에 따르면 **별도 비용 사고 원인 조사·실예산/호출/원가 상한·kill switch·Owner 승인 PR**이 선행돼야 한다.
- **중단 규칙:** 승인 없이 `if: false` 제거, 보호된 `OPENAI_API_KEY` 사용, 새 유료 평가 우회 워크플로, 무제한 모델 호출/재시도, 기본 모델 경로 스위치 금지.
- 따라서 다음 단계는 **무료/오프라인 코드·품질·원가 계산 검증부터** 진행한다. 승인 전 실모델 재측정은 BLOCKED.

### 1.4 P0 실제 작업 순서 (다음 실행은 여기서 시작)

| 순서 | 작업 | 완료 판정 | 상태 |
|---|---|---|---|
| **COST-01** | 현재 5회/3회 호출 그래프 + 조건부 2회/압축·캐시 3회 대안 및 잠금 점검 | [정적 구조 감사·실측/미측정 분리](character-memory-seyeon-cost-architecture-c01-c02-offline-2026-10-15.md), 5/3/2 실험 파일, 정확한 SHA CI 근거 | **STATIC AUDIT DONE (CI #38669315810); P0 전체 HOLD** |
| **COST-02** | 무료 회귀: 통합 분류 → 독립 권한 Resolver, 통합 Interpreter/Renderer → Semantic+Output Guard, 최소 300건(민감질문/허위 Memory 포함)에서 비인가 누락 0 | 기존 Gold 100개 + 새로 쓴 문장 200개 = **서로 다른 300개**의 기대 라벨을 Fake Provider로 실제 Preflight/Resolver에 주입하여 두 분류 경로를 비교. [실행/한계 상세](character-memory-seyeon-cost-c02-300-gold-preflight-audit-v1.md); 실제 모델의 분류 누락·오탐, 세연다움, 적응형 2회 안전성은 **미검증** | **PARTIAL / 무과금 통합 Guard 후보 구현, 실모델 검증 OPEN/HOLD** |
| **COST-03** | 세연다운 자연스러움 검증: 다중 턴 대화, 첫 인사/속도/상태/취향/관계 변화/반복, 실제 Memory 없이 가능한 공개 컨텍스트부터 | 고정된 블라인드 평가 rubric, 기준/후보 품질 비열등성 및 장기 일관성 결과; 실패 케이스 기록 | **OPEN** |
| **COST-04** | 토큰/실패·추정 비용 최적화: 프롬프트 중복·역할별 출력 상한·컨텍스트 크기·캐시/추론토큰; 품질/권한 게이트 유지 | 정확한 요청별 call count/input/cached/output/reasoning/실패·재시도·예상비용 계측 및 비교 증거 | **OPEN** |
| **COST-05** | 비용 사고 재개 조건 검토: 예산 정책·모델/토큰 공식 단가·Provider 사용량 불명 보수 정산·kill switch·Provider outcome durability·별도 DB 로그인·운영 #1887 | 비용/Security/Ops 승인된 **별도 PR**과 재개 범위/최대 예산/kill switch 문서, 없으면 HOLD | **BLOCKED: 승인 필요** |
| **COST-06** | 승인 후에만 16건/다중 턴/4-cell A(5/V1) B(5/V2) C(3/V1) D(3/V2) 유료 평가 설계 검토 및 수행 | 동일 입력/모델 snapshot/요금표, 재시도 0, 개별·총액 상한, 실제 비용·P50/P95·승인율·보안/자연스러움 비열등성, 정확한 실행 URL | **BLOCKED: COST-05** |
| **COST-07** | 5→3 경로 최종 선택 후 명시적 Stage/Canary·롤백 계획 작성 | 사용자 응답의 무단 권한 침해 0, 품질·비용 비열등성, 운영 Owner 승인·정확한 SHA/배포/비용 관측 | **BLOCKED: COST-02~06** |

**COST-01 정적 검증 기준:** [CI #38669315810](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38669315810) · [Governance #38669315492](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38669315492) · [Web #38669315625](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38669315625) 모두 성공. 구조 평가 7개 단위 테스트와 300건 변형 라우팅 검사 통과. 이 결과는 2회 모델 실행·300건 모델 분류·캐릭터 품질·유료 비용 검증이 **아니며**, COST-02~07은 그대로 OPEN/HOLD. 문서 갱신 후 최종 HEAD의 CI 결과는 별도 확인.

**효율 개선의 정의**: 정상 응답 기준 호출 수 감소만이 아니라 전체 실패·재시도·거절·후속 정산 비용을 포함한 **동일 품질/권한 조건하 실제 턴당 비용 감소**를 증명해야 한다. 비교된 평가에서 지연 P50은 이미 기존보다 99ms 느리므로 “전 항목 성능 개선”으로 보고하지 않는다. 기준/비열등성 여유 범위와 최저 절감률은 평가 전에 Owner가 명시한다.

**즉시 실행 가능한 무과금 검증 예시:**
```bash
npm ci --ignore-scripts --no-audit --no-fund
npx vitest run \
  test/seyeon-dialogue-path-eval-core-v1.test.mjs \
  test/seyeon-unified-governance-candidate-v1.test.ts \
  test/seyeon-fast-dialogue-shadow-v1.test.ts \
  test/seyeon-inference-efficiency-phase1.test.ts \
  test/seyeon-provider-output-budget-candidate-v1.test.ts \
  test/seyeon-cost-architecture-offline-v1.test.mjs \
  test/seyeon-cost-c02-authority-and-review-offline-v1.test.ts
```
위 명령은 유료 실측 결과를 생산하지 않는다. 오프라인 차단 확인/코드 기반 효과 점검용이다.

## 2. P0 병행 안전 레일 — AI 비용 Governor/정산 (최종 운영 전환 HOLD)

**현재 구현/검증 근거:**
- 서버 가격 정책·출력 제한·호출별 비용 예약/정산·사용량/캐시 계측/관측: `apps/api/src/seyeon-cost-governor-server-policy-v1.ts`, `apps/api/src/seyeon-ai-usage-cost-v1.ts`, 관련 테스트.
- OFF/ENFORCE 경계와 Chat 네 역할의 전용 `costRunner`, DB 독립 로그인·권한, 정산 경합 및 응답 손실/Crash 대응은 여러 D3/D4 문서와 격리 CI 후보로 구현됨. 근거: [D3 경로 분리](character-memory-seyeon-governor-04d3b2b3c-cost-runner-cutover-v1.md), [레거시 REVOKE HOLD](character-memory-seyeon-governor-04d3b2b3d1-legacy-revoke-hold-v1.md), [D4 ACK 손실](character-memory-seyeon-governor-04d4b10h-commit-reply-matrix-v1.md).
- 공식 OpenAI 입력 토큰 Count 포트는 [04D2](character-memory-seyeon-governor-04d2-openai-input-count-v1.md)에 **opt-in, 기본 미사용**으로 기록돼 있다. 호출 비용/지연과 모델별 실제 호환성 확인 전 강제 활성화 금지.
- Production **Governor 기본값 OFF**, 독립 실운영 LOGIN/secret 및 실권한 전환/Legacy REVOKE 미완료. `#1887` DB migration lineage/DR 차단이 유지된다.

**남은 안전 조치:** 비용 사고 원인/미정산 레코드/예산 한도 및 가격 갱신 정책/신뢰 가능한 Provider 영수증 durable capture/완전한 Cost Start→Settle–Replay/Worker 소유·전용 LOGIN/Legacy EXECUTE 회수/최종 Owner signoff. API 비용 제한의 “코드가 있다”와 “운영에서 강제된다”를 혼동하지 않는다.

## 3. P1 — 현재 진행했던 세연 기억·동의/답변 저장/조회 트랙 (별도 HOLD)

**코드/격리 테스트 구현 범위:**
- R1/R2: 원본 Memory+Grant/SourceSet 불변 Pin, 실 모델 요청 직전 SourceRef 결속, Zero/Positive 경합의 시험용 검증.
- G2 R3: 시험용 Owner 조건에서 **실제 v2→v1→core** Chat Commit, assistant 1건 + Chat/Post-turn Outbox 2건을 단일 PG 트랜잭션으로 저장. 철회·재발급·Outbox 실패는 전체 rollback.
- G1/G3 R4: 하나의 트랜잭션에서 Positive Pin+실제 `context_ready`; 현재 원본 Grant가 없으면 최초/재조회 HOLD.
- G3 R5: 시험 DB의 승인 History Page·커서형 Polling Stream·정확한 Attempt/Message에 묶인 HTTP Reveal 후보. 미승인 페이지 전체 HOLD, 비인가 원문/파생 payload 미반환.
- 마지막 검증 근거: [Draft PR #1985](https://github.com/gycha0109-beep/MyeongHa/pull/1985), [CI #38664763201](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38664763201) **SUCCESS** (17건 실 PostgreSQL R3~R5, 6건 API/Stream/History 경계). 운영 DB/migration/Live Character Route 변경 없음.

**미완료**: SQL 조회와 HTTP/실시간 전송 사이 동의 철회 race, 실제 SSE 토큰/캐시/Worker/Reader/History 우회 전면 봉쇄, Context/Provider Final Input lineage, positive SRC-25 승인, G0 D-01~D-10, #1887 DR/원격 스키마/보안 Owner 승인. 시험 통과는 운영 Positive-Memory 개방 근거가 아니다.

**작업 순서 복구**: 위 P0 비용 최적화를 먼저 끝내거나, 명시적인 비용 사고/승인 차단으로 계속 진행할 수 없는 상태임을 남긴 다음에만 P1 전송 직전 취소/캐시·SSE 경합 검증을 이어간다. P1에 진척이 생겨도 P0를 DONE으로 자동 승격하지 않는다.

## 4. 공통 배포/승인 게이트 (P0 / P1 모두 적용)

- 보존할 Production 불변식: **원본 개인정보 출처 0건 보호**, 기존 1640 Trigger, 승인되지 않은 Positive Source의 실패 차단; 테스트의 1640 Function 재정의/사설 schema를 운영 SQL로 복사 금지.
- **[#1887 Production migration/DR](https://github.com/gycha0109-beep/MyeongHa/issues/1887)**: 원격 `20261008090417` 이력 원인/복구·승인되지 않은 repair 금지; 운영 스키마와 실제 백업 복원 증거 확보 전 변경 금지.
- [#1816 보안·유료 평가](https://github.com/gycha0109-beep/MyeongHa/issues/1816): 보호된 유료 모델 평가 재개 및 보안 방어문 기본 전환 승인 없음.
- Production Governor `ENFORCE`, 공개 채팅/Memory, 실제 결제·AI Provider 호출, 모델 경로 스위치, PR 병합/배포는 개별 Owner 승인과 명확한 승인 문서/검증 기록을 필요로 한다.

## 5. 다음 작업자가 반드시 먼저 할 일 (단일 작업 큐)

1. **[COST-01 정적 감사 DONE / 2026-10-15]**: [5회/3회/2회 구조 재평가](character-memory-seyeon-cost-architecture-c01-c02-offline-2026-10-15.md), `scripts/seyeon-cost-architecture-offline-v1.mjs`, `test/seyeon-cost-architecture-offline-v1.test.mjs`를 정확한 HEAD CI로 검증한다. v3 실행 Artifact 증거는 없으면 `UNVERIFIED` 유지. **2회는 모델 실행 불가능한 설계 가설**이다.
2. **[COST-02 무과금 본검증 부분 구현 / NEXT 실모델 의미 분류]**: 100개 기존+200개 신규 수작업 시나리오 총 300개를 실제 서버 Guard로 연결했으나 **모델 출력은 골드로 결정된 합성 값**이다. 분류 false-negative → Owner 조회 미실행 및 false-positive → 불필요한 HOLD를 재현했다. 이 블로커가 해소되기 전 2회 최적화 또는 고정 3회 운영 전환 금지. 승인 전 유료 실모델 평가 금지. 별도의 모델 분류 누락/오탐·실제 캐릭터 품질 지표와 재발방지 설계 필요.
3. **COST-03~04**: 토큰 중복·호출 횟수·비용 계측과 품질 개선을 반복한다. 무과금 검증만 수행한다.
4. **COST-05 차단 해소 요청**: 비용 사고·예산/kill switch·정산 영수증·G0 및 #1887 의존성을 증거화해 승인 전 유료 워크플로를 절대 재개하지 않는다.
5. P0 평가가 종료 조건에 미달하면 **HOLD를 숨기지 않는다**. 이전 작업은 P1에서 재개하되 비용 최적화를 “완료”로 보고하지 않는다.

**완료 보고 템플릿:** `대상 / 기준 브랜치·정확한 SHA / 변경 파일 / 실측 또는 무과금 검증 / PASS·FAIL·HOLD / 남은 게이트 / 다음 명령`. `CI green`만으로 비용 최적화 Done 금지.
