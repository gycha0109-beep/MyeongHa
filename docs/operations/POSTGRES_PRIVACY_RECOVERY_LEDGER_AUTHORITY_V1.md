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
promoted authoritative workflow runtime  = PROVEN — run 35653303484 / artifact 10662304561
Production non-zero canary                = PROVEN — run 35653222211
authoritative destructive reconciliation = PROVEN — isolated restore run 35659483080 / artifact 10666580699
authoritative reconciliation scope       = BOUNDED CAPTURED WINDOW ONLY
future-safe reconciliation               = false
RPO                                      = APPROVED PT24H / full-procedure comparison PASS (5536s)
RTO                                      = APPROVED PT6H / full-procedure comparison PASS (67s)
DR Ready                                 = false
```

Historical candidate evidence remains valid mechanics provenance, including
Production run `35361080803` and its zero-event encrypted artifact. That
historical artifact remains non-authoritative because it was produced before
this authority contract existed.

## Next closure slice

#1140 remains complete for synthetic recovered-state mechanics. The follow-on Production boundary is now also complete: canary run `35653222211` produced governed pre-deletion backup `35643472159` and non-zero authoritative ledger run `35653303484`; isolated restore run `35659483080` replayed that exact captured window, executed governed account-deletion finalization/completion, verified non-resurrection and revoked P5Y Commerce retention, and emitted identifier-free artifact `10666580699`. This promotes `authoritative_privacy_reconciliation=true` only for the exact captured window. It does not make reconciliation future-safe and does not prove full hosted Supabase Auth/Storage recovery equivalence.

## Non-claims

This authority does not claim:

- coverage after `authoritative_coverage_through`;
- full hosted Supabase Auth/Storage disaster recovery equivalence;
- future coverage beyond the captured ledger window;
- full hosted provider-managed Auth/Storage recovery equivalence;
- DR Ready.

RPO `PT24H` and RTO `PT6H` are Product Owner approved, and run `35659483080` measures this authoritative isolated procedure at a 5,536-second data-loss window and 67-second workflow duration, both within those objectives. Those comparisons do not override the separate provider-equivalence gate.
