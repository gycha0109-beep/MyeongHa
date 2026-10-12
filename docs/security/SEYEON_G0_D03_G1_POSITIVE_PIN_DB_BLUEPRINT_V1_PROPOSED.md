# 세연 G0 D-03 → G1 양수 출처 Pin — DB Authority 상세 기술 설계 v1

> Watchtower-Track: security
>
> 상태: **DESIGN CANDIDATE / G0 OWNER APPROVAL REQUIRED**. 이 문서는 실행 명세 후보이지 Production migration 또는 승인된 권한 정책이 아닙니다.
>
> 작성 2026-10-12 KST · 검토 기준 main c8327de4633c695afb1bc42d754f55872ac008c9 및 Draft PR #1985 67e0a8de5e18f6455d12a15329106ebd9728c04b.
>
> 관계 문서: [G0 상위 권한 결정](./SEYEON_G0_PERSONAL_SOURCE_AND_DERIVED_DISCLOSURE_CONTRACT_V1_PROPOSAL.md), [D-03 교차 Digest 관측](./SEYEON_G0_D03_CROSS_RUNTIME_DIGEST_PROOF_V1.md), [G0~G6 원장](./SEYEON_AI_SECURITY_COMPLETION_GATES_V1.md), [#1843](https://github.com/gycha0109-beep/MyeongHa/issues/1843), [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887).

## 0. 판정 및 적용 범위

기존 G0/D-03/Atomic Commit 문서는 권한 원칙·테스트 경계·추상 Port가 있으나 **새 양수 SourceSet의 실제 DB 키/버전, 1640 zero-only 상호 배타성, v2 Commit 호출 및 트리거 경합, legacy EXECUTE 봉쇄, API ↔ DB Codec 책임**을 하나의 구현 가능한 패키지로 확정하지 않았습니다. 즉 운영 G1에 대한 승인된 상세 설계는 **아직 없습니다**.

이 문서는 아래의 **최소 S0(현재 발화 + 공개 Bible + 정확히 1개의 직접 Memory)**를 DB로 옮기는 실행 후보를 명세합니다. S0조차 **SRC-25 허용 타입과 Character/Product 범위 축소 서명** 전에는 가동할 수 없습니다. 다른 Record, Life Fact, 과거 User/Assistant 메시지, Relationship Event/state, Reader/Saju/Peer/Preflight 파생 payload가 있거나 provenance 미상일 경우 **입력/모델 호출/공개를 HOLD**합니다. 기존 합성 테스트의 synthetic-s0-only / shared_detail:memory-v1은 운영 타입 허가가 아닙니다.

**현재 운영 경로 불변:** 0건 Personal Projector, 기존 zero-only Pin, public route OFF, 유료 Provider OFF, 운영 DB/DDL/ACL 변경 0. 모든 아래 SQL 이름·DDL은 **신규 forward-only migration을 작성할 때의 제안**이며 이 문서만으로 실행하지 않습니다.

## 1. 확인된 코드 근거 (진단)

| 층 | 확인된 이름/행동 | G1 이관시 제약 |
| --- | --- | --- |
| 직접 원천 read | supabase/migrations/1480_seyeon_production_context_runtime_v1.sql 의 qry_seyeon_production_personal_record_context_v1 | 실제 record_access_grants + memory_items/life_facts, exact grantee=seyeon, revoke 검사. DB read는 최종 Provider 입력이 아님 |
| 앱 Projector/Selection | seyeon-production-context-v1.ts 의 personalMemories; seyeon-exact-model-personal-source-selection-v1.ts | 앱 rawRecordDigest는 (kind,id,grant,type,schema,payload) Envelope hash. 최종 선택은 sort/cap 뒤의 source |
| 기존 0건 Pin | migrations/1640, cmd_mark_seyeon_chat_context_ready_pinned_v1(uuid,uuid,uuid,jsonb) | chat_turn_attempts.seyeon_personal_source_pin_jsonb, 시점·불변 트리거, zeroProof·Selection 0건 일치 강제 |
| **0건 Commit 트리거** | tr_seyeon_zero_source_pin_immutable_v1(), planner_version=seyeon-production-chat-planner-v1 | validated→committed 시 **zeroProof.records=[]를 필수**로 검사. Positive sidecar를 하나 추가해도 실제 positive Commit은 이 트리거에서 막힘 |
| 실제 Commit | migrations/1500, cmd_commit_seyeon_chat_turn_runtime_v2(uuid×7,jsonb,text) | 내부 v1→cmd_commit_chat_turn_v1 후 post-turn outbox. 기존 원자 저장과 반환/Idempotency 보존 필요 |
| 앱 실제 DB Adapter | postgres-seyeon-production-chat-execution-v1.ts | markContextReady→1640 zero RPC, commitTurn→v2. 새로운 포트를 우회해 old RPC로 fallback하면 positive protection 무효 |
| 기존 Revoke | migrations/0330/0730, cmd_revoke_memory_character_grant_v1 / cmd_revoke_life_fact_character_grant_v1 | **subjects FOR UPDATE 먼저**, 그 후 Grant UPDATE. 락 순서가 뒤집히면 deadlock/선형화 오류. Revoke는 exact Grant row를 건드림 |
| 현재 제한 | docs/RELATIONSHIP_MEMORY_POLICY_SPEC.md SRC-25 / SRC-22 OPEN, #1887 운영 계보·DR | 운영 양수 스키마 승인 및 운영 migration 승인 별도; 시험용 sidecar를 Production으로 그대로 복사하면 안 됨 |
| 오프라인 후보 | test/db/seyeon_positive_grant_attempt_bound_candidate_v1.sql | 진짜 Attempt와 한 Memory 원본 Grant·digest 결속/Commit·Reveal 후보만 검증; 원본 v2 Commit 아님 |

## 2. D-03 구체 Codec/무결성 계약 — **권고안, Owner 미결 D-03-A~D**

### 2.1 서로 다른 다섯 값

**PG-PAYLOAD-V1 (DB 생성만):** 입력은 원본 Memory content_jsonb 또는 Life Fact value_jsonb, PostgreSQL jsonb::text의 UTF-8 바이트를 sha256(convert_to(...,'UTF8'))로 계산하고 문자열에 sha256:pg-jsonb:v1: 접두를 둡니다. 동일한 PostgreSQL 설치에서 저장/현재 재검증하는 데이터 변경 감지용입니다. Node canonicalJson과 바이트 동등성은 **보증하지 않습니다**. PostgreSQL major upgrade에서 직렬화 차이가 있다면 마이그레이션 전 버전 유지/재검증 방침 선행.

**PG-AUTHORITY-ENVELOPE-V1 (새 DB 소유, 제안):** raw payload digest만으로는 Grant ID·소유자·type/schema를 증명하지 못합니다. 별도 컬럼 또는 불변 행에 subject_id, character_id, record_kind, record_id, original_grant_id, record_type, schema_version, granted_at 및 DB-computed payload digest를 저장합니다. Envelope 자체의 추가 hash는 Owner 선택사항이며, 생성한다면 해당 필드들의 순서·타입·DB codec 및 schemaVersion을 명시해야 합니다. **원본 필드의 DB FK/lock/활성 상태가 해시보다 우선**입니다.

**APP-RAW-ENVELOPE-V1 (앱 projection 후보):** 현재 Node canonicalJson({kind,recordId,grantId,recordType,schemaVersion,payload}) 기반 sha256:v1. Source-side 신호로만 취급하고 DB raw payload hash와 비교하지 않습니다. 주어진 값이 무키 SHA이므로 클라이언트/모델에서 복사해도 DB 권한으로 승격 금지.

**APP-PROJECTION-V1 / APP-SELECTION-V1:** 각각 실제 SeyeonRetrievedMemoryV2 객체, 최종 정렬/cap 선택 결과 selectedSources의 canonicalJson 기반 sha256:v1. 모델 메모리 표현 및 명세상 정확한 원본 ID 사용 집합을 검사하지만 *진짜 Provider payload 전체*나 원본 현재 권한을 보증하지 않습니다.

**PROVIDER-PAYLOAD-V1 (새로 제안):** 실제 governed Interpreter/Renderer/Reviewer/Preflight 각각의 **Provider boundary에서 보낸 구조화된 요청 직렬화**를 버전-구분된 digest 및 단계/모델/attempt/SourceSet ID로 추적. 현재 G1-B1 selection만으로는 해당 요청 전체와 후속 Governor/Disclosure 결과를 묶지 못합니다. Provider 호출 전 DB Pin 성공이 선행되어야 하며, 그 후 새로운 개인 출처가 공급되면 **기존 Pin은 사용 불가**(HOLD 또는 승인된 별도 재 Pin 정책 필요). 경계별 raw payload를 로그/DB에 복제하지 않습니다.

### 2.2 D-03 Owner가 결정해야 할 정확한 규격

1. D-03-A: DB jsonb::text 지속 사용(동일 PG 버전 내부 비교) 또는 버전 있는 독립 canonical JSON 구현 채택. Node와 동일하지 않음을 공식화할 것.
2. D-03-B: record type/version/payload/grant grantedAt 및 valid/superseded 상태를 어떤 immutable 컬럼과 비교값에 결속할지. Row FK + 주체/정확한 original Grant 검증은 필수.
3. D-03-C: number/numeric scale, unicode normalization, UTF-8/escape, null, nested object/array, PG15·PG17/Node runtime 버전별 golden vectors와 **사전 DB 버전 변경시 HOLD/재인증** 정책.
4. D-03-D: 빈 Pin(1640)과 새 positive Pin, 이후 closure 경로별 codec/version, 재생/Legacy Row가 새 해시 없이 응답되는 정책(기본 HOLD).
5. 규격을 정해도 데이터 접속은 DB Owner row validation + Subject authority + Grant ACL을 통과해야 합니다. SHA는 **서명이나 권한이 아닙니다**.

## 3. 제안 DB 자료 구조 — G1 S0 / 확장 가능한 Shape

별도 forward-only migration 안에서 **기존 Attempt 변경을 최소화하는 sidecar**를 권고합니다. 이름은 검토용이며 실제 확정 DDL 아님.

### 3.1 seyeon_chat_attempt_source_sets_v1 (부모, Attempt당 최대 1개)

| 컬럼 | 타입/제약 제안 | 의미 |
| --- | --- | --- |
| attempt_id | uuid PK, FK chat_turn_attempts(id), ON DELETE 정책은 DB Owner 결정 | 원본 실행 Attempts. FK 외에 Subject/Turn 결속을 RPC가 **행 잠금으로 재검증** |
| subject_id / thread_id / turn_id | uuid NOT NULL, FK 후보+명시적 DB 검증 | Client-supplied IDs 금지, parent/child Subject/Thread/Turn 모두 같아야 함 |
| character_id | text CHECK character_id='seyeon' | cross-character reuse 금지 |
| source_set_version | text = seyeon-positive-source-set-v1 | decode/검증 규격 |
| policy_version / approved_schema_version | text NOT NULL | G0/Character/SRC-25 실제 승인 버전 없으면 생성 불가 |
| selected_sources_digest | text, sha256:v1:... 형식 | 앱 최종 selection의 조회용 증빙, **DB 권한 proof 아님** |
| final_context_digest / provider_plan_digest | text/version 분리, NOT NULL | 정확한 모델 단계 계획을 앱 server-side path와 결속. 미입증이면 Pin 거부 |
| source_count | integer CHECK 1 이상, S0는 **=1** | 양수 여부; DB child count와 같은 Tx 검사 필요 |
| pinned_at | timestamptz, 서버 생성 | 모델 이전 DB Commit 완료 시점 |
| pin_state | immutable 'pinned' (Commit은 기존 turn/attempt state) | Grant 취소 후 원본 Pin ID 변경 금지 |

**중요:** 앱으로부터 받은 selectedSourcesDigest 및 최종 request digest는 *불변성/추적성 신호*일 뿐입니다. 서버 본문/클라이언트 필드를 DB에서 신뢰해 Provider 입력 증거라고 간주할 수 없습니다. 실제 Provider Request 생성 경계는 서버 소유 sealed snapshot을 받아 동일 bytes를 사용해야 하며, 하나라도 다른 SourceSet이면 Provider 자체를 HOLD합니다.

### 3.2 seyeon_chat_attempt_source_edges_v1 (원본 출처 간선)

| 컬럼 | 타입/제약 제안 | 의미 |
| --- | --- | --- |
| attempt_id + ordinal | PK/FK 부모, ordinal non-negative, deterministic sort | 최종 모델 selected order, 중복·빈 슬롯 금지 |
| source_class | enum/check, S0='memory_item'만 | 향후 life_fact/derived는 versioned scope extension |
| record_id / original_grant_id | uuid, 각각 FK 원본 Row/Grant | **새 Grant ID가 생겨도 옛 Attempt의 ID를 바꾸지 않음** |
| record_type / schema_version | text NOT NULL | SRC-25 등록된 정확한 pair |
| pg_payload_digest_version / pg_payload_digest | text | DB가 원본 JSONB를 읽어 계산; JS digest 신뢰 금지 |
| app_projection_digest | text (Node) | 원본 projector 결과 부하용, 모델 전체 digest와 구분 |
| provenance_parent_set_id | nullable only S0 | derived 도입 전 NULL. 출처 누락을 NULL=zero라고 해석 금지 |
| created_at | DB timestamp | audit; 원문 저장·출력 금지 |

S0는 **부모 1행 + 간선 1행 + Type/Schema Allowlist 1쌍**의 exact match만 허용합니다. 추후 N건/혼합 Life Fact/Relationship/Reader/History는 부모 형태를 재사용하되 각 Source Class 별 transitive closure, 다중 original Grant, 부가 entitlement를 별도 승인 전까지 허용하지 않습니다.

### 3.3 불변성·복구·동일성

- DB Owner SECURITY DEFINER 함수를 제외한 sidecar INSERT/UPDATE/DELETE 금지; api_executor와 browser anon/authenticated/service_role은 **직접 TABLE DML 0**.
- 최초 Pin 후 identity/SourceSet/edge/digest 불변. Retry는 **새 attempt_id** 및 새 source set 생성; 기존 Pin 변경 금지. 동일 attempt 반복 호출은 필드·스키마·source digest가 **완전히 같을 때만** idempotent success **후보**이고, 이때도 **원래 exact Grant/Record의 현재 유효성, running/context_ready 상태, 이미 Provider가 시작됐는지**를 Owner가 다시 검사해야 합니다. 최초 Pin 후 Grant가 취소되었거나 Attempt 단계가 이미 진행된 경우 Pin replay를 모델 재실행 허가로 해석하지 않고 **HOLD**. 다른 필드면 23505/23514 명시 HOLD.
- source_count와 Child 존재를 **동일 트랜잭션**에서 검증. 부모만 저장/간선 일부 저장/중복 ordinal/섞인 Subject/Record를 성공으로 취급하지 않음.
- positive Pin만 만들고 zero pin도 존재하는 **이중-mode**를 트리거/Commit에서 금지. 기존 1640 zeroProof Pin은 이전 버전 그대로 보존하고 덮어쓰지 않음.
- sidecar PK만으로 Subject/Thread/Turn FK join을 대신하지 않습니다. 필요한 composite FK가 기존 UNIQUE와 불일치하면 생성이 불가능하므로 실제 카탈로그에서 composite index를 확인한 뒤 Owner migration 형태 선택.
- Reader/Relationship/삭제/merge/회수는 provenance row를 파괴하지 말고 **현재 출처 권한 없음**으로 판정. 개인정보 보존/삭제 정책과 감사 정체성 복원은 별도 Source Owner 결정.

## 4. 신규 DB RPC 계약 및 실제 순서 — 제안 시그니처

### G1 cmd_mark_seyeon_chat_context_ready_positive_pinned_v1
입력 후보: (p_subject_id uuid, p_turn_id uuid, p_attempt_id uuid, p_source_selection_jsonb jsonb, p_provider_context_digest text, p_policy_version text).
**거부:** 주체/Thread/Attempt 불일치, planner version 부적합, 기존 zero Pin 존재, 이미 generated/validated/committed, SRC-25 schema 미허가, 선택 출처 0개/2개 이상(S0), reissued Grant, 다른 Character, 과거/파생 ingress, digest/필드 미상.
**DB 작업:** ① 동일 DB 호출/Transaction 내 canonical Subject+Thread/Turn/Attempt 확인 ② 정확한 Original Grant ID·Record Type/Schema/Content를 DB에서 확인, Row 잠금 ③ raw payload digest를 DB가 계산 ④ SourceSet+Edge 한 번에 삽입(immutable) ⑤ 같은 transaction에서 기존 cmd_mark_chat_turn_context_ready_v1 호출 ⑥ Provider 시작보다 먼저 결과 COMMIT이 확정되어야 함. 재호출은 원래 exact Grant/Record가 아직 유효한지 재검사하고 **중복 Provider 발행 여부를 DB Attempt/Governor 상태와 교차 확인**하여 반환. 최초 성공 Pin receipt를 일반-purpose 재실행 토큰으로 인정하지 않음.
*현재 1640 zero-only 함수는 그대로 유지*, 새 함수의 API runtime 사용은 **승인된 positive path에서만** 명시적으로 선택하고 old zero 함수로 positive fallback 금지.

### G2 cmd_commit_seyeon_chat_turn_with_positive_sources_v1 또는 승인된 v3
입력은 현재 v2의 정확한 9개 파라미터 그대로 유지하는 것을 우선 제안: (subject uuid, thread uuid, turn uuid, attempt uuid, message uuid, chat_outbox uuid, post_turn_outbox uuid, snapshot jsonb, snapshot_hash text).

**핵심:** 이 함수가 같은 Transaction에서 immutable SourceSet+Edges를 읽고 original Grant/Memory current validity를 락과 함께 확인한 후 **반드시 기존 v2→v1→cmd_commit_chat_turn_v1 및 post-turn Outbox를 동일 Transaction에서 호출**해야 합니다. 별도 SELECT+후속 독립 Commit이나 test-only commit_test 호출은 G2가 아닙니다. 이미 Commit된 Attempt라도 replay path는 검증된 원본 SourceSet을 다시 읽어야 하며, stale Grant에 의해 과거 텍스트를 우회 공개하지 않습니다.

### 트리거 1640 전환은 **G1 단독과 분리 불가**

현재 1640 tr_seyeon_zero_source_pin_immutable_v1은 seyeon Attempt의 validated→committed에 old zeroProof 필수를 강제합니다. 양수 SourceSet을 저장해도 해당 트리거가 Commit 거부하므로 다음 중 **실제 DB Owner의 최종 migration 결정** 필요:

- 권고: 새 forward-only migration에서 **기존 트리거 함수의 영구 zero Pin 불변 규칙을 그대로 보존**하면서 Commit 상태변이 검사를 versioned branch로 보강. (zero-only valid Pin XOR positive valid SourceSet)이어야 하며 positive의 exact-current-Grant 검사와 G2 RPC/Trigger는 상호 결속.
- API runtime이 접근하는 legacy v1/v2 Commit EXECUTE와 core direct Commit 경로를 동시에 감사/회수. 단순히 v3 함수를 만들어도 v2/legacy로 같은 Attempt를 Commit할 수 있으면 보안 FAIL.
- 트리거가 호출되는 **실제 cmd_commit_chat_turn_v1 내부의 attempt 상태 전이**, validation_result_jsonb 개인 출처 Proof, positive SourceSet 존재/불변·중복·결과 파생 작업까지 확인. trigger-only 권한 검사와 RPC 중복 검증은 SQL 함수 호출 순서와 잠금 여부를 명시.
- migration은 1640 이전본 변경 금지. **기존 zero-only 실행의 성공/원본 데이터·멱등/비용 정산/Outbox 순서가 동일**함을 사전 regression으로 증명하지 못하면 신규 positive Path enable 금지.

## 5. Lock ordering / Revoke 경쟁 / 분리 기준

**관측한 Memory/Life Fact revoke 명령은 Subject 행 FOR UPDATE를 먼저 잡은 뒤 Grant UPDATE합니다.** 새 Positive Commit이 Grant를 먼저 잡고 Subject를 뒤늦게 잠그면 양쪽이 반대 순서로 경합할 수 있습니다.

권고 lock order 후보(실제 SQL/call graph 감사 후 DB Owner가 고정):
1. canonical subjects 행 (현재 active/merged=null, FOR SHARE 또는 필요한 stronger lock) — Revoke의 Subject FOR UPDATE와 경합
2. 단일 Thread/Turn/Attempt 행의 기존 Core/RPC lock order를 확인·준수
3. SourceSet immutable parent/child scope 확인 (행 존재/원본 일치)
4. original Grant/Record를 deterministic (record_kind,record_id,original_grant_id) 기준으로 잠금. S0 한 건이어도 N건 확장시 구조 고정. Grant/Record **FOR SHARE 이상**으로 revoked_at/content 업데이트와 충돌하도록 검증
5. 모든 검증을 통과한 상태에서 **같은 transaction**의 실제 Chat Commit 또는 Reveal 결과 생성 후 PostgreSQL COMMIT까지 락 유지

이 순서는 **제안이며 이미 무교착임을 증명한 것은 아닙니다**. 기존 cmd_commit_chat_turn_v1, cmd_fail, Retry, revoke, Account deletion, merge 및 반대 락 순서가 없는지 DB Owner lock graph 작성과 2세션/3세션 동시 검증이 선행되어야 합니다. FOR KEY SHARE는 non-key UPDATE의 revocation과 충돌을 보장하지 않으므로 대체 증명 없이 사용 금지. lock_timeout/statement_timeout/deadlock/SQLSTATE는 **본문 없는 HOLD**로 매핑; 임의 재시도 모델 호출 금지.

**Revoke 우선:** Revoke가 DB COMMIT되면 이후 G2 Commit 또는 G3 Reveal은 HOLD. **Commit 우선:** G2가 먼저 Grant 잠금을 취득한 경우 Revoke는 G2 transaction 종료까지 대기하고, Revoke 후의 G3는 HOLD. **HTTP late delivery:** G3 Reveal DB transaction COMMIT을 공개 선형화 지점으로 삼는 안은 아직 D-04 Owner 선택 전이므로 스트리밍 OFF/공개 route OFF 유지.

## 6. G3/파생 이력과의 영속 결속

- assistant conversation_messages → chat_turns.committed_attempt_id → SourceSet+Edges 라는 **DB-owned 역방향 링크**를 조회해야 합니다. Body text, Model의 sourceRef, HTTP query의 임의 Original Grant 목록에서 복구 금지.
- 최초 HTTP, committed_replay, GET history readAuthorizedPage, 모델에 과거 assistant 텍스트 재공급, post-turn worker의 summary/relationship payload 모두 **각 출처의 원본 Grant/Record current rights**를 검사. 빈 SourceSet·옛 무출처 Assistant는 증명 불가능하므로 승인 전 HOLD.
- 사용자 **현재 입력**은 verified Subject·Thread 기반 범위에만 쓰고, 이전 User transcript의 장기 재투입은 Conversation Delete/Privacy/Retention Owner 계약이 없으면 S0에서 금지.
- 파생 출력이 여러 Parent를 취하면 closure=모든 Parent의 union; 하나라도 권한 취소·Reader entitlement 취소·Source unknown이면 전체 공개 HOLD. Relationship Event/source summary만 보고 'public'으로 다운그레이드 금지.
- History Port와 send ControlledDisclosurePort는 코드상 이미 기본 503 fail-closed 후보이나 **실제 DB Owner adapter 없음**. S0 검증에 성공했다고 HTTP/History를 여는 순서는 허가하지 않음.

## 7. SQL 보안·권한 검증 체크리스트

- 신규 함수 owner 전용 NOLOGIN role/SECURITY DEFINER/고정 search_path 사용; search_path에 client-controlled schema/pg_temp를 통한 오염 경로 없는지 감사.
- myeongha_api_executor는 선택된 function EXECUTE만 허용. 새 sidecar의 direct DML, 임의 schema CREATE, 브라우저 anon/authenticated/service_role EXE, SQL injection·Owner role 상속 경로 0. Catalog로 실제 PG ROLE/ACL 증명.
- 기존 v1/v2/context-ready/legacy core 함수에서 API 또는 허가되지 않은 역할의 EXECUTE 우회 경로 확인 후 봉쇄. trigger는 Actor가 core function으로 업데이트해도 반드시 fail closed해야 함.
- Subject session context assert_myeongha_subject_context_v1 및 RLS/각 FK의 real join scope 모두 통과. SECURITY DEFINER가 RLS 우회를 허용하더라도 함수 내부 보호가 대체 검증을 수행해야 함.
- 원문/Memory 내용, 모델 요청 텍스트, raw DB row를 SQL error/log, outbox, telemetry에 노출하지 않음. 오류 코드/카운트/Attempt 식별자도 개인정보 최소화.
- Production lineage/Backup/DR: #1887의 후속 이력·재백업/복원·변경분 승인 전에 migrations 배포 금지. GitHub Actions CI SUCCESS ≠ 실제 운영 적용.

## 8. 실증 계획 / 차단 가능한 장애

| 증거 테스트 | 성공 기준 | 제출 담당 |
| --- | --- | --- |
| S0 현재발화+Memory 1개 | 정확한 Original Grant/Record/Type/Schema+Node projection+DB raw payload 결속, Provider보다 Pin 선행 | Character + DB |
| unsupported/forged/unknown/cross-Subject/Reader | Pin Row 0, Provider 호출 0, 답변 본문 0 | Security + DB |
| 0건 기존 1640 regression | 기존 zero Pin/Trigger/Replay 멱등 유지, 양수와 XOR 강제 | DB |
| Grant revoke-first / commit-first | **실제 v2 또는 승인 대체**의 DB 변화 atomic, 동일 Transaction, Revoke 순서별 HOLD/Commit 1개 | DB (독립 PG 세션) |
| Record revoke/update/regrant/supersede | 원본 ID/Raw DB digest 변경 후 오래된 Attempt Commit·Reveal·History 0 | DB + Security |
| Positive Attempt idempotency | 동일 재요청 1 SourceSet, 필드 불일치 재요청 HOLD, Retry new Attempt | DB |
| 다른 사용자의 SID, 다른 Thread/Character | 오리지널 Row FK와 canonical member context 결속; cross-Tenant disclosure 0 | Security |
| 실제 HTTP first/replay/history | DB-Current-Rights text만 허용, revoke 후 text 0, fallback/streaming 0 | API + Security |
| 파생 관계/Reader/Preflight/old transcript | 입증되지 않은 출처는 **provider 이전** HOLD; no partial page | Character + Reader/Saju |
| D03 PG15/17 golden/codec-change | codec별 bytes 재검증, migration upgrade 시 무허가 재해시/재승격 0 | DB + Security |
| RLS, ACL, legacy direct execute, outage | 임의 DB DML·직접 Commit/Reveal 0, 실패 시 유료 호출 0, 원문 로그 0 | DB + Ops |

완료 증거는 **실제 Production-equivalent 함수+실 PostgreSQL 독립 세션+HTTP + exact SHA CI**이어야 합니다. Test-only SQL과 합성 모델 재연은 개발 보조 증거일 뿐 G1/G2/G3 운영 PASS 아님.

## 9. Owner 의사결정 봉쇄표 (이 문서 작성은 승인 아님)

| 결정 | 제안 | Owner | 상태 |
| --- | --- | --- | --- |
| G0 D-01 / SRC-25 | S0 단일 Memory 정식 type+schema와 projector version | Source Authority + Character | OPEN |
| G0 D-02 | final Provider ingress 전체 provenance graph 또는 승인된 S0 exclusion | Character + Security + Product | OPEN |
| G0 D-03-A~D | PG raw vs Node envelope/projection codec·DB envelope 저장·PG15/17 upgrade | DB + Security + Character | OPEN |
| G0 D-04 | G3 Disclosure 성공 COMMIT vs Revoke 및 network delivery/streaming 의미 | Security + DB + Product | OPEN |
| G0 D-05/D-09 | legacy NULL Pin, 오래된 대화·관계 유래 Source 처리 | DB + Product + Security | OPEN |
| G0 D-06 | Positive parent/edge migration, G2 v2/v3 트리거 전환, legacy EXECUTE, lock order | DB + Security | OPEN |
| G0 D-07 | Memory/Fact revoke/validity/supersede/merge/delete 효과 | DB + Character | OPEN |
| G0 D-08 | Reader/Saju/paid/entitlement scope 제외 여부를 명시 승인 | Reader+Commerce+Saju+Security | OPEN |
| G0 D-10 | least-privilege owner 역할, Production lineage + DR | DB + Ops + Security | OPEN |

각 Owner는 결정별 APPROVE/REVISE/OUT_OF_SCOPE+FAIL_CLOSED, policyVersion, approver, PR·Issue URL, exact SHA 및 증거 run을 기록. **AUTO-APPROVED는 없음**.

## 10. 다음 실제 구현 단계의 착수 조건

- G1 격리용 disposable DB **프로토타입**은 이 문서를 기반으로 별도 test-only schema에서 코드·2세션 검증 가능 (Production 승인 증거 아님).
- G1 Production migration **작성/배포 및 Provider positive 활성화는 별개**: 최소 D-01/D-02/D-03/D-06/D-07와 실효 scope의 D-04/D-05/D-08/D-09/D-10 승인·원격 이력/DR 결정을 만족해야 함.
- 실제 코드 추가 전 DB Owner가 **SourceSet schema/RPC/trigger lock graph**를 검토하고 합성 후보와 충돌하는 항목을 기록해야 함. 그 전까지 test-only G1과 운영 DDL이 같다는 주장을 금함.
- 세연 route/projectors/유료 모델은 최종 G5/G6 이전 계속 OFF. 혼합 N개 Memory/Life Fact/History/Reader는 S0 범위 완료 후 새 계약 버전으로 별도 확장.

**판정:** 상세 설계 후보 작성 = DESIGN READY FOR OWNER REVIEW; G0 APPROVED / G1 IMPLEMENTED / G2 ATOMIC PASS / G3 PRODUCTION REVEAL PASS는 모두 아님.
