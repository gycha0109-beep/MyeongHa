# RR-03/04 Official Reader Assistant provenance — existing-table feasibility / approval gate

**Watchtower-Track:** db-authority-core  
**Status:** EVIDENCE REVIEW / WRITER + ANCHOR BLOCKED / PUBLIC OFF  
**Observed main:** `600f55d24ca8450a0d947db5715b28333aa2ca7f` (2026-10-11 KST)  
**Tracking:** #1884, #1827, #1893, #1930, P0-PR-01 #964

This record is a **technical compatibility review**, not Product/Privacy Owner approval. Nothing in it grants an API role permission, changes a privacy disposition, or authorizes a positive Reader response.

## 1. Existing sources inspected

| Source | Verified authority / missing RR-03 property |
| --- | --- |
| `0040_conversation_core.sql` | `conversation_messages` has exact (message, turn, subject) FK and a general `message_payload_jsonb`. There is no native Reader+Official Reading+Saju Unit+Semantic Guard validated origin contract in this message row. |
| `0220_chat_attempt_commit_commands.sql` + `0221_chat_commit_name_resolution.sql` + `1370_chat_legacy_relationship_effect_retirement.sql` | Validated Attempt → Assistant Message, Outbox, Turn state change is one PostgreSQL transaction, with replay control. Current `cmd_commit_chat_turn_v1` is a compatibility wrapper over the legacy transaction, not an Official Reader Writer. |
| `cmd_mark_chat_turn_generated_v1` / `cmd_validate_chat_turn_attempt_v1` | They verify `ai_execution_logs` and `ai_execution_groundings` with UUID refs. Their `grounding_refs_jsonb` cannot carry the Saju-owned `grounding_unit_<24 lowercase hex>` evidence. Guard execution log success by itself is not an Official Saju Semantic Guard PASS. |
| `1490_seyeon_production_chat_execution_runtime_v1.sql` | Narrow Se-yeon chat role, RLS and lifecycle. Its authority must not be broadened to a separate official Reader path by merely allowing arbitrary `message_payload_jsonb`. |
| `1220` / `1240` / `1270` Reader migrations | Official Reading binding, Reader interpretation and current access metadata exist; they are not per-Assistant immutable Saju Unit verification artifacts. Exact Reader Grant can change after old messages were generated. |
| `1530_character_reading_artifact_durable_commit_v1.sql` | Face-only artifact. No cross-engine provenance alias. |
| `official-reading-reader-admission-v1.ts` and RR-09 fresh revalidation (PR #1938) | Server-side HOLD checks live identity / Release / Product / Artifact / Grant, but no DB atomic Writer or grant/revoke T2 linearization. The WeakSet-attested in-process proof is not persisted DB evidence. |
| `postgres-standard-followup-anchor-v1.ts` | Read adapter exists. Its queried SQL function and authoritative stored answer do not exist on main. Fail-closed behavior on unavailable function remains required. |

## 2. Candidate A — existing approved tables

**Current verdict: NOT PROVEN SAFE; do not ship based on arbitrary JSON.**

The `conversation_messages.message_payload_jsonb` / `chat_turn_attempts.validation_result_jsonb` columns could hold new strings syntactically, and `conversation_messages` is already classified DELETE by P0-PR-01. Neither fact proves Official Reader provenance:

1. The generic messages have no database-enforced same-row source identity linking a committed Assistant to exact Official Reading, source response hash, grounding hash, admitted Unit closure, Reader Release and Product/Policy version.
2. The existing Attempt validation evaluates a distinct AI UUID/log contract. A JSON object marked `semanticGuardPass: true` or a transcript claim can be caller-controlled and must not be trusted as a server-issued RR-06/09 proof.
3. The generic Chat Commit does not re-read and lock the exact active Grant, Reader Release, Product Rule and source artifact inside its own commit transaction. A successful RR-09 preflight before the transaction does not cover revoke/refund/Release changes while committing.
4. Stored message JSON may be visible via ordinary Chat read paths; an immutable, private, source-attributed proof needs bounded reader-specific select/execute privileges, permitted redaction/delete semantics and forced non-BYPASSRLS verification.
5. The replay contract needs the original Attempt + Message + exact same source identity (not merely same `turn_id`), with failure rollback of both message and proof. The current replay's message existence check alone cannot attest this.
6. Subject privacy dispositions being approved at **table** granularity does not independently approve unrestricted addition or exposure of a new personal-data class. Account-deletion finalizer and recovery behavior must still be verified for the chosen storage surface.

An existing-table solution may be reconsidered only with a concrete forward-only DB and API design proving a **trusted server-attestation binding**, same-transaction atomic commit, immutable stored source evidence, exact Reader isolation, current Grant/revoke/release lock ordering, SQL ACL/RLS, and populated-row deletion/restore behavior in PG15/17. None of these is established by the current generic JSON columns.

**No existing-table Writer or query was approved or added by this review.**

## 3. Candidate B — dormant sidecar, PR #1930

Draft PR #1930 proposes `official_reader_assistant_saju_provenance`. Isolated DB schema/ACL checks were previously reported, but no Writer/Anchor query was implemented.

Its six new Subject-reachable graph edges increase approved inventory from **59 tables / 140 edges** to **60 / 146**. Approved P0-PR-01 graph SHA-256 is:

`c745bacb0e9b2d13013c1048fc4273203af68b9c4816eef7b6c9fe37e4db167b`

The proposed unapproved graph fingerprint is:

`c8027aeaf8c137d7d1629c200ed86960537ca99ddb9202a6025e3a7b9fd2fb2f`

The approved disposition is currently 46 DELETE / 4 ANONYMIZE / 9 RETAIN. Neither the disposition JSON nor `scripts/verify-approved-account-deletion-policy.mjs` may be modified to silently adopt 60 tables.

**Additional forward-only migration collision:** Main already has `1660_member_reader_existing_thread_locator_v1.sql`. The Draft proposes `1660_official_reader_assistant_provenance_storage_v1.sql`. Both resolve to Supabase migration version `1660`, regardless of filename suffix. If the schema is later approved, allocate a fresh unused version and rebuild the exact catalog/graph/CI evidence. A new read-only `verify-supabase-deployment.mjs` check now rejects duplicate versions before deploy.

## 4. Required P0 approval and implementation gates

The Product/Privacy Owner (not this DB Worker) must decide:

- whether the newly derived per-Assistant Saju source lineage is a permitted personal-data class and, for a new table, the explicit DELETE/ANONYMIZE/RETAIN classification;
- the 6 new FK subject graph edges and exact deletion ordering, with populated Assistant / Reader / Reading rows, no dangling FK and no unauthorized retention;
- actual deletion finalizer execution and the exact limited backup/recovery/restore replay scope, including non-resurrection of revoked Reader source material;
- a versioned replacement policy authority, matching graph fingerprint and tests — no retroactive false claim that #964 approved a 60th table.

After approval, the DB owner must verify:

1. server-issued RR-06 Semantic + Output Guard proof bound to RR-09 refreshed identity, exact source units/closure and utterance hash;
2. true PostgreSQL transaction wrapping the existing Chat validated Attempt → Assistant Message+Outbox plus immutable provenance; rollback, replay, concurrent same-turn attempts;
3. current Grant, refund, Reader Release/Bundle/Revision, Reading source and Product Rule under a documented DB locking protocol with no cross-transaction TOCTOU;
4. latest eligible committed Assistant query under exact Subject/Thread/Reader/Reading, fail closed on any late bad/stale/revoked answer instead of silently returning an older answer;
5. negative role/RLS/EXECUTE checks, cross-subject/refund/race tests, deletion/recovery and PG15/17 full CI.

## 5. Separate production incident (not RR-03 authority)

At main `18ec827cfde6a57e870910f8485621684fc4b5a3`, Production Supabase deploy run `38086340302` failed with `HOLD_OUT_OF_ORDER_RELATIONSHIP_HISTORY` and explicitly executed **no** migration repair, dry-run or push. This relates to the governed Se-yeon relationship history/backfill line (#1941), not evidence that a Reader provenance schema may be bypassed. Do not repair or enable Production DB as a side effect of this track.

## 6. Closeout

**Completed independently:** current source contract review, new migration-version collision negative regression and deployment-config guard.  
**Still blocked:** RR-03 Writer, RR-04 query, real Postgres provenance E2E, #1827 final grant/revoke atomics, sale/LLM/Reader public activation.  
**Exit:** owner-approved policy and actual transactional PG evidence, not schema existence or mock-only tests.
