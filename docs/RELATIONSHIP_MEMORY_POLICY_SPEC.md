# 명하 Relationship / Life Record / Memory Policy v0.4 — Source Aligned

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.4**  
> Date: **2026-08-28**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`, `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`  
> Rule: source가 결정하지 않은 implementation-critical 사항은 `OPEN-P0`, 비차단 선택은 `CANDIDATE`, source 간 충돌/공백은 `SOURCE_AUTHORITY_GAPS.md` 또는 numbered source-gap 문서에 기록한다.

---

## 1. 목적

캐릭터 관계, 현세록(Life Fact), Character Memory, session-only context의 authority를 분리한다.

## 2. Authority Split

```text
Birth Profile Revision → 출생 입력
Life Fact              → 현재 삶의 구조화 사실 history
Character Memory       → 관계/대화 회상 durable record
Session-only Context   → 현재 thread/turn에서만 쓰는 비영속 context
Relationship Event     → 관계 변화 source ledger
User Character State   → 관계 current projection
```

## 3. Life Fact

Current overwrite 금지. 변경은 same-type supersession append.

필수 provenance:

- fact_type / schema_version
- valid_from/to
- source kind/message/merge action
- supersedes_fact_id
- confirmed_at / revoked_at

Fact type는 `SHARED_DOMAIN_CONTRACTS_SPEC.md`의 versioned registry를 통과한다.

## 4. Character Memory

구조화된 회상용 durable record. Birth input 또는 confirmed Life Fact 전체를 무조건 복사하지 않는다.

Memory type/schema도 versioned registry를 사용한다.

## 5. Session-only Context

Use Case의 `이 대화에서만` 선택은 **durable Life Fact/Memory table에 저장하지 않는다.**

허용 구현:

```text
current request context
thread-scoped ephemeral cache with bounded TTL
client re-supplied transient state signed/validated by server
```

어느 방식을 쓰더라도:

- account record 화면에 durable fact처럼 나타나지 않음
- future thread/character에 자동 전달되지 않음
- AI execution log가 원문을 shadow memory로 보존하면 안 됨

## 6. Memory Proposal Resolution

AI/Character는 proposal만 생성.

```text
pending
→ accept_long_term
   → exactly one Life Fact OR Memory create
   → explicit grants or private(0 grants)

→ session_only
   → no durable Life Fact/Memory row

→ reject
   → no durable record
```

동일 turn retry는 proposal_dedupe_key로 중복 생성 금지. terminal resolution은 1회만.

`SRC-05` 해결 전에는 `session_only/reject` 후 `memory_proposals.proposed_value_jsonb`의 장기 보존을 privacy baseline으로 승인하지 않는다. proposal staging payload retention은 Memory authority를 우회하는 shadow record가 되어서는 안 된다.

## 7. Access Grants

Durable character visibility는 active `record_access_grants`로만 표현.

```text
character_only      → one explicit grant
current_characters  → 승인 시점 eligible set snapshot grants
private             → durable record, character grant 0
session_only        → durable record 자체 없음
```

새 캐릭터가 과거 `current_characters` 선택을 자동 상속하지 않는다.

## 8. Relationship State — source-complete envelope

Primary source defines the current projection as:

```text
closeness
trust
friction
relationship_stage
policy_version
revision
last_interaction_at
```

Source-backed rules:

- one current projection per user-character;
- scores are server-controlled;
- LLM/client cannot directly choose scores;
- relationship is multi-dimensional rather than one scalar;
- transition rule is versioned;
- revision is linear and server-controlled.

Numeric bounds and exact stage transition semantics are **not defined by source**. The previous Pack statement that `SHARED_DOMAIN_CONTRACTS_SPEC.md` already owns a complete immutable `RelationshipPolicyDefinition` was overreach. Executable policy authority is `SRC-22` OPEN.

## 9. Relationship Event Ledger — source-complete envelope

`relationship_events` is append-only and records:

```text
event_type / event_schema_version / event_dedupe_key
source turn / world event / merge action provenance
delta_closeness / delta_trust / delta_friction
policy_version
state_revision_before / state_revision_after
validated payload
applied_at
```

Structural rules:

- same `(subject, character, event_dedupe_key)` applies at most once;
- one event owns one `state_revision_after`;
- `after = before + 1`;
- state-row lock serializes apply;
- event append and current projection revision update commit atomically;
- historical event rows are not rewritten when policy changes.

Use Case supplies example event names, not a final normative registry. Final event allowlist, event payload schemas, score deltas, stage rules and anti-farming evaluator remain `SRC-22`.

## 10. Atomic Apply — skeleton only; executable evaluator blocked by `SRC-22`

Source fixes this order:

```text
lock user_character_state
→ dedupe event
→ evaluate source-approved versioned relationship policy
→ append relationship_event(before r, after r+1)
→ update current projection revision
→ commit
```

This is an algorithmic/transactional skeleton, not enough information to compute authoritative outputs today.

Until `SRC-22` is resolved:

- do not trust LLM/client/caller supplied `delta_*` values;
- do not trust caller supplied next `relationship_stage`;
- do not invent score bounds;
- do not convert Use Case event examples into a closed production registry;
- do not invent stage thresholds/condition DSL;
- do not invent anti-farming windows/caps;
- do not promote `cmd_apply_relationship_event...` as source-authoritative.

A procedure that merely persists already-calculated caller deltas does not satisfy Relationship Engine authority.

## 11. Anti-Farming — requirement known, algorithm unresolved

Source requires:

- same event retry once;
- same user action retry does not repeatedly increase state;
- message spam cannot farm relationship stage indefinitely;
- inactivity alone does not automatically degrade baseline relationship state;
- relationship degradation requires explicit story event or actual interaction basis.

Source does not define:

```text
cooldown/window duration
per-event caps
source aggregate uniqueness rules beyond event_dedupe_key
which candidate events are repeatable
how equivalent actions across distinct turns are detected
additional persisted/derived anti-farming state
```

Therefore exact anti-farming implementation is blocked by `SRC-22`; implementation must fail closed rather than invent these rules.

## 12. Character-to-Character Awareness

다른 캐릭터 언급은:

```text
same pinned bundle canon relation
+ actual user interaction state if referenced
+ record grant/privacy
→ allowed context
```

Canon에 없는 공식 과거사 생성 금지.

## 13. Forget / Delete Semantics

```text
Conversation delete
→ conversation deletion workflow

Character forget
→ 그 캐릭터의 active record_access_grants revoke
→ shared memory item 자체를 다른 캐릭터에게서 삭제하지 않음

Life Record delete
→ Life Fact revoke/supersede

Account delete
→ account deletion graph
```

한 action이 다른 authority를 암묵적으로 파괴하지 않는다.

## 14. Guest Merge

Historical relationship ledger raw reparent 금지. canonical member current projection이 필요하면 explicit merge action + source-approved relationship policy semantics로 import/merge하고 provenance를 남긴다.

`SRC-22` 해결 전 merge 과정에서 relationship score/stage를 임의 합산/재계산하는 production policy를 만들지 않는다.

## 15. Policy Versioning — source boundary

Source requires relationship transition rules to be versioned and historical event provenance to remain preserved when policies change.

Source currently stores `policy_version` on both current state and event rows. It does **not** define:

- a `RelationshipPolicyDefinitionV1` artifact;
- a relationship policy `contentHash` column/table;
- policy version selection/migration rules;
- historical policy artifact storage/replay mechanism.

Therefore Pack은 동일 version 의미를 운영 중 임의 변경하지 않는 일반 원칙을 유지하되, `policy_version + contentHash` persistence를 source-backed requirement라고 주장하지 않는다. 추가 provenance가 필요하면 `SRC-22` resolution에서 ERD-compatible contract 또는 explicit ERD change가 먼저 정의되어야 한다.

## 16. Verification

Source-complete now:

- future character old grant → deny
- revoked memory context retrieval → deny
- session-only resolution → durable record count unchanged
- private record → character context excluded
- duplicate proposal resolution → once
- Life Fact type mismatch supersede → deny
- double supersede race → one wins
- relationship event ledger append-only / revision invariants
- duplicate relationship event key cannot occupy multiple applied revisions
- client/LLM direct score authority denied
- inactivity-only automatic degradation absent

Blocked until `SRC-22` resolution:

- final unknown/known Relationship Event registry mutation test
- event→delta correctness
- numeric bound behavior
- stage transition correctness
- anti-farming window/cap behavior
- concurrent authoritative relationship policy application
- relationship-stage-driven unlock reproducibility

After `SRC-22` resolution, the relationship apply gate must prove same-event retry once, linear concurrent revisions, source-approved delta/stage evaluation, anti-farming, and historical policy provenance according to the resolved contract.
