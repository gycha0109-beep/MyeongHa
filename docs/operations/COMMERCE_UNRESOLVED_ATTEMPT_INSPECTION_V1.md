# Commerce unresolved payment Attempt inspection v1

Track: `commerce-payment`. This is the next independent **read-only reconciliation discovery** boundary after the real Owner KCP sandbox P1 PAID / signed Receipt / replay acceptance. It is not automatic settlement or Production launch permission.

Implementation:
- `scripts/operations/commerce-unresolved-attempt-inspection-v1.mjs`
- `test/commerce-unresolved-attempt-inspection-v1.test.mjs`
- Architectural authority: `docs/COMMERCE_PAYMENT_TRACK_ARCHITECTURE_V1.md` §13 (lost callback/webhook, verified payment with failed DB write, support re-verification)
- Operational integrity authority: `docs/operations/COMMERCE_PAYMENT_READONLY_RECONCILIATION_V1.md`

## Operator procedure

Import `inspectUnresolvedPortOneAttemptsReadOnlyV1(client)` using the dedicated, RLS-complete Postgres operations connection already governed by existing pinned Supabase root CA/TLS rules. The function opens its own repeatable-read READ ONLY transaction, checks complete visibility, executes one bounded SELECT, and always rolls back. Do not invoke inside an existing transaction or mount it on an HTTP endpoint.

Output contains **only aggregate count strings** (no identifiers, card/PSP payload, customer names, secret or status assumptions):

| Counter | Interpretation |
| --- | --- |
| `sandboxHandedOffWithoutReceipt` | Owner/test handoff not locally linked to a verified Receipt |
| `productionHandedOffWithoutReceipt` | Production handoff not locally linked to a verified Receipt |
| `sandboxResponseReceivedWithoutReceipt` | Sandbox response-received Attempt without a verified same-owner, same-offer, same-environment, same-transaction Receipt |
| `productionResponseReceivedWithoutReceipt` | Same gap in Production |
| `unknownEnvironmentWithoutReceipt` | Unknown/null environment requires investigation, never automatic settlement |

`handed_off` means the checkout was handed to PSP. It is **not** proof of authorization, capture, PAID or a provider failure. A matching verified Receipt on another Attempt for the same immutable Purchase Intent can settle its handoff candidate; otherwise it is counted for operator review. A `response_received` candidate must match its own provider transaction ID to avoid hiding a missing/wrong Receipt.

`status=review_candidates` means an operator may need to use the existing authorized provider re-verification path for an exact Attempt, but **does not authorize** a payment, new checkout, recurring PSP requests, refund, Grant, credit issuance or the recording of `PAID` without current server evidence. `status=clear_observation` only describes local DB observation, **not** provider-side reconciliation. The result has `providerReconciled:false`, `pspCallsPerformed:false`, `writesPerformed:false` and all approval flags false.

If database visibility is restricted or any SELECT fails, inspection throws and must not report success; raw DB exceptions must not be exposed to users. Only current server-side PSP lookup and governed DB persistence can resolve a payment.

## Live read-only proof — 2026-10-29

The exact version-controlled SQL was executed against the Production Supabase database, with no mutation:

- `sandboxHandedOffWithoutReceipt=14`
- `productionHandedOffWithoutReceipt=0`
- `sandboxResponseReceivedWithoutReceipt=0`
- `productionResponseReceivedWithoutReceipt=0`
- `unknownEnvironmentWithoutReceipt=0`

Separate existing reconciliation shows one verified sandbox Receipt / one provider event for the completed KCP test and no Production credit mint. The 14 open handoffs reflect historical test Attempts; these rows are review candidates, **not fourteen charged payments**. Do not automatically re-submit those payment IDs or manufacture Receipt evidence.

## Release boundaries

P2 active paid Reading Offer / immutable Charge Terms remains blocked by `P0-CM-03` and Saju/Reader/Product authority. P3 verified Receipt-to-Grant or paid Credit Lot activation remains separate. Refund/reversal/dispute ordering, Production merchant credentials and public webhook activation remain HOLD. This inspector is designed to work while all those gates are closed.
