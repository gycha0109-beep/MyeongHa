# CI authority-core disposable template cache and profiling — 2026-10-17

## Scope

The PostgreSQL 15 `db-authority-core` job runs `test/db/run_authority_core.sh`. Previous real integration runs #2214/#2215/#2216/#2219/#2221 showed 305–318 seconds in the full job. Most of that time was inside the authority-core script, not package install or initial migration application.

This is a **conservative, measured change**, not a claim that the full ~5 minutes has been eliminated.

## Work eliminated

- There are **38 unchanged calls** to `run_isolated_case` in the script. Each case still receives a newly cloned PostgreSQL database from the same migration-applied template, with the same local `PGDATABASE`, independent-test scripts, fail-closed behavior and per-case drop-on-exit trap.
- Previously `ensure_isolated_template` ran *inside every case subshell*. Even when the template already existed, every case repeated a `pg_database` existence query.
- Now template existence/creation and migration replay happen **once in the parent shell**, and `isolated_template_ready=1` is retained for later cases. The initial existence query remains; subsequent cases reuse the established result without skipping DB clones or their cleanup.
- The top-level `EXIT` cleanup still drops the disposable template. Any failure before ready status prevents reuse and aborts the CI step. No production DB connection, credential, ACL, RLS, migration, or workload policy changes are introduced.

The expected saved overhead is approximately 37 redundant existence queries, not 37 PostgreSQL migrations or full test runs. The impact on end-to-end time must be measured on GitHub Actions before asserting a speedup.

## Stage and isolated-case timing

The `CI` workflow enables `MYEONGHA_AUTHORITY_PROFILE=1` **only** for the authority-core step. Profiling uses Bash's integer `SECONDS` timer and only writes safe stage labels, disposable test database names and timings:

- `AUTHORITY_CORE_STAGE stage=<label> duration_seconds=<n> total_seconds=<n>`
- `AUTHORITY_CORE_CASE db=<disposable name> duration_seconds=<n>`

Five non-mutating stage boundaries cover baseline/early guards, Se-yeon governor and cost races, character/record concurrency, official reader grant races, and the remaining authority and catalog checks. Case timing includes the clone and case execution, and reports only after success. Failure still exits immediately; no success-looking completion line is emitted.

To disable timing in a manual local run, leave `MYEONGHA_AUTHORITY_PROFILE` unset (default `0`). If timing is enabled, no SQL, credentials, real subject values, payloads or secret material are logged. Profile lines add no GitHub API calls or external timer processes.

## Verification and operational acceptance

- The repository regression `tests/ci-authority-core-isolation.test.mjs` exercises the isolation helper against mocked PostgreSQL commands: one catalog existence query, one template create + migration replay, two independently cloned databases, correct per-case `PGDATABASE`, both cleanup scopes, profiling on/off, and fail-closed cleanup after a failing case.
- The full `CI Verify` and PR-event `CI Integration Verify` must succeed on the frozen PR HEAD, including **all five DB suites and authority-core**. Do not treat a partial job or generic workflow SUCCESS as equivalent.
- After merge, the latest `main` CI and independent DB suites must be checked separately for success/cancellation/skips.
- Compare the new authority job and script stage duration to the earlier 305–318s job baseline; GitHub-hosted scheduling and contention can fluctuate. The exact saved time is **not established** before post-change live observation.
- Never weaken the 38 isolated test invocations, schema migration replay, RLS/ACL assertions, per-case DB cleanup, required check list, or global integration concurrency merely to produce better timing numbers.
