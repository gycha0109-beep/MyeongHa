# 세연 PR-04A — 서버 단가·입력/출력 비용 상한 계약 v1

Watchtower-Track: character-memory

## 적용 범위

- `seyeon-cost-governor-server-policy-v1.ts`는 **순수 오프라인 서버 계산 계약**이다. DB를 갱신하거나 Provider를 호출하지 않는다.
- 기존 `seyeon-ai-usage-cost-v1`의 단가 `SeyeonAiPriceV1`를 재사용하며 `providerKey + modelKey + priceVersion` 불일치를 거부한다.
- 요청 목적은 실제 `SeyeonStructuredPurposeV2`의 승인 집합에 포함되어야 한다.
- 서버 승인 모델별 `maximumInputTokens`, `maximumOutputTokens`, `contextWindowTokens`, `maximumSerializedRequestBytes`가 필수다. **단가/토큰 상한이 없거나 NULL이면 거부**한다.
- 최대 견적은 캐시 할인 없이 입력 단가의 큰 값과 출력 단가로 올림하여 계산한다. `BigInt` 중간 계산 후 안전 범위를 검증한다.
- 견적에는 Subject ID, 원문 프롬프트, 응답, 키 또는 개인 데이터를 저장하지 않는다.
- 어떤 Production/Commerce 플래그도 켜지 않고 네트워크/유료 모델 호출은 하지 않는다.

## 중요 안전 경계

이 계약은 전달된 상한·계측치의 **신뢰성 자체를 증명하지 않는다.** `verifiedInputTokenUpperBound`는 사용자나 브라우저가 지정할 수 없다. PR-04C의 실제 호출 직전에 모델별로 검증된 서버 토크나이저/Provider 승인된 토큰 상한 포트가, instructions·JSON schema·framing·payload를 포함한 **보수적 상한**을 제공해야 한다. 해당 포트 또는 제공자 모델의 명시된 토큰 상한이 없으면 ENFORCE 모델 호출을 거부한다.

`serializedRequestBytes` 역시 **최종 HTTP 요청 본문**의 서버 측 직렬화 바이트 수를 측정해야 한다. 길이만으로 실제 토큰 비용이 상한 이하라고 가정하지 않는다. `enforcedOutputTokenLimit`는 현재 Provider의 `maxOutputTokens`로 실제 요청에 전달되는 값을 검증해야 한다. 입력 토큰 상한과 요청 전체 비용 경계, 모델별 부가 과금(도구, 이미지, 오디오, 게이트웨이 수수료 등)을 증명할 수 없는 Provider는 ENFORCE 허용 대상에서 제외한다.

## 04B~04D 인계

1. **04B**: global/Subject UTC 일일 점유 행을 PostgreSQL에서 동일 원자 트랜잭션으로 잠그고 예약한다. `quote.ceilingMicroUsd`와 서버 버전 고정 정책만 허용한다. 중복 `callId`는 두 번째 전송을 절대 허용하지 않는다.
2. **04C**: 모든 Production Chat role과 Post-turn Worker를 동일한 원자 예약/호출 시작 RPC로 연결한다. 기존 `cmd_start_seyeon_ai_call_v1`의 운영 직접 EXECUTE 우회를 차단하거나 안전하게 격리한다. 정산은 원가 ledger와 예산 예약을 동일 트랜잭션으로 확정한다.
3. **04D**: `started`/미정산·타임아웃은 자동 환불하지 않는다. 개인정보 삭제의 Subject 정리와 전역 일일 예산 보존을 분리한다. DB 경합·크래시·네트워크 재전송·의도적 중복·청구 대조 검증을 통과하기 전 운영 ENFORCE 금지.

## 종료 조건

- A: 단가·목적·모델 정합성, 미확정 토큰 수·누락 상한 거부, 보수적 올림 금액, 정수 오버플로 검증.
- B: Production 유료 호출 배선 **미구현**; DB 원자 예약 **미구현**.
- C: 운영 ENFORCE **HOLD**; 실제 과금 상한 보증 주장 금지.
