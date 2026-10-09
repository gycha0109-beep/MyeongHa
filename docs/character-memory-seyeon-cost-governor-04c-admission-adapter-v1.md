# 세연 PR-04C-1 — 서버 검증 입력 상한 기반 Provider Admission 연결

Watchtower-Track: character-memory

## 아키텍처

1. Server-owned Production Chat role 또는 Post-turn Worker 런타임이 명시적으로 `governor` 계약과 활성 Provider의 정확한 모델/단가/출력 상한을 공급한다. 설정이 없으면 기존 PR-03 미터링 방식은 그대로 유지된다.
2. OpenAI Responses Provider가 최종 전송할 JSON 본문을 **한 번만 직렬화**하고, 동일 문자열의 UTF-8 바이트 길이를 추출한다. `beforeDispatch` 이벤트는 ID, 목적, 모델, 바이트 길이만 노출한다. 원문 요청/프롬프트는 원장으로 전달하지 않는다.
3. 별도 신뢰된 서버 `certifiedInputTokenUpperBound(request, exactRequestBodyBytes)` 포트가 지시문·JSON schema·문맥·전송 프레이밍까지 포함하는 **보수적** 모델 입력 토큰 상한을 반환해야 한다. 이 포트는 이번 PR에서 구현하지 않는다. NULL/NaN/허용 범위 초과는 전송 전 거부된다.
4. `quoteSeyeonCostGovernorMaximumV1`가 모델·목적·가격·정확한 출력 제한을 검증한 후, `cmd_governed_start_seyeon_ai_call_v1`를 Canonical Subject 트랜잭션 내에서 호출한다. 반환된 ID 및 최대 원가가 견적과 불일치하면 커밋을 거절하여 API 호출을 차단한다.
5. 원장 기록이 **DB 커밋된 후**에만 외부 Provider HTTP 요청을 수행한다. 실패 시 비밀 정보는 숨기고 `PRE_DISPATCH_REJECTED`를 사용한다. 성공한 응답은 기존 PR-03 정산 함수로 기록한다. 유료 추론을 재시도하지 않는다.

## 안전 및 미완료 사항

- 추가 기능은 서버가 **명시적으로** 공급한 정책과 검증 포트가 있을 때만 작동한다. 이번 PR은 어떤 Production 설정이나 운영 ENFORCE를 기본 활성화하지 않는다.
- 예산 예약과 비용 정산의 잔액 반환은 아직 하나의 원자 함수가 아니므로 **예산은 보수적으로 전액 점유된 상태**다. PR-04C-2에서 정산과 전역/Subject 잔액 재계산을 단일 트랜잭션으로 묶어야 한다.
- 기존 `cmd_start_seyeon_ai_call_v1` 경로는 운영 우회가 가능하므로, PR-04D에서 반드시 권한을 철회·격리한 후 활성화한다.
- 요청 본문 바이트 길이 자체는 토큰 상한의 증거가 아니며, 검증된 외부 토크나이저/모델별 상한 계약이 마련되기 전엔 실제 ENFORCE에 사용하면 안 된다.
- 실행 테스트는 mock DB/HTTP 사용. 실제 모델/지불 비용/Production 데이터 변경 없음.

## 종료조건

A. 최종 HTTP 본문과 입력 계측 본문 일치, 사용자 요청 식별자 대신 Canonical Subject 결속, 가격/모델/토큰/DB 응답 정합성, 실패 시 Provider 호출 0회 — 오프라인 CI로 검증.
B. 검증 토큰 계측 포트 및 모든 모델 경로 통합, 정산 반환, 기존 DB 우회 차단 — HOLD.
C. 운영 전 경합·정산 복구·개인정보 삭제·장애·청구 대조 — HOLD.
