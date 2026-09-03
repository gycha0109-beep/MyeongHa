# 명하 플랫폼 무결성 아키텍처 v1

> Product: **명하 (MyeongHa)**  
> Document: **Platform Integrity Architecture v1**  
> Baseline repository: `gycha0109-beep/MyeongHa`  
> Baseline `main`: `0fcd9f2b0dd18e6a9a97edc408b5a10204bdbbfd`  
> Date: 2026-09-04  
> Status: **ARCHITECTURE DRAFT / SELF-REVIEWED / NOT MIGRATION-READY / NOT PRODUCTION-SAFE / NOT INTEGRITY-COMPLETE**

---

## 0. 문서 판정과 authority 우선순위

이 문서는 명하의 PostgreSQL 구조적 무결성, 인증/인가, idempotency, transaction, concurrency, ledger/projection, transactional outbox, 삭제 및 logical abuse authority를 하나의 production-integrity 기준으로 통합한다.

이 문서는 새로운 제품 의미를 발명하지 않는다. **source authority가 의미를 정의하고, 이 문서는 그 의미를 DB/command/runtime 무결성 경계로 내린다.**

### 0.1 Source authority

제품/데이터 의미의 상위 authority:

1. `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST.md`
2. `Usecase_re_reviewed_v2.md`
3. `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW.md`
4. 필요한 Character / Saju / UX architecture

현재 repository의 구현/결정 상태를 구체화하는 authority:

- `docs/P0_DECISION_REGISTER.md`
- `docs/SERVER_COMMAND_TRANSACTION_SPEC.md`
- `docs/AUTH_RLS_PRIVACY_SPEC.md`
- `docs/DB_DDL_MIGRATION_SPEC.md`
- `docs/API_CONTRACT.md`
- `docs/RUNTIME_STATUS.md`
- `docs/COMMERCE_ENTITLEMENT_SPEC.md`
- `docs/COST_QUOTA_ABUSE_SPEC.md`
- `supabase/migrations/*`
- `apps/api/*`의 실제 production caller/runtime

`MyeongHa_Integration_Spine_v1_FINAL_REVIEWED_v1.2.md`는 중요한 설계 근거지만 captured runtime state가 최신 repository보다 오래되었다. 예를 들어 그 문서의 `P0-AUTH-01 OPEN`은 현재 `docs/P0_DECISION_REGISTER.md`의 `P0-AUTH-01 DECIDED`보다 오래된 상태다. 제품 의미를 변경하지 않는 범위에서 **최신 explicit decision + 최신 implementation evidence**를 현재 상태 판단에 사용한다.

Migration 파일의 과거 주석이 현재 decision register와 충돌하는 경우, 주석을 현재 decision authority로 재해석하지 않는다. 예를 들어 과거 migration에 `P0-AUTH-01 remains unresolved`라는 주석이 남아 있어도 현재 decision status는 `P0_DECISION_REGISTER.md`가 기준이다.

### 0.2 금지된 readiness 표현

현재 상태에서 다음 표현을 사용하지 않는다.

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

상위 ERD v0.6도 DDL negative test suite 통과 전 migration-complete 선언을 금지한다.

### 0.3 Source-gap rule

`SERVER_COMMAND_TRANSACTION_SPEC.md`가 `SRC-*`를 OPEN/BLOCKED로 명시한 영역은 이 문서가 transition rule, payload schema, threshold, retry policy, merge algorithm 등을 임의 확정하지 않는다.

```text
source가 정하지 않음
→ 구조적 envelope/invariant만 기록 가능
→ executable production mutation semantics는 HOLD
```

---

# 1. 목적

명하 플랫폼은 다음 상황에서도 authority가 깨지지 않아야 한다.

- 모바일/브라우저 재시도
- response loss
- concurrent web/mobile mutation
- stale client revision
- stream disconnect
- AI/Saju timeout
- worker crash
- DB rollback
- duplicate/out-of-order provider event
- Guest→Member 전환 race
- 다른 subject의 object ID 제출
- privileged credential 오용
- schema drift
- deletion과 일반 write의 race

핵심 목표:

```text
같은 logical 행위는 한 번만 의미를 만든다.
다른 사용자의 object를 조작할 수 없다.
current projection과 source ledger가 모순되지 않는다.
외부 side effect는 DB transaction 밖에 둔다.
retry/concurrency/partial failure를 정상 경로로 취급한다.
source 미결정을 구현 편의로 채우지 않는다.
```

---

# 2. 범위 / 비범위

## 2.1 범위

- PostgreSQL PK/FK/UNIQUE/CHECK/constraint trigger
- immutable/append-only authority
- canonical `subject_id` ownership
- Member/Guest identity resolution
- transaction-scoped subject context
- RLS/default deny/object authorization
- command idempotency
- row locking / CAS / allocator
- transaction boundaries
- ledger/projection consistency
- transactional outbox publisher integrity
- retry/partial-failure boundary
- Guest→Member integrity
- revision/version pinning
- deletion integrity envelope
- logical rate/quota/abuse authority boundary
- sensitive logging boundary
- migration/catalog verification
- negative/concurrency/partial-failure acceptance evidence

## 2.2 비범위

- 실제 결제 rail/provider 선택 (`P0-CM-01`)
- AI provider/model/fallback 선택 (`P0-AI-01`)
- 최소 이용 연령 정책 (`P0-AGE-01`)
- retention 기간 자체 (`P0-PR-01`)
- Saju 해석 의미 생성
- Character canon/persona 의미 생성
- hosting/autoscaling/CDN/infra capacity
- Redis/message broker 도입 전제
- OPEN `SRC-*`의 미정 의미를 이 문서에서 결정하는 행위

---

# 3. Authority Model

Hard boundary:

```text
Saju Engine
→ 무엇을 계산/해석할 수 있는가

MyeongHa Product DB
→ 누구의 입력/기록/대화/관계/권한/결과인가

Character Runtime
→ 허용된 의미를 어떤 캐릭터 화법으로 전달하는가
```

## 3.1 데이터 authority

| Authority | Canonical source |
|---|---|
| 인증 계정 | Supabase `auth.users` |
| 명하 owner identity | `subjects` |
| 출생 입력 revision | `birth_profile_revisions` |
| 현재 삶 구조화 history | `life_facts` |
| 캐릭터 memory/access | `memory_items` + `record_access_grants` |
| 대화 history/turn state | `conversation_threads` / `chat_turns` / `conversation_messages` |
| Saju execution/provenance | `reading_sessions` / `readings` / execution attempts / refs / groundings |
| 관계 current projection | `user_character_states` |
| 관계 source ledger | `relationship_events` |
| episode current projection | `user_episode_progress` |
| episode source ledger | `episode_progress_events` |
| 독립 entitlement source/lifecycle | `entitlement_grants` + `entitlement_events` |
| effective access projection | `entitlements` |
| post-commit external publication queue | `outbox_events` |
| logical notification/delivery retry | notifications / deliveries / delivery attempts |

## 3.2 절대 금지

- frontend/mobile cache를 authority로 취급
- `auth.uid() == subjects.id` 가정
- client-supplied `subject_id`를 current-owner authority로 사용
- ordinary user CRUD를 `service_role`/BYPASSRLS로 수행
- Guest merge 때문에 immutable history `subject_id` bulk reparent
- client direct relationship/unlock/entitlement mutation
- raw Guest/share/payment/service bearer 저장
- hash/fingerprint를 anonymization으로 취급
- `MAX(sequence_no)+1` / `MAX(attempt_no)+1`
- 외부 API 호출을 DB transaction 안에서 수행

---

# 4. Current Implementation Baseline

이 섹션은 **현재 구현 evidence**다. 목표 상태와 혼동하지 않는다.

## 4.1 Repository / production baseline

Baseline `main`:

```text
0fcd9f2b0dd18e6a9a97edc408b5a10204bdbbfd
```

Repository migration inventory:

```text
0010 ... 0860
```

현재 `docs/RUNTIME_STATUS.md`의 documented production migration state:

```text
project: cnsfpcdiyofqvhpcegfc
LIVE THROUGH 0820
```

따라서:

```text
Repository migration state
→ through 0860

Documented production migration state
→ through 0820

Exact live production catalog/history
→ 이 architecture review에서 직접 재검증되지 않음
```

이를 `PI-P0-01`로 추적한다.

## 4.2 Current identity execution baseline

`P0-AUTH-01`은 **DECIDED**다.

```text
Member verified auth identity
→ auth.users.id
→ subjects.auth_user_id
→ canonical subjects.id

Guest verified opaque credential
→ API-side versioned HMAC fingerprint
→ guest_sessions
→ canonical subjects.id
```

Documented ordinary production DB path:

```text
myeongha_runtime LOGIN
→ BEGIN
→ SET LOCAL ROLE myeongha_api_executor
→ begin_member_subject_context_v1(...)
   또는 begin_guest_subject_context_v1(...)
→ same-transaction authority work
→ COMMIT / ROLLBACK
```

ordinary principal/executor는 NOBYPASSRLS를 유지해야 한다.

## 4.3 RLS baseline

RLS architecture는 결정됐지만 **59개 전체 table의 production-complete RLS가 증명된 상태는 아니다.**

현재 전략:

```text
activated vertical slice
→ RLS/default deny + narrow ACL + object authorization

not-yet-activated user-owned slice
→ HTTP/runtime activation HOLD
```

닫힌 surface가 아직 전면 RLS-activated가 아닌 것과 exposed unsafe surface를 구분한다.

## 4.4 Write-command inventory

상태는 아래 네 값만 사용한다.

```text
IMPLEMENTED
→ source-complete 범위의 명시적 command와 핵심 lock/replay semantics가 code evidence로 확인됨

PARTIAL
→ 구현 일부가 있으나 source blocker 또는 lifecycle/caller/activation이 남음

SCHEMA-ONLY
→ relational storage/query/constraint envelope는 있으나 authoritative mutation이 source-complete하지 않음

MISSING
→ baseline inventory에서 필요한 authoritative implementation evidence를 찾지 못함
   (repository 전체에 절대 존재하지 않는다는 논리적 증명이 아니라 이 baseline의 구현 판정)
```

| Domain | Status | Evidence / boundary |
|---|---|---|
| Chat receive | IMPLEMENTED | `0210_chat_receive_command.sql`; thread lock, client-turn replay/conflict, parent allocator |
| Chat attempt allocate/stage/message commit | IMPLEMENTED | `0220_*`, `0230_*`, `0760_*`; AI 외부 호출과 DB state 분리. Source-blocked relationship/unlock evaluator를 이 status에 포함하지 않음 |
| Birth revision append | IMPLEMENTED | `0240_*`; profile lock + expected-current CAS + response-loss replay |
| Birth create | IMPLEMENTED | `0560_*`; repository runtime authority hardening through `0860`. 단, live production 0830~0860 적용 여부는 `PI-P0-01`로 별도 |
| Reading persistence/transport/clarification | PARTIAL | `0250`/`0260`/`0270`; lower-level persistence/provenance 존재. Public ProductReadingResponse/clarification semantic validation은 `SRC-33` BLOCKED |
| Notification provider attempt | IMPLEMENTED | `0280_*`; delivery lock + attempt allocator + sent/failed finalization. Provider exactly-once는 주장하지 않음 |
| Account deletion start | PARTIAL | `0290_*`; deletion_pending/revocation/outbox 시작 boundary. Destructive policy는 `P0-PR-01`, standalone Birth/Target delete는 `SRC-06` |
| Guest→new Member same-subject promotion | IMPLEMENTED | `0300_*`; subject→session lock, natural replay, owner reparent 없음 |
| Guest→existing Member merge apply | SCHEMA-ONLY | merge job/action/query/lineage envelope 존재; executable workflow는 `SRC-24` BLOCKED |
| Memory grant revoke | IMPLEMENTED | `0330_*`; exact owned memory/character grant revoke |
| Memory proposal resolution | PARTIAL | transaction skeleton/source envelope는 문서화돼 있으나 baseline에서 production command를 확인하지 못함; 일부 payload lifecycle은 `SRC-05` 영향 |
| Life Fact revoke/supersede/grant revoke | PARTIAL | `0350`, `0690`, `0730` 존재; 전체 create/accept caller/activation matrix는 별도 확인 필요 |
| Relationship event apply | SCHEMA-ONLY | ledger/projection envelope 존재; executable policy/evaluator는 `SRC-22` BLOCKED |
| Episode advance | SCHEMA-ONLY | progress projection + ledger envelope 존재; evaluator/write authority는 `SRC-17` BLOCKED |
| Character unlock | SCHEMA-ONLY | current projection/query 존재; evaluator/mutation은 `SRC-23` BLOCKED |
| Purchase Intent create | IMPLEMENTED | `0660_*`; member-only, immutable offer snapshot, owner-scoped idempotency/race handling |
| Provider purchase provenance → grant target | PARTIAL | commerce provenance/constraints 존재; product→grant target은 `SRC-18`, rail은 `P0-CM-01` |
| Entitlement event apply/effective projection | SCHEMA-ONLY | grants/events/projection + integrity constraints 존재; transition/recompute semantics는 `SRC-21` BLOCKED |
| Outbox enqueue/claim/reclaim | IMPLEMENTED | publisher dedupe envelope + `0670_*` lease claim/reclaim |
| Outbox success completion | IMPLEMENTED | `0700_*` |
| Outbox failure/retry policy | MISSING | production-authoritative policy/command는 `SRC-30` BLOCKED |
| Central rate/quota/abuse mutation authority | MISSING | server-owned requirement는 source에 있으나 unified authoritative implementation evidence 미확인 |

## 4.5 Repository governance baseline

현재 `main`은 branch protection이 활성화되지 않았고 repository rulesets도 비어 있는 상태가 확인됐다. 이는 runtime integrity와 별개의 **schema publication governance risk**다.

Schema-affecting change에는 최소 다음 evidence를 강제해야 한다.

```text
exact-head diff
+ catalog diff
+ negative tests
+ concurrency/idempotency tests
+ rollback/forward-fix statement
```

---

# 5. Threat / Failure Model

## 5.1 Authorization

- 다른 subject UUID 제출
- Member/Guest credential classification 혼동
- invalid JWT-shaped bearer의 Guest fallback
- pooled connection의 subject context leakage
- ordinary path에 service-role/BYPASSRLS 혼입
- SECURITY DEFINER/ACL/search_path privilege escalation

## 5.2 Retry / idempotency

- timeout 후 same request retry
- DB commit 후 HTTP response loss
- offline queue resend
- webhook duplicate
- stream reconnect가 같은 turn을 새 logical turn으로 생성
- same idempotency key + different payload

## 5.3 Concurrency

- same Birth current revision concurrent edit
- same thread concurrent turn
- same notification delivery attempt allocation
- one Guest Session → multiple destination merge race
- same relationship revision race
- out-of-order provider lifecycle
- deletion_pending transition vs new capability write

## 5.4 Partial failure

- external call 성공 후 local completion 전 crash
- outbox claim 후 worker crash
- AI/Saju success 후 authoritative commit failure
- authoritative commit 후 response loss
- push provider accepted 여부 ambiguous timeout

## 5.5 Structural integrity

- cross-subject parent/child 연결
- projection-only update
- ledger-only append
- immutable history rewrite
- merge history owner rewrite
- hash를 anonymization으로 오인

## 5.6 Migration

- repository ↔ production drift
- applied migration file mutation
- locking/destructive constraint rollout
- RLS activation과 caller exposure 순서 오류
- unprotected main을 통한 schema authority publication

---

# 6. Invariant Classification

모든 invariant는 세 유형 중 하나로 분류한다.

## 6.1 DDL-native invariant

PK/FK/UNIQUE/CHECK/NOT NULL/partial unique 등으로 표현 가능한 규칙.

예:

- composite ownership FK
- `(thread_id, client_turn_id)` uniqueness
- positive revision/attempt number
- one active self Birth Profile

> DB가 직접 막을 수 있는 것은 application check만으로 두지 않는다.

## 6.2 Constraint-trigger invariant

다른 row의 authority를 읽어야 하며 commit 시점에 DB가 강제해야 하는 규칙.

예:

- commerce provider/receipt/subject lineage
- merged target의 canonical-member shape
- event source와 owner 일치

필요한 경우 합법적 transaction 중간 상태를 위해 `DEFERRABLE`을 검토한다.

## 6.3 Server-command invariant

locking/CAS/replay/multi-row orchestration/external-call separation이 필요한 규칙.

예:

- Birth revision append
- Chat receive/commit
- Purchase Intent
- Guest promotion
- notification attempt
- outbox claim/completion

Source-blocked evaluator를 “server-command invariant”라는 이유만으로 발명하지 않는다.

## 6.4 Defense in depth

중요 ownership rule:

```text
composite FK
+ RLS/default deny
+ command subject/context parity
+ API object authorization
+ security negative test
```

---

# 7. PostgreSQL Constraint Architecture

## 7.1 Composite ownership

가능한 user-owned parent/child 관계:

```text
parent UNIQUE (id, subject_id)
child FK (parent_id, subject_id)
  → parent(id, subject_id)
```

단일 ID FK + application check만으로 owner 경계를 지키지 않는다.

## 7.2 Immutable identity / append-only

일반 mutation으로 rewrite하지 않는 대표 authority:

- Birth revision input/owner
- chat history identity
- commerce receipt/provider inbound identity
- relationship/episode/entitlement ledger
- immutable content bundle
- merged Guest historical owner

retention/legal erase는 일반 mutation과 분리된 lifecycle authority를 사용한다.

## 7.3 Active/current uniqueness

“한 개만 active/current”는 가능한 경우 partial unique로 강제한다.

## 7.4 Allocator

허용:

- locked parent `next_*`
- expected-current CAS
- 의미에 맞는 DB sequence

금지:

```sql
MAX(sequence_no) + 1
MAX(attempt_no) + 1
```

## 7.5 Constraint trigger

cross-row semantic consistency를 application-only precheck에 맡기지 않는다. 다만 source가 정하지 않은 transition 의미를 trigger 안에 숨겨 발명하지 않는다.

---

# 8. Subject Ownership Model

## 8.1 Canonical owner

user-owned product data의 canonical owner는 `subjects.id`다. `auth.users.id`는 authentication account authority다.

## 8.2 Guest→new Member

동일 subject 승격:

```text
subject_id 유지
+ verified auth_user_id binding
+ Guest Session consumed/claimed
+ 기존 user-owned row owner 변경 없음
```

현재 `cmd_promote_guest_v1`이 이 boundary를 구현한다.

## 8.3 Guest→existing Member

서로 다른 subject이므로 history bulk-reparent를 금지한다.

```text
Guest immutable history
→ Guest owner 유지
→ direct merged lineage로 read-only 보존

source-approved Member-side import/projection
→ 새 Member-owned resource
→ subject_merge_actions provenance
```

단, **어떤 resource를 어떤 방식으로 retain/import/merge/discard할지와 conflict/resolution algorithm은 `SRC-24`가 OPEN이므로 이 문서가 결정하지 않는다.**

Birth conflict 자동 overwrite 금지는 상위 Use Case가 고정한다.

## 8.4 Merge shape

구조적으로:

- one Guest Session → one destination
- guest → direct canonical member
- merge chain/cycle 금지
- historical immutable owner 유지

실제 executable workflow는 `SRC-24` 해결 전 HOLD다.

---

# 9. Authorization / RLS Architecture

## 9.1 Pipeline

```text
credential
→ trusted verifier
→ canonical subject resolver
→ transaction-local subject context
→ RLS/default deny
→ object/capability authorization
→ command/query
```

Client `subjectId/userId`는 owner proof가 아니다.

## 9.2 Ordinary execution

- ordinary role `NOBYPASSRLS`
- role/context transaction-local
- pooled connection context leak 금지
- narrow function/table/column ACL
- privileged lifecycle/system path 분리

## 9.3 SECURITY DEFINER gate

사용 시:

- 필요성 명시
- fixed safe `search_path`
- PUBLIC EXECUTE revoke
- exact role grant
- caller subject-context 검증
- privilege escalation negative test

## 9.4 Activation matrix

각 activated user-owned table/function은 최소 다음 matrix를 가진다.

```text
owner column
read/write policy
callable function
ordinary role ACL
system-only path
cross-subject negative test
merged-lineage rule
deletion_pending rule
```

이 matrix가 없는 slice는 production user-data activation HOLD다.

---

# 10. Command Idempotency Contract

## 10.1 Replay rule

```text
same logical idempotency identity
+ same canonical request
→ prior authoritative result replay

same logical idempotency identity
+ different request
→ conflict
```

Duplicate-key error를 무시하는 것과 idempotency는 다르다.

## 10.2 Scope

가능한 namespace 예:

```text
(subject_id, idempotency_key)
(thread_id, client_turn_id)
(provider, external_event_id)
(aggregate_type, aggregate_id, event_type, dedupe_key)
```

실제 key schema가 source-blocked domain에 대해서는 여기서 확정하지 않는다.

## 10.3 Required logical idempotency outcomes

Use Case가 최소 요구하는 write:

- chat turn
- relationship event
- Saju reading creation
- memory acceptance
- purchase/receipt verification
- character unlock

관계/unlock 등 source-blocked 영역은 **idempotency outcome requirement는 유지되지만 exact executable key/transition semantics는 해당 `SRC-*` 해결 후 확정한다.**

## 10.4 Response-loss

DB commit 후 response loss가 발생해도 exact retry가 새 side effect를 만들면 안 된다.

---

# 11. Transaction Boundary Catalog

| Family | Current/target atomic boundary | Serialization | Source state |
|---|---|---|---|
| Chat receive | turn + one user message | thread | source-complete baseline |
| Chat attempt/message commit | attempt + committed message/state + only source-approved effects | thread→turn→attempt | relationship/unlock effects는 별도 blocker |
| Birth revision | immutable revision + current pointer | birth profile | source-complete baseline |
| Reading lower-level persistence | logical session/attempt/provenance | reading/session rows | Product semantic boundary `SRC-33` |
| Guest same-subject promotion | subject binding + session consume | subject→session | source-complete baseline |
| Existing-member merge | merge envelope only | subject/merge job fixed order | `SRC-24` |
| Purchase Intent | intent + pinned offer snapshot | owner/idempotency uniqueness | source-complete baseline |
| Purchase→grant | provenance→target→event/projection | grant/logical scope | `P0-CM-01` + `SRC-18` + `SRC-21` |
| Relationship apply | event + current projection | character state | `SRC-22` |
| Character unlock | unlock projection + causal effects | unlock aggregate | `SRC-23` |
| Episode advance | progress event + projection | episode progress | `SRC-17` |
| Notification attempt | attempt ledger + delivery projection | delivery | source-complete attempt boundary |
| Outbox claim/success | lease/status | outbox row | source-complete baseline |
| Outbox failed-event retry lifecycle | unresolved | unresolved | `SRC-30` |
| Account deletion start | deletion_pending + immediate revocations + job/outbox | subject | destructive policy `P0-PR-01` |

외부 AI/Saju/payment/push 호출은 DB transaction 안에서 수행하지 않는다.

---

# 12. Concurrency Control Model

## 12.1 Aggregate serialization

동일 logical aggregate write는 parent/current row lock 또는 source-defined equivalent로 serialize한다.

대표 구현:

- conversation thread/turn
- birth profile
- notification delivery
- outbox lease row
- subject/guest session

## 12.2 Optimistic CAS

stale edit가 최신 state를 덮지 않도록 expected revision/current pointer를 사용한다. Birth append가 reference implementation이다.

## 12.3 Global lock order

`SERVER_COMMAND_TRANSACTION_SPEC.md`의 global lock ordering을 우선한다.

개념적으로:

```text
canonical subject / merge job
→ aggregate root/current projection
→ logical attempt/current pointer
→ child ledger/provenance
→ outbox
```

동일 class 여러 row는 stable PK order를 사용한다. 예외는 command별 명시 + concurrency test가 필요하다.

## 12.4 Race arbiter

동시 first-write는 선행 SELECT만 믿지 않는다. UNIQUE/`ON CONFLICT` 등 DB arbiter 후 winner의 request identity를 재검증한다.

## 12.5 Retryable conflict

serialization/revision conflict는 정상 concurrency result다. stale mutation을 무음 overwrite하지 않는다.

---

# 13. Ledger / Projection Consistency

기본 invariant:

```text
source-approved ledger append
+ matching current projection mutation
→ same transaction
```

단, **ledger/projection 구조가 존재한다는 이유로 source-blocked transition evaluator를 구현하지 않는다.**

## 13.1 Relationship

```text
relationship_events = ledger
user_character_states = current projection
```

revision lineage/ownership은 지금 검증 가능하다. event allowlist/delta/stage/anti-farming policy는 `SRC-22` 전 production-authoritative하지 않다.

## 13.2 Episode

```text
episode_progress_events = ledger
user_episode_progress = current projection
```

relational envelope는 검증 가능하다. 실제 scene/condition/choice evaluator를 필요로 하는 advance는 `SRC-17` 전 HOLD다.

## 13.3 Character Unlock

stored current projection은 읽을 수 있다. condition→target/effect/replay semantics는 `SRC-23` 전 mutation authority가 아니다.

## 13.4 Entitlement

```text
entitlement_grants = independent source grant projection
entitlement_events = lifecycle provenance
entitlements = effective aggregate projection
```

현재 DB가 표현해야 하는 구조적 negative invariants는 유지한다.

- unverified provenance가 entitlement source가 되면 안 됨
- cross-subject source linkage 금지
- event append-only
- effective entitlement owner/key/scope identity immutable
- wall-clock expiry를 지난 effective access는 sweeper 지연과 무관하게 deny

그러나 아래 transition semantics는 `SRC-21` 전 이 문서가 결정하지 않는다.

- event type별 grant field transition
- provider stale comparator
- exact valid-grant predicate
- aggregate count/formula
- unbounded/future grant aggregation
- no-op/revision semantics

Purchase source→grant target mapping은 별도 `SRC-18`이다.

---

# 14. Transactional Outbox

## 14.1 Source-complete baseline

현재 source/implementation이 닫은 publisher-side 범위:

```text
business transaction에서 required outbox row 함께 append
+ logical enqueue/dedupe envelope
+ pending claim
+ expired processing lease reclaim
+ successful completion
```

DB transaction과 external consumer call은 분리한다.

## 14.2 현재 미결정: `SRC-30`

다음은 primary source가 아직 production policy로 정의하지 않았다.

- failed event를 `failed`/`pending`/`dead_lettered` 중 어떤 상태로 전이하는지
- retry eligibility/timing/backoff/jitter
- `attempt_count` lifecycle
- max attempts/dead-letter threshold
- manual replay/requeue
- generic error taxonomy
- downstream class 공통 dedupe execution protocol

따라서 이 문서는 특정 backoff, threshold, attempt increment 시점, dead-letter schema를 확정하지 않는다.

## 14.3 Source-backed required outcomes

정책 미결정과 별개로 다음 outcome은 상위 Use Case/ERD가 요구한다.

`OUT-01` 동일 logical outbox enqueue retry가 중복 source event를 만들지 않는다.

`OUT-02` expired processing lease는 reclaim 가능하다.

`OUT-03` stale worker가 새 lease ownership을 침범하지 않는다.

`OUT-04` successful completion exact replay가 duplicate business mutation을 만들지 않는다.

`OUT-05` external side-effect retry에서 product-visible duplicate를 방지해야 한다.

중요 failure case:

```text
external side effect accepted
→ worker crashes before DB success completion
→ lease expires
→ redelivery candidate
```

이 상황의 **필수 결과는 duplicate prevention**이다. 그러나 provider idempotency key, reconciliation, consumer-side inbox/dedupe 등 어떤 mechanism을 채택할지는 downstream transport authority와 `SRC-30` 해결을 통해 확정한다. 현재 DB outbox만으로 exactly-once external delivery를 선언하지 않는다.

Notification Delivery attempt retry policy와 generic transactional-outbox failed-event retry policy는 서로 다른 domain boundary다.

---

# 15. Retry / Partial Failure Model

## 15.1 External call pattern

기본 패턴:

```text
Tx A: logical attempt/prepare
COMMIT

external call

Tx B: same logical state re-lock
→ still-current validation
→ validated result/provenance
→ finalize projection/message/outbox
COMMIT
```

## 15.2 DB commit 후 response loss

source-defined idempotency identity가 있는 command는 existing authoritative result를 replay한다.

## 15.3 Stream disconnect

transport 중단이 새 assistant message/domain effect commit을 만들지 않는다.

## 15.4 Saju/AI failure

Saju failure를 generic AI 추측으로 메우지 않는다. Product semantic validation이 source-blocked이면 transport success만으로 valid ProductReadingResponse를 선언하지 않는다.

## 15.5 Ambiguous provider result

Provider accepted 여부가 ambiguous한 timeout은 단순한 “retry immediately”로 의미를 발명하지 않는다. domain-specific reconciliation/idempotency authority가 필요하다.

---

# 16. Guest → Member Integrity

## 16.1 Same-subject promotion — IMPLEMENTED

현재 `cmd_promote_guest_v1`의 핵심 invariant:

- exact subject/session/verified auth identity
- subject lock → session lock
- active unmerged guest
- expired/consumed/claimed session deny
- auth identity가 다른 subject에 이미 연결된 경우 existing-member merge 요구
- 성공 시 `subject_id` 유지
- natural response-loss replay

## 16.2 Existing-member merge — `SRC-24` BLOCKED

현재 확정 가능한 것은 relational safety envelope뿐이다.

- one Guest Session → one destination
- direct guest→canonical Member shape
- history owner reparent 금지
- merge action audit/dedupe envelope
- Birth existing Member value를 Guest 값으로 자동 overwrite 금지

다음은 `SRC-24` 전 확정하지 않는다.

- participating domain inventory
- duplicate/conflict classifier
- conflicts/resolution positive schema
- legal resolution choices
- per-domain import/merge transformations
- stale resolution
- failed action retry/resume
- completion replay reconstruction
- deletion_pending destination lifecycle

Relationship/Unlock/Episode merge effect는 각각 `SRC-22`/`SRC-23`/`SRC-17`도 우회할 수 없다.

---

# 17. Version / Revision Policy

## 17.1 Immutable revision

사용자 correction은 과거 row rewrite가 아니라 새 revision/event를 사용한다.

## 17.2 Execution pinning

source가 정의한 범위에서 실행 provenance에 version을 남긴다.

```text
character/content/world version
prompt version
relationship policy version
saju engine version
grounding version
API/contract version
```

## 17.3 Long-lived thread

새 default content release만으로 기존 thread persona/canon을 조용히 변경하지 않는다. source-approved explicit transition/migration authority를 사용한다.

## 17.4 Hash/fingerprint

```text
sha256:vN:...
hmac-sha256:kN:...
```

fingerprint는 integrity/pseudonymous identifier이지 anonymization 증명이 아니다.

---

# 18. Data Deletion Integrity

## 18.1 Start transaction baseline

`0290_account_deletion_start_command.sql`은 삭제 완료가 아니라 **deletion-start transaction authority**다.

확인된 boundary:

- canonical subject lock
- idempotent deletion job
- deletion_pending transition
- share revoke
- device revoke
- future notification cancel
- 신규 AI/Saju/capability write 차단 범위
- outbox append

## 18.2 Policy blockers

`P0-PR-01` OPEN 때문에 이 문서가 다음을 정하지 않는다.

- personalization retention duration
- expired Guest cleanup duration
- AI trace retention
- backup retention
- commerce/legal/accounting retention
- destructive cleanup cadence

Standalone Birth/Target delete semantics는 `SRC-06` 영향도 받는다.

## 18.3 Delete graph outcome

상위 Use Case가 요구하는 최소 graph:

- Birth Profile/revision
- Life Fact
- Memory/access
- Conversation
- Target Person Profile
- personalized Reading/artifact
- raw source가 AI log/analytics에 복제됐다면 동일 policy 영향
- direct merged Guest lineage

commerce/legal retention은 personalization erase와 분리한다.

---

# 19. Rate / Abuse Authority Boundary

Use Case가 server authority로 요구:

- user/session rate limit
- abnormal repeat limit
- free/paid quota boundary
- multi-character max turn
- prompt/context budget
- notification frequency cap

이 문서는 숫자/threshold/window를 발명하지 않는다.

Architecture-level invariants:

- client counter는 authority가 아님
- canonical subject/session/capability 기준으로 server가 판단
- entitlement와 abuse allowance는 별도 authority
- retry가 quota를 이중 consume하지 않도록 logical request identity 필요
- notification frequency cap은 client-side preference만으로 강제하지 않음

현재 unified authoritative implementation evidence가 baseline에서 확인되지 않았으므로 `MISSING`이다.

---

# 20. Logging / Sensitive Data Boundary

Standard log/telemetry에 금지:

- raw Member JWT/bearer
- raw Guest bearer
- service bearer
- database password/service-role key
- raw payment secret material
- Birth input 원문 전체의 무분별한 복제
- full chat transcript의 기본 telemetry 복제

Correlation은 opaque request/execution ID를 사용한다.

Provider error body/secret/stack을 Product client에 그대로 노출하지 않는다.

Hash/fingerprint도 deletion/retention 검토 대상이 될 수 있는 pseudonymous data다.

---

# 21. Migration Strategy / Catalog Diff

## 21.1 `PI-P0-01`

현재:

```text
repo migrations: through 0860
runtime document: production through 0820
```

새 production DDL 전 actual target DB에서 read-only로 확인할 최소 catalog:

- migration history
- table/column type/null/default
- PK/FK/UNIQUE/CHECK
- constraint/ordinary triggers
- indexes/partial indexes
- RLS enabled/forced
- policies
- function signature/security mode/search_path
- function ACL
- role attributes/membership/BYPASSRLS

## 21.2 Migration gates

`MIG-01` migration file만 보고 live state를 추정하지 않는다.

`MIG-02` unexpected missing/extra object를 분류한다.

`MIG-03` locking/destructive/backfill impact를 기록한다.

`MIG-04` 이미 적용된 migration을 수정하지 않고 forward migration을 사용한다.

`MIG-05` caller activation 전에 RLS/ACL negative test를 통과한다.

`MIG-06` exact remote evidence 없이 “applied”를 선언하지 않는다.

## 21.3 Publication governance

현재 main protection/ruleset이 없으므로 schema PR gate를 repository workflow/ruleset으로 강제하는 개선이 필요하다.

Required evidence candidate:

```text
architecture invariant IDs
+ exact-head CI
+ schema catalog diff
+ negative tests
+ concurrency/idempotency tests
+ rollback/forward-fix note
```

---

# 22. Negative Test Matrix

`NOW`는 현재 source envelope만으로 검증 가능한 테스트, `POST-SRC`는 source gap 해결 후 executable semantics까지 검증할 테스트다.

| ID | Gate | Area | Case | Expected |
|---|---|---|---|---|
| `TEST-AUTHZ-01` | NOW | Member | subject A identity → subject B object | DENY |
| `TEST-AUTHZ-02` | NOW | Guest | Guest A → subject B object | DENY |
| `TEST-AUTHZ-03` | NOW | Identity | invalid JWT-shaped bearer → Guest fallback | DENY/no fallback |
| `TEST-AUTHZ-04` | NOW | Role | ordinary path under BYPASSRLS | FAIL |
| `TEST-AUTHZ-05` | NOW | Pool | prior tx subject context visible next checkout | impossible |
| `TEST-BIRTH-01` | NOW | Birth | revision owner mismatch | FK/command DENY |
| `TEST-BIRTH-02` | NOW | Birth | stale expected current | conflict/no overwrite |
| `TEST-BIRTH-03` | NOW | Birth | old revision rewrite | DENY |
| `TEST-CHAT-01` | NOW | Chat | same clientTurnId, different request hash | conflict |
| `TEST-CHAT-02` | NOW | Chat | prohibited second in-flight turn | DENY |
| `TEST-GUEST-01` | NOW | Guest | consumed session reuse | DENY |
| `TEST-GUEST-02` | NOW | Guest | expired session promotion | DENY |
| `TEST-GUEST-03` | NOW | Guest | auth identity already mapped elsewhere | same-subject promotion DENY / merge required |
| `TEST-MERGE-01` | NOW | Merge | one session → two merge destinations | relational DENY |
| `TEST-MERGE-02` | POST-SRC-24 | Merge | conflict/resolution/action retry | source-defined result, no duplicate import |
| `TEST-REL-01` | NOW | Relationship | ledger owner/revision structural violation | DENY |
| `TEST-REL-02` | POST-SRC-22 | Relationship | same event retry / anti-farming / stage transition | source-defined one effect |
| `TEST-UNLOCK-01` | NOW | Unlock | owner/source-FK structural violation | DENY |
| `TEST-UNLOCK-02` | POST-SRC-23 | Unlock | duplicate/concurrent condition | source-defined one unlock effect |
| `TEST-EP-01` | NOW | Episode | progress ledger owner/bundle violation | DENY |
| `TEST-EP-02` | POST-SRC-17 | Episode | concurrent valid advance | source-defined consistent revision |
| `TEST-READ-01` | NOW | Reading | lower-level stale current/idempotency/parent chain | structural conflict/replay |
| `TEST-READ-02` | POST-SRC-33 | Reading | public clarification/ProductResponse semantic validation | source-defined validation |
| `TEST-COM-01` | NOW | Commerce | guest purchase | DENY |
| `TEST-COM-02` | NOW | Commerce | unverified receipt/provider provenance as source | DENY |
| `TEST-COM-03` | NOW | Commerce | cross-subject provider event→entitlement source | DENY |
| `TEST-COM-04` | POST-SRC-18/21 | Entitlement | purchase→grant target + transition/recompute | source-defined correct projection |
| `TEST-NOTIF-01` | NOW | Notification | subject A delivery → installation B | DENY |
| `TEST-NOTIF-02` | NOW | Notification | revoked installation send attempt | DENY |
| `TEST-OUT-01` | NOW | Outbox | same logical enqueue retry | one row/effect source |
| `TEST-OUT-02` | NOW | Outbox | expired processing lease | reclaim allowed |
| `TEST-OUT-03` | POST-SRC-30 | Outbox | failed-event scheduling/lifecycle | source-defined |
| `TEST-DEL-01` | NOW | Delete | new prohibited capability after deletion_pending | DENY |
| `TEST-DEL-02` | POST-P0-PR-01 | Delete | final delete graph/retention | policy-defined |
| `TEST-LOG-01` | NOW | Logging | raw bearer/secret in standard log | FAIL security test |

---

# 23. Concurrency / Partial-Failure Test Matrix

| ID | Gate | Scenario | Required outcome |
|---|---|---|---|
| `CONC-01` | NOW | two Birth edits same expected revision | one winner; stale loser conflict |
| `CONC-02` | NOW | Birth commit then response loss | exact replay, no new revision |
| `CONC-03` | NOW | same chat receive concurrently | one logical turn/message |
| `CONC-04` | NOW | same chat key different payload | one winner + conflict |
| `CONC-05` | NOW | concurrent chat attempt allocate | allocator consistency |
| `CONC-06` | NOW | stream disconnect after message commit | no duplicate message |
| `CONC-07` | POST-SRC-22 | concurrent relationship events | source-defined monotonic transition |
| `CONC-08` | NOW | same Guest promotion retry | one canonical result/replay |
| `CONC-09` | NOW | same Guest Session → two merge destinations | relational one-destination invariant |
| `CONC-10` | POST-SRC-24 | merge crash/retry mid-actions | source-defined resume; no duplicate import |
| `CONC-11` | NOW | same purchase-intent key/same hash | one intent + replay |
| `CONC-12` | NOW | same purchase-intent key/different hash | one intent + conflict |
| `CONC-13` | NOW | duplicate provider source identity | one source row |
| `CONC-14` | POST-SRC-21 | out-of-order entitlement lifecycle | source-defined stale-event handling |
| `CONC-15` | POST-SRC-21 | overlapping grants | source-defined aggregate remains correct |
| `CONC-16` | NOW | two notification attempt allocators | one current running attempt |
| `CONC-17` | NOW | outbox claim then worker crash | expired lease reclaim |
| `CONC-18` | NOW | stale outbox worker after re-lease | stale completion DENY where current command contract applies |
| `CONC-19` | POST-SRC-30/transport | external accepted then crash-before-complete | product-visible duplicate prevention |
| `CONC-20` | NOW | deletion start races new prohibited write | no untracked post-deletion write |
| `CONC-21` | NOW | DB commit succeeds, HTTP response lost | source-defined exact retry replay |
| `CONC-22` | NOW | Saju/AI timeout before authoritative terminal commit | no duplicate authoritative effect |
| `CONC-23` | NOW | pooled connection after rollback | no role/subject context leak |
| `CONC-24` | POST-SRC-17/23 | episode completion triggers unlock concurrently | source-defined both-or-neither integrity |

Concurrency test는 sequential simulation만으로 대체하지 않는다. 가능한 경우 실제 두 DB connection/session을 사용한다.

---

# 24. Rollback / Recovery Semantics

## 24.1 DB transaction

Command의 authoritative multi-row state는 transaction failure 시 함께 rollback한다.

## 24.2 External call

외부 호출이 transaction 밖에 있기 때문에 local rollback과 external-result ambiguity를 분리한다. Ambiguous external result의 해결 방식은 해당 transport/source authority가 결정한다.

## 24.3 Migration

각 migration change는 다음 중 하나를 명시한다.

```text
reversible
forward-fix only
backfill required
dual-read/write transition required
```

무조건적인 down migration이 오히려 data loss를 만들면 forward-fix를 사용한다.

## 24.4 Projection recovery

source ledger가 충분한 domain은 source-approved rules가 존재할 때 projection reconciliation/rebuild가 가능해야 한다. Rebuild가 새로운 source event를 발명하면 안 된다.

## 24.5 Deletion recovery

Partial deletion은 숨기지 않고 job/progress 상태로 추적한다. 실제 destructive domain order/retention은 `P0-PR-01` 등 source authority를 따른다.

---

# 25. Open Decisions / Blockers

## 25.1 Product P0

| ID | Status | Boundary |
|---|---|---|
| `P0-SA-01` | DECIDED | authenticated internal HTTP calculation-only service; 재개방하지 않음 |
| `P0-CM-01` | OPEN-P0 | Web/Apple/Google rail + platform policy |
| `P0-AI-01` | OPEN-P0 | provider/model/fallback/grounded validation operational choice |
| `P0-AGE-01` | OPEN-P0 | minimum age/content policy |
| `P0-PR-01` | OPEN-P0 | retention/backup/legal retention |
| `P0-PR-01A` | DECIDED | Guest auth TTL 604800 seconds; broader retention과 별개 |
| `P0-AUTH-01` | DECIDED | non-BYPASSRLS + transaction-scoped canonical subject context |

## 25.2 Current source blockers relevant to integrity

| ID | Integrity boundary |
|---|---|
| `SRC-05` | memory proposal resolution payload/session/reject lifecycle의 일부 source policy |
| `SRC-06` | standalone Birth/Target privacy delete semantics |
| `SRC-07` | manual provider-event resolution authority |
| `SRC-15` | client capability/asset compatibility |
| `SRC-16` | subject-specific content rollout |
| `SRC-17` | episode transition/effect evaluator |
| `SRC-18` | purchased product → entitlement grant target mapping |
| `SRC-21` | entitlement event→grant transition + aggregate projection semantics |
| `SRC-22` | relationship event/delta/stage/anti-farming policy |
| `SRC-23` | Character Unlock condition→target/effect/replay semantics |
| `SRC-24` | existing-member Guest merge conflict/action/retry workflow |
| `SRC-30` | outbox failed-event retry/backoff/dead-letter/manual replay policy |
| `SRC-33` | ProductReadingResponse/clarification positive schema, correlation, canonicalization/validation |

이 표는 blocker의 제품 의미를 새로 정의하지 않는다. 현재 command spec이 명시적으로 해당 production mutation을 HOLD하는 경계만 기록한다.

## 25.3 Platform integrity blockers

### `PI-P0-01` — Exact production catalog state

Repo 0860 vs documented production 0820. 새 production DDL 전 live catalog/history를 직접 확인한다.

### `PI-P0-02` — Outbox failure/duplicate-prevention closure

상위 requirement는 outbox retry와 product-visible duplicate prevention을 요구하지만 generic failure policy는 `SRC-30`이 OPEN이다. `SRC-30`을 임의 해결하지 않고, 해결 후 implementation/consumer evidence를 검증한다.

### `PI-P0-03` — Deletion finalization

`P0-PR-01` 전 destructive retention semantics를 발명하지 않는다.

### `PI-GOV-01` — Schema publication governance

현재 main branch protection 없음 + repository rulesets `[]`. Schema authority publication에 repository-enforced gate가 필요하다.

---

# 26. Acceptance Criteria

이 문서를 기준으로 **현재 source-complete scope**를 구현 완료라고 부르려면 다음이 필요하다.

## 26.1 Structural

- ERD 59-table catalog ↔ intended migration catalog machine-check
- actual production catalog diff 확보
- phantom FK/target 없음
- 필요한 same-owner composite FK
- immutable/append-only guard
- `MAX()+1` allocator 없음

## 26.2 Authorization

- ordinary production role NOBYPASSRLS evidence
- Member/Guest canonical resolver evidence
- transaction-context leak negative test
- activated table/function별 RLS/ACL matrix
- own-subject positive + cross-subject negative E2E
- privileged/system path 분리

## 26.3 Idempotency / concurrency

- source-defined command별 logical identity
- same-request replay
- different-request conflict
- commit/response-loss replay
- true concurrent session tests
- stale revision conflict

## 26.4 Ledger/projection

현재 source-complete structural invariant와 source-blocked semantic invariant를 분리한다.

```text
NOW
→ ownership/revision/FK/append-only/storage-envelope tests

POST-SRC
→ evaluator/transition/aggregation both-or-neither tests
```

`SRC-17/21/22/23/24/33` 등이 OPEN인 동안 semantic PASS를 가짜 fixture로 production-complete 선언하지 않는다.

## 26.5 Outbox

현재 PASS 가능한 범위:

- business commit과 required enqueue atomicity
- logical dedupe
- lease claim/reclaim
- success completion/replay
- stale lease ownership protection

`SRC-30` 후 추가:

- source-defined failed-event lifecycle
- retry scheduling
- terminal/manual replay semantics
- downstream duplicate-prevention mechanism/evidence

## 26.6 Deletion

- deletion start fail-closed
- required graph inventory
- merged lineage 포함
- legal commerce/personalization separation
- `P0-PR-01` 전 destructive policy 발명 없음

## 26.7 Evidence rule

최소 완료 evidence:

```text
Implementation
+ Automated Tests
+ Contract/Schema Evidence
+ Security Negative Tests
+ Concurrency/Partial-Failure Tests
+ E2E Vertical Slice
+ exact remote evidence for activated production scope
```

`npm run check`만으로 remote production state를 증명하지 않는다.

## 26.8 Readiness vocabulary

- `Architecture Draft` — 구조 작성 상태
- `Self-Reviewed` — authority/implementation overclaim 검수 반영 상태
- `Migration-Ready` — exact live baseline + intended DDL + negative/concurrency tests + migration plan 통과 후에만
- `Production-Safe` — **명시된 activated vertical slice**에 대해서만 remote evidence 통과 후 사용
- `Integrity-Complete` — 명시 scope의 source blockers와 acceptance matrix가 모두 닫힌 경우에만

현재 문서 status는 `Architecture Draft / Self-Reviewed`다.

---

# 27. Implementation Phases

## Phase PI-0 — Freeze / inventory

- baseline main SHA 고정
- write-command/source-blocker inventory 유지
- caller inventory
- RLS/ACL matrix

**Production schema write: 금지**

## Phase PI-1 — Production catalog recovery

`PI-P0-01` 해결:

- exact production migration history
- actual catalog/ACL/RLS/function/role dump
- 0830~0860 적용 여부 직접 확인
- repo desired state와 diff

**Production schema write: 금지**

## Phase PI-2 — NOW-test harness

현재 source-complete 범위만 자동화한다.

- DDL negative tests
- ownership/composite FK
- immutable/append-only
- RLS/ACL negative
- true two-session concurrency
- existing command replay/conflict

## Phase PI-3 — Source resolution queue

구현으로 source gap을 우회하지 않는다.

우선 integrity dependency:

1. `SRC-30` outbox failed-event policy
2. `SRC-24` existing-member merge
3. `P0-CM-01` + `SRC-18` + `SRC-21` commerce→entitlement
4. `SRC-22` relationship
5. `SRC-23` Character Unlock
6. `SRC-17` Episode
7. `SRC-33` Reading public semantic validation
8. `P0-PR-01` / `SRC-06` deletion finalization
9. 필요한 memory proposal `SRC-05` closure

각 source가 결정되면 그 decision artifact를 먼저 기록한다.

## Phase PI-4 — Missing command design

Source가 닫힌 domain만 command 설계로 내려간다.

각 command에 연결:

```text
INV-*
AUTHZ-*
CMD-*
CONC-*
TEST-*
MIG-* (DDL 영향 시)
```

## Phase PI-5 — Migration plan

필요한 경우에만:

- DDL/trigger/function diff
- lock/traffic impact
- backfill
- RLS rollout
- rollback/forward-fix
- exact target catalog baseline

아직 production apply가 아니다.

## Phase PI-6 — Repository implementation

- migration/function/application adapter
- negative/concurrency/partial-failure tests
- exact-head CI
- catalog expected diff

## Phase PI-7 — Controlled production migration / activation

전제:

```text
PI-P0-01 closed
+ applicable P0/SRC decisions closed
+ exact-head reviewed
+ migration tests green
+ rollback/forward-fix ready
```

적용 후 actual catalog를 재조회한다.

각 HTTP slice는:

```text
identity
→ canonical subject
→ transaction context
→ RLS/object authz
→ command/query
→ own-subject positive
→ cross-subject negative
→ retry/concurrency
→ production smoke
```

을 독립적으로 증명한다.

## Phase PI-8 — Integrity completion review

마지막 review에서만 scope-qualified readiness를 판단한다.

```text
Migration-Ready
Production-Safe for <explicit slices>
Integrity-Complete for <explicit scope>
```

전체 제품을 blanket `Production-Safe`로 선언하지 않는다.

---

# Appendix A. Stable IDs

```text
INV-*     relational/domain invariant
AUTHZ-*   authentication/authorization/RLS
CMD-*     server command
CONC-*    concurrency/locking/CAS
OUT-*     outbox/delivery outcome
TEST-*    negative/acceptance test
MIG-*     migration/catalog gate
ABUSE-*   rate/quota authority
PI-P0-*   platform-integrity blocker
PI-GOV-*  repository/release governance
```

# Appendix B. Final Boundary

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

> **DB constraint가 막을 수 있는 것은 DB가 막고, DB constraint만으로 부족한 source-complete write는 server command가 transaction/lock/idempotency로 닫는다. 사용자 경계는 RLS와 object authorization을 중첩한다. 외부 side effect는 transaction 밖에 둔다. 그리고 source가 의미를 아직 정하지 않은 영역은 schema가 표현 가능하다는 이유만으로 production mutation authority를 발명하지 않는다.**
