# Character Working Memory Retrieval v1

> Watchtower-Track: character-memory  
> Status: READ-ONLY RETRIEVAL CORE IMPLEMENTED / PHASE 3 INCOMPLETE  
> Parent runtime track: PR #3068  
> Date: 2026-11-07

## Purpose

Provide one server-side, provider-neutral retrieval entrypoint for a canonical Subject, selected Character and server-bound thread. The implementation reuses existing Life Fact, Memory Item, grant, relationship and conversation authorities. It does not create a new memory store or write path.

## Permission and source order

1. The existing Capability Gate is evaluated before any authority port is called. Inputs must be resolved by trusted server code and include entitlement, user consent, content policy, world-state and client-capability decisions.
2. All database ports share the same Subject-bound transaction client. The SQL read functions assert the transaction-local Subject and reuse the current-owner/current-record and active exact-Character grant authorities.
3. Life Fact validity is checked against the same server `asOf` instant before projection. A future `valid_from` or expired `valid_to` row is excluded. Retrieval repeats the check as defense in depth.
4. Future source, grant or confirmation timestamps fail closed.
5. Character-private biography is not a source in this Working Memory path; its separate disclosure preflight remains mandatory before any private-source retrieval. Official Reading/Saju remains on the exact Reader Knowledge path and is excluded from this projection.

## Provenance

Migration `2350_reader_context_memory_retrieval_provenance_v1.sql` adds two server-only `SECURITY INVOKER` projections:

- `qry_reader_context_granted_life_facts_v2`: source kind, source message/merge references, grant reason/time, valid-from/to, confirmation and creation timestamps.
- `qry_reader_context_granted_memory_items_v2`: source kind, source turn/message/merge references and grant reason/time.

Both public v2 projections use SECURITY INVOKER and reuse the existing v1 current-owner and exact-Character grant authorities. Two restricted SECURITY DEFINER provenance helpers (`qry_reader_context_life_fact_provenance_v1` and `qry_reader_context_memory_item_provenance_v1`) revalidate the pinned Subject and exact active record/grant/Character identity before returning additional stored source fields. All four functions have PUBLIC and browser/service-role EXECUTE revoked; only `myeongha_api_executor` can execute them. The API executor receives **no new direct table SELECT privileges** on Life Facts or Memory Items. Missing source references remain NULL; no provenance is synthesized.

## Retrieval behavior

The current mode is `lexical+metadata`:

1. Normalize Unicode text and tokenize the exact current User message.
2. Remove callback-scaffold tokens from topical matching.
3. Rank candidates by explicit callback match, phrase match, lexical coverage, projector salience/relevance and source time.
4. When an explicit callback contains no topical tokens (for example, “지난번에 얘기했던 거 기억나요?”), allow a Memory-only fallback and prefer the most recent episode. Life Facts do not enter this fallback.
5. Return only selected records, their provenance and a retrieval trace. The server entrypoint does not return the full unselected projected-record list.

The retrieval result makes memory available to the Character; it does not require the Character to mention or announce that memory.

## Current limitations

The existing source fields support lexical relevance, projector relevance/salience, explicit callbacks and bounded recency. The current sources do not provide authoritative record-level links for relationship relevance, unresolved-thread weight, causal grouping, contradiction risk or repetition penalty. No semantic/vector index or proven causal graph is present in this slice. Those signals and infrastructures remain unimplemented rather than being inferred from prose.

The positive Life Fact/Memory projector registry remains server-owned and closed by default while SRC-25 is unresolved. This code does not enable `conversation_recall/v1` in Production.

## Verification scope

- Unit tests: lexical recall, no-match abstention (including topical callback with no matching source), explicit callback, generic callback fallback, multiple-session recency and topical relevance, one-record budget, valid-time exclusion, scope mismatch, unsupported-schema non-exposure, Capability Gate denial before source reads, exact current User message binding and selected-record-only output.
- PostgreSQL tests: v2 provenance, exact grant scope, cross-Subject denial, revoked-grant exclusion, superseded Life Fact exclusion and server-only EXECUTE privileges.
- Latest-commit CI verdict is a separate required completion condition; test presence does not imply a passing run.
- No Provider dispatch, paid inference, durable Memory write, grant mutation, relationship mutation, Production route or additional Character activation.
