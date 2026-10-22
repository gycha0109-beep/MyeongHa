# Reader 대화·메모리 — RR-08 최신 실제 Assistant와 Guarded Anchor 교차검사

Watchtower-Track: character-memory

## 문제

공식 Reader Chat 후속 질문 `그 부분을 다시 설명해 주세요`는 과거의 아무 사주 내용이나 가져오는 명령이 아니다. 기존 RR-05 `classifyCharacterStandardFollowupQuestionScopeV1`는 DB 소유의 `ValidatedStandardFollowupAnchor`가 지시하는 Official Reading의 Unit closure와 사용자 의도를 검증한다. 그러나 *가장 최근의 검증된 공식 Answer*와 *실제 대화방에서 가장 최근에 말한 Reader*가 같은 Assistant 메시지인지는 별개다.

예: A(공식 읽기) → B(일상 대화) → `그 부분은?`. A가 최근 검증된 공식 Anchor라는 이유로 B 질문을 A의 사주 주장으로 오염시키면 안 된다.

## 구현

- `reader-conversation-latest-anchor-continuity-v1.ts`는 기존 서버발행 RR-05 Preflight/Grounding과 기존 `ValidatedStandardFollowupAnchorAuthorityPortV1`만 사용한다.
- 이미 존재하는 `ReaderContextNonMemoryReadAuthorityPortV1.readRecentMessages`로 실제 소유 Thread의 메시지들을 읽어, **sequenceNo 기준 가장 최근 Character Assistant 메시지 ID**를 구한다.
- RR-05가 자체 검증한 `evidence.assistantMessageId`와 정확히 같아야만 내부 연속성 후보를 발행한다. 최신 Character 응답이 일반 대화·고민 안내였다면 이전 Official Anchor에 끼워 맞추지 않고 HOLD한다.
- 전후 두 차례 조회의 메시지 ID/sequence/role/Reader 메타데이터가 바뀌거나 cross-Reader, 중복, 유효하지 않은 sequence가 있으면 HOLD한다.
- 대화 본문 `text`는 절대 후보·Digest·로그에 넣지 않는다. 판정에 사용하는 것은 서버 읽기의 메타데이터와 기존 Guarded Official Anchor뿐이다.
- 출력은 `last_validated_official_answer_candidate`라는 **비권한 후보**다. `permitsModelInjection:false`, `permitsCommit:false`, `permitsHttpReveal:false`, `addedModelCalls:0`. 실제 개인정보 Pin, 사주 의미 재서술, 새로운 LLM 호출, 공개 Chat/Route는 없다.

## 기존 로드맵과 경계

- Reader Runtime [RR-01~15 종료 로드맵](../architecture/READER_RUNTIME_V2_TRACK_CLOSEOUT_ROADMAP.md)의 RR-08 멀티턴·Guarded Anchor 범위. 새로운 RR 단계나 별도 모델 호출을 설계하지 않는다.
- RR-03/04 DB Owner의 공식 Answer provenance/Anchor writer가 없는 동안 생성된 후보를 공개 결과로 사용하지 않는다. RR-07/P0-AI 결정과 RR-09/10의 최종 원자 저장·권한 철회 검증도 불변.
- PR #2440의 일반 대화/고민과 공식 사주 의도 분리, PR #2444의 동의 기억/관계 출처 후보와 중복·재권위화하지 않는다. 각각 다른 근거이며 서로를 대신하지 않는다.
- 새로운 Security 판정, Memory Projector 활성화, Saju Source Unit 생성, Data Writer, 네 번째 LLM 호출 없음.

## 테스트

`test/reader-conversation-latest-anchor-continuity-v1.test.ts`: 최근 실제 Character 식별, 비정렬 DB 응답 순서, 다른 Assistant의 끼어듦, 메시지 중복/reader 충돌, 잘못된 sequence/role, 개인정보 본문 비노출, 서버발행 객체가 아닌 요청의 조기 거절 및 모델 호출 불가.
