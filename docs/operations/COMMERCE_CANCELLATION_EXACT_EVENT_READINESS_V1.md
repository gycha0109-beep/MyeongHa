# Commerce Payment — exact cancellation event readiness (2026-10-31)

Track: `commerce-payment`. Branch: `feat/commerce-payment/refund-event-sequencing-20261031`.

## Purpose

This unit checks **whether a previously persisted cancellation-tagged Commerce Provider Event can be related to the original verified Production Reading Receipt and exact purchased Grant**, rather than inventing a new refund ledger or executing an entitlement mutation.

The implementation `scripts/operations/commerce-cancellation-exact-event-readiness-v1.mjs` uses only the existing `commerce_provider_events`, `commerce_receipts`, `entitlement_grants` and `entitlement_events` schema from the Commerce authority migrations.

A privileged operations-only PostgreSQL identity opens a bounded **repeatable-read, read-only** transaction; no public HTTP endpoint, payment cancellation request, provider secret, new migration, grants or persisted object is introduced.

## Identity and ordering

1. Match a **single exact** existing `portone_v2` provider event by its canonical `external_event_id` in the Production environment.
2. Require its `resolved_receipt_id`, Subject and original provider transaction to match the verified Production Receipt. No cross-Subject or unrelated transaction linkage.
3. Check `resolution_source_type=receipt`, event verification status, and existing provider ordering key.
4. Count exact purchase Grants linked to that Receipt, then count **only revocation events referencing the exact same Provider Event ID**. Do not revoke a different Reader purchase or general Chat.
5. Report whether the source event is review-ready, missing, unverified, unordered, inconsistent, or already has exact-source revocations — **without authorizing any additional action**.

## Hard limits

- A signed webhook or a verified payment readback does **not** imply that the corresponding cancellation Provider Event has been stored. The previously added offline signed-event → PortOne GET flow does not persist cancellation events. Therefore this inspector may legitimately report `canonical_event_missing` until the existing event persistence contract is extended for verified cancellation facts.
- Existing `cmd_persist_verified_payment_evidence_v1` is a **paid payment / Receipt** persistence command, not automatically a refund evidence writer. Do not reuse it for cancellation by misrepresenting event type or payment status.
- The inspector cannot establish final refund amount, consumer reading delivery, partial/separable refund legality, idempotent cancellation-event insertion, or safe Entitlement Effect ordering by itself.
- Every output explicitly carries `grantRevocationAuthorized=false`, `providerRefundAuthorized=false`, `writesPerformed=false`.
- Production checkout, signed cancellation ingress and refund execution remain unmounted. Approved P0-PR-01 privacy/refund policy should not be re-approved.

## Verification and next implementation

`node --test test/commerce-cancellation-exact-event-readiness-v1.test.mjs` exercises exact source lineage, replay observation, partial/pending tags, missing/unverified/ambiguous event, provider ordering and RLS-complete role enforcement. Future work must construct and verify an **authorized cancellation provider event persistence contract**, deduplicate by provider event ID, tie its ordering to the Receipt and Reader/T2 lifecycle, and only then invoke the existing Entitlement Effect application with a legal outcome. No new lifecycle events are created here.

## 2026-10-31: stitched operations-only readback

The existing `reconcileSignedCancellationPrivateV1` flow now invokes this exact stored-event audit **after** the signed PortOne notification, original verified Production Reading Receipt, and authenticated provider GET have all passed. It forwards the signed event ID, the original verified transaction ID, and the **signed event type** as exact matching keys.

The internal response distinguishes `canonical_event_missing`, `canonical_event_unverified`, `provider_ordering_unresolved`, `verified_event_review_candidate`, and `exact_event_revocation_observed`. Missing privileges/invalid audits fail closed. None authorizes a refund, provider cancellation POST or Entitlement Effect. No new public HTTP endpoint is mounted, and no database write or migration is introduced.

**Remaining:** an audited cancellation event persistence/idempotency command and legally authorized exact-grant effect execution, plus separate integration of the proposed new private withdrawal-claim table into the approved P0-PR-01 deletion graph.
