# Production Security Alerting Runbook v1

## Purpose

This runbook governs OWASP A09:2025 Production alerting for MyeongHa.

## Current governed alert

- Provider: Vercel
- Provider interface: official Vercel CLI `vercel alerts rules`
- Provider CLI package: `vercel@59.19.1`
- Activation state: `ACTIVE`
- Provider rule ID: `ar_01a0fb72-ee7b-723e-943c-7fd428917c2e`
- Project: `myeongha`
- Project ID: `prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP`
- Team: `johnny-self`
- Team ID: `team_xuYA9OhCWlJETaYFOmeVodgS`
- Alert type: native `error_anomaly`
- Filter: `statusGroup:5xx`
- Minimum provider severity: `high`
- Numeric threshold: owned by the Vercel native anomaly model; MyeongHa does not invent one
- Runtime evidence schema: `myeongha-security-event-v1`

Vercel's native error anomaly compares current 5xx behavior with its own baseline. Repository code must not replace this with an arbitrary application-owned numeric threshold.

The repository does not pin or call an undocumented Alert Rules REST endpoint. The supported mutation and inspection contract for this track is the official Vercel CLI: `vercel alerts rules ls/add/inspect`.

## Not yet activated as alert thresholds

The following signals are observable but remain baseline-gated.

Authority state: `BASELINE_REQUIRED`.

- 401 / 403 → `ACCESS_DENIED`
- 429 → `RATE_LIMITED`

Do not create numeric alert thresholds for these signals until Production baseline evidence supports them.

Repository baseline authority:

```text
docs/operations/PRODUCTION_SECURITY_ALERTING_BASELINE_2026-10-03.json
```

The recorded evidence currently contains two non-equivalent checkpoints:

- an earlier 24-hour checkpoint recorded in issue #1527 with 7 `ACCESS_DENIED` events, all HTTP 401 on `api.me.dispatch`, and no 403/429 population;
- a later exact 24-hour query in which the provider returned no `ACCESS_DENIED` or `RATE_LIMITED` matches.

A seven-day comparison query could not be used because it exceeded the available runtime-log retention surface.

Therefore:

```text
ACCESS_DENIED alert activation = HOLD / BASELINE_REQUIRED
RATE_LIMITED alert activation  = HOLD / BASELINE_REQUIRED
fixed numeric threshold        = null
provider mutation authorized   = false
```

A no-match query is not interpreted as proof that these events never occur outside the queried or retained provider surface. Future checkpoints must persist the exact provider time bounds and route/status distributions before an alerting decision is reconsidered.

## Activation prerequisites

1. PR containing the alert authority is merged to `main`.
2. GitHub Production environment is available.
3. Secret `VERCEL_SECURITY_ALERTS_TOKEN` exists in the GitHub `production` environment.
4. The token must be a team/account-capable Vercel access token that can resolve team `johnny-self` and manage its Alert Rules.
5. A project-scoped token is not accepted for this activation path unless Vercel CLI later documents and demonstrates compatible team-scope resolution. Runs `36968554099` and `36970769733` showed `User not found` with the existing project-scoped credential before Alert Rule access.
6. The Vercel team must have the required Alert Rules capability. Anomaly alert configuration requires the applicable Vercel observability capability.
7. Operator uses the canonical workflow on `main`.

The workflow uses the credential only through the `VERCEL_TOKEN` environment variable. It never prints the token or passes it as a command-line argument.

If the credential is still project-scoped, the operation fails closed with `CREDENTIAL_SCOPE_INCOMPATIBLE` rather than falling back to an undocumented provider endpoint.

If the Vercel plan, permission, token, or Alert capability is unavailable, activation must fail closed. Do not weaken the rule or substitute an invented polling threshold.

## Activation

Run:

`.github/workflows/production-security-alerting-activate.yml`

Inputs:

- `confirmation=ACTIVATE_PRODUCTION_SECURITY_ALERTING_A09`
- `watchtower_track=security`

The workflow:

1. rejects non-main / non-manual / wrong-track execution;
2. rejects a missing dedicated Vercel secret with a clear message;
3. uses the pinned official Vercel CLI package;
4. lists current built-in rules affecting the exact governed project;
5. verifies an existing same-name rule if present;
6. creates the built-in 5xx anomaly rule only when absent;
7. lists provider state again after creation;
8. independently inspects the exact provider rule ID;
9. requires exact project scope, trigger/filter, severity, team-owner notifications, and stable `ar_...` ID;
10. emits only safe rule metadata.

A same-name rule with different project scope, trigger/filter, type, or severity is drift and must fail instead of being overwritten.

## Activation evidence

Production activation completed successfully on 2026-10-02 in GitHub Actions run `36977096311`.

Verified provider evidence:

- Stable rule ID: `ar_01a0fb72-ee7b-723e-943c-7fd428917c2e`
- Provider interface: `alerts-rules-cli`
- Transport: `official-vercel-cli`
- CLI: `vercel@59.19.1`
- Exact governed project scope: `myeongha` / `prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP`
- Trigger/filter: native `error_anomaly` / `statusGroup:5xx`
- Team-owner notifications: verified enabled by the activation operation
- Credential material and user payload: not emitted

## Incident triage

When a 5xx anomaly alert fires:

1. record the alert time window and affected route;
2. identify the active Production deployment;
3. query Vercel Runtime Logs for 5xx during that window;
4. correlate `MYEONGHA_SECURITY_EVENT` by route/status/requestId;
5. distinguish `SERVER_FAILURE` from `UNEXPECTED_EXCEPTION`;
6. check whether the anomaly began after a deployment;
7. decide rollback/disable/fix based on affected authority;
8. add a regression test when a product defect is confirmed.

## Privacy

Alert evidence may contain:

- route
- status group
- deployment
- time window
- opaque request ID

Alert evidence must not contain:

- Authorization or Cookie values
- tokens or credentials
- email
- birth data
- request body
- database URL
- raw error stack

## Verification

Repository governance is implemented by:

`scripts/verify-production-security-alerting-governance.mjs`

Provider activation evidence is complete for the governed 5xx anomaly rule recorded above. Any future rule replacement must again produce a stable `ar_...` rule ID, verify team-owner notifications, and independently inspect the provider rule after creation or discovery.
