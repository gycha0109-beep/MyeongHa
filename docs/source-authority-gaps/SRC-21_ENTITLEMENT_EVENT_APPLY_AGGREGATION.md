# SRC-21 — Entitlement Grant Event Apply / Aggregate Projection Authority

> Status: **RESOLVED BY `docs/architecture/COMMERCE_ENTITLEMENT_ARCHITECTURE_V1.md` / IMPLEMENTATION NOT STARTED**  
> Domain: Commerce / Entitlement  
> Resolution authority: 명하 결제·권한 아키텍처 v1  
> Upstream source reviewed: `Usecase_re_reviewed_v2`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST`, current Platform Integrity mechanics, current Commerce schema/tests

---

## 1. Historical gap

기존 ERD는 다음 atomic skeleton과 schema shape만 정의했다.

```text
verified receipt/provider event
→ resolve subject + grant_key
→ lock/upsert grant
→ reject stale provider order
→ append entitlement_event
→ update grant projection
→ recompute logical entitlement from ALL valid grants
→ outbox
```

하지만 event transition, payload schema, provider order comparator, exact aggregate formula, no-op/revision semantics가 비어 있어 production-authoritative command를 구현할 수 없었다.

이번 resolution은 후속 Commerce Architecture가 해당 domain semantics를 명시적으로 채택하여 그 gap을 닫는다.

---

## 2. Entitlement Effect v1

Normalized effect authority:

```text
schemaVersion = entitlement-effect-v1
eventType = granted | renewed | expired | revoked | restored | adjusted
effectiveAt
targetStatus = active | expired | revoked
targetValidFrom
targetValidUntil nullable
reasonCode optional
```

Raw provider payload/token은 entitlement event payload authority가 아니다.

Provider-derived effect fields는 verified provider evidence에서 만들어지고, system/admin adjustment는 별도 authenticated actor/reason authority를 요구한다.

### Current-start restriction

MVP v1에서는 `active` 결과를 만드는 effect의 `targetValidFrom`이 apply transaction의 `as_of`보다 미래일 수 없다.

```text
targetStatus='active'
→ targetValidFrom <= as_of
```

이 규칙은 future-dated grant가 새 event 없이 나중에 자동 활성화되어야 하는 미정 scheduler/read-recompute 문제를 제거한다.

Future activation 자체가 필요하면 별도 architecture delta로 scheduler/read-time recompute authority를 정의해야 한다.

Future `valid_until`은 허용된다.

---

## 3. Deterministic transition table

| Event | Preconditions | Grant result |
|---|---|---|
| `granted` | verified source + absent grant or exact replay | `active`; authoritative current validity window |
| `renewed` | existing grant + NEWER verified source | `active`; preserve original `valid_from`; replace, never arithmetic-extend, `valid_until` with authoritative expiry |
| `expired` | existing grant; verified/wall-clock expiry effective | `expired`; historical interval preserved |
| `revoked` | existing grant or verified historical lineage; revoke effective now | `revoked`; historical interval preserved |
| `restored` | verified historical ownership + provider current state active | `active`; restore authoritative current window; same source lineage |
| `adjusted` | authenticated system/admin actor + reason + validated target | exact approved target state |

Additional rules:

- cancellation/revocation scheduled for the future does not immediately mark current grant revoked.
- `renewed` never adds duration to a possibly stale local expiry; provider-normalized authoritative expiry replaces it.
- `expired` / `revoked` target interval inputs must match verified/existing historical interval rules; arbitrary caller rewrite is denied.
- provider event that merely reaffirms identical material grant state is a no-op and does not append a lifecycle event.
- grant revision increments only on material grant state change.

---

## 4. Event idempotency / dedupe

`entitlement_events.event_dedupe_key` is service-generated from a versioned canonical semantic tuple, not a client string.

Conceptual tuple:

```text
source_type
source authoritative id
entitlement-effect schema version
event_type
effective_at
target_status
target_valid_from
target_valid_until
reason_code normalized
```

Rules:

```text
same source/effect meaning
→ same dedupe identity / replay

same authoritative source identity + conflicting semantic meaning
→ conflict, no overwrite
```

A no-op provider reaffirmation produces no new entitlement event even if verification is repeated.

---

## 5. Provider order / stale comparator

DB does not guess provider ordering from `received_at`, lexical strings, or timestamps.

Selected provider adapter must expose a pure comparator over already verified normalized evidence and persisted grant order provenance:

```text
NEWER
SAME
STALE
INCOMPARABLE
```

Concurrency-safe apply:

```text
read grant revision + last order provenance
→ pure comparator
→ begin transaction
→ lock grant
→ expected revision/order CAS
→ if changed: rollback, re-read, recompare
→ NEWER: apply
→ SAME + same meaning: no-op
→ SAME + conflict: conflict
→ STALE: no rights mutation
→ INCOMPARABLE: no rights mutation + reconciliation
```

Provider network call is outside this DB mutation transaction.

A rail that cannot provide safe ordering or an equivalent fail-closed current-state reconciliation strategy cannot be activated.

---

## 6. Contributing-grant predicate

One transaction captures:

```text
as_of = transaction_timestamp()
```

A grant contributes iff:

```text
status='active'
AND valid_from <= as_of
AND (valid_until IS NULL OR as_of < valid_until)
```

Consequences:

- revoked never contributes.
- wall-clock-expired active row cannot extend access while a sweeper lags.
- future `valid_from` does not activate early; MVP additionally prohibits creating a future-active grant so no later automatic activation is required.

---

## 7. Logical entitlement aggregation

For one `(subject_id, entitlement_key, scope_key_norm)`:

```text
contributors = all grants satisfying Section 6
active_grant_count = COUNT(contributors)

count = 0
→ status = inactive
→ effective_valid_until = NULL

count > 0 and any contributor.valid_until IS NULL
→ status = active
→ effective_valid_until = NULL

count > 0 and all contributor.valid_until finite
→ status = active
→ effective_valid_until = MAX(valid_until)
```

Therefore revoking one source cannot remove access while another contributor remains.

---

## 8. Projection mutation semantics

- first authoritative grant history creates/upserts one logical `entitlements` row.
- logical unique key arbitrates concurrent first insert.
- projection revision increments only if `(status, active_grant_count, effective_valid_until)` materially changes.
- exact no-op recompute does not change `revision` or `updated_at`.
- all grant mutation + event append + logical recompute + required outbox enqueue happen in one DB transaction.
- no general API may mutate `entitlements` directly.

Current access remains fail-closed even if a maintenance recompute lags:

```text
status='active'
AND active_grant_count > 0
AND (effective_valid_until IS NULL OR effective_valid_until > now())
```

---

## 9. Rebuild authority

```text
Effective Entitlement
→ rebuild from entitlement_grants at one as_of

Entitlement Grant
→ rebuild from append-only entitlement_events + verified receipt/provider-event provenance
```

Stale/incomparable provider events are preserved as provider-event provenance but do not enter the entitlement event ledger because they did not change rights.

Historical Product/Capability meaning is recovered through the immutable receipt → Offer → Capability Set chain defined by SRC-18 resolution.

---

## 10. Outbox contract

If effective logical entitlement materially changes, the authoritative transaction appends one deduped outbox event describing the minimum internal rights change.

No outbox row is required for an exact no-op recompute.

Outbox consumer retry does not reapply entitlement state.

Generic worker backoff/dead-letter/manual replay remains Platform Integrity / Operations authority and is not redefined here.

---

## 11. Verification gate

- exact duplicate effect → one ledger effect
- same source identity + conflicting effect → conflict
- stale provider order → no rights mutation
- incomparable provider order → reconciliation/no mutation
- comparator stale read + concurrent writer → CAS fail/re-read
- every event follows the transition table
- future-active grant in MVP → DENY
- wall-clock-expired active row cannot authorize access
- finite 7d + finite 30d contributors → count 2 / max expiry
- finite + unbounded contributor → active / expiry NULL
- revoke one of multiple grants preserves remaining access
- all non-contributors → inactive/count 0
- concurrent first projection create → one logical row
- no-op recompute does not bump revision
- event + grant + projection + outbox are both-or-neither
- projection rebuild reaches the same current result

---

## 12. Remaining independent decisions

This resolution does not choose:

```text
provider rail (P0-CM-01)
provider-specific ordering grammar
subscription lifecycle
actual launch Product/Capability catalog
paid artifact access after refund
retention/legal duration
```

Those remain implementation/product/provider gates, not SRC-21 blockers.
