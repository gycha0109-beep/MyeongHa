# Commerce P3/P4 production Reader schema HOLD — 2026-11-03

Track: commerce-payment. This records a **read-only schema inventory**, not permission to apply SQL or to launch sales.

## Observed operational database evidence

On 2026-11-03, the connected MyengHa Supabase PostgreSQL 17 production project was queried with one fixed, **SELECT-only** `to_regclass` statement. No customer row, private provider event, credential or payment amount was accessed. The following tables were **not present**:

| Reader dependency | PostgreSQL table | Observed |
| --- | --- | --- |
| P3/S5 encrypted paid answer storage | `public.official_reader_paid_answer_bodies` | absent |
| P3/S7 private delivery and ACK | `public.official_reader_paid_delivery_attempts_v1` | absent |
| P4 exact approved refund dispatch | `public.commerce_reader_full_refund_dispatches_v1` | absent |
| P4 customer's private withdrawal claim | `public.digital_reading_withdrawal_claims_private_v1` | absent |
| P3/S3 Saju source proof | `public.official_reader_s3_source_authority_receipts_v1` | absent |

In a separate read-only aggregate query for Product `standard.love_relationship`, the actual catalog had **one inactive Product**, one matching standard reading spec, one matching capability, **zero Offers and zero executable Charge Terms**. The previously retired legacy candidate remained retired. This confirms the intended P2 **HOLD**, not a pending paid sale.

## Implementation

`scripts/operations/commerce-reader-production-schema-hold-preflight-v1.mjs` provides a fixed internal PostgreSQL read-only transaction query. It checks the five required named tables only and returns `schema_incomplete` / `schema_present_unverified` with bounded identifiers; customer data, claims, Grant contents and raw provider records are never read. Absent or malformed evidence fails closed, the transaction is rolled back, and all sale / paid Reader delivery / refund / LIVE permissions remain `false`.

Even full table presence **does not prove** that migrations, RLS, function grants, official Saju Production interpretation rights, exact Reader rights, real paid delivery, refunds, legal disclosure, merchant contract, or hosted operational E2E are complete.

## Release constraints

- The existing Reader-specific 1740–2320 SQL production deployment restriction remains in effect; **do not use schema absence as permission to run migrations**.
- P0-CM-03 individual Product approval remains open. KRW 8,900 is a decided list price, not immutable approved Charge Terms.
- P0-PR-01 deletion policy and refund principles are already decided and are not being re-opened.
- No public payment, customer delivery, refund, or withdrawal route is enabled by this work. LIVE stays HOLD.

Next: review any separately authorized Reader migration/production rollout prerequisites before an actual schema apply. Until that authorization and the upstream Saju and product-sale authority exist, remain blocked at the operational release boundary.
