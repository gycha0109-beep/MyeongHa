# 명하 플랫폼 무결성 아키텍처 v1

> Product: **명하 (MyeongHa)**  
> Document: **Platform Integrity Architecture v1**  
> Baseline repository: `gycha0109-beep/MyeongHa`  
> Baseline `main`: `0fcd9f2b0dd18e6a9a97edc408b5a10204bdbbfd`  
> Date: 2026-09-04  
> Status: **ARCHITECTURE DRAFT / NOT MIGRATION-READY / NOT PRODUCTION-SAFE / NOT INTEGRITY-COMPLETE**

---

## 0. 문서 판정과 authority 우선순위

이 문서는 명하의 PostgreSQL 구조적 무결성, 인증/인가, idempotency, transaction, concurrency, ledger/projection, transactional outbox, 삭제 및 logical abuse authority를 하나의 production integrity 기준으로 통합한다.

이 문서는 새로운 제품 의미를 발명하지 않는다. 의미 authority와 구현 상태 authority를 구분한다.

### 0.1 Source authority

제품/데이터 의미의 상위 authority는 다음 문서다.

1. `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST.md`
2. `Usecase_re_reviewed_v2.md`
3. `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW.md`
4. 필요 시 Character / Saju / UX architecture

현재 repository의 구현 결정을 구체화하는 문서는 다음이다.

- `docs/P0_DECISION_REGISTER.md`
- `docs/AUTH_RLS_PRIVACY_SPEC.md`
- `docs/DB_DDL_MIGRATION_SPEC.md`
- `docs/API_CONTRACT.md`
- `docs/RUNTIME_STATUS.md`
- `docs/COMMERCE_ENTITLEMENT_SPEC.md`
- `docs/COST_QUOTA_ABUSE_SPEC.md`
- `docs/SERVER_COMMAND_TRANSACTION_SPEC.md`가 존재하는 경우 해당 contract
- `supabase/migrations/*`
- `apps/api/*`의 실제 production caller/runtime

`MyeongHa_Integration_Spine_v1_FINAL_REVIEWED_v1.2.md`는 중요한 설계 근거지만 captured state가 현재 repository보다 오래되었다. 특히 해당 문서의 `P0-AUTH-01 OPEN` 상태는 현재 `docs/P0_DECISION_REGISTER.md`의 `P0-AUTH-01 DECIDED`보다 오래된 runtime-status 기록이다. 제품 의미를 변경하지 않는 범위에서 **최신 explicit decision + 최신 implementation evidence**를 현재 상태 판단에 사용한다.

### 0.2 이 문서가 선언하지 않는 것

현재 상태에서 다음 표현은 금지한다.

```text
Migration-Ready
Migration-Complete
Production-Safe
Integrity-Complete
Full RLS Complete
Exactly-Once External Delivery
Deletion Complete
Commerce Complete
```

상위 ERD v0.6 역시 DDL negative test suite 통과 전 migration-complete를 금지한다. 이 문서는 그 기준을 약화하지 않는다.

---

# 1. 목적

명하 플랫폼은 다음 실패가 발생해도 authority가 깨지지 않아야 한다.

- 모바일/브라우저 재시도
- response loss
- concurrent web/mobile mutation
- stale client revision
- stream disconnect
- AI/Saju timeout
- worker crash
- DB transaction rollback
- provider webhook duplicate/out-of-order delivery
- Guest→Member 전환 경합
- 다른 subject object ID 제출
- privileged credential 오용
- schema drift
- deletion과 일반 write의 경합

핵심 목표는 다음이다.

```text
같은 행위는 한 번만 의미를 만든다.
다른 사용자의 object를 조작할 수 없다.
current projection과 source ledger가 모순되지 않는다.
외부 side effect는 DB commit과 분리하되 유실/중복 위험을 명시적으로 통제한다.
retry와 concurrency를 정상 경로로 취급한다.
```

---

# 2. 범위 / 비범위

## 2.1 범위

- PostgreSQL PK/FK/UNIQUE/CHECK/constraint trigger
- immutable/append-only authority
- canonical `subject_id` ownership
- Member/Guest identity resolution
- transaction-scoped DB subject context
- RLS/default deny/object authorization
- command idempotency
- optimistic concurrency / row locking / allocator
- transaction boundary
- ledger/projection consistency
- transactional outbox
- retry/partial failure/recovery
- Guest→Member integrity
- revision/version pinning
- deletion integrity
- logical rate/quota/abuse authority
- sensitive logging boundary
- schema migration/catalog verification
- negative/concurrency/partial-failure acceptance tests

## 2.2 비범위

- 실제 결제 provider 선택 및 store 정책 (`P0-CM-01`)
- AI provider/model/fallback 선택 (`P0-AI-01`)
- 최소 이용 연령 정책 (`P0-AGE-01`)
- retention 기간 자체의 정책 결정 (`P0-PR-01`)
- Saju 해석 의미 생성
- Character canon/persona 의미 생성
- hosting/autoscaling/CDN/infra capacity architecture
- Redis/message broker 도입을 전제로 한 설계

비범위 항목이 무결성 contract에 slot을 요구할 수는 있으나, 이 문서가 미결정 값을 임의로 확정하지 않는다.

---

# 3. Authority Model

명하의 hard system boundary는 다음과 같다.

```text
Saju Engine
→ 무엇을 계산/해석할 수 있는가

MyeongHa Product DB
→ 누구의 입력/기록/대화/관계/권한/결과인가

Character Runtime
→ 허용된 의미를 어떤 캐릭터 화법으로 전달하는가
```

세 authority는 서로 대체하지 않는다.

## 3.1 데이터 authority

| Authority | Canonical source |
|---|---|
| 인증 계정 | Supabase `auth.users` |
| 명하 owner identity | `subjects` |
| 출생 입력 revision | `birth_profile_revisions` |
| 현재 삶 구조화 history | `life_facts` |
| 캐릭터 memory/access | `memory_items` + `record_access_grants` |
| 대화 history/turn state | `conversation_threads` / `chat_turns` / `conversation_messages` |
| Saju execution/provenance | `reading_sessions` / `readings` / refs / groundings / execution attempts |
| 관계 current projection | `user_character_states` |
| 관계 source ledger | `relationship_events` |
| episode current projection | `user_episode_progress` |
| episode source ledger | `episode_progress_events` |
| 독립 entitlement source/lifecycle | `entitlement_grants` + `entitlement_events` |
| effective access projection | `entitlements` |
| 외부 side-effect delivery queue | `outbox_events` |
| logical notification/delivery retry | notifications / deliveries / delivery attempts |

## 3.2 절대 금지

- frontend/mobile cache를 authority로 취급
- `auth.uid() == subjects.id` 가정
- client-supplied `subject_id`를 current owner authority로 사용
- ordinary user CRUD를 `service_role`/BYPASSRLS로 수행
- Guest merge 때문에 immutable ledger의 `subject_id` bulk reparent
- relationship/unlock/entitlement client direct mutation
- raw Guest/share/payment/service bearer 저장
- hash/fingerprint를 anonymization 증거로 취급
- `MAX(sequence_no)+1` 또는 `MAX(attempt_no)+1`
- 외부 API 호출을 긴 DB transaction 안에서 수행

---

# 4. Current Implementation Baseline

이 섹션은 **현재 구현 evidence**다. 목표 아키텍처와 혼동하지 않는다.

## 4.1 Repository baseline

Baseline `main` SHA:

```text
0fcd9f2b0dd18e6a9a97edc408b5a10204bdbbfd
```

`supabase/migrations`에는 `0010`부터 `0860`까지 migration이 존재한다.

현재 `docs/RUNTIME_STATUS.md`는 production Supabase project `cnsfpcdiyofqvhpcegfc`가 **0820까지 LIVE**라고 기록한다. Repository에는 `0830`, `0840`, `0850`, `0860`이 추가로 존재한다.

따라서 현재 증거는 다음으로 분리한다.

```text
Repository migration state
→ through 0860

Documented production migration state
→ through 0820

Exact live production catalog/history
→ this architecture review에서 직접 재검증되지 않음
```

이를 `PI-P0-01`로 추적한다. 실제 production catalog와 migration history를 재확인하기 전 새로운 DDL migration을 production-safe라고 부르지 않는다.

## 4.2 Current production identity baseline

`P0-AUTH-01`은 DECIDED다.

```text
Member verified auth identity
→ auth.users.id
→ subjects.auth_user_id
→ canonical subjects.id

Guest verified opaque credential
→ API HMAC fingerprint
→ guest_sessions
→ canonical subjects.id
```

ordinary DB path의 현재 documented production model:

```text
myeongha_runtime LOGIN
→ BEGIN
→ SET LOCAL ROLE myeongha_api_executor
→ begin_member_subject_context_v1(...)
   또는 begin_guest_subject_context_v1(...)
→ same-transaction authority work
→ COMMIT / ROLLBACK
```

`myeongha_runtime`과 `myeongha_api_executor`는 ordinary path에서 NOBYPASSRLS를 유지해야 한다.

## 4.3 RLS baseline

RLS architecture는 결정되었으나 **59개 전체 table에 대한 production-complete RLS가 증명된 상태가 아니다.**

현재 전략은 다음이다.

```text
activated vertical slice
→ RLS/default deny + narrow role/function grants + object-level authz

not-yet-activated user-owned slice
→ caller activation HOLD / closed
```

즉 `partial activation`과 `unsafe exposure`를 구분한다. 닫힌 surface가 아직 RLS-activated가 아닌 것은 그 자체로 production exposure defect가 아니다. 해당 surface를 열기 전에 table/function/column/RLS negative test가 모두 필요하다.

## 4.4 Write-command inventory

상태 정의:

```text
IMPLEMENTED
→ 명시적 server command가 있고 핵심 authority/locking/replay semantics가 코드 evidence로 확인됨

PARTIAL
→ 일부 lifecycle command가 있으나 전체 integrity lifecycle가 닫히지 않음

SCHEMA-ONLY
→ schema/constraint/query는 있으나 authoritative mutation path가 baseline에서 확인되지 않음

NOT-CONFIRMED
→ 이번 baseline inventory에서 구현 evidence를 확인하지 못함. “절대 존재하지 않음”과 동의어가 아님
```

| Domain | Baseline status | Evidence / boundary |
|---|---|---|
| Chat receive | IMPLEMENTED | `0210_chat_receive_command.sql`; thread lock, client turn id + request hash replay/conflict, `next_sequence_no` allocator |
| Chat attempt allocate/stage/commit | IMPLEMENTED | `0220_chat_attempt_commit_commands.sql`; attempt allocator + terminal commit + relationship/memory/outbox side effects |
| Chat retry/abandon | IMPLEMENTED | `0230_*`, `0760_*` |
| Birth revision append | IMPLEMENTED | `0240_birth_revision_append_command.sql`; row lock + expected-current CAS + replay |
| Birth create | IMPLEMENTED | `0560_*`, plus runtime authority hardening through `0860` in repository |
| Reading session/create/transport/clarification | PARTIAL | `0250`/`0260`/`0270` command families exist; full production activation/failure matrix remains gated |
| Notification provider attempt | IMPLEMENTED | `0280_notification_delivery_attempt_commands.sql`; allocator + sent/failed finalization; provider call outside tx |
| Account deletion start | PARTIAL | `0290_account_deletion_start_command.sql`; deletion start/revocation is atomic, destructive finalization depends on `P0-PR-01` |
| Guest→new Member same-subject promotion | IMPLEMENTED | `0300_guest_promotion_command.sql`; subject/session lock, natural replay, no owner reparent |
| Guest→existing Member merge apply | SCHEMA-ONLY/PARTIAL | merge job/action schema + current/lineage queries exist; full authoritative merge apply state machine command not confirmed |
| Memory grant revoke | IMPLEMENTED | `0330_memory_grant_revoke_command.sql` |
| Memory proposal accept/reject | NOT-CONFIRMED | proposal schema/dedupe exists; dedicated user resolution command not confirmed |
| Life Fact revoke/supersede/grant revoke | IMPLEMENTED/PARTIAL | `0350`, `0690`, `0730`; creation/acceptance caller matrix still requires slice verification |
| Standalone relationship mutation | NOT-CONFIRMED | chat-origin relationship effect exists inside chat commit; separate mutation command not confirmed |
| Episode progress mutation | SCHEMA-ONLY | projection + `episode_progress_events` schema/query exists; authoritative mutation command not confirmed |
| Character unlock mutation | SCHEMA-ONLY | `character_unlocks` schema/current query exists; authoritative mutation command not confirmed |
| Purchase Intent | IMPLEMENTED | `0660_purchase_intent_create_command.sql`; member-only, immutable offer snapshot, owner-scoped idempotency |
| Receipt/provider-event ingestion → entitlement source/event/projection | PARTIAL | commerce schema + cross-row triggers exist; full transaction command path not confirmed |
| Entitlement effective projection | SCHEMA-ONLY/PARTIAL | grants/events/projection schema and source constraints exist; authoritative projection update transaction not confirmed |
| Outbox claim | IMPLEMENTED | `0670_outbox_claim_command.sql`; lease claim/reclaim |
| Outbox success completion | IMPLEMENTED | `0700_outbox_success_completion_command.sql` |
| Outbox failure/backoff/dead-letter | NOT-CONFIRMED | no authoritative failure lifecycle command confirmed |
| Central rate/quota/abuse mutation authority | NOT-CONFIRMED | source requirement exists; one unified authoritative implementation was not established by this inventory |

이 표의 `NOT-CONFIRMED`/`SCHEMA-ONLY` 항목을 production-ready로 승격하려면 실제 caller, exact command, authz, negative/concurrency tests를 함께 제시해야 한다.

## 4.5 Repository governance baseline

현재 `main` branch protection/ruleset enforcement가 없는 상태가 확인된 바 있다. 이는 runtime integrity와 별개의 **migration publication governance risk**다.

Schema-affecting PR은 최소한 다음을 required review evidence로 강제해야 한다.

```text
exact-head migration diff
+ schema catalog diff
+ negative tests
+ concurrency/idempotency tests
+ rollback/forward-fix statement
```

---

# 5. Threat / Failure Model

## 5.1 Authorization threats

- 공격자가 다른 subject의 UUID를 body/path에 제출
- Member credential과 Guest credential classification 혼동
- invalid JWT가 Guest fallback으로 통과
- pooled connection에서 이전 request `subject_id` context 잔존
- service-role/BYPASSRLS credential이 ordinary user path에 혼입
- SECURITY DEFINER 함수가 과도한 search_path/GRANT를 가짐

## 5.2 Retry/idempotency threats

- client timeout 후 같은 request 재전송
- DB commit 성공 후 HTTP response loss
- mobile offline queue 재전송
- webhook duplicate
- stream reconnect가 동일 chat turn을 새 turn으로 생성
- same idempotency key에 다른 payload 재사용

## 5.3 Concurrency threats

- 두 device가 같은 Birth current revision 수정
- 같은 thread에 동시 chat turn 제출
- 같은 logical delivery에 동시 provider attempt allocate
- Guest session이 서로 다른 Member merge로 동시 claim
- 동일 relationship revision에 두 event 적용
- same entitlement scope에 out-of-order provider lifecycle event 적용
- deletion_pending 전환과 새로운 capability write 경합

## 5.4 Partial failure threats

- external provider side effect 성공 후 DB completion 전에 worker crash
- outbox claim 후 worker crash
- Saju/AI call 성공 후 authoritative DB commit 실패
- authoritative DB commit 성공 후 client response loss
- notification provider accepts send but client transport times out
- rollback 후 external system만 성공한 상태

## 5.5 Data integrity threats

- cross-subject FK가 단일 `id` FK 때문에 다른 owner row를 연결
- current projection만 변경되고 ledger가 누락
- ledger만 append되고 projection 반영 실패
- mutable historical revision
- merge 과정에서 history owner 재작성
- hash를 anonymization으로 오인해 retention/delete 범위에서 제외

## 5.6 Migration threats

- repository migration과 production catalog drift
- 동일 migration version의 내용 변경
- backward-incompatible constraint를 live traffic에 즉시 적용
- RLS enable 전에 runtime caller가 열린 상태
- branch governance 없이 schema authority가 직접 main에 게시

---

# 6. Invariant Classification

모든 invariant는 반드시 아래 세 유형 중 하나로 분류한다.

## 6.1 DDL-native invariant

DB의 PK/FK/UNIQUE/CHECK/NOT NULL/exclusion/partial unique로 표현 가능한 규칙.

예:

- `(id, subject_id)` composite ownership target
- `(thread_id, client_turn_id)` uniqueness
- positive revision/attempt number
- one active self Birth Profile
- append source references의 same-subject composite FK

원칙:

> DDL로 막을 수 있는 것을 application check만으로 두지 않는다.

## 6.2 Constraint-trigger invariant

한 row의 CHECK로 표현하기 어렵고 다른 row의 의미를 읽어야 하지만, transaction commit 시점까지 DB가 강제해야 하는 규칙.

예:

- provider event resolved subject와 receipt/account provenance 일치
- relationship event와 applied revision 일치
- verified receipt와 product/provider mapping 일치
- merged target이 direct canonical member인지 확인

가능하면 `DEFERRABLE` semantics를 사용해 하나의 합법적 transaction 내 중간 상태를 허용하고 최종 commit 상태를 검증한다.

## 6.3 Server-command invariant

locking, CAS, request replay, 외부 호출 분리, multi-row orchestration처럼 DB constraint만으로 충분하지 않은 규칙.

예:

- Birth revision append
- Chat receive/commit
- Purchase Intent creation
- Guest promotion/merge
- Outbox claim/finalization
- notification attempt allocate/finalize

## 6.4 Defense in depth

중요 ownership rule은 한 층에만 의존하지 않는다.

```text
composite FK
+ RLS/default deny
+ command subject/context parity
+ API object authorization
+ negative test
```

---

# 7. PostgreSQL Constraint Architecture

## 7.1 Ownership composite key

user-owned parent가 child를 참조할 때 가능한 경우 다음 형태를 우선한다.

```text
parent UNIQUE (id, subject_id)
child FK (parent_id, subject_id)
    → parent(id, subject_id)
```

단일 `parent_id → parent.id`만 두고 application에서 subject를 비교하는 방식은 방어가 약하다.

## 7.2 Immutable identity

다음은 생성 후 identity를 rewrite하지 않는다.

- Birth revision owner/input identity
- chat turn/message owner/thread identity
- commerce receipt transaction identity
- provider inbound event identity
- entitlement event source identity
- immutable content bundle identity
- merge historical owner identity

변경은 새 revision/event/source row로 표현한다.

## 7.3 Append-only ledger

ledger는 UPDATE/DELETE로 과거를 재작성하지 않는다.

대표 대상:

- `relationship_events`
- `episode_progress_events`
- `entitlement_events`
- immutable Birth revisions
- provider provenance event

retention/legal erase가 필요한 경우 일반 mutation API가 아니라 별도 lifecycle/deletion authority만 사용한다.

## 7.4 Partial unique

“한 개만 active/current” 규칙은 partial unique를 우선한다.

예:

- one active default content release
- one active self Birth Profile
- one active logical identity mapping

## 7.5 Allocator

sequence/attempt/revision allocator는 다음 중 하나다.

- locked parent row의 `next_*` counter
- expected-current CAS + deterministic new revision
- DB sequence가 의미에 맞는 경우 sequence

금지:

```sql
SELECT MAX(sequence_no) + 1
SELECT MAX(attempt_no) + 1
```

## 7.6 Deferred validation

한 transaction 안에서 parent pointer와 child append를 함께 바꾸는 경우 intermediate state 때문에 정상 write가 막히지 않도록 필요한 constraint trigger는 `DEFERRABLE` 여부를 검토한다.

---

# 8. Subject Ownership Model

## 8.1 Canonical owner

모든 user-owned product data의 canonical owner key는 `subjects.id`다.

`auth.users.id`는 인증 계정 authority이며 product owner PK를 대체하지 않는다.

## 8.2 Subject lifecycle

개념적으로 다음 상태를 구분한다.

```text
active guest
active member
deletion_pending member
merged guest
deleted
```

`merged guest`는 historical lineage다. 다른 guest로 merge chain을 만들지 않는다.

## 8.3 Guest→new Member

동일 subject가 guest에서 member로 승격된다.

```text
subject_id 유지
+ auth_user_id binding
+ guest session consumed/claimed
+ existing user-owned rows owner 변경 없음
```

현재 `cmd_promote_guest_v1`은 이 경계를 구현한다.

## 8.4 Guest→existing Member

이 경우 guest subject와 member subject가 서로 다른 canonical identity이므로 단순 owner reparent를 금지한다.

```text
Guest historical immutable data
→ guest subject owner 유지
→ direct merged lineage로 read-only 보존

필요한 member-side current projection/import
→ 새 member-owned resource 생성
→ subject_merge_actions에 source/action/target 기록
```

Birth conflict를 자동 overwrite하지 않는다.

## 8.5 Deletion pending

삭제 시작 후 신규 고가치 capability write가 계속 들어오면 deletion graph가 불안정해진다. 따라서 deletion-start transaction과 관련 constraint/command는 chat/reading 등 신규 authority write를 fail-closed해야 한다.

---

# 9. Authorization / RLS Architecture

## 9.1 Authentication evidence와 owner authorization 분리

```text
credential
→ verifier
→ trusted identity evidence
→ canonical subject resolver
→ transaction-scoped subject context
→ RLS + object authorization
```

client가 전달한 subject ID는 owner proof가 아니다.

## 9.2 Ordinary execution role

ordinary user-data runtime은 다음 조건을 만족해야 한다.

- LOGIN principal과 execution role 분리 가능
- execution role `NOBYPASSRLS`
- `NOINHERIT`/narrow membership
- transaction마다 `SET LOCAL ROLE`
- subject context도 transaction-local
- pooled connection checkout 시 principal/role contract preflight
- transaction 종료 후 context leakage 불가

## 9.3 RLS policy rule

activated table은 기본적으로 current canonical subject와 owner column을 비교한다.

하지만 RLS만으로 충분하지 않다.

- object state eligibility
- content/version compatibility
- grant access
- merge lineage read-only
- deletion lifecycle

은 command/query contract에서 추가 검증한다.

## 9.4 SECURITY DEFINER

사용 시 최소 조건:

- 필요성이 명확할 것
- fixed safe `search_path`
- PUBLIC EXECUTE revoked
- exact execution role만 grant
- caller subject context 검증
- privilege escalation negative test

## 9.5 Activation matrix requirement

각 user-owned table/function은 다음 matrix를 가져야 한다.

```text
owner column
read policy
insert policy
update policy
delete policy
callable functions
allowed runtime role
system-only role
cross-subject negative test
merged-lineage rule
deletion_pending rule
```

이 matrix가 없는 vertical slice는 HTTP production activation을 금지한다.

---

# 10. Command Idempotency Contract

## 10.1 기본 원칙

idempotency는 “duplicate insert error를 무시”하는 것이 아니다.

정상 replay는 반드시 **동일 logical request**인지 확인해야 한다.

```text
same idempotency identity
+ same canonical request hash/shape
→ replay authoritative prior result

same idempotency identity
+ different request
→ conflict
```

## 10.2 Key scope

idempotency key는 global 문자열로 사용하지 않는다. domain/owner/object namespace를 가진다.

예:

```text
(subject_id, idempotency_key)
(thread_id, client_turn_id)
(provider, external_event_id)
(aggregate_type, aggregate_id, event_type, dedupe_key)
```

## 10.3 Request hash

request hash는 다음을 만족해야 한다.

- canonical serialization
- contract/schema version pin
- security-sensitive low-entropy input이면 keyed fingerprint 고려
- hash 자체를 익명화로 취급하지 않음

## 10.4 Required idempotent writes

상위 use case가 명시한 최소 대상:

- chat turn
- relationship event
- Saju reading creation
- memory acceptance
- purchase/receipt verification
- character unlock

추가로 operational integrity상 다음도 필요하다.

- Guest claim/merge
- notification delivery attempt finalization
- outbox delivery completion
- deletion start
- provider webhook ingestion

## 10.5 Response-loss replay

DB commit 후 response가 유실된 경우 client retry는 새 side effect를 만들지 않고 기존 authoritative result를 반환해야 한다.

---

# 11. Transaction Boundary Catalog

| Command family | Atomic DB boundary | Serialization authority | External call in tx? |
|---|---|---|---|
| Chat receive | turn + user message allocation | conversation thread row | 금지 |
| Chat attempt allocate | attempt allocation/state | chat turn row | 금지 |
| Chat terminal commit | assistant message + approved domain effects + outbox + committed state | chat turn/attempt | 금지 |
| Birth revision append | revision insert + current pointer update | birth profile row / expected revision | 금지 |
| Reading create/clarification DB step | logical session/reading/attempt state | reading session/readings | 금지 |
| Guest same-subject promotion | subject kind/auth binding + session consume | subject then guest session | 금지 |
| Guest existing-member merge | job/action/projection transitions | explicit merge job lock order required | 금지 |
| Purchase Intent | immutable intent + pinned offer snapshot | owner/idempotency uniqueness | 금지 |
| Provider event ingestion | inbound event dedupe + verified resolution staging | provider external event identity | provider verification call 금지 |
| Entitlement application | grant/event/projection consistency | entitlement logical scope | 금지 |
| Notification attempt prepare/finalize | attempt ledger + logical delivery projection | notification delivery row | provider send 금지 |
| Outbox claim/complete/fail | lease/status lifecycle | outbox row | consumer call 금지 |
| Account deletion start | subject status + immediate revocations + outbox | subject row | 금지 |

외부 Saju/AI/payment/push/webhook provider call은 transaction 이전/이후 orchestration에서 수행한다. DB transaction은 authoritative staging/commit만 담당한다.

---

# 12. Concurrency Control Model

## 12.1 Row-lock authority

동일 logical aggregate의 concurrent write는 parent/current row를 `FOR UPDATE`로 serialize한다.

대표:

- conversation thread / chat turn
- birth profile
- notification delivery
- outbox event claim
- subject / guest session
- deletion subject

## 12.2 Optimistic CAS

stale client edit가 정상 최신 값을 덮지 않도록 expected revision/current pointer를 command input으로 받는다.

Birth revision의 baseline semantics가 기준 사례다.

```text
expected current revision == DB current
→ append

이미 deterministic new revision이 current
→ exact replay 검증 후 replay

그 외
→ revision conflict
```

## 12.3 Lock order

둘 이상의 aggregate를 lock해야 하는 command는 고정 lock order를 문서화한다.

예:

```text
subject
→ guest_session
→ merge_job/action/resources
```

반대 순서를 허용하면 deadlock risk가 증가한다.

## 12.4 Unique constraint as race arbiter

동시 first-write race는 application의 선행 SELECT만 믿지 않는다.

```text
INSERT ... ON CONFLICT DO NOTHING
→ winner readback
→ exact request equality 검증
```

Purchase Intent pattern을 일반 reference로 사용한다.

## 12.5 Retryable serialization failure

SQLSTATE `40001` 또는 명시적 revision conflict는 오류 은폐가 아니라 normal concurrency result다. API는 retryable/stale-edit semantics를 보존한다.

---

# 13. Ledger / Projection Consistency

## 13.1 원칙

current projection은 빠른 read authority이고, ledger는 변화 provenance authority다.

둘을 같은 transaction에서 변경할 수 있는 domain은 반드시 함께 commit한다.

```text
ledger append 실패
→ projection 변경도 rollback

projection update 실패
→ ledger append도 rollback
```

## 13.2 Relationship

```text
relationship_events
→ source ledger

user_character_states
→ current projection
```

동일 applied revision을 두 event가 차지하지 못해야 한다. retry가 동일 relationship delta를 다시 적용하지 않아야 한다.

## 13.3 Episode

```text
episode_progress_events
→ progression ledger

user_episode_progress
→ current projection
```

ERD에는 ledger/projection 구조가 있으나 baseline에서 authoritative mutation command가 확인되지 않았다. 따라서 `SCHEMA-ONLY`이며 production activation 전 command+race tests가 필요하다.

## 13.4 Entitlement

```text
entitlement_grants
→ 독립 source grant projection

entitlement_events
→ lifecycle provenance

entitlements
→ 여러 grant를 합성한 effective access projection
```

중요 invariant:

- grant A+B active 상태에서 A revoke가 B까지 무효화하면 안 됨
- out-of-order provider event가 최신 grant 상태를 뒤로 되돌리면 안 됨
- `effective_valid_until`이 지났으면 sweeper 지연과 무관하게 access deny
- unverified source는 grant/event를 만들 수 없음

baseline은 schema/constraint를 보유하지만 전체 application transaction path가 확인되지 않았으므로 production-complete로 선언하지 않는다.

## 13.5 Reconciliation

projection drift를 감지하는 read-only reconciliation query/test를 두되, 일반 runtime이 ledger를 임의 재작성하지 않는다.

---

# 14. Transactional Outbox

## 14.1 역할

DB authoritative commit과 외부 side effect delivery를 분리한다.

```text
business transaction
→ authoritative rows + outbox_events append
→ COMMIT

worker
→ outbox claim
→ external side effect
→ completion/failure DB command
```

## 14.2 Baseline

현재 확인된 것:

- outbox append가 일부 authoritative commit과 같은 transaction에 포함
- `0670_outbox_claim_command.sql`: claim + stale lease reclaim
- `0700_outbox_success_completion_command.sql`: current worker/lease 기반 success completion

현재 확인되지 않은 것:

- authoritative failure completion command
- backoff scheduling policy
- attempt-count increment timing
- poison event semantics
- terminal/dead-letter threshold
- batch ordering requirement
- consumer-side idempotency/reconciliation contract

이를 `PI-P0-02`로 추적한다.

## 14.3 Target failure contract

정확한 숫자/시간은 운영 정책에서 정하되 semantics는 다음을 만족해야 한다.

`OUT-01` claim은 lease owner/token/expiry identity를 가져야 한다. 오래된 worker가 새 lease를 덮어쓰지 못한다.

`OUT-02` success completion은 current lease holder만 가능하고 exact retry는 replay된다.

`OUT-03` failure completion은 오류 category와 retry eligibility를 기록하고, 재시도 가능한 경우 다음 eligible time을 server policy로 계산한다.

`OUT-04` attempt count 증가 시점을 하나로 고정한다. claim 때와 failure 때를 혼합하지 않는다.

`OUT-05` terminal event는 삭제하지 않는다. dead-letter/terminal 상태와 마지막 오류/provenance를 유지한다.

`OUT-06` payload/schema version과 dedupe namespace를 명시한다.

`OUT-07` consumer는 stable delivery identity를 받는다. provider가 idempotency key를 지원하면 outbox event identity를 안정적으로 매핑한다.

`OUT-08` 다음 failure를 반드시 검증한다.

```text
external side effect accepted
→ worker crashes before DB success completion
→ lease expires
→ event redelivered
```

이 경우 business side effect가 중복되지 않도록 consumer idempotency 또는 provider reconciliation이 필요하다. DB outbox만으로 exactly-once external side effect를 선언하지 않는다.

---

# 15. Retry / Partial Failure Model

## 15.1 DB commit 전 외부 실패

외부 Saju/AI/provider call이 실패했고 authoritative commit 전이면 상태는 `retryable/failed` staging으로만 남기거나 아무 business effect도 commit하지 않는다.

Saju failure를 generic AI 추측으로 대체하지 않는다.

## 15.2 DB commit 후 response loss

client retry는 idempotency identity로 기존 committed result를 반환한다.

## 15.3 Stream disconnect

controlled reveal/stream transport가 끊겨도 assistant message/domain event를 새로 commit하지 않는다. transport state와 authoritative turn state를 분리한다.

## 15.4 External accepted / local ambiguous

notification/payment/outbox consumer는 provider accepted 여부가 모호한 timeout을 단순 “실패”로 간주해 즉시 duplicate send하지 않는다. provider-specific reconciliation slot을 둔다.

## 15.5 Retry budget

retry 횟수/시간 값은 운영 정책이지만, DB authority는 다음을 구분해야 한다.

```text
retryable
terminal
ambiguous-needs-reconciliation
```

---

# 16. Guest → Member Integrity

## 16.1 Same-subject promotion

현재 구현 reference: `cmd_promote_guest_v1`.

필수 invariant:

- exact subject/session/auth identity required
- subject lock 후 session lock
- active unmerged guest만 가능
- expired/consumed/claimed session 거부
- auth identity가 이미 다른 subject에 연결되면 promotion 거부하고 merge path 요구
- 성공 시 `subject_id` 유지
- response-loss replay는 same final binding을 검증 후 replay

## 16.2 Existing-member merge

필수 state machine:

```text
detected
→ awaiting_resolution (conflict 존재 시)
→ running
→ completed | failed
```

필수 invariant:

- one guest session → one canonical account target
- guest → direct canonical member만 허용
- merge chain/cycle 금지
- immutable historical row reparent 금지
- Birth conflict 자동 overwrite 금지
- each resource action dedupe
- applied action은 provenance와 target resource를 기록
- retry 시 이미 applied action을 중복 생성하지 않음

현재 baseline에서는 전체 apply command가 확인되지 않았으므로 이 path는 activation HOLD다.

---

# 17. Version / Revision Policy

## 17.1 Immutable revision

사용자 correction은 과거 row UPDATE가 아니라 새 revision append다.

대표:

- Birth Profile revision
- content bundle
- reading provenance
- relationship/episode/entitlement event

## 17.2 Execution pinning

가능한 범위에서 실행 결과는 다음 version을 보존한다.

```text
characterVersion
world/content bundle version
promptVersion
relationshipPolicyVersion
sajuEngineVersion
groundingVersion
API contract version
```

## 17.3 Long-lived thread

새 default content release가 생겼다는 이유만으로 기존 thread 의미를 조용히 바꾸지 않는다.

migration/transition이 필요하면 explicit content transition event 또는 source-defined migration contract를 사용한다.

## 17.4 Hash/fingerprint version

```text
sha256:vN:...
hmac-sha256:kN:...
```

key rotation 이후 historical replay/provenance 검증이 필요하면 verifier version을 유지한다.

---

# 18. Data Deletion Integrity

## 18.1 Baseline

`0290_account_deletion_start_command.sql`은 “삭제 완료”가 아니라 **삭제 시작 transaction authority**다.

확인된 목적:

- canonical subject lock
- idempotent deletion job
- active member → `deletion_pending`
- share artifact revoke
- device installation revoke
- future notification cancel
- 신규 chat/reading capability 차단
- outbox append

## 18.2 Finalization blocker

`P0-PR-01`이 OPEN이므로 다음을 임의 확정하지 않는다.

- product data retention 기간
- expired Guest data deletion 기간
- AI trace retention
- backup retention
- commerce/accounting/legal retention
- destructive cleanup cadence

따라서 final destructive deletion command/migration은 해당 decision 전 production-ready로 작성하지 않는다.

## 18.3 Delete graph requirement

최종 delete graph는 최소 다음을 포함해야 한다.

- Birth Profile / revisions
- Life Fact
- Memory / grants
- Conversation
- Target Person Profile
- Reading/personalized artifact
- AI log에 원문 복제가 존재한다면 동일 정책 영향
- direct merged Guest lineage

commerce/legal retention은 personalization erase와 분리한다.

---

# 19. Rate / Abuse Authority Boundary

상위 use case는 다음을 server authority로 요구한다.

- 사용자/세션 rate limit
- 반복 abuse 제한
- 무료/유료 quota
- multi-character 최대 turn
- prompt/context budget
- notification frequency cap

이 문서는 구체 limit 숫자를 발명하지 않는다.

필수 architecture:

`ABUSE-01` client counter는 authority가 아니다.

`ABUSE-02` quota decision은 canonical subject/session + capability key + policy version을 사용한다.

`ABUSE-03` paid entitlement와 abuse allowance는 별도 개념이다. entitlement가 있다고 무제한 resource consumption을 허용하지 않는다.

`ABUSE-04` quota consume가 금전/권리 변화와 결합될 경우 idempotent command가 필요하다.

`ABUSE-05` notification frequency cap은 logical notification 생성/eligibility 단계에서 server-side로 강제한다.

현재 baseline에서 단일 중앙 mutation authority가 확인되지 않았으므로 구현 완료로 선언하지 않는다.

---

# 20. Logging / Sensitive Data Boundary

## 20.1 금지 logging

standard application/AI/ops log에 다음을 남기지 않는다.

- raw Member bearer/JWT
- raw Guest bearer
- service bearer
- database password/service role key
- raw payment credential/receipt secret material
- Birth 원문 전체
- 전체 chat transcript를 기본 telemetry에 복제

## 20.2 Correlation

관측에는 opaque correlation/request/execution ID를 사용한다.

## 20.3 Fingerprint

user-derived hash/fingerprint는 pseudonymous identifier이며 익명화가 아니다. delete/retention scope 검토 대상이다.

## 20.4 Error response

provider error body/stack/secret를 Product client에 그대로 전달하지 않는다. domain-safe error code와 correlation ID로 변환한다.

---

# 21. Migration Strategy / Catalog Diff

## 21.1 PI-P0-01

현재 repository와 documented production migration state 사이에 gap이 있다.

```text
repo: 0860 존재
runtime doc: prod LIVE THROUGH 0820
```

새 production DDL 전 반드시 실제 target DB에서 다음을 수집한다.

- migration history exact versions/checksums 가능한 범위
- table/column type/null/default
- PK/FK/UNIQUE/CHECK
- constraint trigger
- ordinary trigger
- indexes/partial indexes
- RLS enabled/forced state
- policies
- function signature/security definer/invoker/search_path
- function ACL
- role membership/BYPASSRLS attributes

## 21.2 Catalog diff gate

`MIG-01` desired schema는 migration files만 보고 추정하지 않는다.

`MIG-02` live catalog diff에서 unexpected extra/missing object를 분류한다.

`MIG-03` destructive/locking migration은 traffic/rollback impact를 명시한다.

`MIG-04` migration version 파일을 이미 배포 후 수정하지 않는다. forward migration으로 수정한다.

`MIG-05` RLS activation은 caller와 같은 PR/phase에서 negative test 없이 열지 않는다.

`MIG-06` exact production migration evidence가 없으면 “applied”를 문서 추정으로 선언하지 않는다.

## 21.3 Publication governance

Schema PR은 다음을 요구한다.

```text
reviewed architecture invariant IDs
+ exact-head CI
+ schema catalog diff
+ negative test result
+ concurrency/idempotency result
+ rollback/forward-fix note
```

branch/ruleset 보호가 없다면 이 gate는 사람의 관례가 아니라 repository rule/workflow로 승격하는 것을 권장한다.

---

# 22. Negative Test Matrix

아래는 architecture acceptance의 최소 matrix다. 실제 자동화 테스트 이름/fixture는 implementation phase에서 연결한다.

| ID | Area | Negative case | Expected |
|---|---|---|---|
| `TEST-AUTHZ-01` | Member | subject A credential → subject B profile | DENY |
| `TEST-AUTHZ-02` | Guest | guest session A → subject B | DENY |
| `TEST-AUTHZ-03` | Identity | invalid JWT-shaped bearer → Guest fallback | DENY, no fallback |
| `TEST-AUTHZ-04` | DB role | ordinary request under BYPASSRLS/service role | FAIL activation/preflight |
| `TEST-AUTHZ-05` | Pool | prior transaction subject context visible next checkout | impossible |
| `TEST-BIRTH-01` | Birth | child revision subject differs parent | FK/command DENY |
| `TEST-BIRTH-02` | Birth | stale expected current revision | conflict, no overwrite |
| `TEST-BIRTH-03` | Birth | mutate old immutable revision | DENY |
| `TEST-CHAT-01` | Chat | same client turn id, different request hash | conflict |
| `TEST-CHAT-02` | Chat | second in-flight turn when prohibited | DENY |
| `TEST-CHAT-03` | Chat | assistant message participant/bundle mismatch | DENY |
| `TEST-REL-01` | Relationship | same event replay | one effect |
| `TEST-REL-02` | Relationship | two events claim same applied revision | DENY |
| `TEST-MEM-01` | Memory | grant memory A to wrong subject object | DENY |
| `TEST-MEM-02` | Memory | proposal retry duplicate | one proposal/effect |
| `TEST-GUEST-01` | Guest | consumed session reuse | DENY |
| `TEST-GUEST-02` | Guest | expired session promotion | DENY |
| `TEST-GUEST-03` | Guest | auth identity already on another subject via same-subject promotion | REQUIRE MERGE |
| `TEST-GUEST-04` | Merge | merged guest → guest target | DENY |
| `TEST-GUEST-05` | Merge | merge chain/cycle | DENY |
| `TEST-COM-01` | Commerce | guest purchase | DENY |
| `TEST-COM-02` | Commerce | forged/unverified receipt → grant | DENY |
| `TEST-COM-03` | Commerce | provider account subject mismatch | DENY |
| `TEST-COM-04` | Commerce | unresolved provider event → entitlement effect | DENY |
| `TEST-COM-05` | Commerce | provider event subject A → subject B event | composite FK/trigger DENY |
| `TEST-COM-06` | Commerce | duplicate receipt/webhook | one source event |
| `TEST-COM-07` | Entitlement | revoke A while grant B active | access remains active |
| `TEST-COM-08` | Entitlement | expired effective_valid_until but sweeper delayed | access DENY |
| `TEST-NOTIF-01` | Notification | delivery subject A → installation B | DENY |
| `TEST-NOTIF-02` | Notification | revoked installation provider send | DENY |
| `TEST-AI-01` | AI | execution subject A → grounding B | DENY |
| `TEST-AI-02` | AI | content bundle mismatch | DENY |
| `TEST-OUT-01` | Outbox | same aggregate/event/dedupe retry | one outbox event |
| `TEST-OUT-02` | Outbox | same local dedupe on different aggregate | no false collision |
| `TEST-DEL-01` | Delete | new chat/reading after deletion_pending | DENY |
| `TEST-DEL-02` | Delete | deletion graph omits direct merged guest lineage | FAIL acceptance |
| `TEST-LOG-01` | Logging | raw bearer/secret in standard log | FAIL security test |

---

# 23. Concurrency / Partial-Failure Test Matrix

| ID | Scenario | Required invariant |
|---|---|---|
| `CONC-01` | two Birth edits same expected revision | exactly one wins; loser conflict |
| `CONC-02` | exact Birth retry after commit/response loss | same revision replay, no new revision |
| `CONC-03` | two same chat receive requests | one turn/user message |
| `CONC-04` | same client turn id different payload concurrently | one winner; other conflict |
| `CONC-05` | two attempt allocators same chat turn | unique attempt sequence/current attempt |
| `CONC-06` | stream disconnect after assistant commit | retry returns committed state, no duplicate message/event |
| `CONC-07` | relationship event concurrent web/mobile | monotonic unique revision |
| `CONC-08` | same Guest session → two new-member promotion attempts | one canonical result/replay |
| `CONC-09` | same Guest session → two different existing members | one target only; conflict/deny |
| `CONC-10` | merge worker crashes after one action | action dedupe prevents duplicate import |
| `CONC-11` | two purchase intent creates same key/same hash | one intent + replay |
| `CONC-12` | two purchase intent creates same key/different hash | one intent + conflict |
| `CONC-13` | duplicate provider webhook | one inbound source identity |
| `CONC-14` | provider lifecycle event arrives out of order | older event cannot roll projection backward |
| `CONC-15` | overlapping grants A+B then A revoked | effective entitlement remains via B |
| `CONC-16` | two notification attempt allocators | one running attempt number |
| `CONC-17` | provider send succeeds then response to worker ambiguous | reconcile/idempotency path; no blind duplicate |
| `CONC-18` | outbox worker claims then crashes | lease expiry allows reclaim |
| `CONC-19` | external outbox side effect succeeds then worker crashes before complete | redelivery does not duplicate business effect |
| `CONC-20` | stale worker tries completion after event re-leased | DENY stale lease completion |
| `CONC-21` | deletion start races with new chat/reading | either prior write commits before deletion lock or post-delete command denied; no untracked post-delete write |
| `CONC-22` | DB commit succeeds then HTTP response lost | exact retry replays prior result |
| `CONC-23` | Saju/AI timeout before terminal commit | no message/relationship/memory double effect |
| `CONC-24` | pooled connection reused after rollback | no prior role/subject context leakage |

각 concurrency test는 단일-thread sequential simulation만으로 대체하지 않는다. 가능한 경우 실제 두 DB connection/session을 사용한다.

---

# 24. Rollback / Recovery Semantics

## 24.1 Transaction rollback

DB transaction failure는 해당 command의 authoritative state 전체를 rollback해야 한다. 외부 side effect가 transaction 안에 없기 때문에 정상적인 내부 rollback과 외부 호출 failure를 분리할 수 있어야 한다.

## 24.2 Migration rollback

이미 production data를 변형한 migration에 대해 무조건 down migration을 요구하지 않는다. 데이터 손실 위험이 있는 경우 forward-fix가 더 안전할 수 있다.

각 migration PR은 다음 중 하나를 명시한다.

```text
reversible migration
forward-fix only
data backfill required
runtime dual-read/write transition required
```

## 24.3 Projection recovery

ledger가 충분한 domain은 projection drift를 rebuild/reconcile할 수 있어야 한다. 단, rebuild가 새로운 source event를 발명해서는 안 된다.

## 24.4 Outbox recovery

stale lease reclaim은 가능해야 하지만 stale worker completion은 금지한다. terminal/dead-letter event는 forensic/replay decision을 위해 보존한다.

## 24.5 Deletion recovery

삭제 job이 partial failure하면 상태를 숨기지 않는다. running/failed/retryable/terminal semantics와 마지막 적용 domain을 추적해야 하며, 법적 보존 data를 personalization delete와 섞지 않는다.

---

# 25. Open Decisions / Blockers

## 25.1 Product P0

| ID | Status | Integrity impact |
|---|---|---|
| `P0-SA-01` | DECIDED | authenticated internal HTTP calculation-only service; 이 문서에서 재개방하지 않음 |
| `P0-CM-01` | OPEN-P0 | receipt/provider lifecycle adapter 및 platform-specific entitlement ingestion activation HOLD |
| `P0-AI-01` | OPEN-P0 | AI provider/fallback/validation operational contract HOLD |
| `P0-AGE-01` | OPEN-P0 | age/content policy threshold 발명 금지 |
| `P0-PR-01` | OPEN-P0 | destructive deletion/final retention/backup policy HOLD |
| `P0-PR-01A` | DECIDED | Guest auth TTL 604800 seconds; broader retention과 혼동 금지 |
| `P0-AUTH-01` | DECIDED | non-BYPASSRLS role + transaction-scoped canonical subject context |

## 25.2 Platform integrity blockers

### `PI-P0-01` — Exact production schema/catalog state

Repository 0860 vs documented production 0820. 새로운 production DDL 전에 exact live catalog/history 재검증이 필요하다.

### `PI-P0-02` — Outbox failure/idempotent consumer lifecycle

claim/success만으로는 external accepted → worker crash → redelivery 중복을 닫지 못한다. failure/backoff/dead-letter/reconciliation/consumer idempotency contract가 필요하다.

### `PI-P0-03` — Deletion finalization

실제 destructive finalizer는 `P0-PR-01`이 결정되기 전 확정하지 않는다.

### `PI-GOV-01` — Schema publication governance

main protection/ruleset enforcement가 없는 상태에서는 schema authority publication에 human-error risk가 있다. Runtime P0와 분리해 repository governance 개선으로 추적한다.

## 25.3 Implementation gaps requiring second-stage closure

- Guest→existing Member merge apply command/state machine
- Memory proposal user acceptance/rejection command
- non-chat relationship mutation authority가 실제 제품에 필요한 경우 해당 command
- Episode progress event + projection atomic mutation
- Character unlock idempotent mutation
- provider event/receipt → entitlement grant/event/effective projection atomic command family
- outbox failure/dead-letter commands
- server quota/rate authority
- activated surface 전체 RLS matrix

---

# 26. Acceptance Criteria

이 architecture를 구현 완료로 부르려면 다음을 모두 만족해야 한다.

## 26.1 Structural

- 59-table authority catalog와 actual PostgreSQL catalog diff가 설명 가능
- phantom FK/target 없음
- user-owned cross-row ownership에 필요한 composite FK 존재
- immutable/append-only rules가 DB 또는 controlled deletion authority로 강제
- `MAX()+1` allocator 없음

## 26.2 Authorization

- ordinary production role NOBYPASSRLS 증명
- Member/Guest canonical subject resolver 증명
- transaction-local context leak negative test
- activated table/function별 RLS/ACL matrix
- own-subject positive + cross-subject negative E2E
- privileged/system path와 ordinary user path 분리

## 26.3 Idempotency / concurrency

- required write command별 idempotency identity 정의
- same-key/same-request replay
- same-key/different-request conflict
- DB commit/response loss replay
- true concurrent race tests
- stale revision conflict tests

## 26.4 Ledger/projection

- relationship current/ledger atomicity
- episode current/ledger atomicity
- entitlement grant/event/effective projection atomicity
- out-of-order event protection
- overlapping-grant behavior

## 26.5 Outbox

- append in business transaction
- lease claim/reclaim
- success replay
- failure/backoff/terminal semantics
- stale worker rejection
- consumer stable idempotency/reconciliation
- external accepted + crash-before-complete test

## 26.6 Deletion

- start transaction fail-closed
- complete deletion graph
- merged lineage 포함
- retention/legal commerce separation
- `P0-PR-01` 결정 없는 destructive policy 발명 없음

## 26.7 Evidence rule

완료 판정 최소 evidence:

```text
Implementation
+ Automated Tests
+ Contract/Schema Evidence
+ Security Negative Tests
+ Concurrency/Partial-Failure Tests
+ E2E Vertical Slice
+ Exact Production Evidence for activated runtime
```

local `npm run check`만으로 remote production 상태를 증명하지 않는다.

---

# 27. Implementation Phases

아래 순서는 production schema를 성급하게 변경하지 않기 위한 실행 순서다.

## Phase PI-0 — Freeze and inventory

- baseline main SHA 고정
- exact write-command inventory 완성
- actual caller inventory
- RLS/ACL matrix 생성
- unresolved source decision mapping

**Schema write: 금지**

## Phase PI-1 — Production catalog recovery

- `PI-P0-01` 해결
- production migration history/catalog read-only dump
- repo desired schema와 diff
- 0830~0860 실제 적용 여부 확인

**Schema write: 금지**

## Phase PI-2 — Invariant test harness

- 59-table DDL negative tests
- composite ownership tests
- immutable/append-only tests
- role/RLS negative harness
- true two-session concurrency harness

## Phase PI-3 — Missing authoritative command design

우선순위:

1. outbox failure/dead-letter + consumer idempotency (`PI-P0-02`)
2. Guest→existing Member merge apply
3. entitlement ingestion/application/projection
4. episode progress mutation
5. character unlock mutation
6. memory proposal resolution
7. 필요한 standalone relationship mutation
8. quota/abuse authority

각 command는 구현 전에 `CMD-*`, `INV-*`, `AUTHZ-*`, `CONC-*`, `TEST-*`를 연결한다.

## Phase PI-4 — Migration plan only

- 필요한 DDL/trigger/function diff 작성
- lock/traffic impact
- backfill 여부
- RLS rollout 순서
- rollback/forward-fix 전략
- exact target production baseline SHA/catalog 명시

이 단계까지도 아직 production apply를 의미하지 않는다.

## Phase PI-5 — Repository implementation

- migration/function/application adapter 구현
- negative/concurrency/partial-failure tests
- exact-head CI
- schema catalog diff

## Phase PI-6 — Controlled production migration

전제:

```text
PI-P0-01 closed
+ relevant product P0 decided
+ exact-head reviewed
+ migration tests green
+ rollback/forward-fix ready
```

적용 후 actual catalog를 재조회한다.

## Phase PI-7 — Vertical-slice activation

각 HTTP surface는 개별로 다음을 증명한다.

```text
identity
→ canonical subject
→ DB transaction context
→ RLS/object authz
→ command/query
→ own-subject positive
→ cross-subject negative
→ retry/concurrency behavior
→ production smoke
```

## Phase PI-8 — Integrity completion review

다음 표현은 이 단계의 evidence review 통과 후에만 가능하다.

```text
Migration-Ready
Production-Safe for explicitly listed activated slices
Integrity-Complete for explicitly listed scope
```

전체 제품을 blanket하게 “Production-Safe”라고 부르지 않고 활성화된 vertical slice와 미활성화 영역을 명시한다.

---

# Appendix A. Stable Architecture IDs

새 구현/테스트/PR은 가능하면 다음 namespace를 사용한다.

```text
INV-*    relational/domain invariant
AUTHZ-*  authentication/authorization/RLS
CMD-*    server command contract
CONC-*   concurrency/locking/CAS
OUT-*    outbox/delivery
TEST-*   negative/acceptance test
MIG-*    migration/catalog gate
ABUSE-*  quota/rate authority
PI-P0-*  platform integrity blocker
PI-GOV-* repository/release governance
```

# Appendix B. Final Integrity Boundary

```text
Saju Engine
→ calculation/interpretation capability authority

MyeongHa Product DB
→ owner/input/history/chat/relationship/progress/rights/result provenance authority

Character Runtime
→ authorized meaning delivery authority

Client
→ cache + optimistic presentation only
```

최종 원칙:

> **DB constraint가 막을 수 있는 것은 DB가 막고, DB constraint만으로 부족한 것은 server command가 transaction/lock/idempotency로 닫으며, 사용자 경계는 RLS와 object authorization을 중첩한다. 외부 side effect는 transaction 밖에서 처리하되 outbox와 consumer idempotency로 crash/retry를 정상 경로로 설계한다.**
