# General Security Verification — 2026-11-03

## Scope and baseline
- GitHub `main` at `103ce134b9419baf6d28f756d252a249dcfc127c` (snapshot taken 2026-11-03 KST).
- Independent local clone; no production database mutation, application release, alert changes, or test-account traffic.

## Local PostgreSQL 17 — PASS
- Fresh disposable Docker `postgres:17`, isolated database `myeongha_saju_admission_isolated_test`, bound to loopback `127.0.0.1:57624`.
- `npm ci --ignore-scripts --no-audit --no-fund` PASS; `npm run build` PASS.
- `MYEONGHA_SAJU_ADMISSION_TEST_DATABASE_URL=<loopback-only URL> node scripts/verify-saju-abuse-admission-postgres.mjs` PASS.
- Actual SQL migrations, least-privilege role, Node HTTP/fetch and PostgreSQL 17 verification: 84 attack E2E requests (Member/Guest x calculation/preview, 3 permitted + 9 denied each), concurrent 3 allowed/9 denied, invalid/forged identities rejected without allocating a bucket, missing-policy fail-closed, rollback, bounded cleanup and zero upstream calls on denial.
- Hosted Auth and upstream successful Saju response were mocked; this **does not prove a live-production 429**. Test policy is a disposable 3/60 seconds fixture, **not** the approved production 60/20 per 60 seconds.

## Cloudflare provider — READ-ONLY VERIFIED
- Primary `myeongha` deployment `1b349e54-7a94-46ac-b4ba-f41ad3b0be33`, version `afdd69c9-03fb-41e4-91ef-c757a7ac0573` at 100%, deployed `2026-11-03T00:54:05Z` (point-in-time observation, not a perpetual live assertion).
- Worker settings: observability enabled, logs enabled and persisted at full head sampling; `invocation_logs=false` (does not negate custom application logs).
- Native 401/403 and 429 anomaly policy `fab0d24cd73740f5b2dba97766f78a66` is enabled with 3.5-sigma 5m/4h configuration. Alert policy activation alone does not prove ingestion or organic baseline.
- Cloudflare Workers Observability **actual telemetry query** on `cloudflare-workers`, filtered to `$metadata.service=myeongha`: 84 Worker log entries in the preceding 24 hours as of 2026-11-03T01:18:32Z. This proves log retention/availability, not a quota event.
- Exact application-event filter `$metadata.message` includes `MYEONGHA_SECURITY_EVENT`: 11 events in 2026-11-02T01:19:40.910Z–2026-11-03T01:19:40.910Z, inspected as privacy-safe event codes: `ACCESS_DENIED=6`, `SERVER_FAILURE=5`.
- Seven-day query at the same observation time: 207 matching security events, 144 matching `ACCESS_DENIED`, **zero matching `RATE_LIMITED`**. This proves 401/403-family events reach the primary log store, but does not prove deployed 429 enforcement or organic alert firing.
- The GitHub PR metadata must contain an exact standalone `Watchtower-Track: security` line (no trailing punctuation), because the CI work router parses that exact form.

## Completion decision and next evidence
- **PASS**: disposable PG17 A06 enforcement, fail-closed behavior, HTTP abuse request tests, active Cloudflare alert rule and Worker logs configuration readback.
- **OPEN**: version-bound authenticated Member/Guest live normal+429 quota canary, primary Worker verified 429 `RATE_LIMITED` log and individual 401/403 separation, organically observed baseline and evaluated alert; operations owns Worker deployments.
- A06 issue #1526 and A09 issue #1527 are not globally closed by this local-only proof. Preserve production admission switch/deployment authority and ops DR fail-closed status.


## 2026-11-03 continuation — version-bound Cloudflare live evidence and final acceptance gates

- PR #2904 was merged after CI Integration Verify SUCCESS. The independent PostgreSQL 17 attack proof remains a **local / synthetic PASS**, not Production quota acceptance.
- PR #2910 (merged 2026-11-03T02:06:41Z) added privacy-safe quota failure status counts without altering Production guards.
- Production Worker version `cadfa89c-eb9c-4c72-9b64-9a5fbf125cca` passed unauthenticated boundary canary [41559184461](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41559184461) and Member/Guest normal calculation+preview canary [41559455325](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41559455325).
- Full quota canary [41559656148](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41559656148) **FAILED** in calculation batch; never upgrade this result to PASS. Independent Cloudflare Workers Logs, 2026-11-03T01:25:40Z–01:27:30Z, show one HTTP 429 `RATE_LIMITED` and two HTTP 503 `SERVER_FAILURE` for `api.me.saju.calculation`. A quota denial is Production-observed but the four Member/Guest × calculation/preview cohorts are not all verified.
- Primary `myeongha` Workers Logs also contained 149 `ACCESS_DENIED` events (133 HTTP 401 and 16 HTTP 403) and 62 HTTP 503 `SERVER_FAILURE` events in the observed seven-day window ending 2026-11-03T01:25:55Z. These are raw provider population counts, **not a synthetic-excluded organic baseline** or anomaly notification evidence.
- The existing native anomaly rule `fab0d24cd73740f5b2dba97766f78a66` remained enabled. The previously approved product quotas remain **60 calculation / 20 preview-reading per subject per 60 seconds**. Neither provider rule nor DB policy nor Worker settings were changed.
- The earlier quota canary sent 61 calculations concurrently; this coincided with 503 failures but **does not establish root cause**. The updated proof harness limits concurrent requests to eight, stops issuing new requests after unexpected responses or transport errors, drains in-flight requests, records only counts and elapsed time, never replays uncertain writes, and requires each verified quota cohort to fit the 60-second policy window. HTTP 503/transport failure is still FAIL and cannot authorize activation.
- **Completion**: local PG17 attack prevention, Production 401/403 observability, deployed 429 event visibility, Member/Guest happy-path canary and native alert configuration are VERIFIED; **Production full quota four-cohort PASS**, synthetic-excluded organic baseline, actually triggered anomaly notification, and operations DR readiness remain UNVERIFIED. Keep #1526, #1527, #1529 and operations #1887 OPEN until their respective closure authorities are met.
- The next live quota run must use the current main harness and an independently read exact 100% Worker version, on the existing manual main-only workflow. No direct Worker deployment or product policy mutation is implied by merging this security-only test improvement.

Watchtower-Track: security

## Final isolated verification — 2026-11-03

- **Whole-repository Linux Docker PASS**: Node 24.22.2, npm 11.19.1, `npm run check` completed exit 0: 1,079 test files / 8,545 tests passed, 31 files / 145 tests skipped; typechecks, shared build, web build, deployment-config verifiers, and Admin build passed. Tests used an isolated Linux clone with a synthetic local commit solely to satisfy clean-working-tree assertions; no such commit was pushed.
- **Real PostgreSQL 17 attack replay PASS**: separate Docker PostgreSQL 17 with `--network none`, Node 24 tester sharing only its network namespace, disposable `myeongha_saju_admission_isolated_test` and loopback port 57628. Actual SQL/adapter/HTTP attack E2E reported 84 requests PASS; all four Member/Guest × calculation/preview buckets denied over-limit requests correctly, verified minimum privileges/fail-closed/rollback, and sent zero upstream calls on blocked requests. Hosted identity and successful external Saju responses were mocked, so this is **not a live-production quota PASS**.
- Windows-host full Vitest did not pass because many unrelated repository tests require Linux tools and POSIX semantics; the final authoritative local complete check above was run in Linux Docker instead. The first isolated Linux check had two failures because the test overlay left the synthetic Git working tree dirty; the clean synthetic commit corrected the harness condition, not Production code.
- All disposable containers and real DB fixtures are local; no Production DB, Cloudflare Worker, alert rule, or product quotas were modified. Full four-cohort Production quota acceptance and organic alerting evidence remain open.
