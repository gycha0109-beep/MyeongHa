# M1-05 — A top-level D2 EXECUTE grant is not an issuer admission

> Commerce/Reader internal only · 2026-10-16 · Private PG15 CI fixture, no Production changes

## Scope and reason

M1-02/03 demonstrate that the **isolated database owner** can apply a real `1050` verified Receipt through D2 issuance and Reader binding, with an atomic failed-bind rollback. M1-04 demonstrates that both application `SET LOCAL ROLE` identities cannot execute D2/legacy issuance.

The next open question is whether a *dedicated least-privilege role* could be enabled by simply granting top-level D2 `EXECUTE`. In `1820`, D2 wrappers use `SECURITY INVOKER` and depend on private scope/lock helpers and protected Commerce/Reader tables. Top-level access must not be confused with complete transitive permissions.

## New isolation test

`test/db/official_reader_m1_05_invoker_execute_only_probe.sh`, called immediately after M1-04 and before any owner-issued Grant:

1. Verify the exact `1050`-persisted Receipt, Subject, Intent and zero Grants.
2. In a disposable PostgreSQL 15 database only, create a **temporary NOLOGIN, NOINHERIT role**, with solely `USAGE ON SCHEMA public` plus `EXECUTE` on `internal_apply_official_reader_unified_receipt_v1`. Require protected Receipt/Grant table DML to remain denied.
3. Prove with `SET LOCAL ROLE` and a *real Receipt* that the new role can enter the top-level wrapper but is denied deeper by SQLSTATE 42501 from invoker transitive ACL; it must not create any Grant or Reader binding.
4. Remove both test-only grants and the test role; require catalog role absence; permit subsequent M1-03 owner-only recovery test unchanged.

This is not D3e's broad service_role or indirect SECURITY DEFINER audit; it tests the *specific proposed issuer* privilege assumption against the actual integration fixture. The expected result is **denial**, not fulfillment.

## Owner decisions still required

To build a production-equivalent issuer, Commerce/DB/Security owners must approve a narrowly scoped **private issuer execution boundary** (explicit role ownership and session credentials, safe function privileges and transitive dependencies, stable input/receipt ownership, one transaction for Grant + Reader bind, Source/Release checks and rollback, worker lifecycle/observability). Neither granting the generic Commerce role nor mechanically adding `EXECUTE` to a new role proves this.

Real protected table grants, a SECURITY DEFINER gateway, production cutover, PortOne payment activation, and T2 public disclosure all remain **HOLD**. This test creates **no migrations** and deploys **no role/ACL changes**. PG17, deployed credential custody and Data API reachability are not proven.

## CI

Record exact PR HEAD and the **PG15 Content DB dependency** result. A passing negative probe proves only that `EXECUTE` alone is insufficient. Whole CI is PASS only once all required jobs finish.
