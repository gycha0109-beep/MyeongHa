# D4B-10A — Detached Settlement Server Binding (OFFLINE ONLY)

Watchtower-Track: character-memory

## Verified source inventory (2026-10-11, main `4ab87b94270d58a6ecc9d3c09d729f9f024331e0`)

- Chat: `production-seyeon-chat-runtime-v1.ts` routes ENFORCE cost work to `costRunner`.
- Post-turn: `production-seyeon-post-turn-worker-runtime-v1.ts` uses the same isolated governed runner.
- `postgres-seyeon-ai-cost-ledger-v1.ts` creates a governed reservation **before** Provider dispatch; then stores the captured Provider cost event in a process-local array and attempts settlement from the same request. On failure, it logs an error and leaves the ledger in `started` state.
- `openai-seyeon-structured-provider-v1.ts` captures the Provider usage for its `observeMetric` callback. Its metric log is **not** a durable authoritative receipt.
- D4B-9 `1690_seyeon_detached_cost_settlement_worker_v1.sql` authorizes detached settlement only for an existing exact reservation. This is a DB authority, **not** a Provider receipt/queue persistence guarantee.

### Confirmed gap

There is **no verified transactional, durable, server-owned dispatch/usage-receipt queue** in the inspected ENFORCE metering path. An event captured in memory can be lost across process crash; the separate worker cannot simply reconstruct actual Provider usage from the existing reservation. Guessing usage, reading logs as evidence, trusting browser payload, or silently setting zero would violate the cost authority.

## Scope of this incremental PR

- Adds a test/offline-only detached settlement adapter with a private receipt-source port and fixed D4B-9 RPC.
- Pins Subject / Turn / Attempt / Phase / Call ID and computes `SeyeonAiCostEventV1` from a server-persisted Provider result and **reservation-pinned rate**. No caller-provided precomputed cost is accepted.
- Preflights a dedicated hypothetical LOGIN for NOINHERIT, NOBYPASSRLS, no extraneous memberships, and no direct ledger/budget read or governed Start power. The fixed worker role is entered transaction-locally.
- Persists no secrets, adds no public HTTP route, creates no LOGIN, initiates no Provider calls, and does not change `OFF` or existing Chat/Post-turn wiring.
- Ack is strictly after COMMIT. Unknown COMMIT results and lost acknowledgements remain eligible for identical replay; any DB/error response is fail-closed. D4B-9 settlement is the final idempotency authority.
- Includes synthetic negative unit tests. Existing D4B-9 isolated PostgreSQL test remains authoritative for actual DB ACL and atomic settlement.

## Integration HOLD — required before connecting the real worker

1. Implement a **durable trusted reservation receipt** atomically coupled to governed Start, before dispatch. Required pinned fields: `canonical subject, thread/turn, attempt, phase, call, purpose, provider/model, policy/rate revision, price snapshot, admission ceiling`. A stale or uncommitted start is not dispatchable.
2. Implement **durable Provider outcome capture** from the server's measured native Provider response or explicitly marked `usage_unknown`. Do not expose a caller-input settlement-event route. Preserve Provider timeout/unknown and over-ceiling evidence; no free fallback. If Provider result is lost after dispatch, hold the conservative reserved amount until independent reconciliation.
3. Provide a private durable work claim/retry/ack contract, correlated to exact reserved `call_id` with ownership locking, crash/replay semantics, and deletion-safe disposition. The port in this PR is NOT a real implementation of that authority.
4. Verify D4B-10 full concurrency matrix in isolated PostgreSQL; include deletion and promoted/missing Guest paths, exact Policy/Model/Price mismatch, and COMMIT unknown.
5. Add a native dedicated `myeongha_seyeon_settlement_login` connection pool **only after** the independent configuration and production-access approval boundary has been reviewed. Synthetic fixture LOGIN is not a Production credential.
6. Exact-head CI and Integration must pass before any development merge. Production migration lineage #1887 remains independent HOLD.

The adapter exported in this PR is **not Production-wired or deployable** without these prerequisites. It does NOT claim D4B-10 closure.

## Rules retained

- No new costs from settlement worker; no Subject-context Guest resurrection.
- No client-provided Subject/Call/cost/usage/Provider event authority.
- No guessed zero usage or arbitrary clipping of over-ceiling cost.
- Conservative reservation maintained while provider result is unresolved.
- No Production migration, repair, credential, role or secret change, ENFORCE switch, real paid calls, OFF removal or legacy privilege REVOKE.
