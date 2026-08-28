# SRC-20 — Share Artifact Create / Public Projection Authority

> Status: **OPEN / BLOCKING for production `POST /api/share-artifacts`**  
> Domain: Share / Reading privacy projection  
> Source authority reviewed:
> - `Usecase_re_reviewed_v2(1).md`
> - `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`
> - `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`

---

## 1. Gap

Primary source requires a revocable public-safe snapshot of an exact Reading attempt, but it does not define enough positive projection and create/retry semantics to promote `POST /api/share-artifacts` as a production-authoritative command.

The source fixes the privacy **exclusions** and persistence envelope. It does not fix the exact versioned public payload that is allowed to leave the private Reading boundary, nor the lifecycle needed when a create request is retried after a server commit or response loss.

## 2. What source authority already fixes

UC-16A defines:

```text
user selects Share
→ server projects shareable fields only
→ creates Share Artifact
→ emits opaque public token or platform share payload
→ user shares link/image
→ user may revoke at any time
```

Public projection rules include:

```text
no raw Birth Profile ID
birth time / real name hidden by default
no Conversation / Memory automatic inclusion
no Target Person internal ID
public token must be hard-to-guess opaque identifier
public token must not authorize private Reading API
revoke blocks later public access
artifact pins the Reading revision/version at creation time
analytics must not record shared-person private data
```

ERD v0.6 defines the durable envelope:

```text
share_artifacts
- id
- subject_id
- reading_id                 # exact immutable attempt pin
- public_token_hash          # version-prefixed keyed hash
- artifact_version
- snapshot_jsonb             # public-safe projection
- snapshot_hash              # version-prefixed digest
- status                     # active | revoked | expired
- expires_at
- revoked_at
- created_at
```

and unique/FK/lifecycle constraints.

The repository already has source-safe boundaries for:

- owner-scoped `cmd_revoke_share_artifact_v1`;
- public token-hash lookup through `qry_public_share_artifact_v1`;
- active + unexpired public read only;
- no subject/Reading/token/hash provenance leakage through the public read query.

## 3. Missing authority

### 3.1 Positive public snapshot schema

Source states what must not leak, but does not define the complete positive `snapshot_jsonb` contract for any `artifact_version`.

Missing decisions include:

```text
which Reading fields/blocks may be copied
whether section ordering/labels are stable contract
how compatibility/two-person Reading is represented publicly
whether display names may be included and under what explicit user choice
whether birth date or derived chart values are public-safe
how qualifiers/disclosures/ambiguity are represented
which character framing/content metadata may be included
whether images/cards and URL payload use the same snapshot contract
```

A blacklist-only implementation is insufficient because future Reading fields could silently become public. Production sharing needs an allowlisted versioned projection.

### 3.2 Reading eligibility for share creation

The Share Artifact FK pins any owned Reading row, but source does not explicitly define which Reading lifecycle states are eligible for creation.

The command must not infer whether `pending`, failed, clarification-required, or otherwise non-final Reading attempts may produce an artifact merely because an FK exists.

### 3.3 Create retry / idempotency authority

Use Case §21.1 explicitly enumerates writes that must support an idempotency key:

```text
chat turn
relationship event
Saju reading creation
memory acceptance
purchase/receipt verification
character unlock
```

Share creation is not in that list.

The current Pack previously promoted:

```text
share create → idempotencyKey
```

without source authority. Conversely, declaring Share create intentionally non-idempotent is also not source-backed because a mobile retry after commit/response loss can create an additional active public artifact.

Source must decide the logical create identity and retry behavior rather than the Pack inventing one.

### 3.4 Raw public-token response lifecycle

ERD stores only `public_token_hash`; the raw opaque token is an API-boundary secret/capability value.

On a create retry after the first DB commit, source does not define how the API can return the same logical public token if the raw token is not durably stored.

Possible designs have materially different privacy/security consequences:

```text
A. non-idempotent create: each successful call creates a new token/artifact
B. idempotent create: durable encrypted/recoverable token material or another replay mechanism
C. client-provided high-entropy token proof with server fingerprinting
D. separate one-time response/recovery protocol
```

The Pack must not select one without source authority.

### 3.5 Expiry policy

ERD allows `expires_at NULL`, and `status='expired'` only when expiry exists, but source does not define:

```text
whether new shares expire by default
whether caller may request expiry
allowed expiry bounds
whether clock expiry is projection-only or also materializes status='expired'
```

Public read can safely fail closed on `expires_at <= now` without solving the create policy.

## 4. What the implementation must NOT invent

Until SRC-20 is resolved, do not claim a production-authoritative Share create command that:

- copies arbitrary or blacklist-filtered Reading JSON into `snapshot_jsonb`;
- invents a `ShareArtifactV1` positive payload without source approval;
- assumes every owned Reading lifecycle state is shareable;
- silently requires `idempotencyKey` because the Pack previously listed it;
- silently declares create non-idempotent;
- persists raw public tokens in plaintext to support replay;
- resurrects/reuses revoked artifacts for a new share action;
- invents a default expiry or caller-controlled expiry contract.

## 5. Current safe boundary

Source-complete and already implementable:

```text
share_artifacts relational envelope
immutable Reading/token/snapshot identity once created
owner-scoped revoke
active/unexpired public minimized-snapshot read
raw token → API keyed fingerprint → DB lookup boundary
public token is not private Reading authorization
account deletion can revoke existing shares
```

Blocked:

```text
POST /api/share-artifacts
→ select/validate exact public projection
→ create/retry/token-return lifecycle
```

A lower-level persistence helper that accepts already-governed values would not close the product command, because the missing authority is precisely how those values are governed and replayed.

## 6. Required source resolution

Source authority should define at minimum:

1. versioned allowlisted Share snapshot schema;
2. exact source Reading eligibility state(s);
3. whether one Reading may intentionally have multiple active Share Artifacts;
4. create logical identity and retry/idempotency behavior;
5. raw-token generation and replay/recovery boundary;
6. whether/how expiry is selected and materialized;
7. explicit handling of real name/birth-time fields that are only described as hidden **by default**;
8. compatibility/Target Person public representation without internal identifiers.

## 7. Verification gate after resolution

At minimum:

- only allowlisted fields enter the public snapshot;
- forbidden Birth/Conversation/Memory/Target internal identifiers never enter snapshot or analytics;
- snapshot is pinned to the exact source Reading attempt/version;
- public token is opaque/high-entropy and DB stores only the source-approved protected representation;
- public token cannot authorize private Reading endpoints;
- create retry follows the resolved source semantics without orphan/duplicate authority surprises;
- cross-user Reading share creation is denied;
- revoke immediately blocks public lookup;
- expired artifact is unavailable even if status materialization lags;
- immutable snapshot/token identity cannot be rewritten after creation;
- future Reading schema additions do not automatically become public.

## 8. Relationship to existing Share boundaries

```text
GET /s/:publicToken                 = source-safe public read boundary exists
DELETE /api/share-artifacts/:id     = source-safe revoke behavior exists
POST /api/share-artifacts           = SRC-20 OPEN
```

SRC-20 does not invalidate existing stored-schema, public-read, or revoke tests. It blocks promotion of the create workflow only.