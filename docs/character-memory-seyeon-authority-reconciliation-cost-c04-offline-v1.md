# 세연 비용 최적화 P0 — Character Authority 정합성 후보 / COST-04 무과금 계측

> Watchtower-Track: character-memory  
> 작성 기준: 2026-10-15 (KST), Draft PR #1985 `feat/seyeon-offline-granted-turn-consent-gates-v1`  
> **결론: 비운영 정합성 후보 및 COST-04 무과금 계산·테스트만 구현. 실제 캐릭터 품질, 캐싱 효과, 새 운영 Canon과 비용 절감은 NOT VERIFIED / HOLD.**

## A. Character Bible ↔ 서버 Authority 정합성

### 원본 대조 근거
- 최상위 인간 작성 초안: `docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md` 현재 Git Blob **`663bf8cf5e83272b2bfeb3a45d63d2b4aed04d74`**.
- Runtime 원문 초안: `docs/character/SEYEON_CHARACTER_RUNTIME_DRAFT_V0_1.md` 현재 Git Blob **`d6bc911021e30aa70fde133c4350513008a721e7`**.
- `packages/character-content/src/seyeon-authored-projection-v2.ts`이 선언하는 **옛** Bible `2ecccbf4...`, Runtime `84c2f800...`은 위 현재 Blob과 다름. `seyeon-fact-authority-v1.ts` 역시 오래된 Bible SHA를 지칭.
- Bible 마지막 `FACT AUTHORITY & BIOGRAPHY CLOSURE APPENDIX`: **59개 fact_key 행**. 이 중 **58개는 현행 레지스트리 enum으로 표현 가능**, **1개 `relationship.dynamic_self_claims`는 `RUNTIME_DEPENDENT/DYNAMIC`으로 별도 권한 판단**이 필요하다.
- 현행 `SEYEON_FACT_AUTHORITY_REGISTRY_V1`: **14개 항목**. Bible에는 추가 채택 사실이 다수 있다. 기존 14개 중 일부도 `AUTHOR_UNDEFINED`인데 최신 Bible은 `CANON/KNOWN`.

### 구현
- `test/support/seyeon-authority-reconciliation-candidate-v1.ts`: 서버/운영 코드가 import하지 않는 **테스트·Owner 심사용 후보**. 현재 Bible Appendix를 엄격히 파싱하고 원문 상태, 출처 섹션, disclosure tier를 그대로 유지. 실제 현재 SHA를 계산하여 기존 Projection 및 Registry의 mismatch와 항목별 `ALIGNED / CHANGED_AUTHORITY_OR_DISCLOSURE / MISSING_IN_SERVER_REGISTRY` 목록 생성.
- `relationship.dynamic_self_claims`는 **공통 Fact Registry로 강제 변환 불가**, 후보에서 제외하고 Event Ledger·Relationship Projection·Current Scene 의존성을 명시. 원본 값은 심사용으로만 유지하며 가짜 사용자 연애관계 확정 불가.
- `test/seyeon-authority-reconciliation-candidate-v1.test.ts`: 후보 검증, Birthday / 현재 직업 / 가족 / 과거연애 / 중요한 사건의 원문 등급과 공개 깊이 보존, 실제 서버 레지스트리 변경 없음, 원문 누락/변형 거부.
- 기존 `test/seyeon-cost-c03-character-source-parity-v1.test.ts`가 추적하는 실제 drift를 덮어쓰거나 테스트를 삭제하지 않는다.

### 주요 판단 사례
| 사실 키 | 현재 Bible 초안 | 서버 Runtime 기존 레지스트리 | 안전한 후보 |
|---|---|---|---|
| `life.occupation_or_social_role` | CANON / KNOWN / PUBLIC | AUTHOR_UNDEFINED | 심사용 CANON/PUBLIC 행 생성. **운영 미적용** |
| `identity.birthday` | CANON / KNOWN / CONTEXTUAL | AUTHOR_UNDEFINED | CONTEXTUAL을 PUBLIC으로 올리지 않음 |
| `family.structure`, `family.current_relationship` | CANON / KNOWN / CONTEXTUAL | AUTHOR_UNDEFINED | 공개 시 장면·관계·현재 승인 필요 |
| `past_romance.existence` | CANON / KNOWN / FAMILIAR | AUTHOR_UNDEFINED | 사실 채택과 첫 대화 공개는 별개 |
| `backstory.major_turning_points` | CANON / KNOWN / ATTACHED | AUTHOR_UNDEFINED | 깊은 개인 내용은 즉시 전송 불가 |
| `identity.birth_year` | AUTHOR_UNDEFINED | 등록 없음 | 미정 유지; 연도를 임의 추론하지 않음 |
| `relationship.dynamic_self_claims` | RUNTIME_DEPENDENT / DYNAMIC | 없음 | 공통 Fact Registry 변환 금지 |

**미해결 승인 블로커:** Character Bible은 여전히 `DRAFT / NOT PRODUCTION AUTHORITY`이고, 나머지 World/C1/Release Gate·원본 Grant/Disclosure Source Permission·현재 원격 DB/DR #1887의 검증이 필요하다. **운영 `SEYEON_FACT_AUTHORITY_REGISTRY_V1`, Projection, Character Provider, DB/ACL, 공개 모델 프롬프트를 변경하지 않았다.** 실제 운영 Authority로 채택하거나 옛 필드를 덮어쓰는 작업은 별도 Owner/Character/Security 승인 및 정확한 원본 SHA 검토 후 진행.

## B. COST-04 API 비용 구조 정적 감사

### 실제 Provider와 관련 정책의 확인 사항

1. `apps/api/src/openai-seyeon-structured-provider-v1.ts`: Responses API body는 **static instructions + security boundary + user input JSON + strict response JSON schema + optional max_output_tokens**를 포함한다. `store: false`이며 요청 본문 길이는 바이트로 계측된다. 바이트 수 **≠** Tokenizer가 검증한 입력 토큰 수.
2. `maxOutputTokens`는 **선택 사항**. Output Cap가 없는 모델 호출에 확정적인 최대 출력 비용을 붙여서는 안 된다.
3. `apps/api/src/seyeon-cost-governor-server-policy-v1.ts`: 실제 운영 Budget Admission에는 신뢰된 Provider 호환 입력 토큰 상한과 강제된 출력 상한이 필수. 캐시 할인이 미래 Admission 예산 상한을 낮춘다는 가정 금지.
4. `apps/api/src/seyeon-ai-usage-cost-v1.ts`: `cachedInputTokens`는 입력의 부분집합이고 `reasoningTokens`는 출력의 부분집합. 알 수 없는 사용량·단가에서는 `unknown` 처리. 실제 Invoice와 별개.
5. `scripts/seyeon-dialogue-path-eval-core-v1.mjs`의 Luna/Terra 요금표는 **기존 실험에 고정된 역사적 추정 요금**이다. 현행 Provider 공식 단가·할인·현금 청구서와 같다는 근거가 없다.

### 신규 무과금 단계별 Ledger

- `scripts/seyeon-cost-c04-offline-stage-ledger-v1.mjs`: 코드상 기준 `legacy_5` / 후보 `fixed_3`의 Purpose+Model에 맞는 **합성 각 단계·각 재시도**만 수용. 단계 누락/모델 오인/토큰 음수·소수/캐시 초과/추론 초과/중복 Call ID를 거부한다.
- 캐시된 입력은 입력 총량 안에서 분리해 역사적 요금으로 계산하고, 추론 토큰은 출력 총량과 **중복 과금하지 않는다**.
- 실패·타임아웃 재시도도 각각 따로 계산. 사용량이 확인되지 않은 외부 모델 시도는 0원 처리하지 않고 **전체 추정 비용 `null`**을 반환. 알려진 부분 비용만 별도로 표시.
- `verifiedInputTokenUpperBound` 혹은 `enforcedOutputTokenLimit`이 없으면 **Maximum Admission Ceiling `null`**. Ceiling은 캐시 할인 없이 계산하는 보수 추정값으로 Provider 자체 강제·실청구 보장이 아니다.
- 후속 사건 추출(Post-turn Event Extraction) 또는 입력 토큰 Count가 `UNKNOWN`이라면 전체 턴 예상비용도 `null`. 호출 5회/3회만을 전체 세션 비용이라고 주장 금지.
- 단가가 역사적 추정이고 Source/Label을 호출자가 위조할 수 있으므로 반환 객체는 항상 `liveRateVerified=false`, `providerInvoiceReconciled=false`, `cacheSavingsProven=false`, `personaQualityVerified=false`, `productionPromotionAllowed=false`.
- `test/seyeon-cost-c04-offline-stage-ledger-v1.test.mjs`: 캐시 절감 추정과 실제 Budget Ceiling 분리, Retry/Fallback, reasoning double count 방지, Unknown 비용, Provider optional output cap, 무권한 모델/단계 입력 거부. 네트워크/유료 모델 호출 없음.

### 2026-10-15 후속 무과금 Ledger 경계 보강

- COMPLETE는 모든 단계의 마지막 시도가 성공해야 한다. 실패로 끝난 실행은 가격 데이터가 있어도 성공 턴 총액으로 인정하지 않는다.
- 성공 후 재시도, 관측 입력 토큰이 검증 상한을 넘는 기록, 누적 토큰 안전 정수 초과를 거부한다.
- ABORTED에서는 알고 있는 비용만 knownPortionMicroUsd로 보존하고 전체 턴 총액과 전체 Admission Ceiling은 null로 유지한다.
- proposed_2는 실행 불가능한 설계 가설이며 Ledger의 실제 호출 경로로 허용하지 않는다.
- COST-05 별도 테스트는 보호된 유료 workflow 둘의 compare 작업이 여전히 false로 잠겨 있는지 검증한다.
- 여전히 synthetic/offline ONLY. Provider 영수증/청구·모델 품질·현행 단가·운영 Kill Switch·Production 승격을 입증하지 않는다.

### 실제 비용 절감을 확정하지 못하는 이유

- 정적 Byte/코드 분석으로는 캐시 히트 여부와 실제 입력/추론 토큰을 알 수 없다. **Static Prefix가 반복된다는 사실만으로 캐시 성공이 아니다.** 캐시는 Provider usage의 cached input과 당시 정책/모델을 기록해야 한다.
- 대사 생성 경로가 5→3회로 줄어도 단계별 출력이 커지거나 통합 Draft 거절률/재시도가 늘면 비용 절감률이 달라진다. 품질 비열등성이 먼저다.
- Output Cap를 무작정 낮추면 Schema JSON이 잘리거나 Semantic Reviewer의 판단에 실패할 수 있다. 단순 Cap 숫자 조정을 운영 디폴트에 반영하지 않는다.
- 같은 메시지를 대상으로 독립 분류기를 추가 호출하면 안전성 후보는 생겨도 비용 목표가 달라진다. 고위험 fallback 분기 비율과 분류 누락/과잉 HOLD를 같이 계측해야 한다.
- 최초 8건 $0.186241→$0.145591 (약 21.8% 적은 과거 추정 비용)은 그대로 **제한된 실측**일 뿐, 본 무과금 테스트가 추가 절감률을 입증한 것은 아니다.

## C. 진행·중단 기준 및 다음 작업

| 단계 | 상태 | 해소 필요 |
|---|---|---|
| Character 초안→후보 Ledger 정합성 | **후보 구현 / 기존 Production HOLD** | Bible/Runtime의 원본 SHA와 Canon Disclosure를 Author/Character/DB Owner가 별도 승인. Dynamic Relationship은 별도 Projection |
| COST-04 구조적 stage 가격·상한·Unknown 검증 | **무과금 코드·테스트 후보 구현** | 현재 계약요금/실 Provider Token Usage/캐시·추론/실제 Output Limit·Post-turn 포함 누락 없는 계측 |
| COST-03 실제 10~30턴 세연다운 답변 | **미측정** | Character Authority drift 해소 후 승인된 모델 실측, 블라인드 사람 평가 240 셀 |
| 유료 실모델 평가 | **BLOCKED** | #1816 비용 사고 조사·최대 예산/kill switch·별도 Owner 재개 승인 |
| 운영 모델/DB/PR 병합 | **HOLD** | #1887 운영 DR/Schema 등 포함 보안·운영 승인 |

**비용 발생 전 보고 규칙:** 유료 Provider 요청·모델 Token Count 유료 호출·유료 샌드박스 또는 재평가 잠금 해제 전에 **예상 호출수/단가/총 상한/실패 시 중단 조건을 보고하고 명시적 승인 후 실행**한다. 본 작업의 사용자에게 청구되는 외부 모델 API 요청은 **0건**이다.
