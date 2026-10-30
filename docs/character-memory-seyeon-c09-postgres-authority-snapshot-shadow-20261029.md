# C09 다중 턴 DB Authority Snapshot Shadow (2026-10-29)

> **구현 상태:** read-only PostgreSQL adapter + 단위 테스트 완료. **Production 미연결**, 실제 운영 DB 대상 검증 미실시, 모델 호출/DB mutation/과금 변경 없음.

## 구현

- `apps/api/src/postgres-seyeon-c09-continuity-shadow-v1.ts`: 기존 `PostgresSubjectExecutionScopeV1`의 검증된 canonical Subject와 동일 트랜잭션 client만 받는 독립 조회 어댑터. 브라우저나 LLM이 지정한 Subject를 신뢰하지 않음.
- `createPostgresSeyeonC09ContinuityShadowV1`: 위 DB Snapshot Port를 기존 C09 후보 생성·독립 Reviewer·출력 Guard에 연결하는 **명시적 Shadow-only 실행 팩토리**. 운영 API 라우팅은 추가하지 않음.
- **완전한 메시지 census:** 기존 `qry_chat_thread_runtime_binding_v1`와 `conversation_messages`에서 active+단일 세연 스레드인지 확인하고 전체 메시지 수(삭제/가림 기록 포함), 마지막 메시지 ID·발신자·텍스트·redaction 여부 확인. 기존 bounded recent-message만으로 첫/최신 턴을 증명하지 않음.
- **관계:** 기존 `qry_production_relationship_runtime_v1` → `readSeyeonProductionRelationshipTurnBindingV1` → 정책 기반 Band/Overlay projection으로 관계 state·revision을 **독립 재조회**. 모델이 제공한 관계 상태 사용 금지.
- **기억:** 기존 `qry_seyeon_production_personal_record_context_v1`, `qry_production_relationship_history_runtime_v1`, `qry_reader_context_recent_messages_v1`를 `composeSeyeonProductionContextV1`으로 조립하고, model context에 포함된 **기억 ID·sourceRef·claimKind·summary·causalAuthority·relevance·salience 및 최근 대화**와 일치해야만 통과.
- 개인 기록은 **server-owned 승인된 projector 목록**만 사용함. 기본값은 빈 목록으로, 권한 없는 positive-memory를 자동 투입하지 않음. 게시/삭제/승인·철회 명령 호출 0건.
- `grantSetRevision`이라는 잘못된 가상 버전 필드를 **`grantSetFingerprint`(SHA256)** 으로 교체. 실제 서버에 전역 Grant revision이 있다는 주장 제거. 승인된 projector의 grantId/원본 Digest/Projection Digest를 재계산해 비교. 숫자 revision을 임의 생성하지 않음.
- `seyeon-c09-continuity-shadow-v1.ts`는 기존대로 후보 생성 전·후 및 독립 Semantic Review 후 **3차례 서버 조회**를 요구. 메시지·Grant Fingerprint·관계 변경 시 fail-closed.

## 기존 API 재사용

- `postgres-seyeon-first-turn-census-shadow-v1.ts`: Subject-scoped Thread 검증 접근 참고. 다중 턴은 기존 첫 턴(최대 2개)과 달리 전체 count 필요.
- `postgres-seyeon-production-context-read-v1.ts`: 승인된 personal record 및 관계 사건 이력·최근 대화 조회.
- `postgres-seyeon-production-relationship-read-v1.ts`, `seyeon-production-relationship-band-v1.ts`: 관계 Projection/정책 일치.
- `seyeon-production-context-v1.ts`: Production과 동일한 record projector/record grant 검증 및 모델에 제공할 memory projection.
- `postgres-subject-execution.ts`: 기존 canonical Subject 실행 범위. 새 인증 또는 DB 보안 definer 추가 없음.

## 검증

- `tsc -p tsconfig.build.json --noEmit`: **PASS** (2026-10-29).
- 관련 4개 Vitest 파일: **23/23 PASS** (Postgres 모의 query, 승인된 memory projection, revoke-between-calls, stale/forged thread/relationship/memory, independent reviewer).
- 테스트는 **모의 PostgreSQL** 기반입니다. 실제 데이터베이스 연결·RLS 통과·권한/성능/동시성 인프라를 실측한 결과가 아닙니다.
- 새 SQL 실행·DB migration 없이 기존 함수/테이블 SELECT만 사용함.

## 아직 미구현 / 안전 경계

1. **실제 운영 경로/트랜잭션 실행기에 어댑터 연결 및 Read-only DB 검증**은 미완료. 기존 Production 모델 라우팅을 변경하지 않음.
2. `grantSetFingerprint`는 선택된 개인기록 후보와 승인된 projector 기준의 fingerprint. 전체 DB의 전역 버전 또는 쓰기 원자성을 의미하지 않음.
3. 이 Shadow는 **공개 disclosure 전용**이며 Private reveal, 사주/결제, 지속 Character State 쓰기나 학습 승격 권한이 없다. 인물의 사실 기억 vs 해석 기억 분리와 전문 지식 Epistemic Resolver는 다음 단계.
4. DB 트랜잭션 단위로 시점이 고정되지 않으면 각 조회는 다른 순간을 볼 수 있음. 3회 재조회는 **최종 HTTP Reveal/Commit의 권한 갱신·락을 대체하지 않음**. 운영 통합 시 거래 단위 source pin/commit guard에 연결해야 함.
5. 현재 임시 Windows worktree가 원 저장소 `node_modules` junction을 공유해 전체 `tsc -p tsconfig.json` 에 모바일 타입 경로 중복 오류가 발생했던 별도 환경 문제가 있음. 정상 CI 전체 타입/테스트 결과로 최종 판정.

**다음 단계:** 서버 소유 Read-only 실연결 검증 → 승인된 Memory Source Pin/Atomic Commit 경계로 명하의 기존 governance를 유지한 채 승격 검토 → 세션 상태와 지식 학습 구현·GLM/Luna 다중 턴 실증.


## 실제 명하 DB 메타데이터 조회 (읽기 전용, 2026-10-29)

- 운영 프로젝트의 PostgreSQL 카탈로그에서 기존 다섯 함수의 정확한 매개변수/EXECUTE 확인:
  - qry_chat_thread_runtime_binding_v1(uuid,uuid)
  - qry_production_relationship_runtime_v1(uuid,text)
  - qry_seyeon_production_personal_record_context_v1(uuid,text)
  - qry_production_relationship_history_runtime_v1(uuid,text,bigint)
  - qry_reader_context_recent_messages_v1(uuid,uuid,integer)
- 다섯 함수 모두 myeongha_api_executor의 EXECUTE 권한은 현재 확인됨. 기존 관계 관련 두 함수는 SECURITY DEFINER이며 **이번 작업에서 권한/정의를 변경하지 않음**.
- conversation_messages의 id, thread_id, subject_id, sequence_no, sender_type, redacted_at, body_text 컬럼 모두 존재; 해당 테이블 RLS 활성.
- **실제 차단 요인:** has_table_privilege('myeongha_api_executor','public.conversation_messages','SELECT') = false. 이 어댑터의 전체 메시지 직접 SELECT는 해당 역할에서 현재 실행 불가. 기존 qry_chat_thread_stream_v2도 SECURITY INVOKER이고 내부에서 동일 테이블을 직접 조회하므로 EXECUTE 부여만으로 우회 가능하다고 주장할 수 없음.
- DB 함수의 존재·권한 메타데이터를 조회했을 뿐, **실제 Subject 트랜잭션 내 개인 행 조회, 전환, 채팅 응답·모델 호출을 실행하지 않았음**.
- **처리:** 현재 Shadow adapter는 SQL 권한 실패를 C09_DB_AUTHORITY_UNVERIFIABLE로 fail-closed. ACL 확대·SECURITY DEFINER 신규 함수·미승인 보안 경로 신설 금지. 실제 사용 가능 판정은 기존 ACL 정책 변경·검증이 완료되고 authorized executor read-only 실험을 통과한 뒤에만 수행.
