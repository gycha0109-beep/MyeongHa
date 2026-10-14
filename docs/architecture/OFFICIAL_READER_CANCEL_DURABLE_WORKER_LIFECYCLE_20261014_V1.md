# D3e5 — Private durable cancel work lifecycle

> 2026-10-14 · follows [D3e4 PR #2063](https://github.com/gycha0109-beep/MyeongHa/pull/2063) · **Draft/HOLD** · DB Owner isolated testing only.

## Scope and state machine

The existing `1910` signed PortOne cancel inbox becomes a **work ledger** through additive migration `1920`. No personal details, signed raw HTTP bodies, provider responses, credential values, free-form errors or consumer content are stored. Inbox identifiers remain indirectly personally identifying. The approved D3e3 retention design still applies and **no deletion/purger is enabled**.

| State | Meaning | Transition |
| --- | --- | --- |
| `queued` | Signed minimal message committed before acknowledgement | `leased` |
| `leased` | Exclusively assigned by `FOR UPDATE SKIP LOCKED`, random lease token + owner + DB expiry | `completed`, `held`, `retry_wait`, `dead_letter`, or expired re-lease |
| `retry_wait` | Retryable problem; DB-authoritative due time | `leased` after due |
| `completed` | Independently source-verified **1860 shadow observation** recorded and linked atomically | Terminal for **this observation only**; NOT confirmed refund or entitlement revoke |
| `held` | Invalid source, mismatched data, ambiguous/out-of-order observation, security failure | Manual review only, no auto-delete/retry |
| `dead_letter` | Exhausted eight attempts or expired final lease | Manual review only, no auto-delete |

An attempt is incremented when a DB claim commits. Lease duration is configured 45–900 seconds; the injected network GET timeout must be at most 30 seconds and the lease must exceed the timeout by at least 10 seconds. Retry delay is capped exponential: **15, 30, 60, 120, 240, 480, 960, 1920 seconds**, although the eighth failure enters `dead_letter` without another wait. Retained lease history is limited to `attempt_count`, `last_failure_code`, `next_attempt_at`; no raw exception messages.

## Concurrency and safety protocol

1. DB claim is `READ COMMITTED` and `FOR UPDATE SKIP LOCKED`. It is **committed before the caller performs any GET**. A second worker cannot steal a live lease.
2. Worker reads only the committed `leased` row matching its exact UUID, worker ID and random lease token, recomputes keyed HMAC, then performs independently verified bounded `GET /payments/{paymentId}` using an explicitly injected offline/mock HTTP transport. Global fetch and hosted background scheduling are not mounted.
3. Worker starts a short transaction, locks the same inbox row and rechecks **all signed facts, HMAC, owner and token**. It records verified facts with existing `1860` function, then calls `1920` completion in **the same transaction**; `1920` verifies matching 1860 evidence and a **still-live lease**. A failed COMMIT cannot yield a positive completion.
4. Retriable lookup/DB failures are recorded with an allowlisted failure code and DB-calculated backoff. Nonretryable mismatches become `held`. Unknown errors become bounded `INTERNAL_FAILURE`, never raw SQL/provider text. Failure writes themselves are fenced by the original lease token.
5. After an owner crashes, a newly claimed token supersedes the expired token. A stale owner is forbidden from completion **and** failure write. The eighth expired lease is swept into `dead_letter`, rather than vanishing.
6. Existing `1860` observation deduplication remains effective. A reversed/ambiguous source ordering becomes `held`, not completed. An already committed shadow row can only be replayed idempotently when all verified facts match.

## Explicit release gates

**NO live PortOne traffic, automatic execution, external refund, entitlement revoke, canonical P5Y Commerce promotion, production DB role GRANT, retention purger or public route is implemented.** The TS orchestration is a private dependency-injected candidate. DB functions are `SECURITY INVOKER`; `anon`, `authenticated`, `service_role`, and internal runtime roles have no EXECUTE or inbox read/write rights.

Before release: dedicated least-privilege execution identity and independent operational security review, durable monitoring/alerts and manual HOLD review, production-specific provider separation (1860 identity currently keys by provider/webhook ID, not environment), migration/backfill rehearsal, consumer notice/privacy retention and account-deletion/restore reconciliation, reliable scheduler, endpoint integration, canonical legal evidence classification and Legal/Privacy approval. Review exact retry/purge policy for failed and held personal identifiers; `P30D` is an **upper bound after successfully completed transfer**, not permission for indefinite hold or 30-day mandatory retention.

## Verification

- TypeScript mocked PortOne GET: valid, invalid, stale, retryable, terminal error, timing, no-rights.
- Isolated real PostgreSQL: double-worker claim exclusion, expired lease reclaim and stale token fencing, retry not due, due retry, atomic 1860 record+1920 completion rollback/COMMIT, exhausted lease dead-letter, runtime ACL.
- Catalog fingerprint must be updated only to the value computed from the exact new migration in CI; do not bypass schema drift guard.

Release/merge: **HOLD** until all required checks pass and reviewers explicitly approve this isolated candidate.