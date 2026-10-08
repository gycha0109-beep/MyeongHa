# MyeongHa Web user journey hardening — staged execution

Owner coordination: UX / saju-bridge / character-memory / commerce / face-reading / CI.
Baseline: `main` at `ca455c76073cba3c01752d539b27e5f7f0403d01`.

## Stage 1 — honest discovery and supported entry (this PR)

- Home '이번 달' feature no longer sends users straight to a non-admitted monthly Reading route. The featured action points to the currently admitted General Natal Preview route and clearly says monthly delivery is pending.
- Saju hub marks five currently admitted Preview request labels distinctly from topics requiring missing input UI or unavailable Reader/Reading releases. These labels are **presentation**, not entitlements, guaranteed results, or server eligibility.
- Golden Master IA and exact route identities remain. Unsupported topics may be visited for explicit availability explanations, never mapped silently to general Preview.
- Existing Records sample fallback is already loopback-only (`localhost`, `127.0.0.1`, `::1`); do not modify production path to solve a non-issue.
- Acceptance: Static mapping regression + Golden Master structure + Web CI/Integration + Production canary for featured link and topic state.

## Stage 2 — standard Saju product → governed Reader interpretation (blocked)

Owner: Saju/Character + official Reading authority. Existing `ReaderInterpretationPreview` public route is intentionally withheld (off / internal preview). **Do not activate by frontend flag.**
- Establish approved product/catalog/reader grant, exact subject-bound official Reading issuance, single-reader-owned thread and source-provenance association.
- Publish reviewed server dispatcher and Vercel route only after release authority passes.
- Consume server-returned Reader identity and validated utterance; support protected fallback, blocked entitlement, and record reentry.
- Acceptance: approved Reader A/B differ in *delivery/presentation* while the canonical Saju source meaning remains invariant; paid authorization and history are tested across web/mobile.

## Stage 3 — paid product lifecycle and account UX (blocked)

Owner: Commerce + UX. Implement and publish product quote, purchase intent, PortOne checkout handoff, server verification, entitlement bind, fulfillment, records, cancellation/refund and support with idempotent reentry. Server payment primitives alone do not establish live checkout. Never expose a buyer CTA before production eligibility and purchase routes are verified.

## Stage 4 — Face intake and governed Reader result (blocked)

Owner: Face engine + UX + privacy. Needs consent, client/server image byte metadata removal, size/type validation, retention/deletion contract, authenticated upload, result admission and Official Reading lineage. Web/Native photo selection does not equal server analysis; do not transmit images before the approved intake is live.

## Stage 5 — web release audit

- Real browser E2E: guest → birth → supported Saju Preview; Member login → records → official archive; Reader paywall/checkout/fulfillment after gates; Face only after intake approval.
- Verify zero fake recent-conversation, recommendation or activity claims; integrate recent Chat only through server-owned history authority.
- Complete legal/privacy/retention/refund/customer-support navigation before payment or photo upload release.
- Test responsive layout, light/dark contrast, network errors, session expiry, and accessibility.

### Definition of done

(A) Surface/state integrity: pass tests and manual UI review.
(B) Functional integration: source owners approve routes, provenances, authorization, and real requests.
(C) Production: deployment and authenticated user journeys verified; CI alone is not live proof.
Blocked stages remain **blocked**, even if presentation code is present.
