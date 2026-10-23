# Authority-core — three successful 40-case full-integration observations (2026-10-17)

> CI / Operations P2 performance evidence closeout. This file documents existing GitHub Actions output only; no new tests, waits, SQL, schedules, runner settings or Production operations were executed. The metric is the Bash authority-core **script time**, not full workflow duration or runner queue delay.

## Complete comparable-manifest PR-event integrations

The following **three real, successfully completed PR-event integration workflows** each have **11/11 successful jobs**, including `full / db-authority-core`. Their completed job logs contain **seven ordered stage records, 40 indexed isolated-case records, 40 corresponding indexed phase records and one created-template record**. All record identities and ordinals were matched. They share the R1/R2 separate fresh-clone rehearsal, including the intentionally reused R1/R2 DB name. These are comparable at **coverage/record schema level**, but are not a controlled before/after benchmark on an identical source tree or runner.

| PR / frozen HEAD | Integration workflow | Script wall seconds | Template create / migration ms | 40 pre-drop ms | 40 clone ms | 40 command ms | 40 cleanup ms |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| #2247 / `bc5c347d` | [39033439948](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39033439948) | 275 | 65 / 9366 | 1523 | 4446 | 183732 | 2630 |
| #2257 / `a313dcc5` | [39035871844](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39035871844) | 253 | 50 / 7814 | 1299 | 3079 | 173396 | 1903 |
| #2258 / `3727b840` | [39036686682](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39036686682) | 249 | 73 / 8593 | 1113 | 5294 | 170993 | 3102 |

The 40 **command** timings include PostgreSQL locks, waits, full race assertions and test-process startup. The script also executes non-isolated tests and guards outside these 40 commands, hence phase totals do not sum to the seven-stage wall time. The Bash `SECONDS` integer reports are coarse; the phase metrics are optional `EPOCHREALTIME` millisecond deltas. Do not compare either directly to full Actions queue time or assume any measured difference is statistically significant.

### Profile stage coverage (same seven names)

| Stage | #2247 sec | #2257 sec | #2258 sec |
| --- | ---: | ---: | ---: |
| baseline-and-early-guards | 38 | 33 | 33 |
| seyeon-r1-positive-pin-isolated | 1 | 1 | 1 |
| seyeon-r2-actual-v2-isolated | 2 | 3 | 4 |
| seyeon-governor-and-cost-races | 118 | 109 | 109 |
| character-and-record-concurrency | 47 | 42 | 38 |
| reader-and-grant-races | 55 | 52 | 52 |
| remaining-authority-and-catalog | 14 | 13 | 12 |

These are the exact seven stage durations recorded in each of the three completed PR-event job logs; scripts and runner job durations must not be conflated.

## Decision — no unsafe speedup

1. **DB template setup / clone / disposal:** observed, but smaller than real test command time. Replacing a clone with shared state would harm ACL/RLS/race isolation and is not justified by these measurements.
2. **Concurrency and authority assertions:** no optimization approved to shorten `pg_sleep`, lock waits, timeouts, competing sessions, transaction boundaries or assertion coverage. A fast but semantically weakened test is not a performance improvement.
3. **Potential safe follow-up:** independently profile non-isolated startup/validation overhead, separately from 40 isolated command timings, before proposing redundant process startup eliminations. Any change must prove identical 40-case/7-stage semantics and improved real PR-event full CI in more than one repeatable comparison.
4. **Result:** The requested minimum of **three complete, manifest-compatible real PR-event profiles** is met. **No causal speedup is established, and no additional optimization PR is warranted from current evidence.** The P2 investigation is evidence-complete but performance optimization remains deliberately unclaimed.

This is not a substitute for the 1/3/6 integration queue acceptance. At most three overlapping independent PR candidates were previously observed; a six-way controlled stress test needs explicit time/cost/scope approval. Do not produce synthetic PR floods or repeatedly toggle integration labels.

## Preserved safety contracts

- Existing `run_authority_core.sh`, optional phase profiler, 40 isolated databases, R1/R2 race rehearsals, and RLS/ACL/grant validations are unchanged by this document.
- Concurrent changes to unrelated tracks or Production are not part of this analysis.
- See [authority-core phase-costs](./authority-core-phase-costs-20261017.md) for historical 38/5 and updated 39/6, 40/7 contracts; see [integration queue measurement](./integration-queue-measurement-20261017.md) for admission and queue semantics.
