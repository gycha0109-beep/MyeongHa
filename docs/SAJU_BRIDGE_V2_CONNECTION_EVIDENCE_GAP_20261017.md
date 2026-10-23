# Saju Bridge V2 — Source Wiring vs. Production Connection Evidence (2026-10-17)

Watchtower-Track: saju-bridge

## 2026-10-17 post-audit addendum — Product Member/Guest vs. separate high-isolation staging

This addendum supersedes only the historical `NOT_VERIFIED` status of **narrow evidence dimensions** below. The 2026-09-16/09-21 historical audit and source-only checker remain valid as **what was known at that time**. The current Product V2 critical path is `EXISTING_AUTHORITIES_V2`; do not make the retired S3A/new-role permit a prerequisite for current Member Calculation/Preview.

| Evidence dimension | Current evidence | Allowed conclusion / boundary |
|---|---|---|
| Current MyeongHa Supabase DB role/function catalog | Owner-approved read-only `pg_catalog` observation on project `cnsfpcdiyofqvhpcegfc`: `myeongha_runtime` LOGIN, `myeongha_api_executor` NOLOGIN, runtime may `SET ROLE` executor without ADMIN/inherit, four existing Subject/Birth functions present with executor EXECUTE grants | Current metadata VERIFIED at read time, not a proof of all actual API behavior |
| Current Saju Cloud Run service identity | [read-only lineage #39030302217](https://github.com/gycha0109-beep/Saju/actions/runs/39030302217), sanitized [artifact #12100610837](https://github.com/gycha0109-beep/Saju/actions/runs/39030302217/artifacts/12100610837) on 2026-10-17 11:52 UTC | `saju-production-00013-lar` READY, 100% traffic on that revision as observed, not a claim that the then-latest Saju `main` was deployed |
| Vercel Production secret *name/target* metadata | Owner-redacted Vercel dashboard list: `MYEONGHA_SAJU_SERVICE_ORIGIN` and `MYEONGHA_SAJU_SERVICE_BEARER` targeted Production | OWNER_UI_OBSERVED only; connected Vercel metadata API returned 403, values intentionally not accessed |
| Member positive Production end-to-end | [Production Saju Current Subject Smoke #39034130032](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39034130032) on tested MyeongHa `8d1a22dcf5e57bbc33fdc43edb55a4d590815fd2`, `member_only`, 2026-10-17 12:50 UTC | **VERIFIED at this tested SHA and instant**: governed Member authentication/current self Birth Revision, Calculation 200 twice/deterministic, Preview 200 `delivered`, no Guest fixture creation. Not a standing guarantee after future drift, a measured SLO, a license to publish, or evidence of all Product interpretation |
| Guest positive Production Calculation/Preview | The existing `member_and_guest` smoke requires `POST /api/session/bootstrap` and `POST /api/birth-profiles` with synthetic birth input | **NOT_VERIFIED**; the positive Guest case has actual Production data creation side effects, not a read-only observation. No Guest-positive proof from Member-only run |
| High-isolation `R01–R14`, Root/Registry/Attestor, 3 separate DBs, `2D-4` | Existing development/CI local and Docker evidence; no separately admitted actual staging authority or Runner evidence | **NOT_VERIFIED / HOLD** independently of Product V2 Member success |

### Guest Product route — safe remaining sequence

1. Existing product-code Guest API contracts and local/CI regression may be reviewed **without** triggering Production Guest bootstrap. A negative unauthorized probe is not positive Guest proof.
2. Positive Production Guest smoke currently creates a temporary Guest session **and** Birth profile; expiration of Guest authentication does **not** by itself prove that all persisted Birth records were cleaned up. Do not claim zero Production writes or cleanup unless separately attested.
3. The workflow `.github/workflows/production-saju-current-subject-smoke.yml` and verifier `scripts/verify-production-saju-current-subject.mjs` now protect `member_and_guest` behind a **manual workflow dispatch and a second exact Guest-write confirmation** (introduced by the guarded PR for this addendum), while triggered `push` and bare-script defaults remain `member_only`. The presence of that option does **not** authorize executing it.
4. Before opting into Production Guest writes: approve one scoped synthetic fixture, explicit maximum operations, retention/cleanup evidence and accountable test identity; alternatively provision a non-production isolated Guest fixture and test there. Do not create new credentials, migrate DB, use actual Member records, or run `member_and_guest` under the general development approval.
5. After an authorized run, record its exact SHA, response status/state and fixture cleanup evidence without logging secrets or personal Birth data. Until then `GUEST_PRODUCTION_POSITIVE_E2E=NOT_VERIFIED`.

### Separate `3-04-02 / 3-04-03B / 3-04-04 / 2D-4` staging track

This is **not** a continuation of the Member Product HTTP smoke and is **not** unlocked by the successful Member run. Read-only operating evidence requires separately approved S01–S06 environment, budget, authorization and disposal decisions; independently controlled Root pin/Registry revision floor/Operator/Attestor/Challenge, isolated Staging Auth plus Subject/Nonce/Admission DB identities and TLS, Saju Proof staging ingress/keys, original R01–R14 records, independent attestation, and a separately admitted Target Authority V2. The one-shot isolated Runner requires **another distinct P3 decision**. See [operational R01–R14 runbook](./SAJU_HELD_STAGING_OPERATIONAL_EVIDENCE_RUNBOOK_8C2B2D30401.md), [completion roadmap](./SAJU_HELD_STAGING_COMPLETION_ROADMAP_8C2B2D.md), and [single-Owner segregated authority design](./MYEONGHA_SOLO_OWNER_SEGREGATED_AUTHORITY_ARCHITECTURE_V0_1.md). No existing Production or Refund project may be repurposed for this staging.

```text
PRODUCT_MEMBER_CALCULATION_PREVIEW_E2E=VERIFIED_AT_2026-10-17_SHA_8d1a22dc
PRODUCT_GUEST_CALCULATION_PREVIEW_E2E=NOT_VERIFIED
PRODUCT_PUBLISH_OR_SELL_AUTHORITY=HOLD
SO3_R01_R14=NOT_VERIFIED
SO3_STAGING_ADMISSION=HOLD
SO3_RUNNER_CAN_RUN_ONCE=false
canExecute=false
canPublish=false
canSell=false
```


## Decision boundary

This is a **read-only GitHub/source audit**, not a live MyeongHa or Saju production test. Product path is `EXISTING_AUTHORITIES_V2`: the governed Member JWT, `myeongha_runtime`, `SET LOCAL ROLE myeongha_api_executor`, current self Birth Revision, and server-owned Saju HTTPS/Bearer. The legacy S3A role/Permit path is not a product prerequisite.

`node scripts/operations/inspect-saju-bridge-v2-source-readiness.mjs` inspects **checked-in files only**: both API entrypoints, Vercel preview rewrite, the dispatcher, runtime Auth/DB composition, current Birth SQL, HTTPS config and Saju adapters. It fails with a nonzero exit on source contract drift; it never contacts Production or reads environment values and it **always** prints `operationalEvidence=NOT_VERIFIED`. Its test `test/saju-bridge-v2-source-readiness.test.mjs` adds fail-closed negative regressions for rewritten routes, privileged DB role drift, ungoverned HTTPS origin, release role changes and admitted-source header drift.

The actual two Production entrypoints use their **existing individual runtimes**, not the optional `createSajuBridgeExistingAuthoritiesV2` composition as a newly mounted root route. They share the existing authorities; no extra DB identity or new route is required by this audit.

## Read-only historical evidence, correctly scoped

| Source | Run/source snapshot | What it actually supports | What it does NOT support |
|---|---|---|---|
| [MyeongHa Production Saju Current Subject Smoke #35114329751](https://github.com/gycha0109-beep/MyeongHa/actions/runs/35114329751) | 2026-09-16, `a3d89ec1a6f3c3eba7c1757fa2582d46c6b03dd1`, success | At that SHA, verifier `scripts/verify-production-saju-current-subject.mjs` checked authenticated Member/current self Birth/Revision and two deterministic `/api/me/saju/calculation` 200 responses as `calculation_only` | The verifier at that SHA had **no Preview Reading request**; do not backfill later added Preview/Guest assertions into this run |
| [Saju Production Cloud Run #35622856668](https://github.com/gycha0109-beep/Saju/actions/runs/35622856668) | 2026-09-21, workflow head `058b3c04b9fcb4ee51bd6d16c3e626c2e22f7a5f`, success | Candidate deployment, candidate smoke, explicit 100% promotion and post-promotion smoke succeeded at that time | GitHub workflow head is not a current Cloud Run revision attestation; does not prove currently served SHA, live Vercel Origin/Bearer alignment or release readiness |
| V2 HTTP/rewrite source on current MyeongHa `main` | Source-only, re-inspected 2026-10-17 | Calculation route exists; preview rewrite/dispatcher exists; HTTPS-only Saju Origin, server Bearer, restricted DB role and current Birth queries are wired | Actual deployed Vercel revision or active secret binding and current production DB function deployment cannot be inferred from source |

At this audit, available manual GitHub workflow history did not establish successful execution of the separate **Production Saju Service Origin Binding** workflow after its source contract was introduced. An earlier successful calculation smoke is historical proof for that tested route, not proof of the current cross-service configuration. The latest verifier on `main` now includes Preview/Guest cases, but adding those tests is not equivalent to running them successfully in Production.

## Outstanding observations requiring separately authorized read access

| Gap | Minimal acceptable future evidence | Status |
|---|---|---|
| Currently serving Saju origin/revision | Approved read-only Cloud Run service and traffic revision/digest/source SHA proof (not just prior GitHub deploy success) | NOT_VERIFIED |
| Current MyeongHa ↔ Saju Origin/Bearer | Approved read-only Vercel Production **metadata only** for Origin/Bearer key presence, scope and controlled revision pairing; do not fetch or expose values | NOT_VERIFIED |
| Restricted Member/Birth functions in Production | Approved read-only catalog/ACL inspection for current `myeongha_runtime`, `myeongha_api_executor`, `begin_member_subject_context_v1`, `assert_myeongha_subject_context_v1`, `qry_self_birth_profile_current_v1` and `qry_birth_profile_current_revision_v1` | NOT_VERIFIED for current state |
| Preview end-to-end | Separate authorization for an isolated synthetic test member and safe positive Preview response proof against the actually deployed configuration | NOT_VERIFIED |
| Globally deduplicated retries or paid Reading/storage | Approved separate product owner / persistence authority plan; no exactly-once claim from V2 request-local no-retry tests | NOT_IMPLEMENTED/NOT_VERIFIED |

Do **not** run the existing production Member/Guest Saju smoke, Origin binding workflow, Cloud Run deploy, Supabase GRANT/DDL, create a secret, query actual Birth data, change Vercel env, or invoke an isolated Runner from this audit. No new Phase 4I or repeat of completed Windows/Docker local tests is justified.

Operational high-isolation track remains separate: `3-04-02` Root custody, `3-04-03B` R01–R14, `3-04-04` Target Authority V2, `2D-4` single isolated run are **HOLD**. `stagingAdmission=HOLD`, `stagingConnection=NOT_VERIFIED`, `operationalEvidence=NOT_VERIFIED`, `canRunOnce/canExecute/canPublish/canSell=false`.

## Completion of this source-only task

- [x] Reinspect the two entrypoints and existing Source/Birth/HTTPS boundaries, not duplicate them.
- [x] Add a source drift inspection executable and negative regression test.
- [x] Attribute historical action success to its executed SHA and historical scenario coverage.
- [ ] Confirm current Production revision/Origin/Bearer/DB facts only after the distinct read-only operational authority approval.
- [ ] Consider publication, entitlement and payment only after all independent product owners approve.
