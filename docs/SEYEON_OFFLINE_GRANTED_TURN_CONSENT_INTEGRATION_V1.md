# 세연 개인기록 사용 승인 — 오프라인 구현 연결 계약 v1

Watchtower-Track: character-memory

근거: [보안 G0–G6](./security/SEYEON_AI_SECURITY_COMPLETION_GATES_V1.md), [#1843](https://github.com/gycha0109-beep/MyeongHa/issues/1843), [#1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866).

## 승인된 개발 범위

- 사용자 소유 및 실제 사용 허가된 개인기록만 선택하여 캐릭터 문맥에 활용.
- 선택된 원본 Record/Grant와 정확한 모델 투입 출처는 Provider **이전** 영속 Pin 필요.
- 생성 후 최종 Commit과 동일한 DB 트랜잭션에서 **기존 exact Grant** 및 기록 현재 상태를 재검사. Grant 재발급은 구 Attempt에 소급하지 않음.
- 최초 Reveal 및 committed replay/과거 응답은 **현재 공개 권한**을 재검사하고 취소 후에는 응답 본문 전부 HOLD.
- 최초 활성화 시 개인기록 응답 스트리밍 OFF. 이미 전송된 바이트는 철회할 수 없음.
- 운영 DB/기존 스키마 및 소유권, 유료 AI 모델, public route, Production Projector와 Governor 모드는 변경하지 않음.

## 이번 코드의 범위

`apps/api/src/seyeon-offline-granted-turn-v1.ts`는 위 순서를 조합하는 **오프라인 실행 경계**입니다. 테스트는 합성 모델 출력과 합성 권한 포트를 사용하여 pre-model pin 실패, revoke-before-commit, revoke-before-reveal, Grant 교체 후 과거 답변 재조회 거부를 검증합니다. 반환되는 공개 본문은 별도 Current Grant Reveal 포트를 통과한 경우에만 생성합니다.

**현재 Production Chat에는 연결하지 않습니다.** 기존 `SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1=[]`와 positive precommit HOLD, `routeMounted:false`, 운영 DB의 zero-only 선행 Pin은 그대로입니다. 코드상의 Pin/Commit/Reveal 인터페이스는 **DB 인증·최소권한·원자성 증거가 아닙니다**. 클라이언트가 원본 Pin 또는 Grant ID를 직접 제출하는 공개 인터페이스도 없습니다.

## G3-A — 실제 HTTP 전송 경계의 Fail-Closed 연결 (운영 권한 미완료)

`apps/api/src/chat-turn-send-http.ts`의 `handleSeyeonChatTurnSendRequestV1`에
**필수** `controlledDisclosurePort` 인자를 추가합니다.

- Member 인증 및 엄격한 요청 본문 검사 뒤 **공개권한 Port의 존재부터 검증**하므로 Port가 없는 환경에서는 모델/기존 대화 조회 실행이 시작되지 않습니다.
- `executed`와 `committed_replay` **둘 다 동일한 Reveal Port**를 거칩니다. Port 입력은 서버 검증 Member Evidence, Runtime이 확인한 Subject, 원본 Thread, Turn, Attempt, Assistant Message ID뿐이며, 모델 원문과 저장 원문은 전달하지 않습니다.
- 응답의 `assistantText`는 Runtime 모델/Replay 응답이 아니라 **해당 Port가 승인 후 반환한 본문만** 사용합니다. Port 거부·장애·누락·스코프 불일치는 동일한 본문 없는 `503 CHAT_DISCLOSURE_UNAVAILABLE`로 종료합니다. 자동 재시도 허가는 거부합니다.
- 서버 응답 Thread의 일치 및 단일 세연 참가자 여부를 검사합니다. 브라우저 요청에 Grant/Owner/Disclosure 권한을 추가할 수 없습니다.
- **중요:** 현재 통합 가능한 실제 DB Owner Reveal Port 구현은 존재하지 않습니다. 위 조건은 HTTP 전송 지점의 강제 의존성이지 DB 사용 권한 승인이 아닙니다. 이 코드만으로 세연 Chat 공개 Route를 마운트하면 안 됩니다. G0 선형화/과거 Context 및 G1/G2/G3 실 DB 권한 계약이 필요합니다.
- 합성 HTTP 테스트는 서버가 허용한 본문과 Runtime에 남은 위험 텍스트를 분리해, 성공·거부·예외·Replay·다른 Thread·Port 누락을 검증합니다. 이는 실제 DB 권한 검증의 대체물이 아닙니다.

## G3-B — 과거 대화/파생 Relationship 조회 차단 및 DB Port 계약

- `chat-read-http.ts`: DB thread binding에 `seyeon` 참가자가 있는 경우 일반 `qry_chat_thread_stream_v2` 및 `qry_character_relationship_v1` 호출을 **생략**하고, `seyeonHistoryDisclosurePort.readAuthorizedPage`에 서버 해석 Subject/Thread/Cursor/Transaction client를 전달합니다.
- 실제 Production Chat-read composition root에서 이 Port를 서버 전용으로 주입할 수 있지만, 현재 DB Owner 승인 구현은 **없음**. 기본값은 Port 없음 → `503 CHAT_DISCLOSURE_UNAVAILABLE` / `no-store`; SQL raw stream fallback 없음.
- Port 응답도 세연 Character ID, 정렬된 sequence, 중복 message ID, sender shape, 한 페이지 범위를 검사합니다. 실패 또는 PostgreSQL 오류에서는 **전체 페이지 HOLD**. 세연 Relationship projection은 유래한 개인기록 권한 상속이 정해지기 전까지 항상 `null`.
- **중요한 범위 제한:** Port interface와 합성 단위테스트가 current Grant를 검증하는 실제 DB 권한 함수를 대신하지는 않습니다. 개인기록의 파생 관계 이벤트·다른 시스템 Reader/Saju의 역사 기록은 범위 밖이며 G0/G3 HOLD.

## G1/G2 오프라인 PostgreSQL 실 DB 후보와 G3 HTTP 연동

- `test/db/seyeon_positive_grant_attempt_bound_candidate_v1.sql`은 **독립 폐기 DB 전용** `seyeon_positive_candidate` 스키마를 만듭니다. 기존 실 `chat_turn_attempts` FK, `subjects` / `conversation_threads` / `chat_turns`, 실 `memory_items`·`record_access_grants`에 서버 DB source lookup + 원래 Grant ID + Memory type/schema + pg-jsonb digest Pin을 결속합니다.
- `pin_before_model_v1`, `commit_test_v1`, `reveal_test_v1`은 원본 Grant와 Memory를 DB row lock하여 재검증합니다. 직접 sidecar DML을 API 역할에서 금지하고 Pin 필드 immutable trigger, duplicate Attempt Pin, Grant mismatch, 새 Grant reissue, 내용 변경 시 HOLD를 검사합니다.
- **실행 증거에는 한계가 있습니다.** 이 스키마는 `supabase/migrations`에 추가되지 않는 TEST-ONLY 후보다. `commit_test_v1`은 실제 `cmd_commit_seyeon_chat_turn_runtime_v2`를 호출하거나 assistant message를 발행하지 않습니다. `sha256:pg-jsonb:v1`은 PostgreSQL sidecar 내용 변화 확인용이고 현재 TS `canonicalJson`의 `sha256:v1`과 같은 digest임을 주장하지 않습니다. 정규화와 디지털 무결성의 승인도 남았습니다.
- `test/db/seyeon_positive_grant_candidate_real_http.sh`와 `test/seyeon-controlled-disclosure-real-postgres-candidate.test.ts`는 폐기 CI DB의 candidate Reveal을 **실제 Node PostgreSQL 드라이버**에서 현재 권한 확인 후 HTTP `controlledDisclosurePort`에 전달합니다. 첫 응답/Replay 모두 DB 유효 원본 Grant 시에만 합성 메시지를 공개하고, Grant revoke 및 별도 Grant 재발급 후에는 503으로 숨기는 것을 검증합니다. 실제 Provider/Production API는 실행하지 않습니다.
- **실제 서비스 G1/G2/G3 PASS 금지:** Security/DB/Character G0 Owner 계약 확정 → 운영 권한 RPC forward-only 이관·원자 Commit → 현재권한 Reveal 및 History/Relationship DB Owner query→ 필요하면 HTTP Port 명시적 주입 → 별도 Release G5/G6 순서가 필수입니다. 초기 세연 공개 route OFF, zero-personal Pin, positive Projector OFF, 유료 Governor 기본 OFF 유지합니다.

## 실제 연결 전 필수 미완료 사항

1. **G0:** Security/DB/Character 소유자가 기록 종류·출처 스키마·과거 대화/관계 이벤트에서 파생된 개인정보 권한 상속·취소 효력·Reveal 선형화 시점을 확정. 사용자 승인으로 기본 개발 방향은 결정됐지만 이 세부 계약을 임의 확정하지 않음.
2. **G1:** DB Owner가 모델에 실제 들어간 positive 집합 전체를 immutable Attempt Pin으로 저장하고, 동일 attempt/digest/subject/thread 및 DB 최소권한을 입증.
3. **G2:** 실제 `cmd_commit_seyeon_chat_turn_runtime_v2` 한 트랜잭션 내 Grant row lock 및 record digest 검증과 revoke 경쟁 시험.
4. **G3:** 최초 HTTP/committed_replay/과거 Context/worker의 Current Grant 공개 검사와 저장·공개 경합 정책. 본 파일의 authority port는 구현 책임 분리이지 완성된 DB adapter가 아님.
5. **G5/G6:** PostgreSQL 독립 2세션, 실제 HTTP, CI, 운영 승인·복구 증거 별도. Reader 구매 기반 허가는 #1827 권한 소유 범위 준수.

이 PR은 positive 개인기록 운영 허용·G0~G6 PASS 또는 운영 승격을 주장하지 않습니다.
