# Commerce Payment read-only reconciliation v1

Track: `commerce-payment`. Scope: internal database consistency, not PSP parity,
refund execution, paid fulfillment activation or a new public API.

Implementation: `scripts/operations/commerce-payment-readonly-reconciliation-v1.mjs`.
An operator imports `reconcileCommercePaymentReadOnlyV1(client)` with a dedicated
connected `pg` client. Use the existing governed TLS connection setup and pinned
Supabase root CA; do not disable certificate or hostname verification. The caller
owns connection acquisition/closure. Do not invoke inside an existing transaction.

The function starts a repeatable-read, read-only transaction, limits statement
runtime to 10 seconds, checks read-only mode and full RLS visibility, then returns
only allowlisted counts and rolls back. A restricted runtime role is rejected:
RLS-filtered zero rows cannot prove absence of payment/rights discrepancies.
This tool creates no role, GRANT, function, migration or scheduled worker.

Detected discrepancies:

- Verified Receipt missing exact subject/Intent/Offer/amount/currency/Attempt/
  provider transaction/environment binding.
- Duplicate Receipt provider/environment/transaction identities.
- Active receipt-backed Grant with a different subject, sandbox/unset environment
  or non-verified Receipt.
- PortOne paid Credit Lot missing a matching verified Production Receipt or subject.
- Any paid Credit Lot backed by a sandbox Receipt.

Production verified Receipts without Grant/Credit Lot provenance are counted
separately. They do not authorize issuance or automatically become incidents:
Product-specific fulfillment expectations remain HOLD. No expiry, refund policy,
service readiness or enabled SKU is invented. Existing source tables remain the
only source of truth; no second ledger or alternate normalization is created.

DB errors/invalid result shapes throw; callers must report failure without raw
errors/credentials and must never label the run PASS. Successful output says
`observed` or `findings`, always `providerReconciled:false` and `writesPerformed:false`.
Persist only these aggregate outputs in the existing operational evidence channel.
No external PSP request is made and no provider cancellation/refund is attempted.

## Verification — 2026-10-28

- Nine direct tests passed: incomplete RLS visibility, five discrepancy classes,
  expected HOLD without rights, malformed results and rollback after DB failure.
- Executed against the actual Production DB with a pinned CA and read-only
  transaction. Sandbox/Production PortOne Receipt counts, all discrepancy counts,
  sandbox paid Credit Lots and unfulfilled Production Receipt counts were zero.
  Zero Receipts is not evidence of a completed KCP payment.
- Actual schema and migration catalog were read without mutation. Remote latest
  migration name: `owner_sandbox_signed_receipt_persistence_v1_20261028`, version
  `20261028011357`. The remote catalog uses timestamped versions for recent
  Commerce changes; repository SQL filenames are not asserted to match that
  deployment history. No migration-history repair is performed.

Next boundary: real Owner sandbox PAID/Receipt followed by repeat verification
and this audit. Provider-side reconciliation and refund/revocation execution
remain incomplete and require their existing lifecycle/product gates.
