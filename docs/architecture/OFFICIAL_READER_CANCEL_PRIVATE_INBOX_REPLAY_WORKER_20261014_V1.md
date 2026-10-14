# D3e4 — Private cancellation Inbox → independent PortOne GET → shadow replay

> 2026-10-14 / Child of D3e3 PR #2060 / Draft only; no release authority
> Scope: one explicitly chosen **persisted inbox UUID**, synthetic or owner-only testing
> PUBLIC OFF · no hosted worker/route · no provider live credentials · no rights effect · no refund · no purger

## Flow

1. D3e3 ingress verifies original signed webhook within freshness window, normalizes its `eventOccurredAt` to UTC milliseconds **before** computing the existing K1 Commerce HMAC, then commits the minimal record in `1910` before any ACK.
2. D3e4 private replay loads **the already committed** `1910` row by trusted UUID. The row must remain `queued`, `portone_v2`, exactly the supplied ID, and match the independently recomputed keyed HMAC. Raw signed HTTP body/headers are *not* restored or re-signed; a stored HMAC is **not** a PG signature.
3. A bounded, fixed-origin **GET /payments/{paymentId}** is performed outside the DB write transaction using the same validations as the direct PortOne cancellation source verifier: store, payment and transaction IDs; LIVE/TEST environment; currency; canceled/paid amount; exact cancellation ID and aggregate sum; partial/pending/superseded/full-candidate classification. No user or client-supplied provider facts are accepted.
4. After GET, the DB Owner-only test adapter begins a short `READ COMMITTED` transaction, reads the same `1910` row with `SELECT … FOR UPDATE`, verifies the keyed HMAC and every source field again, then calls the **existing `1860 internal_record_official_reader_portone_cancel_shadow_v1`** using the verified fact fingerprint. COMMIT is required before the callback reports success. Any failure aborts/retries/HOLD, without a shadow or rights success claim.
5. Existing `1860` deduplicates `provider + webhookId`, holds conflicting different evidence, conservatively labels out-of-order facts. The `1910` row intentionally stays queued (no processing state machine, lease, scheduler or deletion yet).

## Key limitations and verification obligations

- This is a **private callable orchestration candidate**, *not* a live or continuously running worker. No automatic queue enumeration or authorized processing role exists.
- The input IDs remain linkable to a person and are not anonymous just because `subject_id` is absent. Inbox retention/deletion and recovery decisions in `OFFICIAL_READER_CANCEL_INBOX_PRIVACY_DECISION_20261014_V1.md` remain in force.
- `1860` is **shadow observation**, not the P5Y authoritative Commerce receipt/provider-event proof, not a final cancellation review, and never a refund or entitlement revocation authorization.
- The existing K1 HMAC format is reused. No new secret is generated; a changed key version needs coordinated replay/rotation logic before LIVE.
- Timestamp equality is by UTC millisecond instant, to survive PostgreSQL `timestamptz` conversion; older candidate rows with a fingerprint bound to a noncanonical textual timestamp are intentionally HELD, not silently accepted.
- A later production design must add durable claim/lease + attempts/backoff/dead letter, exactly-once completion linkage to canonical Commerce evidence, privacy-safe 30-day maximum/early erasure, backup reconciliation, independent DB role/Secret custody, provider GET freshness thresholds, alerting and owner approvals.
- Rollback of the worker transaction must also roll back the `1860` record; redelivery after a successful COMMIT may GET again, but the 1860 identity is idempotent if verified facts are unchanged. A differing provider snapshot yields explicit conflict/HOLD.

## Review criteria

- Synthetic signed → persisted typed data → keyed verification → **independent provider GET** → row recheck under lock → existing 1860 writer, with preserved `effectAuthorized=false`.
- Invalid HMAC/row/state/key, mismatched provider IDs, wrong LIVE/TEST channel, amount sum mismatch, GET failure, database write failure, changed row, failed COMMIT: fail closed, **no grant effect**.
- Replay produces immutable 1860 history or an explicit conflict; pending/partial/superseded cannot be promoted to full.
- Real PostgreSQL synthetic proof for 1910 row-lock/1860 same transaction and rollback; CI tests including privacy/RLS and existing signed-direct legacy verifier.
- Remain Draft under D3e3 until Privacy/Legal/Security/DB/Operations handoff; do not merge or deploy solely based on CI.
