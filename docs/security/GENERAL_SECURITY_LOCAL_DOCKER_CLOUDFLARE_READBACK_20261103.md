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

## 2026-11-03 final Production A06 acceptance (supersedes earlier held quota claims)

- Authoritative [run 41571776787](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41571776787) completed SUCCESS on main `4db0f71398f3357126617a2bf8e11b2beaec4984`; downloaded original artifact shows `status=PASS`, `quotaDenial=true`, `fixtureAttempted=true`, `productionActivationAuthorizedByResult=false`, pinned Cloudflare Worker `adf66a49-0a0b-426e-b001-cdd16e7f3617` at 100% when checked.
- Member calculation: 60 x HTTP 200 + 1 x HTTP 429 (61/61, 54,396ms). Member preview: 20 x 200 + 1 x 429 (21/21, 19,070ms).
- Guest calculation: 60 x HTTP 200 + 1 x HTTP 429 (61/61, 53,729ms). Guest preview: 20 x 200 + 1 x 429 (21/21, 20,279ms).
- All four route/identity cohorts finished within the previously approved 60-second production policy window, with no accepted 503. All three unauthenticated boundary probes returned HTTP 401. Product authority approved the 60/20 limits on 2026-10-24; they were not invented from an organic p99.
- Independent primary Worker log query from 2026-11-03T03:22:00Z to 03:28:00Z returned seven privacy-safe security events: four `RATE_LIMITED` HTTP 429 and three `ACCESS_DENIED` HTTP 401, and no `SERVER_FAILURE` in that bounded query. This independently confirms four real limit denials reached Cloudflare logs.
- A different Worker version `f15fd5cf-bb0b-474a-bb9b-87649ecc7cd9` was observed at 100% after the canary. The PASS applies to the pinned deployed version at execution, not automatically to every later deployment.
- A06 / #1526 is eligible for issue closure: production enforcement and Member/Guest quota canary, privacy-safe log ingestion, approved numeric limits, fail-closed DB/HTTP contract, isolated PostgreSQL 17 attack suite (84/84 PASS), whole-repository Docker Linux check (8,545 PASS / 145 SKIP / zero FAIL), and [CI Integration 41570777200](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41570777200) SUCCESS are documented.
- A09 / #1527 stays OPEN: native alert enabled, event coverage and synthetic test delivery are confirmed, but synthetic-separated organic baseline and organically triggered anomaly notification are not. Umbrella #1529 and Operations DR #1887 remain independently open. No provider or production DB mutations occurred during evidence capture.

Watchtower-Track: security

## 2026-11-03 A09 primary-log synthetic attribution update

- On merged `main=991c44fe361aef7211ab6b201852599d43509080` (PR #2921), the security track independently queried Cloudflare Workers Observability in 14 bounded windows covering 2026-10-27T04:20:00Z–2026-11-03T04:07:00Z, returning 202 v1 security events.
- Nineteen event request IDs matched governed canary run windows **and** exact route/status counts: runs 41559184461 (3), 41559455325 (3), 41559656148 (6), 41571776787 (7). The canonical test exclusion register was updated accordingly; event IDs are never included in the published aggregate report. This attribution relies on bounded timing+expected patterns, not an authenticated per-request run tag.
- Sanitized [A09 capture report](../operations/SECURITY_BASELINE_CLOUDFLARE_20261103.json) from the existing baseline collector: 202 parsed, 19 synthetic excluded, 183 remaining; 401=113, 403=14, 429=0, 503=56. Remaining population must be described as **non-excluded / origin unknown**, not organic. Cloudflare provider limits and retention prevent proving a complete production population from this read.
- Monitor authority actual primary ingestion field corrected to VERIFIED; `organicBaselineEstablished=false` and `organicAnomalyTriggerTested=false` are unchanged. Provider's one historical synthetic email test is not organic alert evidence. A09 #1527 and umbrella #1529 remain OPEN; A06 #1526 remains CLOSED.
- Collection required no Production DB, Worker, alert configuration or synthetic traffic modification. Private exported request-level logs remained exclusively in the local verification directory, outside Git; the committed evidence contains only aggregated counts, SHA-256 and canonical test exclusion receipts.

Watchtower-Track: security
