# C08 로드맵 §7.3-6 — 대체 모델 Provider별 ZDR·JSON·단가 무과금 교차검사

Watchtower-Track: character-memory

## 목표와 근거

- 정본: `docs/character-memory-seyeon-cost-c07-evidence-closeout-and-c08-roadmap-v1.md` §7.3 6번, 이미 병합한 `docs/character-memory-seyeon-c08-alternative-provider-free-scan-v1.md`.
- 이번 변경은 gpt-oss-120b, Qwen3.5-Flash, Gemini 3.1 Flash Lite의 **특정 제공업체 endpoint tag에 대한 무료 메타데이터 확인 도구**이다. API 계정·실제 모델·Guard·Production은 실행하지 않는다.
- 공식 OpenRouter [ZDR endpoint 목록](https://openrouter.ai/docs/api/api-reference/endpoints/list-endpoints-zdr)은 `GET /api/v1/endpoints/zdr`, [모델별 제공업체](https://openrouter.ai/docs/api/api-reference/endpoints/list-endpoints)는 `GET /api/v1/models/:author/:slug/endpoints`를 제공한다.
- 제공업체 [라우팅 규칙](https://openrouter.ai/docs/guides/routing/provider-selection)은 `provider.only`, `zdr=true`, `data_collection=deny`, `allow_fallbacks=false`, `require_parameters=true`를 정의하지만 **메타데이터만으로 실제 특정 요청에서 이 모든 조건이 준수됐음을 증명할 수 없다**.
- 모델 페이지 가격은 특정 ZDR·strict JSON endpoint의 청구 단가·총 청구 hard cap이 아니다. Provider별 가격은 시간에 따라 변동하며 최종 실측 비용/속도는 별도 확인이 필요하다.

## 구현

`scripts/seyeon-c08-exact-provider-metadata-offline-v1.mjs`

1. `inspectSeyeonC08ProviderMetadataReadOnlyV1`: 호출자가 명시적으로 제공한 키·`fetchImpl`로 **허용된 4개 GET만 실행**할 수 있다(현재 PR/CI는 이를 호출하지 않는다). 자동 실행, `/chat/completions` POST, 결제, 재시도, 키 출력 없음. HTTP/JSON 오류는 인증이나 적격성으로 승격시키지 않는다.
2. `screenSeyeonC08ExactProviderEvidenceOfflineV1`: 두 OpenRouter 목록의 **동일 model ID + 전체 provider tag**가 유일하게 교집합을 이루고 양쪽 모두 active(`status=0`), `response_format` 지원, 출력 한도 충분, `request` 요금 명시적 0, prompt/completion 가격 유효할 때만 **수학적 시나리오**를 계산한다. 두 가격 값 중 더 큰 값을 사용한다. 누락·태그 중복·비활성·지원 누락·요금 미상은 Fail-Closed.
3. 기존 GLM N06 바이트 5,425/14,041/12,737와 C08-R3 인용 계산기를 재사용하되, **타 모델의 실제 토큰/직렬화·reasoning·strict JSON·실청구 상한 증거가 아니다**. 10원 스트레스 실패나 단가 천장 초과 시 HOLD.
4. `test/seyeon-c08-exact-provider-metadata-offline-v1.test.mjs`: 정상 교집합·양쪽 중 높은 가격·부분 GET 오류·중복 태그·비활성·요금 누락·JSON 지원 누락·출력 한도 부족·키 누락·HTTP 503를 모두 오프라인 모의 Provider로 검증한다.

## 현재 결론 / 다음 진입

이번 테스트는 **메타데이터 정합성 검증기 자체**만 검증한다. 실제 현재 OpenRouter 계정 GET의 실측 실행은 **0회**, 실제 모델 inference POST **0회**, 실사용 사용자 대화 조회 **0회**.

모든 결과에서 `strictJsonSchemaRuntimeVerified=false`, `requestLevelZdrAndDenyRuntimeVerified=false`, `accountProviderRouteVerified=false`, `hardTurnBillingCapVerified=false`, `guardedFiveSecondLatencyVerified=false`, `c07GoldAndCanonParityVerified=false`, `paidInferenceAuthorized=false`, `productionRouteAuthorized=false`를 유지한다.

**이후 제한된 실모델 실험은 별도 Owner 승인을 받을 때만** 고려한다. 기존 3회 Shadow 기준점·Integrity/Disclosure·C07 Gold·Census·ACL·Canon·Memory/Grant·Guard·Fail-Closed 및 Production은 변경하지 않는다.
