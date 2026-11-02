# Commerce paid Reading checkout-notice audit v1

Track: `commerce-payment` — private, RLS-complete, read-only operations inspection.

## Purpose

The generic Receipt/Grant reconciliation checks payment provenance and paid credit
minting. It does not inventory **pre-checkout disclosure evidence** for the exact
paid Digital Reading unit. This inspection covers that distinct legal/Commerce
release risk without claiming legal compliance or promoting an inactive Product.

Implementation: `scripts/operations/commerce-paid-reading-notice-audit-v1.mjs`.

Run `inspectPaidReadingNoticeEvidenceReadOnlyV1(client)` using the existing
approved, full-visibility PostgreSQL operations connection, with pinned TLS root
CA. No public HTTP route, new role, GRANT, migration, job, provider API call or
mutation is part of this work.

The function starts a repeatable-read READ ONLY transaction with a 10-second
statement timeout, verifies read-only mode and complete visibility, and always
rolls back. Invalid result shape/DB error fails the inspection; it is not PASS.

## Aggregate output

- `productionVerifiedReadingReceipts`: verified PortOne V2 production Web
  Receipt rows for a canonical Standard Reading with `topic_reader_reading` units.
- `missingPinnedReaderSelection`: above rows lacking the immutable purchase
  Reader selection (a release-critical gap).
- `missingPrecheckoutNoticePresentation`: no exact same Subject/Intent/Product/
  spec/Reader/bundle presentation **before** server-verified payment timestamp.
- `missingOrInvalidNoticeAcknowledgment`: a presentation exists, but its
  exact unit/challenge, approved revision digests and prepayment acknowledgment
  chronology cannot be established.

All are string counts. There are no customer IDs, Saju data, payment IDs or
card/PG payloads in the output.

A nonzero deficiency counter produces `review_candidates`, never automatic
refund denial or entitlement revocation. A zero result means only that the
current DB query observed no such discrepancy: it cannot prove provider-side
settlement, actual consumer delivery, statutory withdrawal-restriction compliance,
or the absence of unrecorded complaints.

## Release and caveats

- Actual launch Product `standard.love_relationship` remains disabled. No
  executable Offer, public paid Reading, or approved live refund workflow exists.
- A valid historical checkout acknowledgment is not proof of consumer content
  delivery and must not be turned into `DELIVERED_PROVABLE`.
- No provider cancellation, refund, disputed-charge resolution, Grant mutation
  or consumer request recording is performed.
- Synthetic unit tests validate the SQL selection boundary and fail-closed
  operation behavior. The full Postgres production-role read and Legal/Commerce
  acceptance remain separate requirements.
