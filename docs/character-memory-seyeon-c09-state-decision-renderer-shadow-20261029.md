# C09 State → Decision → Renderer 첫 연결 (2026-10-29)

**상태:** 구현된 opt-in 연구 Shadow. 실제 사용자 응답·운영 모델 변경·사주·관계·메모리·DB 쓰기·유료 모델 호출 없음.

## 구현한 연결

- 입력: 기존 `assembleSeyeonRuntimeContextV2`가 만든, **Governed Integrity Preflight 통과 + 공개 첫 턴 1개 + 미인가 자료 0개**의 Context.
- State: `deriveSeyeonC09WorkingStateShadowV1`은 현행 `SEYEON_CORE_ANCHOR_V2`와 실제 사용자 메시지 ID를 연결하며, 확인되지 않은 세션 감정·과거·관계·공유 기억을 **NOT_ESTABLISHED**로 표시한다. State 자체는 영구 저장값이 아니고 사용자 발언은 **UNTRUSTED_USER_INPUT**이다.
- Decision: 기존 `TURN_INTERPRETATION_RESPONSE_SCHEMA_V2`의 `notice / immediateWant / tension / chosenAction / rationale`를 모델이 턴별로 제안한다. 상황→행동 고정 매핑이나 자동 사용자 동조를 구현하지 않는다.
- Renderer: 같은 모델 응답의 `draft`가 제안한 판단에 맞게 발화한다. 모델 자체가 제시한 판단의 정당성은 **기존 Interpretation Guard → Risk Causality Guard → Renderer Packet/Draft Guard → 독립 Semantic Reviewer → 최종 Output Guard**에서 확인한다.
- 호출: 기존 `createSeyeonFastDialogueShadowV1({ promptProfile:'character_state_decision_v1' })`만 선택적으로 연결한다. 기존 `baseline` 및 `compact_v1`은 변경 없이 유지한다. 첫-턴 전체 이력 Census는 생성 전·생성 후·독립 검토 후 재확인한다.
- 출력: 연구 Shadow 결과만 반환. Commit/Reveal 권한 생성·관계 변경·메모리 기록 없음.

## 코드

- `apps/api/src/seyeon-c09-state-decision-renderer-shadow-v1.ts`: 서버 소유 상태 스냅샷 구성 및 기존 구조화 후보 요청 확장
- `apps/api/src/seyeon-fast-dialogue-shadow-v1.ts`: 기존 Shadow opt-in 후보 라우팅. 운영 채팅 코드 변경 없음
- `test/seyeon-c09-state-decision-renderer-shadow-v1.test.ts`: 상태 불변성·위조 방어·동일 출력 스키마·Guard/Reviewer 의무 적용

## 실제 검증

- `tsc -p tsconfig.build.json --noEmit`: 로컬 PASS
- `vitest run test/seyeon-c09-state-decision-renderer-shadow-v1.test.ts test/seyeon-fast-dialogue-shadow-v1.test.ts`: 9/9 PASS
- **`tsc -p tsconfig.json --noEmit`는 로컬 검증 실패**: 임시 Git worktree가 원본 저장소의 `node_modules`를 Junction으로 공유하여, 모바일 테스트가 서로 다른 경로로 해석된 `MyeongHaApiClientV1`의 private field 타입을 호환되지 않는 것으로 본다. 이번 신규 코드에 해당 타입 오류는 없었으며, 정상 독립 의존성 환경의 PR CI에서 전체 검증 필요.

## 제한과 다음 작업

1. **첫 대화 전용**: 아직 기존 C09 다중 턴/영구 Character State 엔진이나 실제 제품 리플라이가 아님. 독립적인 캐릭터가 현실에서 살아간다는 품질 검증도 아님.
2. Core는 현재 main `seyeon-authored-projection-v2`의 원본을 사용한다. C09 Draft Bible/Runtime과 운영 Authority 간 불일치를 본 구현으로 자동 해결했다고 보지 않는다.
3. 실제 세연의 기억·지식·감정/욕구 변화는 기존 승인·사실 출처/Revocation 정책에 연결하는 후속 작업이며, LLM 초안이 서버 Canon/Relationship를 직접 수정할 수 없다.
4. 먼저 15개 C09 공개 합성 회귀·다중 턴 권한 경계에 확장한 뒤 GLM/Luna 검증과 비용/지연/품질 판정. 신규 유료 실행은 별도 승인 조건.
