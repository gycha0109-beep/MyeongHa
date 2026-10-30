# Commerce PortOne V2 cancellation signal candidate v1

Track: `commerce-payment`; internal candidate, no deployed route or provider cancellation execution.

## Scope

`apps/api/src/portone-v2-cancellation-webhook-candidate-v1.ts` reuses
`authenticatePortOneV2WebhookPaymentCompletionV1` for the exact raw body,
webhook ID, signature, timestamp replay window and configured secrets.
It snapshots the request body exactly once to prevent any stateful accessor
from returning different bytes to the authenticator and to the parser.

Recognized signed cancellation event tags:

- `Transaction.CancelPending` — an asynchronous cancellation **request**, not its completed result.
- `Transaction.PartialCancelled` — a partial-cancellation signal; purchased rights may still remain.
- `Transaction.Cancelled` — a full-cancellation signal; provider re-lookup and original Receipt, amount and ownership binding remain mandatory.

This unmounted candidate produces a bounded payment ID, optional transaction
ID, optional cancellation ID, verified webhook ID and the tag type for an
eventual **separate provider re-lookup**. Client-supplied money, owner, grant,
Reading, status and product are ignored; none is used to authorize a refund.
The existing `Transaction.Paid` completion path is untouched.

The existing offline read-only inspectors now recognize legacy `refund` and
`payment.cancelled` tags and all three official PortOne V2 cancellation tags.
The aggregate inspection provides separate official pending/partial/cancelled
counts and retains `fullRefundProven=false`. The exact Reader/Grant drill-down
uses the same tag taxonomy but never authorizes a Grant mutation.

## Execution and Legal HOLD

A webhook signature proves authentic delivery of a *notification*, not a
settled refund amount, outstanding balance, transaction finality, legal approval,
a verified Entitlement Event, or the current Reader purchase Grant. Do not
infer delivery or legal withdrawal restriction from a checkout checkbox.

Neither this module nor the inspectors mount an HTTP endpoint, query PortOne,
insert provider events, issue refunds, revoke Grants or activate checkout.
The ordinary paid-completion webhook continues to ignore non-paid types.

Before mounting: approve refund lifecycle/full-vs-partial and amount semantics,
provider lookup source, signed-event replay/dedupe, provider event persistence,
production merchant/channel, verified original payment lineage, final
Commerce ordering and Reader/T2 concurrency admission. P0-PR-01 retention
and the independent saleable Product/Saju/Reader authority gates remain HOLD.

## Reference

PortOne official V2 docs:
- https://developers.portone.io/opi/ko/integration/cancel/v2/readme
- https://developers.portone.io/api/rest-v2/payment

PortOne describes cancellation responses as `REQUESTED`, `SUCCEEDED`,
or `FAILED`: a successful cancellation request can still be pending.
Its payment status taxonomy distinguishes `CANCELLED` from
`PARTIAL_CANCELLED`. These labels must remain distinct.

## Local payment provenance before cancellation review

The additional offline tool `scripts/operations/commerce-cancellation-payment-receipt-link-v1.mjs`
matches the *signed* candidate's original provider `paymentId` (optional
transaction ID) against the existing immutable `commerce_payment_attempts`
provider request ID, verified Production `commerce_receipts`, exact
Purchase Intent owner and amount/currency, and pinned Reading product/Reader
selection. A sandbox or unverified Receipt cannot become a positive link.

This tool is independent of cancellation or dispute finality and returns no
customer identifiers, Reader IDs, personal facts, money amount or receipt IDs.
It only reports whether the original charge is demonstrably a verified
production purchased Reading. An unlinked request is not evidence that no
customer charge took place; it requires separate provider reconciliation.

`test/db/commerce_cancellation_payment_receipt_link_sql_smoke.sql` and
`test/db/commerce_cancellation_payment_receipt_link_sql_smoke_runner.mjs`
test the original payment/Reader join, mismatched transaction, unknown
provider payment ID and sandbox exclusion against disposable PostgreSQL 17.

A linkage is refused if neither the original payment Attempt nor the
authenticated cancellation signal contains a provider transaction ID. A
Purchase Intent may have different payment attempts, so a same-Intent Receipt
alone must never prove that the *particular* notified payment was charged.
The disposable PostgreSQL fixture includes this un-attributed attempt case.
