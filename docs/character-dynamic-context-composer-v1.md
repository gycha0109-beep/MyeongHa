# Character Dynamic Context Composer v1 — Offline Foundation

> Watchtower-Track: character-memory  
> Status: OFFLINE CORE IMPLEMENTED / PRODUCTION INTEGRATION NOT COMPLETE  
> Parent runtime track: PR #3068  
> Date: 2026-11-07

## Authority

\`composeCharacterDynamicContextV1\` accepts only a server-pinned, read-only, non-Saju Working Context and the already-filtered result of \`retrieveCharacterWorkingMemoryV1\`. It verifies exact Subject/Character/thread scope, selected-memory record/grant identity and source references before building any model request. The caller must establish policy/Character/Bible/event source authorization before supplying trusted source segments. This function does not itself fetch sources or grant permission.

Protected Official Reading/Saju and Character-private disclosures are **not** inputs to this first composer. Those have separate admission/entitlement requirements.

## Context pressure

Always keep: System/Safety/Product policy, Character Core, current User turn, latest authorized conversation message, existing relationship projection where available, explicitly trusted Bible core and authoritative unresolved events.

Drop one item at a time in this order, with deterministic tie-breaking:

1. low-relevance trivia;
2. redundant Bible examples;
3. resolved low-salience events;
4. older dialogue (oldest first);
5. lower-ranked selected retrieved memories.

If the mandatory core is still too large, fail closed instead of silently removing authority, immediate continuity or unresolved sources.

Every candidate request is serialized by the server-supplied exact request builder and passed through the **existing** Phase 2 \`certifyModelTokenBudgetV1\` and trusted counter adapter. No bytes-to-token or character-to-token heuristic is used. Only over-budget/oversized-request failures permit a drop; invalid adapters, unknown counts or provider/profile drift abort assembly.

## Output and privacy

The result carries the exact serialized private request body and segments for server use only. Its separate redacted trace contains source references, exclusion reasons, exact-count attempt count and the certified token upper bound. The trace never carries raw private text or the request body.

No Provider dispatch, Cost Governor reservation, persistence, grant mutation, relationship mutation or production activation occurs here. The implementation is deliberately marked \`offline_preflight_only\`.

## Server-side offline retrieval integration

`prepareCharacterDynamicContextForTurnV1` is a server-only orchestration wrapper that invokes the existing Capability Gate and permission-first Subject/Character/thread retrieval before feeding selected source records and redacted context metadata into the offline composer. The exact current User message comes from the authoritative thread read, not a client-supplied query. A rejected entitlement prevents all Memory/relationship/dialogue reads and prevents the exact request builder and token counter from running.

This wrapper preserves the existing same-transaction Subject-bound read-port contract and does not register a Provider, dispatch an inference request, reserve cost or activate a Character. It is an offline interface, not a public API route.

## Fixture verification

Synthetic token counters and synthetic Character/Memory sources cover deterministic pressure decisions, protected-layer preservation, selected-memory record/grant provenance, one exact UTF-8 request, missing token count, over-budget mandatory layers, cross-Subject mismatch, source reference collision and trace redaction. The server orchestration fixture also verifies permission-first retrieval, exact current-turn assembly and denial before any read/count/serialization.

## Holds

Phase 3 source-supported signals that lack verified fields remain unavailable; no semantic embeddings, new graph database or inferred unresolved relationships are introduced.

Phase 4 is not complete until exact source admission, current-turn orchestration, approved model/provider serialization, real token/cost/guard chain and evaluation gates are connected. O-C1-07, SRC-25/SRC-05/SRC-10 and the existing paid-evaluation lock remain binding.
