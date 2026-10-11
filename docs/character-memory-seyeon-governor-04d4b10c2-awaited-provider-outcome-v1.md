# D4B-10C2 — Awaited Provider outcome capture (offline verification)

Watchtower-Track: character-memory

## Scope

- Adds an **internal asynchronous** Provider-metric callback after the native OpenAI Responses outcome is available.
- The governed wrapper persists the exact metered event through `public.cmd_store_seyeon_provider_receipt_v1`, using the already-approved Subject transaction runner, before attempting any cost settlement.
- Only after database acknowledgment for that specific call is the settled evidence applied to the ordinary governed ledger.
- A failed/unknown receipt COMMIT preserves the original reserved ceiling: no invented usage, no double dispatch, no silent zero amount, and no settlement attempted against an unpersisted event.
- Existing legacy/OFF paths retain their semantics; no daemon, worker credentials, database migration, HTTP route, paid AI or Production activation is included.

## Caveats

C1's queue is not a dispatched-worker implementation yet. The synchronous legacy observer remains telemetry only. Receipt commits may be replayed from the private queue once C3 is implemented. The narrow unavoidable Provider-response-to-local-durable-commit crash window retains the conservative admission ceiling. The underlying D4B-10B pinned reservation permits later reconciliation but does not imply the actual usage is known.

## Tests

Synthetic network/DB tests must prove admitted-call -> fake fetch -> committed Provider receipt -> settlement ordering, and failure case admitted-call -> fake fetch -> receipt write error -> no settlement/no second inference. Unknown timeout must be persisted before conservative settlement. Full PostgreSQL Integration required before any merge.

Production schema blocker #1887 stays HOLD. No real LOGIN, ENFORCE, secrets or external paid network dispatch.
