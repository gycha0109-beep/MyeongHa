# Se-yeon Commit / Controlled Reveal — Memory revocation window assessment (security v1)

Watchtower-Track: security
Status: **SHADOW-only guard / production publication HOLD**
Refs: PR #1835; paid model evaluation #1816

## Verified present-day execution paths

- `production-seyeon-chat-runtime-v1.ts` declares `publicRoute: null`, `routeMounted: false`, `relationshipMode: WRITE_DARK`, `postTurnExecution: DEFERRED`.
- `runSeyeonProductionChatExecutionV1` composes personal record context, calls the native AI providers, then `persistGenerated` -> `persistValidated` -> `commitTurn`. The server's read port is wrapped in **separate canonical-Subject PostgreSQL transactions** for Context and Chat persistence; they are not a single transaction spanning inference.
- The deployed personal-record projector registry (`SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1`) is empty, pending SRC-25. Authorized positive Memory/Fact projectors are an **unapproved future capability**, not an existing live Memory injection.
- The generic Official Standard Reader A3 preflight explicitly says its result does **not** authorize generation, commit, replay or reveal, and that a separate atomic final check is required. It is not the same runtime path as the Se-yeon dogfood path.
- Last integrated real PostgreSQL test (`test/db/reader_memory_tenant_boundary_v1.sql`) verifies **a new DB read** stops seeing a revoked Reader grant or revoked Memory. This does not retract previous content from an in-flight AI call.

## New security shadow evaluator

`apps/api/src/seyeon-personal-record-publication-shadow-v1.ts`:
- accepts an already **server-composed** context and *separately* requests **current** `readPersonalRecords` for the same canonical Subject / Se-yeon identity;
- extracts only previously admitted, exact Memory/Fact `recordId` and `grantId` source references, and rejects malformed or duplicate references;
- rejects an originally admitted grant after it is revoked or replaced by a different `grantId`, even if the Memory ID remains unchanged;
- rejects DB errors and duplicate current-authority rows; returns non-sensitive decision metadata for both `before_commit` and `before_reveal`;
- never exposes `permitsPublication:true`; `eligible_for_further_atomic_check` **cannot** unlock a real commit or reveal.

Unit tests construct a server-authorized hypothetical projector context (Production registry remains empty), then revoke/replace the grant before a fresh read. Injected role/Subject/grant instructions in the Memory body cannot change the pinned source reference. No paid model call or new CI workflow.

## Unresolved critical race (not approved to enable)

The shadow evaluator is not attached to a real publication entry point. A stale-read gap remains even with sequential rechecks:

`context read -> AI generation -> recheck -> [concurrent revoke] -> DB commit -> [concurrent revoke] -> HTTP reveal/replay`

**Mandatory future final authority** (character-memory and Reader owners, with security signoff):
1. Server-owned, non-client-writable grant evidence must be pinned at Context admission and durably associated with the turn/attempt. Never trust model-generated source references or caller text.
2. A transaction-scoped `Commit` gate must recheck every actually used record/grant, Subject/Reader binding, revoked item, and (where applicable) product/official reading grant. The recheck and commit need appropriate PostgreSQL row/advisory locking or a monotonic revocation epoch / CAS fencing contract. A SELECT followed by a separate transaction is insufficient.
3. `Controlled Reveal`, **including committed replay**, needs its own server-authorized current access gate. Decide whether the response is completely withheld/regenerated from safe context if any pinned grant is revoked; do not leak partial generated text or use an extra paid model call as an emergency fallback.
4. Specify and test revocation semantics during an active HTTP response/stream; already-delivered bytes cannot be retroactively removed. Explicitly define linearization point and error UX with Product/Reader owners.
5. Test deterministic interleavings and PostgreSQL two-session revoke/commit lock contention; run CI on existing workflows only. Require follow-up review of mutable schema/type/payload and non-personal sources, which this first shadow comparison does not cover.
6. Current Production Writer's `committed_replay` path returns stored text. A gate covering only new generation is not enough.

## Exit gate

- A / PASS: deterministic *shadow* false-allow tests for revoked/regranted/malformed records; existing CI + exact-head Integration.
- B / HOLD: actual production Commit/Reveal/replay transactional authorization and live Reader pipeline binding.
- C / FAIL: enabling personal projectors, routing paid AI, making the shadow result authorize publication, adding new workflow, or breaking existing authority/Commerce/Saju.
