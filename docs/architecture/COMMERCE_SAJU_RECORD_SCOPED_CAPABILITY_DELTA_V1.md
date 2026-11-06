# Commerce Saju Record-Scoped Capability Delta v1

> Status: **APPROVED FOR IMPLEMENTATION — NOT YET IMPLEMENTED**
> Owner decision: approved 2026-11-07.
> Track: Commerce P2/P3, Saju Record purchase admission.
> Supersedes: nothing. This is a narrow extension to SRC-18.

## 1. Approved decision

Adopt a Saju-only Capability scope mode named `saju_record`. Do not generalize dynamic resource scopes to other products.

A paid Saju right belongs to one immutable Saju Record, not to the Member's entire account and not to a client-provided Record identifier.

## 2. Scope identity

Add a server-generated immutable random `entitlement_scope_id` to each Saju Record. It is never accepted from or returned to the client.

The effective scope key is derived only by trusted server logic:

```text
scope_key = 'saju-record:' + record.entitlement_scope_id
```

For `scope_mode='saju_record'`, `fixed_scope_key` must be NULL. Existing `global` and `fixed` behavior remains unchanged.

## 3. Authoritative resolution

The resolver follows only this verified chain:

```text
production verified Receipt
→ exact Purchase Intent
→ immutable Saju Purchase Origin
→ exact Subject + Saju Record + Birth revision
→ server-owned opaque entitlement_scope_id
```

Missing, duplicate, stale, cross-Subject, cross-Record, revision-mismatched, non-Saju or ambiguous lineage is HOLD. A client cannot supply a Record ID, scope key, entitlement key or owner to override the resolver.

## 4. Grant issuance and lifecycle

Reuse the existing immutable Offer → Capability Set → Purchase Intent v3 pin and existing all-or-neither verified Receipt Capability batch. Do not create a parallel Grant writer.

Each receipt Grant uses the existing `grant_key='receipt:' + receipt.id` identity and is stored in the resolved Record scope. Existing revoke/restore lifecycle changes the exact original Grant and preserves its stored scope.

Independent Receipts remain independent Grants. Revoking one purchase cannot remove another valid purchase for the same Record or affect a different Record.

## 5. Read and checkout admission

The private Saju current-owned-fields reader must verify, in one authoritative snapshot:

- exact active Member Subject, Saju Record and current Birth revision;
- immutable Purchase Origin for the exact Record and Purchase Intent;
- production verified Receipt and pinned Offer/Capability Set;
- exact Receipt Grant and `receipt/granted/ent-event-v2` issuance provenance;
- active effective projection in the derived Record scope;
- no refund amount and no unsettled Provider cancellation.

The future Checkout Admission is a server-owned transaction, not a quote:

1. Require active Member context.
2. Start a short `READ COMMITTED` transaction and lock the exact Saju Record first.
3. Re-read current Birth revision, active Grants, verified Receipt/refund ledger and pending Purchase Intents.
4. Recompute the existing 13-product quote and pending-overlap policy.
5. Create Purchase Intent v3 and immutable Purchase Origin atomically.
6. Commit before external Provider handoff; no network call while holding the Record lock.
7. Unknown Product, missing Offer/Capability pin, unsettled refund/cancellation, stale revision, ambiguous Grant, overlap or source mismatch returns HOLD without charging or mutating Grants.

No paid Guest purchase. `checkoutAuthorized:false` remains until the separate release gate is satisfied.

## 6. Privacy and deletion

Before rollout, integrate Saju Record and Purchase Origin into the account deletion graph. Account deletion removes the personal Record and its mapping to the opaque scope. No surviving personal table may retain a reversible mapping. Financial Receipt, Provider Event, Grant/Event and refund evidence remain subject to existing financial-retention policy.

Deletion, retry, restore and post-delete access denial must be verified together in real PostgreSQL 17 before rollout.

## 7. Implementation sequence and acceptance

1. Forward-only migration: promote the reviewed Record/Origin/refund ledger, add opaque scope identity, and narrowly extend Capability Item scope constraints.
2. Trusted resolver and Receipt Grant application: bind the existing Entitlement Effect v1 path to the exact Receipt→Origin→Record lineage; preserve batch atomicity.
3. Private owned-fields reader: read only the derived Record scope and verify exact Grant/Event/refund lineage.
4. Checkout Admission: lock Record, validate current state and atomically create Intent + Origin; provider handoff remains separate.
5. Account deletion/restore integration.
6. PostgreSQL 17 tests and CI.

Required tests include two Records owned by one Subject, cross-Subject/Record/revision mismatch, client scope injection, non-Saju Product, missing Origin, all-or-none batch, independent same-Record Grants, revoke isolation, pending overlap concurrency, stale revision, unsettled refund, and deletion/restore/post-delete denial.

## 8. Explicit non-activation

This approval authorizes implementation of the architecture above. It does **not** authorize production migration execution, Product/Offer activation, actual checkout, provider charge/refund, public route exposure or LIVE sales. Those remain separate release gates.
