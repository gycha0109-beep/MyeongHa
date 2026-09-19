# MyeongHa PostgreSQL Backup / Restore Runbook v1

> Scope: non-character production operations only  
> Issue: `#389` — authoritative persistent-data recovery  
> Evidence date: 2026-09-18 KST  
> Production state: BACKUP PRODUCTION-PROVEN / CURRENT-SCHEMA BACKUP+RESTORE EVIDENCED / DR NOT READY

## 1. Current production authority

Current production authority:

- Supabase project ref: `cnsfpcdiyofqvhpcegfc`
- Project state: `ACTIVE_HEALTHY`
- Region: `ap-southeast-1`
- PostgreSQL: `17.6.1.166` / engine 17
- Current Supabase organization plan: `free`

The repository does not treat provider health, an assumed dashboard backup, or an undocumented platform snapshot as recovery evidence. Current operating classification:

```text
provider automatic daily backup = NOT RELIED UPON ON CURRENT FREE PLAN
provider retention              = NOT RELIED UPON ON CURRENT FREE PLAN
PITR                            = NOT AVAILABLE UNDER THE CURRENT FREE-PLAN OPERATING BASELINE
application-owned logical dump     = IMPLEMENTED BY REPOSITORY WORKFLOW
successful production dump         = EVIDENCED — latest run 35329018925
backup schema freshness             = CURRENT THROUGH DEPLOYED MIGRATION 1120
current-schema restore              = EVIDENCED — run 35331742188
isolated restore drill path        = IMPLEMENTED / EXECUTED
isolated application restore       = EVIDENCED — latest run 35331742188
application integrity/auth baseline= PASS — latest run 35331742188
restore evidence envelope runtime  = PROVEN — run 35331742188
restored-DB synthetic replay       = PROVEN — run 35331742188 / NON-AUTHORITATIVE
provider-managed full restore      = NOT PROVEN — provider projection/omission occurred
privacy reconciliation            = BLOCKED BY FINALIZER + AUTHORITATIVE NON-ZERO RECOVERY PROOF
RPO                                = OPEN DECISION
RTO                                = OPEN DECISION
```

Restore drill: PASSED for MyeongHa application-data portability and application-critical Auth identity continuity; full hosted provider-managed Auth/Storage recovery and DR readiness remain NOT EVIDENCED.

## 2. Backup contract

Workflow:

```text
.github/workflows/production-postgres-backup.yml
```

Triggers:

- scheduled daily at `18:17 UTC` (`03:17 KST`)
- explicit `workflow_dispatch`

The schedule is a backup frequency, not an approved RPO.

Endpoint resolution has two governed modes:

1. preferred explicit Session Pooler host from protected `SUPABASE_PRODUCTION_SESSION_POOLER_HOST`;
2. Supabase Management API fallback when the explicit host is absent.

The workflow validates the resolved user/host/port/database tuple and never guesses a pooler hostname. `SUPABASE_DB_PASSWORD` remains the database-password authority.

The backup workflow:

1. uses production credentials only inside the protected GitHub `production` environment;
2. uses pinned Supabase CLI `2.117.0`;
3. constructs and masks the credential-bearing URL only in runner memory;
4. exports `roles.sql`, `schema.sql`, and `data.sql` using the Supabase CLI backup recipe;
5. records SHA-256 checksums of plaintext dump members;
6. records project ref, exact source SHA, CLI version, and UTC timestamps;
7. encrypts the archive with AES-256-CBC + PBKDF2 before upload;
8. deletes the plaintext archive before publication;
9. uploads only the encrypted archive, encrypted checksum, and non-sensitive public manifest;
10. retains the GitHub Actions artifact for 30 days.

The GitHub artifact is off-Supabase. It protects against a Supabase-only failure, but is not a separate administrative/security domain from the repository account.

## 3. Required credentials

Primary database inputs:

```text
SUPABASE_DB_PASSWORD
SUPABASE_PRODUCTION_SESSION_POOLER_HOST
```

Management API fallback:

```text
SUPABASE_ACCESS_TOKEN
```

Backup-only secret:

```text
MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE
```

Rules:

- pooler host must be a bare `*.pooler.supabase.com` hostname from an operator-verified Supabase surface;
- never commit or log the real host, password, access token, or passphrase;
- backup passphrase must be at least 32 characters and must not reuse the database password;
- recovery operators need a break-glass path to the passphrase that does not depend on the database being healthy.

The credentials and endpoint path are production-proven by successful backup runs `35260191079` and latest run `35329018925`.

## 4. Backup success evidence

A backup point is admissible only when one successful workflow run provides:

```text
workflow run ID
exact GITHUB_SHA
UTC started/completed timestamps
encrypted artifact name
encrypted artifact SHA-256
manifest project_ref == cnsfpcdiyofqvhpcegfc
workflow conclusion == success
```

Governed source backup for the current drill series:

```text
run ID        35329018925
artifact ID   10540625562
artifact      myeongha-postgres-20260918T092042Z
source SHA    e1a6500968f7722666cae2038fd49ddf3f9d3540
encrypted SHA sha256:96c40cb4c61f71d56a97dd9af34a2c31eb4674809a501f435b2634c12043a394
expires       2026-10-18T09:23:19Z
retention     30 days
```

### 4.1 Current backup freshness boundary

Production deployment run `35324012524` applied migration `1120_paid_general_natal_product_candidate.sql` successfully on head `eddc1c331b6a8c0f47f54c150acd2f6cc5c7c0c2`. Fresh production backup run `35329018925` was then captured from source SHA `e1a6500968f7722666cae2038fd49ddf3f9d3540`. Restore run `35331742188` selected that exact governed backup and completed successfully on main head `f736381f21171a1480292988e97c61ca68a5e62b`.

A repository comparison from the backup source SHA to the restore head contains zero `supabase/migrations/` changes. Therefore:

```text
selected current-schema backup       = PROVEN — run 35329018925
latest deployed migration captured   = 1120
backup schema freshness              = CURRENT THROUGH MIGRATION 1120
fresh restore from that backup       = PROVEN — run 35331742188
provider-managed full restore        = NOT PROVEN
DR Ready                             = false
```

This freshness proof is point-in-time evidence. A later production migration invalidates the freshness claim until another governed backup and restore drill cover the new migration frontier.

Backup failure observability for v1 is the scheduled GitHub Actions workflow conclusion. A failed or missing scheduled run remains an operations alert until a dedicated alerting sink is approved.

## 5. Restore target rule

Never restore a drill directly over serving production.

Preferred target order:

1. isolated Supabase recovery project with compatible capabilities;
2. explicitly approved Supabase-compatible/self-hosted target for portability validation.

Billable recovery projects or branches require normal cost approval before creation.

The repository manual drill is:

```text
.github/workflows/postgres-isolated-restore-drill.yml
```

It is **manual-only** and targets **GitHub Actions loopback Supabase PostgreSQL 17.6.1.166**. It does not accept a remote restore database URL.

Fixed loopback connections:

```text
postgresql://supabase_admin:restore-drill@127.0.0.1:5432/postgres  # privileged replay only
postgresql://postgres:restore-drill@127.0.0.1:5432/postgres        # post-restore validation
```

The drill never receives the production database password, production pooler host, or production access token. It receives only the protected backup decryption passphrase after GitHub has validated the selected backup run and exact artifact authority.

Before upload, `scripts/build-postgres-restore-evidence-envelope.mjs` binds the harness result to the selected backup artifact and drill timing. The uploaded JSON is self-contained enough to re-establish the governed source without reconstructing GitHub job context manually. It includes and validates:

```text
evidence envelope version
backup workflow run id
backup completion timestamp
incident/reference timestamp
derived synthetic data-loss-window seconds
source artifact name + expiry
encrypted archive name + SHA-256
exact backup/source Git SHA + project ref
restore start/completion + measured isolated restore duration
provider portability boundary
privacy_reconciliation = not_exercised_by_this_workflow
dr_ready = false
```

The envelope builder rejects project/source mismatches, inconsistent restore duration, an incident reference before the selected backup point, invalid artifact metadata, or attempts to overwrite preexisting source/timing evidence. These fields strengthen operator-independent evidence; they do not approve an RPO/RTO or make the isolated portability drill a full provider-service recovery.

Runtime evidence status: manual run `35331742188` executed from current main head `f736381f21171a1480292988e97c61ca68a5e62b` against fresh backup run `35329018925` and successfully produced the self-contained envelope. Artifact `10541321355` contains the resulting `restore-evidence.json` and `privacy-reconciliation-evidence.json` and is retained until `2026-10-18T09:52:36Z`. Envelope runtime and current-schema restore portability are proven for this run while DR readiness remains blocked by the independent privacy/legal-retention, provider-service, and RPO/RTO gates.

## 6. Restore drill runtime history

Observed evidence:

- `35261643085`: source-run/artifact authority passed; historical plaintext checksum entries used producer-runner absolute paths. PR `#934` normalized the three governed dump members by basename and changed future checksums to relative paths.
- `35264061319`: ciphertext and all plaintext checksums passed; vanilla PostgreSQL lacked the Supabase `anon` role baseline. PR `#936` moved the drill to Supabase PostgreSQL `17.6.1.166`.
- `35265689965`: Supabase image initialized and MyeongHa role creation progressed; hosted-only `supabase_realtime_admin` was absent. PR `#940` made provider-managed role replay fail-closed and provider-aware without fabricating roles.
- `35268484039`: role boundary passed; schema replay reached MyeongHa owner assignment and failed because demoted `postgres` could not `SET ROLE` to the dumped application owner. PR `#946` separated loopback `supabase_admin` replay from ordinary `postgres` validation.
- `35270505668`: privileged replay progressed through the new owner boundary, then two MyeongHa role-membership statements failed only because the dump preserved `GRANTED BY "postgres"` provenance. PR `#950` normalizes only exact `myeongha_* -> myeongha_*` grantor provenance and verifies the resulting membership plus `INHERIT` state through `pg_auth_members`.
- `35271689987`: #950 role replay passed and `schema.sql` completed. `data.sql` then failed on the first incompatible hosted-Auth COPY shape: the source `auth.audit_log_entries` COPY contained `ip_address`, while the pinned loopback provider baseline did not have that target column. Archive integrity, source authority, role handling, and application schema replay had already passed.
- `35276773643`: #956 again passed source authority, checksums, provider-aware roles, application memberships, and strict schema replay. Its generic provider-data builder then classified `auth.users` itself as incompatible because the hosted source carries newer Auth columns than the pinned PostgreSQL bootstrap target. The subsequent mandatory `auth.users` replay assertion exited before SQL data replay. This exposed a harness-policy defect: provider tables with source-only columns were being skipped wholesale instead of preserving target-compatible identity columns.
- `35280075274`: first successful isolated restore. Governed backup/artifact/checksum authority passed; application roles, memberships, representative ownership, required tables, authorization baseline, `auth.users` identity continuity, and `subjects.auth_user_id -> auth.users.id` referential integrity all passed. Three provider COPY blocks (`auth.audit_log_entries`, `auth.users`, `auth.refresh_tokens`) were projected to target-supported columns and 27 provider COPY blocks were skipped because the pinned loopback target lacked those hosted relations. Therefore `provider_managed_data_full_restore=false` remained explicit. Restore/validation diagnostic was 3 seconds and the synthetic data-loss-window diagnostic was 82 seconds.
- `35325070718`: current runtime-proof drill from main head `eddc1c331b6a8c0f47f54c150acd2f6cc5c7c0c2`. Restore/validation completed in 4 seconds. The self-contained evidence envelope was generated successfully; artifact `10538807602` contains `restore-evidence.json` and `privacy-reconciliation-evidence.json`. Provider portability remained explicit at 3 projected and 27 skipped COPY blocks with `provider_managed_data_full_restore=false`. The restored database then passed a four-event synthetic privacy replay, identical second replay idempotency, and a negative terminal-state fail-closed case. That replay remains non-authoritative because `authoritative_post_backup_source=false`.
- `35331742188`: latest current-schema restore drill from main head `f736381f21171a1480292988e97c61ca68a5e62b` against fresh backup run `35329018925`. Restore/validation completed in 2 seconds. Backup source SHA `e1a6500968f7722666cae2038fd49ddf3f9d3540` already includes deployed migration `1120`, and there were zero subsequent migration-file changes through the restore head. Artifact `10541321355` contains both evidence JSON files. Provider portability remained 3 projected / 27 skipped with `provider_managed_data_full_restore=false`. The restored database again passed four-event synthetic replay, identical replay idempotency, and the negative terminal-state fail-closed guard.

The latest drill is successful for MyeongHa application-data portability and application-critical Auth identity continuity. It is not evidence of full hosted Supabase Auth/Storage recovery equivalence, and it does not satisfy privacy/legal-retention or approved RPO/RTO closure gates.

Current Supabase self-hosted restore guidance explicitly warns that platform projects may run newer Auth/Storage schema revisions than a self-hosted target. It lists missing provider tables/columns in `data.sql` as a known restore incompatibility and recommends excluding incompatible provider data before the final single-transaction restore. For MyeongHa, `auth.users` cannot simply be omitted because application subjects reference Auth user IDs, so the loopback portability path additionally preserves target-compatible Auth identity columns through controlled column projection.

## 7. Role, schema, and provider-data portability boundary

### 7.1 Roles

- every role created by the governed role dump for this application must be a `myeongha_*` application role;
- application roles must restore exactly once and remain non-superuser/non-BYPASSRLS;
- the drill **must not fabricate missing provider-managed roles**;
- only the exact missing-role error shape for an absent provider-managed `supabase_*` role may be classified as a target-baseline difference;
- every other role replay error is fatal;
- only exact MyeongHa-to-MyeongHa membership statements may have hosted `GRANTED BY "postgres"` provenance removed, and the resulting membership/INHERIT state is verified afterwards.

### 7.2 Schema

`schema.sql` is replayed under the fixed loopback `supabase_admin` principal with `--single-transaction` and `ON_ERROR_STOP=1`. MyeongHa object ownership is then validated through ordinary loopback `postgres`.

### 7.3 Data

The original `data.sql` is always decrypted and checksum-verified **before any portability transformation**. The original file is never modified or uploaded.

After schema replay, the harness snapshots the isolated target column catalog and creates an ephemeral `data.portable.sql`:

- application-owned `public` COPY blocks are fail-closed: any source/target column incompatibility, generated-column conflict, missing target relation, or required unbacked target column is fatal;
- a provider-managed COPY block with an exact compatible shape is replayed unchanged;
- when a provider-managed source COPY has columns absent from the target, **column projection** may retain only columns that exist and are copyable on the target;
- projection is permitted only when every target-side required non-default/non-generated column is backed by the source and at least one copyable shared column remains;
- each projected COPY row must still contain exactly the source header's field count before any field is selected; malformed COPY rows fail closed;
- a provider-managed COPY block is skipped only when its target relation is absent, it has no copyable shared columns, or the target requires a source-unbacked column that cannot default/generate itself;
- every projection and omission is recorded as schema/table/column-shape metadata in JSON evidence; no row contents are emitted;
- the transformation is generic and must not hardcode a specific Auth/Storage table or column discovered by a previous failure;
- `auth.users` is mandatory for this drill and its `id` column must be retained in replay even when newer hosted Auth columns require projection;
- this `auth.users` result proves application-critical **identity continuity** only; it does not claim full Auth-service semantic equivalence on an older loopback provider schema;
- after data replay, `subjects.auth_user_id` must have zero dangling references to `auth.users`;
- final data replay remains `--single-transaction`, `ON_ERROR_STOP=1`, with `session_replication_role=replica`.

A successful run that projected or skipped any provider-managed COPY data must record:

```text
provider_managed_data_full_restore = false
```

Such a run may prove application-data portability and application-critical Auth identity continuity, but it is **not** evidence of full provider-managed Auth/Storage data recovery. The encrypted source artifact still contains every original provider column and row; projection/omission applies only to this self-hosted loopback validation path.

This distinction prevents a green portability drill from being mislabeled as full Supabase-platform DR.

## 8. Download, verify, and decrypt

Controlled recovery environments must verify ciphertext before decrypting and verify all governed plaintext members before replay. Historical absolute producer paths are normalized only to the approved basenames:

```text
roles.sql
schema.sql
data.sql
```

Stop on any checksum/decryption/member mismatch. Decrypted SQL/data files and the ephemeral portable replay file must never be uploaded as Actions artifacts.

## 9. Integrity verification

A drill is not successful merely because `psql` exits zero.

At minimum verify:

1. required application tables/functions exist;
2. representative application object ownership is restored;
3. application roles and role memberships remain within the governed authorization model;
4. `auth.users` was replayed and its `id` column was retained for identity continuity;
5. `subjects.auth_user_id` has zero dangling references;
6. provider-managed COPY projections and omissions, if any, are recorded explicitly;
7. any provider projection/omission forces `provider_managed_data_full_restore=false`;
8. no user-owned row contents are emitted to GitHub logs or evidence artifacts.

Current baseline required tables:

```text
subjects
birth_profiles
products
product_offers
data_deletion_jobs
```

Current representative owner check:

```text
public.cmd_activate_content_release_v1(uuid,boolean)
owner == myeongha_content_publication_owner
```

Run `35331742188` satisfied this database-level integrity baseline for fresh backup `35329018925`, including the current application schema through deployed migration `1120`. The evidence remains scoped to the isolated loopback target and does not claim full provider-service recovery.

## 10. Authorization verification

Before a restored state can be considered usable, verify at minimum:

- the production API execution role remains non-superuser and non-BYPASSRLS;
- MyeongHa application roles were restored exactly as governed;
- application membership/INHERIT edges normalized for grantor portability still match the source authority;
- application object ownership required by current runtime authority is intact;
- arbitrary client-supplied subject identifiers cannot become owner authority;
- one subject cannot read another subject's protected rows.

Run `35331742188` passed the loopback database-level authorization baseline for fresh backup `35329018925`. Broader serving-path authorization, privacy/legal-retention reconciliation, and full provider-managed Auth/Storage equivalence remain separate gates.

## 11. Privacy / deletion reconciliation before serving

A historical backup can contain data deleted or access revoked after the backup point. A restored state must never be promoted directly to serving production.

Recovery reconciliation must account for authoritative post-cutoff deletion/revocation state, including the applicable implementation of:

```text
data_deletion_jobs / deletion tombstones or successor authority
revoked share artifacts
revoked memory / record access grants
device installation and notification revocation state
account lifecycle / merged/deleted subject state
commerce records retained only under governing legal/product policy
```

Procedure:

1. establish backup cutoff timestamp;
2. establish an authoritative post-cutoff deletion/revocation ledger;
3. replay/reconcile deletions and revocations against the isolated state;
4. verify affected records/access remain absent or disabled;
5. separately verify legally retained commerce records are retained only as permitted;
6. only then consider a recovered state for serving traffic.

If no independent post-cutoff evidence exists, record that as a blocking gap. **privacy reconciliation is not exercised by the workflow**.

Repository mechanics now include the policy-neutral replay planner `scripts/build-postgres-privacy-reconciliation-plan.mjs` and an isolated DB replay regression. That foundation replays only already-authorized revocation/account-deletion-start commands. It does not establish a durable authoritative post-backup privacy source or destructive account-deletion finalization. `P0-PR-01` policy is now DECIDED; finalizer implementation and authoritative recovered-state reconciliation remain separate gates.

The manual restore workflow is also wired to run `scripts/run-postgres-privacy-reconciliation-synthetic-drill.sh` against the disposable restored loopback database. That step uses collision-guarded synthetic rows, exercises four non-zero revocation/account-deletion-start events, verifies identical replay idempotency, and verifies a missing terminal revoke state aborts fail-closed. It writes only sanitized `privacy-reconciliation-evidence.json`; synthetic identifiers and row payloads are not uploaded.

This restored-DB step is explicitly non-authoritative: `synthetic_fixture=true`, `authoritative_post_backup_source=false`, and `dr_ready=false`. Latest run `35331742188` runtime-proved these mechanics against the fresh current-schema restore: four synthetic events replayed successfully, an identical second replay was idempotent, and a missing terminal revoke state failed closed. The durable authoritative post-backup source and destructive finalization remain unresolved. Commerce retention policy is DECIDED as the approved `P5Y` baseline.

## 12. RPO / RTO evidence

Current decision state:

```text
RPO: OPEN DECISION
RTO: OPEN DECISION
```

Daily backup frequency is not an approved RPO.

Each completed drill must record:

```text
incident/reference time
selected backup completed_at_utc
restore_start_utc
restore_database_complete_utc
privacy_reconciliation_complete_utc
authorization_verification_complete_utc
drill_complete_utc
achieved recovery duration
achieved data-loss window
```

Definitions:

```text
achieved recovery duration
= drill_complete_utc - restore_start_utc

achieved data-loss window
= incident/reference time - selected backup completed_at_utc
```

Latest run `35331742188` recorded:
- run head: `f736381f21171a1480292988e97c61ca68a5e62b`
- restore validation start: `2026-09-18T09:52:33Z`
- restore validation complete: `2026-09-18T09:52:35Z`
- isolated restore/validation diagnostic: `2s`
- workflow dispatch-to-completion elapsed: `52s`
- selected backup run: `35329018925`
- selected backup completed: `2026-09-18T09:23:19Z`
- synthetic incident/reference time: `2026-09-18T09:23:23Z`
- synthetic data-loss-window diagnostic: `4s`
- evidence artifact: `10541321355`, expires `2026-10-18T09:52:36Z`

These are diagnostic metrics, not a full achieved RTO or an approved RPO/RTO comparison. The manual workflow now exercises synthetic restored-DB privacy replay mechanics, but authoritative post-backup privacy reconciliation, destructive finalization, and commerce legal-retention remain outside the run.

Only business-approved RPO/RTO values may be compared as PASS/FAIL.

## 13. #389 closure gate

Do not close `#389` until all are evidenced:

- [x] backup encryption secret provisioned through production control plane
- [x] exact Production Session Pooler endpoint path provisioned or Management API fallback authorization restored
- [x] actual production logical backup succeeded
- [x] backup schedule and 30-day artifact retention evidenced
- [x] provider plan / automatic backup / PITR state recorded
- [x] backup failure observability verified
- [x] exact backup point selected
- [x] current production schema captured by governed backup `35329018925` after migration `1120`
- [x] restore drill completed from that current-schema backup — run `35331742188`
- [x] isolated restore mechanics completed — run `35331742188` against governed backup `35329018925`
- [x] integrity verification passed for current-schema backup — run `35331742188`
- [x] authorization verification passed at the governed database-level baseline — run `35331742188`
- [x] restored-DB synthetic privacy replay mechanics exercised — run `35331742188` (non-authoritative)
- [ ] authoritative privacy/deletion/legal-retention reconciliation exercised
- [ ] achieved recovery duration measured across the full authoritative recovery procedure
- [x] synthetic drill data-loss window measured — `4s` (diagnostic, not approved RPO)
- [ ] RPO approved and compared with achieved evidence
- [ ] RTO approved and compared with achieved evidence

Until all closure gates are satisfied:

```text
DR Ready = FALSE / NOT EVIDENCED
```
