# 명하 Shared API Contract v0.9 — Source Aligned

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.9**  
> Date: **2026-08-29**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`, `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`  
> Rule: source가 결정하지 않은 implementation-critical 사항은 `OPEN-P0`, 비차단 선택은 `CANDIDATE`, source 간 충돌/공백은 `SOURCE_AUTHORITY_GAPS.md` 또는 numbered source-gap 문서에 기록한다.

---

## 1. 목적

Web / iOS / Android가 동일 server authority를 사용하기 위한 command-oriented HTTP contract. DB row CRUD wrapper가 아니다.

## 2. Common Envelope

```ts
interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta: {
    apiContractVersion: string;
    requestId: string;
    serverTime: string;
    minimumSupportedClientCapability?: string;
    contentCapabilityVersion?: string;
  };
}

interface ApiError {
  ok: false;
  error: {
    code: ApiErrorCode;
    messageKey: string;
    retryable: boolean;
    detailSchemaVersion?: string;
    details?: Record<string, unknown>;
  };
  meta: { apiContractVersion: string; requestId: string };
}
```

`details`는 `SHARED_DOMAIN_CONTRACTS_SPEC.md`의 code별 schema만 허용한다. provider raw payload/secret/다른 user resource 정보 금지.

## 3. Authentication Modes

```text
PUBLIC
GUEST_SESSION
MEMBER
SERVICE_INTERNAL
ADMIN_CONTENT
```

Guest raw token은 API에서 fingerprint 검증 후 subject resolve. DB direct anon CRUD에 사용하지 않는다.

## 4. Input Strictness

- JSON object는 endpoint contract의 unknown top-level fields를 기본 reject한다.
- `structuredAction`, Life Fact, Memory, event payload는 source-approved versioned discriminated schema가 존재하는 범위에서만 실행 authority로 사용한다.
- arbitrary `type:string + payload:unknown`을 command dispatch 또는 durable personal-record persistence에 직접 사용하지 않는다.
- Life Fact/Memory positive type-schema registry는 `SRC-25` 해결 전 Pack example/interface로 대체하지 않는다.

## 5. Idempotency Model

Source-backed command identity가 정의된 endpoint만 아래 normative list에 둔다.

```text
chat              → clientTurnId
reading           → idempotencyKey
reading clarify   → idempotencyKey + expectedCurrentReadingId
memory resolution → idempotencyKey
episode action    → idempotencyKey + expectedRevision
purchase intent   → idempotencyKey
receipt/restore   → idempotencyKey or provider source dedupe
guest merge       → idempotencyKey + guestSession proof (logical uniqueness envelope only; SRC-24)
account deletion  → requestDedupeKey
```

동일 key + 동일 canonical request → 기존 logical result, 동일 key + 다른 hash → `409 IDEMPOTENCY_CONFLICT` 규칙은 source가 canonical request/hash identity를 실제로 정의한 command에만 적용한다.

Guest merge는 ERD가 `(guest_subject_id, member_subject_id, idempotency_key)` uniqueness를 정의하지만 request hash/canonicalization, resolution 포함 request-shape 충돌, completed response-loss replay reconstruction을 정의하지 않는다. 따라서 `SRC-24` 해결 전 guest merge에 일반적인 same-key/same-hash replay 규칙을 임의 적용하지 않는다.

Share Artifact create는 Use Case §21.1의 explicit idempotency-required write 목록에 포함되지 않는다. 그렇다고 non-idempotent semantics가 source-backed인 것도 아니므로 create/retry/raw-token lifecycle은 `SRC-20` 해결 전 normative idempotency model에 넣지 않는다.

ERD의 `data_deletion_jobs.request_dedupe_key` uniqueness는 storage envelope authority다. Account deletion을 제외한 generic cross-scope request의 request identity/replay/conflict contract는 `SRC-29` 해결 전 위 normative idempotency list로 일반화하지 않는다.

## 6. Error Code Baseline

```text
400 INVALID_REQUEST
401 AUTH_REQUIRED
403 FORBIDDEN
404 NOT_FOUND
409 IDEMPOTENCY_CONFLICT
409 REVISION_CONFLICT
409 TURN_IN_FLIGHT
409 STALE_READING
409 MERGE_CONFLICT
410 RESOURCE_GONE
422 CAPABILITY_UNAVAILABLE
422 NEEDS_CLARIFICATION
422 GROUNDING_INSUFFICIENT
422 CONTENT_INCOMPATIBLE
429 RATE_LIMITED
503 SAJU_TEMPORARILY_UNAVAILABLE
503 AI_TEMPORARILY_UNAVAILABLE
```

`MERGE_CONFLICT` code 이름을 유지할 수는 있지만, 해당 `details`의 positive schema/allowed resolution choices는 `SRC-24` 해결 전 source-backed contract로 승격하지 않는다.

Cross-user object probing의 403/404 외부 표현은 implementation security policy로 일관되게 고정하며 raw ownership 여부를 노출하지 않는다.

## 7. Bootstrap / Identity / Guest

### `POST /api/session/bootstrap`
Auth: PUBLIC 또는 existing guest/member token.

- 기존 valid identity가 있으면 재사용.
- 없으면 Guest subject + guest session을 server command로 생성.
- raw guest bearer token은 생성 시 한 번 client에 전달하고 DB에는 verifier fingerprint만 저장.

### `GET /api/me`
현재 resolved subject/profile summary.

### `PATCH /api/me/profile`
호칭/locale/timezone 등 product profile 수정. concurrency token 또는 `updatedAt` precondition 사용.

### `POST /api/auth/promote-guest`
신규 가입 후 same guest subject를 member로 승격. auth identity proof 필수.

### `POST /api/auth/merge-guest`
UC-32가 요구하는 existing-Member Guest claim route다. Guest ownership proof, one Guest Session→one canonical destination, no raw immutable-ledger reparent, explicit conflict resolution principle, merge-job/action audit envelope는 source-backed다.

그러나 production-authoritative full execution contract는 `SRC-24` 해결 전 승격하지 않는다. Source는 다음을 정의하지 않는다.

```text
participating domain/resource inventory
duplicate/conflict classification algorithm
conflicts_jsonb / resolution_jsonb positive schemas
legal user resolution choices
merge policy_version artifact/selection/retention
domain resource → retain_readonly|import_new|merge_projection|discard planning
per-domain import/merge transformation
stale resolution + partial failure/resume semantics
same idempotency key + different request/resolution behavior
completed response-loss replay reconstruction
deletion_pending member start/resume eligibility
```

따라서 `SRC-24` 해결 전 임의 `MERGE_CONFLICT` detail schema, generic request-hash conflict model, Birth/Memory/Relationship/Unlock/Episode merge formula를 product authority로 만들지 않는다. Relationship projection 변환은 추가로 `SRC-22`, Character Unlock 변환은 `SRC-23`, Episode transition/effect 의미는 적용 범위에서 `SRC-17`이 필요하다. 새 durable Life Fact/Memory import를 만드는 merge action은 추가로 `SRC-25` positive record schema authority가 필요하다.

### `GET /api/auth/merge-jobs/:id`
member-owned stored merge progress/conflict/result read-only projection. Existing `qry_subject_merge_job_v1` boundary는 `SRC-24`와 독립적으로 source-safe하다. 이 read는 merge start/resume 권한을 부여하지 않는다.

## 8. Home / Capability / Character

### `GET /api/home`
Guest/Member. resolved content release + subject current projections만 반환.

### `GET /api/capabilities`
`apiContractVersion`, client/content capability, Saju domain availability, P0-dependent feature availability를 반환.

### `GET /api/characters` / `GET /api/characters/:id`
subject/cohort/client capability에 resolve된 공개 projection만 반환.

## 9. Chat

### `POST /api/chat`

```ts
interface ChatRequest {
  threadId?: string;
  characterId?: string;
  clientTurnId: string;
  text?: string;
  structuredAction?: ChatStructuredActionV1;
  clientCapability: string;
}
```

Exactly one of meaningful text/action required. Character/thread resolution은 server가 한다. `structuredAction`은 대화 intent만 표현하며 episode/memory/retry 등 별도 aggregate command를 우회하지 않는다.

Flow:

```text
turn RECEIVED + authoritative user message
→ planner/gate/context/render/guard
→ atomic commit
→ controlled reveal
```

Planner/LLM이 `requiredLifeFactTypes`, record type, schema version 또는 proposed JSON을 출력해도 source-approved personal-record registry가 없으면 durable Life Fact/Memory authority로 승격하지 않는다. `SRC-25` 해결 전 example key나 free-form key를 저장 authority로 사용하지 않는다.

### `GET /api/chat/:threadId`
sequence cursor authoritative stream.

### `POST /api/chat/turns/:turnId/retry`
`failed_retryable` logical turn에 새 `chat_turn_attempts` row만 추가. committed turn 재생성 금지.

### `POST /api/chat/turns/:turnId/abandon`
사용자가 retryable turn을 포기해 다음 turn이 막히지 않도록 server transition. committed/delivered turn에는 적용 불가.

### `DELETE /api/chat/:threadId`
Conversation deletion workflow를 생성한다. Life Fact/Memory authority는 자동 삭제하지 않는다.

Baseline deletion semantics는 provenance FK를 깨지 않도록 thread identity를 tombstone으로 유지하고 삭제된 대화 원문이 Renderer context/UI에 다시 노출되지 않게 해야 한다. 그러나 현재 persistence model은 raw transcript-equivalent data를 `conversation_messages.body_text/message_payload_jsonb`뿐 아니라 `chat_turns.request_snapshot_jsonb`와 `chat_turn_attempts.generated_*`에도 보존하며, terminal attempt immutability가 lifecycle redaction exception을 정의하지 않는다.

따라서 `SRC-14` 해결 전에는 message row만 redaction하고 conversation deletion을 완료로 처리하는 구현을 금지한다. Source는 모든 durable duplicate의 redaction/tombstone 범위와 terminal attempt provenance를 보존하는 허용 mutation boundary를 정의해야 한다. Account-level destructive erase는 별도 deletion graph가 처리한다.

## 10. Birth / Target Person

### `POST /api/birth-profiles`
logical profile + first revision. self active profile 1개 constraint.

### `GET /api/birth-profiles/:id`
owner-authorized current + revision summary.

Standalone privacy deletion semantics는 `SRC-06` 미해결이므로 `DELETE /api/birth-profiles/:id`를 임의 확정하지 않는다. 단순 archive와 실제 개인정보 삭제를 동일시하지 않는다.

### `PATCH /api/birth-profiles/:id`
UPDATE가 아니라 append revision command.

```ts
{ expectedRevisionId: string; input: BirthInputV1 }
```

### `POST /api/target-persons`
owner-scoped target metadata + target birth profile/revision 생성.

### `GET /api/target-persons` / `GET /api/target-persons/:id`

### `PATCH /api/target-persons/:id`
Target Birth correction과 Target metadata edit를 같은 authority로 취급하지 않는다.

- Target Person이 소유한 linked target Birth Profile의 Birth 입력 수정은 기존 append-only Birth revision command boundary를 재사용할 수 있다. Caller는 Target Person ownership을 resolve한 뒤 source-backed `expectedRevisionId + BirthInputV1` precondition으로 새 Birth revision을 append한다.
- post-create `display_label` / `relationship_label` metadata mutation은 `SRC-28` 해결 전 production-authoritative contract로 승격하지 않는다. Source는 mutability, positive request schema, null/empty normalization, validation, concurrency/CAS, retry/idempotency, history/audit, deletion-race semantics를 정의하지 않는다.
- 따라서 Pack route가 하나라는 이유만으로 metadata update와 Birth revision append를 하나의 atomic versioned action으로 합성하지 않는다.

### `DELETE /api/target-persons/:id`
해당 target-person deletion workflow. reverse lookup/invite 금지. `SRC-06` 해결 전에는 target birth revision을 pin한 기존 compatibility Reading을 어떻게 처리할지 임의 확정하지 않는다.

## 11. Saju Reading

### `POST /api/readings`

```ts
interface CreateReadingRequest {
  idempotencyKey: string;
  domain: SajuDomain;
  sourceBirthProfileId: string;
  targetBirthProfileId?: string;
  characterId?: string;
  sourceTurnId?: string;
}
```

Server가 exact immutable revisions와 character participation/capability를 resolve한다. `SRC-08` 해결 전 real Saju adapter가 current public host에 second Birth snapshot을 소비한다고 가정하지 않는다. compatibility capability는 실제 Saju public contract/authority가 준비된 경우에만 available이다.

### `POST /api/reading-sessions/:sessionId/clarifications` — `SRC-33 BLOCKED`

이 route의 **relational command envelope**는 source-backed이지만, public request body의 positive validation contract는 아직 source-backed가 아니다.

현재 확정 가능한 것은 다음뿐이다.

```text
logical clarification command identity
→ idempotencyKey + expectedCurrentReadingId

already-validated canonical clarification continuation
→ same Reading Session에 새 immutable readings attempt append
→ prior Reading을 parent로 pin
→ transport retry와 분리
```

반면 다음은 `SRC-33` 해결 전 production-authoritative contract가 아니다.

```text
ClarificationAnswerV1 positive schema
question/answer identifier grammar
single/multi/free-text/structured answer representation
question-to-answer correlation rule
answer cardinality / duplicate / unknown-field handling
null/absent/coercion/canonicalization rules
clarification request hash material
pending clarification contract-version compatibility
validation-failure public error detail schema
```

따라서 기존 예시의 `answers: ClarificationAnswerV1[]`를 현재 executable request schema로 해석하지 않는다. `SRC-33` 해결 전 public route는 arbitrary JSON, UI example-derived body, caller-supplied free-form question/answer key를 받아 persistence command로 전달해서는 안 된다.

`public.cmd_append_reading_clarification_v1(...)`는 **source-approved application validator가 이미 검증·canonicalize한 request snapshot/hash를 전달한다는 전제의 lower-level persistence/concurrency authority**다. DB command의 존재는 public input validation authority가 아니다.

### `POST /api/readings/:id/retry`
동일 logical reading의 transient execution retry만 수행. semantic clarification을 생성하지 않는다.

### `GET /api/readings/:id` / `GET /api/reading-sessions/:id`
Myeongha versioned Reading DTO + provenance summary. current birth revision mismatch 시 `stale=true`.

DB의 raw `reading_refs.response_snapshot_jsonb`를 그대로 client에 serialize하지 않는다. Saju public response의 legacy/internal brand field, internal-only provenance 또는 향후 contract field가 Myeongha API contract를 우회하면 안 된다. Protected consumer blocks/disclosures는 explicit projection schema를 통해 전달한다.

`ProductReadingResponse`의 complete positive validation contract 역시 `SRC-33` 해결 전 미확정이다. Transport success나 JSON 저장 성공만으로 provider/raw-engine body를 product-semantically validated response로 승격하지 않는다.

## 12. Share

### `POST /api/share-artifacts`

Use Case가 요구하는 route이지만 production create contract는 `SRC-20` 해결 전 승격하지 않는다. Source는 공개 projection의 **금지 필드**와 relational envelope는 정의하지만, positive versioned snapshot allowlist, shareable Reading lifecycle state, create retry/idempotency identity, raw opaque token replay/recovery, expiry create policy를 끝까지 정의하지 않는다.

따라서 `SRC-20` 해결 전에는 임의 `ShareArtifactV1`, blacklist-only Reading JSON copy, `idempotencyKey`, plaintext/raw token durable storage, 또는 default expiry를 product authority로 만들지 않는다.

### `DELETE /api/share-artifacts/:id`
Owner-scoped revoke. 기존 source-safe revoke command boundary는 유지한다.

### `GET /s/:publicToken`
public-safe stored snapshot only; active + unexpired artifact만 허용하며 private Reading authorization이 아니다. Raw token은 API에서 source-approved keyed fingerprint/hash representation으로 변환한 뒤 lookup한다.

## 13. Life Record / Memory / Grants

### Life Fact

```text
GET    /api/life-record
POST   /api/life-record            # route required by Use Case; durable value create SRC-25 BLOCKED
PATCH  /api/life-record/:id        # supersession lineage source-safe; new value validation SRC-25 BLOCKED
DELETE /api/life-record/:id        # revoke/deletion workflow semantics
```

Source fixes the Life Fact history/provenance model and requires a fact-type-specific versioned validator. It explicitly says unknown fact type/schema version must not be stored long-term.

However source does not define the final normative `LifeFactType` allowlist or positive value schema. `employment_status/v1`, `relationship_status/v1`, and `planned_event/v1` are examples, not a production registry.

Therefore:

- existing Life Record read remains valid;
- owner-scoped revoke remains valid;
- same-type no-branch/no-cycle supersession lineage and concurrency remain valid;
- `POST /api/life-record` cannot production-authoritatively create an arbitrary new durable value before `SRC-25`;
- `PATCH /api/life-record/:id` cannot treat an unapproved type/schema/value as valid merely because the lineage transition is correct;
- generic `factType:string + schemaVersion:string + value:unknown` is not a production contract.

### Memory

```text
GET    /api/memories
DELETE /api/memories/:id
GET    /api/memories/:id/grants
POST   /api/memories/:id/grants
DELETE /api/memories/:id/grants/:characterId
POST   /api/characters/:id/forget
```

`forget`은 해당 캐릭터가 접근하는 active memory/Life Fact grants를 revoke하는 command다. shared memory item/Life Fact 원본이나 다른 캐릭터의 grants를 삭제하지 않는다.

ERD requires `memory_type` to be a versioned contract key and `content_jsonb` to be validated structured memory, but source does not define the final MemoryType/positive schema registry. Existing valid Memory reads/revokes remain source-safe; new durable Memory value creation is `SRC-25` gated.

### Memory Proposal

```text
POST /api/memory/proposals/:id/accept
POST /api/memory/proposals/:id/reject
POST /api/memory/proposals/:id/session-only
```

- `reject`: 장기 저장 없음.
- `session-only`: 장기 Life Fact/Memory로 승격하지 않고 active thread ephemeral context에만 사용. `SRC-05` 해결 전 proposal staging payload를 장기 shadow record로 유지하는 구현도 금지.
- `accept`: source principle requires exactly one long-term Life Fact OR Memory plus the approved visibility/grant result, but production-authoritative record creation requires `SRC-25` positive type/schema validation and applicable `SRC-10` grant authority.

`accept` grant choice envelope:

```ts
type GrantChoice =
 | { mode:'character_only'; characterId:string }
 | { mode:'current_characters' } // approval-time currently accessible character snapshot
 | { mode:'private' };
```

This grant-choice shape does not authorize an unregistered personal-record payload. `record_type/schema_version/proposed_value_jsonb` from a proposal is candidate input until validated by the source-approved registry.

## 14. Relationship / Episodes

### `GET /api/characters/:id/relationship`
current projection only. direct score update endpoint 없음.

### Episodes

```text
POST /api/episodes/:id/start
POST /api/episodes/:id/advance
GET  /api/episodes/:id/progress
```

write는 `idempotencyKey + expectedRevision` 필요.

## 15. Notifications / Installations

Use Case의 공식 API 목록은 notification preference/inbox를 정의하지만 Device Installation register/revoke HTTP route 이름 자체는 명시하지 않는다. 아래 두 device route는 Pack의 supporting surface 후보이며, source-backed DB/lifecycle 의미와 분리해 본다.

```text
POST   /api/device-installations/register      # SRC-19 BLOCKED
POST   /api/device-installations/:id/revoke    # supporting route candidate; revoke behavior source-safe
GET    /api/notifications                      # final inbox projection SRC-13 BLOCKED
POST   /api/notifications/:id/read             # explicit owned stored notification read command source-safe
GET    /api/notification-preferences           # stored-row projection only; effective missing-row defaults SRC-12 BLOCKED
PATCH  /api/notification-preferences           # SRC-12 BLOCKED
PATCH  /api/notification-preferences/preview   # SRC-12 BLOCKED
```

### Device installation lifecycle

`SRC-19` 해결 전 register endpoint를 production-authoritative contract로 승격하지 않는다. Source는 active identity/token uniqueness와 cross-subject revoke-before-rebind는 정의하지만 same-subject retry, token rotation, revoked-row re-registration, row lineage, observation-field refresh, concurrent registration identity를 정의하지 않는다.

Standalone owner-scoped revoke DB command는 이 gap과 독립적으로 유지할 수 있다. Push token registration이 향후 승격될 때도 subject ownership + installation/token uniqueness는 server가 검증해야 한다.

### Notification inbox read boundary — `SRC-13`

`notifications`의 persisted status vocabulary는 source-backed이지만, `GET /api/notifications`가 `queued | ready | read | cancelled | expired` 중 어떤 상태를 사용자 inbox에 포함할지는 Source가 정의하지 않는다.

따라서 기존 `qry_notification_stored_ledger_v1`처럼 owner-scoped **raw stored logical notification ledger**를 읽을 수 있다는 사실을 public final inbox contract와 동일시하지 않는다. 특히 다음을 임의 확정하지 않는다.

```text
visible status membership
read history 포함 여부
cancelled/expired history 노출 여부
queued scheduled item 선노출 여부
final inbox ordering/cursor
```

`SRC-13` 해결 전 `GET /api/notifications`를 production-authoritative final inbox projection으로 승격하지 않는다.

반면 `POST /api/notifications/:id/read`는 caller가 명시적으로 지목한 owned stored logical notification의 read-state command로 유지할 수 있다. 이 command가 존재한다고 해서 전체 inbox membership이 해결된 것은 아니다.

### Notification preference boundary — `SRC-12`

Persisted `notification_settings` / `notification_preferences` row 자체의 owner-scoped projection은 읽을 수 있다. 그러나 row absence를 effective preference object로 합성하는 규칙은 Source가 정의하지 않는다.

따라서 `GET /api/notification-preferences`가 stored rows만 반환하는 projection으로 사용되는 것은 가능하지만, 다음을 임의 default로 채우는 final effective-preference contract는 `SRC-12` 해결 전 금지한다.

```text
missing notification_settings.global_enabled
missing category preference.enabled
initial category materialization
exact default preview mode
new category existing-user default
```

`PATCH /api/notification-preferences`와 `/preview`도 Source가 missing-row materialization, insert-vs-update, idempotency와 category expansion semantics를 정하기 전 production-authoritative mutation으로 승격하지 않는다.

### Scheduler / provider internal authority

이 HTTP 목록에 autonomous scheduler create endpoint가 없다는 사실은 scheduler authority가 해결됐다는 뜻이 아니다. Candidate → cadence/frequency/eligibility → logical notification materialization은 `SRC-32`가 계속 막는다.

Likewise provider attempt persistence가 존재해도 installation/platform configuration에서 실제 provider를 resolve하는 production routing authority는 `SRC-31`이 계속 막는다. Public notification API가 이 내부 gap을 우회하지 않는다.

## 16. Commerce

```text
GET  /api/entitlements
POST /api/commerce/purchase-intents
POST /api/commerce/receipts/verify
POST /api/commerce/restore
```

### Source-complete boundaries

- Purchase Intent는 ERD source가 정의한 immutable minimal offer mapping snapshot과 version-prefixed digest를 pin한다.
- Verified receipt/provider-event provenance는 source ownership/dedupe constraints를 따른다.
- `GET /api/entitlements`는 이미 저장된 provider-independent logical projection을 읽고, access gate는 expired `effective_valid_until`을 wall-clock에서 fail-closed 해야 한다.

### Independent blockers

```text
P0-CM-01
→ provider/platform payment/receipt/restore rail

SRC-18
→ verified purchased product → entitlement_key/scope/grant_key target mapping

SRC-21
→ entitlement event payload/transition, stale provider ordering, grant validity predicate,
   active_grant_count/effective_valid_until aggregation, projection revision/outbox semantics
```

ERD §17.11의:

```text
lock/upsert grant
→ append event
→ update grant
→ recompute logical entitlement
→ outbox
```

는 transaction **skeleton authority**다. `SRC-21` 해결 전 이를 완전한 executable transition formula로 해석하지 않는다.

따라서 receipt verification/restore의 provenance ingest가 가능하더라도 **purchase→grant target→event apply→effective access mutation**은 필요한 `SRC-18`, `SRC-21`, `P0-CM-01` authority가 해결된 범위에서만 production-enable한다.

## 17. Account / Deletion

```text
POST /api/data-deletion-jobs       # generic non-account mutation: SRC-29 BLOCKED
GET  /api/data-deletion-jobs/:id   # owner-scoped stored job status read
POST /api/account/delete           # account-specific source-backed start transaction
```

`POST /api/data-deletion-jobs`는 ERD의 `scope` enum과 `target_resource_type/id` storage envelope만으로 production-authoritative generic command가 되지 않는다. `SRC-29` 해결 전 arbitrary `scope + targetResourceType + targetResourceId`를 받아 job row를 만드는 endpoint로 구현하지 않는다. Conversation은 추가로 `SRC-14`, Target Person은 추가로 `SRC-06`이 막고, Memory/Life Fact scope는 기존 direct revoke semantics와 generic job의 관계가 source-defined가 아니다.

`GET /api/data-deletion-jobs/:id`의 owner-scoped stored status read는 이 gap과 독립적으로 유지할 수 있다.

`/api/account/delete`는 UC-34가 별도로 정의한 account-specific authority다. 재인증 후 account-scope deletion job을 생성하고 즉시 capability/share/device/scheduled notification 차단 단계를 시작한다. 실제 retention은 `OPEN-P0: P0-PR-01`이며, `SRC-29`는 이 existing account-specific start boundary를 막지 않는다.

## 18. Admin / Content Operations

Canon authoring은 Git PR이 authority. Admin API는 operational publish/release surface 후보지만, production-authoritative mutation은 source-complete lifecycle contract가 있는 범위에서만 승격한다.

```text
POST /api/admin/content/bundles/register          # SRC-27 BLOCKED
POST /api/admin/content/releases                  # SRC-27 BLOCKED
POST /api/admin/content/releases/:id/activate     # SRC-27 + SRC-15 BLOCKED
POST /api/admin/content/releases/:id/retire       # SRC-27 BLOCKED
POST /api/admin/threads/:id/content-transition    # governed migration only
```

`SRC-27` 해결 전 bundle registration / release create / activate / retire / default-switch를 production-authoritative command로 구현하지 않는다. Source-backed relational release state와 immutable bundle/provenance, existing bundle/catalog/manifest projections, recorded active-default read는 유지할 수 있지만 write-side legal transition, validation/hash trust boundary, concurrency, retry/idempotency, timestamp, default replacement, admin audit persistence를 임의 합성하지 않는다.

Activation은 추가로 `SRC-15` client/content compatibility decision authority가 필요하다. Subject/cohort별 release resolution은 별도 `SRC-16` 경계이며 activation command가 이를 대신하지 않는다.

`ADMIN_CONTENT` authorization이 필요하다는 원칙은 유지하지만, authorization requirement 자체가 `SRC-27`의 missing positive lifecycle/audit command semantics를 해결하지는 않는다. `SRC-01` 해결 전 per-character/episode runtime override endpoint도 만들지 않는다.

## 19. Versioning / Compatibility

- additive change 우선
- breaking change → new API contract version
- unknown required action/cue → compatibility gate
- remote content requires minClientCapability
- version negotiation 결과는 response meta에 기록

For personal records, old/new schema compatibility cannot be inferred from the generic API version. Writable vs legacy-read behavior for Life Fact/Memory types is `SRC-25` authority.

## 20. Pagination / Ordering

- messages: `(thread_id, sequence_no)` cursor
- readings/history: `(created_at,id)` cursor
- final notification inbox membership/order/cursor: `SRC-13` 해결 전 normative contract로 확정하지 않는다. Raw stored notification ledger의 deterministic internal/read projection은 public inbox ordering authority가 아니다.
- offset pagination은 append-heavy stream 기본값으로 사용하지 않는다.

## 21. Contract Test Gate

- 모든 endpoint unknown field policy
- Web/Mobile same fixture same schema
- cross-user resource probe denial
- guest bootstrap/promote
- existing-Member merge-job current read + direct merged guest history authorization
- full guest→existing-Member conflict/resolution/domain-action execution remains blocked until `SRC-24`
- chat retry + abandon
- reading clarification relational append/current-pointer/idempotency boundary with an already-validated canonical fixture remains independently testable
- public clarification positive answer validation/correlation/canonicalization remains blocked until `SRC-33`
- transport success cannot promote an invalid/unvalidated `ProductReadingResponse`; product-semantic response validation remains blocked until `SRC-33`
- reading clarification + transient retry 구분
- target-person create/read isolation + owned Target Birth revision append
- post-create Target Person metadata mutation remains blocked until `SRC-28`
- Life Record existing stored read/revoke + Life Fact supersession lineage
- direct new durable Life Fact create positive type/value validation remains blocked until `SRC-25`
- Memory Proposal long-term accept positive Life Fact/Memory schema validation remains blocked until `SRC-25`
- unresolved/unknown personal-record type/schema → no durable persistence
- session-only memory no long-term row
- grant revoke context exclusion
- notification raw stored-ledger ownership/read projection remains independently testable
- final `GET /api/notifications` inbox status membership/order remains blocked until `SRC-13`
- explicit owned `POST /api/notifications/:id/read` remains independently testable
- stored notification preference projection remains independently testable; effective missing-row/default synthesis and preference PATCH mutation remain blocked until `SRC-12`
- autonomous notification trigger/cadence/frequency-cap/dedupe/template materialization remains blocked until `SRC-32`
- notification provider routing resolution remains blocked until `SRC-31`; provider-attempt persistence mechanics remain independently testable
- Device Installation standalone revoke ownership/lifecycle
- Device Installation register/re-register/token-rotation contract remains blocked until `SRC-19`
- public Share active/unexpired read cannot authorize private Reading
- Share owner revoke immediately blocks public access
- Share create positive snapshot/retry/raw-token/expiry contract remains blocked until `SRC-20`
- conversation delete duplicate transcript redaction (`SRC-14` resolved before write contract promotion)
- account deletion command
- stored deletion-job owner status read
- generic non-account deletion-job create remains blocked until `SRC-29`
- admin content bundle/release stored projections and active-default read
- admin content lifecycle mutation remains blocked until `SRC-27`; activation additionally requires `SRC-15`
- old client capability fallback
- purchase intent minimal offer mapping snapshot + idempotency
- purchased product→grant target remains blocked until `SRC-18`
- entitlement event apply/aggregate recompute remains blocked until `SRC-21`
- expired stored entitlement projection cannot authorize access after `effective_valid_until`
