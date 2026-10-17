# Saju Bridge V2 — Source Wiring vs. Production Connection Evidence (2026-10-17)

Watchtower-Track: saju-bridge

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
