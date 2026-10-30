# Commerce refund-tagged Provider Event / Grant reconciliation v1

Track: `commerce-payment`. Offline PostgreSQL operations inspection only.

## Gap addressed

The existing general Receipt/Attempt/paid-Credit audit checks payment integrity but does not separately show which verified production Provider Events tagged `refund` already have purchase-derived Entitlement Grants and whether an exact event-to-revoked effect was recorded.

This matters before designing the P4 refund/revoke connection: a Provider Event could be unrelated to an exact purchase Grant, a late replay, incomplete receipt resolution, or a **partial** refund. Never revoke access from an unverified or ambiguous external signal.

Implementation: `scripts/operations/commerce-refund-event-grant-reconciliation-v1.mjs`, `reconcileRefundEventGrantsReadOnlyV1(client)`.

## Operator procedure

Use a full-visibility read-only operations connection already governed by MyeongHa Postgres CA/TLS and connection-role rules. Invoke outside another transaction. The inspector starts `REPEATABLE READ READ ONLY`, sets a 10-second statement timeout, verifies a complete-visibility role, executes only SELECT and rolls back. Restricted RLS/ACL, query error and malformed count output are not PASS.

## Aggregate counters

- `productionRefundTaggedEvents`: `portone_v2` production Provider Events with the existing `refund` tag (irrespective of verification state)
- `refundEventsWithoutVerifiedStatus`: event tag exists but verified/processed status is absent
- `verifiedRefundEventsWithoutExactReceipt`: verified tag lacks production verified/revoked Receipt and exact receipt-based resolution
- `verifiedRefundEventsWithoutPurchaseGrant`: a matching Receipt exists but no receipt-owned purchase Grant is linked
- `activePurchaseGrantsAtRefundEvent`: currently active purchase Grants linked by exact Receipt/Subject
- `revokedPurchaseGrantsAtRefundEvent`: currently revoked purchase Grants linked by exact Receipt/Subject
- `exactRefundEventRevocationEffects`: linked Grants for which the exact Provider Event appears as a revoked Entitlement Event source
- `verifiedRefundEventsWithoutOrderingKey`: verified tags missing explicit provider ordering provenance

Only aggregate decimal count strings are emitted. No customer, identity, PSP token, Card data or birth/Reading content is returned. These counters describe current rows, not the historical order of refund versus grant events.

## Critical activation HOLD

**An event tagged `refund` is NOT evidence of full refund.** The exact full/partial amount and ordering authority are not implemented here. No grant is revoked, no existing Entitlement Effect is called, and no PortOne cancellation/verification call occurs. Output always carries `fullRefundProven=false`, `partialRefundResolved=false`, `eventOrderingAuthorized=false`, `revocationAuthorized=false`, `providerCancellationAuthorized=false`, `pspCallsPerformed=false`, `writesPerformed=false`.

Before P4 refund execution: obtain exact verified provider cancellation/final-state evidence (including full/partial and amount), approved refund/chargeback provider ordering, source Receipt/subject/Grant mapping, idempotent application through the **existing** Entitlement Effect primitive, and Reader T2 locking/revoke race admission. Preserve all independent Product/Legal/Saju/Reader and LIVE HOLD gates.

Tests are deterministic offline SQL-contract and operational-visibility checks, not live-provider reconciliation or production DB verification.
