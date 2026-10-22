# Reader 대화·메모리 — RR-08 동의 기억·관계 연속성 후보

Watchtower-Track: character-memory

## 기존 구현과 실제 경계

- Reader의 일반 대화·고민은 공식 사주 검색을 매번 강요하지 않는다. 별도 Reader 의도/Official Source 경로 PR #2440의 기존 의도 분기와 병렬로, **현재 대화방에 속한 Reader·동의 기억·관계 상태의 출처만 읽는** 내부 Shadow를 구현한다.
- 기존 소스 권한은 `getChatThreadRuntimeBinding`, `getCharacterRelationship`, `getMemoryItems`, `getMemoryGrants`이며, 새 Reader/기억 권한이나 Projector를 발행하지 않는다.
- 단일 활성 Thread Reader를 **DB 조회로 결정**하고, 같은 Subject의 현재 Relationship revision/policy를 읽는다. 메모리 항목별 해당 Reader의 현재 Grant 한 건만 후보로 취급한다.
- 모든 결과는 `memoryItemId`, `grantId`, `memoryType`, `schemaVersion` 및 관계 revision 등 **출처 메타데이터**로 한정한다. 실제 memory content/summary는 조회 응답에서 재사용하거나 클라이언트에 노출하지 않는다.
- 다른 Reader만 허용된 기억은 제외한다. 동일 Reader의 중복 Grant, 충돌한 메모리, 읽기 오류, 비활성 Thread, 현재 관계 부재는 HOLD한다.
- Thread 및 Relationship을 다시 읽고, 후보 Memory의 해당 Reader Grant도 다시 읽어 확인한 뒤 후보 스냅샷을 만든다. 중간에 발견된 삭제/철회/Reader 전환은 HOLD하나, **세 읽기가 원자 트랜잭션이나 G1 DB source pin을 대체하지 않는다**.

## RR-05/08 의도 조건부 연결 (비공개 내부 후보)

`prepareReaderOrdinaryContinuityPlanV1`은 기존 병합 PR #2440의 `classifyReaderConversationIntentV1`과 위 RR-08 출처 후보를 결합한다. `ordinary/support`이면서 의도 분류의 위험·공격 신호가 없는 경우에만 관계·동의 기억 출처 메타데이터를 조회한다. 공식 사주 요약·후속 질문은 기존 RR-05/06 Official Reader 경로로 남겨 두며 이 함수가 동의 기억이나 공식 문장을 읽지 않는다. 위험 신호가 있으면 기존 Security Gate 판단 전까지 HOLD한다.

반환 결과의 `approvedMemoryContent`는 항상 `null`이고 `modelContextPinned/permitsModelInjection/permitsCommit/permitsHttpReveal` 모두 `false`다. 따라서 실제 Reader 모델 프롬프트나 사용자 응답에 기억 내용을 주입하지 않는다. 새로운 상담 모드나 모델 호출이 아니고, 단지 기존 관계/기억 증거를 올바른 대화 의도에만 결합하는 서버 내부 준비 단계다.

## 결과물 계약

`prepareReaderConversationConsentContinuityShadowV1`은 다음 성질의 **비권한 후보**를 반환한다.

- `mode: non_authorizing_source_candidate`; `sourceDigest`는 내부 결정적 식별용이며 소비 권한이 아니다.
- `officialReadingRef: null`, `officialSajuSourceUnitRefs: []`: 기억에서 공식 사주 결론을 유추하거나 Official Reading 사실로 승격하지 않는다.
- `modelContextPinned: false`, `permitsModelInjection: false`, `permitsCommit: false`, `permitsHttpReveal: false`.
- `addedModelCalls: 0`: 세연 C08 3회 Shadow/Provider·기존 Reader Guard 단계 불변.

## 실제 사용자 전달의 남은 조건

1. Security/DB Owner의 현재 원본 Grant + G1 Pin → G2 원자 Commit → G3 공개/철회 경계. 단순 후보 해시는 모델 Memory 주입 승인이 아니다.
2. Reader RR-03/04의 검증된 Assistant Saju Unit provenance 및 후속 Anchor. 관계 Memory ID를 Saju Unit으로 쓰지 않는다.
3. Reader RR-09/10 최종 현행 Reading/Grant/Content Release/T2 재조회, 원자 저장·재시도·환불 차단, RR-11/12 HTTP·UI.
4. 승인된 Character Bible/voice, Semantic/Output Guard, 공식 Saju 의미·Product/Commerce/Privacy의 독립 판단.
5. P0-AI-01, P0-AGE-01, Saju Production Semantic, 유료 Reader Chat PUBLIC OFF 유지.

## 검증 범위

`test/reader-conversation-consent-continuity-shadow-v1.test.ts`: Reader별 Grant 필터, 원본 기억 텍스트 배제, 다른 Reader, 원본 Subject/Thread, Grant 철회, 관계 revision 및 Reader 변경 중도 검출, 중복 Grant·권한 조회 실패.

유료 모델 API, DB migration, 실제 운영 데이터, 공개 HTTP/Chat Route 변경 없음. CI 통과 자체를 Production 개인정보 모델 사용 승인으로 표기하지 않는다.
