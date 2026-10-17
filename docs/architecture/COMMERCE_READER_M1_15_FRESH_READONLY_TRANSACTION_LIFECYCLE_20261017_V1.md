# M1-15 — Owned READ COMMITTED READ ONLY transaction lifecycle for unknown-COMMIT recovery

> 2026-10-17 · Watchtower-Track: `commerce` · Draft, no approved operational issuer credentials or Reader release

## Specific gap remaining after M1-14

M1-14 showed that a `REPEATABLE READ` reader may continue to observe **zero purchased rights after another session actually committed the first Receipt-backed Grant and Reader binding**. M1-10's classification rejects a returned `repeatable read`/`serializable` row and always holds. However, the existing injected transaction port only provided an `execute(callback)` signature: it did **not** force the *calling execution layer* to create or end a fresh READ COMMITTED transaction. A future caller could accidentally reuse a pooled connection containing a pinned snapshot, aborted transaction or stale session role.

## New fail-closed TypeScript execution adapter

`apps/api/src/postgres-official-reader-unknown-commit-read-tx-v1.ts` exposes:
- `createOfficialReaderUnknownCommitReadTransactionV1(pool)`: supplies the already existing injected read port. It creates **no pool** or credentials itself, and does not route any user requests.
- `reconcileOfficialReaderUnknownCommitWithFreshReadV1({pool,receiptId})`: opt-in read-only wrapper around the existing M1-10 HOLD classifier. There is no issuance, entitlement promotion or public disclosure API.

For each independent call:

1. **Acquire a pool connection** for exclusive use, and send `ROLLBACK` to clear any inherited transaction and prevent leaked old snapshots.
2. Require `BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED READ ONLY`.
3. Require `SET LOCAL ROLE myeongha_api_executor`, never a private D2 issuer role, `service_role`, `postgres` or an arbitrary caller-chosen role.
4. Expose a callback query facade that accepts **exactly the original M1-10 canonical Receipt source SELECT**, precisely one time, with one Receipt string parameter. The SQL is checked against a strict predicate derived from the existing constant; arbitrary SQL, a second SELECT, or an INSERT/UPDATE is refused *before it reaches the DB*. PostgreSQL READ ONLY separately prohibits transaction writes.
5. `COMMIT` on success, `ROLLBACK` after a failed query/role/callback, and **always release** the pooled connection.
6. **Discard** the connection if the initial pool RESET, BEGIN or COMMIT acknowledgement is uncertain, or if ROLLBACK fails. A failed COMMIT does not imply the source state is absent; the M1-10 classifier converts failures to non-authorizing `SOURCE_UNAVAILABLE` HOLD.

This is **not** permission for the app role to select protected rows in production. Existing PostgreSQL ACLs may deny the canonical read entirely, in which case the response must remain HOLD. The Reader Writer inventory stays untouched and denies any API private D2 issuer/binder reference.

## New test coverage

`apps/api/src/postgres-official-reader-unknown-commit-read-tx-v1.test.ts` checks the ordered SQL lifecycle, zero connection acquisition for invalid IDs, repeated calls acquiring a lease and resetting, strict canonical one-query acceptance, malformed/injected SQL rejection, role/query/BEGIN/reset/COMMIT failures, rollback and connection discard on uncertain outcomes. Existing M1-10 stale snapshot unit tests remain.

`test/db/official_reader_m1_15_readonly_pool_lifecycle.mjs` executes against the **real disposable PostgreSQL 15** before the M1-12 successful first issuance:
- Deliberately return a pool connection holding `REPEATABLE READ READ ONLY` without closing its transaction.
- Reacquire the **same backend PID** through a one-connection `pg` pool. Explicitly reset the old transaction, begin `READ COMMITTED READ ONLY`, set local app role, require isolation/read-only/current user and **no API D2 issuer or binder EXECUTE**.
- COMMIT and release; next lease provokes a real PostgreSQL `22012` query error, ROLLBACKs it and releases.
- Reacquire the same backend PID and verify no inherited aborted transaction, no sticky app role and no sticky READ ONLY mode.

The existing M1-13 in-flight first issue + competing lock `55P03`, M1-14 stale snapshot across M1-12 real TCP first-COMMIT-ACK loss, M1-06 exact immutable effect semantics, M1-10 source SELECT and M1-11 ACK replay fault continue unchanged.

## Approval / non-authorization

The test uses fixture PostgreSQL owner `postgres` to set the ordinary API role **only inside disposable CI**. This does not establish actual production credentials, an available application reader ACL, `SECURITY INVOKER` issuance permissions or any new positive access path.

Future production integration still needs an approved read-only credential and source row access model, plus owner-reviewed credential custody and transitive grants. Issuance via a private execution identity, first Grant validity time/expiry policy, Offer and Charge Terms, provider cancellation, Saju production T8 interpretation authority and paid T2 stay HOLD.

**No migration, production SQL role/ACL change, live payment, private Writer activation, deployment or Draft PR merge.**

## Exact-HEAD acceptance

Require Commerce Work Track TypeScript/Vitest and new lifecycle cases, PostgreSQL15 Content log for **both** M1-15 PASS lines and M1-13/14/12 regressions, DB Authority Core Writer inventory, Governance, Web PR and CI Verify. PostgreSQL17/Commerce Payment/Entitlement/Runtime suites skipped by CI routing remain unverified.
