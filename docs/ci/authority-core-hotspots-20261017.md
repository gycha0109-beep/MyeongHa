# Authority-core hotspots: measured PostgreSQL contention tests (2026-10-17)

The existing GitHub Actions main CI on commit `4e50798c67f4b1324dd9e26357c914403614f587` passed. Read-only analysis of prior [PR #2232 integration run 39018401248](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39018401248) used the 38 case-duration lines and five stage records from the completed `full / db-authority-core` job.

## Stage profile — one run, not an improvement claim

| Profile stage | Integer duration | Share of 267-second script |
| --- | ---: | ---: |
| baseline-and-early-guards | 37 seconds | 13.9% |
| seyeon-governor-and-cost-races | 116 seconds | 43.4% |
| character-and-record-concurrency | 46 seconds | 17.2% |
| reader-and-grant-races | 53 seconds | 19.9% |
| remaining-authority-and-catalog | 15 seconds | 5.6% |

Caution: stage boundaries are script locations, **not** a perfect partition by test ownership. The Se-yeon-labeled stage also contains adjacent authority checks, so 116 seconds should not be called exclusively Se-yeon test execution.

Largest individual disposable-DB cases were: `myeongha_reader_birth_scope_lock_candidate_preflight_test` 13s; `myeongha_reader_new_grant_insert_phantom_preflight_test` 11s; `myeongha_seyeon_d4a_test`, `myeongha_seyeon_d4b8b_test`, `myeongha_seyeon_d4b10d_test`, and `myeongha_reader_grant_lock_race_preflight_test` each 10s. The broad Se-yeon span combines numerous 5–10s isolated PostgreSQL lock, crash and recovery cases.

This evidence **does not** justify reducing `pg_sleep`, lock timeout, race participants or transaction boundaries. Doing so would risk false negatives and change the proof being run. No parallelization, test removal, shortened sleeps, new credentials, production DB access, or workflow policy changes are proposed here.

## Reproduce safely

Download a completed authority-core GitHub Actions job log into a local text file, then run:

```bash
node scripts/ci/authority-core-profile-report.mjs path/to/authority-core-job.log
```

The parser is read-only, accepts standard timestamp-prefixed job logs, and returns stage durations, top cases and clearly stated limitations as JSON. It **fails closed** with nonzero exit status when any of the five stages is missing/out of order, any case line is malformed or duplicated, or there are not exactly 38 completed case records. It must not be used to assert whole-CI success: the separate mandatory 11/11 integration checks remain authoritative.

Recommended next change: capture at least three comparable full PR-event runs after testing, then investigate whether clone/create/drop overhead is material using explicit PostgreSQL timings. Only implement a performance change if fresh-clone and role/RLS isolation remain byte-for-byte semantically equivalent and all mandatory gates still pass.
