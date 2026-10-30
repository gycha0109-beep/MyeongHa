# Commerce P1 completion / P2 inactive Product hold — 2026-10-29

Track: `commerce-payment`. This document is bounded runtime evidence, **not** permission to activate a Production sale.

## P1 — real hosted Owner sandbox acceptance

The hosted `owner-portone-sandbox.html` completed the actual PortOne KCP TEST path on 2026-10-29 and the Production Supabase catalog was inspected independently.

- Attempt: `10b2962e-48b4-408a-8955-ff3462a41ff6` (`sandbox`, `response_received`)
- Purchase Intent: `3bddc229-8455-44e4-b558-edcdf66fc825` (`verified`)
- Verified Receipt: `44fd72f0-759d-4331-b115-bfe2b1864c2a` (`verified`)
- Exact server-verified provider, money and ownership: `portone_v2`, KRW 1,900, same Subject, same provider transaction
- Receipt count for the Intent: **1**; associated provider event count: **1**
- Rechecking the original Attempt displayed the same Receipt with `(재확인)`; DB count stayed **1**
- Production paid Credit Lots: **0**, sandbox Credit Lots: **0**; LIVE checkout was never activated.

Read-only operations reconciliation `scripts/operations/commerce-payment-readonly-reconciliation-v1.mjs` on the live production database found one sandbox Receipt, no production Receipts, and **zero violations** in Receipt binding, duplicate transactions, active Grant provenance, paid Credit Lot provenance and sandbox paid Credit Lots. Provider-side refund/cancellation and Production fulfillment were **not** tested.

The initial server verification transport failure was reproduced independently in an isolated Worker preview: `redirect:'error'` throws `TypeError` in Cloudflare Workers before network I/O. PR #2725 replaced it with `redirect:'manual'` while rejecting every non-200 HTTP result, including redirects. The sandbox PAID / signed Receipt persisted on the merged runtime, and repeated verification demonstrated server idempotency.

## P2 — read-only Product authority

Decision authority: `docs/P0_DECISION_REGISTER.md`, `P0-CM-03`.

The Production database presently contains:

| Item | Evidence |
| --- | --- |
| Product | `standard.love_relationship`, `reading`, `enabled=false` |
| Semantic slice | relationship / natal / general |
| Reader | explicit selection required; `topic_reader_reading` |
| Capability | `reading.standard.love_relationship.unit.v1`; set v1 |
| Approved list price | KRW 8,900 **in Decision Register only** |
| Saleable Offer | **0** |
| Executable Charge Terms | **0** |
| Retired historical candidate | `saju.general_natal.deep.v1`, disabled + retired |

Use `scripts/operations/commerce-p2-catalog-hold-inspection-v1.mjs` with the existing trusted, RLS-complete Postgres operations connection. It performs one bounded, repeatable-read **read-only** inspection of the canonical catalog and reports `observed_hold` or `findings`. Neither result authorizes checkout, selling, an entitlement Grant, payment capture, or any database mutation. It does not infer the executable price from the decided list price.

## Remaining authority gates

1. Saju production-authorized relationship/natal/general interpretation and public Reading runtime: **blocked**, per Saju's production interpretation authority audit.
2. Product/Reader eligibility policy and Reader-bound paid Reading request/artifact flow must satisfy existing cross-track contracts (#1828 and #1034).
3. Approved executable Product Offer, immutable Charge Terms, paid Content/Reader delivery and refund lifecycle: **not activated**.
4. Verify exact enabled Offer through separate sandbox E2E **after** those upstream decisions and prerequisites; existing 1,900 KRW Owner credit fixture does not qualify as an 8,900 KRW Reading purchase.
5. LIVE merchant, public webhook, paid entitlement/credit issuance and production checkout: **HOLD**.

Do not create an unauthorized Offer, assume Saju semantic meaning, reparent Commerce evidence, enable Production credit issuance, or treat P1 sandbox proof as a LIVE merchant launch authorization.
