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

## Combined production rollout evidence — staged Reader / P2 / P3 / P4

This PR also adds the broader **one-command, explicitly invoked read-only audit**:

- Local source check: scripts/operations/commerce-reader-staged-source-integrity-v1.mjs. Verifies **all 59 reviewed SQL files 1740..2320** against the already approved Git blob manifest. No SQL is applied and no migration history is written.
- Hosted DB history check: scripts/operations/commerce-reader-production-rollout-evidence-v1.mjs. Queries only supabase_migrations version identifiers and pg_catalog metadata, checks that migration receipt state matches the five staged private tables, that private tables have RLS enabled (and FORCE RLS on the three tables whose source migrations require it), and that neither anon nor authenticated has SELECT/INSERT/UPDATE/DELETE access.
- Run: scripts/operations/run-commerce-reader-rollout-hold-audit-v1.mjs. Reuses the P2 operator's independently pinned DB hostname, port, login, trusted CA fingerprint and Node TLS peer verification. The existing P2 Product + Reader + Offer/Charge Terms inspector, five-table presence inspector, and new rollout metadata inspector each run in an independent REPEATABLE READ READ ONLY transaction on one explicitly created DB connection.
- **These are separate transaction snapshots**, not an atomic production sale/payment/Reader-release admission. A mismatch between the two schema probes is a distinct HOLD.
- Read-only results: CURRENT_STAGED_HOLD_OBSERVED (exit 0: exactly the approved not-deployed HOLD), RELEASE_PRECONDITIONS_UNVERIFIED (exit 2), or HOLD_UNVERIFIED (exit 2 on SQL/identity/certificate/manifest failures). Exit 0 is not a launch approval.
- No account, birth profile, paid answer, purchase Receipt, claim, refund or provider payload row is read. No customer/public HTTP endpoint or scheduler is mounted. No operational DB DDL/DML, migration repair, checkout, refund, Saju source issuance, or LIVE toggle is permitted.

The manual invocation uses the **same six P2 audit environment variables** described in COMMERCE_P2_READONLY_OPERATOR_AUDIT_V1.md:

node scripts/operations/run-commerce-reader-rollout-hold-audit-v1.mjs

All outputs keep saleAuthorized, readerDeliveryAuthorized, refundAuthorized, migrationAuthorized and liveAuthorized **false**. P0-CM-03 paid Product approval, Saju Production relationship/natal/general interpretation, separately authorized private Reader migration rollout, functional grants, privacy deletion/restore, legal disclosure, PG contract and LIVE remain separate unresolved gates.

The result must never be consumed as a boolean permission by a checkout or deployment workflow.

## Privileged Reader operation-function ACL readback

The same rollout metadata inspector checks five privileged Reader functions:
paid-delivery prepare, client ACK, refund dispatch reservation, provider response
recording, and completion confirmation. It detects missing/extra functions relative
to the approved S7 / 2310 migration version receipts, and flags any EXECUTE
privilege that is available directly to anon or authenticated.

Customer claim intake/query functions intended for separately authenticated
customer routes are NOT incorrectly classified as internal-only.

Only pg_catalog metadata and migration version identifiers are queried. Existing
private DB Owner identity, account deletion privacy graph, refund policy and
payment settlement requirements remain unchanged. Positive metadata cannot
authorize executing a function, installing a migration, selling or delivering.
