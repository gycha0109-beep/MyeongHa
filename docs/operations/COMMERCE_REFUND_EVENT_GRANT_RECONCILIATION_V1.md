# Commerce refund/cancellation event ↔ purchase Grant audit v1

Track: `commerce-payment`. Offline, fully visible, read-only PostgreSQL operations inspection.

## Scope

The existing generic Receipt/Attempt/Credit audit does not separately reconcile
verified PortOne cancellation tags with exact Receipt-backed Entitlement Grants.
This script observes both historically used `refund` and `payment.cancelled`
event types. Neither label independently establishes a **fully or partially
settled refund**, nor proves that automatic purchase access revocation is lawful.

Implementation: `scripts/operations/commerce-refund-event-grant-reconciliation-v1.mjs`,
`reconcileRefundEventGrantsReadOnlyV1(client)`.

Supply an existing approved operations connection with full RLS visibility,
pinned TLS CA and no caller transaction. The tool starts REPEATABLE READ
READ ONLY, checks visibility, sets a 10-second statement timeout and rolls
back. A database failure or incomplete visibility is not a successful audit.

## Counters

- `productionRefundTaggedEvents`: total matching `refund` and `payment.cancelled` PortOne production events
- `productionLegacyRefundTaggedEvents`: matching events tagged `refund`
- `productionPaymentCancelledTaggedEvents`: matching events tagged `payment.cancelled`
- `refundEventsWithoutVerifiedStatus`: cancellation/refund tags not verified or processed
- `verifiedRefundEventsWithoutExactReceipt`: verified tag lacks a precise production Receipt match by Subject, Provider, resolved Receipt and **original transaction lineage**
- `verifiedRefundEventsWithoutPurchaseGrant`: exact Receipt exists, but no receipt-backed purchase Grant is linked
- `activePurchaseGrantsAtRefundEvent`: active purchase Grants linked by exact Receipt/Subject
- `revokedPurchaseGrantsAtRefundEvent`: revoked purchase Grants linked by exact Receipt/Subject
- `exactRefundEventRevocationEffects`: linked Grants with the same Provider Event recorded as a revoked Entitlement Effect
- `verifiedRefundEventsWithoutOrderingKey`: verified tagged events without provider ordering metadata

Only aggregate decimal counts are returned; there are no customer, Reading,
Reader, receipt identifiers, card data or PSP payloads. A count represents
**current DB state**, not a chronological history of refund settlement.

## Reader-specific drill-down

`scripts/operations/commerce-exact-reader-cancellation-evidence-v1.mjs`
checks one known verified production event and exact independent Reader
purchase Grant, including official Reading, original purchase intent, transaction
lineage, current Grant state and exact revoked-event provenance. It reports only
whether the connection exists and how many **other purchase Grants** for that
Reading remain active. Other purchase Grants may represent other Reader choices;
the count alone does not prove they are different people or Readers.

Both read-only auditors maintain `fullRefundProven=false` /
`fullRefundEstablished=false`, no refund approval, no automatic revocation,
no PG cancel, no new Entitlement Effect, and no public endpoint.

## Validation

Synthetic Vitest contract tests plus disposable PostgreSQL 17 SQL parsing and
Reader A / Reader B fixture. In the fixture, Reader A's exact revocation event is
recorded, Reader B retains its separate active purchase Grant, and mismatched
provider transaction lineage fails to bind.

Actual provider refund finality, exact full-versus-partial amount, source
ordering, Reader T2 lock integration, production ledger replay verification and
the approved Legal/Commerce contract remain release blockers.
