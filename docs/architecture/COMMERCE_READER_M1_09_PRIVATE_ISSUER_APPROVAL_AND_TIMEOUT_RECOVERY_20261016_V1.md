# M1-09 — Private Issuer Approval Contract & Failure / Recovery Gate

> 2026-10-16 · Watchtower-Track: `commerce` · Draft-only · DB/Security approval **NOT GRANTED** · first paid product `standard.love_relationship` remains **HOLD**.

## 1. Decision and separation of authorities

The already-proven `1050` callback transaction persists verified Payment Attempt, verified Purchase Intent, canonical Verified Receipt and Provider Event. It **does not** create a purchased Grant.

The existing D1/D2 `1820` issuer and binder are **private SECURITY INVOKER** functions. Test fixture superuser execution proves their business semantics; it does **not** authorize an application-side call. `1900` fences the old `1090` issuance and D2 entrypoints from `PUBLIC`, `anon`, `authenticated`, `service_role` and application/Commerce roles.

**No new runtime/Worker issuer, service credential or delegated function execution right is approved.** DB Authority Core's Reader Writer inventory disallows private Writer references inside `apps/api/src`. M1-07 remains *read-only and HOLD-only*. M1-08 establishes that all four actual session principals cannot assume a separately granted synthetic private issuer role. M1-05 establishes that even the two D2 top-level `EXECUTE` grants alone are insufficient due to the private `SECURITY INVOKER` dependency chain.

This PR creates **neither an approved issuer role nor an operational worker**. It identifies explicit decisions and runs one missing failure case to prevent guessing that an approved issuer exists.

## 2. Approval matrix (current disposition: HOLD)

| Boundary | Evidence required to lift HOLD | Owner / required decision | Current evidence |
|---|---|---|---|
| Distinct private caller identity | Exact login/worker identity, network boundary, secret rotation/custody, least-privilege credentials, no public endpoint, emergency disable | Security + Operations + DB owner must authorize actual identity and custody | **Missing**; synthetic `NOLOGIN` fixture is not a credential |
| Role assumption / lateral movement | Real `session_user` must be unable to assume issuer via app, Commerce, `service_role` or `authenticated`; no inherited rights or PUBLIC grants | DB + Security approve complete role-membership graph | M1-04/08 negative evidence; production graph not verified |
| Transitive D2 SQL privileges | One *reviewed* capability boundary allowing D2 issue+bind and only its required helpers/rows, proof of RLS/ACL/SECURITY INVOKER ownership, no generic SQL mutation or admin secret | DB owner signs exact function signatures, table privileges and implementation | M1-05 denies EXECUTE-only; **positive transitive review missing** |
| Private Writer isolation | No `apps/api` D2 Writer reference, no public RPC route, no bypass via legacy `1090` or `1220` entrypoint | DB Authority + Security maintain existing hard inventory; a new isolated approved runtime requires separate reviewed work | Existing Writer inventory remains hard-gated; no allowlisting here |
| Receipt and purchase admission | Independently verified `1050` Receipt and canonical Subject×Intent×Offer; source-owned pinned Product Capability Set, Reader Selection, source integrity and Offer/Charge Terms | Commerce/Product owners authorize **saleable Offer**, verifier/capability revision, and bounds | Synthetic test only; ₩8,900 list price does **not** authorize a charge |
| First validity anchor | Timestamp, timezone, fixed-duration/provider-expiry normalization and canonical source of truth; replay must use original stored event meaning | Commerce + DB owner approve exact typed validity policy before first Grant | `1090` explicitly delegates validity anchor/expiry; **missing** |
| One transaction / lock order | D1 Product L0 then Reading×Reader L1; both `1820` D2 issue/bind in **one** `READ COMMITTED` transaction; full rollback on any downstream fault | DB/Commerce owner and integration tests must confirm on target PG version and runtime credential | M1-03 positive fixture and M1-09 timeout coverage; runtime not wired |
| Idempotent retry | Exact persisted Receipt and **original `1080` event semantics** on retry; dedupe, no duplicate Grant/Event/Outbox/Access, conflict on changed effect values | Commerce/DB owner approve authoritative rehydration implementation | M1-06 positive replay; production executor absent |
| Provider cancellation / refund race | Independent provider verification, source→Receipt→Grant match, complete-set CAS/revocation, lock ordering, stale-T1 and final T2 disclosure veto | Commerce + Legal + DB + Reader Security | D3c/D3e negative/positive isolated fixtures; operational approval and public T2 **HOLD** |
| Saju source and public release | Approved production T8 relationship claim pack, reviewer attestation/trust hash, Product policy & Content Release, privacy/consumer disclosures | Saju Domain Reviewer + Product/Legal + Reader owners | `Saju/docs/product/22-production-interpretation-authority-audit.md` is `NO_BUILD`; **HOLD** |

No single passing code test or Draft PR is an approval signature for any missing row.

## 3. Failure and recovery state contract

| Observed boundary | Durable DB state | Required next action | Never do |
|---|---|---|---|
| Provider verification rejected / no committed 1050 Receipt | No source-backed purchased Grant | Reject/HOLD; do not start issuance | Fabricate a Receipt, trust webhook text |
| Verified 1050 Receipt committed; D2 not started | Receipt exists, zero purchased Grant | Only an approved private worker may start atomic issue+bind after full preflight | Treat payment success alone as Reader access |
| D2 issuer wrote a Grant **inside an open transaction**; timeout/cancel before bind or COMMIT | PostgreSQL rolls back Grant/Event/projection/outbox; previously committed Receipt survives | Fresh session; reacquire D1 source scope and revalidate Receipt; attempt same atomic issue+bind only under approved authority | Reuse stale lock/admission, expose interim Grant, commit issue alone |
| D2 bind rejects after a successful issue in same transaction | No Grant/Reader mutation survives; Receipt persists | Fix source/request problem; revalidate current eligibility/authority; retry whole transaction | Treat partial issuing as committed |
| COMMIT outcome/ack is unknown | **Unknown until authoritative read**; may be zero or one committed source-backed Grant | Re-read Receipt→Grant→Event→Reader/Reading from DB; if none, follow first-issue rules; if complete, replay using original stored effect semantics; if partial/ambiguous, HOLD/manual review | Assume COMMIT failure; use new timestamps/IDs or blindly issue |
| Same Receipt with different effect semantics | Existing authoritative Event unchanged | Reject conflict; inspect original stored semantics | Overwrite event/revision or silently mint second Grant |
| Grant revoked/expired or provider cancellation wins the race | No active right; historical rows remain immutable | HOLD Reader; apply only independently approved cancel/restore protocol | Reissue based only on old verified Receipt |
| Source/Reader policy, Content Release or R2/T2 changes | Entitlement by itself is not permission to disclose | Fresh Product/Reader/Artifact authorization and final commit/send ordering review | Return AI Reader paid text because issuance once succeeded |

**Terminal success for these tests is only that forbidden issuance/promotion is impossible**. Approval requires positive evidence for an explicitly owned private worker and its approved DB privilege model, not just negative proof.

## 4. M1-09 executable PostgreSQL evidence

`test/db/official_reader_m1_09_issuer_timeout_recovery.sh` joins the already-running `test/db/official_reader_m1_verified_receipt_d2_private.sh` immediately **after** M1-08 and **before** M1-03, using the *same actual `1050` persisted Receipt*:

1. Require `CI`/`GITHUB_ACTIONS`, local PG15 `postgres`, and one of the explicitly pinned disposable test DB names.
2. Confirm verified Receipt/Intent and **no** matching Grant/Reader Access. Snapshot total Grant, Event, Outbox and Entitlement-projection row counts.
3. As isolated DB fixture owner only, `BEGIN`, set canonical subject context, and call the real `internal_apply_official_reader_unified_receipt_v1`. Require proof that a new (uncommitted) Grant ID was returned.
4. Set `statement_timeout=400ms`, run `pg_sleep(3)` to get real PostgreSQL **SQLSTATE 57014** before any bind/COMMIT. With `ON_ERROR_STOP=1`, the psql connection exits without sending COMMIT.
5. On a **fresh connection**, confirm Receipt remains verified, zero purchase Grant/Event/Reader Access rows exist, and global Grant/Event/Outbox/Entitlement counts are **unchanged**. Reacquire purchase scope using the real D1 source-locked function in another fresh `READ COMMITTED` transaction.
6. The existing M1-03 then still tests a separate invalid-bind rollback and **successful same-Receipt atomic D2 issuance/bind**; M1-06 still proves exact semantic replay; M1-07 still tests read-only source query. No private Writer added to application runtime.

This is a **post-issuance operational statement-timeout failure**, distinct from M1-03's request-validation error, M1-05/08's role denials and M1-06's original-time replay.

## 5. Test and deployment exit condition

At exact PR HEAD require: PostgreSQL 15 `DB dependency · content / content` log has both `PASS M1-09` lines **and** M1-03 successful same-Receipt retry, plus `db-authority-core`, Commerce Work Track, Governance, Web PR Domain Gates. Skipped PG17 / Commerce Payment / Entitlement / Runtime suites remain unverified. Live private caller, real provider, network/secret ownership, customer payment, refund and R2/T2 disclosure cannot be inferred from CI.

**No SQL migration, login, GRANT/REVOKE, worker activation, provider callback, paid response, production deployment or PR merge** belongs to M1-09. Further build work without DB/Security/Commerce approvals must remain offline and fail-closed.