# 명하 DB DDL / Migration Specification v0.6 — Source Aligned

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.6**  
> Date: **2026-08-28**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`, `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`  
> Rule: source가 결정하지 않은 implementation-critical 사항은 `OPEN-P0` 또는 `SOURCE_AUTHORITY_GAPS.md`/numbered source-gap 문서에 남긴다.

---

## 1. 목적

ERD v0.6의 59-table schema catalog를 PostgreSQL migration으로 옮길 때 필요한 DDL 작성 규칙, naming, constraint/trigger/RLS 검증 gate를 정의한다.

이 문서는 ERD 컬럼/PK/FK를 재창작하지 않는다. source-level schema correction이 필요하면 source authority gap을 먼저 해결한다.

## 2. Pre-DDL Blockers

- `SRC-01` character/episode operational disable authority는 final migration baseline 전에 해결해야 한다. 현재 v0.6 그대로 DDL draft를 만드는 것은 가능하지만 해당 behavior를 migration-complete라고 부르지 않는다.
- `SRC-05` memory proposal session-only/reject staging semantics가 해결되기 전 personal-record DDL을 privacy-complete로 승격하지 않는다.
- `SRC-06` standalone Birth/Target deletion vs Reading provenance가 해결되기 전 deletion DDL을 complete로 승격하지 않는다.
- `SRC-07` manual commerce resolution은 source 해결 전 DDL이 존재하더라도 production-disabled로 유지한다.
- `SRC-09`가 해결되기 전 `reading_groundings.qualifiers/prohibited_inferences`를 실제 Saju public contract에서 온 authoritative metadata라고 간주하지 않는다. table DDL draft는 가능하지만 grounding semantic baseline은 승격 금지다.
- `SRC-18`이 해결되기 전 purchased product를 concrete entitlement grant로 변환하는 mapping schema/registry/table을 Pack이 임의로 추가하지 않는다. Existing commerce provenance/grant tables의 DDL은 가능하지만 purchase→grant semantic pipeline을 complete로 승격하지 않는다.
- `SRC-21`이 해결되기 전 entitlement event→grant transition/aggregate recompute function을 source-authoritative command로 추가하지 않는다.
- `SRC-22`가 해결되기 전 Relationship Event의 score bounds, event→delta, stage transition, anti-farming을 계산하는 registry/table/function/condition DSL을 Pack이 임의로 추가하지 않는다. Existing relationship state/event relational DDL은 유지 가능하다.
- `SRC-23`이 해결되기 전 Character Unlock의 condition DSL/schema, World Event→target mapping, unlock evaluator/reward registry/table/function을 Pack이 임의로 추가하지 않는다. Existing `world_events`/`character_unlocks` relational DDL은 유지 가능하다.
- `P0-AUTH-01` RLS execution identity가 결정되기 전에는 RLS policy SQL을 **candidate**로만 작성하고 production security baseline으로 승격하지 않는다.

## 3. Migration Layout

```text
supabase/migrations/
  0001_extensions_and_helpers.sql
  0010_auth_owner.sql
  0020_content_world.sql
  0030_birth_records.sql
  0040_conversation_core.sql
  0050_personal_record.sql
  0060_relationship_world.sql
  0070_readings.sql
  0080_commerce.sql
  0090_notifications.sql
  0100_operations.sql
  0110_circular_fk_alter.sql
  0120_constraint_triggers.sql
  0130_rls.sql
  0140_service_privileges.sql
  0150_indexes.sql
  0160_seed_reference_data.sql
```

Production migration은 forward-only default. 일반 rollback은 previous code compatibility + forward repair migration으로 처리한다.

## 4. Table Groups

M01 AUTH/OWNER: `subjects`, `profiles`, `guest_sessions`, `subject_merge_jobs`, `subject_merge_actions`

M02 CONTENT/WORLD: `content_bundles`, `content_releases`, `characters`, `saju_domains`, `saju_domain_runtime`, `character_runtime_catalog`, `character_capabilities`, `character_relations`, `episode_runtime_catalog`, `episode_participants`

M03 BIRTH: `birth_profiles`, `birth_profile_revisions`, `target_person_profiles`

M04 CONVERSATION: `conversation_threads`, `conversation_thread_characters`, `conversation_thread_content_transitions`, `chat_turns`, `chat_turn_attempts`, `conversation_messages`

M05 PERSONAL: `life_facts`, `memory_items`, `memory_proposals`, `record_access_grants`

M06 REL/WORLD STATE: `user_character_states`, `world_events`, `relationship_events`, `character_unlocks`, `user_episode_progress`, `episode_progress_events`

M07 READINGS: `reading_sessions`, `readings`, `reading_execution_attempts`, `reading_refs`, `reading_groundings`, `share_artifacts`

M08 COMMERCE: `products`, `product_offers`, `commerce_account_links`, `purchase_intents`, `commerce_receipts`, `commerce_provider_events`, `entitlement_grants`, `entitlement_events`, `entitlements`

M09 NOTIFICATION: `device_installations`, `notification_settings`, `notification_preferences`, `notifications`, `notification_deliveries`, `notification_delivery_attempts`

M10 OPS: `ai_execution_logs`, `ai_execution_groundings`, `outbox_events`, `data_deletion_jobs`

## 5. Circular FK Stage

Child table 생성 후 ALTER:

```text
birth_profiles.current_revision_id
chat_turns.committed_attempt_id
reading_sessions.current_reading_id
readings.committed_execution_attempt_id
```

source가 DEFERRABLE을 요구한 pointer는 `DEFERRABLE INITIALLY DEFERRED`로 구현하고 transaction-end invariant test를 가진다.

## 6. Constraint Naming Convention

Schema diff가 실제 constraint identity를 검증할 수 있도록 이름을 deterministic하게 고정한다.

```text
pk_<table>
uq_<table>__<column_tokens>
fk_<table>__<local_tokens>__<target_table>
ck_<table>__<invariant_key>
px_<table>__<purpose>               # partial unique/index
ct_<table>__<cross_row_invariant>   # constraint trigger
tr_<table>__<mutation_guard>        # regular trigger
```

PostgreSQL identifier length 충돌을 피하기 위한 deterministic abbreviation map을 source control에 둔다. 동일 semantic constraint가 migration마다 임의 이름을 갖지 않는다.

## 7. DDL-Native Constraints

Application validation으로 대체 금지:

- PK/composite PK
- source ERD가 요구한 non-partial UNIQUE target
- partial UNIQUE indexes
- same-owner composite FK
- simple enum/nullability/revision CHECK
- one active/current/default의 **at-most-one** 조건

`at least one active default`처럼 다른 row를 봐야 하는 조건은 simple CHECK라고 속이지 않고 command/constraint-trigger invariant로 구분한다.

Relationship의 `event_dedupe_key`, one-event-per-applied-revision, `state_revision_after = state_revision_before + 1`, append-only ledger 같은 structural invariant는 DDL로 enforce할 수 있다. 반대로 score bounds/event delta/stage/anti-farming은 source가 policy semantics를 정의하기 전 DB CHECK/trigger로 임의 고정하지 않는다.

Character Unlock의 source-complete DDL-native 범위는 다음이다.

```text
UNIQUE(subject_id, character_id)
status IN ('locked','unlocked')
unlocked → unlocked_at NOT NULL
locked → unlocked_at NULL
revision >= 0
source_world_event_id same-subject FK
```

이 FK/shape는 causal provenance의 **구조**만 보장한다. 해당 World Event가 그 `character_id`를 unlock할 자격이 있는지는 `SRC-23` condition/effect authority 없이는 DB CHECK로 임의 추론하지 않는다.

## 8. Constraint Trigger Catalog

최소 family:

```text
ct_subject_merge_target_valid
tr_birth_revision_immutable
ct_target_profile_kind
ct_life_fact_supersession_integrity
ct_chat_turn_finalize
ct_chat_participation_active_at_commit
ct_reading_finalize
ct_reading_grounding_source_valid
ct_memory_proposal_source_character
tr_content_projection_immutable
tr_append_only_ledgers
```

Relationship/episode/commerce/world-unlock처럼 allocator + row lock + multiple mutations가 핵심인 transition은 무리하게 trigger에 숨기지 않고 server command/procedure transaction으로 유지한다. 단, 해당 command가 source gap으로 막혀 있으면 relational constraints만 구현하고 policy/evaluator function은 만들지 않는다.

Trigger rules:

- deterministic
- external API call 금지
- unrelated hidden side effect 금지
- exception SQLSTATE/constraint name 고정
- direct negative test 보유

## 9. Server Command Boundary

Raw CRUD endpoint로 노출 금지:

```text
guest promotion/merge
birth revision append
thread content transition
chat receive/retry/abandon/commit
memory proposal resolution
relationship event apply
character/world unlock apply
episode advance
reading create/clarify/transport-retry/finalize
commerce verify/apply/recompute
notification delivery attempt
data deletion lifecycle
content release activation/retirement
```

Source gap이 있는 command는 shell/table existence만으로 production-complete로 취급하지 않는다.

특히:

```text
episode transition evaluator               → SRC-17
purchase-derived entitlement target         → SRC-18
entitlement event apply/aggregate            → SRC-21
relationship event score/stage policy apply  → SRC-22
character unlock condition/effect apply      → SRC-23
```

`SRC-22` 해결 전 Relationship apply command가 caller-supplied `delta_*` 또는 next stage를 trusted input으로 받아 persistence하는 방식도 금지한다. 그것은 source-required Relationship Engine authority를 구현한 것이 아니다.

`SRC-23` 해결 전 Character Unlock command가 caller-supplied `character_id`, `unlock=true`, arbitrary condition result, 또는 same-owner `source_world_event_id`를 자격 증명처럼 신뢰하는 방식도 금지한다.

## 10. Append-only / Immutable Policy

Append-only semantics:

- birth_profile_revisions corrections via new revision
- conversation_thread_content_transitions
- relationship_events
- world_events
- episode_progress_events
- entitlement_events
- terminal attempt provenance

Published immutable projection:

- content_bundles
- character_runtime_catalog
- character_relations
- episode_runtime_catalog

일반 app/client role UPDATE/DELETE 금지. Retention erase는 dedicated lifecycle command.

`character_unlocks`는 current projection이며 append-only ledger가 아니다. 하지만 current projection write가 허용된다는 사실은 unlock eligibility/effect authority가 해결됐다는 뜻이 아니다.

## 11. RLS Integration

Authority: `AUTH_RLS_PRIVACY_SPEC.md`, `OPEN-P0: P0-AUTH-01`.

DDL draft 단계:

- user-owned table RLS enable/default deny candidate
- direct-client service-only tables policy 없음
- trusted current-subject resolver interface placeholder
- guest direct DB access 없음

P0-AUTH-01 미결정 상태에서 service-role bypass를 RLS PASS로 기록 금지.

## 12. Hash / Fingerprint

```text
sha256:v1:<hex>
hmac-sha256:k2:<hex>
```

low-entropy personal/token/receipt/account identifiers는 keyed/versioned HMAC 우선. Hash는 anonymization이 아니다.

Purchase Intent `offer_snapshot_hash`는 source-defined version-prefixed digest field이지만 source가 canonical JSON serialization/hash algorithm을 PostgreSQL contract로 정의하지 않는다. Service boundary가 canonicalization을 소유하며 DB command는 supplied immutable snapshot/hash consistency contract를 검증한다.

Relationship state/event ERD에는 `policy_version`만 있고 relationship policy content-hash field/table이 없다. `SRC-22` 해결 전 Pack이 별도 `relationship_policy_hash` 컬럼이나 registry table을 migration에 추가하지 않는다.

Character Unlock ERD에는 condition version/hash/bundle pin 컬럼이 없다. `SRC-23` 해결 전 Pack이 unlock evaluator provenance를 위해 임의 condition hash/version 컬럼이나 registry table을 추가하지 않는다. Source가 추가 provenance를 요구하면 ERD-compatible contract 또는 explicit ERD revision이 먼저 필요하다.

## 13. JSON Contract Validation

JSONB column이 `validated`라고 적혀 있으면 실제 validator source가 있어야 한다.

- application boundary schema validation 필수
- security-critical finite key는 DB CHECK/reference table로 추가 가능
- arbitrary LLM/provider JSON을 validated label만 붙여 저장 금지
- schema version/ref를 provenance에 남김 when that schema/version is source-defined

Relationship Event `payload_jsonb`는 source가 exact event schema를 정의하지 않았으므로 `SRC-22` 해결 전 production Relationship apply payload validator를 임의 schema로 확정하지 않는다.

World Event `payload_jsonb`도 Character Unlock causality에 필요한 exact event/payload schema가 source에 없으므로 `SRC-23` 해결 전 unlock evaluator용 arbitrary JSON schema를 authority로 확정하지 않는다.

## 14. Seed Data

허용:

- `saju_domains` stable keys
- development constants
- explicitly approved product stable identities

캐릭터 persona/canon authoring은 seed SQL이 아니라 content publish pipeline.

Product→entitlement mapping은 `SRC-18` 미해결이므로 invented `ProductFulfillmentDefinition` registry나 equivalent mapping seed를 source authority라고 추가하지 않는다. Source가 mapping model을 정한 뒤에만 해당 artifact/table/seed policy를 DDL spec에 추가한다.

Relationship event→delta/stage policy seed/registry도 `SRC-22` 미해결 상태에서는 source authority라고 추가하지 않는다.

Character unlock condition/effect registry나 World Event→character mapping seed도 `SRC-23` 미해결 상태에서는 source authority라고 추가하지 않는다.

## 15. Schema Catalog Diff

CI는 actual catalog vs ERD-derived machine catalog를 비교한다.

필수 diff 0:

- table/column/type/nullability
- PK/FK columns + target
- UNIQUE / partial UNIQUE predicate
- named CHECK expression normalized form
- named constraint trigger presence/deferrability
- RLS enabled/forced + policy inventory after P0-AUTH-01 DECIDED

단순히 `table mentions = 59`를 schema validation으로 취급하지 않는다.

## 16. Migration Replay Semantics

`repeated apply`는 같은 migration SQL을 DB에 두 번 직접 실행한다는 뜻이 아니다. 검증 대상:

```text
empty DB → all migrations once → PASS
empty DB → historical sequence from zero → same final catalog hash
existing previous release → only pending migrations → expected catalog
failed transaction-safe migration → no half-applied schema
```

Supabase migration ledger와 source migration filenames가 authority.

## 17. DDL Negative Test Suite

ERD v0.6 section 23 + v0.2 추가 findings를 최소 gate로 사용.

추가:

- current default at-most-one DB enforce / at-least-one activation command enforce
- terminal append-only UPDATE attempt deny
- material ambiguity source preserved in reading_ref path
- unknown JSON contract key cannot execute server command
- RLS forged subject context deny after P0-AUTH-01
- deletion_pending subject command gate deny
- session-only/reject proposal derivative payload does not persist indefinitely (`SRC-05` resolution)
- standalone target/birth privacy deletion dependency graph (`SRC-06` resolution)
- manual commerce provider resolution has audited proof or remains disabled (`SRC-07`)
- reading_groundings guard metadata is source-backed rather than fabricated (`SRC-09`)
- no invented product→entitlement mapping schema/registry before `SRC-18` resolution
- no invented entitlement transition/aggregate function before `SRC-21` resolution
- relationship ledger dedupe/revision/append-only structural invariants remain enforced
- no invented relationship policy registry/content-hash column/evaluator before `SRC-22` resolution
- Character Unlock status/timestamp/revision/owner/source-FK relational invariants remain enforced
- no invented unlock condition DSL/World Event→target evaluator/unlock-policy provenance column before `SRC-23` resolution

## 18. Promotion Gate

```text
source blocker relevant to schema/command = CLOSED or affected feature explicitly disabled
→ DDL clean apply
→ migration replay/catalog hash PASS
→ schema catalog diff = 0
→ constraint/trigger negative PASS
→ RLS negative PASS (P0-AUTH-01 DECIDED)
→ concurrency/idempotency PASS
→ Engineering Slice E2E PASS
→ migration baseline candidate
```

Relationship relational schema may remain in the baseline while authoritative score/stage mutation is disabled pending `SRC-22`.

World Event / Character Unlock relational schema and stored current-read projection may remain in the baseline while authoritative unlock eligibility/effect mutation is disabled pending `SRC-23`.
