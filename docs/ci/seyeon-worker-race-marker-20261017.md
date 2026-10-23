# Se-yeon detached-worker PostgreSQL race synchronization (2026-10-17)

## Scope and observed bottleneck

Real GitHub Actions authority-core profiling (PR #2232, run 39017990813) measured 256 seconds in the authority-core shell: the Se-yeon governor/cost block accounted for 113 seconds, and the script executed all 38 disposable PostgreSQL cases. Several of these tests deliberately hold locks and wait for real Guest expiry. Those delays are **not** safe to remove just to shorten CI.

This change targets only the two fixed 0.5-second timing guesses inside `test/db/seyeon_governed_cost_d4b10d_multiworker_race.sh`. Both waited for the first PostgreSQL client to acquire its claim or settlement lock before starting a competing session. A fixed half-second can expire before the first session reaches the SQL barrier under runner load.

## Behavior

- The first real PostgreSQL client now emits a `psql` `\! touch` marker **after** the claim or settlement SQL has returned inside the uncommitted transaction.
- A bounded Bash helper `test/db/await_pg_ci_marker.sh` checks for that marker while ensuring the client has not exited prematurely. The maximum is 100 polls of 0.05 seconds (five seconds); missing markers fail closed rather than silently allowing a false race.
- The prior `pg_sleep(2)` lock-holding windows remain **unchanged** for both claim and settlement. All underlying PostgreSQL role isolation, replay results, lease fencing, receipt-queue ACL assertions, and final cleanup remain active.
- On early failure, live test subprocesses are killed and reaped before test role cleanup. The existing rollback/cleanup semantics remain intact.
- Targeted Vitest regression covers success, premature exit/missing marker, bounded timeout, invalid PID, and SQL-result/lock-window retention.

## Expected effect and acceptance

The two 0.5-second blind sleeps are replaced by short waits for actual SQL-session progress. This may save a small amount of elapsed time and reduce CI timing flakes, **but no speedup is claimed until comparison against a successful full GitHub integration run**.

The project-wide 113-second Se-yeon block includes legitimate timing assertions (e.g. live Guest expiry) that this PR intentionally does not shorten. Do not remove the fixed `pg_sleep(2)` transaction windows or replace them with mock locks. No changes to production databases, credentials, workflow concurrency, required check contexts or rulesets.

Required acceptance: ordinary CI and the single frozen-HEAD PR-event full integration must both succeed; the latter must include all 11 integration jobs. After merge, distinguish a superseded/cancelled `main` push from successful verification on the latest `main`.
