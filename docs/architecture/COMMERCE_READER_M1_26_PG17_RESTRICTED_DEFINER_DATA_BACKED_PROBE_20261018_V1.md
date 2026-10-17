# M1-26 — Restricted SECURITY DEFINER, synthetic verified Receipt data and source SELECT closure

> 2026-10-18 · Watchtower-Track: commerce · stacked Draft on M1-25 #2270. Only disposable PG17 synthetic data. No real Provider integration, payment, refund, entitlement issue or production DB modification.

## M1-25 gap and objective

M1-25 installed the **exact pinned 1970 migration SQL** under a separately authenticated non-superuser migration executor, proving that function creation, ACL grant, and schema-CREATE revocation can work. It deliberately recorded `HOLD_M1_25_DEFINER_SOURCE_READ`: the new SECURITY DEFINER Owner lacked access to the Receipt/Grant/Reader source tables, and a NULL-input guard returning 23514 could not validate any real non-null receipt.

M1-26 tests that distinction concretely against **synthetic data with an actual verified purchase-intent/Receipt/product/capability-snapshot chain**, not merely invented UUID arguments.

## PG17 test boundaries

- Shared CI case `official-reader-m1-26-pg17-definer-data-backed` replays the checked-in repository migration sources into a fresh disposable PostgreSQL 17 database, with the existing **0860** managed-principal skip; no historical remote-only SeYeon SQL or real production data.
- Executes the existing `test/db/official_standard_reading_reader_interpretation.sql` (which uses `standard_love_relationship_reader_authority.sql`) as an isolated synthetic commerce/Reader fixture. These synthetic verified Receipts, purchases, grants and reads do **not** initiate real Provider payments.
- Applies the M1-20 45-source exact-hash preflight and proves the selected synthetic Receipt links to a `verified` purchase intent/product/catalog with a matching capability snapshot.
- Changes *only the disposable test object* `qry_official_reader_unknown_commit_minimal_v1(uuid,uuid)` Owner to a new `NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE` synthetic definer. Grants this owner schema USAGE and the two subject-context helper EXECUTEs (not raw table SELECT).
- With a valid synthetic non-NULL Receipt and a test-controlled subject context inside `READ COMMITTED READ ONLY`, the API invocation must fail **42501** when the Owner lacks required source SELECT. This prevents treating an RPC as functional merely because API EXECUTE was granted.
- For the remainder of the test, the disposable bootstrap grants SELECT on the **eleven exact source tables referenced by 1970** to the synthetic definer Owner *only*. The API role must retain **zero raw source SELECT**. A verified synthetic Receipt must now return one of the documented non-enumerating authority outcomes (`NO_COMMITTED_EFFECT_VISIBLE`, `INCOMPLETE_OR_CONFLICTING_AUTHORITY`, `COMMITTED_COMPLETE_REQUIRES_PRIVATE_REPLAY`), not `SOURCE_UNAVAILABLE` or `STALE_SNAPSHOT_UNSUPPORTED`.
- Nonexistent Receipt remains `SOURCE_UNAVAILABLE` and mismatched subject context is denied **42501**. A later fixture-only source SELECT revoke must restore failure; regrant restores the fixture state. M1-18 positive and four rollbacked negative ACL guards remain mandatory.

## Important limitations

The tests establish **minimum necessary source-read behavior in a disposable synthetic fixture**, not the correct production GRANT or RLS policy. Grants to the temporary definer account are **CI-only** and are not migration proposals, Owner approval or permission to broaden production rights. The fixture sets the Subject context through a trusted harness only; it does not authenticate a browser-supplied UUID or prove API credential verification.

A successful synthetic-data read proves one limited Receipt-authority enumeration path, **not all positive/negative payment, provider cancellation, partial effect, concurrent issuer, exact-once or data-migration outcomes**. No private D2 Writer is executed by this case. This test does not prove complete Supabase managed Owner/GRANTOR identity, 0860 managed-principal parity, real RLS policies or a data-backed approved production-equivalent restore.

Historical live migration discrepancy and Owner HOLD remain unmodified: the dated 2026-10-17 observation contained 173 installed migration versions vs 217 repository SQL files, 45 missing from live, plus one remote-only SeYeon restore version `20261008090417`. The confidential 104KB restore, six empty marker migrations, production data, migration ledger reconciliation, authentic DR drill and 15 independent Owner/recovery decisions remain outside CI.

**Result of CI success is always HOLD for production cutover.** Never apply live SQL, broaden production SELECT/Writer grants, repair history, issue paid entitlements, process real refunds or activate paid Reader on this basis.
