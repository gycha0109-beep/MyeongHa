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
- Cloudflare Observability API accepted a dry-run query for the Worker; the query ID by itself is **not evidence that a matching event was ingested**.

## Completion decision and next evidence
- **PASS**: disposable PG17 A06 enforcement, fail-closed behavior, HTTP abuse request tests, active Cloudflare alert rule and Worker logs configuration readback.
- **OPEN**: version-bound authenticated Member/Guest live normal+429 quota canary, primary Worker structured security event query showing 401/403/429, organically observed baseline and evaluated alert; operations owns Worker deployments.
- A06 issue #1526 and A09 issue #1527 are not globally closed by this local-only proof. Preserve production admission switch/deployment authority and ops DR fail-closed status.
