# 명하 Shared Domain Contracts Specification v0.4

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.4**  
> Date: **2026-08-28**  
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

각 source-backed key family는 `registryVersion` 또는 schema version을 가진다. unknown value는 실행하지 않고 reject/fallback한다.

### 1.1 Immutable Registry Authority

다음 registry/policy는 **source-controlled immutable artifact로 source authority가 실제로 정의한 범위에서만** 관리한다. DB free-form JSON이나 admin UI가 같은 version key의 의미를 덮어쓰면 안 된다.

```text
RelationshipPolicyDefinition
UsagePolicyDefinition
NotificationPolicyDefinition
AnalyticsEventSchemaRegistry
ExperimentAssignmentPolicy
ContentPolicyTagRegistry
```

각 source-backed artifact는 최소 `id/key + version + contentHash` 또는 해당 source가 정의한 동등한 provenance를 가진다. 정책 내용이 바뀌면 version/content identity도 바뀐다.

Commerce의 purchased product → entitlement mapping은 현재 source-backed registry contract가 없으며 `SRC-18`로 분리한다. 기존 Pack의 `ProductFulfillmentDefinition`은 source authority로 취급하지 않는다.

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

Planner output의 `intent`, `sceneIntent`, `requiredLifeFactTypes`, `requestedActions`는 registry key만 허용한다.

Planner가 unknown key를 제안하면 Capability Gate는 실행하지 않는다.

## 4. Life Fact / Memory Schemas

```ts
interface VersionedRecordTypeDefinition {
  typeKey: string;
  schemaVersion: string;
  valueSchemaRef: string;
  allowedSources: readonly string[];
  retentionClass: string;
}
```

`value_jsonb` / `content_jsonb`는 해당 schema validation 통과 후만 저장한다.

## 5. Relationship / World Event Registry

LLM은 event candidate key만 제안한다. 실제 event 생성은 versioned policy가 candidate를 allowlist에 매핑한 경우만 가능하다.

동일 문자열이라도 policy version이 다르면 의미를 암묵적으로 재해석하지 않는다.

## 5A. Relationship Policy Definition

```ts
interface RelationshipPolicyDefinitionV1 {
  policyVersion: string;
  contentHash: string;
  scoreBounds: { closeness:[number,number]; trust:[number,number]; friction:[number,number] };
  stages: readonly { stageKey:string; entryConditions: readonly PolicyConditionV1[] }[];
  events: readonly {
    eventType: RelationshipEventType;
    eventSchemaVersion: string;
    delta?: { closeness?:number; trust?:number; friction?:number };
    antiFarmingRuleKey?: string;
  }[];
}
```

LLM/client는 delta/stage를 보내지 않는다. Runtime은 pinned policy version/hash의 deterministic rule만 적용한다.

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

## 9. Outbox Contracts

`event_type + event_schema_version`별 payload schema registry를 둔다. Consumer는 unknown major schema를 처리하지 않고 dead-letter/compatibility path로 보낸다.

## 9A. Notification Policy Definition

Scheduler threshold/frequency cap은 versioned immutable policy artifact로 둔다.

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

동일 policy version의 cadence를 운영 중 조용히 바꾸지 않는다.

## 10. Verification

- unknown PlannedAction → no command execution
- unknown LifeFact schema → no persistence
- unknown Relationship event → no state mutation
- unknown cue → no arbitrary asset resolution
- Purchase Intent minimal offer mapping snapshot mutation → hash mismatch/deny
- unresolved product→entitlement mapping (`SRC-18`) → no entitlement mutation
- unknown outbox schema → no silent consume
