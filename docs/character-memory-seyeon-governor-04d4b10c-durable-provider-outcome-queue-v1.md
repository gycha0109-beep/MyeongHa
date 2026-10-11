# D4B-10C — Durable Provider Outcome / Private Settlement Queue

Watchtower-Track: character-memory

## Status and decision

**D4B-10C1 implementation candidate; OFFLINE ONLY; Production HOLD.** D4B-10B provided the admission-time reservation/rate snapshot on the canonical cost ledger. D4B-10A provided a driver-only detached settlement worker that accepts a private receipt-source port. Neither is currently wired to a trustworthy durable Provider outcome source in Chat/Post-turn.

### Execution sequence

1. **C1 — Durable DB authority (this PR):** Persist the exact server-captured Provider cost event for an existing **committed, rate-pinned** reserved call in a private relational queue. Check immutable Subject/Turn/Attempt/Phase/Call/provider/model/purpose/rate, reject unknown price or fabricated estimates, and allow identical replay only. Keep no instructions, messages, user prompt, response text or API token.
2. **C2 — Server adapter:** Wire an internal-only, awaited durable outcome sink from the original Provider metric emitted on response/error to `cmd_store_seyeon_provider_receipt_v1`. No client-originated JSON or public route. A synchronous in-memory `observeMetric` callback is **not durable evidence**. If persistence fails, retain the original reservation; do not repeat paid inference or synthesize usage. Verify the Provider response completion -> committed DB receipt gap and preserve unknown charge on ambiguous outcomes.
3. **C3 — Dedicated source adapter:** Bind `SeyeonDetachedSettlementReceiptSourceV1` to the private worker claim RPC. Claim uses `FOR UPDATE SKIP LOCKED`, random 90-second fencing token and timed replay; the D4B-10A worker calls the D4B-9 detached settlement RPC; acknowledgment verifies **committed exact ledger evidence**. No password/login until authorized separately.
4. **C4 — Threat/concurrency matrix:** Two workers, lost COMMIT/ACK response, lease expiry/stale token, process death, bad price, over-ceiling, Guest expiration/promotion/missing Subject, deletion cascade, RLS/ACL, and actual isolated PostgreSQL. Exact-head CI + full Integration; squash merge only if green. D4B-11 security/Production approval after completion.

### DB trust boundary — C1

- `public.seyeon_ai_provider_receipt_queue_v1` has no direct grant to either executor. Its `call_id` references the canonical ledger with `ON DELETE CASCADE`. The existing approved attempt-delete trigger deletes that ledger, therefore queue evidence is deleted with it. There is **no new FK to Subject or attempt**.
- `cmd_store_seyeon_provider_receipt_v1` is granted only to the **NOLOGIN governed executor**. It checks a current trusted Subject and fresh reserved row with a D4B-10B pinned rate, then recomputes known usage cost with DB-pinned rates. An unknown usage event leaves the existing conservative admission ceiling. Same JSON repeated before settlement is idempotent; conflicting JSON is rejected.
- `cmd_claim_seyeon_provider_receipt_v1` and `cmd_ack_seyeon_provider_receipt_v1` are granted only to the **NOLOGIN settlement worker**. Queue reads are internal to SECURITY DEFINER procedures, not a raw table grant. ACK requires a live matching fence and ledger `lifecycle_state='settled'` with matching JSON.
- A claim is **not** a new dispatch or charge. A lost acknowledgment or expired claim can replay the identical event; D4B-9 remains the exclusive atomic idempotency authority for the original cost/budget. No ability to create a cost row is delegated to worker.
- There is no current Production login, daemon, HTTP endpoint, cron schedule, private connection pool, or runtime activation in this PR. No Production migration has been run.

### Explicit limits / next work

This PR does **not** claim the system persists Provider outcomes end to end: existing `openai-seyeon-structured-provider-v1.ts` currently calls a synchronous metric observer that can be lost on process crash, and `createPersistingSeyeonAiProviderV1` holds events in a process-local array. Until C2 is connected, newly introduced queue RPCs are dormant. A crash between external dispatch and receipt commit still leaves the original reserved ceiling; it must **never** be interpreted as zero cost. Expired Guest tokens must not be used for new reservations. No D4B-10 closure, real AI traffic, Production schema repair, ENFORCE switch or LOGIN/secret creation is authorized here.

### Required evidence

`test/db/seyeon_governed_cost_d4b10c1_provider_receipt_queue.sh` runs against disposable PostgreSQL and covers two exact reserved calls, known/unknown usage, immutable replay, forged cost rejection, lease fencing, commit-before-ACK, stale token, original detached settlement replay, privacy cascade and role boundary. The shared authority-core and catalog hash must pass after schema changes.
