# COST-05 — 4-cell 무과금 비용 재개 사전 계산 / 실평가 HOLD

> Watchtower-Track: character-memory  
> 2026-10-15 / PR #1985 / 검토용 코드만, 유료 평가 재개 승인 아님.

## 근거에 따라 확인한 위험

- `scripts/run-seyeon-dialogue-path-real-api-eval-v1.mjs`는 2-route 16-case / 최대 128회 / 과거 추정액 $3 기반. `scripts/run-seyeon-model-eval-v1.mjs`는 최대 400회 / $1.50 과거 추정값. 모두 **호출 전 신뢰할 수 있는 비용 예약 및 미확인 사용량을 포함하는 강제 총비용 상한이 아님**. 실패 또는 사용량 누락을 0으로 계상할 위험이 있어 현재 protected workflow 잠금을 유지해야 한다.
- `scripts/seyeon-security-four-cell-eval-plan-v1.mjs`의 네 셀은 A/B 각 5단계, C/D 각 3단계이다. 4 case × 16단계=64회, 16 case × 16단계=256회. 재시도 0 조건; 모델·토큰 제한·단가·청구/영수증·안전성 검증은 별개이다.
- `apps/api/src/seyeon-cost-governor-server-policy-v1.ts`에는 trusted input upper, provider output bound, no cache credit의 서버 정책 후보가 있지만 **Production ENFORCE/실유료 평가 승인과 다름**.

## 신규 무과금 구현

- `scripts/seyeon-cost-c05-offline-restart-preflight-v1.mjs`: 4-cell 원본 정의를 재사용하고 Owner 제출 요금표(모델·버전 포함)와 단계별 검증 입력 상한·Provider 강제 출력 상한을 받아 각 요청 최대 비용을 **캐시 할인 없이 올림 계산**한다. 모르는 모델 가격이나 상한은 `null/UNKNOWN`을 유지한다.
- 합성 조건부 stage-only 금액만 반환하고 `allInMaximumMicroUsd=null`을 고정한다. 실제 Provider 영수증/실단가·계측 Token Count의 별도 호출/요금·후속 Event Extraction·실패/재시도 비용·예산 예약/상한/kill switch를 포함한 전체 보증이 아니다.
- 함수는 `paidEvaluationPermitted=false`, `HOLD_COST_INCIDENT_APPROVAL_REQUIRED`을 **항상** 반환한다. Rate/Cap/예산 숫자와 성공적인 Unit Test는 Owner/보안 승인 증거가 아님.
- `test/seyeon-cost-c05-offline-restart-preflight-v1.test.mjs`에서 64회/256회와 예산 부족, 미확인 단가·상한, 캐시 과도 할인, 중복·무권한 모델·재시도·정수 Overflow를 점검한다.

## 호출·예산 차단 모의 검증 (2026-10-15 추가)

- `scripts/seyeon-cost-c05-offline-pilot-quota-v1.mjs`는 C05 조건부 계산기를 받아 **합성 호출 전 선예약**을 확인한다. 4건 64회와 16건 256회, 0회 재시도, 모델/단계 위조, 예산 소진, 무응답/시간 초과, 중복·모순된 결과, 초과 추정치를 별도 테스트한다.
- 실패/응답 없음/예상 비용 감소 이후에도 예약액은 절대 되돌려주지 않는다. 가격·출력 상한과 Count·후속 추출의 추가 비용은 여전히 **실제 보증되지 않았으며**, 모의 보조금액도 실제 청구 상한 근거가 아니다.
- 신규 Gate는 `reserveSyntheticStage`와 가짜 결과 기록만 가능하며 **Provider fetch/DB/credential 참조 및 유료 요청 실행 함수가 없다**. 출력은 반드시 `paidEvaluationPermitted=false`이고 실 Provider 청구는 `null`.
- 사용자가 향후 유료 평가에 사용할 키 이름을 **`OPENAI_API_KEY2`**로 지정했다. 기존 `OPENAI_API_KEY`를 사용하거나 자동 fallback 하지 않는다. **키 등록과 유료 평가 승인·한도 결정은 별개**이다. 비용·호출수·모델·중단 조건이 승인되고 별도 리뷰되기 전 워크플로 잠금을 변경하지 않는다.

## 실행 전 미해결 증거 및 승인

1. Provider별 **현행 공식 모델 정확한 SKU/단가/계약 및 요청 상한**과 네 셀의 실제 동일 모델 스냅샷.
2. 각 단계의 실제 완전한 Provider 요청 `instructions + input + schema + framing`에 대한 신뢰 입력 토큰 **상한**, Provider에서 강제되는 출력(추론 포함) Cap 확인. 실제 Count API 호출 비용과 전체 평가 calls도 별도로 예산화.
3. **시도 전 예산 예약/총 호출 상한**을 시행하는 독립 Kill Switch와 Failure/Timeout/Unknown charged attempt 계정 보수 정산, Provider 영수증 durability 및 전액 reconciliation.
4. #1816 보안 평가, Character 실제 멀티턴/인간 평가 기준, #1887 운영 DB migration/DR, 전용 Production DB LOGIN/ACL, G0 Owner 승인이 있는 **별도 reviewed PR**.
5. 승인 전에는 locked workflows `if: ${{ false }}` 유지; 유료 API/실청구, 운영 DB/Schema/ACL, Production ENFORCE, Canon 승격, 배포/병합 금지.

이 문서와 실험 가상의 숫자는 비용 승인의 근거가 아니며 **실행 허가 0, API 호출 0**이다.

## 2026-10-15 추가 점검: 캐시 기록 할증 및 긴 컨텍스트 위험

- <https://developers.openai.com/api/docs/pricing> 요금표에서 `gpt-5.6-luna` 및 `gpt-5.6-terra`는 **일반 입력보다 캐시 쓰기 단가가 더 높을 수 있다**. 짧은 컨텍스트 기준 Luna: 입력 $0.20/100만, 캐시 기록 $0.25/100만, 출력 $1.20/100만; Terra: 입력 $2.00, 캐시 기록 $2.50, 출력 $12.00. 공식 문서에 나온 요금이지만 실제 고객 계약/지역/서비스 tier/요금 적용일은 별도 검증 대상이다.
- 기존 후보 비용 상한은 일반 입력·캐시 읽기만 비교하여 **캐시 쓰기 할증을 놓칠 수 있었다**. 새 `cacheWriteMicroUsdPerMillion`을 필수로 받아 입력 단가의 **최대값**을 사용하며, 누락 시 결과 생성 자체를 거부한다.
- 공식 모델 문서 <https://developers.openai.com/api/docs/models/gpt-5.6-terra>는 272,000 입력 토큰 초과 시 장문 구간 요금 할증을 고지한다. 이번 후보는 짧은 컨텍스트 요금만 지원하므로 검증 입력 상한이 **272,000 초과인 단계는 거부**한다. 장문 구간 허용/계산은 별도 승인 전 불가.
- 모든 값은 합성 가격표와 합성 토큰 상한에 대한 오프라인 추산이다. 기존 단위 테스트의 4건 64요청 예제는 $0.0896 → $0.1056(합성값)으로 커졌다. **실제 청구액/전체 예산 상한 증거는 아니다**. 신규 요금 필드와 긴 컨텍스트 차단으로 무과금/Production 잠금 상태를 바꾸지 않는다.
