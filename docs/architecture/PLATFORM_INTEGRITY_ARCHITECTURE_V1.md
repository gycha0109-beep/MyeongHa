# 명하 플랫폼 무결성 아키텍처 v1

> Product: **명하 (MyeongHa)**  
> Document: **Platform Integrity Architecture v1**  
> Baseline repository: `gycha0109-beep/MyeongHa`  
> Baseline `main`: `a63a39b5b043c958fc79888dc920eb6d39bd5540`  
> Date: 2026-09-04  
> Status: **ARCHITECTURE FINAL-REVIEWED / NOT MIGRATION-READY / NOT PRODUCTION-SAFE / NOT INTEGRITY-COMPLETE**

---

# 0. 문서 판정과 authority 우선순위

이 문서는 명하의 PostgreSQL 구조적 무결성, 인증/인가, idempotency, transaction, concurrency, ledger/projection, transactional outbox, 삭제, logical abuse authority를 하나의 production-integrity 기준으로 통합한다.

이 문서는 새로운 제품 의미를 발명하지 않는다.

```text
source authority가 제품 의미를 정의한다.
→ platform integrity architecture가 그 의미를 DB/command/runtime invariant로 내린다.
→ implementation evidence가 실제 구현/활성 상태를 증명한다.
```

## 0.1 Primary source authority

제품/데이터 의미의 상위 authority:

1. `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST.md`
2. `Usecase_re_reviewed_v2.md`
3. `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW.md`
4. 필요한 Character / Saju / UX architecture

상위 source가 의미를 결정하지 않은 항목은 이 문서가 구현 편의로 채우지 않는다.

## 0.2 Repository decision / implementation authority

현재 repository에서 source를 구현 수준으로 구체화하는 주요 문서와 evidence:

- `docs/P0_DECISION_REGISTER.md`
- `docs/SOURCE_AUTHORITY_GAPS.md`
- `docs/SERVER_COMMAND_TRANSACTION_SPEC.md`
- `docs/AUTH_RLS_PRIVACY_SPEC.md`
- `docs/DB_DDL_MIGRATION_SPEC.md`
- `docs/API_CONTRACT.md`
- `docs/RUNTIME_STATUS.md`
- `docs/COMMERCE_ENTITLEMENT_SPEC.md`
- `docs/COST_QUOTA_ABUSE_SPEC.md`
- `supabase/migrations/*`
- 실제 API/runtime caller

## 0.3 Decision precedence / supersession rule

문서 간 상태 문구가 시간차로 충돌할 수 있으므로 현재 판정에는 다음 precedence를 적용한다.

```text
1. Primary Source / ERD authority
   → 제품 의미와 필수 invariant의 최상위 authority

2. Current explicit P0 decision record
   → Primary Source가 열어 둔 implementation-critical 선택을 명시적으로 결정
   → Primary Source 의미를 확대/변경할 수 없음

3. Current source-gap resolution/adjudication
   → SRC-*가 실제로 해결된 경우 그 resolution이 이전 OPEN snapshot을 supersede

4. Derived implementation specs
   → transaction/API/RLS/DDL/runtime contract를 구체화

5. Runtime/code/migration evidence
   → 무엇이 실제 구현/활성됐는지를 증명
   → source가 미정인 제품 의미를 스스로 만들 수 없음
```

후속 explicit decision이 이전 derived document의 상태 snapshot과 충돌하면 **후속 explicit decision이 현재 implementation-decision 상태를 supersede**한다. 단, 상위 Primary Source requirement를 뒤집는 근거로 사용할 수 없다.

대표 예:

```text
과거 문서 / migration comment
→ P0-AUTH-01 OPEN 또는 unresolved

현재 docs/P0_DECISION_REGISTER.md
→ P0-AUTH-01 DECIDED
→ non-BYPASSRLS API execution role
→ transaction-scoped trusted canonical subject_id

판정
→ 현재 P0-AUTH-01 = DECIDED
→ 과거 OPEN 문구는 stale status snapshot
```

또한:

```text
P0-PR-01A
→ Guest bearer/session authentication TTL = 604800 seconds DECIDED

P0-PR-01
→ broader retention/backup/legal retention remains OPEN
```

하위 결정 하나가 상위 미결정 전체를 닫지 않는다.

`P0-SA-01`의 Saju transport 결정도 `SRC-33`의 ProductReadingResponse/clarification semantic authority를 닫지 않는다.

## 0.4 Stale-document handling

- 오래된 Integration Spine의 captured runtime status는 현재 runtime evidence보다 우선하지 않는다.
- migration 파일의 과거 주석은 현재 decision register를 supersede하지 않는다.
- `SOURCE_AUTHORITY_GAPS.md`에 과거 OPEN 상태가 남아 있더라도 후속 explicit decision/resolution이 존재하면 status snapshot은 stale로 취급한다.
- stale wording은 추후 source-gap register 정리 대상이지만, stale text를 근거로 이미 결정된 P0를 재개방하지 않는다.
- 반대로 구현 코드가 존재한다는 이유만으로 OPEN `SRC-*`를 CLOSED로 재해석하지 않는다.

## 0.5 Source-gap rule

`SRC-*`가 OPEN/BLOCKED인 영역은 transition rule, payload schema, threshold, retry policy, merge algorithm, evaluator를 이 문서가 임의 확정하지 않는다.

```text
source가 정하지 않음
→ 구조적 envelope/invariant만 기록 가능
→ executable production mutation semantics는 HOLD
```

## 0.6 금지된 readiness 표현

현재 상태에서 다음 표현을 blanket하게 사용하지 않는다.

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

ERD v0.6의 DDL negative test suite와 실제 production catalog verification이 끝나기 전 migration-complete를 선언하지 않는다.

---

# 1. 목적

명하 플랫폼은 다음 상황에서도 authority가 깨지지 않아야 한다.

- 모바일/브라우저 재시도
- DB commit 후 HTTP response loss
- concurrent web/mobile mutation
- stale client revision
- stream disconnect
- AI/Saju timeout
- worker crash
- DB rollback
- duplicate/out-of-order provider event
- Guest→Member 전환 race
- 다른 subject object ID 제출
- privileged credential 오용
- schema drift
- deletion과 일반 write의 race

핵심 목표:

```text
같은 logical 행위는 한 번만 의미를 만든다.
다른 사용자의 object를 읽거나 조작할 수 없다.
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

## 3.1 Canonical data authority

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

## 3.2 Absolute prohibitions

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

이 섹션은 **현재 구현 evidence**이며 목표 상태가 아니다.

## 4.1 Repository / production baseline

Baseline `main`:

```text
a63a39b5b043c958fc79888dc920eb6d39bd5540
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

따라서 현재 architecture evidence는 다음까지만 말할 수 있다.

```text
Repository migration state
→ through 0860

Documented production migration state
→ through 0820

Exact live production catalog/history
→ this architecture final review에서 직접 재검증되지 않음
```

이를 `PI-P0-01`로 추적한다.

## 4.2 Current identity execution baseline

`P0-AUTH-01`은 현재 **DECIDED**다.

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
   or begin_guest_subject_context_v1(...)
→ same-transaction authority work
→ COMMIT / ROLLBACK
```

ordinary runtime principal/executor는 NOBYPASSRLS를 유지해야 한다.

## 4.3 RLS baseline

RLS architecture는 결정됐지만 59개 전체 table의 production-complete RLS가 증명된 상태는 아니다.

```text
activated vertical slice
→ RLS/default deny + narrow ACL + object authorization

not-yet-activated user-owned slice
→ HTTP/runtime activation HOLD
```

닫힌 surface가 아직 전면 RLS-activated가 아닌 것과 실제 exposed unsafe surface를 구분한다.

## 4.4 Implementation status taxonomy

상태는 아래 네 값만 사용한다.

```text
IMPLEMENTED
→ source-complete 범위의 명시적 command와 핵심 lock/replay semantics가 code evidence로 확인됨

PARTIAL
→ 구현 mechanism 또는 일부 lifecycle이 있으나 source/caller/coverage/activation이 완결되지 않음

SCHEMA-ONLY
→ relational storage/query/constraint envelope는 있으나 production-authoritative mutation command를 확인할 수 없거나 source-complete하지 않음

MISSING
→ baseline inventory에서 필요한 authoritative implementation evidence를 확인하지 못함
```

`SCHEMA-ONLY`는 “테이블만 존재”라는 뜻으로 좁히지 않는다. 구조적 trigger/query/constraint가 있어도 production-authoritative mutation command가 없으면 이 분류를 사용할 수 있다.

## 4.5 Write-command / platform mechanism inventory

| Domain | Status | Evidence / boundary |
|---|---|---|
| Chat receive | IMPLEMENTED | `0210_chat_receive_command.sql`; thread lock, client-turn replay/conflict, parent allocator |
| Chat attempt allocate/stage/message commit | IMPLEMENTED | `0220_*`, `0230_*`, `0760_*`; 외부 AI 호출과 DB state 분리. Source-blocked relationship/unlock evaluator는 포함하지 않음 |
| Birth revision append | IMPLEMENTED | `0240_*`; profile lock + expected-current CAS + response-loss replay |
| Birth create | IMPLEMENTED | repository authority 존재. 단, live production 0830~0860 적용 여부는 `PI-P0-01`로 별도 |
| Reading persistence/transport/clarification | PARTIAL | lower-level persistence/provenance 존재. Public ProductReadingResponse/clarification semantic validation은 `SRC-33` BLOCKED |
| Notification provider attempt | IMPLEMENTED | `0280_*`; delivery lock + attempt allocator + sent/failed finalization. Provider exactly-once는 주장하지 않음 |
| Account deletion start | PARTIAL | `0290_*`; deletion_pending/revocation/job/outbox start boundary. Destructive policy는 `P0-PR-01`, standalone Birth/Target delete는 `SRC-06` |
| Guest→new Member same-subject promotion | IMPLEMENTED | `0300_*`; subject→session lock, natural replay, owner reparent 없음 |
| Guest→existing Member merge apply | SCHEMA-ONLY | merge job/action/query/lineage envelope 존재; executable workflow는 `SRC-24` BLOCKED |
| Memory grant revoke | IMPLEMENTED | `0330_*`; exact owned memory/character grant revoke |
| Memory proposal resolution | SCHEMA-ONLY | transaction skeleton/relational envelope는 문서화돼 있으나 baseline에서 production-authoritative resolution command를 확인하지 못함. session-only/reject payload lifecycle은 `SRC-05` 영향 |
| Life Fact revoke/supersede/grant revoke | PARTIAL | 일부 source-complete command가 존재하나 create/accept caller/activation 전체 matrix는 별도 |
| Relationship event apply | SCHEMA-ONLY | ledger/projection envelope 존재; executable policy/evaluator는 `SRC-22` BLOCKED |
| Episode advance | SCHEMA-ONLY | progress projection + ledger envelope 존재; evaluator/write authority는 `SRC-17` BLOCKED |
| Character unlock | SCHEMA-ONLY | current projection/query 존재; evaluator/mutation은 `SRC-23` BLOCKED |
| Purchase Intent create | IMPLEMENTED | owner-scoped idempotency, immutable offer snapshot, concurrent insert arbitration |
| Provider purchase provenance → grant target | PARTIAL | provenance/constraints 존재; product→grant target은 `SRC-18`, rail은 `P0-CM-01` |
| Entitlement event apply/effective projection | SCHEMA-ONLY | grants/events/projection + structural constraints 존재; transition/recompute semantics는 `SRC-21` BLOCKED |
| Outbox required enqueue coverage | PARTIAL | logical enqueue/dedupe mechanism과 일부 source-approved publisher boundary는 존재하지만 platform-wide required publisher coverage 완료를 증명하지 않음 |
| Outbox claim / expired-lease reclaim | IMPLEMENTED | `0670_*`; pending claim + expired processing lease reclaim |
| Outbox success completion | IMPLEMENTED | `0700_*`; current lease/status success completion boundary |
| Outbox failed-event lifecycle/retry | MISSING | production-authoritative failure/retry/backoff/dead-letter/manual replay policy는 `SRC-30` BLOCKED |
| Central rate/quota/abuse mutation authority | MISSING | server-owned requirement는 source에 있으나 unified authoritative implementation evidence 미확인 |

## 4.6 Repository governance baseline

현재 `main` branch protection은 비활성이고 repository rulesets는 비어 있다.

이는 runtime-integrity defect와 별개의 **schema publication governance risk**이며 `PI-GOV-01`로 추적한다.

Schema-affecting change에는 최소 다음 evidence가 필요하다.

```text
exact-head diff
+ catalog diff
+ negative tests
+ concurrency/idempotency tests
+ rollback/forward-fix statement
```

---

# 5. Threat / Failure Model

## 5.1 Authorization threats

- 다른 subject UUID 제출
- Member/Guest credential classification 혼동
- invalid JWT-shaped bearer의 Guest fallback
- pooled connection의 subject context leakage
- ordinary path에 service-role/BYPASSRLS 혼입
- SECURITY DEFINER/ACL/search_path privilege escalation

## 5.2 Retry / idempotency threats

- timeout 후 same request retry
- DB commit 후 HTTP response loss
- offline queue resend
- webhook duplicate
- stream reconnect가 같은 turn을 새 logical turn으로 생성
- same idempotency key + different payload

## 5.3 Concurrency threats

- 두 기기의 stale write
- duplicate first-write
- allocator race
- lock-order inversion/deadlock
- deletion vs normal write
- lease ownership handoff 후 stale worker completion

## 5.4 External side-effect threats

- external API accepted 후 worker crash
- provider timeout의 accepted 여부 불명
- push/payment/Saju 호출 중 DB transaction 장기 점유
- duplicate delivery/charge/publication

## 5.5 Schema / release threats

- repository migration과 live catalog drift
- migration history와 object state 불일치
- RLS enabled 여부/ACL/function security drift
- unprotected main에 schema authority 직접 publication

---

# 6. Invariant Classification

모든 integrity rule은 최소 한 enforcement class에 배치한다.

## 6.1 DDL-native invariant

PK/FK/UNIQUE/CHECK/NOT NULL/partial unique로 표현 가능한 규칙.

예:

- same-owner composite FK
- `(thread_id, client_turn_id)` uniqueness
- positive revision/attempt number
- one active self Birth Profile

원칙:

> DB가 직접 막을 수 있는 invariant는 application precheck만으로 두지 않는다.

## 6.2 Constraint-trigger invariant

다른 row의 authority를 읽어 commit 시점에 강제해야 하는 규칙.

예:

- commerce provider/receipt/subject lineage
- merged target canonical-member shape
- event source와 owner 일치

합법적 transaction 중간 상태가 필요한 경우에만 `DEFERRABLE`을 사용한다.

## 6.3 Server-command invariant

locking/CAS/replay/multi-row orchestration/external-call separation이 필요한 규칙.

예:

- Birth revision append
- Chat receive/commit
- Purchase Intent
- Guest promotion
- notification attempt
- outbox claim/completion

Source-blocked evaluator를 server-command invariant라는 이유만으로 발명하지 않는다.

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

## 7.2 Immutable / append-only authority

일반 mutation으로 rewrite하지 않는 대표 authority:

- Birth revision input/owner
- chat history identity
- commerce receipt/provider inbound identity
- relationship/episode/entitlement ledger
- immutable content bundle
- merged Guest historical owner

retention/legal erase는 일반 mutation과 분리된 lifecycle authority를 사용한다.

## 7.3 Active/current uniqueness

“한 개만 active/current”는 가능한 경우 partial unique 또는 동등한 DB arbiter로 강제한다.

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

## 7.5 Trigger boundary

cross-row consistency를 application-only precheck에 맡기지 않는다. 다만 source가 정하지 않은 transition 의미를 trigger 안에 숨겨 구현하지 않는다.

---

# 8. Subject Ownership Model

## 8.1 Canonical owner

`INV-OWN-01`

```text
user-owned product data canonical owner = subjects.id
```

`auth.users.id`는 authentication account authority이며 product owner key가 아니다.

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

서로 다른 subject이므로 immutable history bulk-reparent를 금지한다.

```text
Guest immutable history
→ Guest owner 유지
→ direct merged lineage로 read-only 보존

source-approved Member-side import/projection
→ 새 Member-owned resource
→ merge action provenance
```

어떤 resource를 retain/import/merge/discard할지, conflict/resolution algorithm은 `SRC-24`가 OPEN이므로 이 문서가 결정하지 않는다.

## 8.4 Merge shape

현재 구조적으로 요구 가능한 invariant:

- one Guest Session → at most one destination
- direct guest→canonical Member lineage
- merge chain/cycle 금지
- historical immutable owner 유지

실제 executable merge workflow는 `SRC-24` 해결 전 HOLD다.

---

# 9. Authorization / RLS Architecture

## 9.1 Pipeline

`AUTHZ-01`

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

- ordinary execution role `NOBYPASSRLS`
- role/context transaction-local
- pooled connection context leak 금지
- narrow function/table/column ACL
- privileged lifecycle/system path 분리

## 9.3 SECURITY DEFINER gate

사용 시 최소:

- 필요성 명시
- fixed safe `search_path`
- PUBLIC EXECUTE revoke
- exact role grant
- caller subject-context 검증
- privilege escalation negative test

## 9.4 RLS activation matrix

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

## 9.5 Error surface

다른 subject object의 존재를 불필요하게 누출하지 않는다. ID를 안다는 사실은 authorization proof가 아니다.

---

# 10. Command Idempotency Contract

## 10.1 Replay rule

`CMD-IDEM-01`

```text
same logical idempotency identity
+ same canonical request
→ prior authoritative result replay

same logical idempotency identity
+ different canonical request
→ conflict
```

Duplicate-key error를 무시하는 것과 idempotency는 다르다.

## 10.2 Namespace examples

```text
(subject_id, idempotency_key)
(thread_id, client_turn_id)
(provider, external_event_id)
(aggregate_type, aggregate_id, event_type, dedupe_key)
```

실제 key schema가 source-blocked domain이면 여기서 확정하지 않는다.

## 10.3 Required logical outcomes

Use Case가 최소 요구하는 범주:

- chat turn
- relationship event
- Saju reading creation
- memory acceptance
- purchase/receipt verification
- character unlock

관계/unlock/memory 등 source-blocked 영역은 outcome requirement는 유지하지만 exact executable key/transition semantics는 해당 source closure 뒤 확정한다.

## 10.4 Response-loss

DB commit 후 HTTP response loss가 발생해도 exact retry가 새 authoritative effect를 만들면 안 된다.

---

# 11. Transaction Boundary Catalog

기본 규칙:

```text
validate identity/capability
→ lock aggregate root/current projection
→ validate expected revision/idempotency
→ DB mutations + source-required outbox
→ COMMIT
```

외부 AI/Saju/payment/push 호출은 DB transaction 안에서 수행하지 않는다.

| Family | Current/target atomic boundary | Serialization | Source state |
|---|---|---|---|
| Chat receive | turn + one authoritative user message | thread | source-complete baseline |
| Chat attempt/message commit | attempt + committed messages/state + source-approved effects | thread→turn→attempt | relationship/unlock effects 별도 blocker |
| Birth revision | immutable revision + current pointer | birth profile | source-complete baseline |
| Reading lower-level persistence | logical session/attempt/provenance | reading/session rows | Product semantic boundary `SRC-33` |
| Guest same-subject promotion | subject binding + session consume | subject→session | source-complete baseline |
| Existing-member merge | merge relational envelope only | subject/merge-job ordering | `SRC-24` |
| Purchase Intent | intent + pinned offer snapshot | owner/idempotency arbiter | source-complete baseline |
| Purchase→grant | provenance→target→event/projection | grant/logical scope | `P0-CM-01` + `SRC-18` + `SRC-21` |
| Relationship apply | event + current projection | character state | `SRC-22` |
| Character unlock | unlock projection + causal effects | unlock aggregate | `SRC-23` |
| Episode advance | progress event + projection | episode progress | `SRC-17` |
| Notification attempt | attempt ledger + delivery projection | delivery | source-complete attempt boundary |
| Outbox claim/success | lease/status | outbox row | source-complete mechanism |
| Outbox failed-event retry lifecycle | unresolved | unresolved | `SRC-30` |
| Account deletion start | deletion_pending + immediate revocations + job/outbox | subject | destructive policy `P0-PR-01` |

---

# 12. Concurrency Control Model

## 12.1 Aggregate serialization

`CONC-LOCK-01`

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

`SERVER_COMMAND_TRANSACTION_SPEC.md`의 ordering을 우선한다.

```text
canonical subject / merge job when lifecycle command
→ aggregate root/current projection
→ logical attempt/current pointer
→ child ledger/provenance
→ outbox
```

동일 class 여러 row는 stable primary-key order를 사용한다. 예외가 필요하면 command별 명시 + concurrency test가 필요하다.

## 12.4 Race arbiter

동시 first-write는 선행 SELECT만 믿지 않는다. UNIQUE/`ON CONFLICT` 등 DB arbiter 뒤 winner의 request identity를 다시 검증한다.

## 12.5 Retryable conflict

serialization/revision conflict는 정상 concurrency result다. stale mutation을 무음 overwrite하지 않는다.

## 12.6 True-concurrency evidence

순차 호출 두 번으로 concurrency PASS를 주장하지 않는다.

가능한 경우:

```text
independent DB connections/sessions
+ controlled barrier/interleaving
+ final row cardinality
+ revision chain
+ ledger cardinality
+ winner/loser result
```

을 함께 검증한다.

---

# 13. Ledger / Projection Consistency

기본 invariant:

```text
source-approved ledger append
+ matching current projection mutation
→ same transaction
```

ledger/projection 구조가 존재한다는 이유로 source-blocked transition evaluator를 구현하지 않는다.

## 13.1 Relationship

```text
relationship_events = source ledger
user_character_states = current projection
```

ownership/revision lineage는 현재 검증 가능하다. event allowlist/delta/stage/anti-farming policy는 `SRC-22` 전 production-authoritative하지 않다.

## 13.2 Episode

```text
episode_progress_events = source ledger
user_episode_progress = current projection
```

relational envelope는 검증 가능하다. 실제 scene/condition/choice evaluator가 필요한 advance는 `SRC-17` 전 HOLD다.

## 13.3 Character Unlock

stored current projection은 읽을 수 있다. condition→target/effect/replay semantics는 `SRC-23` 전 mutation authority가 아니다.

## 13.4 Entitlement

```text
entitlement_grants = independent grant source/lifecycle projection
entitlement_events = lifecycle provenance
entitlements = effective access projection
```

현재 구조적으로 검증 가능한 invariant:

- unverified provenance가 entitlement source가 되면 안 됨
- cross-subject source linkage 금지
- event append-only
- effective entitlement owner/key/scope identity immutable
- wall-clock expiry를 지난 access는 sweeper 지연과 무관하게 deny

그러나 다음 transition semantics는 `SRC-21` 전 결정하지 않는다.

- event type별 grant field transition
- provider stale comparator
- exact valid-grant predicate
- aggregate count/formula
- unbounded/future grant aggregation
- no-op/revision semantics

Purchase source→grant target mapping은 별도 `SRC-18`이다.

---

# 14. Transactional Outbox

## 14.1 Authority separation

Transactional outbox는 다음 세 층으로 분리한다.

```text
A. source-approved publisher enqueue
B. outbox worker claim/lease/success mechanics
C. failed-event retry/dead-letter/manual replay policy
```

이 셋을 한 상태로 묶어 `IMPLEMENTED`라고 부르지 않는다.

## 14.2 Publisher enqueue coverage — PARTIAL

Source-approved command에서 domain state와 downstream event 생성이 둘 다 필요한 경우 outbox row는 같은 DB transaction에 들어가야 한다.

현재 logical enqueue/dedupe envelope와 일부 publisher boundary는 존재하지만, **모든 required publisher가 빠짐없이 wiring됐다는 platform-wide coverage evidence는 아직 없다.**

따라서 inventory status는 `PARTIAL`이다.

publisher별로 source와 implementation이 모두 확인된 경우에는 해당 publisher의 enqueue atomicity를 `NOW` 테스트할 수 있다.

## 14.3 Claim / reclaim — IMPLEMENTED

현재 source-backed worker boundary:

- pending claim
- processing lease ownership
- expired processing lease reclaim
- stale lease owner protection

Expired processing lease reclaim은 failed-event retry scheduling과 같은 authority가 아니다.

## 14.4 Success completion — IMPLEMENTED

현재 lease/status가 유효한 worker의 successful completion boundary는 source-complete mechanism으로 취급한다.

Provider/external side effect가 정확히 한 번만 실행됐다는 뜻은 아니다.

## 14.5 Failed-event lifecycle — `SRC-30` BLOCKED

다음은 source가 production policy로 정의하지 않았다.

- failed event를 `failed`/`pending`/`dead_lettered` 중 어디로 전이하는지
- retry eligibility/timing/backoff/jitter
- `attempt_count` lifecycle
- max attempts/dead-letter threshold
- manual replay/requeue
- generic error taxonomy
- 모든 downstream class에 공통인 duplicate-prevention execution protocol

따라서 특정 backoff, threshold, attempt increment 시점, dead-letter rule을 이 문서가 확정하지 않는다.

## 14.6 Source-backed required outcomes

`OUT-01` 동일 logical enqueue retry가 duplicate source event를 만들지 않는다.

`OUT-02` expired processing lease는 reclaim 가능하다.

`OUT-03` stale worker가 새 lease ownership을 침범하지 않는다.

`OUT-04` success completion replay가 duplicate local business mutation을 만들지 않는다.

`OUT-05` external side-effect retry에서 product-visible duplicate를 방지해야 한다.

중요 crash:

```text
external side effect accepted
→ worker crash before DB success completion
→ lease expires
→ redelivery candidate
```

필수 outcome은 product-visible duplicate prevention이다. 하지만 provider idempotency key, reconciliation, consumer inbox/dedupe 등 어떤 mechanism을 채택할지는 downstream transport authority와 `SRC-30` closure에 따른다.

현재 DB outbox만으로 **Exactly-Once External Delivery**를 선언하지 않는다.

Notification Delivery attempt retry policy와 generic transactional-outbox retry policy는 별도 domain boundary다.

---

# 15. Retry / Partial Failure Model

## 15.1 External call pattern

```text
Tx A: logical attempt/prepare
COMMIT

external call

Tx B: same logical state re-lock
→ still-current validation
→ validated result/provenance
→ finalize projection/message/source-approved outbox
COMMIT
```

## 15.2 DB commit 후 response loss

source-defined idempotency identity가 있는 command는 existing authoritative result를 replay해야 한다.

## 15.3 Stream disconnect

transport 중단이 새 assistant message/domain effect를 추가 commit하면 안 된다.

## 15.4 Saju/AI failure

Saju failure를 generic AI 추측으로 메우지 않는다. Product semantic validation이 source-blocked이면 transport success만으로 valid ProductReadingResponse를 선언하지 않는다.

## 15.5 Ambiguous provider result

Provider accepted 여부가 ambiguous한 timeout은 무조건 재시도로 처리하지 않는다. domain-specific reconciliation/idempotency authority가 필요하다.

---

# 16. Guest → Member Integrity

## 16.1 Same-subject promotion — IMPLEMENTED

현재 `cmd_promote_guest_v1`의 핵심 invariant:

- exact subject/session/verified auth identity
- subject lock → session lock
- active unmerged guest
- expired/consumed/claimed session deny
- auth identity가 다른 subject에 이미 연결된 경우 same-subject promotion deny
- 성공 시 `subject_id` 유지
- natural response-loss replay

## 16.2 Existing-member merge — `SRC-24` BLOCKED

현재 확정 가능한 것은 relational safety envelope뿐이다.

- one Guest Session → one destination
- direct guest→canonical Member shape
- history owner reparent 금지
- merge action audit/dedupe envelope
- existing Member Birth를 Guest 값으로 자동 overwrite 금지

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

Relationship/Unlock/Episode/Personal Record merge effect는 각각의 source authority를 추가로 요구한다.

---

# 17. Version / Revision Policy

## 17.1 Immutable revision

사용자 correction은 과거 row rewrite가 아니라 새 revision/event를 사용한다.

## 17.2 Execution pinning

source가 정의한 범위에서 실행 provenance에 version을 남긴다.

예:

```text
character/content/world version
prompt version
relationship policy_version where defined
Saju engine/transport provenance
grounding version
API/contract version
```

source가 정의하지 않은 provenance field/table을 새로 발명하지 않는다.

## 17.3 Long-lived thread

새 default content release만으로 기존 thread persona/canon을 조용히 변경하지 않는다. source-approved transition/migration authority를 사용한다.

## 17.4 Hash / fingerprint

```text
sha256:vN:...
hmac-sha256:kN:...
```

fingerprint는 integrity/pseudonymous identifier이지 anonymization 증명이 아니다.

---

# 18. Data Deletion Integrity

## 18.1 Start transaction baseline

`0290_account_deletion_start_command.sql`은 삭제 완료가 아니라 deletion-start authority다.

확인된 boundary:

- canonical subject lock
- idempotent deletion job
- deletion_pending transition
- share revoke
- device revoke
- future notification cancel
- source-defined 신규 capability write 차단
- required outbox where implemented

## 18.2 Policy blockers

`P0-PR-01` OPEN 때문에 이 문서가 다음을 정하지 않는다.

- personalization retention duration
- expired Guest cleanup duration
- AI trace retention
- backup retention
- commerce/legal/accounting retention
- destructive cleanup cadence

Standalone Birth/Target privacy delete는 `SRC-06`의 영향을 받는다.

## 18.3 Delete graph

상위 Use Case가 요구하는 graph에는 최소 다음 범주가 포함된다.

- Birth Profile/revision
- Life Fact
- Memory/access
- Conversation
- Target Person Profile
- personalized Reading/artifact
- raw source가 AI log/analytics에 복제됐다면 동일 policy 영향
- direct merged Guest lineage

commerce/legal retention은 personalization erase와 분리한다.

## 18.4 Partial deletion

partial failure를 성공처럼 숨기지 않고 deletion job/progress로 추적한다. 실제 destructive order는 source/retention authority 뒤 확정한다.

---

# 19. Rate / Quota / Abuse Authority Boundary

Use Case가 server authority로 요구하는 범주:

- user/session rate limit
- abnormal repeat limit
- free/paid quota boundary
- multi-character max turn
- prompt/context budget
- notification frequency cap

이 문서는 숫자/threshold/window를 발명하지 않는다.

`ABUSE-01`:

```text
client counter는 authority가 아니다.
canonical subject/session/capability 기준으로 server가 판단한다.
```

추가 invariant:

- entitlement와 abuse allowance는 별도 authority
- retry가 quota를 이중 consume하지 않도록 logical request identity 필요
- notification frequency cap은 client-side preference만으로 강제하지 않음

현재 unified authoritative implementation evidence는 `MISSING`이다.

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

# 21. Migration Strategy / Production Catalog Diff

## 21.1 `PI-P0-01` — exact production catalog recovery

현재 evidence:

```text
repository migrations
→ through 0860

documented production runtime
→ through 0820

exact live production catalog/history
→ not directly reverified in this final architecture review
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

`PI-GOV-01`:

```text
main branch protection = disabled
repository rulesets = []
```

Schema PR/release에는 최소:

```text
architecture invariant IDs
+ exact-head CI
+ intended schema diff
+ actual catalog diff
+ negative tests
+ true concurrency/idempotency tests
+ rollback/forward-fix note
```

가 필요하다.

---

# 22. Negative Test Matrix

테스트 gate는 두 층으로 분리한다.

```text
NOW
→ 현재 source-complete structural/runtime authority로 exact expected result를 정의할 수 있음

POST-SRC-xx / POST-P0-xx
→ 해당 source/decision closure 뒤에만 semantic executable expected result를 정의할 수 있음
```

Source-blocked evaluator를 invented fixture로 통과시켜 production semantic PASS를 만들지 않는다.

| ID | Gate | Area | Case | Expected |
|---|---|---|---|---|
| `TEST-AUTHZ-01` | NOW | Member | subject A identity → subject B object | DENY |
| `TEST-AUTHZ-02` | NOW | Guest | Guest A → subject B object | DENY |
| `TEST-AUTHZ-03` | NOW | Identity | invalid JWT-shaped bearer → Guest fallback | DENY / no fallback |
| `TEST-AUTHZ-04` | NOW | Role | ordinary path under BYPASSRLS | FAIL |
| `TEST-AUTHZ-05` | NOW | Pool | prior tx subject context visible next checkout | impossible |
| `TEST-BIRTH-01` | NOW | Birth | revision owner mismatch | FK/command DENY |
| `TEST-BIRTH-02` | NOW | Birth | stale expected current | conflict/no overwrite |
| `TEST-BIRTH-03` | NOW | Birth | old revision rewrite | DENY |
| `TEST-CHAT-01` | NOW | Chat | same clientTurnId, different request hash | conflict |
| `TEST-CHAT-02` | NOW | Chat | prohibited second in-flight turn | DENY |
| `TEST-GUEST-01` | NOW | Guest | consumed session reuse | DENY |
| `TEST-GUEST-02` | NOW | Guest | expired session promotion | DENY |
| `TEST-GUEST-03` | NOW | Guest | auth identity already mapped elsewhere | promotion DENY / merge required |
| `TEST-MERGE-01` | NOW | Merge | one session → two merge destinations | relational DENY |
| `TEST-MERGE-02` | POST-SRC-24 | Merge | conflict/resolution/action retry | source-defined result; no duplicate import |
| `TEST-MEM-01` | NOW | Memory | revoked grant context read | excluded |
| `TEST-MEM-02` | POST-SRC-05 | Memory Proposal | session-only/reject payload lifecycle | source-defined privacy result |
| `TEST-REL-01` | NOW | Relationship | ledger owner/revision structural violation | DENY |
| `TEST-REL-02` | POST-SRC-22 | Relationship | retry/anti-farming/stage transition | source-defined one effect |
| `TEST-UNLOCK-01` | NOW | Unlock | owner/source-FK structural violation | DENY |
| `TEST-UNLOCK-02` | POST-SRC-23 | Unlock | duplicate/concurrent valid condition | source-defined one unlock result |
| `TEST-EP-01` | NOW | Episode | progress ledger owner/bundle violation | DENY |
| `TEST-EP-02` | POST-SRC-17 | Episode | concurrent valid advance | source-defined consistent revision |
| `TEST-READ-01` | NOW | Reading | lower-level stale current/idempotency/parent chain | structural conflict/replay |
| `TEST-READ-02` | POST-SRC-33 | Reading | public Product/clarification semantic validation | source-defined validation |
| `TEST-COM-01` | NOW | Commerce | guest purchase intent | DENY |
| `TEST-COM-02` | NOW | Commerce | unverified receipt/provider provenance as entitlement source | DENY |
| `TEST-COM-03` | NOW | Commerce | cross-subject provider event→entitlement source | DENY |
| `TEST-COM-04` | POST-SRC-18/21 | Entitlement | purchase→grant target + transition/recompute | source-defined correct projection |
| `TEST-NOTIF-01` | NOW | Notification | subject A delivery → installation B | DENY |
| `TEST-NOTIF-02` | NOW | Notification | revoked installation send attempt | DENY |
| `TEST-OUT-01` | NOW-PUBLISHER-SCOPED | Outbox | source-approved publisher same logical enqueue retry | one logical source event |
| `TEST-OUT-02` | NOW | Outbox | expired processing lease | reclaim allowed |
| `TEST-OUT-03` | NOW | Outbox | stale worker after re-lease | stale completion DENY |
| `TEST-OUT-04` | POST-SRC-30 | Outbox | failed-event scheduling/lifecycle | source-defined |
| `TEST-DEL-01` | NOW | Delete | new prohibited capability after deletion_pending | DENY where source defines the command gate |
| `TEST-DEL-02` | POST-P0-PR-01/SRC-06 | Delete | final graph/retention/standalone Birth-Target delete | policy-defined |
| `TEST-LOG-01` | NOW | Logging | raw bearer/secret in standard log | FAIL security test |

`NOW-PUBLISHER-SCOPED`는 platform-wide outbox enqueue coverage가 완료됐다는 의미가 아니다. 개별 source-approved publisher의 exact atomicity만 검증한다.

---

# 23. Concurrency / Partial-Failure Test Matrix

| ID | Gate | Scenario | Required outcome |
|---|---|---|---|
| `CONC-01` | NOW | two Birth edits same expected revision | one winner; stale loser conflict |
| `CONC-02` | NOW | Birth commit then response loss | exact replay; no new revision |
| `CONC-03` | NOW | same chat receive concurrently | one logical turn/message |
| `CONC-04` | NOW | same chat key different payload | one winner + conflict |
| `CONC-05` | NOW | concurrent chat attempt allocate | allocator consistency |
| `CONC-06` | NOW | stream disconnect after message commit | no duplicate message |
| `CONC-07` | POST-SRC-22 | concurrent relationship events | source-defined monotonic transition |
| `CONC-08` | NOW | same Guest promotion retry | one canonical result/replay |
| `CONC-09` | NOW | same Guest Session → two merge destinations | relational one-destination invariant |
| `CONC-10` | POST-SRC-24 | merge crash/retry mid-actions | source-defined resume; no duplicate import |
| `CONC-11` | NOW | same Purchase Intent key/same hash | one intent + replay |
| `CONC-12` | NOW | same Purchase Intent key/different hash | one intent + conflict |
| `CONC-13` | NOW | duplicate provider source identity | one source row |
| `CONC-14` | POST-SRC-21 | out-of-order entitlement lifecycle | source-defined stale-event handling |
| `CONC-15` | POST-SRC-21 | overlapping grants | source-defined aggregate remains correct |
| `CONC-16` | NOW | two notification attempt allocators | one current running attempt |
| `CONC-17` | NOW | outbox claim then worker crash | expired lease reclaim |
| `CONC-18` | NOW | stale outbox worker after re-lease | stale completion DENY |
| `CONC-19` | POST-SRC-30/TRANSPORT | external accepted then crash-before-complete | product-visible duplicate prevention with source-approved mechanism |
| `CONC-20` | NOW | deletion start races new prohibited write | no untracked post-deletion write where command gate exists |
| `CONC-21` | NOW | DB commit succeeds, HTTP response lost | source-defined exact retry replay |
| `CONC-22` | NOW | Saju/AI timeout before authoritative terminal commit | no duplicate authoritative effect |
| `CONC-23` | NOW | pooled connection after rollback | no role/subject context leak |
| `CONC-24` | POST-SRC-17/23 | episode completion triggers unlock concurrently | source-defined both-or-neither integrity |

Concurrency test는 sequential simulation만으로 대체하지 않는다.

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

무조건적인 down migration이 data loss를 만들면 forward-fix를 사용한다.

## 24.4 Projection recovery

source ledger가 충분한 domain은 source-approved evaluator가 존재할 때 projection reconciliation/rebuild가 가능해야 한다. Rebuild가 새로운 source event를 발명하면 안 된다.

## 24.5 Deletion recovery

Partial deletion은 숨기지 않고 job/progress로 추적한다. destructive domain order/retention은 `P0-PR-01` 등 source authority를 따른다.

---

# 25. Open Decisions / Blockers

## 25.1 Product P0

| ID | Status | Boundary |
|---|---|---|
| `P0-SA-01` | DECIDED | authenticated internal HTTP calculation-only service; `/api/readings` 또는 Product semantic authority로 확대하지 않음 |
| `P0-CM-01` | OPEN-P0 | Web/Apple/Google rail + platform policy |
| `P0-AI-01` | OPEN-P0 | provider/model/fallback/grounded validation operational choice |
| `P0-AGE-01` | OPEN-P0 | minimum age/content policy |
| `P0-PR-01` | OPEN-P0 | retention/backup/legal retention |
| `P0-PR-01A` | DECIDED | Guest auth TTL = 604800 seconds; broader retention과 별개 |
| `P0-AUTH-01` | DECIDED | non-BYPASSRLS + transaction-scoped canonical subject context |

## 25.2 Source blockers relevant to integrity

| ID | Integrity boundary |
|---|---|
| `SRC-05` | memory proposal session-only/reject derivative payload lifecycle |
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

이 표는 blocker의 제품 의미를 새로 정의하지 않는다.

## 25.3 Platform-integrity blockers

### `PI-P0-01` — Exact production catalog state

Repository 0860 vs documented production 0820. 새 production DDL 전 live catalog/history를 직접 확인한다.

### `PI-P0-02` — Outbox failure / duplicate-prevention closure

상위 requirement는 product-visible duplicate prevention을 요구하지만 generic failed-event policy는 `SRC-30` OPEN이다. `SRC-30`을 임의 해결하지 않고, closure 후 implementation/consumer evidence를 검증한다.

### `PI-P0-03` — Deletion finalization

`P0-PR-01` 전 destructive retention semantics를 발명하지 않는다. standalone Birth/Target delete에는 `SRC-06`도 적용된다.

### `PI-GOV-01` — Schema publication governance

현재 main branch protection 없음 + repository rulesets `[]`. Schema authority publication에 repository-enforced gate가 필요하다.

---

# 26. Acceptance Criteria

이 문서를 기준으로 현재 source-complete scope를 구현 완료라고 부르려면 다음이 필요하다.

## 26.1 Structural

- ERD 59-table intended catalog coverage 검증
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
- true concurrent-session tests
- stale revision conflict

## 26.4 Ledger / projection

현재 source-complete structural invariant와 source-blocked semantic invariant를 분리한다.

```text
NOW
→ ownership/revision/FK/append-only/storage-envelope tests

POST-SRC
→ evaluator/transition/aggregation both-or-neither tests
```

`SRC-17/21/22/23/24/33` 등이 OPEN인 동안 semantic PASS를 invented fixture로 production-complete 선언하지 않는다.

## 26.5 Outbox

현재 platform-wide PASS 가능한 범위와 publisher-scoped PASS를 분리한다.

```text
platform mechanism NOW
→ claim
→ expired-lease reclaim
→ stale worker protection
→ success completion/replay

publisher-scoped NOW
→ source-approved command의 business mutation + required enqueue atomicity
→ logical enqueue dedupe

not platform-wide complete
→ 모든 required publisher wiring coverage

POST-SRC-30
→ failed-event classification
→ retry scheduling/backoff
→ attempt lifecycle
→ dead-letter threshold/transition
→ manual replay/requeue
→ source-approved downstream duplicate-prevention execution mechanism
```

## 26.6 Memory Proposal

현재 PASS 가능한 것은 relational proposal envelope/privacy guard 범위뿐이다.

Production-authoritative accept/session-only/reject resolution command가 구현됐다고 선언하지 않는다.

`SRC-05`가 영향을 주는 session-only/reject derivative payload lifecycle을 별도 closure한다.

## 26.7 Deletion

- deletion start fail-closed
- required graph inventory
- merged lineage 포함
- legal commerce/personalization separation
- `P0-PR-01` 전 destructive policy 발명 없음

## 26.8 Evidence rule

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

## 26.9 Readiness vocabulary

- `Architecture Draft` — 구조 작성 중
- `Architecture Final-Reviewed` — exact-file authority/overclaim review 완료
- `Migration-Ready` — exact live baseline + intended DDL + negative/concurrency tests + migration plan 통과 후에만
- `Production-Safe for <explicit slice>` — 해당 activated slice의 remote evidence 통과 후에만
- `Integrity-Complete for <explicit scope>` — 해당 scope source blockers와 acceptance matrix가 모두 닫힌 경우에만

현재 문서 status는 `Architecture Final-Reviewed`이며, Migration/Production/Integrity readiness는 아직 아니다.

---

# 27. Implementation Phases

## Phase PI-0 — Freeze / inventory

- baseline main SHA 고정
- write-command/source-blocker inventory 유지
- caller inventory
- RLS/ACL matrix
- stale authority status snapshot 식별

**Production schema write: 금지**

## Phase PI-1 — Production catalog recovery

`PI-P0-01` 해결:

- exact production migration history
- actual catalog/ACL/RLS/function/role dump
- 0830~0860 적용 여부 직접 확인
- repository intended state와 diff

**Production schema write: 금지**

## Phase PI-2 — NOW-test harness

현재 source-complete 범위만 자동화한다.

- DDL negative tests
- ownership/composite FK
- immutable/append-only
- RLS/ACL negative
- true two-session concurrency
- existing command replay/conflict
- outbox claim/reclaim/success mechanics
- publisher-scoped enqueue atomicity where implementation evidence exists

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
9. `SRC-05` memory proposal derivative-payload closure

각 source가 결정되면 decision/resolution artifact를 먼저 기록한다.

## Phase PI-4 — Missing command design

Source가 닫힌 domain만 command 설계로 내려간다.

각 command에 연결:

```text
INV-*
AUTHZ-*
CMD-*
CONC-*
TEST-*
MIG-* when DDL affected
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
- expected catalog diff

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
CMD-*     server command/idempotency
CONC-*    concurrency/locking/CAS
OUT-*     outbox/delivery outcome
TEST-*    negative/acceptance test
MIG-*     migration/catalog gate
ABUSE-*   rate/quota authority
PI-P0-*   platform-integrity blocker
PI-GOV-*  repository/release governance
```

# Appendix B. Authority Supersession Examples

## B.1 P0-AUTH-01

```text
old derived status/comment: OPEN/unresolved
current explicit decision: DECIDED
current implementation evidence: non-BYPASSRLS runtime/executor + tx-scoped canonical subject context

final status: DECIDED
```

## B.2 P0-PR-01A vs P0-PR-01

```text
Guest auth TTL
→ DECIDED = 604800 seconds

broader product/privacy/legal retention
→ OPEN
```

## B.3 Saju transport vs Product semantic validation

```text
P0-SA-01 transport
→ DECIDED

SRC-33 ProductReadingResponse / clarification semantic authority
→ BLOCKED
```

Transport success 또는 transport decision이 semantic validation authority를 대체하지 않는다.

## B.4 Source gap vs code existence

```text
schema/command skeleton exists
+ SRC-* remains OPEN
→ source-blocked semantic mutation remains HOLD
```

# Appendix C. Final System Boundary

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

> **DB constraint가 막을 수 있는 것은 DB가 막고, DB constraint만으로 부족한 source-complete write는 server command가 transaction/lock/idempotency로 닫는다. 사용자 경계는 RLS와 object authorization을 중첩한다. 외부 side effect는 transaction 밖에 둔다. 그리고 source가 의미를 아직 정하지 않은 영역은 schema나 command skeleton이 존재한다는 이유만으로 production mutation authority를 발명하지 않는다. 후속 explicit decision은 이전 stale status snapshot을 supersede할 수 있지만 Primary Source 의미 자체를 임의 변경할 수 없다.**
