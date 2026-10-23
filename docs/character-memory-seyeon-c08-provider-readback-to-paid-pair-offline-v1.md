# C08 §7.3-5/6 — 실제 Provider GET 증거 → N06 쌍대 예약 산식 연결

Watchtower-Track: character-memory

## 이 단계에서 실제 확인된 수치

- #2525 CI [기본 빌드 #39982013033](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39982013033)의 `SEYEON_C08_N06_ADAPTER_WIRE_PAIR_OFFLINE` 기록. 실제 OpenRouter 어댑터가 fake-fetch 전에 생성한 JSON request body byte 수를 고정했다. 메타데이터 모델 ID `openai/gpt-oss-120b`, **태그 `openai`**의 직렬화 구성에서만 유효하다. real inference 0건.
- Baseline: 5,414 / 18,683 / 14,465 B. Compact: 5,414 / 14,030 / 12,726 B. 각 arm: 3 호출, Full-thread Census 4회, 독립 semantic review 유지.
- `scripts/seyeon-c08-n06-provider-readback-offline-quote-v1.mjs`: **실제 sanitized Provider GET artifact의 `report.json`**을 입력받는 순수 오프라인 quote. 연결된 Provider의 *동일 model/tag*가 양쪽 ZDR/endpoint 메타데이터에서 식별되고 전체 4 GET가 정상일 때에만 #2523 예산 산식을 재사용한다. 태그·모델·요청 크기가 조금이라도 바뀌면 기존 bytes를 재사용하지 않고 HOLD. GET 결과가 없으면 HOLD.
- 광고 단가 `0.03/0.17 USD per 1M tokens`를 **테스트용 모의 GET 보고서**로 주입하면 baseline 1,942 microUSD(4.855원), compact 1,750 microUSD(4.375원), 2개 arm 합계 3,692 microUSD(9.23원) 계산. 과거 #2523 임의 크기 3,569 microUSD는 이 단계의 새 정확 JSON 크기 관측으로 대체된다. **여전히 모델 입력 토큰 상한 / 청구 한도 / Provider 품질이나 속도의 증명이 아니다**.
- `test/seyeon-c08-n06-provider-readback-offline-quote-v1.test.mjs`: exact 태그·크기 고정, 가격 상승에 따른 10원 초과, 불완전 GET, 공급자/태그 중복·오염, 다른 모델에 잘못된 바이트 재사용 차단.
- CLI: 수동으로 발급받은 GET-only 워크플로의 sanitize `report.json`을 저장한 뒤 `node scripts/seyeon-c08-n06-provider-readback-offline-quote-v1.mjs ./report.json` 실행. 비공개 API 키나 사용자 내용은 필요 없으며 stdout에는 공개 단가 기반 견적과 **유료 실행 불허**만 출력한다. CLI 단일 파일 상한 64KiB.

## 실제 유료 실행 전 경계

1. [GET 전용 수동 워크플로](https://github.com/gycha0109-beep/MyeongHa/actions/workflows/seyeon-c08-provider-metadata-readonly-once-v1.yml)의 정확 main SHA 한 번 실행. 실조회 결과가 **아직 확보되지 않았다**. JSON 없는 상태에서 광고 단가를 임의의 실측 endpoint 증빙으로 변조하지 않는다.
2. 이전 계정 청구액·프로젝트 잔액, 현재 동일 Provider의 실제 요청 단위 `zdr`, `data_collection=deny`, `response_format.json_schema.strict`, completion+reasoning, *턴당 hard billing cap*을 검증한다. `max_price`는 모델 토큰 단가 필터일 뿐 전체 비용 상한이 아니다.
3. 사전 승인한 N06 쌍대 실험은 모델/태그 동일, baseline 3회 + compact 3회, **총 6회**, **1 arm 10원 / 전체 20원** 이내. 실제 호출 전에 '다음에 할 것'에 모델·태그·호출 횟수·예약 비용·Fail-Closed 정책을 보고하고, 조건 미충족 시 유료 0 호출. 실제 5초 E2E·청구 정산·Gold 대사 품질은 아직 HOLD.

본 코드는 외부 GET/POST·실제 과금·운영 전환을 **수행하지 않는다**. 공용 `main`, DB, 개인정보, Canon, ACL, Memory/Grants, 기존 Guard는 변경하지 않는다.
