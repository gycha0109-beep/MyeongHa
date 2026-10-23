# character-memory · N06 500원 미만 실모델 시험 사전 차단 원인 및 무과금 수정

## 실행/관측 근거

- 실험 코드 #2463는 `main`에 병합, 전체 통합 CI [#39747986058](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39747986058) SUCCESS.
- 실제 유료 실험 [#39751436405](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39751436405) FAILED, attempt=1. N06 공개 합성 입력만 사용하고 Luna 최초 `unified_preflight_shadow` 요청 **1회 HTTP 200**, 입력 1,040/출력 199 tokens, 관측 사용량 기준 $0.000447, 실청구 미정산. `attempts.jsonl` 증거: Luna `requestBytes=5519`, reserve $0.02/observed 후 Terra/GLM 예약 0.
- 최종 `PRE_DISPATCH_REJECTED`는 외부 API 응답이 아니라 `createOpenAiSeyeonStructuredProviderV1`의 `meteredBeforeDispatch` 콜백 예외를 통합해 나타나는 고정 오류다. 제공자 오류로 단정하지 않는다.

## 확정 재현

- 무료 Vitest `test/seyeon-n06-terra-predispatch-offline-investigation-v1.test.mjs`는 기존 실험의 **동일 N06 첫 턴**, 동일 `runSeyeonCensusFirstThreeCallShadowV1`와 실제 Terra OpenAI JSON 직렬화 코드를 호출한다.
- 첫 Luna stage는 **네트워크 없는** 허용된 공개 합성 preflight fixture로 대체한다. 실제 Terra `turn_interpret_render_shadow` 요청 바이트 수를 `meteredBeforeDispatch`에서 측정하고, HTTP `fetchImpl`은 실행되지 않도록 강제로 HOLD한다.
- 최초 재현 [PR #2474](https://github.com/gycha0109-beep/MyeongHa/pull/2474) CI 로그: Terra 직렬화 크기 **18,789 bytes**, 기존 cap **15,680 bytes**보다 **3,109 bytes 초과**, schemaNameExact=true, `N06_CAP500_REQUEST_BOUND_HOLD`, networkDispatches=0. 원인은 **새 실험 비용 보호용 요청 크기를 실제 Terra prompt보다 지나치게 좁게 잡은 것**이다.
- 사전검사 실패를 숨겼던 wrapper는 보안상 상세 공급자/요청 본문을 로그에 쓰지 않는다. 이번 조사에서는 일반 런타임 경로의 로그 노출을 변경하지 않고 **합성 요청에 대한 무료 테스트에만** 숫자·고정 allowlist reason을 출력한다.

## 수정 — 500원 미만의 보수적 비용 예약 유지

실패 당시 일회성 실행을 다시 돌리거나 승인된 모델 3+3 stage를 바꾸지 않는다. 이후 별도 승인된 N06 실행에서만 사용할 숫자/코드 수정:

| 항목 | 기존 실험 | 무과금 수정 후 |
| --- | ---: | ---: |
| 단일 모델 요청 byte 최대 | 15,680 | **19,200** |
| N06 전용 Terra 요청 예약 | $0.050 ×2 | **$0.057 ×2** |
| Luna 요청 예약 | $0.020 ×1 | 유지 |
| GLM 요청 예약 | $0.020 ×3 | 유지 |
| 총 6회 예약 상한 | $0.180 / 450원 | **$0.194 / 485원** |
| 모델당 출력 최대 | 1,536 tokens | 유지 |
| 보수적 FX 상한 | 2,500원/USD | 유지 |

실제 합성 Terra 요청 18,789 bytes는 19,200 아래다. 비용 최악 가정: 19,200 bytes가 모두 입력 token이라도 Terra 입력 요율 $2/M × 19,200 + 출력 요율 $12/M × 1,536 = **$0.056832** ≤ **$0.057**. Luna/GLM도 기존 가격 상한과 token cap으로 예산 이내다. 별도 개인 DB/과금/운영 라우팅/학습/모델 변경 없음.

수정본 `assertN06Cap500ReservationV1`는 바이트 제한, 고정 Terra 57,000 microUSD 예약, 6번의 stage별 누적액이 환율 상한에서 **485원(500원 미만)**인지, 기존 전역 예약 5,000원 조건을 동시에 강제한다. 신규 테스트는 (1) 실 Terra 요청 18,789-byte 승인 (2) 19,201-byte 거부 (3) stage/call/time budget 초과 거부 (4) 실제 network POST 0회를 확인한다.

## 현재 종료 규칙

- 이 PR은 **실모델 재시도 작업이 아니다**. #39751436405의 요청 1회 청구액도 공급자 청구서와 대조되지 않았다.
- 기존 Workflow one-shot은 이미 1회 소진됐고 trigger 경로를 수정하거나 다시 push하지 않는다. 기존 6-call 비교 결과 0쌍, Luna 1/Terra 0/GLM 0 유지.
- 이후 유료 재실행이 필요하면 원래 실험과 별개 **명시적 신규 승인과 one-shot 범위**로만 진행한다. 성공 대사가 아직 없으므로 캐릭터 품질 PASS/우열 판정 불가.
- Reader 대화·메모리 로드맵은 #2460 이후 정지 상태 유지. 실제 사용자 데이터·개인 기억·공개 Chat/API/DB는 변경하지 않는다.
