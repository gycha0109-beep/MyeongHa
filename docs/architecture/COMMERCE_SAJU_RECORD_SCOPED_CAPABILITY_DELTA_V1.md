# Commerce Saju Record-Scoped Capability Delta v1

> Status: **APPROVED BY PRODUCT OWNER — IMPLEMENTATION IN PROGRESS (2026-11-07)**
> Track: Commerce P2/P3, Saju Record purchase admission
> Date: 2026-11-07
> Approval: User approved the Record-specific opaque scope recommendation on 2026-11-07.
> Supersedes: nothing. This is a narrow extension proposal to SRC-18, not a silent reinterpretation of it.

## 1. Why a separate delta is required

The current SRC-18 v1 Capability contract supports only `scope_mode = global | fixed`.
It explicitly prohibits client/request-derived dynamic scopes and generic `REQUEST_RESOURCE`
resolution. For a paid right attached to a user-owned resource, SRC-18 requires a separate
Product/Commerce architecture delta and a server-owned resolver.

The Saju purchase work already has a staged, non-deployed Record/Origin ledger:

- `commerce_saju_records_v1`: one immutable Saju Record identity, owner and Birth revision.
- `commerce_saju_purchase_origins_v1`: one Purchase Intent bound to the exact owner, Record,
  Birth revision and original/upgrade kind.
- the Record row lock and revision triggers serialize pending-purchase arbitration and prevent
  a paid Record from silently changing its Birth revision.

That ledger is currently used for collision checks and private quote evidence only. It does not
yet authorize a Record-scoped Grant or consumer access.

## 2. Proposed narrow authority

Add one explicit, Saju-only Capability scope mode:

```text
scope_mode = global | fixed | saju_record
```

For `saju_record`:

- `fixed_scope_key` MUST be NULL.
- The client MUST NOT supply `scope_key`, Record ID as a Grant scope, or an entitlement key.
- The server resolves the target only from the already verified Receipt:
  `Receipt → Purchase Intent → immutable Saju Purchase Origin → Saju Record`.
- The resolver requires exact Subject, Purchase Intent, Record and Birth revision parity,
  a production verified Receipt, and a Product key in the existing 13-product Saju inventory.
- Missing, duplicate, stale, cross-Subject, cross-Record or revision-mismatched lineage is HOLD.
- Non-Saju Product Capability Sets cannot use `saju_record`. Existing `global` and `fixed`
  semantics remain unchanged.

### 2.1 Privacy-preserving scope identity

Do **not** put the user-visible Saju Record UUID directly into `entitlement_grants.scope_key`.

Add a server-generated, immutable, random `entitlement_scope_id` to each Saju Record.
It is never accepted from or returned to the client. The resolver derives:

```text
scope_key = 'saju-record:' + record.entitlement_scope_id
```

This gives the existing `entitlement_grants.scope_key_norm` and effective-entitlement
projection a distinct aggregate per Saju Record without making the Record primary key the
persistent Commerce scope identifier.

The `entitlement_scope_id` is not a new user-facing identifier. Deleting the Record removes
the mapping from that opaque scope to the personal Record; financial Receipt/Grant/Event
retention remains governed by the existing legal-retention policy.

## 3. Grant issuance and lifecycle

Reuse the existing immutable Offer → Capability Set → Purchase Intent v3 pin and the existing
all-or-neither verified Receipt Capability batch. Do not create a parallel entitlement writer.

For each Saju Capability Item:

1. The trusted Commerce writer locks and verifies the original production Receipt.
2. It resolves the unique immutable Purchase Origin and Record-owned `entitlement_scope_id`.
3. It derives the scope key server-side; no request parameter can override it.
4. Existing Entitlement Effect v1 creates the independent Receipt Grant and append-only
   `receipt/granted/ent-event-v2` provenance in that exact scope.
5. The complete pinned Capability Item set remains atomic through the existing batch writer.
6. Provider lifecycle events continue to target the exact original Grant and preserve its
   stored scope; revoke/restore cannot resolve a new Record from client input.

One Receipt continues to use `grant_key = 'receipt:' + receipt.id`.
Independent Receipts for the same Record/field remain independent Grants; revoking one must
not remove access while another valid Grant in that same Record scope remains.

## 4. Read and checkout admission requirements

The private current-owned-fields reader must require all of the following in one authoritative
snapshot:

- exact active Member Subject, Saju Record and current Birth revision;
- immutable Purchase Origin for the exact Record and Purchase Intent;
- production verified original Receipt and pinned Offer/Capability Set snapshot;
- exact Grant source Receipt, `receipt/granted/ent-event-v2` issuance provenance and active
  effective projection in the derived Record scope;
- no refund amount and no unsettled Provider cancellation for that Receipt.

The future Checkout Admission command is a separate server-owned command, not a read-only quote:

1. Require active Member context; never create a paid Guest purchase.
2. Start a short `READ COMMITTED` transaction and lock the exact Saju Record first.
3. Re-read the current Birth revision, active Grants, verified Receipt/refund ledger and all
   pending `created/pending` Purchase Intents for that Record.
4. Recompute the existing 13-product quote and pending-overlap policy from DB authority.
5. Create Purchase Intent v3 and its immutable Purchase Origin in the same transaction.
6. Commit before any external provider handoff. Provider network calls never occur while the
   Record lock is held.
7. Any unknown Product, missing Offer/Capability pin, unsettled refund/cancellation, stale
   Birth revision, ambiguous Grant, overlap or source mismatch returns HOLD with no provider
   charge and no Grant mutation.

The current static `product_offer_charge_terms` authority cannot represent a Record-specific upgrade price difference. Therefore this first admission command supports **original purchases only** and rejects `purchase_kind='upgrade'` until an immutable quote-specific Charge Terms contract is implemented. It also holds any target field already covered by an active Grant, refund evidence or unsettled cancellation. The existing upgrade quote remains `checkoutAuthorized:false`.

No Offer is seeded or enabled by this migration. Provider handoff, customer-facing checkout route, actual charge/refund, and LIVE sales remain separate release gates.

## 5. Privacy and deletion contract

Before any production migration:

- the Record and Purchase Origin tables must be integrated into the same Subject deletion graph;
- account deletion removes the personal Record and the Record-to-opaque-scope mapping;
- no surviving table may retain a reversible Record-to-`entitlement_scope_id` mapping;
- financial Receipts, Provider Events, Grant/Entitlement Events and refund evidence follow the
  existing financial-retention policy and must not be deleted merely to erase personalization;
- deletion, retry, restore and post-delete access denial must be verified together in real PG17.

The exact deletion order and retained financial projection must be proven against the existing
account finalizer before the candidate DDL can be promoted.

## 6. Forward-only implementation status

The approved implementation is additive and forward-only:

| Item | Current implementation status |
|---|---|
| Saju-only `scope_mode='saju_record'` constraint | Implemented in migration 2330; CI pending |
| Opaque per-Record scope identity | Implemented in migration 2330; CI pending |
| Receipt → Origin → Record server resolver in existing Grant writer | Implemented in migration 2330; CI pending |
| Generic Purchase Intent bypass guard and Record-locked original admission | Implemented; upgrades explicitly HOLD |
| Private current-owned-fields reader | Updated to require exact opaque Record scope |
| Account deletion graph | Updated to delete private Record/Origin/link mapping before Birth revisions while retaining financial evidence |
| Quote-specific upgrade Charge Terms | Not implemented; required before upgrade admission |
| Offer seed, public route, provider handoff, LIVE sale | Not activated; separate release gate |

The remaining implementation and verification tasks are additive and forward-only:

- extend the Capability Item scope constraint with the narrow `saju_record` value;
- add the immutable Record scope identity and exact server resolver;
- update the existing Entitlement Effect receipt path and Saju private Grant reader;
- add the Saju Checkout Admission command that creates Intent + Origin atomically;
- integrate the new personal tables into account deletion/restore;
- preserve all current generic `global` / `fixed` and Reader contracts.

Required real PostgreSQL 17 tests:

- Record A purchase grants cannot be counted for Record B, including two Records owned by one Subject;
- cross-Subject, cross-Record and wrong Birth revision Origin/Receipt combinations fail closed;
- client-supplied Record/scope/entitlement values cannot affect the resolved scope;
- a missing Origin or non-Saju Product cannot create a `saju_record` Grant;
- all Capability Items apply or none do;
- independent Grants aggregate only inside the same Record scope;
- revoke one Grant preserves another same-Record Grant and never changes another Record;
- concurrent pending same-Product and overlapping Product admission serializes under the Record lock;
- stale Birth revision, refund/cancellation evidence and ambiguous ownership produce no Purchase Intent;
- account deletion removes the personal mapping, preserves required financial evidence and denies
  post-delete access; rollback/replay is idempotent.

## 7. Approved decision and remaining release gates

The owner approved the narrow `saju_record` scope mode with a server-generated opaque
`entitlement_scope_id` and the Receipt → immutable Purchase Origin → Record resolver.

This does not approve product/Offer activation or live sales. The migration and tests are
reviewed in the current PR and must pass CI before merge. Upgrade admission remains HOLD until
quote-specific Charge Terms are authoritative. No Offer seed, provider charge, refund POST,
public checkout route or LIVE activation is enabled by this architecture approval.
