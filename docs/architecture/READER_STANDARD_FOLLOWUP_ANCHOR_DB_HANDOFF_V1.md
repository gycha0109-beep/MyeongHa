# A3-θ Official Standard Follow-up Anchor — DB Authority Handoff

**Watchtower-Track:** reader-runtime  
**Status:** Reader-side read-only port implemented; DB-owner production source and write/commit integration **HOLD**.  
**Public Reader Chat:** OFF.

## 1. Verified current state

- `apps/api/src/character-standard-reading-chat-followup-evidence-v1.ts` requires a latest `committed_semantic_guard_pass` assistant anchor, bound to Subject × Thread × Reader × Reading, immutable official artifact and Saju grounding hashes and authorized `grounding_unit_*` refs.
- The current Se-yeon production execution passes `groundingRefs: []`. Existing `chat_turn_attempts.grounding_refs_jsonb` and `ai_execution_groundings` use **AI grounding UUID identities**, not Saju `grounding_unit_<24 lowercase hex>` ids. They are not a legitimate source for official Reader follow-up anchors.
- `standard_reading_reader_interpretations` (migration 1220) stores logical interpretation identity, **not** validated assistant message Unit evidence.
- No DB-backed production `readLatestValidatedAnchor` query with the required atomic validated origin has been found. Therefore no historical Se-yeon prose, UI state, AI model, or unverifiable metadata can be promoted to an Official Reader grounding anchor.

## 2. Dormant Reader-side port

`createPostgresStandardFollowupAnchorAuthorityPortV1(client)` is transaction-scoped and read-only. It calls **only**:

`public.qry_official_reader_followup_anchor_runtime_v1(subject_id uuid, thread_id uuid, reader_character_id text, reading_ref uuid)`

This **function is proposed, not created in this PR**.

Required result (0 or 1 row only):
- `status = 'committed_semantic_guard_pass'`
- `subject_id uuid`, `thread_id uuid`, `reader_character_id text`, `reading_ref uuid` matching all four query arguments
- `official_artifact_response_hash` = `sha256:v1:<64 lowercase hex>` bound to the official source
- `grounding_hash` = 64 lowercase hex from source-owned Saju projection
- `assistant_message_id uuid` for the **committed** assistant message in this exact Thread, Subject, Reader and Reading, with a valid output guard pass
- `source_unit_refs text[]` = 1–12 unique, ordered, source-admitted `grounding_unit_<24 lowercase hex>` refs
- `focused_unit_ref text | null` only if previously validated to be one of `source_unit_refs`. Null is valid; the selector then requests clarification for multi-Unit anchors.

Return 0 rows only when no eligible committed anchor exists. Return no raw article, prompt, or arbitrary message body. Do not select an older eligible result if a later result is revoked/stale/replaced without an explicit, approved rule.

## 3. DB-owner mandatory authority contract

DB owner must review and implement the actual source, preferably an atomic immutable provenance artifact written inside the governed official Reader **validated commit** path. A SQL query that merely joins Chat text to untrusted `validation_result_jsonb` or trusts model-authored `sourceUnitRefs` is insufficient.

Before returning a positive row the query MUST:

1. Assert `current_myeongha_subject_id() = p_subject_id` within a verified transaction; no anonymous/public execution.
2. Re-read the **current** exact Standard Reader access Grant (including refund/revocation/expiry), approved Product rule, official Reading source hash, pinned Thread active Release/Bundle/revision and Reader participant. Use the approved source-owner authority bindings, not guessed lifecycle booleans.
3. Locate the latest eligible **committed assistant message** for that Subject/Thread/Reader/Reading. Trace its exact attempt, generated message, output-guard success, semantic-guard success, official artifact/source hash, groundingHash and admitted Unit set to immutable, source-attributed validation evidence.
4. Check the Unit refs really belonged to that authorized source-owned Grounding with required companions/disclosures; otherwise return no authority (or raise). No inferred mapping from AI UUID groundings.
5. Reject stale/replaced semantic evidence; prevent cross-Subject, cross-Reader, cross-Reading and cross-release replay.
6. Treat query as an **admission read, not Commit/Reveal authorization**. The future guarded Commit must independently perform atomic current state/Grant/Product validation inside its own transaction.
7. Restrict `EXECUTE` to the approved authenticated Reader runtime role only, pin `search_path`, use explicit ownership and RLS/tenant assertions, revoke PUBLIC/anon/authenticated direct SQL access, and test database-level negative cross-tenant and revoked proof cases.

Recommended DB delivery: separate DB-owned migration/PR and integration tests, then verify the Reader adapter against a real PostgreSQL role and provenance fixture before production wiring. This handoff does not authorize any migration or policy change within the Reader track.

## 4. Failure contract

- No eligible evidence → `null` → clarification required.
- Missing query function, insufficient privilege, DB transport error → `ACCESS_DENIED`.
- More than one row, mismatched identity, unvalidated status, invalid hash/Unit/focus → `INVALID_PROVENANCE`.
- Malformed caller identity → `INVALID_INPUT`, no SQL query.
- All errors are fail-closed. Public Chat remains OFF until the later Output Guard/Commit/E2E gate.

## 5. Acceptance

**A** — Reader port and isolated security tests pass CI; no invented official evidence.
**B** — Actual DB-owner function and atomic writer not implemented: operational anchor read / public Chat **HOLD**.
**C** — Wrong-tenant/Reader/Reading data returned or stale/LLM-generated Unit promoted: release blocker.

**Next owner step:** DB authority agrees on stored validated Unit provenance + query implementation and real PostgreSQL test. Reader track can independently build a conservative question-scope classifier and the protected-only response builder without pretending those are full production Chat authorization.
