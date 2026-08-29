# 명하 Shared Domain Contracts Specification v0.8 — Source Aligned

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.8**  
> Date: **2026-08-30**  
> Purpose: 여러 spec에 흩어진 free-form string/JSON을 bounded versioned contract로 묶는다. Source가 contract shape를 정의하지 않은 영역은 registry를 임의 생성하지 않는다.

---

## 1. 원칙

LLM/client/provider가 보낸 문자열을 다음 authority key로 직접 사용하지 않는다.

```text
SajuDomain
LifeFactType
MemoryType
PlannedActionType
SuggestedActionType
RelationshipEventType
WorldEventType
EpisodeActionType
EmotionId
AnimationCueId
NotificationCategory
EntitlementKey / Scope contract
API Error Detail schema
Outbox EventType
```

각 source-backed key family는 source가 실제 정의한 범위에서 `registryVersion` 또는 schema version을 가진다. unknown/unresolved value는 실행 authority로 승격하지 않고 reject/fallback한다.

### 1.1 Immutable Registry Authority

다음 registry/policy는 **source-controlled immutable artifact로 source authority가 실제로 정의한 범위에서만** 관리한다. DB free-form JSON이나 admin UI가 같은 version key의 의미를 덮어쓰면 안 된다.

```text
UsagePolicyDefinition
AnalyticsEventSchemaRegistry
ExperimentAssignmentPolicy
ContentPolicyTagRegistry
```

각 source-backed artifact는 해당 source가 실제 정의한 provenance identity를 따른다. Pack이 source에 없는 `contentHash`, condition DSL, registry table을 공통 요구사항으로 추가하지 않는다.

Notification scheduler는 Primary Source가 grounded/non-spam return loop, bounded category, preference/quiet-hours, server-managed frequency cap 같은 **요구와 제약**을 정의하지만, final cadence/frequency/eligibility policy artifact나 `policyVersion + contentHash` schema를 정의하지 않는다. 따라서 `NotificationPolicyDefinition`은 현재 source-controlled immutable artifact 목록에 포함하지 않으며 executable scheduler policy는 `SRC-32`가 OPEN이다.

Relationship transition rule은 source가 versioned policy로 관리하라고 요구하지만, 구체적인 policy artifact/schema/hash/score bounds/delta/stage/anti-farming contract는 정의하지 않는다. 해당 executable authority는 `SRC-22`가 OPEN이다.

Commerce의 purchased product → entitlement mapping은 현재 source-backed registry contract가 없으며 `SRC-18`로 분리한다. 기존 Pack의 `ProductFulfillmentDefinition`은 source authority로 취급하지 않는다.

Life Fact/Character Memory는 versioned type/schema validation이 **필수**라는 authority까지 source-complete지만, final positive type inventory와 schema content가 없다. Personal-record registry authority는 `SRC-25`가 OPEN이다.

## 2. Chat Structured Action Registry

`POST /api/chat`의 structured action은 **대화 intent 입력**만 표현한다. 다른 aggregate를 직접 변경하는 command를 chat action으로 중복 노출하지 않는다.

```ts
type ChatStructuredActionV1 =
  | { type: 'SELECT_SAJU_DOMAIN'; version: 'v1'; domain: SajuDomain }
  | { type: 'REQUEST_MULTI_CHARACTER_OPINION'; version: 'v1'; topicKey: string }
  | { type: 'SELECT_CHAT_PROMPT'; version: 'v1'; promptKey: string };
```

다음은 dedicated command endpoint만 사용한다.

```text
chat turn retry/abandon
memory proposal accept/reject/session-only
episode start/advance
reading clarification/retry
purchase/restore
delete/forget
```

즉 `structuredAction`을 우회 mutation bus로 사용하지 않는다. 새 chat action은 registry/schema 변경 없이는 실행할 수 없다.

AI가 UI에 제안하는 `SuggestedActionV1`도 bounded union이며, navigation 또는 dedicated endpoint 호출을 위한 typed hint일 뿐 authority mutation 자체가 아니다.

## 3. Planner References

Planner output의 `intent`, `sceneIntent`, `requiredLifeFactTypes`, `requestedActions`는 source-backed registry key만 허용한다.

Planner가 unknown/unresolved key를 제안하면 Capability Gate는 실행하지 않는다.

`requiredLifeFactTypes`의 실제 requestable key set은 `SRC-25` 해결 전 Pack example/LLM string으로 확정하지 않는다. Source의 `employment_status` 예시는 final registry라는 뜻이 아니다.

## 4. Life Fact / Memory Schemas — `SRC-25` OPEN

Primary source fixes the following boundary:

```text
Life Fact
→ fact_type + schema_version
→ value_jsonb must be validated against a type-specific versioned schema
→ unknown type/version is not stored long-term

Character Memory
→ memory_type = versioned contract key
→ schema_version required
→ content_jsonb = validated structured memory
```

But source does **not** define the complete positive registry needed to execute that validation:

```text
final LifeFactType allowlist
positive value schema per LifeFactType/version
final MemoryType allowlist
positive content schema per MemoryType/version
schema canonicalization / evolution / legacy-write rules
planner/capability exposure of requestable Life Fact types
```

An earlier Pack shape:

```ts
interface VersionedRecordTypeDefinition {
  typeKey: string;
  schemaVersion: string;
  valueSchemaRef: string;
  allowedSources: readonly string[];
  retentionClass: string;
}
```

is **not a primary-source-defined interface**. The source requires versioned validation, but does not define `valueSchemaRef`, `allowedSources`, or `retentionClass` as this registry object's normative fields.

Therefore until `SRC-25` resolves the registry:

- do not treat `employment_status`, `relationship_status`, `planned_event` examples as a closed production allowlist;
- do not accept arbitrary `type:string + value:unknown`;
- do not let LLM/planner invent record type keys;
- do not promote durable Life Fact/Memory creation as source-complete merely because relational columns exist;
- unknown/unresolved type+schema pairs fail closed with no durable value.

Already-valid stored record reads, revoke behavior, Life Fact supersession lineage constraints, and grant/context filtering remain independently testable.

## 5. Relationship / World Event Boundary

LLM은 Relationship/World event **candidate**만 제안할 수 있고 score/stage/delta를 직접 결정하지 않는다.

Primary source는 Relationship Event가 idempotent identity를 갖고, server Relationship Engine이 versioned transition rule로 결정론적으로 상태를 갱신해야 한다고 요구한다. 그러나 Use Case의 event 이름은 example list이며, 최종 normative event allowlist와 event payload schema, score bounds, delta table, stage transition rule, anti-farming evaluator는 source에 없다.

따라서 `SRC-22` 해결 전에는 Pack이 example event names를 닫힌 registry로 승격하거나 caller-supplied `delta_*`/next stage를 authority로 받아서는 안 된다. Unknown 또는 아직 source-approved evaluator가 없는 relationship candidate는 authoritative state mutation으로 실행하지 않는다.

World Event 역시 source-backed schema/condition authority가 존재하는 범위에서만 실행한다.

## 5A. Relationship Policy — `SRC-22` OPEN

Source-backed contract는 다음 **원칙/relational envelope**까지다.

```text
state dimensions = closeness / trust / friction
current stage + policy_version + revision
relationship_event append-only ledger
unique event dedupe per subject/character
one event per applied revision
state_revision_after = state_revision_before + 1
state row lock + event append + projection revision update atomically
LLM/client cannot choose scores
transition rule is versioned
historical event provenance is preserved
message spam cannot farm indefinitely
inactivity alone does not auto-degrade baseline state
```

Source가 아직 정의하지 않은 executable policy:

```text
final RelationshipEventType allowlist
event payload schemas
score bounds
event → delta mapping
internal stage keys / thresholds / transition graph
anti-farming windows/caps/cooldowns
last_interaction_at update semantics
active policy-version selection/migration
no-op/blocked-event ledger semantics
policy content-hash persistence
```

이전 Pack의 다음 형태는 **source-backed interface가 아니므로 normative contract에서 제거**한다.

```text
RelationshipPolicyDefinitionV1
policyVersion + contentHash
scoreBounds
stages[].entryConditions
 events[].delta
antiFarmingRuleKey
```

특히 ERD v0.6의 relationship state/event row는 `policy_version`만 저장하고 relationship-policy `contentHash` 컬럼이나 policy artifact table을 정의하지 않는다. 추가 hash provenance가 필요하면 source/ERD가 먼저 그 persistence authority를 결정해야 한다.

`SRC-22` 해결 전 `cmd_apply_relationship_event...`, score/stage transition evaluator, anti-farming evaluator를 production-authoritative로 승격하지 않는다.

## 5B. Content Policy Tags

Age/content P0가 아직 열려 있어도 content schema에는 bounded `ContentPolicyTag` slot을 둔다. 실제 연령 threshold/허용 matrix는 `P0-AGE-01` 결정 전 확정하지 않는다.

```ts
type ContentPolicyTag = string; // registry-validated key, arbitrary runtime string 금지
```

캐릭터/episode bundle은 필요한 policy tag만 선언하고, Capability Gate가 결정된 age/content policy와 조합한다.

## 6. UI Cue Registry

Emotion/Cue는 content bundle의 cue schema와 캐릭터 allowlist의 교집합이어야 한다.

unknown cue는 asset path로 resolve하지 않는다.

## 7. Commerce Product → Entitlement Mapping

`SRC-18`이 source authority gap이다.

현재 source-backed Purchase Intent contract는 selected `product_offer`의 immutable minimal mapping snapshot을 pin한다.

```text
productOfferId
productId
platform
provider
externalProductId
```

Primary source는 다음을 정의하지 않는다.

```text
product → entitlementKey
scope resolver
purchase-derived grantKey
one product → multiple grants
historical mapping version/hash
```

따라서 Pack은 다음 schema를 source type처럼 만들지 않는다.

```text
ProductFulfillmentDefinition
fulfillmentDefinitionVersion
GLOBAL | REQUEST_RESOURCE | FIXED
one_off | subscription | promo_compatible
```

`SRC-18` 해결 전 verified receipt/provider event가 있더라도 unknown product→entitlement mapping에서는 entitlement mutation을 실행하지 않는다.

## 8. API Error Details

`ApiError.details`는 code별 versioned schema만 허용한다. arbitrary provider/body dump 금지.

예:

```text
REVISION_CONFLICT/v1 → expectedRevisionId,currentRevisionId
NEEDS_CLARIFICATION/v1 → readingSessionId,readingId,clarificationSchemaRef
CAPABILITY_UNAVAILABLE/v1 → capabilityKey,availability
```

## 9. Outbox Contracts — `SRC-30` Boundary

`event_type + event_schema_version`별 payload schema validation은 source-approved schema가 실제로 존재하는 범위에서만 수행한다. Consumer는 unknown/unresolved major schema를 **성공적으로 처리한 것으로 기록하거나 authoritative downstream side effect를 실행해서는 안 된다.**

Unknown/unresolved schema의 exact failure disposition은 별도 문제다. `SRC-30` 해결 전 Pack은 다음을 임의 확정하지 않는다.

```text
failed vs dead_lettered 등 terminal/non-terminal state
failure classification / error taxonomy
retry eligibility / retry timing / backoff / jitter
attempt_count lifecycle / max attempts
dead-letter threshold / transition
manual replay / requeue
```

따라서 unknown major schema를 곧바로 `dead-letter` 또는 특정 compatibility state로 보내는 것을 source-backed contract로 요구하지 않는다. Expired `processing` lease reclaim은 independently source-backed crash recovery이며 schema failure의 retry/dead-letter authority를 제공하지 않는다.

## 9A. Notification Scheduler Policy — `SRC-32` OPEN

Primary Source가 source-complete하게 고정한 것은 다음 **제품 요구/relational envelope**까지다.

```text
return-loop notification은 실제 character/content/reading state에 근거
허위 urgency / generic spam 금지
bounded initial notification categories
notification preference / opt-in / quiet-hours 존중
server가 notification frequency cap을 관리
notifications row는 dedupe_key / scheduled_at / template_key 등을 저장 가능
```

Use Case의 다음 조건들은 **candidate example**이며 final executable registry가 아니다.

```text
마지막 캐릭터 대화 후 일정 기간 경과 (예: 3일)
새 월운/reading available
저장한 중요 일정 임박
episode unlock
```

현재 Source가 정의하지 않은 production scheduler authority:

```text
final trigger inventory + positive schema
category별 exact cadence/threshold
frequency-cap window/count/scope
cap accounting semantics
trigger → template selection
logical notification / dedupe-key construction
scheduler replay/concurrency convergence
stale candidate cancel/defer/expire semantics
policy change/experiment semantics
policy identity/version/provenance representation
```

따라서 이전 Pack의 다음 형태는 **source-backed interface가 아니다**.

```ts
interface NotificationPolicyDefinitionV1 {
  policyVersion: string;
  contentHash: string;
  category: NotificationCategory;
  eligibilityRuleKey: string;
  minimumIntervalSeconds?: number;
  maxPerWindow?: { seconds:number; count:number };
}
```

`SRC-32` 해결 전 이 interface나 `policyVersion + contentHash`를 Primary Source contract로 구현하지 않는다. 특히 Use Case의 “3일” 예시를 universal hard-coded `character_return` threshold로 승격하지 않는다.

Source가 향후 policy versioning/immutable artifact를 실제로 채택하면 그때 해당 source-defined identity/schema를 따른다. 현재 Pack은 그 선택을 대신하지 않는다.

## 10. Verification

- unknown PlannedAction → no command execution
- unresolved/unknown LifeFact type/schema → no durable persistence before `SRC-25` resolution
- unresolved/unknown Memory type/schema → no durable persistence before `SRC-25` resolution
- already-valid stored personal-record read/revoke/supersession lineage remains testable
- unresolved/unknown Relationship event candidate → no authoritative relationship mutation before `SRC-22` resolution
- relationship delta/stage/anti-farming evaluator → blocked until `SRC-22`
- unknown cue → no arbitrary asset resolution
- Purchase Intent minimal offer mapping snapshot mutation → hash mismatch/deny
- unresolved product→entitlement mapping (`SRC-18`) → no entitlement mutation
- unknown/unresolved outbox schema → no successful consume or authoritative downstream side effect; exact failure/retry/dead-letter/replay disposition remains blocked by `SRC-30`
- autonomous notification cadence/frequency/dedupe/template policy → blocked until `SRC-32`; existing stored notification/read/delivery-attempt boundaries remain independently testable
