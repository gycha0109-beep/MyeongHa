# M1-23 — PostgreSQL 17 actual runtime-role EXECUTE / SELECT fences

> 2026-10-17 · Watchtower-Track: commerce · stacked Draft on M1-22 #2256 · isolated PostgreSQL 17 only. No deployment, live DDL/GRANT, purchases, refund, private Writer operation or paid Reader exposure.

## Why another gate after M1-22

M1-18–M1-22 proved the candidate *catalog* ACL in a disposable PG17 source-tree replay, not the actual behavior of SQL called as the restricted runtime identity. A stock `postgres:17.6` CI database connects initially as a superuser. That identity can accidentally make tests appear to pass even when an app role cannot call its approved function, or can call a private entrypoint.

M1-23 intentionally executes SQL under `SET LOCAL ROLE` within `BEGIN READ ONLY` transactions to check PostgreSQL's real function-resolution, schema privileges and access-control enforcement. It does **not** simulate an independent authenticated connection as each role; the session/bootstrap principal remains CI superuser. It does **not** assert Supabase's managed non-superuser owner/grantor parity.

## What actually executes

`test/db/official_reader_m1_23_pg17_runtime_role_probes.sh` runs only if `CI=true`, `PGHOST=localhost`, `PGUSER=postgres`, `PGDATABASE=myeongha_ci_case_*` and PG17. It refuses production connection credentials and verifies the six existing runtime role records are `NOSUPERUSER`, `NOBYPASSRLS`, and that `current_user` genuinely changes in a `READ ONLY` transaction.

| Probe | Required outcome |
|---|---|
| `myeongha_api_executor` calls `qry_official_reader_unknown_commit_minimal_v1(NULL::uuid,NULL::uuid)` | **SQLSTATE 23514**, the function's own missing-identity input check, proving callable `EXECUTE`. No sensitive subject or receipt is queried. |
| `anon`, `authenticated`, `service_role`, Commerce internal and SeYeon runtime roles call the same minimal read | **SQLSTATE 42501**, denied before code execution. |
| All six runtime roles attempt exact private D2 `internal_apply_official_reader_unified_receipt_v1` and `internal_cmd_bind_official_reader_unified_v1` calls with NULL arguments | **SQLSTATE 42501** for each; accidental grants fail test. No Writer call should enter the function. |
| API identity executes `SELECT * FROM public.<five source tables> LIMIT 0` | **SQLSTATE 42501** on each table, even though no data rows would be returned. |
| Existing M1-18 positive catalog and four rollbacked negative ACL probes | All pass again after role-based tests to detect permission changes. |

The SQLSTATE checks do not rely on localized error wording. The test does **not** make an authorized subject call with actual Receipt data, and no payment, entitlement, refund or Reader rows are created.

## CI integration

`test/db/run_ci_case.sh` routes `official-reader-m1-23-pg17-runtime-executor-acl` to the shared PG17 database suite. It replays reviewed repository candidate SQL (explicit `0860` managed-principal skip), runs M1-18 ACL tests, and performs the runtime-role probes. `scripts/ci/db-suites.json` and `tests/verification-plan.test.ts` add the case without disabling existing coverage or introducing a new workflow.

## Remains HOLD

- **M1-22's 173 live / 217 repository / 45 uninstalled / 1 remote-only restore observation remains historical, not fixed.** Existing private D2 issuer and 1970 API minimal read are not installed in live.
- The real remote `20261008090417` SeYeon restore statement and affected live data are not replayed. No data-safe approved nonproduction Supabase restore, migration-history repair, backup/DR drill or per-domain Owner release approval exists in this test.
- `SET LOCAL ROLE` proves restricted *current_user* SQL privilege behavior, **not** complete Supabase authenticated-session, role delegation/Owner membership or non-superuser migration executor fidelity.
- Successful CI proves only these source-tree role ACL restrictions. It never authorizes production SQL apply, D2 private Writer, Provider charging/refunds or paid Reader.
