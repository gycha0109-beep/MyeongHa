# C08 로드맵 §7.3-6 — 대체 모델 무료 공개 단가 조사 (2026-10-23)

Watchtower-Track: character-memory

**조건부 전제:** GLM N06 기존 3회는 23,893ms, 생성 9,282ms로 기록되었고, 기존 C08-R3 최대 단가/입력 바이트 스트레스에서 10원도 미달이다. 따라서 §7.3-6의 **다른 모델에 대한 무료 조사**는 조건 충족. 새 모델 사용이나 유료 호출 권한 부여는 아님.

## 공개 자료와 입력 한계

- [OpenRouter gpt-oss-120b](https://openrouter.ai/openai/gpt-oss-120b/): 광고된 대표 입력 $0.03/M·출력 $0.17/M. 실제 Provider에 따라 다를 수 있으므로 고정 upper price 아님.
- [OpenRouter Qwen3.5-Flash](https://openrouter.ai/qwen/qwen3.5-flash-20260224/api): 대표 $0.065/M·$0.26/M.
- [OpenRouter Gemini 3.1 Flash Lite](https://openrouter.ai/google/gemini-3.1-flash-lite/api): 대표 $0.25/M·$1.50/M; 기존 GLM 예약 산식의 0.15/0.4 단가 천장 밖.
- 동일 모델명이라도 Provider tag / precision / route / cache / reasoning usage, fallback 가격은 변한다. 모델 페이지의 범용 JSON Schema 지원 표시는 **특정 고정 제공자가 strict JSON Schema와 ZDR을 동시에 보장**한다는 입증이 아니다.
- N06 3단계 5,425/14,041/12,737 bytes는 GLM 요청 직렬화 바이트이므로 대체 모델에서 동일 토큰량이나 요청 크기, 청구액을 보장하지 않는다.

## 무료 모델별 산식

`scripts/seyeon-c08-alternative-provider-price-screen-offline-v1.mjs`는 기존 C08-R3 `quoteSeyeonThreeCallTenKrwShadowV1` 스트레스 quote와 1,536 completion tokens/단계를 그대로 써서 **광고된 대표 단가** 수치만 산출한다. 입력 byte↔token 대체는 기존 스트레스 가정이지 tokenizer 증거가 아니다.

| 대체 모델 | 대표 단가 적용 단순 3회 예약 시나리오 | 2,500 KRW/USD | 판정 |
| --- | ---: | ---: | --- |
| gpt-oss-120b | 1,751 microUSD | 약 4.3775원 | 산식만 10원 미만, Provider/Guard/속도 HOLD |
| Qwen3.5-Flash | 3,293 microUSD | 약 8.2325원 | 산식만 10원 미만, Provider/Guard/속도 HOLD |
| Gemini 3.1 Flash Lite | 기존 R3 단가 천장 초과 → 계산 제외 | 미산정 | HOLD |

이는 **대체 모델 사용 추천/승인/실청구 예상 보장 아님**. `test/seyeon-c08-alternative-provider-price-screen-offline-v1.test.mjs`는 모든 모델의 `providerEndpointPinned=false`, `providerZdrVerified=false`, `strictJsonSchemaVerified=false`, `hardPerTurnInvoiceCapVerified=false`, `measuredGuardedLatencyVerified=false`, `safetyAndPersonaParityVerified=false`, `paidTestAuthorized=false`, `productionRoutingAuthorized=false`를 검증한다.

## 다음 진입 조건

각 후보별 특정 실제 Provider tag의 현재 단가·ZDR 및 strict JSON 지원·고정 라우팅·usage/추론 한계/실청구 하드캡을 무과금으로 입증하고, 기존 Gold·Canon·Guard/ACL/Integrity/Disclosure와 동일한 대사 품질을 검증할 **별도 Owner 승인 실모델 쌍대 계획**을 마련해야 한다. 유료 호출, 자동 fallback, 생산 배포는 승인 없이 시작하지 않는다.
