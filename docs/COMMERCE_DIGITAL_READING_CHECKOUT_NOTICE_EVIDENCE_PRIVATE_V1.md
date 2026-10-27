# Digital Reading checkout notice evidence — private persistence v1

**Status:** internal DB + server command candidate only. **PUBLIC CHECKOUT OFF / OFFERS OFF / automatic refund denial OFF**.

This slice implements the missing minimum durable evidence bridge without claiming that Commerce/Legal have approved specific notice text, retention policy, release, or a saleable Product. It does not provision a public API endpoint, a Product/Offer activation, or access permissions to run these commands as the normal production executor.

## Existing authorities reused

- `purchase_intents`, `product_offers`, `products`: exact customer, item and pre-payment Intent state.
- `purchase_intent_reader_selections` and `standard_reading_product_specs`: exact server-governed Reader, content bundle and one-item Product specification.
- `commerce_receipts`: later independent verified payment record. A browser/SDK payment result is never an authoritative receipt.
- `assessDigitalReadingWithdrawalReviewV1`: existing read-only manual-review candidate classifier (never automatic denial).

## What was implemented

- `digital_reading_checkout_notice_revisions_v1`: append-only notice and preview/information content hashes plus product-specific revisions. Approval is **not seeded**; all drafts and absent release records are rejected.
- `digital_reading_checkout_notice_presentations_v1`: one immutable server-issued notice unit per Intent. Pins Subject, Product, Reader, content bundle, Product spec, notice and preview revisions, body digests, presentation digest and a cryptographically random challenge **hash only**. The server/DB owns the presentation timestamp.
- `digital_reading_checkout_notice_acknowledgments_v1`: immutable separate acknowledgment event. The actual user's browser confirmation is only an untrusted signal; the authenticated server must match the exact issued challenge. DB verifies matching Subject, Intent, unit, challenge and pre-payment state and stamps time itself.
- `issueDigitalReadingCheckoutNoticePresentationV1` and `acknowledgeDigitalReadingCheckoutNoticeV1`: narrow server-only commands; unexpected browser fields (revision, receipt, identity, time, or authority flags) fail closed.
- `createPostgresDigitalReadingCheckoutNoticeAuthorityPortV1`: private DB resolver/issuer/acknowledger, including same-proof idempotent replay that never rewrites the stored server timestamp.
- `loadPrivatePrepaymentCheckoutNoticeEvidenceV1`: read-only internal checkout preparation gate that requires the exact created/unpaid Intent, enabled Product/Offer, matching approved notice and separate server challenge acknowledgment; it does not activate payment authority or the public API.
- `loadVerifiedDigitalReadingCheckoutNoticeV1`: read-only evidence adapter that yields `server_checkout_snapshot` only when exact notice/ack/product/Reader/owner joins AND a server-verified Receipt later than acknowledgment are available. This is evidence for **manual review only**, not a legal determination.

All three DB tables have RLS enabled, no insert policies, no direct `anon`, `authenticated`, `service_role`, `myeongha_api_executor` or worker table grants. Trigger functions have no PUBLIC EXECUTE. No authorized revision is inserted by the migration.

## Remaining launch conditions (not implied by this implementation)

1. Commerce/Legal approval of exact displayed notice/preview revision, legal applicability, content custody, retention and accessibility. Approved immutable content must be independently retrievable for the stored SHA-256 digest.
2. Product/Commerce must authorize an actual server-rendered checkout notice endpoint and browser acknowledgment flow with Subject verification, protected DB execution roles, idempotency, and no checkout before an accepted server acknowledgment. This PR provides **not-yet-reachable private ports**, not proof an actual buyer saw the text.
3. A separately approved Production Release migration must install approved revisions and limited execution grants; current Product/Offer and v4 purchase command remain disabled.
4. Saju source-owned Production interpretation and exact official Reading admission/Reader delivery authority must open independently.
5. Legal exceptions, Refund/Provider/Grant revocation and verified actual delivery must be established independently. Never infer `DELIVERED_PROVABLE` from T2 commit, generation start, a checkbox, or an internal checkout acknowledgment.

## Verification

- Focused Vitest tests: issue challenge/verify exact server scope; malicious field injection; immutable return reconciliation; concurrent/same-proof acknowledgment replay; verified Receipt/Reader/unit joined read gate.
- Disposable PostgreSQL 17: clean schema migration application plus guard tests (draft notice rejected, approved exact revision accepted, incorrect nonce rejected, append-only record update rejected, no runtime role table privileges).
- This unapproved SQL is excluded from historical CI fixtures only after an exact reviewed Git blob SHA match. The frozen historical Subject-owned data inventory, transitive dependency graph, and their catalog baseline are NOT rewritten. It still must be added to the **future approved** privacy deletion/retention graph before any operational release or inserted records.
- The protected Production deployment workflow requires the precise reviewed main change set and immutable SQL hash to suppress ordinary historical db push for this staged-only PR.
- No Production migration, no real payment, no hosted Auth mutation and no customer/receipt data exported.

The distinction between private, guarded persistence **capability** and real commercial **release/evidence** remains mandatory. `dr_ready=false` remains unchanged.
