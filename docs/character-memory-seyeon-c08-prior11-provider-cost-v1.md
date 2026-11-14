# C08 과거 11회 공급자 일별 비용 읽기 전용 조회 v1

> Watchtower-Track: character-memory  
> 상태: **과거 공급자 일별 집계 후보만 조회 가능 / 개별 11회 청구·송장 미대조 / 유료 실행 HOLD**

## 확인 대상

과거 C06 3회, F01 V2 2회, C07 6회, 총 11회의 실모델 평가 기록은 기존 C07 근거와 다음 GitHub Actions 실행으로 고정되어 있습니다.

- C06: [Actions #38845185681](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38845185681) · 2026-10-16 03:22 UTC (워크플로 결과 실패; 기존 누적 3회 기록 자체는 별도 보존)
- F01 V2: [Actions #38854937049](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38854937049) · 2026-10-16 05:16 UTC
- C07: [Actions #38859692050](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38859692050) · 2026-10-16 06:10 UTC

기존의 **11회 누적 사용량 추정 3,770 microUSD, 보수적 예약 36,047 microUSD**는 청구 증거가 아닙니다. 세 실행이 같은 UTC 날짜에 있더라도 그 날짜의 공급자 총액을 11회의 실제 확정 청구액으로 간주할 수 없습니다.

## 구현 범위

`scripts/seyeon-c08-prior11-provider-cost-v1.mjs`는 OpenAI 관리자 자격증명으로 다음 읽기 전용 요청 **1회만** 수행합니다.

`GET https://api.openai.com/v1/organization/costs`

- 시간: 2026-10-16 00:00:00 UTC 이상부터 2026-10-17 00:00:00 UTC 미만까지, 버킷 1일
- 필터: **과거 11회에 귀속되는 것으로 별도로 확인된** Project ID와 API Key ID
- 그룹화: `project_id`, `api_key_id` (공급자가 해당 조합을 거부하면 조회 실패로 HOLD)
- 결과: 고정 하루 버킷과 정확히 같은 Project/Key ID, USD 금액, 완전한 페이지일 때만 **일별 집계 후보**를 반환. 누락·커서·다른 프로젝트/키·통화·시간·HTTP 오류는 HOLD
- 모든 결과에서 API 키 문자열, 프로젝트 ID, 키 ID, 원본 공급자 응답과 오류는 출력하지 않음

현재 프로젝트의 신설 평가 Project/Key를 과거 11회가 사용한 Project/Key로 **자동 재사용하지 않습니다**. 별도 과거 소속 증명이 없으면 조회하지 않습니다.

### 로컬 실행

신뢰할 수 있는 로컬 운영자 환경에서 다음 비공개 환경변수를 제공한 경우에만 조회합니다.

- `OPENAI_ADMIN_KEY`: 읽기 전용 진단에 사용하는 관리자 키
- `SEYEON_C07_HISTORICAL_PROJECT_ID`: 과거 실행이 실제로 속했던 프로젝트 식별자
- `SEYEON_C07_HISTORICAL_API_KEY_ID`: 과거 실행의 API 키 식별자 (**비밀키 값이 아님**)

`node scripts/seyeon-c08-prior11-provider-cost-v1.mjs`

키와 프로젝트가 없으면 **네트워크 호출 0회 / HOLD**입니다. GitHub Actions의 기존 승인·운영 작업 흐름에는 연결하지 않으며, 유료 모델 요청·자동 충전·운영 DB 변경은 구현하지 않습니다.

## 외부 증거의 한계와 다음 필수 조건

OpenAI 공식 Costs API는 하루 단위 집계를 돌려줍니다. 한 날짜의 Project/Key별 총액은 다른 앱의 호출이 섞였는지, 이미 취소된 시도에 요금이 붙었는지, 11개 요청 각각에 정확히 얼마가 최종 청구됐는지, 원화 환산·수수료·최종 송장이 일치하는지 **독립적으로 증명하지 않습니다**. 제공되지 않은 일자·기타 키·프로젝트에 비용이 있을 가능성도 배제할 수 없습니다.

개별 요청의 원본 사용량 기록, 공급자 청구 내역/해당 기간 수출 데이터, 같은 UTC 기간의 독립 결제·송장 자료, 과거 프로젝트·키의 확정 귀속 근거를 대조하기 전에는 `invoiceReconciled=false`, `elevenRequestReceiptsVerified=false`, `actualBilledKrw=null`, `paidDispatchEnabled=false`를 유지합니다.

공식 출처:

- [OpenAI Costs API](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs)
- [API 사용량·비용 검토](https://help.openai.com/en/articles/10478918-reviewing-api-usage-and-costs)
- [월별 비용/활동 CSV 내보내기](https://help.openai.com/en/articles/20001072-exporting-monthly-usage-details-from-the-api-usage-dashboard)

검증: `npx vitest run test/seyeon-c08-prior11-provider-cost-v1.test.mjs`. 공급자 모의 응답만 사용하는 로컬 테스트이며 실제 Admin 조회·유료 POST를 수행하지 않습니다.

## 변경하지 않은 결정

C08-T 사용자 승인된 **추가 5,000원, 최초 최대 6회**, 자동 기억 저장 OFF, 수동 공유 메모리 Production OFF, PR #3068 Draft, SRC-25/SRC-05/SRC-10과 운영 보안·복구 게이트는 그대로 유지합니다. `ROADMAP_IN_PROGRESS`.
