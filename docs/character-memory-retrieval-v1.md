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
4. Future source, grant or confirmation timestamps fail closed. Invalid/undecodable source, grant, confirmation and Life Fact validity timestamps now **reject the read-only retrieval** rather than accidentally passing JavaScript's invalid-date comparisons; inverted Life Fact validity ranges also reject. A current User message dated after the pinned server as-of instant cannot retrieve records.
5. Character-private biography is not a source in this Working Memory path; its separate disclosure preflight remains mandatory before any private-source retrieval. Official Reading/Saju remains on the exact Reader Knowledge path and is excluded from this projection.

6. Canonical same-thread message sequence is also checked against its stored creation chronology before read-only Working Memory projection: a future-dated earlier message or a backward timestamp across ordered messages rejects the snapshot. Equal timestamps are accepted because the canonical sequence remains the ordering authority. System and other-Character excluded messages are checked too; this does not invent new message order or date authority.

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

## Canonical User-turn temporal source cutoff (offline, 2026-11-08)

An authorized record must not be newer than the exact canonical User turn being answered, **even when the server executes the read later**. Retrieval compares stored record creation, Character grant and Life Fact confirmation timestamps against both the server `asOf` instant and the canonical current message's creation time. A valid timestamp after the message (but not after the server instant) is excluded as `SOURCE_TIMESTAMP_AFTER_CURRENT_TURN`; a timestamp after server `asOf` continues to be excluded as `SOURCE_TIMESTAMP_IN_FUTURE`. Neither is silently included in generic callback fallback.

Life Facts whose `validFrom` starts after the canonical message are still `NOT_YET_VALID` for that turn. Existing current-server-`asOf` expiration and supersession/revocation checks are retained; a fact that was valid at message creation but expired by the server read is **not resurrected**. This conservative read-only temporal safeguard does not turn an old message into a replay API, approve any new source or change the underlying durable grant/retention policies.

## Exact current-turn retrieval binding (offline, 2026-11-08)

Retrieval now returns a **server-private** `querySourceTurn` containing the canonical message ID, sequence, timestamp and exact user text read from the authorized thread snapshot. The binding is deliberately outside the redacted retrieval trace: user prose must not enter shared diagnostics, client-visible telemetry or generic logs.

The Dynamic Context Composer checks all four binding fields against its current User message before source admission, exact request serialization or token counting. Even within the same Subject/Character/thread and relationship revision, a retrieval result for an earlier or altered User message fails closed as `INVALID_RETRIEVAL`. This does not add a new Memory/Grant source, create a new policy or authorize a live Provider request.

## Canonical callback hint provenance (offline, 2026-11-08)

The exact authorized current User message remains the **only positive evidence** for an explicit memory callback. A server-supplied `explicitCallbackRequested: true` flag is now only a hint; it cannot fabricate recall intent when the canonical text itself contains no supported callback wording. `false` can still conservatively suppress callback priority/fallback, and nonboolean runtime inputs are rejected before candidate retrieval. Generic latest-Memory fallback is therefore only eligible when the text actually requests memory and no topical token survives the established callback scaffold filter.

This closes a narrow false-recall scenario: an unrelated short/no-topical-token message with an injected positive flag must return no remembered episode. An unrelated topical query retains lexical matching but gets no callback priority merely from the flag. The rule does not infer hidden intent, invent semantic classification or change Source/Subject/Character/grant authority. Synthetic fixtures verify these paths; no Production Provider activation, new policy registry or data write is implied.

## Current limitations

The existing source fields support lexical relevance, projector relevance/salience, explicit callbacks and bounded recency. The current sources do not provide authoritative record-level links for relationship relevance, unresolved-thread weight, causal grouping, contradiction risk or repetition penalty. No semantic/vector index or proven causal graph is present in this slice. Those signals and infrastructures remain unimplemented rather than being inferred from prose.

The positive Life Fact/Memory projector registry remains server-owned and closed by default while SRC-25 is unresolved. This code does not enable `conversation_recall/v1` in Production.

## Verification scope

- Unit tests: lexical recall, no-match abstention (including topical callback with no matching source), explicit callback, generic callback fallback, multiple-session recency and topical relevance, one-record budget, valid-time exclusion, scope mismatch, unsupported-schema non-exposure, Capability Gate denial before source reads, exact current User message binding and selected-record-only output.
- PostgreSQL tests: v2 provenance, exact grant scope, cross-Subject denial, revoked-grant exclusion, superseded Life Fact exclusion and server-only EXECUTE privileges.
- Latest-commit CI verdict is a separate required completion condition; test presence does not imply a passing run.
- No Provider dispatch, paid inference, durable Memory write, grant mutation, relationship mutation, Production route or additional Character activation.
