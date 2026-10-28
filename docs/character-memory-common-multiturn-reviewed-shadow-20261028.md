# 명하 공통 캐릭터 — 다중 턴 판단·대사·독립 검토 연결 (2026-10-28)

Watchtower-Track: character-memory
Scope: DEVELOPMENT / TEST ONLY, RESEARCH SHADOW, PRODUCTION NOT WIRED

## 실제 구현

- `apps/api/src/character-dialogue-multiturn-offline-shadow-v1.ts`는 기존 C1 공통 `CharacterRuntimeContextV1`, `CharacterDialogueContinuityPlanShadowV1`, `guardCharacterRendererOutput`, Subject-scoped PostgreSQL Snapshot Shadow를 **새 운영 엔진으로 대체하지 않고** 함께 사용한다.
- 단계: 서버 대화 원문 확인 → 캐릭터별 판단 후보(decider) → 서버 재확인 → 대사 후보(renderer) → 기존 공통 출력 형식·감정 Allowlist 검사 → 서버 재확인 → 별도 reviewer의 의미 검토 → 서버 재확인 → **검증된 연구 후보만 반환**.
- 매 단계에서 active Character, Thread/Subject, 메시지 ID·발신자·원문·순서가 바뀌면 중단한다. 전체 대화 증명은 제한된 최대 12건의 최근 대화 내용이며, 그 이전의 사건·관계·기억의 진실을 증명하지 않는다.
- 판단 후보는 서버 캐릭터 ID, 현재 사용자 메시지 Ref 및 알려진 메시지 Ref만 허용한다. Notice의 근거는 현재 사용자 발화를 포함해야 한다.
- 렌더러는 원문 대사와 기존 `CharacterRendererDraftV1`의 제한된 Cosmetic 필드만 생성한다. 기억/관계 Event 후보·개인 Memory Ref·비공개 Ref는 허용하지 않는다. `guardCharacterRendererOutput`은 Cosmetic 검증에만 사용하며 대사 의미 검증으로 과장하지 않는다.
- 독립 Reviewer는 Decider/Renderer와 서로 다른 Provider ID를 사용해야 한다. 대사와 판단의 SHA-256 지문이 정확하게 일치해야 하고, 의미 위반 코드가 한 건이라도 있으면 실패한다. 그러나 Model 기반 Reviewer의 실제 정확성은 검증되지 않았다.
- 반환 값의 권한은 `mayCommit=false`, `mayReveal=false`, `mayCreateMemory=false`, `mayModifyRelationship=false`로 제한한다. 외부 DB Write/모델 연결/Reveal/지속 상태 변경 코드 없음.
- `assertEngineeringVerticalSliceMockExecution`으로 일반 Production 환경 실행을 금지한다. 실모델 Provider Adapter와 Production HTTP 경로는 연결하지 않는다.

## 공통 캐릭터·연속성 테스트

- `test/character-dialogue-multiturn-offline-shadow-v1.test.ts`: 기존 9명 Authoring 데이터를 사용하며, 같은 코드 경로에 각자의 Voice를 전달하는 것을 검증.
- 3/5/7/9개 메시지로 독립 판단·대사·검토를 실행한다. 별도 연속 시나리오는 리뷰 통과한 이전 대사를 다음 턴 서버 Mock Thread의 Assistant 본문으로 넣어 3회 연달아 검증.
- 다른 캐릭터/소유자/근거 Ref, 검증 중 새 메시지·변조된 이전 대사, 확인되지 않은 기억/공개·Event 제안, Cosmetic Allowlist 위반, 동일 Reviewer ID, Reviewer Hash 불일치 및 실패 판단은 모두 fail-closed로 차단.
- 검증은 **오프라인 합성 DB Row와 모의 Provider**에 대해서만 수행. 실제 유료 모델 호출 0회, 실제 PostgreSQL 연결 0회.

## 기존 구조를 존중해야 할 사항

- 기존 세연 V2에는 캐릭터별 Turn Interpreter, Risk Causality, Renderer, Semantic Reviewer 및 공개 단계 검증이 있다. 위 모듈은 이것을 **9명 모두 사용 가능하도록 이미 공통화한 Production 대체품이 아니다.** 공통화 작업의 Shadow 후보를 통한 의미 검증 경계를 시험한다.
- 기존 C1 `CharacterDialogueEnvelopeV1`은 보호된 사주·Cosmetic 중심이므로 새 대사 필드를 이 Envelope에 임의 추가하지 않는다. Shadow의 `draft.utterance`는 별도이며 실제 HTTP 공개 권한이 없다.
- 캐릭터의 자율적 판단이 실제로 자연스럽고 인격적으로 느껴지는지는 **실모델 다중 턴 품질 검증 전까지 미확인**이다. 테스트의 독립 Provider는 Mock이며 실제 인물의 판단 품질을 보장하지 않는다.
- 1인 개발 프로젝트의 실제 Canon·Memory·Relationship·Saju·DB 권한을 건드리지 않는다.

## 다음 개발 순서

1. 현재 Subject-scoped SQL을 권한이 올바른 실제 PostgreSQL 실환경/격리 테스트에서 확인한다. ACL·RLS·실행 역할 확인 없이 운영에 연결하지 않는다.
2. 실제 캐릭터 공통 Planner/Renderer/Reviewer로 적용할 수 있는 정식 계약과 서버 권한 검증을 기존 Character C1 Runtime에 맞춰 구현. 단일 턴·다중 턴의 콘텐츠 범위 및 최종 Commit/Reveal 직전 동시성 검사를 보완.
3. 별도 비용 승인을 받은 후 캐릭터별 실모델 다중 턴을 비교하고, 기억 조작·무조건 동조·캐릭터 성격 붕괴·대화 연속성을 평가한다.

**CI/Production status:** 본 문서가 실제 DB 통합, CI 완료, 제품 출시 승인을 의미하지 않는다.
