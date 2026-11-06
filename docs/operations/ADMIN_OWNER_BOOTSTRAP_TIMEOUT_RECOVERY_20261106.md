# Owner bootstrap timeout recovery — 2026-11-06

## Observed (production)
At ~15:36 KST the existing Admin tab `/admin` displayed **관리자 세션 응답 지연** with `ADMIN_REQUEST_TIMEOUT` and a **서버 연결 재시도** button. The Owner login form was absent. The browser deadline is 8 seconds for a session check. Earlier requests have `admin-read:denied` audit records; this does not prove whether the current request stalled on Supabase auth, Hyperdrive audit, or upstream transport. Cloudflare did not expose a matching custom stage error for the observed interval.

## Confirmed code defects and correction
1. The SPA renders only an error panel after initial Owner session verification times out. Show the Owner login form alongside retry so an owner can reauthenticate, without downgrading Access or Owner authorization.
2. The SPA attempts session verification on every focus and 60-second timer even if no verified session exists. After an initial denial or timeout, stop automatic revalidation until explicit retry or successful login. Retain periodic re-verification for a verified Owner session.
3. `GET /api/admin/session` without a valid host-only session cookie unnecessarily reaches the DB-backed audit/auth path and may stall rather than promptly returning an unauthenticated response. Reject a missing or malformed credential with HTTP 401 `ADMIN_SESSION_REQUIRED` after the outer Cloudflare Owner Access gate, before opening Hyperdrive. A provided credential must still undergo exact Member/Owner verification and audit-write checks. No raw credentials or PII are logged.

## Required acceptance
- Admin UI typecheck, hosted auth tests, rate-limit tests, governance and security CI succeed.
- Dedicated readonly Admin release only; ensure existing Access, read/audit binding, disabled commands/retention remain unchanged.
- Existing sessionless admin tab shows the login form without a retry-only dead-end. A valid session's owner check still depends on Supabase and audit store. If it times out, login remains possible; backend latency investigation remains open until verified by real user/session evidence.
- No forced browser reload and no request for Owner credentials, cookies, or access tokens.
