# C08 §7.3-5 — N06 유료 쌍대 실험 실행 전 계약 (추가 호출 0)

Watchtower-Track: character-memory

## 사전 승인과 절대 경계

사용자: **유료 실험 사전 승인**, 단 **실제 유료 호출을 시작하기 전 모델/제공업체/호출 수/비용·조건을 '다음에 할 것'에 보고**. 승인 자체가 가격, 토큰, 공급자 ZDR, strict JSON, 실제 청구 하드캡을 증빙하지는 않는다. 이 작업 PR에는 모델 POST 코드, dispatch workflow, 키, 과금 호출이 없다.

기준: C08 §7.3-5. 대상은 공개 합성 **N06** `오늘은 네가 먼저 이야기해 줘.` 1건의 기존 3-call Shadow **baseline**과 명시적 **compact_v1**. 모델 한 가지, 동일 고정 Provider tag, 각 arm 3회 = **최대 6회**. 각 arm의 단계 순서 **unified_preflight_shadow → turn_interpret_render_shadow → semantic_review**, 각각 전체-대화 Census 4회, 독립 의미 검토 유지, 자동 fallback/재시도 0.

## 구체적 구현

- `scripts/seyeon-c08-n06-paired-paid-research-plan-offline-v1.mjs`: 기존 10원 상한 계산기 재사용. **1개 arm당 4,000 microUSD(환율 2,500원/USD → 10원)**, 두 arm 전체 8,000 microUSD(20원) 이내인지 계산한다. 입력은 양쪽의 실제 직렬화 `requestBodyBytes` 및 각 단계 상한과 ZDR 양쪽 목록에서 매칭된 Provider의 sanitized 1회 GET 보고서. 미확인/중복 route, 불완전 GET, 잘못된 N06/바이트/캡은 거부.
- `test/seyeon-c08-n06-paired-paid-research-plan-offline-v1.test.mjs`: 공개 합성 모의 메타데이터, 가격 충돌, 6-call topology 및 실패 차단. 테스트 바이트 예시는 **실제 baseline Provider 요청 바이트 계측이 아니다.**
- 단가 예시 **gpt-oss-120b의 광고 단가 $0.03/M 입력 + $0.17/M 출력**를 그대로 쓰고 **임의 모의 입력 크기** baseline `[5425,15000,14000]`, compact `[5425,14041,12737]`, 출력 각 1536으로 계산하면 baseline 1818 microUSD(4.545원), compact 1751 microUSD(4.3775원), 전체 3569 microUSD(8.9225원). 이는 **실제 Provider 견적도, 청구 상한도 아니며** 호출 승인 불가.
- GLM의 기존 공식 보수적 `$0.15/$0.4` 스트레스는 compact도 6675 microUSD(16.6875원)으로 턴당 10원 상한 실패. 동일한 부적격 설정으로 GLM 재호출 금지.

## 유료 실행 전 확인이 필요한 실제 증거

1. 메타데이터 조회 GitHub Actions 수동 워크플로 `seyeon-c08-provider-metadata-readonly-once-v1.yml`를 **정확한 main SHA**로 1회 실행, sanitize된 `report.json`의 해당 Provider tag, 현재 단가 및 네 GET 상태 확인.
2. 기존 C07/GLM 청구 원장 등 이전 모델 사용액 및 계정·프로젝트 잔액 검증. **실제 인보이스 미정산이면 임의 0원으로 보정하지 않는다.**
3. 선택한 모델·Provider 고정/요청 단위 ZDR 및 data collection deny, strict JSON 사용 가능성, completion+reasoning 상한, 공급자 **단일 턴 비용 hard-cap** 확인. 단순 `max_price`는 provider 단가 제한이지 결제 hard-cap 아님.
4. baseline과 compact의 실제 adapter 직렬화 입력 및 호출 전 예약 상한, 성공·실패·unknown 모두 durable reservation+observation으로 기록. 요청 개수 6 이상 금지, 실패 즉시 중지. 동일 Canon·Census·Guard·개인기록 0 유지.
5. p50/p95 및 블라인드 품질은 충분한 독립 실측 표본이 없으면 **미검증**. 최초 1건의 PASS는 5초/10원 서비스 달성 증거가 아니다.

모든 결과에 `paidDispatchAuthorized=false`, `productionPromotionAuthorized=false`, `providerHardTurnBillCapVerified=false`, `strictJsonSchemaRuntimeVerified=false` 유지. 향후 이 값을 바꾸려면 별도 실제 증거와 실행기 진입 계약이 필요하며, 현재 PR의 정직한 OFFLINE 범위를 넘는다. 새 유료 호출 **0건**.
