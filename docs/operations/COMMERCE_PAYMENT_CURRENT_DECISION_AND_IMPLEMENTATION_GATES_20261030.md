# Commerce Payment — current decision and implementation gates (2026-10-30)

This is a **current-status correction** for the active Commerce Payment
implementation branch. It does not retroactively edit historical architecture
snapshots dated before subsequent Product Owner decisions. Latest decision
authority always wins over historical `OPEN` labels.

## Policies that MUST NOT be re-opened

- **P0-PR-01 DECIDED (2026-09-19)** in `docs/P0_DECISION_REGISTER.md`
  and `docs/operations/ACCOUNT_DELETION_FINALIZATION_POLICY_V1.json`:
  service/personalization DELETE; 4 structural tombstones ANONYMIZE;
  9 expressly listed Commerce evidence/history tables P5Y RETAIN;
  existing encrypted backups P30D; restoration privacy replay/reconciliation.
  The account deletion finalizer and authoritative bounded-window replay have
  separate implementation/proof records. Do not describe this decision as OPEN.
- **P0-PR-01B DECIDED**: provider evidence minimization, HMAC/bounded
  allowlisting, no full raw provider payload, bearer, PCI or identity leakage.
- **Refund/withdrawal policy principles DECIDED**, as established in
  `docs/COMMERCE_DIGITAL_READING_REFUND_DISCLOSURE_POLICY_V1.md` and
  `docs/BUSINESS_OPERATIONS_DECISION_REGISTER_KO.md` LEGAL-004:
  provision boundary; statutory withdrawal and exceptions; content
  unprovided/defect/misdescription/duplicate payment handling; partial,
  separable and later Reader purchase distinctions; refund after execution
  requires verified provider fact and scoped entitlement revocation.
  **Implementation, consumer notice, actual delivery evidence, PG contract
  and runtime release are separate from policy approval.**

## This branch's technical implementation

- P1 completed actual **sandbox** payment verification, not a Production
  receipt or live seller activation.
- P2 disabled catalog/read-only inspectors completed; no active Offer/Charge Terms.
- P3 private verified payment/Entitlement Effect candidates exist but remain
  unmounted, with saleability/Saju/Reader prerequisites.
- P4 pure policy classifier, paid Receipt/Reader preflight, private operations
  evidence snapshot, signed cancellation webhook classifier, original payment
  lookup, PortOne read-only GET adapter and cancellation readback shape checker.
  Existing Entitlement Effect and Reader/Grant lock ordering code must be reused;
  these new pieces **do not** mount refund, cancel, revoke or customer filing.
- P5 LIVE HOLD for merchant account/PG final contract/channel and saleable
  Product/Saju/Reader rights: this is NOT a request to re-approve P0-PR-01
  or the refund-policy principles.

## Concrete privacy implementation exception from this branch

`digital_reading_withdrawal_claims_private_v1` is a **new Subject-reachable
table**, added as an internal design candidate after the approved
P0-PR-01 graph. It is *not among the nine P5Y RETAIN tables*; default
service-data DELETE disposition cannot be assumed operationally enforced until
the actual Subject graph, FK deletion order, finalizer and restored-state
reconciliation are updated and verified.

Therefore its DDL is intentionally held at
`docs/operations/candidates/digital_reading_withdrawal_claim_private_v1.sql`
**outside** `supabase/migrations/`. The private intake's
`accountDeletionPolicyDecided=true` is a policy fact, while
`claimDispositionGraphIntegrated=false` is the independent implementation
gate. No owner policy reapproval is required or requested.
No database changes were made to a Production Supabase instance.

## PortOne cancellation-finality handling

The V2 API distinguishes `CANCELLED`, `PARTIAL_CANCELLED` and
individual cancellation `REQUESTED` / `SUCCEEDED` / `FAILED`.
`inspectPortOneV2CancellationReadbackEvidenceV1` checks the shape of
a server GET result, original payment/transaction ID, currency, channel,
verified paid amount and sum of successful cancellation entries.
`inspectPortOneV2CancellationViaGetCandidateV1` performs a bounded,
fixed-origin, redirect-disabled, authenticated read-only GET when explicitly
called by trusted internal operations. Both remain unmounted.

**No matching webhook, GET response or sum of cancelled amounts independently
authorizes a Commerce refund or Entitlement Effect:** original Receipt
ownership, verified provider event persistence/dedupe/ordering, policy outcome,
Reader T2 admission and atomically applied exact Grant lifecycle remain
separate requirements.

### Source links

- P0-PR-01 owner decision: https://github.com/gycha0109-beep/MyeongHa/issues/964#issuecomment-5737913582
- PortOne V2 cancellation status and webhook documentation:
  https://developers.portone.io/opi/ko/integration/cancel/v2/readme
- PortOne V2 payment REST types:
  https://developers.portone.io/api/rest-v2/payment
