# D3e6 — Private cancellation operations, aggregate alerts and reviewed recovery

> 2026-10-14 · child of Draft #2066 · **not production authorized**.
> Parent chain: #2054 → #2057 → #2060 → #2063 → #2066.
> No HTTP endpoint, cron/timer/worker mount, live PortOne call, production GRANT, refund, entitlement mutation or automatic record deletion.

## Implemented

### 1. Read-only operational health

`1930` adds `internal_private_cancel_queue_health_v1()`, a `SECURITY INVOKER` owner-only function returning **aggregate counts and non-customer age**: queued due, retry due, active/expired leased, held, dead-letter, completed, and maximum unresolved age in seconds. No webhook/payment/customer identifiers, raw body, free-form failure strings or credentials are returned.

The private TypeScript `runPrivateCancelBoundedWindowV1` is **an explicitly called finite adapter**, not a recurring scheduler: 1–20 sequential D3e5 ticks and aggregate alerts. On first `idle`, stop. It does not create timers, DB clients, network calls, credentials or operational wiring. It rejects effect-authorizing results and unknown outcomes. Alerts are typed codes only:

- `HELD_REVIEW_REQUIRED`
- `DEAD_LETTER_REVIEW_REQUIRED`
- `EXPIRED_LEASES_PRESENT`
- `UNRESOLVED_AGE_EXCEEDED`

Alerts are returned to an injected caller, **not sent** by email, Slack, webhook or pager. Before LIVE, decide policy thresholds, rate limiting, credential isolation, suppression rules, operator response SLO, delivery and escalation.

### 2. Audited manual review (private DB owner only)

`1930` adds `official_reader_portone_cancel_ops_review_v1`, linked by FK to the **temporary 1910 inbox** with `ON DELETE CASCADE`; it is not legal Commerce P5Y evidence. It records minimal structured operator action, constrained `OPS-<digits>` ticket reference, **DB session principal** (not caller-supplied display name), prior state/failure code and time. No free text, receipt payload, person name or context. The private audit is subject to the same privacy deletion/restoration policy as its temporary parent; actual retention controller is **not** activated.

`internal_private_cancel_review_v1(id,action,ticket)` enforces:

| Action | Allowed original state | Effect |
| --- | --- | --- |
| `acknowledge` | `held`, `dead_letter` | Audit-only; state unchanged; does not erase or clear HOLD |
| `retry_transient` | `dead_letter` with a transient failure code and **no linked 1860 shadow** | Exactly **one** reviewed requeue per inbox, resets attempt budget and DB due time |

A security, signature, source mismatch, disputed/ordering or full cancellation observation record is **never** auto-requeued by this mechanism. Existing `1920` leased/completed tokens cannot be manually overridden. Distinct review actions/tickets are stored atomically within one DB transaction; the unique one-requeue constraint makes repeated manual replay impossible, including concurrent reviewers. A 2nd review attempt raises error rather than changing the ledger.

**Identity caveat:** `session_user` is the actual database principal, not an independently authenticated human reviewer. A human approval interface with independent authorization and case provenance is required before any operational use.

### 3. Permissions and CI

RLS remains on the temporary inbox and new audit table. `anon`, `authenticated`, `service_role` and internal API/Commerce/Seyeon runtime roles receive **no privileges** on health/review RPCs or audit table. No new `SECURITY DEFINER` path or production permission. Tests use disposable, isolated PostgreSQL only and verify:

- aggregate-only metrics, no PII/identifier projection
- no-runtime EXECUTE/SELECT
- typed acknowledgment of permanent HOLD
- failed attempted requeue of `SOURCE_MISMATCH`
- retry of transient dead-letter **once** with durable structured audit
- bounded ticket/record shape, no free-form operator notes
- temporary audit deletion cascade under rolled-back synthetic transaction
- absence of new entitlement effects
- finite TypeScript runner, early idle stop, strict result validation and no automatic alert delivery

## Remaining mandatory gates

1. **Identity & review governance:** independently authenticated operator and approval/ticket authority, dual-control if required; DB session identity alone insufficient.
2. **Privacy & legal:** explicit treatment of temporary inbox/review-audit retention, early deletion, 30-day outer bound after successful transfer, exceptional hold handling, account deletion and backup restore reconciliation.
3. **Operations:** deployable scheduler identity, safe configuration and alerts, on-call playbooks, retry exhaustion handling, redrive runbooks and monitoring.
4. **Payment correctness:** environment separation in 1860 (currently keyed by webhook without environment), designated P5Y canonical Commerce evidence, refund/entitlement reviewed source-of-truth.
5. **Cutover:** production merchant configuration, security review, credential custody, load/backpressure rehearsal, runtime grants and rollout plan remain **HOLD**.

**End state:** private candidate only; CI PASS does not activate live financial or privacy-destructive behavior.
