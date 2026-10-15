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
| **COST-03** | 세연다운 자연스러움 검증: 10·20·30턴 공개·무개인출처 다중 턴, 첫 인사/상대 속도/의견 충돌/관계 허위 주장/반복 | [COST-03 설계·중단 조건](character-memory-seyeon-cost-c03-multiturn-voice-2026-10-15.md) · 60턴 합성 고정 입력, 5회/3회 X/Y 블라인드 패킷, 평가자 2명×2경로×60턴=240셀, 7개 차원/하드위반 기준/중복·누락 HOLD; 실제 응답·인간평가·비열등성 **미측정** | **PARTIAL: 무과금 평가 체계 후보 구현 / 실모델·Canon Authority 드리프트·인간평가 HOLD** |
| **COST-04** | 토큰/실패·추정 비용 최적화: 프롬프트 입력·캐시·추론·출력 상한 및 각 모델 실패/재시도·후속 추출/Token Count | [COST-04 무과금 계측·Authority 정합성](character-memory-seyeon-authority-reconciliation-cost-c04-offline-v1.md): 5/3단계의 합성 호출별 역사적 단가/Cache/Reasoning/Output/실패/재시도/Unknown Ledger 구현. 실제 Tokenizer 사용량·캐시 Hit·실청구·최적 Prompt/Cap **미측정** | **PARTIAL / 합성 종료·재시도·입력 상한 회귀 보강, Provider 실비 HOLD** |
| **COST-05** | 비용 사고 재개 조건 검토: 예산 정책·모델/토큰 공식 단가·Provider 사용량 불명 보수 정산·kill switch·Provider outcome durability·별도 DB 로그인·운영 #1887 | [4-cell 무과금 비용 상한 입력 감사](character-memory-seyeon-cost-c05-offline-restart-preflight-v1.md) 구현. 실제 공식 단가/Provider Cap/예산·영수증/DB/Owner 승인 별도 PR, 없으면 HOLD | **PARTIAL: 무과금 조건부 상한 및 예산·실패 예약 모의 검증 / 유료 평가 BLOCKED** |
| **COST-06** | 승인 후에만 16건/다중 턴/4-cell A(5/V1) B(5/V2) C(3/V1) D(3/V2) 유료 평가 설계 검토 및 수행 | 동일 입력/모델 snapshot/요금표, 재시도 0, 개별·총액 상한, 실제 비용·P50/P95·승인율·보안/자연스러움 비열등성, 정확한 실행 URL | **BLOCKED: COST-05** |
| **COST-07** | 5→3 경로 최종 선택 후 명시적 Stage/Canary·롤백 계획 작성 | 사용자 응답의 무단 권한 침해 0, 품질·비용 비열등성, 운영 Owner 승인·정확한 SHA/배포/비용 관측 | **BLOCKED: COST-02~06** |

**COST-03/Authority 진척·차단:** TEST-only 후보의 사실 채택, 캐릭터 지식, 공개 등급, 원본 섹션 차이를 별도 플래그·집계로 나눠 Owner 검토에서 누락/등급 변화를 독립 판단하도록 보강했다. 새 키는 권한 미승인으로 유지한다.  현행 Bible v0.2의 Fact Appendix **59개 중 58개**를 `test/support/seyeon-authority-reconciliation-candidate-v1.ts`에서 **비운영 심사용 Registry**로 표현하고, `relationship.dynamic_self_claims` 1개는 RUNTIME_DEPENDENT/DYNAMIC으로 분리했다. 운영 Registry 기존 14건, Projection/Runtime SHA 오염을 자동 탐지하지만 **본래 운영 Authority와 공개 등급은 수정하지 않았다**. Character/DB Owner가 소스 해시·Canon/Disclosure·ACL 차이를 승인하기 전 실제 Character 비교·3회 Production 승격 금지. 보수적 이중 분류 불일치 HOLD 후보는 결과가 일치해도 권한 승인하지 않는다. [C03 근거](character-memory-seyeon-cost-c03-multiturn-voice-2026-10-15.md) · [정합성 후보/C04 Ledger](character-memory-seyeon-authority-reconciliation-cost-c04-offline-v1.md).

**COST-01 정적 검증 기준:** [CI #38669315810](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38669315810) · [Governance #38669315492](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38669315492) · [Web #38669315625](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38669315625) 모두 성공. 구조 평가 7개 단위 테스트와 300건 변형 라우팅 검사 통과. 이 결과는 2회 모델 실행·300건 모델 분류·캐릭터 품질·유료 비용 검증이 **아니며**, COST-02~07은 그대로 OPEN/HOLD. 문서 갱신 후 최종 HEAD의 CI 결과는 별도 확인.

**2026-10-15 무과금 회계 보강:** C04 완료 경로의 최종 성공, 성공 뒤 재시도 거부, 사용량>검증 상한 거부, 중단 경로 총액 UNKNOWN, 2회 가설 경로 제외, 정수 정밀도 회귀를 추가했다. C05의 보호된 유료 workflow 잠금에 회귀 테스트를 추가했다. 실제 API/청구/캐릭터 품질은 미측정·승인 HOLD.

**COST-05 추가 준비 (2026-10-15):** [64/256회 모의 예산·실패 선예약 검증](character-memory-seyeon-cost-c05-offline-restart-preflight-v1.md)을 추가했다. 합성 유료 요청 수 0, 실제 실청구 검증 미실행. 향후 승인되는 유료 시험 전용 Secret은 `OPENAI_API_KEY2`를 사용하도록 지정되었지만 기존 보호 워크플로의 잠금/Secret은 변경하지 않았으며 자동 대체 사용을 허가하지 않는다.\n\n**COST-04 최신 실측 (합성 UTF-8 bytes, API 0회):** [CI #38700776258](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38700776258) character-memory PASS에서 동일 공개 첫 인사: 기존 분류 2회 3,721B / 통합 분류 1회 4,316B (**+595B, +16.0%**). 이모지 인사: 3,747B / 4,329B (**+582B, +15.5%**). 후보 instructions 3,163B가 기존 두 지시문 950B+1,254B보다 큼. 동일 모델 단가·실토큰·실청구가 아니므로 금액 효과 미확정. 새 지시문 축약/승격은 분류 누락·보안 품질의 실제 검증 전 금지.\n\n**COST-04 전송량 감사:** [첫 인사 preflight 2회→1회 무과금 직렬화 측정](character-memory-seyeon-cost-c04-preflight-request-bytes-offline-v1.md)을 추가했다. 동일 공개 합성 문장에 대해 실제 Provider가 최종 구성한 UTF-8 JSON 요청 크기를 비교하며 실모델 호출/실토큰/실비 측정은 0/UNKNOWN. 5회→3회 전체 품질 또는 비용 절감 증거가 아니다.\n\n**COST-04 축약 후보 (승격 금지):** [통합 사전 분류 Compact 무과금 300건 검증](character-memory-seyeon-cost-c04-compact-preflight-offline-v1.md)은 Provider가 생성하는 JSON Schema·untrusted-input boundary·동일 payload을 보존하면서 시험 전용 wrapper로 축약 지시문을 비교한다. 모델 출력을 합성 Oracle로 고정했으므로 실제 Recall/FP·품질·실비 절감 검증 아님. Production 지시문 및 Workflow 잠금 불변.\n\n**COST-02/04 후보 평가 채점:** [300건×기존/축약의 600행 오프라인 이중 채점](character-memory-seyeon-cost-c04-compact-preflight-offline-v1.md)에 누락·재시도 오류·비인가 사실 분류·민감 질문 미탐지·정상 질문 과민탐지·요청량 감소 실패를 별도 차단한다. 모든 분류 결과는 리뷰 입력값이며 실제 모델 예측 증거가 없으면 비용/품질/운영 PASS 불가.\n\n**COST-02/04 과도한 주장 오분류 차단:** 300건 Gold의 `requiredKind`가 다른 추가 주장까지 승인한다는 뜻이 아니므로, 비허용/미라벨 주장 결과는 `unreviewedClaimIds`로 기록해 별도 Owner 라벨 확인 전 HOLD한다. 주장 배열 순서 차이는 오탐 불일치에서 제외한다. [오프라인 평가 근거](character-memory-seyeon-cost-c04-compact-preflight-offline-v1.md).\n\n**COST-05 비용 상한 계산 수정:** 공식 API 모델 요금의 **캐시 쓰기 단가가 일반 입력보다 높을 수 있어** `cacheWriteMicroUsdPerMillion`을 필수 입력으로 추가했다. 계산에는 입력/캐시 읽기/캐시 쓰기 최댓값을 사용하고, 272,000 입력 토큰 초과 단계는 장문 할증 미지원으로 거부한다. [검토 근거](character-memory-seyeon-cost-c05-offline-restart-preflight-v1.md). 합성 비용 값은 실제 청구/허가가 아니다.\n\n**효율 개선의 정의**: 정상 응답 기준 호출 수 감소만이 아니라 전체 실패·재시도·거절·후속 정산 비용을 포함한 **동일 품질/권한 조건하 실제 턴당 비용 감소**를 증명해야 한다. 비교된 평가에서 지연 P50은 이미 기존보다 99ms 느리므로 “전 항목 성능 개선”으로 보고하지 않는다. 기준/비열등성 여유 범위와 최저 절감률은 평가 전에 Owner가 명시한다.

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
  test/seyeon-cost-c02-authority-and-review-offline-v1.test.ts \
  test/seyeon-cost-c03-multiturn-blind-offline-v1.test.mjs \
  test/seyeon-cost-c03-character-source-parity-v1.test.ts \
  test/seyeon-authority-reconciliation-candidate-v1.test.ts \
  test/seyeon-cost-c04-offline-stage-ledger-v1.test.mjs \
  test/seyeon-cost-c04-preflight-request-bytes-offline-v1.test.ts \\
  test/seyeon-cost-c04-preflight-compact-offline-v1.test.ts \\
  test/seyeon-cost-c04-pairwise-quality-review-v1.test.mjs \\
  test/seyeon-cost-c05-paid-eval-lock-offline-v1.test.mjs \\
  test/seyeon-cost-c05-offline-restart-preflight-v1.test.mjs \\
  test/seyeon-cost-c05-offline-pilot-quota-v1.test.mjs
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
3. **[COST-03 무과금 평가 체계 후보 구현 / NEXT 원본 Authority 정합성 및 실제 품질]**: 10·20·30턴 총 60개 수작업 공개 시나리오와 블라인드 두 평가자 240셀 채점 구조를 만들었다. 현재 세연 Bible v0.2 Author Register의 여러 CANON 필드와 서버 `seyeon-fact-authority-v1.ts`의 `AUTHOR_UNDEFINED` 및 오래된 Projection/Runtime SHA가 충돌한다. Author/Character/DB Owner 승인 없이 자동 동기화하지 않는다. 실제 답변 생성·모델 오류율·인간 자연스러움 평가는 **NOT_RUN/HOLD**. [상세](character-memory-seyeon-cost-c03-multiturn-voice-2026-10-15.md).
4. **[COST-04 정적 회계 및 종료 불변식 보강 / NEXT 실제 토큰 측정 승인 준비]**: `scripts/seyeon-cost-c04-offline-stage-ledger-v1.mjs`로 5/3단계 Stage별 모델/용도/실패·재시도·미정 사용량 및 Input/Cache/Output/Reasoning, Trusted Upper Bound·Output Cap 부재를 수치상 구분했다. 실제 API·Tokenizer·Provider 캐시 적중/요금표/실청구는 **NOT RUN**; Output Cap 자동 변경, 모델 호출, 불완전 원가로 최적 구조 확정 금지. Character Authority 정합성은 TEST-only 후보 상태. [근거](character-memory-seyeon-authority-reconciliation-cost-c04-offline-v1.md).
5. **COST-05 4-cell 비용 상한 후보 추가 / 차단 해소 요청**: [독립 무과금 상한 계산](character-memory-seyeon-cost-c05-offline-restart-preflight-v1.md)에서 4케이스 64호출/16케이스 256호출, 모델별 현행 공식 단가 미확인, 별도 Token Count·후속 작업 비용 미포함을 명시한다. 기존 128호출/$3 또는 400호출/$1.50 추정치를 총액 보증으로 사용하지 않는다.  비용 사고·예산/kill switch·정산 영수증·G0 및 #1887 의존성을 증거화해 승인 전 유료 워크플로를 절대 재개하지 않는다.
5. P0 평가가 종료 조건에 미달하면 **HOLD를 숨기지 않는다**. 이전 작업은 P1에서 재개하되 비용 최적화를 “완료”로 보고하지 않는다.

**완료 보고 템플릿:** `대상 / 기준 브랜치·정확한 SHA / 변경 파일 / 실측 또는 무과금 검증 / PASS·FAIL·HOLD / 남은 게이트 / 다음 명령`. `CI green`만으로 비용 최적화 Done 금지.
