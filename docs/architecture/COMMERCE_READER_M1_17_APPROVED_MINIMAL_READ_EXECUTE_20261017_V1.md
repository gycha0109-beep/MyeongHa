# M1-17 — Approved minimum Receipt-recovery read capability (EXECUTE-only)

> 2026-10-17 · Commerce Track · Explicit owner approval for *minimal read path*, **not** full ledger SELECT, new issuer execution, paid Reader or production release.

## Approval mapped to least privilege

The project owner authorized opening the narrow read capability required to resume Commerce/Official Reader recovery work. M1-16 established actual `myeongha_api_executor` cannot SELECT any of `commerce_receipts`, `entitlement_grants`, `entitlement_events`, `standard_reading_reader_access_grants` and `outbox_events`. That direct-read ACL DENY must remain.

Migration `supabase/migrations/1970_official_reader_unknown_commit_minimal_read_v1.sql` creates **one** subject-scoped `SECURITY DEFINER` function:
`public.qry_official_reader_unknown_commit_minimal_v1(p_subject_id uuid,p_receipt_id uuid) returns text`.

* **Positive grant:** `EXECUTE` ONLY to `myeongha_api_executor`; no table SELECT, no INSERT/UPDATE/DELETE, no legacy or D2 Writer.
* **Negative rights:** Explicit function EXECUTE REVOKE from `PUBLIC`, `anon`, `authenticated`, `service_role` and `myeongha_commerce_internal_executor`. A guarded migration assertion fails on leaked privileges.
* **Safety preconditions:** The backend MUST have independently verified member/guest identity, used the canonical `begin_member_subject_context_v1` or `begin_guest_subject_context_v1` authority and established a trusted subject transaction context. The function calls `assert_myeongha_subject_context_v1`; mismatch yields `42501`. A user-supplied UUID and editable GUC **alone are not identity verification**. Role `myeongha_api_executor` is NOLOGIN and limited to trusted backend sessions; there is no public route created by this PR.
* **Transaction boundary:** Function only classifies within `READ COMMITTED READ ONLY`; stale `REPEATABLE READ` or writable transactions produce `STALE_SNAPSHOT_UNSUPPORTED`.
* **Data minimization:** No subject ID, Receipt ID, Grant ID, Reader identity/content, hashed selection/request, provider payload, source/event timestamp, raw count or price exits the function. It returns one controlled observation: `SOURCE_UNAVAILABLE`, `NO_COMMITTED_EFFECT_VISIBLE`, `INCOMPLETE_OR_CONFLICTING_AUTHORITY`, `COMMITTED_COMPLETE_REQUIRES_PRIVATE_REPLAY`, `STALE_SNAPSHOT_UNSUPPORTED`.
* **Fail closed:** All outcomes remain `status='held'`, `automaticRetryAuthorized=false`, `publicDisclosureAuthorized=false`. Even a complete committed event cannot authorize new issuance; it is a private replay *candidate*, subject to authoritative D1 reconciliation, cancellation/revocation state and final T2 release gates.

## Query construction and app execution

The function joins the original verified `1050` Receipt to pinned Subject×Intent×Offer×Capability. It checks exact purchased Grant count, original Granted Event, Reader binding, selected character/content bundle, active effective validity, source Provider Effect, outbox consistency and absence of duplicates. A missing canonical Receipt and someone else's Receipt are both `SOURCE_UNAVAILABLE`.

`apps/api/src/official-reader-unknown-commit-minimal-v1.ts` accepts only the enumerated one-row result, never raw source rows. `postgres-official-reader-unknown-commit-read-tx-v1.ts` extends M1-15's existing owned, fresh, `READ COMMITTED READ ONLY` transaction port with a separate **trusted-subject-bound mode**: after fixed API `SET LOCAL ROLE`, it sets the already server-verified canonical subject transaction context then permits only **one** parameterized minimal query with exactly the same subject ID. In default mode the existing M1-10 raw SELECT remains the same HOLD-only negative/fixture path; it is not promoted to app SELECT.

This adds a read-capable, narrow function and its API SQL adapter to the **codebase**, but **no HTTP endpoint, public customer feature, credentials or Worker**. The existing private D2 Writer SQL inventory and D1 issue/bind authority remain unchanged.

## Actual database and deployment distinction

The connected Supabase project `MyengHa` was checked on 2026-10-17. The live project has core payment/entitlement tables, but its actual PostgreSQL catalog had **zero** copies of `internal_apply_official_reader_unified_receipt_v1` while the stacked Draft codebase relies on migrations through `1820` and the later writer closure `1900`. The mere presence of earlier tables is not sufficient to declare the production Reader recovery baseline deployed.

**Do not cherry-pick/apply migration 1970 directly to the live database before reconciling all preceding ordered Commerce Reader migrations and their operational release gate.** Owner approval for a minimal read interface does not authorize out-of-order deployment of a private source projection on an unverified schema or real paid Reader activation. The migration contains the actual positive grant and is exercised against disposable PostgreSQL CI; production cutover requires an explicit, recorded migration baseline parity and positive execution test.

## Required tests

- Unit tests: minimal enum HOLD, scoped API role + transaction context, exact single-query allowlist, wrong subject/invalid ID/DB fault, no private Writer.
- Real PostgreSQL15 Content: same verified 1050 Receipt **before** and **after** D2 owner-only issuance; positive minimal function EXECUTE under true API `session_user`; unauthorized public/service roles denied SQLSTATE `42501`; mismatch rejected and unrelated subject receives `SOURCE_UNAVAILABLE`; stale/writable transactions refused; underlying protected source table SELECT remains denied.
- M1-16 exact raw SQL negative probe, M1-13/14 race, M1-12 first COMMIT ACK fault, M1-06 original replay, M1-15 transaction lifecycle regressions.
- Exact HEAD `db-authority-core`, Commerce Work Track, PG15 Content, Governance, Web PR, CI Verify. PG17/payment/entitlement/runtime suites SKIPPED must never be reported as passed.

## Hard boundaries

**No public RPC authorization, no provider charge/refund, no production database migration yet, no D2 Writer, no production credentials, no new priced Offer, no release of Saju T8, no paid Reader T2 and no Draft merge.** Owner-approved development and executable grant are distinct from a production schema cutover.