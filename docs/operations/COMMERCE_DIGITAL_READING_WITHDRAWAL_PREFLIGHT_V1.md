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
