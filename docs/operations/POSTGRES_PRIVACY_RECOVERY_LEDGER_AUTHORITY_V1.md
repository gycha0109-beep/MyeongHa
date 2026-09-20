# PostgreSQL Privacy Recovery Ledger Authority v1

> Parent: #964  
> DR parent: #389  
> Implementation: #1136  
> Decision date: 2026-09-21 KST

## Decision

The encrypted off-primary-DB PostgreSQL privacy recovery ledger is accepted as the
authoritative post-backup privacy source **only for its explicit captured window**.

Authority is bounded to:

```text
governed backup completion < recorded privacy event <= ledger captured_at
```

The source authority marker is:

```text
myeongha-production-postgres-privacy-ledger-v1
AUTHORITATIVE_CAPTURED_WINDOW_V1
```

This is a technical recovery-authority decision under the already DECIDED
`P0-PR-01` deletion/retention policy. It is not external legal counsel approval.

## Serviceability guard

A recovered database MUST NOT be treated as privacy-reconciled from a ledger
whose coverage ends before the recovery incident/reference point.

The exact fail-closed rule is:

```text
incident_reference_utc <= authoritative_coverage_through
```

If the incident reference is later than the ledger coverage-through timestamp,
recovery serviceability remains blocked. Operators may not infer that the gap
contained no privacy events.

The scheduled hourly capture cadence is operational mechanics only. It is not an
approved RPO and must not be converted into one by inference.

## Durable source contract

The authoritative ledger preserves the existing candidate transport controls:

- exact successful governed Production PostgreSQL backup provenance;
- exact backup completion cutoff;
- explicit Production DB `BEGIN TRANSACTION READ ONLY` extraction;
- exact replay-supported privacy event allowlist;
- fail-closed unsupported lifecycle detection;
- deterministic reconciliation manifest accepted by the governed replay planner;
- identifier-bearing manifest encrypted before off-DB upload;
- uploaded artifact contains encrypted payload, checksum, and identifier-free public metadata only;
- P30D artifact retention under the existing encrypted backup lifecycle;
- no raw provider credentials, user identifiers, or row payloads in public evidence.

For post-backup account deletion, both `deletion_pending` and `deleted`
Subject states are supported only when the state is backed by the exact account
deletion job and exact `ACCOUNT_DELETION_STARTED/v1` outbox provenance in the
captured interval. Other non-active lifecycle transitions remain fail-closed.

## Current implementation state

```text
source authority contract                = DECIDED
captured-window coverage validator       = IMPLEMENTED
encrypted off-DB transport mechanics     = RUNTIME-PROVEN historically
non-zero encrypted roundtrip/replay      = CI-PROVEN
promoted authoritative workflow runtime  = PENDING POST-MERGE CAPTURE
authoritative destructive reconciliation = NOT YET PROVEN
future-safe reconciliation               = false
RPO                                      = OPEN DECISION
RTO                                      = OPEN DECISION
DR Ready                                 = false
```

Historical candidate evidence remains valid mechanics provenance, including
Production run `35361080803` and its zero-event encrypted artifact. That
historical artifact remains non-authoritative because it was produced before
this authority contract existed.

## Next closure slice

#964 still requires an isolated recovered-state drill that:

1. starts from pre-deletion/restored application state;
2. consumes an authoritative non-zero ledger whose coverage validator passes;
3. replays revocation/account-deletion-start commands idempotently;
4. executes the governed DB finalizer and post-Auth completion path in the
   isolated recovery environment;
5. proves share/device/notification/memory/life-fact/account access cannot
   resurrect;
6. proves only the approved P5Y Commerce evidence/history set survives;
7. emits identifier-free evidence.

## Non-claims

This authority does not claim:

- coverage after `authoritative_coverage_through`;
- full hosted Supabase Auth/Storage disaster recovery equivalence;
- numeric RPO/RTO;
- successful full recovery duration;
- DR Ready.
