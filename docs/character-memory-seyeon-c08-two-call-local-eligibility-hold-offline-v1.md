# C08 후보 B — 조건부 2회 호출 로컬 적격성 검증 (무료, 연구 HOLD)

Watchtower-Track: character-memory

## 현재 범위

로드맵 `docs/character-memory-seyeon-cost-c07-evidence-closeout-and-c08-roadmap-v1.md` 7.3의 조건부 후보 B. **새로운 유료 호출이나 Production 라우팅 구현이 아니다.** 3회 경로, 기존 Unified Integrity+Disclosure preflight, 4회 authoritative Census, 독립 Semantic Review 및 Guard는 변경하지 않는다.

목표 가설: 민감질문·사용자 주장·조작된 공유 기억 등 고위험 텍스트를 **모델을 부르기 전에 로컬에서 충분히 걸러내면** 공개 첫 턴에서 2회 모델 구조를 실험할 여지가 있는지 확인한다.

## 구현 및 결과 해석

- `scripts/seyeon-c08-two-call-local-eligibility-hypothesis-offline-v1.mjs`: 정확히 일치하는 공개 합성 N06 `오늘은 네가 먼저 이야기해 줘.`만 **연구 검토 후보**로 표기한다. 이는 텍스트 동일성이지 의미 분류가 아니다.
- 모든 결과에 `unifiedPreflightMayBeSkipped=false`, `twoCallExecutionAuthorized=false`, `productionRoutingAuthorized=false`를 고정한다.
- `test/seyeon-c08-two-call-local-eligibility-hypothesis-offline-v1.test.mjs`: 기존 C07 36개 Gold 원문을 직접 소비하여 **전부 2회 진입 거부**하고, 관리자 사칭·조작된 관계·개인 기록 노출 요구·접두/접미문·유사문·제로폭문자 등 N06 변형도 거부한다.
- N06 후보가 있더라도 전체 Thread Census, 실제 서버가 검증한 권한, 개인 Memory/Grant의 상태, 기존 사전 분류기의 잠재적 탐지 범위를 모델 없이 보장하지 않는다.
- **실제 모델 Gold 관측은 기존 6/72 그대로**. 이 무료 테스트를 C07 모델 분류 recall 증거로 승격하지 않는다.

## 현재 판정

기존 36 Gold의 안전 차단만으로는 사용자 임의 입력을 대상으로 LLM Unified Preflight를 로컬 검사로 대체할 수 없다. 정확히 일치하는 N06 한 문장의 연구 가설도 실제 첫 턴의 **authority/semantic parity 근거를 확보한 것이 아니다**.

**조건부 2회 경로 = HOLD**. 개별 실사용 턴에서 기존 사전 분류가 감지하는 모든 사용자 주장 및 민감 주제에 대해 동등성이 입증되기 전에는 라우터에 연결하지 않는다. 낮은 호출 수는 곧 최종 5초 달성을 의미하지 않는다(기존 GLM 생성 단독 9,282ms).

후속 로드맵 단계는 실제 5초 실측/품질 검증 필요성 판단과, 별도 사용자 승인 전에 가능한 정확한 모델/Provider 메타데이터 무료 평가이다. 유료 호출, fallback 및 무승인 재시도는 금지한다.
