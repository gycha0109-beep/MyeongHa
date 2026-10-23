# C08 §7.3-5 — N06 쌍대 실험의 실제 어댑터 직렬화 요청 바이트 확인

Watchtower-Track: character-memory

## 무엇을 해결했나

#2523에서 실험 계획의 baseline/compact 입력 바이트는 임시 가상 값이었다. 이번 변경은 **기존에 이미 동작하는 N06 공개 합성 3회 Shadow/Guard fake-fetch harness**를 재사용하여, `openai/gpt-oss-120b` + `provider.only=["openai"]`으로 조립되는 **실제 OpenRouter 어댑터 JSON 요청 바디의 단계별 UTF-8 바이트**를 각 profile에서 계측한다. 테스트 시 실제 외부 fetch는 **0회**. 이 수치는 실제 토크나이저의 input token 수나 공급자 청구 상한이 아니다.

`test/seyeon-c08r-compact-three-call-shadow-offline-v1.test.ts`의 기존 고정 GLM baseline/compact 실험을 손상하지 않고, route를 **테스트 전용으로 주입 가능**하게 했다. 기존 3회 stage/4회 full-thread Census/독립 리뷰/최종 Reveal public·private 0 기준과 양쪽 결과 대사 일치 확인을 그대로 유지한다.

추가 테스트는 위 계측된 `baseline.seen[].bytes`와 `compact.seen[].bytes`를 그대로 `planSeyeonC08N06PairedOfflineV1`에 연결하고, 외부 Provider의 현재 실측값을 꾸며내지 않기 위해 **가격·ZDR 제공업체 메타데이터만 명시적 모의값**으로 고정한다. 기존 모의 광고 단가 `$0.03/$0.17 per 1M tokens`를 사용하는 스트레스 견적만 계산한다. 로그 `SEYEON_C08_N06_ADAPTER_WIRE_PAIR_OFFLINE`은 요청별 바이트/가상 비용 상한, 유료 호출 0 및 미입증 상태만 포함하며 응답 대사·실제 API 키·개인정보는 기록하지 않는다.

## 실험 전 남은 실제 증거

- #2516에서 main에 병합된 `.github/workflows/seyeon-c08-provider-metadata-readonly-once-v1.yml`의 **1회성 수동 GET 실행** 결과. model ID+exact endpoint tag의 ZDR·지원 매개변수·0 request fee·두 소스 가격 동시 검증. 지금까지 이 PR에서 외부 GET 실행 **0회**.
- OpenRouter 계정/프로젝트 비용, 과거 잔액·실제 인보이스 정산, **요청 단위 ZDR+data_collection deny 및 strict JSON 정상 처리, per-turn hard billing cap** 검증. 단순 모델 광고 단가/가격 계산기로 대체 금지.
- 사용자 사전 승인에 따라 **실제 유료 호출 전 ‘다음에 할 것’에 정확 모델·Provider·최대 6회 호출·턴당 최대 10원/전체 20원 예약·가드 보존을 먼저 보고**. 미충족 시 실행 HOLD.
- 실제 품질·p50/p95·5초 화면 표시 검증은 실측 후에도 충분한 표본/독립 평가 전에는 HOLD.

**Production·Reader routing·DB·ACL·Canon·Memory·Gold 변경 없음.** 이 변경은 유료 모델 호출이나 실조회 실행 기능을 추가하지 않는다.
