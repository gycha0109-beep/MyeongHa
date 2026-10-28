# Confirmed chat-credit contract and fulfillment — 2026-10-28

Track: `commerce-payment`. This records existing approved terms; it creates no
new Product, price, expiry policy or LIVE checkout permission.

## Confirmed terms

Source: merged [PR #2635](https://github.com/gycha0109-beep/MyeongHa/pull/2635),
`20261027101000_chat_credit_paid_validity_and_verified_mint_v1.sql`, existing catalog
and charge terms, current Production DB readback, and the user's October 28
confirmation that payout must activate after implementation and required checks.

| Contract | Existing value |
|---|---|
| Product | `chat_credits_300_v1`, type `credit` |
| Provider external SKU | `myeongha-chat-credits-300-v1` |
| Offer / Capability Set version | `v1` |
| Charge Terms | `krw-1900-v1`, KRW 1,900, one-off |
| Purchased credits | 300, never expire |
| Signup reward | 50, 30 days |
| First verified paid Reading reward | 150, 90 days, once per Member |
| Delivered chat reply cost | Existing 10-credit contract; no new chat activation |

The credit Offer exists with immutable Charge Terms. It is distinct from the
Reading-specific `P0-CM-03` activation frontier. Reading/Character readiness is
owned by those tracks and is not reclassified as a new credit pricing decision.

## LIVE payment and credit fulfillment are separate

LIVE checkout, actual monetary transactions, PG operational-mode changes and
public LIVE webhooks stay HOLD. Product/Offer sale flags remain disabled.

Receipt fulfillment is authorized after implementation/security verification;
it does not require another product-policy approval. It cannot use sandbox
Receipts, browser callbacks, customer-supplied price/Offer/environment or arbitrary
operator grants. It does not create a payment or call a cancellation API.

`POST /api/me/credits/portone/fulfill` accepts only `{receiptId}` for the verified
Member. The existing subject transaction supplies owner identity; the narrow DB
command resolves the existing fixed Offer and approved non-expiring terms.
The internal mint RPC stays inaccessible to API/REST roles.

The DB checks verified Production PortOne/Web Receipt, active normalized evidence,
exact immutable Intent/Charge Terms/Capability and Attempt transaction binding.
Current sales flags or mutable display-price cache do not erase obligations from
an already server-verified purchase. New purchase creation still requires sales
activation and existing live guards.

Subject/Receipt locking and the existing globally unique Credit Lot source make
retries/concurrent requests issue once. A failed transaction rolls back and can
be retried from the same verified Receipt. Replay reports zero newly issued
credits and returns the original Lot. No second ledger or new normalization exists.

## Verification and rollout

- API/HTTP direct tests: 14 passed; root build TypeScript check passed.
- Isolated PostgreSQL 18: 199 baseline migrations plus staged credit schema and
  the new function migration applied. The existing PG17 harness's dedicated
  birth-owner exception was used; this is not a full PG18 platform acceptance.
- Actual two-connection concurrency, replay, rollback/retry, other-owner denial,
  unknown/sandbox Receipt denial, role ACL and non-expiring 300-credit checks passed.
- CI must repeat the Commerce DB case on its pinned PostgreSQL runtime.

The separate `Production Commerce Receipt Fulfillment` workflow admits only an
exact main SHA and pinned function migration. It pins the observed old function
definition, checks the new definitions/ACL, and records only its own new migration
atomically. It never runs `db push`, repairs historical versions or creates new
roles. Deployment itself must mint zero credits. Unknown state fails closed.

Historical migration admission remains in force. This rollout is function-only;
it changes no sale flags, payment channel, live credentials or webhook access.
Operational verification and the real KCP PAID/Receipt flow remain separate from
isolated synthetic DB evidence. Full refund/revocation and provider reconciliation
are not completed by this fulfillment implementation.

Emergency stop: revoke API execution of the narrow fulfillment command; preserve
all existing Receipt/Lot records. Restore the reviewed prior private mint definition
only through a forward deployment. Never delete migration history or paid Lots to
roll back. The rollout's definition/hash mismatch guard blocks automatic replay
after such a stop. The original private function is preserved in the approved
`20261027101000` source and its observed Production definition fingerprint is pinned.
