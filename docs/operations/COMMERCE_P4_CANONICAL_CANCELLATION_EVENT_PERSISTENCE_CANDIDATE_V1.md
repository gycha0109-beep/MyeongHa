# Commerce Payment P4 — canonical PortOne cancellation event persistence candidate v1

Date: 2026-10-31. Track: `commerce-payment`. Base: merged PR #2791 / `main`.

## Implemented

- `scripts/operations/commerce-portone-cancellation-event-private-persist-v1.mjs`:
  internal operations-only composition of existing **raw signed PortOne V2 cancellation webhook authentication**, **owned verified Production Reading Receipt read-only resolver**, **authenticated fixed-origin PortOne GET** and the new private Provider Event persistence SQL call. Raw webhook body is copied once, then exactly those same bytes are authenticated and HMAC-fingerprinted. No client payment claims, Subject, Reader, product or amount controls the DB identity.
- `docs/operations/candidates/commerce_portone_cancellation_event_persistence_v1.sql`:
  non-deployable PostgreSQL **SECURITY INVOKER** function `internal_persist_portone_cancellation_event_v1` that pins the exact paid Reading Purchase Intent/Offer/selection/Attempt/verified Receipt, locks the original Receipt, and inserts a minimized canonical `commerce_provider_events` row. It does **not** create a competing refund ledger.
- The event's provider `external_event_id` is the signed webhook ID, `external_transaction_id` and `external_original_transaction_id` both identify the verified **original paid transaction**. Subject and Receipt are resolved inside PostgreSQL rather than supplied by an external caller.
- Server HMACs of the immutable signed body and matched authenticated GET classification are the only source fingerprints persisted. No raw PortOne HTTP payload, signature, bearer token, card details, birth data or Reader conversation is persisted.
- Only **`Transaction.Cancelled` + full cancellation shape** or **`Transaction.PartialCancelled` + partial cancellation shape** are admissible; each must match the exact cancellation ID when present. Pending signals, failed/requested cancellation, mismatched transaction, non-Reading purchase and mismatched amount/currency are rejected before persistence.
- Re-delivery of the exact signed event + GET shape returns `replayed=true`. Any attempt to reuse the same provider event ID for a different receipt, event type, transaction or fingerprint conflicts and cannot reparent evidence. SQL row locking and provider-event unique key are reused, with no `ON CONFLICT UPDATE`.
- Result contains only `canonicalEventStored` and `replayed` classification; commit-acknowledgment loss is treated as **outcome unknown**, not absent or successful.
- Writes are limited to the provider event evidence table. **No money-state changes, cancel POST, Entitlement Effect, entitlement Grant revoke, public webhook, consumer complaint acknowledgement or LIVE sale.**

## IMPORTANT: what a stored verified cancellation means

`status='verified'` here means **a signed PortOne notification was matched to a server-observed provider payment cancellation STATUS SHAPE and to an original verified paid Reading Receipt**. It does **not** establish provider settlement finality for a specific amount, consumer statutory withdrawal resolution or Grant revocation authority.

The current PortOne response shape classifier does not return a cryptographically signed business-ordering cursor or canonical comparable provider event order. Therefore `provider_ordering_key` and `provider_occurred_at` intentionally remain **NULL**. The already-merged exact-event readiness auditor correctly reports `provider_ordering_unresolved`; do not invent lexical ordering from webhook IDs or transport timestamps.

## Deployment / admission boundary

This is a **private implementation candidate**, not a migration. The SQL stays under `docs/operations/candidates/`, outside `supabase/migrations/`. The JS export reports `productionPersistenceMounted=false` / `sqlDeployed=false`. The SQL revokes execution from PUBLIC, anon, authenticated, service_role, ordinary API, worker and Commerce internal executor. The function uses the caller's real PostgreSQL authority and accepts neither an external Subject nor privileged HTTP request.

Before production activation: independently prove the event payload and stable replay contract against the real PostgreSQL 17 Commerce migrations/triggers; establish approved, comparable provider event ordering and cancellation settlement/amount facts, end-to-end Reader T2 admission and exact Entitlement Effect, and maintain the P0-PR-01 deletion/retention graph. Do not reopen already-decided policy.

## Verification

- `npx vitest run test/commerce-portone-cancellation-event-private-persist-v1.test.mjs` — 20 scenarios, including signed request authentication, both final cancellation cases, pending/partial mismatches, other provider cancellation IDs, underprivileged DB, replay, conflicts, bad DB data, and ambiguous COMMIT.
- `test/db/commerce_portone_cancellation_event_private_persist_v1.sql` — disposable SQL fixture. Executed locally against **PGlite 0.5.13 (PostgreSQL 18.6 WASM)** on a wholly isolated empty database; success marker `COMMERCE_CANCELLATION_PRIVATE_PERSIST_SQL_SMOKE_PASS`. Verified insert+replay, mismatched source conflicts, pending rejection, non-Reading rejection, no fabricated ordering, and other Reading purchase preservation. **Not** a full existing-migration/triggers test or a PostgreSQL 17 host claim.
- The separate native Windows PostgreSQL server would not remain healthy in the remote execution shell. No existing localhost or Production PostgreSQL database was mutated; the scratch server was stopped and its smoke result was **not** counted as PASS.

## Next roadmap unit

1. Migrate this candidate only after running the full existing Commerce migration stack and exact Reader A/B fixture on disposable PostgreSQL 17, including actual trigger enforcement and concurrent same-event replay.
2. Extend the verified adapter with trustable exact cancelled amount and cancellation item finality (without assuming refund legal outcome), and define provider-comparable order provenance under the existing Entitlement Effect comparator contract.
3. Apply an authorized exact Reader Grant revoke within existing T2/lock/revision rules **only after** money/legal/delivery facts are established. No cross-Reader or Chat revocation.
4. Independently finish the `digital_reading_withdrawal_claims_private_v1` Subject graph, FK deletion order and restored-state privacy reconciliation before deploying the consumer claim table.

## 2026-10-31 exact cancellation item amount and delayed replay hardening (source-v2)

The staged SQL now requires the signed webhook's **specific cancellationId** (stored as a server HMAC, never a raw customer/PSP payload), a separately authenticated `GET /payments/{paymentId}` with the **same cancellationId in SUCCEEDED state**, its positive `totalAmount`, and the cumulative `payment.amount.cancelled`. The individual SUCCEEDED amount must not exceed the cumulative amount or the original verified Production Reading Receipt. `Transaction.PartialCancelled` must identify an item strictly smaller than the original paid amount.

A partial cancellation notification can be delivered after the provider payment has reached CANCELLED through *another* cancellation. It is accepted only if the exact signed cancellation item is still SUCCEEDED and its individual amount is unchanged. The original HMAC, Provider Event ID, Subject, Receipt and exact succeeded amount remain immutable; a larger aggregate observed later does not modify or replace the first recorded aggregate. Replaying a decreased aggregate or a changed original item rejects.

The exact-Reader private preflight now reads this source-v2 amount provenance and explicitly classifies `cumulative_payment_cancel_does_not_prove_single_item_full` when a payment's **cumulative full** cancellation actually consists of multiple partial items. Even an exact whole-item amount cannot authorize a revoke without trustworthy provider order, statutory determination, delivery evidence and Reader R2/T2 atomic locking. All operations remain **internal candidates, not mounted**, with no refund execution, public route or Entitlement Effect. Current v2 SQL replaces the **non-deployable candidate only**, not any existing deployed database function.

PortOne API schema for GET/payment cancellation values: https://developers.portone.io/api/rest-v2/payment . All amounts are minor currency units and are not a consumer refund determination.
