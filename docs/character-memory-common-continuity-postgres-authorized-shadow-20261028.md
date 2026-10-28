# 명하 C1 — 서버 소유 대화 이력 공통 Shadow 연결

Watchtower-Track: character-memory
상태: 연구용 Shadow 구현, 모의 DB 검증 / Production 미연결 / 실모델 호출 없음

## 실제 변경
- 기존 PostgresSubjectExecutionScopeV1에서 이미 확인된 Subject 소유권을 재사용한다. 별도의 인증·새 RPC는 만들지 않는다.
- 기존 qry_chat_thread_runtime_binding_v1 및 public.conversation_messages로 단일 SQL 문장에서 활성 대화방·참여 캐릭터·전체 메시지 수·최근 12건의 ID, 발신자, 본문, 순서를 읽는다.
- 입력 Context의 원문과 DB 원문을 바이트 단위의 동일 문자열로 비교한다. 같은 ID로 이전 답변을 바꿔치기해도 거부한다.
- 모든 캐릭터에 같은 CharacterThreadSnapshotShadowPortV1을 적용하며, 다른 캐릭터/다른 사용자/다른 Thread/삭제 또는 redacted 시스템 메시지/불완전한 이력은 거부한다.
- prepareCharacterDialogueAuthorizedShadowV1은 기존 CharacterRuntimeContextV1의 speech/persona/behavior와 DB로 확인된 대화를 결합한다. Runtime 최근 본문도 검증해야 통과한다.
- 이 연구용 PUBLIC 후보는 Memory, Life Fact, Saju가 있으면 차단한다. 결과는 mayInvokeProvider=false, mayReveal=false이며 모델과 DB 쓰기·Commit·관계 변경을 실행하지 않는다.

## 확인과 미확인
- TypeScript 및 오프라인 모의 DB/일관성 검사만 완료. 실제 PostgreSQL에서 SQL 실행·RLS/권한 검증이 되었다고 주장하지 않는다.
- 호출하려면 기존 executePostgresSubjectTransactionV1 콜백 내부에서 scope를 전달해야 한다. 한 쿼리의 snapshot이 다음 요청/메모리 철회 및 후속 검토를 영구 잠그지 못하므로 후속 생성·검토·Reveal 전 재검증은 별개다.
- 후속 로드맵: 기존 공통 캐릭터 생성·검토/Guard의 multi-turn Shadow 연결 및 실제 DB 실행 확인. 추가 유료 모델 실험 전 승인이 필요하다.
- Production 경로, Canon, Grant, Relationship, Saju 권한, 스키마 Migration, Provider/과금 모두 미변경.