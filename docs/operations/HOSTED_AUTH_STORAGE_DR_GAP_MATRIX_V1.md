# Hosted Auth / Storage DR recovery boundary — observed gap matrix (2026-10-28)

> Track: `ops` | Related: [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887) / [restore #40655447574](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40655447574)
> Classification: **read-only inventory and actionable recovery acceptance boundary**, not a claim of recovered Hosted services.
> Authority: `docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md`, `docs/operations/POSTGRES_BACKUP_RESTORE_RUNBOOK_V1.md`, immutable selected restore logs/evidence, and Supabase provider documentation.

## 2026-10-29 — current migration-matched PostgreSQL restore and missing row-level evidence

[Isolated PostgreSQL 17 restore #40799522511](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40799522511)
has since **succeeded** on governed encrypted backup #40780751650 at
`migration_frontier=20261028011357`, equal to the read-only observed
Production migration version on 2026-10-29. Evidence artifact #12865611458
includes an isolated restore, synthetic privacy exercise and
`recovered-serving-admission.json` with `gate=BLOCKED`. This newer
restore did **not** replay the earlier Production nonzero privacy event
ledger; the captured-window authoritative example below remains historical.

**New evidence capture implementation:** the portable data replay's
provider-managed `COPY` classifications now count **actual input rows**
without recording any row values. Each skipped/provider-projected/provider-
replayed block includes `source_row_count`; the protected restore envelope
also records `provider_rows_skipped_in_loopback`,
`provider_rows_with_projected_columns_in_loopback` and
`provider_rows_replayed_in_loopback`, plus
`provider_source_counts_include_payloads=false`. Counts are measured from
the actual decrypted source `COPY` stream **on the isolated runner**, not
from live Production or a guessed previous schema inventory.

The already-successful run #40799522511 **predates this implementation**,
so it does *not* yet prove these new row-count fields. They require a
subsequent separately verified isolated restore run. A skipped nonzero
source-row count would quantify rows the pinned loopback target could not
accept; a zero source-row count does **not** prove Hosted service Auth
configuration, session validity, or Storage object bytes are recoverable.
Likewise, projected row counts record rows with omitted provider-specific
columns, not lost ciphertext or a proven ability to reconstruct those
columns. The encrypted governed backup itself is not modified.

**Admission remains blocked:** provider-managed row counts are diagnosis
only; no Hosted GoTrue/Storage restoration, private file download, real
incident-time privacy reconciliation or S8 cutover is implied.
`provider_managed_data_full_restore=false` and `dr_ready=false`.

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
