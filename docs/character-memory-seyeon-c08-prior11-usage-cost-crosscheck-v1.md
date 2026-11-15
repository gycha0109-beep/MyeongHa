# C08 과거 11회 사용량·비용 교차 검사 (읽기 전용)

Watchtower-Track: character-memory

**상태: 오프라인 검증 완료 / 실계정 조회 미수행 / 개별 청구 정산 미완료 / 유료 모델 실행 금지**

## 목적과 대상

기존 장기기억 평가 C06 3회, F01 V2 2회, C07 6회가 실행된 **2026-10-16 UTC**의 공급자 데이터를 확인할 때, 비용 집계만 보고 과거 11회 결제가 확인되었다고 잘못 판단하지 않도록 하기 위한 검사입니다.

현재 확인된 원본 GitHub 실행: [#38845185681](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38845185681), [#38854937049](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38854937049), [#38859692050](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38859692050).

## 실제 구현

`scripts/seyeon-c08-prior11-usage-cost-crosscheck-v1.mjs`는 다음 **읽기 전용 요청 2건**을 순서대로 수행할 준비가 되어 있습니다.

1. `GET /v1/organization/costs`: 고정 UTC 하루, 별도로 확인된 과거 Project ID + Key ID의 비용을 조회합니다. 기존 `seyeon-c08-prior11-provider-cost-v1.mjs` 검사 결과가 `DAILY_AGGREGATE_ONLY`가 아니면 즉시 중단합니다.
2. `GET /v1/organization/usage/completions`: 같은 UTC 날짜의 **1시간 단위**, 같은 과거 Project ID + Key ID의 **전체 모델별 사용량**을 조회합니다. 모델 필터를 적용하지 않고, 모델별 집계에서 승인된 평가 모델 `gpt-5.6-luna` 외의 활동을 발견하면 HOLD합니다. **24개 시간 버킷 모두 존재하고 시간 순서가 정확해야** 하며, 사용량이 없는 시간대는 빈 버킷으로 허용합니다.

사용량 응답에서 프로젝트·키·모델 속성이 누락되거나 다르고, 시간 범위·버킷 구조·중복·다음 페이지·금액·수량이 불명확하거나, 집계 모델 요청 수가 **11이 아니면** HOLD입니다. API가 확인해 준 데이터라 해도 그 키에서 다른 작업이 호출했을 가능성은 배제할 수 없습니다.

**11건이 일치하는 경우에도** 결론은 `HISTORICAL_AGGREGATES_CORROBORATED_ONLY`이며 다음 값은 변경되지 않습니다.

- `independentRequestReceiptsVerified=false`
- `invoiceReconciled=false`
- `actualBilledKrw=null`
- `paidDispatchEnabled=false`
- `productionPromotionPermitted=false`

일별 비용에는 같은 키로 처리한 다른 모델·서비스의 청구 항목이 섞일 수 있습니다. 시간별 사용량 합계 역시 개별 요청의 원본 호출 ID, 지출 영수증, 최종 결제 금액·환율·세금을 증명하지 않습니다. 두 집계의 모델 범위가 완전히 같다는 보장도 없습니다.

## 실행과 보안 경계

프로젝트 소유자가 신뢰하는 로컬 환경에서, 기존 과거 비용 진단과 동일한 세 비공개 환경변수가 준비된 경우에만 다음 명령을 사용합니다.

`node scripts/seyeon-c08-prior11-usage-cost-crosscheck-v1.mjs`

필요한 변수: `OPENAI_ADMIN_KEY`, `SEYEON_C07_HISTORICAL_PROJECT_ID`, `SEYEON_C07_HISTORICAL_API_KEY_ID`. 마지막 값은 모델 API 비밀키 문자열이 아닌 키 **식별자**입니다.

새 평가 프로젝트의 키 ID를 과거 11회의 키로 임의 재사용하지 않습니다. 변수 누락 시 조회 없이 HOLD이며 API 키·프로젝트 ID·원본 HTTP 응답은 결과에 출력하지 않습니다. GitHub Actions 시크릿·Production 비밀정보를 연결하지 않으며 GET 이외의 요청, 추가 유료 호출, 자동 기억 저장, 실제 사용자 데이터 처리는 없습니다.

## 검증

`npx vitest run test/seyeon-c08-prior11-provider-cost-v1.test.mjs test/seyeon-c08-prior11-usage-cost-crosscheck-v1.test.mjs test/seyeon-c08-admin-spend-readiness-v1.test.mjs` — **30건 로컬 통과**. 모의 공급자 응답만 사용하며 실제 Admin GET 미실행.

공식 API: [Costs](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs), [Completions Usage](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/completions).

### 다음 필수 증거

과거에 사용한 실제 프로젝트·키 소속, 개별 11회 청구 ID와 공급자 결제/송장 기록, 실제 원화 환산 금액, 기존 키의 다른 지출 포함 여부, 새로운 평가 프로젝트의 실사용 승인·계정 하드캡·기존 11건 청구 정산·공동 내구 원장이 필요합니다.

기존 승인된 **추가 누적 5,000원 / 첫 실모델 평가 최대 6회** 제한 및 Draft PR #3068, 운영·자동 기억 저장 OFF 유지. `ROADMAP_IN_PROGRESS`.


2026-11-13 owner decision: the optional Admin spending GitHub workflow and its dedicated workflow test were removed, because they were not a merge requirement. The historical 30-test count included the now-retired workflow test. The updated command lists only existing tests. Existing read-only diagnostics and paid-dispatch holds are unchanged.
