## 2026-10-30 — cross-boundary local Auth/Storage + captured-window privacy admission fence

The already implemented **Docker-local** post-delete Auth/Storage checks and the existing Production privacy ledger's **captured-window metadata** validator are now combined by the strictly nonpromoting `scripts/assess-postgres-hosted-synthetic-local-privacy-admission.mjs`. The synthetic-only command consumes a sanitized post-delete report, captured-window public ledger summary and exact incident reference timestamp. It rejects a missing or failing local stale-JWT revocation, missing/malformed ledger authority, an incident reference even one millisecond past the actual `capturedAt`, a forged `authoritativeCoverageThrough`, or a local result attempting to set Hosted/DR readiness to true. No provider user, token, object byte or email must be supplied.

Successful **metadata-only** validation returns `localPostdeleteAcceptance=PASS` and `capturedWindowMetadataValidation=PASS`, **but always** `independentSourceArtifactAuthenticated=false`, `independentPrivacyContinuityProven=false`, `futureSafePrivacyReconciliation=false`, `hostedProviderRecoveryProven=false`, `drReady=false`, `gate=BLOCKED`, and `serviceResumptionAllowed=false`. A public ledger summary is not itself proof of an authentic decrypted artifact or event completeness, and a locally fabricated summary must never be treated as source authority. No Production backup, ledger artifact, actual Hosted Auth/Storage data, external paid project, or incident-time continuous event stream was accessed for this acceptance fence.

Targeted local Vitest tests for exact-capture acceptance, stale-incident refusal, extended-coverage forgery, missing/failed JWT revocation, report readiness promotion and corrupted ledger authority: **6/6 PASS**. These tests do not replace the earlier actual Docker HTTP post-delete PASS or the separate governed recovered-Postgres captured-window replay evidence. This is a new *defense-in-depth service-resumption fence*, **not** an independent continuous privacy capture solution.

## 2026-10-30 — Docker-local post-deletion stale JWT exposure and revocation policy boundary

A new disposable Supabase CLI 2.117.0 stack (API `127.0.0.1:54321`, PostgreSQL 17 `127.0.0.1:54322`) was exercised **using designated synthetic accounts and a synthetic private Storage object only**. With the previous fixture policy (exact `auth.uid()` match but no live revocation lookup), the actual Auth/Storage HTTP drill returned `syntheticDeletion=PASS`, `newLoginDenied=PASS`, `refreshAfterDeletionDenied=PASS`, but **`staleAccessTokenStorageDenied=FAIL`**: the pre-deletion JWT still retrieved the synthetic object. This is a *real local finding*, not evidence that Production has the same policy or exposure.

The nondeployable local fixture was then strengthened with a dedicated `dr_synthetic_local.revoked_subjects` table, an authenticated self-row-only SELECT RLS policy, and a Storage object SELECT policy requiring that the JWT subject have **no** matching revocation row. The new one-shot `scripts/run-postgres-hosted-synthetic-local-postdelete.mjs` validates the exact synthetic identity and object checksum, writes the local revocation marker in the fixed loopback PostgreSQL **before** any account deletion, verifies that the existing JWT has already lost Storage access, then deletes only that synthetic member and checks access again. If the pre-deletion revocation gate fails, the script refuses to delete the member. It preserves `gate=BLOCKED` and fails its CLI exit status if access survives.

Actual disposable PostgreSQL 17 RLS execution after the proposed policy change, under `SET LOCAL ROLE authenticated` and the fixed synthetic JWT subject, returned **`BEFORE_REVOKE=1`** and **`AFTER_REVOKE=0`** for the same synthetic `storage.objects` row. The SQL was executed in one transaction and **rolled back**. Local offline mock tests cover negative cases. The **updated full Auth/Storage HTTP flow was then executed against a freshly initialized isolated Docker-local Supabase CLI stack** using the PR fixture and post-delete scripts. The sanitized actual results confirmed `revocationLedgerPolicyInstalled=true`, `syntheticPrivateObjectBeforeDeletion=PASS`, `revocationAppliedBeforeDeletion=true`, `revocationBeforeDeletionStorageDenied=PASS`, `syntheticDeletion=PASS`, `newLoginDenied=PASS`, `refreshAfterDeletionDenied=PASS` and `staleAccessTokenStorageDenied=PASS`; harness exit code `0`. The original local JWT exposure FAIL remains recorded as baseline, followed by this local-only remediation proof. No credentials, token values, subject IDs or object bytes were recorded.

Critical separation: the local revocation marker lives in the *same disposable PostgreSQL instance*, **not** an independently durable incident-time ledger. Database-loss recovery from a newer backup, replay of an independent incident-complete deletion/revocation source, Hosted Auth/Storage equivalence and S8 admission remain unproven. This local policy neither changes Production RLS/grants nor authorizes service resumption. In particular, `providerManagedDataFullRestore=false`, `futureSafePrivacyReconciliation=false`, `drReady=false`, `gate=BLOCKED` and `serviceResumptionAllowed=false` are unchanged.

## 2026-10-30 — isolated local synthetic Auth/Storage functional execution (NOT Hosted DR)

On a disposable, independent Supabase CLI `2.117.0` local stack using PostgreSQL 17 at `127.0.0.1:54322` and Auth/Storage API at `127.0.0.1:54321`, the fixed synthetic fixture preparer and acceptance runner completed successfully after correcting the local CLI JWT issuer expectation to `supabase-demo` (`role=service_role` retained). The generated nonidentifying fixture report confirmed `memberCreated=true`, `deletedMemberRemoved=true`, `privateBucket=true`, `privateReadPolicyInstalled=true`, and deterministic private object digest `641ca9086ef039b62e8bd97b5813fed6dabd847c934e5d834d5c6746a9b4fee4`.

The actual local HTTP acceptance report showed **PASS** for positive login, wrong-password rejection, deleted synthetic account login rejection, refresh, sign-out then refresh denial, authorized private object SHA-256 parity and anonymous private object denial. It retained `target=local-loopback-synthetic-only`, `hostedProviderRecoveryProven=false`, `independentPrivacyContinuityProven=false`, `s8ServingE2eProven=false`, `wholeServiceRpoRtoProven=false`, `providerManagedDataFullRestore=false`, `futureSafePrivacyReconciliation=false`, `drReady=false`, `gate=BLOCKED`, `serviceResumptionAllowed=false` and `outputContainsIdentifiers=false`.

This is **actual local functional evidence**, not a recovered Production snapshot or a compatible Hosted Auth/Storage clone. No account credentials, session tokens, personal identifiers or raw object contents are attached. Independent incident-time privacy reconciliation, Hosted service equivalence and actual S8 serving readiness remain blocked. No Production SQL, paid Hosted project or customer data was touched.

# Hosted Auth / Storage DR recovery boundary — observed gap matrix (2026-10-28)

> Track: `ops` | Related: [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887) / [restore #40655447574](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40655447574)
> Classification: **read-only inventory and actionable recovery acceptance boundary**, not a claim of recovered Hosted services.
> Authority: `docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md`, `docs/operations/POSTGRES_BACKUP_RESTORE_RUNBOOK_V1.md`, immutable selected restore logs/evidence, and Supabase provider documentation.

## 2026-10-29 — measured source-row omissions in successful restore #40811556214

The protected [isolated PostgreSQL 17 restore #40811556214](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40811556214) **SUCCEEDED** against the exact encrypted Production [backup #40780751650](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40780751650), whose recorded migration version was `20261028011357`. The sanitized evidence artifact is `12870263616` (SHA-256 `1b462330dd9346717bfe57ee903dd64a256d689ee9d7b4e0e3256dee490ca6cc`; expires `2026-11-28T03:21:49Z`).

| Backup-source COPY measurement | Observed row/block count |
| --- | ---: |
| Provider COPY blocks skipped because the isolated target lacked the relation | **27 blocks** |
| Source rows in those skipped blocks | **92 rows** |
| Provider COPY blocks replayed with target-compatible column projection | **3 blocks** |
| Source rows replayed with some source columns omitted | **42 rows** |
| All Provider source rows successfully replayed (including the above 42) | **43 rows** |

**Never add 42 to 43.** The 42 projected-column rows are a subset of the 43 replayed Provider rows, not an additional population. These are *actual decrypted-backup input counts* for backup `40780751650`, **not current Production row counts**.

| Skipped Auth source relation | Skipped rows in that backup |
| --- | ---: |
| `auth.sessions` | 29 |
| `auth.mfa_amr_claims` | 29 |
| `auth.flow_state` | 21 |
| `auth.oauth_client_states` | 8 |
| `auth.identities` | 4 |
| `auth.custom_oauth_providers` | 1 |
| All remaining skipped Auth/Storage relations (including Storage skipped relations) | 0 |

Column-projected replay includes `auth.users=4`, `auth.refresh_tokens=38`, and `auth.audit_log_entries=0` source rows. Counts only were retained: `provider_source_counts_include_payloads=false`. No identifiers, tokens, row bodies or file contents are included in this matrix.

The restore performed **synthetic-only privacy reconciliation**. Its recovered service admission remains `gate=BLOCKED`, `serviceResumptionAllowed=false`, `providerManagedDataFullRestore=false`, `futureSafePrivacyReconciliation=false`, `drReady=false`. It does not prove Hosted login/session/token/SSO/MFA equivalence, Storage object bytes/policies, future privacy source continuity, or S8 service resumption. Earlier real-event replay remains a separate historical captured window.

**Latest-backup verified boundary:** [encrypted backup #40812111605](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40812111605) at migration `20261029012948` is now independently proven restorable to **isolated** PostgreSQL 17 by [run #40817391430](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40817391430), artifact `12872589146` (SHA-256 `38dc5b4024cdb45d7e69ef5793bd89010b67089602217bdb4413082a390b79fb`, expires `2026-11-28T04:23:26Z`). The latest counts below are decrypted-backup source rows, not live Production counts.

| Latest backup `40812111605` | Measured amount |
| --- | ---: |
| Provider source COPY blocks skipped on isolated PG17 | **27** |
| Source rows in skipped blocks | **112** |
| Provider source COPY blocks with projected columns | **3** |
| Rows replayed with some source columns excluded | **53** |
| All Provider source rows replayed (including 53 projected rows) | **54** |

**Latest skipped Auth rows:** `auth.sessions=39`, `auth.mfa_amr_claims=39`, `auth.flow_state=21`, `auth.oauth_client_states=8`, `auth.identities=4`, `auth.custom_oauth_providers=1`; all other skipped Auth and Storage relations have zero source rows in this backup. **Latest projected Auth rows:** `auth.users=4`, `auth.refresh_tokens=49`, `auth.audit_log_entries=0`. The 53 projected rows are a **subset** of 54 replayed Provider rows. `provider_source_counts_include_payloads=false`; no tokens, identifiers, emails or row bodies were included.

Unlike the older backup `40780751650` (92 skipped, 42 projected, 43 replayed), this latest backup's Provider rows are not fully restored. Synthetic privacy only passed. Latest admission explicitly reports `gate=BLOCKED`, `serviceResumptionAllowed=false`, `providerManagedDataFullRestore=false`, `futureSafePrivacyReconciliation=false`, `drReady=false`. Missing Hosted Auth/session/MFA/SSO, Storage bytes/policies, independent future-safe privacy continuity and S8 evidence are still blocking.

## 1. Scope and direct observations

Protected isolated PostgreSQL 17 restore **SUCCESS** `40655447574`, artifact `12801666793`, from governed backup `40468157715` at migration `20261027043527`. The selected privacy ledger `40468500587` and completed-canary read-only attestation `40633679630` passed bounded authoritative replay. The original canary `40468086758` remains FAILURE, and this evidence does not cover Production's subsequently observed migration version `20261028011357`.

The actual restore log classified **3 provider-managed COPY blocks projected** and **27 skipped** because the pinned loopback image lacked the target relation. This is a target-compatibility observation, not a proof that the excluded rows were empty, safely restored, or irrelevant. `provider_managed_data_full_restore=false` is mandatory.

### Provider-managed columns projected

| Source table | Columns omitted from isolated target |
| --- | --- |
| `auth.audit_log_entries` | `ip_address` |
| `auth.users` | `email_confirmed_at`, `email_change_token_new`, `phone`, `phone_confirmed_at`, `phone_change`, `phone_change_token`, `phone_change_sent_at`, `email_change_token_current`, `email_change_confirm_status`, `banned_until`, `reauthentication_token`, `reauthentication_sent_at`, `is_sso_user`, `deleted_at`, `is_anonymous` |
| `auth.refresh_tokens` | `parent`, `session_id` |

### Skipped COPY blocks: all 27, exact restore-log classification

**Auth (22; all `target_relation_missing`):**

`auth.custom_oauth_providers`, `auth.flow_state`, `auth.identities`, `auth.oauth_clients`, `auth.sessions`, `auth.mfa_amr_claims`, `auth.mfa_factors`, `auth.mfa_challenges`, `auth.mfa_recovery_code_sets`, `auth.mfa_recovery_codes`, `auth.oauth_authorizations`, `auth.oauth_client_states`, `auth.oauth_consents`, `auth.one_time_tokens`, `auth.sso_providers`, `auth.saml_providers`, `auth.saml_relay_states`, `auth.scim_tokens`, `auth.scim_users`, `auth.sso_domains`, `auth.webauthn_challenges`, `auth.webauthn_credentials`.

**Storage (5; all `target_relation_missing`):**

`storage.buckets`, `storage.buckets_analytics`, `storage.objects`, `storage.s3_multipart_uploads`, `storage.s3_multipart_uploads_parts`.

**Read-only Production count snapshot, 2026-10-28:** `auth.users=4`, `auth.sessions=29`, `auth.refresh_tokens=37`, `storage.buckets=0`, `storage.objects=0`. No identifiers, tokens, emails, object keys or row bodies were retrieved. This current snapshot is not the backup-time population; zero current Storage metadata is not proof about past object bytes.

## 2. What each proof does and does not establish

| Requirement | Current proof | Required before claiming Hosted equivalence |
| --- | --- | --- |
| MyeongHa application PostgreSQL schema/rows, owner/ACL | PASS for selected restore | Repeat against exact current incident-era schema/backup |
| Auth user identity references | PASS for `auth.users.id`/application FK at selected cutoff | Confirm all relevant Auth records under compatible Hosted provider |
| User sign-in/password/SSO/MFA | **NOT PROVEN**; Auth tables/columns projected or absent | Positive and negative synthetic sign-in after actual isolated Hosted recovery and configuration reconstruction |
| Existing session, refresh, JWT validity | **NOT PROVEN**; `auth.sessions` skipped, `auth.refresh_tokens.session_id` dropped | Explicit session/re-auth and token validity/revocation tests against restored Hosted service; project JWT signing configuration must be addressed without exposing secrets |
| Deleted account non-resurrection | PASS for captured ledger's application DB and independently observed historical Hosted deletion; **not** general Hosted restore | Actual restored Hosted Auth deletion state and access denial after all incident-time deletions/revocations |
| Storage buckets/metadata/policies | **NOT PROVEN**; Storage COPY blocks skipped | Bucket + metadata + RLS/policy parity on compatible isolated Hosted service |
| Storage file bytes/download access | **NOT PROVEN**; database dumps do not contain S3 object bytes | Controlled synthetic file-byte checksum, authorized/unauthorized download and delete/revoke tests against separately recovered object store |
| Future privacy source | `AUTHORITATIVE_CAPTURED_WINDOW_V1` only | Independent ledger continuity to chosen incident recovery reference and serving gate when incomplete |
| Service-wide RPO/RTO | Historical governed bounded comparison PASS (5536s/67s); new DB-only runtime not whole-service measure | Whole Hosted Auth/Storage/application cutover and access/retention check under `PT24H`/`PT6H` |
| Overall DR | `dr_ready=false` | Every preceding provider, privacy and S8 serving condition proven; otherwise fail closed |

## 3. Supported and unsupported recovery routes

**Provider-documented possible path (not exercised here):** a paid-plan, physical-backup-based **Restore to a New Project** clones the database including Auth user data and encryption root key. It does **not** automatically copy Storage object bytes, Auth settings/API keys, Edge Functions or Realtime configuration. A separate Storage-object transfer and service-level verification remain required. An automatically cloned project can also activate jobs/extensions; never clone Production for testing without guarding scheduled external effects and sensitive data. Documentation: [Supabase restore to new project](https://supabase.com/docs/guides/platform/clone-project), [backup/restore CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [Storage backup boundary](https://supabase.com/docs/guides/platform/backups).

**Unsupported inference:** treating loopback PostgreSQL compatibility projection as equivalent to Hosted GoTrue/Storage restore; treating metadata count parity as file-byte parity; treating migrated Auth users as proof that existing tokens are valid. Separate project JWT secrets can invalidate existing access tokens. Documentation: [Supabase Auth migration note](https://supabase.com/kb/troubleshooting/migrating-auth-users-between-projects).

**Current execution blocker:** the linked Supabase organization has two active projects (`MyengHa`, `Refund_management`), no development branch for the Production project, and no identified dedicated DR target. Neither existing project may be repurposed for Production cloning. Supabase documents **two active free projects** and paid restore-to-new-project; its listed Pro price starts at **$25/month**, with additional Micro compute projects from **$10/month**. A three-project Pro organization on default Micro compute is listed at approximately **$45/month** before add-ons/overage, but the actual checkout price and current billing entitlement must be checked before any commitment. Sources: [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase), [pricing](https://supabase.com/pricing), [billing FAQ](https://supabase.com/docs/guides/platform/billing-faq).

No extra resource was created, no billing was enabled, and no Production credentials or end-user data were copied to a test environment.

## 4. Concrete next executable acceptance unit (HOLD)

A dedicated authorized isolated Hosted project (or an approved full-stack local environment for **synthetic-only** functional tests, explicitly **not** a Hosted-equivalence proof) must exist before service-level verification. For a provider-backed trial:

1. Bind exact compatible source backup, project/runtime versions and the isolated destination; keep external cron/webhook/notification effects disabled and restrict access before importing sensitive data.
2. Verify restored Auth schema/identities/credential support using **synthetic accounts**, measure positive/negative login, new and surviving-session behavior, refresh/revocation, account deletion and JWT verification; do not log tokens.
3. Restore only authorized test Storage objects with known checksums, verify bucket metadata/policies and byte parity via authorized read, and assert unauthorized access denial.
4. Tie post-backup privacy ledger through the incident reference, verify no recovered deleted user's authenticated or Storage access survives; refuse serving if coverage is missing.
5. Record sanitized results with target/source identifiers, dates, PASS/FAIL and actual RPO/RTO intervals (no personal identifiers/secrets), and only then reconsider `provider_managed_data_full_restore` and `dr_ready`.

This document **closes the inventory/classification subtask only**. Provider-service equivalence, incident-time independent privacy continuity and S8 final E2E remain **HOLD**.


## 5. Local synthetic-only Auth/Storage functional acceptance harness (implementation, no Hosted claim)

The Phase-4 **local synthetic-only** alternative now has an executable
operator harness at scripts/run-postgres-hosted-synthetic-local-acceptance.mjs.
It is not run against Production, does not create accounts or target projects,
does not copy Production provider data, and is not a substitute for the separate
Hosted recovery route. The harness deliberately accepts **only**
http://127.0.0.1:54321 (explicit Supabase CLI API on loopback) and only
designated dr-synthetic-* identities, bucket and probe/ object path. An
admin/service-role key, remotely hosted target, alternate port, or redirect
fails closed. No login credentials, token, object body or identity
are written to its output.

**Prerequisites:** a separately started and isolated **local-only**
Supabase CLI full-stack instance at `127.0.0.1:54321` with its **local**
PostgreSQL port `127.0.0.1:54322`. This is a synthetic-only functional
target, not an equivalent restoration of a real Hosted project or any
Production identity. **No local project was provisioned as part of this PR.**

A new one-shot fixture preparer
`scripts/prepare-postgres-hosted-synthetic-local-fixtures.mjs` creates only
the fixed local `dr-synthetic-*` member and a separate deleted member,
a private `dr-synthetic-private` bucket and deterministic
`probe/data.txt` object, and an `authenticated` SELECT policy restricted to
that member's Auth UID and the exact object. Its raw bytes are the literal
UTF-8 string `dr-synthetic-private-object-2026\n`, with SHA-256
`641ca9086ef039b62e8bd97b5813fed6dabd847c934e5d834d5c6746a9b4fee4`.
Set the existing `MH_DR_LOCAL_*` test variables below **plus**
`MH_DR_LOCAL_SERVICE_ROLE_KEY` (the local CLI's service-role JWT)
and `MH_DR_LOCAL_DB_PASSWORD` (only the local CLI database password).
The preparer validates fixed localhost API/DB routes, local-only synthetic
identities and the exact object hash; it rejects non-CLI JWT role/issuer,
non-synthetic keys/names and an existing fixed policy before any new
fixture. It never accepts a hosted URL or arbitrary DB connection string.
Run it **only on a disposable local stack**:

```bash
node scripts/prepare-postgres-hosted-synthetic-local-fixtures.mjs
node scripts/run-postgres-hosted-synthetic-local-acceptance.mjs
```

The bootstrap deliberately does not rerun on a previously provisioned
fixture, or clean up partial state automatically after a failed setup.
Dispose of the **dedicated ephemeral local instance** before reseeding.
Do not reset any shared local database or copy Production data. Fixture
creation changes only the local synthetic instance; the main acceptance
runner below remains non-provisioning. CI tests use mocked HTTP/DB
calls and do **not** create a real local service or prove Hosted recovery.

When the local synthetic environment is explicitly prepared, set these
variables only in that isolated terminal (never commit their values):

- MH_DR_LOCAL_TARGET = http://127.0.0.1:54321
- MH_DR_LOCAL_ANON_KEY = local publishable/anon API key, **not** service role
- MH_DR_LOCAL_MEMBER_EMAIL, MH_DR_LOCAL_MEMBER_PASSWORD = dedicated dr-synthetic- test member
- MH_DR_LOCAL_DELETED_EMAIL, MH_DR_LOCAL_DELETED_PASSWORD = different, previously deleted dr-synthetic- account
- MH_DR_LOCAL_PRIVATE_BUCKET, MH_DR_LOCAL_OBJECT_PATH = private dr-synthetic-* bucket and probe/ object
- MH_DR_LOCAL_OBJECT_SHA256 = expected SHA-256 of the exact synthetic object bytes

Invoke node scripts/run-postgres-hosted-synthetic-local-acceptance.mjs.
It performs actual **local** positive sign-in, wrong-password denial,
deleted-account sign-in denial, authenticated private-object GET/checksum,
unauthenticated private-object denial, refresh-token issuance, sign-out and
refresh-token-after-sign-out denial. It reads only synthetic object bytes
and makes no direct DB SQL calls. The sign-out intentionally invalidates
only the supplied synthetic local session. It requires unambiguous
denial codes rather than interpreting a network error, redirect or
missing evidence as success.

The returned evidence is an identifier-free, self-limiting
myeongha-hosted-recovery-synthetic-local-v1 result with
target=local-loopback-synthetic-only,
hostedProviderRecoveryProven=false,
independentPrivacyContinuityProven=false,
s8ServingE2eProven=false, providerManagedDataFullRestore=false,
futureSafePrivacyReconciliation=false, drReady=false,
gate=BLOCKED and serviceResumptionAllowed=false. It does **not**
test real Hosted SSO/MFA/settings, JWT signing migrations, historical
Production sessions, real Storage object transfer, incident-time privacy
ledger continuity, RPO/RTO or actual S8 cutover. CI uses only an
in-memory mocked-HTTP verifier and **does not execute the live local
harness or claim an actual restored service**. The protected
Production and existing funded projects remain untouched.
