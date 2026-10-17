# C08-R — C07 전체 Gold 36건의 3회 Shadow 입장·거절 무료 회귀

Watchtower-Track: character-memory

## 목적

C08-Q의 **기존 2분류 / Unified 1분류** Gold Guard 검증에 이어 실제 `runSeyeonCensusFirstThreeCallShadowV1`을 사용해 첫 턴의 **최종 입장·실패 단계**까지 검증한다. C07의 원본 36건(11개 Segment)을 그대로 사용하며 유료 모델/Production DB는 사용하지 않는다.

## 입력 / 기대된 합성 단계

- 민감 Topic 18건(가족·연애·취약성·혼합 주장 포함): 최초 전체 Thread Census 1회, `unified_preflight_shadow` 1회 후 `FAST_SENSITIVE_PREFLIGHT_REJECTED`로 거부. Source Descriptor/Fact Authority/Private Retrieval/뒤따르는 Model 요청 모두 0회.
- 비민감 직접 주장 10건: Census 1회 및 Unified 분류 1회 후 **권한 MISSING** Guard의 안전 결정이 첫 턴 일반 대화 입장조건을 위반하여 거부. Dialogue·Reviewer 0회.
- 비민감 무주장 일반 대화 8건: Census 4회(첫 분류 전/Dialogue 전/Reviewer 전/최종 Shadow 결과 직전), Provider 3회, 최종 `SHADOW_ONLY_NOT_PRODUCTION`. 사적 Source Descriptor/Fact/Retrieval 0회.

위 단계들은 **C07 Gold에 해당하는 구조화된 결과를 모의 Provider가 직접 반환하도록 주입한 것**이다. 실제 모델의 토픽·클레임 인식률이나 캐릭터 응답 적합성을 관측하지 않는다. 일반 대화에 재사용하는 고정 합성 문장도 품질 증거가 아니다.

## 검증과 남은 경계

- 테스트: `test/seyeon-c08f-census-before-all-models-offline-v1.test.ts`의 전체 36-case 표본.
- 유료 실모델 `original/compact` **6/72 슬롯 관측, 66 슬롯 미관측** 원장은 변경되지 않는다. 36개 합성 Shadow 회귀를 유료 72-slot PASS로 계산하지 않는다.
- G0~G6/Positive Grant, Commit↔Revoke, DB 고립 원자성, HTTP Reveal 및 replay, 프로덕션 라우팅, 외부 결제·토큰 비용은 전부 HOLD. 4번째 Census는 최종 Commit을 잠그는 장치가 아니다.
- 정확 PR HEAD의 기본 CI·Full Integration (실제 PG17 포함) 성공과 conflict-free Squash 이전에는 PASS로 판정하지 않는다.
