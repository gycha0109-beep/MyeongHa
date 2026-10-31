# Commerce Digital Reading — private withdrawal claim evidence v1

Track: `commerce-payment`. Implementation staged on `feat/commerce-payment/roadmap-continuation-20261030`; no LIVE or public route.

## Purpose

Record an immutable, minimal **privately received claim** for a verified, owned, exact purchased Reading unit. It does not determine entitlement to refund or complete the seller's consumer-facing withdrawal intake obligation.

This is the next stage after the private read-only preflight (checkout, Receipt and paid unit identity). It deliberately does not duplicate the existing entitlement effect/event engine, dispute ledger or PortOne payment verifier.

## Implementation

- `docs/operations/candidates/digital_reading_withdrawal_claim_private_v1.sql` (NOT a deployable migration)
  - Append-only private table with an owner-bound Purchase Intent foreign key
  - one source-owned `received` state, reason code and server-controlled timestamp
  - per-Subject HMAC key uniqueness for idempotency
  - exact canonical request hash for same-key conflict detection
  - RLS enabled; PUBLIC, anon, authenticated, service_role, ordinary API, worker and Commerce internal executors are denied direct table access
  - **no seeded claims, no granted endpoint, no authority to refund, revoke or deny**
- `apps/api/src/commerce-digital-reading-withdrawal-private-intake-v1.ts`
  - private, unmounted candidate; requires both `claimDispositionGraphIntegrated=true` and `privateOperationsIntakeApproved=true` from an authorized server operator
  - admission only for exact owned, production-verified PortOne Web Reading unit
  - serializable transaction; complete-visibility and writable-transaction check
  - server HMAC-SHA256 of subject+nonce; request digest excludes raw claim text or birth/Reader content
  - inserts once or compares exact stored immutable claim semantics, then commits
  - COMMIT ambiguity yields `outcome_unknown`, not false assurance of either success or failure
  - never issues a customer acknowledgment, PSP cancellation/refund or Grant mutation

## Important known limitations (not release-ready)

1. `P0-PR-01` is DECIDED (2026-09-19; service DELETE / structural ANONYMIZE / nine Commerce P5Y / encrypted backup P30D). This NEW table is not present in its approved Subject graph or deletion finalizer. The SQL has been MOVED OUT of `supabase/migrations` to a non-deployable candidate. The implementation task is to integrate its DELETE disposition, FK order, and restored-state reconciliation under the existing policy, without asking for policy reapproval. No production application is authorized until this technical integration passes.
2. The current exact-unit resolver requires a precheckout presentation UUID. Customers who lack a record, who used a different historical contract or whose paid Receipt was not verified must **still** have an accessible general complaint/withdrawal path. This internal candidate is not that path.
3. Consumer filing, confirmation/receipt, corrections, support flow and adjudication are not provided by this private DB command. Never tell a customer the request has been received based on a preflight result.
4. No actual digital Reading delivery event source exists. A paid Receipt, a DB T2 COMMIT and a notice acknowledgment are not evidence that the consumer was supplied the content.
5. Provider cancellation and refund amount/partial refund/ordering have not been authorized. The existing verified provider-event entitlement effect primitive must only receive approved, verified final facts, after the Reader/T2 ordering and Legal/Commerce contract are closed.
6. The SQL claims table is append-only. Subsequent decisions must be separate authorized, audited events under an approved lifecycle/retention contract, not in-place alterations of the consumer's original claim.

## Checks

- TypeScript typecheck, focused synthetic candidate tests including replay, conflicts, cross-owner, missing authority, commit ambiguity.
- PostgreSQL 17 isolated disposable DB migration/fixture `test/db/digital_reading_withdrawal_claim_private_v1_smoke.sql`: owner FK, uniqueness, immutable operations, RLS/ACL and server receipt timestamp. No production DB mutation.
- No claim that this candidate is production-mounted, that real payment/refund executed, or that release authority has passed.
