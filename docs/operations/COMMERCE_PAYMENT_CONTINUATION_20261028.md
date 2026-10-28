# Commerce Payment continuation — 2026-10-28

Track: `commerce-payment`. Starting main: `39fc280b393d15e39c47fa24596573eacd697f47`.

## SDK restoration

PR #2680 was closed without merging by the repository owner on October 28.
Its timeline supplies no closure reason. Vercel's daily deployment quota failed,
while Commerce, Governance, Web PR, CI Verify and Workers preview checks passed.
Do not infer that the quota caused the closure.

Current main lacks both its SDK relay and SDK-before-Attempt ordering.
Restore its five-file change on current main, validate the exact JavaScript MIME
type, and execute the console code in isolated regression tests.

- Browser requests only `/owner-portone-sdk-v2.js` before `test-prepare`.
- Worker fetches only the fixed official PortOne V2 SDK URL, with no caller
  headers, cookies, authorization, query or payment data. Redirects fail closed.
- Non-JavaScript/error responses become generic 503; the relay is not a general
  proxy and does not relax the general SPA CSP.
- Missing/broken SDK creates no Purchase Intent or Payment Attempt.
- Concurrent clicks create one checkout; callback identifiers never replace the
  DB-issued Attempt. Refresh/recheck invokes verification of the remembered ID.

Local verification: six direct suites, 32 tests passed. This is isolated evidence,
not a real KCP payment or hosted PAID/Receipt proof.

## Current runtime boundary

Initial Cloudflare readback: active Worker v174,
`1363d860-bf0e-4f00-99e6-25afa496a349` (100%). Workers main build
`681bb5a0-946a-4843-a05d-694327abd2fb` reports success at the starting SHA.
Require new merged-SHA build logs, deployment/version readback and HTTP version
header before declaring the restoration deployed.

Chrome's Owner sandbox page currently disables checkout because no Owner login
is available. The user must sign in; card/authentication steps remain user work.
Do not create fake server PAID or Receipt evidence to close this boundary.

## Product and lifecycle gates

`P0-CM-03` remains OPEN-P0 for activation. The Decision Register specifies inactive
`standard.love_relationship`, one Reader-bound unit, KRW 8,900 list price, with
no executable Offer/Charge Terms. Do not activate it from payment work.

The existing Owner sandbox fixture uses `chat_credits_300_v1`, KRW 1,900, 300 credits.
It is not a LIVE saleable product. Existing verified top-up fulfillment is an
unmounted candidate and requires approved Offer and validity policy. Its supported
`never` validity shape is code support, not evidence of user policy approval.

Pending decisions/evidence: saleable Offer and version, executable price/currency,
provided service readiness, expiry/use terms, refunds for consumed/unconsumed
rights, full/partial refund scope, LIVE merchant/channel/credentials, public
webhook activation, and Production fulfillment authority. Existing decided
Reading terms remain governed by the Decision Register and Commerce spec.

The server PAID lookup, canonical subject, immutable expected amount/currency/
product, sandbox environment, signed Receipt persistence and replay constraints
remain mandatory. Production credits issued by the sandbox path must stay zero.
Read-only reconciliation may expose discrepancies; it must not mutate Receipt,
Grant, wallet, PSP money state or migration history.

## Acceptance still outstanding

P1 requires actual same-origin SDK load, KCP window, server PAID, persisted Receipt,
repeat verification without duplication, and zero Production credit issuance.
P2–P6 cannot be marked complete from SDK tests or existing candidate files.
