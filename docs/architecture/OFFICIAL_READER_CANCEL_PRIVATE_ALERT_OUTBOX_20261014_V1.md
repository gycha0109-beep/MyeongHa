# D3e7 — Private, aggregate-derived cancellation alert outbox

> 2026-10-14 · child of [Draft #2068](https://github.com/gycha0109-beep/MyeongHa/pull/2068)
> **NO LIVE DISPATCH, no sender credentials, no cron/HTTP mount, no refund/entitlement change, no runtime database permissions, no automatic privacy deletion.**

## Scope

D3e6 provides aggregate-only private queue health. Migration `1940` introduces a DB-owned, durable private alert outbox with **only one of four enum alert codes, a 15-minute UTC bucket, delivery status, attempt count and private lease metadata**. There is no merchant ID, consumer/Subject, payment ID, webhook ID, user-supplied message, free-form error or alert destination.

The four alert codes are `HELD_REVIEW_REQUIRED`, `DEAD_LETTER_REVIEW_REQUIRED`, `EXPIRED_LEASES_PRESENT` and `UNRESOLVED_AGE_EXCEEDED`. The unresolved-age threshold is a temporary private test policy of 3600 seconds; it is **not** an approved production SLO.

## Transactional boundaries

1. `internal_private_cancel_enqueue_alerts_v1()` reads `internal_private_cancel_queue_health_v1()` and creates at most four immutable per-category/per-15-minute-bucket outbox entries using `ON CONFLICT DO NOTHING`; the caller receives only the count and `effect_authorized=false`.
2. `internal_private_cancel_claim_alert_v1(worker,lease_seconds)` claims exactly one committed alert via `FOR UPDATE SKIP LOCKED`, new random UUID token and bounded expiry, at most **five** attempts. It also sweeps expired fifth attempts into `dead_letter`.
3. The injected TypeScript `deliverOnePrivateCancelAlertV1` requires an explicit transport; it does **not** instantiate a sender, network client or timers. It passes only `alertId`, `alertCode` and stable `myeongha-private-cancel-alert-v1:<alert UUID>` idempotency key to a caller-provided test transport.
4. If the transport **explicitly acknowledges** the alert, the worker invokes `internal_private_cancel_finalize_alert_v1(id,owner,token,true)` after transport success. If it rejects, throws or returns an ambiguous response, it invokes finalize(false), which records `retry_wait` with exponential backoff or `dead_letter` after the fifth attempt.
5. Completion/failure is fenced by DB row state, owner, exact claim token and **DB clock after locking**. A previous or expired owner cannot overwrite newer results. No raw exception string is stored. If finalization fails or commits without acknowledgement, the caller must treat delivery as **uncertain** and allow at-least-once retry: true exactly-once delivery is not asserted.

## Tests and guardrails

- `test/official-reader-portone-cancel-private-alert-delivery-v1.test.ts` verifies injected-only transport, duplicate-safe key, positive/negative acknowledgement, malformed payload fail-closed, finite claim and never asserting finance or entitlement rights.
- `test/db/official_reader_d3e7_cancel_private_alert_outbox.sh` uses only isolated PostgreSQL: alert source from permanent HOLD and dead letter, dedupe, claim contention, stale token rejection, delayed retry, terminal five attempts, API-role ACL and zero rights mutation.
- `1940` uses `SECURITY INVOKER`, RLS, explicit no-EXECUTE grants for runtime roles; no new `SECURITY DEFINER` or public endpoints.
- DB catalog hash is enforced; when this migration changes schema, pin only the **exact hash returned by CI's schema snapshot**.

## Remaining release requirements

This outbox is an offline private candidate, not an alert delivery service. Before any real notification: approve recipients and minimum-content privacy policy, source authority, independent service identity, network transport secret custody, message idempotency, delivery reconciliation, alert thresholds, durable scheduling and uptime, paging/escalation tests, operator incident response and aggregate record retention/purge. A 15-minute dedupe window rate-limits duplicates **within** a window but does not prevent repeated alerts across windows; active production policies must be signed off. The outbox itself is not a canonical Commerce cancellation record and must never drive refund or entitlement mutation.

Privacy/Legal/Security/Ops sign-off for D3e3–D3e7 remains required. The existing **temporary inbox 30-day maximum after completed evidence transfer and earlier purpose-driven deletion** is not altered by this alert feature. No live setting, credential, role, deletion job or HTTP route is enabled in this PR.
