# M1-16 — App-role SELECT, RLS and private Receipt/Grant/Reader data-exposure fence

> 2026-10-17 · Watchtower-Track: `commerce` · Draft-only · no production ACL/credential changes

## Actual question after M1-15

M1-15 established an owned transaction lifecycle for the M1-10 HOLD-only reconciliation: reset pooled state, `READ COMMITTED READ ONLY`, `SET LOCAL ROLE myeongha_api_executor`, one canonical parameterized SELECT, COMMIT/ROLLBACK and connection discard on ambiguous failure. A correct transaction lifecycle **does not imply the application role has permission to read private canonical 1050 Receipt / D2 Entitlement / Reader ledger rows**.

The M1-10 and M1-07 SQL were verified against *fixture-owner PostgreSQL*. That confirms SQL correctness under test-owner privileges, **not actual application visibility**. A new runtime read GRANT or SECURITY DEFINER wrapper is NOT authorized by these Drafts; such a change could expose the provider verified payload, request hashes, full Entitlement Event provenance, Reader selection and other users' purchase records.

## New executable negative authority test

`test/db/official_reader_m1_16_runtime_recovery_read_acl_rls.sh` runs in the existing isolated PostgreSQL 15 Content suite **after** a real synthetic production-marked `1050` Receipt is verified and the private D2 fixture owner has committed precisely one source-backed Grant / Event / Reader Access / Official Reading. It never creates a database role, changes RLS or runs a private Writer under the app.

1. Require CI, localhost `PGUSER=postgres` and a whitelisted disposable test database; require exact five UUIDs and prove the canonical Receipt, active Grant and Reader binding exist as the isolated fixture owner. This avoids a false pass caused by absent records.
2. Inspect PostgreSQL `pg_roles`, `pg_class` and `has_table_privilege` for the *actual* `myeongha_api_executor`. Assert no superuser or RLS bypass, no membership in the fixture owner, and **no direct SELECT** or table-owner rights on `commerce_receipts`, `entitlement_grants`, `entitlement_events`, `standard_reading_reader_access_grants`, `outbox_events`. Print `relrowsecurity` and `relforcerowsecurity` per table to distinguish an ACL-level DENY from RLS-level filtration. It is acceptable for an ACL-denied table to have RLS disabled: the test does **not** misrepresent that as proof of row-level policy correctness.
3. Also assert no app SELECT privilege to provider `commerce_receipts.verified_payload_jsonb`, source `entitlement_events.payload_jsonb`, `outbox_events.payload_jsonb` or Reader Access `request_hash`. RLS does not redact column values from rows that are otherwise visible; this field-level authority is independently relevant.
4. Extract **the exact M1-10 TypeScript `UNKNOWN_COMMIT_READ_SQL`**. Under new PostgreSQL sessions using **`SET SESSION AUTHORIZATION myeongha_api_executor`** (not a superuser still holding `session_user=postgres`), start `READ COMMITTED READ ONLY` and try to query the real canonical `1050` Receipt. Repeat with an unrelated/falsified `myeongha.subject_id`. Both must fail with **SQLSTATE 42501** from the actual protected schema/table ACL, and must not return a Receipt/Grant/Reading result row.
5. Verify original receipt/entitlement event/grant/Reader/outbox counts are unchanged after negative read attempts.

A positive `has_table_privilege` for a protected ledger table or successful full canonical SELECT means **FAIL**, not an invitation to broaden privileges or allowlist the probe. No runtime role gets SELECT just to make this test green.

## What this demonstrates and what remains unreviewed

This is **negative proof** that the current API execution principal cannot directly read the protected reconciliation source tables in the isolated migration/fixture state. This excludes a direct app-side usage of the M1-15 adapter as a deployed production reconciliation service. It does not prove that every potential `SECURITY DEFINER` helper or RPC path is inaccessible, nor does it establish row-level policies for *other* subject-scoped public tables.

The printed RLS metadata is an audit aid; when direct table SELECT is denied, the test's enforced guard is primarily the **PostgreSQL ACL**, not row filtering. A future approved read projection must separately document the exact permitted columns, verified Subject×Receipt admission, RLS and table ownership, definer search path/function transitives, anonymous/service role access, credential network custody, query freshness and audit requirements. No such positive read projection or privilege is added here.

The app-side M1-10 classifier and M1-15 read adapter remain **HOLD-only**: a database `42501` causes `SOURCE_UNAVAILABLE` and `automaticRetryAuthorized=false`, `publicDisclosureAuthorized=false`. This is deliberately preferable to exposing purchase details or silently changing application credentials.

## Regression and non-production boundary

Exact PR HEAD must pass PostgreSQL15 Content new three M1-16 PASS lines and existing M1-03/06/10/11/12/13/14/15 regressions, Commerce Work Track, `db-authority-core` Writer inventory, Governance, Web PR and CI Verify. Skipped PostgreSQL17/Commerce Payment/Entitlement/Runtime checks do not count as passed.

No SQL migration, new GRANT/REVOKE, DB production probe, RLS alteration, login/secret or app D2 Writer route, provider payment/refund, saleable Offer, Saju T8 content authority, paid T2, deployment or Draft merge. The approved separate private issuer is still unavailable.
