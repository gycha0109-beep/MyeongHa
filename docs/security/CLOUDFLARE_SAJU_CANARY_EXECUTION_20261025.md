# Cloudflare primary Saju admission canary

Watchtower-Track: security

The Vercel canary cannot verify primary Cloudflare enforcement. The dedicated
`cloudflare-saju-admission-canary.yml` workflow uses only the fixed canonical
`https://myeongha.gycha0109.workers.dev` origin. It never obtains a session from
Vercel or forwards provider credentials to a caller-selected URL.

Read the 100% live version from the authenticated Cloudflare deployment API and
correlate that version with the merged-main Workers Build before dispatch. Supply
that UUID as `worker_version`. Each API response must match the provider-supplied
`CF_VERSION_METADATA.id` response header, including sign-in and fixture writes.
The official [version metadata binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/)
provides the UUID; request headers never select it. This is an additive response
header, not a new API payload, route, authority, or positive capability.

The later native Member login path from #2573 keeps its existing priority and
Auth limiter. Its denial/rate-limit/server responses now pass through the same
security emitter using the existing static router IDs; other API responses keep
their existing single emitter. This direct consumer was included because it
otherwise bypasses primary #1527 event coverage. No client URL, header, body,
credential or new event category is logged.

Phase `boundary` performs only health and credential-free API admission checks.
It does not establish normal or quota behavior. Missing/mismatched metadata,
closed adapters, or absent producer configuration fail before credentials are
read and before a Guest fixture is created. Phase `quota` requires the already
approved production-v2 numeric policy and Saju/producer/admission bindings;
it reads the approved 60/20 limits from the existing activation evidence rather
than creating a second numeric configuration. For each Member/Guest route it
issues limit+1 concurrent requests and requires limit normal responses plus one
429, bounded Retry-After and no-store. Use the dedicated smoke Member in a fresh,
quiet admission window; simultaneous use or a reset crossing is a failure, not
a reason to relax expectations. Phase `production` checks normal responses after
the approved policy switch. No phase activates modes, changes policies, promotes traffic, or
claims automatic rollout authorization.

All writes are single-attempt, with a run-correlated synthetic Guest label.
Failure leaves a redacted artifact including its stage and whether a fixture
was attempted. Never rerun an uncertain write without reconciling its outcome.
The primary origin is public, so this workflow never uses the isolated 2-request
canary policy against it. No automatic fallback from a failed quota assertion
or version mismatch is permitted.

Live prerequisite readback on 2026-10-25: Saju service origin exists, but producer
Bearer, calculation/preview modes and admission activation bindings are absent.
No mode or secret is inferred from the origin binding. Production numeric DB
policies remain disabled until actual normal/quota evidence exists.

Local validation: shared TypeScript build, web build, direct OAuth/Cloudflare
regressions, exact-version and unadmitted-API rejection before credentials,
synthetic full Member/Guest quota transport, and Wrangler 4.152.0 dry-run.
The dry-run bundle is 963.40 KiB / gzip 185.09 KiB. These are implementation
checks, not authenticated live quota evidence. Actual dispatch remains required.

Actual local workerd (Wrangler 4.152.0) also passed ten HTTP health, metadata,
method, closed-API, protected Chat/encoded-alias, marker-query and static-root
checks. No remote DB or credentials were used; local evidence is retained at
`.wrangler/cloudflare-security-local-http-20261025.json` outside Git. The server
was stopped after the checks. Native Auth regression and governance checks pass.

PR #2572 subsequently merged as `396bcbb517cd2e77a1d3c3e4e32e1d399f205924`.
Main also added the governed credit-wallet rewrite via #2564. The required CI
consumer test caught the old 19-entry Cloudflare route inventory missing that
new public contract. Record the existing exact route and static ID in the
inventory (20 rewrites); retain the existing 404 until an independently governed
Cloudflare credit-wallet adapter exists. This is inventory alignment only, not
wallet activation, DB/schema modification, or a new alias/fallback.

The merged #2572 Workers Build `dd8d0e93-f3b1-48da-b2cf-592bb9be1f57` succeeded.
Provider readback: deployment `7e9daf69-5843-4599-bdfb-ca07cf1358fb`, version
`17f50aaf-4c5d-470e-8d28-8f639a9c7f26` at 100%. Fresh credential-free probes:
health 200; me 503 `AUTH_UPSTREAM_UNAVAILABLE`; both Saju POST routes 404;
all no-store. Expected admitted unauthenticated me is 401. Observed failure
stage is primary Auth/DB composition, classified as a live runtime/binding
prerequisite; do not send a Member session or create a fixture to force progress.
Reproduce without credentials: GET `/api/me`, POST `/api/me/saju/calculation`,
POST `/api/me/saju/preview-reading` at the canonical origin above.

#1536's immutable restore-image acceptance was separately rechecked: the current
workflow retains digest `sha256:b3bfedb107413abb3b8cb0d0874b0414a1dceb3d55bc0c778de6ad22d1f7dc86`;
governed restore run `39114107262` remains successful at
`2d73b41500b6e6f3eb74ac358252602d0da686a7`. The issue was closed as completed.
This does not claim a new DR drill or Production privacy-ledger replay.
