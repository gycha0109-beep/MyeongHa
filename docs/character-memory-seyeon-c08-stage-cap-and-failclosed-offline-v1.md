# C08 — R3 이후 GLM 3회 단계별 출력 한도 및 실패 차단 검증 (무료)

Watchtower-Track: character-memory

## 작업 범위 / 정본

기준: `main @ 78425326b05d309bb4c04c0bd5cfc544217e6375`, C08-R3 완료. 이 작업은 로드맵 7.3의 **무료 비용·시간 예산 판정**에 포함된다. 새 Production 경로, 별도 유료 실험, 모델 변경을 만들지 않는다.

- 모델: `z-ai/glm-5.3-flash`, 과거 합성 N06 평가에 사용한 OpenRouter endpoint tag `open-inference/fp4`.
- C08-R의 실제 직렬화 N06 compact 요청: 5,425 / 14,041 / 12,737 UTF-8 B (세 호출 32,203 B). `test/seyeon-c08r-compact-three-call-shadow-offline-v1.test.ts`가 원본 fake-fetch 바이트를 고정한다.
- 기존 보수적 **상한 단가**: 입력 $0.15/M, 출력 $0.40/M; 2,500 KRW/USD; 4,000 microUSD/turn.
- 기존 `quoteSeyeonThreeCallTenKrwShadowV1`를 그대로 재사용한다. 이 계산에서 request byte = 보수적 input token proxy는 N06 **스트레스 가정**일 뿐, 제공업체의 실제 tokenizer 상한이나 청구 근거가 아니다.

## 공개 문서 / 코드의 증거 구분 (2026-10-23 조회)

- OpenRouter [ZDR 설명](https://openrouter.ai/blog/insights/zero-data-retention/), [Provider Routing](https://openrouter.ai/docs/guides/routing/provider-selection), [Structured Outputs](https://openrouter.ai/docs/guides/features/structured-outputs): `provider.zdr=true`, `data_collection=deny`, `only`, `allow_fallbacks=false`, `require_parameters=true` 및 `response_format.json_schema.strict=true`의 **요청/라우팅 계약**을 설명한다.
- [Provider Routing의 max_price](https://openrouter.ai/docs/guides/routing/provider-selection#max-price)는 **provider 단가 제한**이며, 출력 총량/추론량/개별 턴 청구액에 대한 결제 하드캡은 아니다.
- OpenRouter [Pricing](https://openrouter.ai/pricing)은 표준 inference 비용의 크레딧 과금과 충전 수수료를 구분한다. 특정 provider/tag의 고정 request fee 부재나 사용자 계정의 최종 invoice 정산을 입증하지 않는다.
- 저장소 `scripts/seyeon-openrouter-glm53flash-paid-preflight-v1.mjs`는 `/api/v1/endpoints/zdr`와 `/api/v1/models/z-ai/glm-5.3-flash/endpoints`의 **일치된 0-fee/허용 단가 메타데이터**만 선정하도록 구현되어 있다. 그 코드의 `exactProviderZdrAndResponseFormatAdvertised`가 true여도 `strictJsonSchemaRuntimeVerified=false`다.
- 이번 세션에서 exact provider tag의 **동시점 공식 endpoint metadata 응답을 신뢰 가능하게 고정하지 못했다**. 웹상 모델·제공업체 가격은 변동한다. `open-inference/fp4`의 2026-10-23 실제 청구단가, request fee, billing hard cap, JSON Schema 강제 성공률은 **미확인**이다. 구가격/외부 미러 가격을 새 확정 단가로 채택하지 않는다.

## 단계별 무과금 계산

`scripts/seyeon-c08-stage-cap-feasibility-offline-v1.mjs`는 고정된 N06 compact body bytes를 사용해 3회 각각의 `maxCompletionTokens`를 차등 적용한다. 출력 한도에는 모델 **reasoning token을 포함**한다고 보수적으로 취급하며, cap을 낮춘다는 사실만으로 latency/품질 개선을 주장하지 않는다.

| 시나리오 | 사전 분류 cap | 생성 cap | 독립 의미 검토 cap | 예약 microUSD | KRW 환산 | 턴 예산 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| C08-R3 기존 | 1536 | 1536 | 1536 | 6675 | 16.6875 | HOLD |
| 가상 A | 256 | 768 | 256 | 5344 | 13.36 | HOLD |
| 가상 B | 128 | 512 | 128 | 5138 | 12.845 | HOLD |
| 이론상 최소 양수 cap | 1 | 1 | 1 | 4833 | 12.0825 | HOLD |
| **이론상 출력 0 (실행 불가능)** | 0 | 0 | 0 | **4832** | **12.08** | HOLD |

마지막 0토큰 행은 실제 JSON 응답을 생성할 수 없는 수학적 입력비 하한이다. **현재의 $0.15/M 입력 최악 단가와 현재의 N06 byte→token 가정을 유지한다면, 출력 cap을 어떤 값으로 줄여도 10원 예약을 통과하지 못한다.**

단가 $0.02/M 입력, $0.25/M 출력을 넣는 무료 *수학적 예시*에서는 축소 cap 시나리오가 예산을 통과할 수 있다. 이는 해당 가격이 고정 provider에서 현재 이용 가능하거나, schema·품질·추론량 한도가 통과되었다는 뜻이 아니다.

## 출력 JSON/Guard 및 비용 실패 차단

- `apps/api/src/openrouter-seyeon-evaluation-provider-v1.ts`: 기존 `finish_reason=length`와 비정상 JSON/비객체, 누락된 사용량, `reasoning_tokens > completion_tokens` 차단 유지. **보고된 completion tokens가 설정한 maxCompletionTokens를 초과해도 `USAGE_UNKNOWN`으로 실패**하도록 강화했다.
- `test/seyeon-c08-output-cap-provider-failclosed-offline-v1.test.ts`: mock fetch만 사용해 길이 제한 종료, JSON 손상, 비객체 응답, 미제공/모순된 사용량, cap 초과, 예약 불합격 시 POST 이전 중단을 검증한다. 외부 요청 0.
- `test/seyeon-c08-stage-cap-feasibility-offline-v1.test.mjs`: 단계별 계산 결과, 가격 상한, cap 누락/오류, math-only 통과와 provider hard cap 미입증 상태를 고정한다.
- Adapter는 JSON 구문/최상위 객체를 확인하며 **전체 JSON Schema 자체를 증명하지 않는다**. 기존 `guardSeyeonTurnInterpretationV2`, `admitSeyeonRendererDraftV2`, `guardSeyeonRendererOutputV2`를 최종 검증에서 절대로 우회하지 않는다.
- 본 작업은 출력 schema의 **최소 유효 토큰수**를 증명하지 않는다. UTF-8 바이트/문자 수를 임의로 출력 토큰 수라고 간주하지 않는다. 특히 실제 생성의 추론 토큰이 cap을 소모할 수 있다.
- 요청에 숨은/추가 유료 호출, 실패한 호출의 공급자 비용, 고정 fee가 확인되지 않는 경우 10원 보장 불가. 기존 수학적 quote와 사전 예약은 실행 전 비용을 막는 운영상 과금 하드캡의 증명이 아니다.

## 불변 경계 / 후속 작업

세 번의 Provider, 네 번의 authoritative full-thread Census, 별도 의미 리뷰, Integrity/Disclosure, Canon, Memory/Grant/ACL, Gold 36, Reader/Production 보류 유지. 무료 테스트 PASS는 기존 유료 **6/72** 관측의 증가가 아니다.

다음은 로드맵 7.3의 **조건부 공개 첫 턴 2회 호출 후보**를 무료로 검토하는 작업이다. 로컬 분류가 고위험·혼합 Gold에서 기존 통합 Preflight의 민감 질문/조작된 주장 탐지를 대체한다는 동등성 근거 없이는 2회 후보를 승인하지 않는다.

실제 5초 목표는 GLM 생성 단독 기존 실측 9,282ms 때문에 여전히 **미입증**. 실제 GLM 재시험, Production, 독립 Guard 변경, 데이터/ACL/결제 변경은 별도 승인 이전 HOLD.
