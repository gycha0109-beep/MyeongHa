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

## 실행 전 미해결 증거 및 승인

1. Provider별 **현행 공식 모델 정확한 SKU/단가/계약 및 요청 상한**과 네 셀의 실제 동일 모델 스냅샷.
2. 각 단계의 실제 완전한 Provider 요청 `instructions + input + schema + framing`에 대한 신뢰 입력 토큰 **상한**, Provider에서 강제되는 출력(추론 포함) Cap 확인. 실제 Count API 호출 비용과 전체 평가 calls도 별도로 예산화.
3. **시도 전 예산 예약/총 호출 상한**을 시행하는 독립 Kill Switch와 Failure/Timeout/Unknown charged attempt 계정 보수 정산, Provider 영수증 durability 및 전액 reconciliation.
4. #1816 보안 평가, Character 실제 멀티턴/인간 평가 기준, #1887 운영 DB migration/DR, 전용 Production DB LOGIN/ACL, G0 Owner 승인이 있는 **별도 reviewed PR**.
5. 승인 전에는 locked workflows `if: ${{ false }}` 유지; 유료 API/실청구, 운영 DB/Schema/ACL, Production ENFORCE, Canon 승격, 배포/병합 금지.

이 문서와 실험 가상의 숫자는 비용 승인의 근거가 아니며 **실행 허가 0, API 호출 0**이다.
