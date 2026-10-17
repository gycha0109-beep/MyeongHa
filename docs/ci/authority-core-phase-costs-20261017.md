# Authority-core DB phase-cost follow-up — 2026-10-17

> Read-only measurement and disposable CI test instrumentation. No Production DB, credentials, migrations, lock behavior, CI workflows or protection rules changed. The four historical observations below are not controlled before/after performance experiments.

## Four independently completed real PR-event runs

Each workflow completed successfully with all 11 integration jobs. Their authority-core job logs contained exactly **five ordered stage markers and 38 isolated-case duration markers**, with no malformed/duplicate records in the observed profiles. Durations below are integer Bash `SECONDS` wall measurements inside the script, not overall workflow latency.

| Candidate | Integration run | Authority-core job | Script seconds | Sum of 38 case seconds | Se-yeon-labeled stage | Reader/grant stage |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| #2239 | [39025486354](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39025486354) | 117376434984 | 242 | 174 | 108 | 51 |
| #2237 | [39025626355](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39025626355) | 117377435955 | 254 | 180 | 111 | 53 |
| #2241 | [39026266278](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39026266278) | 117378436967 | 216 | 160 | 98 | 49 |
| #2243 | [39028463482](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39028463482) | 117384244862 | 240 | 170 | 105 | 51 |

The earlier single [#2232 integrated sample 39018401248](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39018401248) was 267 seconds, including a 116-second broad Se-yeon stage. The 216–254-second newer samples **do not establish a repeatable speedup**: PRs were built from different frozen bases, runtime environments and workloads can vary, and #2237 made a separately governed race-marker change. No exact before/after equivalence has been demonstrated.

The consistently expensive individual cases include `myeongha_reader_birth_scope_lock_candidate_preflight_test`, `myeongha_reader_new_grant_insert_phantom_preflight_test`, and multiple Se-yeon collision/recovery tests. Their planned waits and transaction interleavings are part of the assertion. Do **not** shorten them on the basis of duration alone.

## New evidence before optimizing PostgreSQL

The existing `MYEONGHA_AUTHORITY_PROFILE=1` optional profile now emits additional integer-millisecond records using Bash's `EPOCHREALTIME` builtin:

- `AUTHORITY_CORE_TEMPLATE source=created|existing create_ms=N migrate_ms=N` — exactly one template lookup/create/migration result per full script.
- `AUTHORITY_CORE_PHASE db=myeongha_* pre_drop_ms=N clone_ms=N command_ms=N cleanup_ms=N` — one per successfully completed isolated test, after its cleanup trap.
- Existing five stage and 38 case records are retained without changing their names, semantics, order or success criteria.

`pre_drop_ms` is the existing defensive cleanup before clone; `clone_ms` is `createdb --template`; `command_ms` covers the original test command (including real PostgreSQL races/waits); `cleanup_ms` measures the already-existing per-case `dropdb`. The template metric isolates template creation from migration replay. Every test still clones a fresh database, retains its own role/transaction scope and runs its original SQL and lock checks. Failed cases keep cleanup but do not claim a complete success-phase record.

`scripts/ci/authority-core-profile-report.mjs` continues accepting older stage/case-only logs, leaving `phase_breakdown=null`. If any detailed record appears, a complete template result and exactly 38 unique, correctly paired and ordered phase records are required for a valid report. This prevents accidental comparisons of partial evidence. `source=existing` is explicitly marked non-comparable with fresh template creation without further review.

## Acceptance and next decision

Run the existing Vitest isolation/profile regressions, ordinary PR CI, four required checks and one frozen-HEAD 11-job integration CI. Compare at least three **new** detailed, comparable successful PR-event runs before proposing a performance change. Do not confuse runner job duration, script `SECONDS` duration, sum of per-case durations, and GitHub integration queue delay.

If clone/cleanup or template bootstrap accounts for material repeated cost, propose a bounded change with independent DB creation/cleanup regression tests; otherwise preserve the current comprehensive concurrency proof. Avoid unapproved bulk load, synthetic six-PR queues, deployment and Production database changes.
