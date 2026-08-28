# 명하 Shared API Contract v0.6 — Source Aligned

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.6**  
> Date: **2026-08-28**  
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
- `structuredAction`, Life Fact, Memory, event payload는 versioned discriminated schema를 사용한다.
- arbitrary `type:string + payload:unknown`을 command dispatch에 직접 사용하지 않는다.

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
deletion request  → requestDedupeKey
```

동일 key + 동일 canonical request → 기존 logical result, 동일 key + 다른 hash → `409 IDEMPOTENCY_CONFLICT` 규칙은 source가 canonical request/hash identity를 실제로 정의한 command에만 적용한다.

Guest merge는 ERD가 `(guest_subject_id, member_subject_id, idempotency_key)` uniqueness를 정의하지만 request hash/canonicalization, resolution 포함 request-shape 충돌, completed response-loss replay reconstruction을 정의하지 않는다. 따라서 `SRC-24` 해결 전 guest merge에 일반적인 same-key/same-hash replay 규칙을 임의 적용하지 않는다.

Share Artifact create는 Use Case §21.1의 explicit idempotency-required write 목록에 포함되지 않는다. 그렇다고 non-idempotent semantics가 source-backed인 것도 아니므로 create/retry/raw-token lifecycle은 `SRC-20` 해결 전 normative idempotency model에 넣지 않는다.

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

따라서 `SRC-24` 해결 전 임의 `MERGE_CONFLICT` detail schema, generic request-hash conflict model, Birth/Memory/Relationship/Unlock/Episode merge formula를 product authority로 만들지 않는다. Relationship projection 변환은 추가로 `SRC-22`, Character Unlock 변환은 `SRC-23`, Episode transition/effect 의미는 적용 범위에서 `SRC-17`이 필요하다.

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
label metadata 또는 새 birth revision command를 구분한 versioned action.

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

### `POST /api/reading-sessions/:sessionId/clarifications`

```ts
interface SubmitClarificationRequest {
  idempotencyKey: string;
  expectedCurrentReadingId: string;
  answers: ClarificationAnswerV1[];
}
```

새 `readings` clarification attempt를 append. transport retry와 구분.

### `POST /api/readings/:id/retry`
동일 logical reading의 transient execution retry만 수행. semantic clarification을 생성하지 않는다.

### `GET /api/readings/:id` / `GET /api/reading-sessions/:id`
Myeongha versioned Reading DTO + provenance summary. current birth revision mismatch 시 `stale=true`.

DB의 raw `reading_refs.response_snapshot_jsonb`를 그대로 client에 serialize하지 않는다. Saju public response의 legacy/internal brand field, internal-only provenance 또는 향후 contract field가 Myeongha API contract를 우회하면 안 된다. Protected consumer blocks/disclosures는 explicit projection schema를 통해 전달한다.

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
POST   /api/life-record
PATCH  /api/life-record/:id     # superseding fact append, not raw overwrite
DELETE /api/life-record/:id     # revoke/deletion workflow semantics
```

Mutation은 fact schema version + expected current lineage state를 요구한다.

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

### Memory Proposal

```text
POST /api/memory/proposals/:id/accept
POST /api/memory/proposals/:id/reject
POST /api/memory/proposals/:id/session-only
```

- `accept`: long-term Life Fact/Memory + explicit grants.
- `reject`: 장기 저장 없음.
- `session-only`: 장기 Life Fact/Memory로 승격하지 않고 active thread ephemeral context에만 사용. `SRC-05` 해결 전 proposal staging payload를 장기 shadow record로 유지하는 구현도 금지.

`accept` grant choice:

```ts
type GrantChoice =
 | { mode:'character_only'; characterId:string }
 | { mode:'current_characters' } // approval-time currently accessible character snapshot
 | { mode:'private' };
```

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

Use Case의 공식 API 목록은 notification preference/inbox를 정의하지만 Device Installation register/revoke HTTP route 이름 자체는 명시하지 않는다. 아래 두 route는 Pack의 supporting surface 후보이며, source-backed DB/lifecycle 의미와 분리해 본다.

```text
POST   /api/device-installations/register      # SRC-19 BLOCKED
POST   /api/device-installations/:id/revoke    # supporting route candidate; revoke behavior source-safe
GET    /api/notifications
POST   /api/notifications/:id/read
GET    /api/notification-preferences
PATCH  /api/notification-preferences
PATCH  /api/notification-preferences/preview
```

`SRC-19` 해결 전 register endpoint를 production-authoritative contract로 승격하지 않는다. Source는 active identity/token uniqueness와 cross-subject revoke-before-rebind는 정의하지만 same-subject retry, token rotation, revoked-row re-registration, row lineage, observation-field refresh, concurrent registration identity를 정의하지 않는다.

Standalone owner-scoped revoke DB command는 이 gap과 독립적으로 유지할 수 있다. Push token registration이 향후 승격될 때도 subject ownership + installation/token uniqueness는 server가 검증해야 한다.

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
POST /api/data-deletion-jobs
GET  /api/data-deletion-jobs/:id
POST /api/account/delete
```

`/api/account/delete`는 재인증 후 account-scope deletion job을 생성하고 즉시 capability/share/device/scheduled notification 차단 단계를 시작한다. 실제 retention은 `OPEN-P0: P0-PR-01`.

## 18. Admin / Content Operations

Canon authoring은 Git PR이 authority. Admin API는 operational publish/release만 수행한다.

```text
POST /api/admin/content/bundles/register
POST /api/admin/content/releases
POST /api/admin/content/releases/:id/activate
POST /api/admin/content/releases/:id/retire
POST /api/admin/threads/:id/content-transition   # governed migration only
```

`ADMIN_CONTENT` authorization + audit actor ref 필수. `SRC-01` 해결 전 per-character/episode runtime override endpoint는 만들지 않는다.

## 19. Versioning / Compatibility

- additive change 우선
- breaking change → new API contract version
- unknown required action/cue → compatibility gate
- remote content requires minClientCapability
- version negotiation 결과는 response meta에 기록

## 20. Pagination / Ordering

- messages: `(thread_id, sequence_no)` cursor
- notifications: `(scheduled_at,id)` cursor
- readings/history: `(created_at,id)` cursor
- offset pagination은 append-heavy stream 기본값으로 사용하지 않는다.

## 21. Contract Test Gate

- 모든 endpoint unknown field policy
- Web/Mobile same fixture same schema
- cross-user resource probe denial
- guest bootstrap/promote
- existing-Member merge-job current read + direct merged guest history authorization
- full guest→existing-Member conflict/resolution/domain-action execution remains blocked until `SRC-24`
- chat retry + abandon
- reading clarification + transient retry 구분
- target-person CRUD isolation
- session-only memory no long-term row
- grant revoke context exclusion
- Device Installation standalone revoke ownership/lifecycle
- Device Installation register/re-register/token-rotation contract remains blocked until `SRC-19`
- public Share active/unexpired read cannot authorize private Reading
- Share owner revoke immediately blocks public access
- Share create positive snapshot/retry/raw-token/expiry contract remains blocked until `SRC-20`
- conversation delete duplicate transcript redaction (`SRC-14` resolved before write contract promotion)
- account deletion command
- admin release authorization
- old client capability fallback
- purchase intent minimal offer mapping snapshot + idempotency
- purchased product→grant target remains blocked until `SRC-18`
- entitlement event apply/aggregate recompute remains blocked until `SRC-21`
- expired stored entitlement projection cannot authorize access after `effective_valid_until`
