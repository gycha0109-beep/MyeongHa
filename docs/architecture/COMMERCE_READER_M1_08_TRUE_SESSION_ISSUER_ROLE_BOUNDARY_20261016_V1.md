# M1-08 — True-session-user isolation for a dedicated private issuer role

> 2026-10-16 · Watchtower-Track: `commerce` · Draft-only isolated PostgreSQL test / **not** production role or credential admission

## Why this test is different

- M1-04: existing Commerce API and Member API `SET LOCAL ROLE` caller scopes have **no D2 EXECUTE**, against an actual `1050`-verified Receipt.
- M1-05: a synthetic `NOLOGIN NOINHERIT` role with **only one D2 EXECUTE** cannot perform a complete `SECURITY INVOKER` issuance because transitive function/table privileges are denied.
- M1-06: a committed private owner issuance/bind can be replayed only with **original persisted Entitlement Event semantics**, preserving Grant/Reading/outbox identity.
- M1-07: any `apps/api` runtime reference to private D2 SQL Writer violates the **hard Reader Writer inventory**; the API-bound source remains read-only/HOLD.
- **Remaining M1-08 gap:** even if some future DB owner creates a private issuer and assigns it BOTH top-level D2 `EXECUTE` privileges, must real application/session principals still be prevented from switching into that role? A superuser-owned test that simply does `SET LOCAL ROLE app_executor` may produce an invalid role-assumption proof, because `SET ROLE` membership is evaluated against the **original session user**, which is still `postgres`.

## New isolated regression

`test/db/official_reader_m1_08_private_issuer_session_assumption.sh` runs immediately after the M1-04 and M1-05 role tests and **before** any private owner Grant is minted for the actual `1050` Receipt.

1. Deny non-CI or non-local PostgreSQL: only `postgres` on disposable `myeongha_test`, `myeongha_official_standard_reader_interpretation_test`, or `myeongha_ci_case_*`.
2. Require real verified Receipt × Subject × Purchase Intent and **zero** purchased Grants.
3. Create a temporary `NOLOGIN NOINHERIT` role `myeongha_m1_08_private_issuer_probe`, granting `USAGE ON SCHEMA public` and `EXECUTE` on **only the two D2 1820 functions**. This is a hypothetical unauthorized future grant, and happens solely in the disposable CI database.
4. For each `myeongha_api_executor`, `myeongha_commerce_internal_executor`, `service_role`, `authenticated`: require non-superuser, no `MEMBER` or `USAGE` in the synthetic issuer, and no inherited EXECUTE privilege. Under a new PostgreSQL transaction, switch the **actual `session_user` and `current_user`** to that actor with `SET SESSION AUTHORIZATION`. Attempt `SET LOCAL ROLE` to the synthetic issuer. Require SQLSTATE `42501` and an explicit role-assumption privilege denial; accepting a false positive where `session_user` remains postgres is forbidden.
5. Verify the canonical Receipt survives with zero Grant/Reader access writes, revoke all hypothetical grants and drop the synthetic role; assert role absence and still-denied runtime D2 access.

This is *not* a successful private issuer and creates **no real login/password/credential**, service role membership, permanent GRANT, migration, webhook, API Writer or production access. It tests lateral privilege **isolation**, not positive execution or deployment. The existing M1-05 `SECURITY INVOKER` dependency gap still blocks issuance even if a top-level role were reachable.

## Required future approval

Before a private production issuer can issue any first Grant, Commerce + Security + DB owners must approve: a separate network and credential owner, actual least-privilege login→execution-role assumption path (without app/service_role membership), transitive `SECURITY INVOKER` dependencies and RLS/ACL, D1 L0→L1 ordering, original verified Receipt/capability source, first validity anchor/expiry policy, atomic D2 issuance/binding, replay and refund recovery, audit and credential rotation. The existing Reader Writer inventory remains enforced.

Saju T8 relationship domain interpretation authority, Offer and Charge Terms, paid T2 and public release remain HOLD. Production permissions, payments, deployment and PR merge: **zero**.

## CI

Check the exact Draft PR HEAD; `DB dependency · content / content` PostgreSQL 15 must execute the new PASS assertions and `db-authority-core` must pass the untouched Writer inventory. Commerce Work Track/Governance/Web PR are independent gates; SKIPPED suites are not PASS.
