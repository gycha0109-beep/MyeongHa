# Digital Reading withdrawal preflight — private, read-only v1

Track: `commerce-payment`. Implemented on the existing Commerce Payment continuation branch, without enabling paid checkout or refund.

## Scope

`prepareDigitalReadingWithdrawalReviewV1` separates untrusted customer intent from immutable, subject-owned purchase authority. It is an **internal preparation for eventual refund intake**, not a receipt or acknowledgment of an actually submitted refund request.

1. Accept an authenticated canonical Subject ID and bounded `purchaseIntentId`, `unitId`, and reason. Client-provided subject, product version, price, settlement and delivery status are rejected.
2. Resolve the exact *owned and verified* Purchase Intent + unit using server authority. A missing, unverified or cross-subject purchase returns the same `not_admitted` shape; no cross-owner existence disclosure.
3. Fetch the previously stored notice snapshot and durable delivery evidence from independent server-owned sources, for the same immutable purchase unit. The provided evidence port **must** implement authoritative DB joins and access controls; its TypeScript interface alone proves neither.
4. Reuse the existing `assessDigitalReadingWithdrawalReviewV1` classifier, which separately handles statutory exceptions and separable undelivered parts. Missing notice or delivery evidence is a manual evidence-review state, never an automatic denial.
5. Return a generic review classification with no private IDs, raw PSP evidence, user narrative or timestamp.

The result always keeps `requestRecorded=false`, `providerRefundAuthorized=false`, `entitlementMutationAuthorized=false`. No caller is entitled to represent a `manual_review_candidate` as a submitted claim or a legal disposition.

## Deployment and release gates

- `publicRouteMounted=false`, `requestPersistenceEnabled=false`, `paymentRefundEnabled=false`, `grantMutationEnabled=false`.
- No public endpoint, RLS privilege, migration, PortOne refund/cancel call, entitlement mutation, or new Offer/Charge Terms.
- Real refund request acknowledgment, auditable immutable claim record, consumer correction/cancellation UX, provider cancellation, delivery-event storage and legal notice remain separately blocked by Product/Legal/DB/Commerce authority.
- The request `unitId` is a bounded opaque identifier (not an asserted UUID or final Product contract). Actual ownership resolution must be bound to an approved product-specific DB contract.
- Before installation in any runtime, provide reviewed owner-scoped database adapter, authorization and current-Grant concurrency tests, durable complaint intake semantics, and real legal/Commerce acceptance.

## Validation

`test/commerce-digital-reading-withdrawal-review-preflight-v1.test.ts` checks request whitelisting, exact owner binding, missing and cross-unit evidence, customer statutory reasons, unavailable authority, and false approval flags. The existing withdrawal classifier suite is run alongside it.

No LIVE merchant readiness or paid Reading delivery is claimed by these tests.

## Private PostgreSQL evidence integration — staged continuation

The following components are now available **in the repository only**:

- `apps/api/src/postgres-digital-reading-withdrawal-evidence-private-v1.ts` reads the exact production-verified PortOne Receipt, immutable owned Purchase Intent, selected Reader and historical checkout presentation under one caller-supplied operations query connection.
- The existing `loadVerifiedDigitalReadingCheckoutNoticeV1` supplies only the matching server-approved acknowledged notice, using the same transaction.
- `apps/api/src/commerce-digital-reading-withdrawal-private-transaction-v1.ts` owns a `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` and mandatory rollback; it never commits an intake, writes a provider command, or publishes consumer content.
- The delivery port deliberately returns `null` because no approved durable paid-Reading consumer-delivery source currently exists. A completed payment or T2 COMMIT is not delivery.
- The private owned-unit resolver restricts to `portone_v2`, Web, `environment=production`, a verified Receipt and equal immutable Intent/Receipt money; **the historical 1,900 KRW sandbox purchase is excluded**. Current live Product Offer remains disabled and no Production paid Reading units are expected.
- A historical unit without a pre-checkout presentation cannot be safely bound by this exact-unit resolver. It must not be described as ineligible for a statutory refund; a separate general claim intake and missing-notice complaint route remain necessary.

The operations connection is **not** the ordinary API executor, because the current notice tables intentionally have no ordinary API SELECT privileges. This integration is unmounted and requires an independently approved trusted, complete-visibility operations reader. No execution privilege changes, public routes, grants, schema migrations, data writes, or PortOne cancellation calls were introduced.

Acceptance is limited to TypeScript checks plus deterministic mock PostgreSQL query/transaction tests. Live PostgreSQL RLS/integration acceptance, durable claim recording, Legal notice, final purchased-unit authority, real delivery proof and refund-to-Grant ordering are still unresolved. Therefore **nothing above is consumer refund intake or LIVE refund readiness**.
