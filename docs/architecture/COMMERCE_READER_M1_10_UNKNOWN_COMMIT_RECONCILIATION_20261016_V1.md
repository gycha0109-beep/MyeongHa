# M1-10 — Unknown COMMIT acknowledgement: read-only Receipt reconciliation

> 2026-10-16 · Commerce Track · Draft-only · **no private issuer credential, no positive admission and no paid Reader T2**

## Gap being closed

M1-09 proved that `1050`-persisted canonical Receipt remains committed if a new D2 transaction is aborted **before COMMIT** by SQLSTATE `57014`, and that a new owner-only transaction can retry it atomically. That test did **not** cover the different operational case in which the worker **sent COMMIT but did not receive its acknowledgement**. In that state PostgreSQL may have committed or rolled back, and timeout/transport errors alone cannot classify the durable outcome.

The anti-double-issue requirement must not depend on a process-local success flag, cached T1 admission, HTTP response, new provider callback, or newly generated entitlement effective time.

## Executable read-only contract

`apps/api/src/official-reader-unknown-commit-reconciliation-v1.ts` exports `reconcileOfficialReaderUnknownCommitV1` using the pre-existing injected transaction/read port. It creates no DB pool, credentials, API route or Worker, and has **zero references to a private D2 SQL Writer**. The existing Reader Writer inventory must remain unchanged.

One parameterized read-only SQL statement resolves the original, verified production `commerce_receipts` row through its verified Subject×Intent×Offer, pinned Product Capability set and selected Reader. Within one PostgreSQL statement snapshot it observes:

- Total **source Receipt-linked Grants**, `granted` Entitlement Events, Provider Effect Events, Reader Access rows and correlated entitlement Outbox rows; totals are computed independently of left joins, so missing/extra rows cannot be concealed by an inner join.
- Exact one-to-one Grant ID→original Event→Reader Access→Official Reading and selected Reader/Bundle, request hash/contract, source-owned active Grant checked against the **DB clock** and matching original event validity semantics.
- More than one pinned capability row or joined event is ambiguous and never silently reduced to one.

The result exposes **only a non-authorizing HOLD** with `automaticRetryAuthorized:false` and `publicDisclosureAuthorized:false`, with exactly four reasons:

| Observation at the database snapshot | Reason | Decision |
|---|---|---|
| No verified/pinned canonical Receipt lineage, malformed ID or database unavailable | `SOURCE_UNAVAILABLE` | HOLD; do not create or infer a purchase |
| Verified 1050 Receipt, **no currently visible** Grant/Event/Reader/Outbox/Provider Event | `NO_COMMITTED_EFFECT_VISIBLE` | HOLD; a concurrent commit may still be in flight; NOT equivalent to a proven rollback or permission to issue |
| Exactly one active purchased Grant, original immutable `granted` Event, expected Reader Access and Official Reading, no newer provider effect, consistent capability/reader/validity and 0–1 matching entitlement outbox records | `COMMITTED_COMPLETE_REQUIRES_PRIVATE_REPLAY` | HOLD; only separately approved private owner may consider original-event replay after fresh checks |
| Orphan/inconsistent rows, any provider revoke/change, expired Grant, duplicate or ambiguous source, mismatch of Reader/Bundle/request/event semantics | `INCOMPLETE_OR_CONFLICTING_AUTHORITY` | HOLD; DB/Commerce/manual authority investigation, no mutation |

A fully committed purchase is **not** public disclosure authorization or automatic replay permission: content source authority, refund/restore state, R2/T2 and saleability are separately gated. An absent visible Grant can never be interpreted as a *confirmed missing COMMIT*.

## Real DB fixture acceptance

`test/db/official_reader_m1_10_unknown_commit_source.sh` extracts the **literal SELECT embedded in the TypeScript** (not a hand-maintained substitute). It runs in an isolated `REPEATABLE READ READ ONLY` PostgreSQL transaction against the same real `1050` fixture:

1. **Before** owner-only D2 issuance: requires a canonical verified Receipt with zero committed Grant/Event/Access/Outbox; this does NOT authorize retry.
2. **After** the M1-03 same-Receipt atomic D2 issue+bind, M1-06 original semantics replay and M1-07 preflight: discard any notion of a trusted caller acknowledgement and re-read from DB. Require exactly one Grant/Event/Access, no Provider Effect, original pinned Reader/Bundle, exact Grant/Reading, and 0–1 matching Outbox.
3. Distinct fixture-relative uncertainty: the test emulates an **unavailable caller acknowledgement** by inspecting durable rows independently of the original command result. It does **not** simulate a real TCP disconnect while a PostgreSQL COMMIT packet is in flight. Such a transport/network fault test remains for an approved issuer environment.

`apps/api/src/official-reader-unknown-commit-reconciliation-v1.test.ts` adds synthetic classification tests for no-effect, complete committed, revoked/provider event, orphan Grant/Event/Access, Reader mismatch, invalid/duplicate source, and database errors. Every tested outcome must have `automaticRetryAuthorized:false` and `publicDisclosureAuthorized:false`.

## Owner approvals remain blocked

M1-05/08's **role isolation** and M1-09's atomic rollback do not create the private issuer. Missing approval: dedicated credential identity, transitive `SECURITY INVOKER` privilege model, first-issuance typed validity anchor, canonical Product/Reader policy, Offer/Charge Terms, separate refund/cancel review, Saju production-authoritative T8 relationship claims, public R2/T2 release and operational testing.

**No production login, GRANT/REVOKE, SQL migration, payment/refund, private Writer in `apps/api`, PR merge, deployment or paid public output.** M1-10 is a reconciliation/read contract only.

## CI expectations

At the exact Draft HEAD, verify Commerce Work Track (new Vitest), PG15 Content dependency (both M1-10 PASS lines and M1-09/M1-03/M1-06 regressions), db-authority-core Reader Writer inventory, Governance and Web PR. PostgreSQL17/Payment/Entitlement/Runtime suites that are SKIPPED are not proof of passing.
