# Production Security Alerting Runbook v1

## Primary Cloudflare runtime (2026-10-25)

General security targets Cloudflare Worker `myeongha`, not the auxiliary Vercel runtime. [Monitor authority](../../config/security/cloudflare-primary-security-monitor-v1.json) binds the exact account, Worker, query file and native monitor `fab0d24cd73740f5b2dba97766f78a66`. It counts existing `ACCESS_DENIED` (401/403) and `RATE_LIMITED` (429) security events only. The provider's native default sensitivity is 3.5 sigma over a 5-minute recent window against a 4-hour baseline; increase-only, evaluation every minute, repeat after one hour. These are native model settings, not an organic traffic estimate or a fixed request threshold. The query was previewed and the active configuration independently re-read through the official Cloudflare API.

Workers Logs is enabled in the primary Wrangler config; automatic invocation URL logs are disabled. This persists existing application event output rather than a second application event schema. Provider retention, sampling and attached metadata remain platform-owned. Actual collection requires the matching Worker source/config deployment. Confirm a sanitized existing security event from the exact live version, then inspect the monitor's evaluation and delivery status. `Enabled` alone does not prove email receipt. Do not flood Production to force anomaly detection; use a supported delivery test if available. Current rollout/evidence is in [Cloudflare execution](../security/GENERAL_SECURITY_CLOUDFLARE_EXECUTION_20261024.md).

The official Cloudflare monitor Test action was executed once and its sample notification was independently found in the account-owner mailbox. Synthetic provider notification delivery is verified; organic anomaly firing and actual primary Worker log ingestion remain separate checks. The Vercel rules below cover the auxiliary provider only and cannot establish Cloudflare completion.

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

The [general Security roadmap](../security/SECURITY_EXECUTION_ROADMAP_V1.md#실제-차단경보-구현-2026-10-24-후속) also defines a supported native API **4xx anomaly candidate**, including 401/403/429 and other API 4xx. It uses the provider-owned anomaly baseline rather than a repository numeric threshold. Candidate rule/decision files are present, and the existing CLI operation supports them with an additional activation authorization guard. Its decision remains `NOT_APPROVED`, provider mutation remains false, and no 4xx rule was activated. This does not change the baseline-only individual-status decisions below.

Implementation and the current bounded checkpoint are tracked in the [general Security roadmap](../security/SECURITY_EXECUTION_ROADMAP_V1.md). `npm run security:baseline -- <manifest> --output <new-report>` now merges exported captures and aggregates the existing security-event schema, retaining query/cap/retention limitations without persisting event identifiers. The [2026-10-24 capture](SECURITY_BASELINE_CAPTURE_20261024.json) has three 503 events and no 401/403/429 sample; it does not establish an organic or complete population. The older baseline below remains historical evidence.

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

## 2026-11-03 Cloudflare A09 operational readback and organic-evidence boundary

- Cloudflare alerting history GET since 2026-10-20 returned one dispatch from primary monitor `fab0d24cd73740f5b2dba97766f78a66` (canonical history ID `fab0d24c-d737-40f5-b2db-a97766f78a66`), sent 2026-10-24T20:53:08.807195Z using the existing email destination. That was the historical **synthetic provider test**, not an organic anomaly alert. No new alert dispatches were returned.
- Primary monitor still `enabled=true` and `type=custom_analytics`; provider-native 3.5-sigma increase-only sensitivity, recent 5m vs 4h baseline and 1h repeat remain provider-owned. Do not impose arbitrary fixed numeric thresholds or flood Production to force firing.
- Official Workers Logs telemetry scoped to `$metadata.service=myeongha` and `MYEONGHA_SECURITY_EVENT`, 2026-10-27T03:32:22.586Z through 2026-11-03T03:32:22.586Z: 213/213 parsed events, `ACCESS_DENIED=147` (401=133, 403=14), `RATE_LIMITED=5` (429=5), `SERVER_FAILURE=61` (503=61). All five 429 were observed during known synthetic Saju quota runs (one earlier failed canary and four successful 2026-11-03 cohorts). This is a mixed provider-retained population, **not** a trustworthy organic-only demand baseline.
- Production Member and Guest calculation/preview quota canary [41571776787](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41571776787) PASS on pinned deployed Worker; independent bounded Worker log query matched all four 429 denials. The older 503-containing canary remains historically FAIL.
- Verified: 401/403/429 primary Worker log ingestion, active native monitor, provider test-delivery path, exact-version production quota behavior. Not verified: independently attributable organic traffic baseline and organically triggered notification. Keep #1527 and #1529 OPEN; avoid misleading zero-demand or anomaly-fired claims.
- Complete source and four-cohort counts: [security evidence](../security/GENERAL_SECURITY_LOCAL_DOCKER_CLOUDFLARE_READBACK_20261103.md).

Watchtower-Track: security

## 2026-11-03 A09 bounded Cloudflare evidence — verified synthetic exclusion

- Provider source: Cloudflare Workers Observability (`cloudflare-workers`, script `myeongha`, message prefix `MYEONGHA_SECURITY_EVENT`). The read-only 14-window query covered **2026-10-27T04:20:00.000Z to 2026-11-03T04:07:00.000Z** with 202 observed events; API window counts were matched with returned rows before the local report was built. The provider retention is bounded and a complete/unfiltered population cannot be inferred.
- Synthetic exclusion authority: the canonical [exclusion registry](SAJU_ABUSE_SYNTHETIC_EXCLUSIONS_V1.json) now contains 19 additional request IDs matched by *bounded run time, event route/status, and exact event counts* to governed Cloudflare Saju canaries [boundary 41559184461](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41559184461) (3), [normal 41559455325](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41559455325) (3), [historical failed quota 41559656148](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41559656148) (6), and [successful quota 41571776787](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41571776787) (7). Time/route matching is not a cryptographic run-origin attestation; leave all other records unattributed.
- Before exclusion: 202 events (125 HTTP 401, 14 HTTP 403, five HTTP 429, 58 HTTP 503). After removing 19 registered synthetic events: **183 non-excluded events** (113 HTTP 401, 14 HTTP 403, zero HTTP 429, 56 HTTP 503). The **183 are unknown-attribution events, NOT an organic-only baseline**; synthetic traffic from other workflows may remain. No inference that organic 429 traffic is zero.
- The existing `collect-security-baseline.mjs` produced the privacy-safe [capture report](SECURITY_BASELINE_CLOUDFLARE_20261103.json): exact window bounds, capped query declaration, SHA-256 of local raw export, duplicate count and synthetic-excluded totals. Provider exports with raw request IDs were kept outside the Git repository. The report intentionally has `providerBoundsIndependentlyVerified=false`, `completePopulationProven=false`, and `retentionLimited=true`; it does not authorize new numeric policy limits. Its `numericAdmissionPolicy=HOLD` means this *capture does not authorize another policy change*, and does not revoke the separately approved/production-proven 60/20 quota.
- Cloudflare native monitor `fab0d24cd73740f5b2dba97766f78a66` remains enabled. Its only returned alert history since 2026-10-20 is the historical provider **synthetic** test email on 2026-10-24. **No organically triggered alert notification has been proven**; no new provider setting or alert destination was changed.
- Final A09 gate remains **OPEN** until an independently attributable organic population and any required organically triggered anomaly evidence are supported by actual provider history. Do not label unknown records as organic, invent fixed thresholds, or deliberately flood Production to trigger an alert. Operations DR/readiness is a separate track.

Watchtower-Track: security

## 2026-11-03 — controlled A09 isolation drill and Cloudflare delivery proof

- **Controlled simulation (not production)**: Docker `--network none`, binding only to `127.0.0.1`; 222 HTTP requests to synthetic Member/Guest auth and per-subject quota routes; real MyeongHa structured event emitter. Responses: 200=80, 401=95, 403=27, 429=20. Detector mirror using the repository's native monitor settings emitted one webhook alert on a spike; healthy baseline emitted none; cooldown suppressed duplicates. This is not Cloudflare's proprietary detection implementation.
- **Cloudflare delivery test (real provider):** `POST /accounts/{account_id}/alerting/v3/policies/{policy_id}/test` accepted, provider history ID `bbd541ad-123e-4bb5-a3b6-99990be91488`, sent 2026-11-03T07:38:56.458597Z via the existing email policy. The connected recipient inbox received the notification at 07:39:04Z. Do not recategorize this as a naturally triggered signal; it is the provider's official synthetic test.
- **Remaining distinction:** An actual native `zscore_spike` firing from Cloudflare Worker log query has NOT been independently observed. The earlier confirmed Production 401/403/429 log ingestion and A06 rate-limit canary are separate PASS evidence. Keep organic-baseline and native auto-trigger exit flags false. Do not attack Production to create an incident.
- [Sanitized evidence](../security/A09_ISOLATED_ATTACK_NOTIFICATION_EVIDENCE_20261103.json) and [replay harness](../../scripts/verify-a09-isolated-attack-delivery.mjs). No credentials, external network calls, personal information or policy mutations from the Docker drill.

Watchtower-Track: security

## 2026-11-04 Cloudflare A09 controlled native-monitor verification (latest scope authority)

This section supersedes only the **organic-only exit condition** in the older A09 notes above. On 2026-11-04 the user explicitly clarified that a real malicious incident must **not** be required for completion; a bounded, isolated test is acceptable. This does not change the privacy, baseline-quality or Production activation requirements in #1527.

- **Production detection decision:** Retain the already enabled Cloudflare primary monitor `fab0d24cd73740f5b2dba97766f78a66`, scoped to `scriptName='myeongha'` and structured `ACCESS_DENIED` / `RATE_LIMITED`. The bounded 202-event Production capture and 19 governed synthetic exclusions leave 183 *unknown-attribution* events. These cannot justify a fixed numeric threshold, so the existing provider-owned `zscore_spike` (3.5σ, 5m observation, 4h history) remains the alert choice. Do not claim that those 183 are organic.
- **Provider policy normalization decision:** A disabled throwaway `custom_analytics` policy was successfully created/read back with the same `zscore_spike` and `alert_trigger_preferences_operator=['<']`. Changing it to `['>']` was rejected by the provider, and omitting the operator on the existing policy update was also rejected. Omitting `execution_interval` when creating the disabled test caused Cloudflare to read back `1m`, matching Production. Accordingly, neither the operator nor the one-minute interval is an evidenced defect: **do not make an unsupported Production policy mutation**. The disabled test policy was deleted and GET returned 404.
- **Native automatic alert verified — distinct algorithm:** On a separate non-public Worker, the Cloudflare SQL API returned 200 security events/5m and 400/10m. A dedicated *threshold* monitor, set to `value > 10` **for this disposable experiment only**, automatically fired with `Trigger: 400 > 10 (Threshold)`. Provider alert start was 2026-11-04T01:25:53.885647536Z; corresponding Cloudflare email arrived 01:29:22Z, naming that exact test policy. This was not the official `/test` endpoint. It proves real Worker logs → Cloudflare automatic threshold evaluation → email delivery, **not** that the primary `zscore_spike` algorithm has fired.
- **Earlier native anomaly control:** An isolated 44-event baseline followed by 216 actual Cloudflare-logged synthetic spike events produced no verified native anomaly dispatch; the reason is undetermined. The experiment does not show the primary policy is defective or healthy under every spike.
- **Cleanup:** Test-only threshold policy `d6a12666dda149398edc708214889534`, test Worker `myeongha-a09-live-control-20261104`, earlier anomaly test resources, and the disabled configuration probe are deleted; independent GETs returned 404. Primary Worker, native anomaly policy, destinations and Production DB were not modified.
- **A09 issue acceptance boundary:** #1527 requires authenticated 401/403/429 coverage, bounded Production baseline with limitations, a justified alert/no-alert decision, supported provider activation, policy readback, runbook update, and required CI/post-merge verification. It **does not require waiting for a real attack**. Controlled automatic threshold dispatch verifies delivery infrastructure; existing active native anomaly configuration verifies the chosen Production policy. Keep `organicBaselineEstablished=false` and `productionNativeAnomalyAlertObserved=false` as truthful evidence fields. Complete issue acceptance only after this evidence is merged and the exact-head CI and post-merge state have been checked. No arbitrary numeric Production threshold was added.

Stable evidence: [A09 Cloudflare validation](../security/A09_CLOUDFLARE_NATIVE_MONITOR_VALIDATION_20261104.json); historical isolated attack [replay](../security/A09_ISOLATED_ATTACK_NOTIFICATION_EVIDENCE_20261103.json).

Watchtower-Track: security
