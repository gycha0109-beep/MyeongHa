# Production Security Alerting Runbook v1

## Purpose

This runbook governs OWASP A09:2025 Production alerting for MyeongHa.

## Current governed alert

- Provider: Vercel
- Project: `myeongha`
- Project ID: `prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP`
- Team: `johnny-self`
- Alert type: native `error_anomaly`
- Filter: `statusGroup eq '5xx'`
- Numeric threshold: owned by the Vercel native anomaly model; MyeongHa does not invent one
- Runtime evidence schema: `myeongha-security-event-v1`

Vercel's native error anomaly compares current 5xx behavior with its own baseline. Repository code must not replace this with an arbitrary application-owned numeric threshold.

## Not yet activated as alert thresholds

The following signals are observable but remain baseline-gated:

Authority state: `BASELINE_REQUIRED`.

- 401 / 403 → `ACCESS_DENIED`
- 429 → `RATE_LIMITED`

Do not create numeric alert thresholds for these signals until Production baseline evidence supports them.

## Activation prerequisites

1. PR containing the alert authority is merged to `main`.
2. GitHub Production environment is available.
3. Secret `VERCEL_SECURITY_ALERTS_TOKEN` exists and is scoped only as broadly as needed to manage Vercel alert rules.
   Project-scoped tokens infer the provider account context; the workflow must not force a user/team `--scope` lookup.
4. The Vercel team supports the required alert-rule capability.
5. Operator uses the canonical workflow on `main`.

If the Vercel plan, permission, token, or alert capability is unavailable, activation must fail closed. Do not weaken the rule or substitute an invented polling threshold.

## Activation

Run:

`.github/workflows/production-security-alerting-activate.yml`

Inputs:

- `confirmation=ACTIVATE_PRODUCTION_SECURITY_ALERTING_A09`
- `watchtower_track=security`

The workflow:

1. rejects non-main / non-manual / wrong-track execution;
2. installs the pinned Vercel CLI version;
3. lists current project alert rules;
4. verifies an existing same-name rule if present;
5. creates the governed rule only when absent;
6. re-reads provider state;
7. requires an exact provider-side match;
8. emits only safe rule metadata.

A same-name rule with different project/filter/type is drift and must fail instead of being overwritten.

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

Provider activation evidence is not complete until the provider rule has a stable rule ID and is independently re-read after creation.
