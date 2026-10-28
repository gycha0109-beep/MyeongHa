# 명하 공통 캐릭터 — C09 대화 연속성 재구성 (2026-10-28)

**트랙:** `character-memory`
**범위:** 연구용 Shadow / 기존 C1 공통 Character Runtime 연계 / 운영 권한·모델·DB 미변경
**기준 브랜치:** `feat/character-memory/c08-local-one-call-shadow-v1` · Draft PR #2575

## 1. 문제와 수정 방향

기존 `seyeon-c09-dialogue-continuity-shadow-v1.ts`에 최근 발화 ID의 선택, 출처 증빙, 판단 연속성 설명이 세연 전용으로 들어 있었다. 명하는 세연 단일 챗봇 서비스가 아니라 **캐릭터별 Canon·Persona·Behavior를 기존 공통 Runtime에 조립하는 플랫폼**이다.

이번 수정은 새 기억·관계 엔진을 만드는 작업이 아니다. 이미 존재하는 다음의 공통 권한 및 콘텐츠 인터페이스를 재사용한다.

- `packages/domain/src/character-runtime-context.ts`: `CharacterRuntimeContextV1`의 `characterId / speech / persona / behavior`를 재사용 가능한 입력 타입의 기준으로 사용.
- `packages/character-content/src/runtime-authoring-v1.ts`: 현재 작성된 9명 분의 성격·행동 정의를 **Shadow 테스트/입력**에 사용. 이 레지스트리는 미승인 Canon 또는 Production 공개 권한이 아님.
- 기존 메모리 Grant, 관계 Projection, Disclosure, Saju, Guard, Commit/Reveal은 **기존 코드만 권한**을 보유하고 이 연구용 헬퍼는 변경하지 않음.

## 2. 공통 구현

`packages/domain/src/character-dialogue-continuity-shadow-v1.ts`

1. **공통 대화 연속성 Packet:** 모든 캐릭터가 같은 구조로 메시지 ID, 앞서 해당 캐릭터가 한 발화의 ID, 현재 사용자 발화 ID를 참조. 특정 상황 키워드나 캐릭터별 고정 대사를 사용하지 않음.
2. **기존 성격/행동 정의를 통한 인물 관점:** `speech / persona / behavior`에서 언어 습관, 판단 속도, 결론 내리는 방식, 질문 방식, 갈등·경계 표현을 읽는 `decisionProfile`을 구성. 캐릭터 ID는 서버가 선택하며 사용자 메시지에서 변경 불가.
3. **공통 출처 검증:** `characterId + subjectId + threadId + currentUserMessageId + ordered tailMessageRefs`를 함께 검증. 다른 캐릭터, 다른 스레드, 순서 오류 또는 불완전한 스냅샷은 실패.
4. **권한 경계:** 앞서 출력된 문장은 '그렇게 말했다'는 자료이지 '그 일이 일어났다'는 증거가 아님. 기억·관계·세계관·Saju·실제 하루의 기록은 자동으로 생성하거나 승격하지 않음.
5. **공통 API Export:** `packages/domain/src/index.ts`에 명시적으로 노출. `CharacterRuntimeContextV1`과 동일한 작성 필드 계약을 사용하여 다른 캐릭터에도 별도 로직 복제 없이 공급 가능.

## 3. 세연 C09 연결

`apps/api/src/seyeon-c09-dialogue-continuity-shadow-v1.ts`

- 이 파일에서 캐릭터 비종속 대화 연속성 계산과 출처 검증 코드를 제거하고 공통 함수를 호출하게 변경.
- 세연 특수 사항은 기존 C09 PUBLIC 첫 연구·무기억·무관계 자격 검사, 독립 리뷰에 연결되는 V2 응답 Schema, 연구용 공개 성격 자료 및 레거시 C09 Snapshot 형식 어댑터로 한정.
- 레거시 C09 snapshot 자체에는 characterId가 없으므로, 엄격한 세연 전용 Context 검사를 먼저 수행한 뒤 공통 검증기에 `characterId: seyeon`을 전달. **다른 캐릭터는 반드시 공통 9필드 Snapshot 포트를 직접 사용**해야 함.
- 기본 Production 및 세연 첫 턴 전용 `seyeon-fast-dialogue-shadow-v1.ts`는 변경하지 않음.

## 4. 검증 근거

- `test/character-dialogue-continuity-common-shadow-v1.test.ts`: 실제 레지스트리의 9개 캐릭터 전부 동일 공통 API 활용, 서로 구분되는 `decisionProfile`, 거짓 사건 기억 금지, 교차 캐릭터 스레드 검증.
- 기존 `test/seyeon-c09-dialogue-continuity-shadow-offline-v1.test.ts` 등 C09·첫 턴 회귀 검사도 유지.
- 유료 모델 요청/스토리지 변경/장기 기억 기록/Production routing 변경 **없음**.

## 5. 정확한 한계 및 후속

- 현재 실제 운영 라우팅은 변경되지 않았다. 공통 타입 및 Shadow 계획이 구현된 것이지 각 캐릭터가 Production에서 연속 대화를 생성한다고 주장하지 않는다.
- 9명 작성 데이터는 운영 Canon과 동일하지 않으며, 공개 허가받지 않은 심층 심리·과거·동기 정보를 자동 노출하지 않는다.
- 전체 스레드 검증 포트는 합성 데이터로 검사한 **읽기 전용 계약**이고 운영 DB에 연결하지 않았다. 또한 현재 증빙은 메시지 ID의 순서만 검사하며 원문 바이트의 권한을 별도 증명하지 않는다. 서버 어댑터에서 정식 소유·스냅샷 검증을 추가해야 한다.
- 이어질 기존 로드맵 작업: 서버 소유 스레드 조회를 공통 포트에 연결 → 기존 해석·Guard·독립 Semantic Reviewer를 포함한 다중 턴 Shadow → 캐릭터별 실제 생성 결과 품질 비교. 필요한 모델 호출은 별도 과금 승인이 선행되어야 한다.
- 이 연구에서 관계 진전, 영구 욕구/생활 시뮬레이터, 운영 변경, Canon 승격을 새로 구현하지 않는다.

**결론:** 세연을 위한 별도 엔진을 만드는 방향을 중단했다. 공통 C1 캐릭터 정의를 받아 대화 연속성과 증빙을 처리하는 한 개의 연구용 공통 헬퍼로 재구성했으며, 세연 C09는 해당 헬퍼의 첫 어댑터로 남긴다.
