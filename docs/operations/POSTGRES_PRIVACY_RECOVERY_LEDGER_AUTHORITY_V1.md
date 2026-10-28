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

## 2026-10-28 source-coverage fence hardening

The restore serviceability validator now requires the public summary's
`authoritativeCoverageThrough` to be **exactly the actual `capturedAt`**
timestamp. It rejects an extended coverage claim even when the incident
reference fits the extended timestamp. It also rejects unsupported readiness
promotion, unaccepted replay-planner evidence, invalid source digests,
invalid backup identity, and inconsistent event counts before returning any
serviceability PASS.

This is a **fail-closed source-metadata integrity guard**, not an independent
proof that future privacy events will always be captured after the database
fails. Each governed ledger remains authoritative only through its observed
capture timestamp. The existing isolated restore still verifies the encrypted
payload, exact backup binding, and source digest separately; metadata validation
does not replace those checks.

Production scheduled captures remain hourly snapshots, and gaps after the
latest successful capture are **not automatically covered**. No new paid
provider resources or destructive Production canary are required for this
change. `future_safe_privacy_reconciliation=false` and `dr_ready=false`
remain mandatory pending independently verified continuous source authority,
Hosted provider equivalence, and full recovery acceptance.

## 2026-10-28 — measured scheduled-capture gaps (no continuity promotion)

The successful [Production read-only ledger run 40697151010](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40697151010)
used governed backup run `40592766562`, downloaded predecessor encrypted
ledger artifact `12796456517` from run `40643028817`, passed predecessor
checksum/decryption/event-overlap comparison, and uploaded new encrypted artifact
`12820520345` (30-day retention). This is runtime confirmation that the
previously implemented snapshot-overlap code runs on the protected scheduled
workflow. It does **not** mean its underlying backup matched the latest
Production migration, or prove every privacy event generated between captures
was independently durably recorded.

The sanitized `snapshot_overlap` manifest now also records actual
`captureIntervalSeconds`, the workflow's nominal hourly interval
`nominalScheduledIntervalSeconds=3600`, and a diagnostic
`captureIntervalBeyondNominalSeconds=max(0, actualInterval-3600)`. The GitHub
step summary exposes these measurements without private subject or event
identifiers. With no predecessor, interval fields are `null` and status remains
`NO_PREDECESSOR_UNVERIFIED`. Delayed captures do **not** suppress the new
encrypted evidence upload; the measured delay is visible and the previously
captured event comparison still fails closed on dropped overlapping events.

**No guarantee:** a 3600-second cron period is neither continuous CDC nor an
approved RPO. Delayed scheduled runs can leave unobservable event lifetimes
between captures. Consequently `continuousCaptureProven=false`,
`sourceContinuityProven=false`, `futureSafePrivacyReconciliation=false`,
and `drReady=false` remain mandatory even if interval measurements look
regular and a bounded snapshot comparison passes.

## 2026-10-28 — encrypted snapshot overlap preservation

The existing scheduled Production privacy-ledger workflow now selects the latest
successful prior ledger and downloads its encrypted artifact into the same
protected ephemeral Actions job. It verifies the predecessor ciphertext and
plaintext checksums, decrypts it only inside the job, and compares the previous
and current governed reconciliation manifests before uploading the next ledger.

- When snapshot windows overlap (including two snapshots of the same governed
  backup), every previously captured deletion or revocation event occurring
  after the newer backup cutoff **must still appear with identical event facts**.
  A missing captured event fails the scheduled ledger run before the new
  authoritative artifact upload.
- When the governed backup cutoff has advanced beyond the previous capture,
  the comparison reports `BACKUP_ADVANCED_WITHOUT_OVERLAP_PROOF`, **not**
  continuity PASS. A current backup's restored privacy state is not proved by
  comparison of the two lists.
- Without any previous successful artifact, the status is
  `NO_PREDECESSOR_UNVERIFIED`. An earlier successful run with a missing,
  expired, ambiguous or corrupt artifact fails closed rather than silently
  upgrading a new snapshot to continuity authority.
- The uploaded public manifest carries only identifier-free overlap status,
  dates, run IDs, and counts. Source identifiers and event payloads remain
  inside encrypted archives; decryption work directories are removed.
- Verification neither changes Production tables nor replays a destructive
  canary. It reuses GitHub Actions and the existing encrypted artifact storage.

**Important limit:** snapshot overlap preservation does not detect events
written and permanently removed between two successful captures. It does not
prove independent continuous event capture, cross-backup restored-state parity,
Hosted Auth/Storage restoration or general service readiness. The admission
rule remains `incident_reference_utc <= authoritative_coverage_through`;
`sourceContinuityProven=false`, `future_safe_privacy_reconciliation=false`,
and `dr_ready=false` remain mandatory until real independent source evidence
and the remaining provider/serving requirements are proven.

## Non-claims

This authority does not claim:

- coverage after `authoritative_coverage_through`;
- full hosted Supabase Auth/Storage disaster recovery equivalence;
- future coverage beyond the captured ledger window;
- full hosted provider-managed Auth/Storage recovery equivalence;
- DR Ready.

RPO `PT24H` and RTO `PT6H` are Product Owner approved, and run `35659483080` measures this authoritative isolated procedure at a 5,536-second data-loss window and 67-second workflow duration, both within those objectives. Those comparisons do not override the separate provider-equivalence gate.
