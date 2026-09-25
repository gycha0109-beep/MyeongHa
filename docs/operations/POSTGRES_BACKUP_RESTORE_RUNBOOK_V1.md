# MyeongHa PostgreSQL Backup / Restore Runbook v1

> Scope: non-character production operations only  
> Issue: `#389` — authoritative persistent-data recovery  
> Evidence date: 2026-09-24 KST  
> Production state: CURRENT-FRONTIER BACKUP+RESTORE PROVEN / DR NOT READY

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
successful production dump         = EVIDENCED — current-frontier backup run 35944326928
backup schema freshness             = CURRENT — backup frontier 1305 / deployed frontier 1305
current-schema restore              = EVIDENCED — run 35947730074 / frontier 1305
isolated restore drill path         = IMPLEMENTED / EXECUTED ON FRONTIER 1305
isolated application restore        = EVIDENCED — run 35947730074 / frontier 1305
application integrity/auth baseline = PASS — run 35947730074 / frontier 1305
restore evidence envelope runtime   = PROVEN — run 35947730074 / frontier 1305
bounded privacy source authority    = RUNTIME-PROVEN — run 35653303484 / AUTHORITATIVE_CAPTURED_WINDOW_V1
recovered finalization mechanics    = IMPLEMENTED / POST-MERGE CI GREEN
recovered finalization on current-frontier synthetic restore = PROVEN — run 35947730074 / synthetic captured-window mechanics
provider-managed full restore       = NOT PROVEN — provider projection/omission occurred
authoritative privacy reconciliation= PROVEN — run 35659483080 / bounded captured window only
future-safe privacy reconciliation  = false
RPO                                = APPROVED — PT24H (24 hours) / full authoritative comparison PASS (5536s)
RTO                                = APPROVED — PT6H (6 hours) / full authoritative comparison PASS (67s)
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

Endpoint resolution has one governed mode: the protected explicit Session Pooler host from `SUPABASE_PRODUCTION_SESSION_POOLER_HOST`.

The workflow validates the fixed user/host/port/database tuple and fails closed when the explicit host is absent or invalid. It does not use a Supabase Management API token to discover database routing. `SUPABASE_DB_PASSWORD` remains the database-password authority.

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

Backup-only secret:

```text
MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE
```

Rules:

- pooler host must be a bare `*.pooler.supabase.com` hostname from an operator-verified Supabase surface;
- never commit or log the real host, password, or passphrase;
- backup passphrase must be at least 32 characters and must not reuse the database password;
- recovery operators need a break-glass path to the passphrase that does not depend on the database being healthy.

The credentials and endpoint path are production-proven by successful governed backup runs including current-frontier baseline `35944326928` and authoritative-reconciliation backup `35643472159`.

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

Production deployment run `35943553635` applied the repository migration frontier through `1305_bounded_collection_read_runtime_authority.sql` successfully on head `2d297bf41a93ba8677aadf35ad3785881dae5f28`. Production is therefore deployed through migration `1305`.

The latest governed backup is run `35944326928`, source SHA `fcab2c63d3f682bd7e89bf048cff9d4d62c404dd`, artifact `10786441202` (`myeongha-postgres-20260924T014551Z`), completed at `2026-09-24T01:48:20Z`. The GitHub artifact digest is `sha256:66f17a25a32b71d8737d6d15f7858e8d46f4f331206c9072e525fd2e1b620450`; the encrypted archive SHA-256 recorded by restore evidence is `576847fbcfd07e06c2c8a4d01a22f98887b916a45dd172f6278b2b439bd88848`. Isolated restore run `35947730074` successfully restored and validated that current frontier, so backup and current-schema restore freshness are both proven. That run exercised synthetic privacy replay/finalization mechanics only; the separate Production non-zero authoritative privacy reconciliation remains run `35659483080` for its exact bounded captured window.

```text
latest governed backup                = PROVEN — run 35944326928
latest backup migration frontier      = 1305
latest deployed production migration  = 1305
backup schema freshness               = CURRENT / FRONTIER 1305 PROVEN
latest successful isolated restore    = PROVEN — run 35947730074 / frontier 1305
current-frontier restore              = PROVEN — run 35947730074
current-frontier privacy mechanics    = SYNTHETIC PASS — run 35947730074
authoritative privacy reconciliation  = PROVEN — run 35659483080 / bounded captured window only
provider-managed full restore         = NOT PROVEN
DR Ready                              = false
```

Current-frontier governed backup `35944326928` and isolated restore run `35947730074` now prove current-production-schema recovery mechanics through migration `1305`. This does not establish full hosted provider recovery equivalence, future-safe privacy reconciliation, or DR readiness.

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

Runtime evidence status: manual run `35947730074` successfully produced the self-contained envelope for migration frontier `1305`. Artifact `10787108939` contains `restore-evidence.json` and `privacy-reconciliation-evidence.json`, is retained until `2026-10-24T02:34:06Z`, and has digest `sha256:2128103fb02e8a11c8bf979c9daebed17356a17aa01e0f283e1aed5e26bf4236`. The run selected governed backup `35944326928` and synthetic incident reference `2026-09-24T01:49:00Z`.

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
- `35331742188`: latest successful isolated restore runtime evidence, covering migration frontier `1120`. Restore/validation completed in 2 seconds. Artifact `10541321355` contains both evidence JSON files. Provider portability remained 3 projected / 27 skipped with `provider_managed_data_full_restore=false`. The restored database passed the then-current four-event synthetic replay, identical replay idempotency, and the negative terminal-state fail-closed guard. Production has since advanced to migration `1240`, so this run is no longer current-frontier evidence.
- `35546262378`: successful migration-`1230` restore/runtime proof from governed backup `35536655149`. Restore/validation completed in 2 seconds; artifact `10615818654` recorded the self-contained evidence envelope and synthetic recovered-state finalization mechanics. It is superseded as current-frontier evidence by migration-`1240` run `35554439453`.

- `35554439453`: successful migration-`1240` current-frontier restore/runtime proof from governed backup `35553774002`. It is now historical evidence after Production advanced through migration `1280`.
- `35610864276`: successful migration-`1270` restore/runtime proof from governed backup `35610150628`. Restore/validation completed in 5 seconds; artifact `10644116472` records the self-contained evidence envelope and synthetic recovered-state finalization mechanics. It is now historical evidence after Production advanced through migration `1280`. Provider portability remains explicit at 3 projected / 27 skipped COPY blocks with `provider_managed_data_full_restore=false`.
- `35633155263`: successful migration-`1280` current-frontier restore/runtime proof from governed backup `35631594765`. Restore/validation completed in 3 seconds; artifact `10655731358` records the self-contained evidence envelope and synthetic recovered-state finalization mechanics. Provider portability remains explicit at 3 projected / 27 skipped COPY blocks with `provider_managed_data_full_restore=false`. It is now historical evidence after Production advanced through migration `1305`.
- `35807858750`: successful migration-`1300` restore/runtime proof from governed backup `35806027337`. Restore/validation completed in 3 seconds; artifact `10728627173` records the self-contained evidence envelope and synthetic recovered-state finalization mechanics. It is now historical evidence after Production advanced through migration `1305`.
- `35947730074`: successful migration-`1305` current-frontier restore/runtime proof from governed backup `35944326928`. Restore/validation completed in 3 seconds; artifact `10787108939` records the self-contained evidence envelope and synthetic recovered-state finalization mechanics. Provider portability remains explicit at 3 projected / 27 skipped COPY blocks with `provider_managed_data_full_restore=false`.

The latest completed drill, run `35947730074`, is successful evidence for MyeongHa application-data portability and application-critical Auth identity continuity at frontier `1305`. It also proves the synthetic recovered-state finalization mechanics on that restored database. It is not evidence of full hosted Supabase Auth/Storage recovery equivalence and does not satisfy Production non-zero authoritative privacy reconciliation or approved RPO/RTO closure gates.

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

Run `35947730074` satisfied this database-level integrity baseline for governed backup `35944326928`, including the current application schema through deployed migration `1305`. The evidence remains scoped to the isolated loopback target and does not claim full provider-service recovery.

## 10. Authorization verification

Before a restored state can be considered usable, verify at minimum:

- the production API execution role remains non-superuser and non-BYPASSRLS;
- MyeongHa application roles were restored exactly as governed;
- application membership/INHERIT edges normalized for grantor portability still match the source authority;
- application object ownership required by current runtime authority is intact;
- arbitrary client-supplied subject identifiers cannot become owner authority;
- one subject cannot read another subject's protected rows.

Run `35947730074` passed the loopback database-level authorization baseline for governed backup `35944326928`. Broader serving-path authorization, Production non-zero authoritative privacy/legal-retention reconciliation, and full provider-managed Auth/Storage equivalence remain separate gates.

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

If no independent post-cutoff evidence exists for the applicable incident window, record that as a blocking gap. A source artifact outside its bounded coverage window must not be stretched into future-safe authority.

The `Production PostgreSQL Privacy Recovery Ledger` encrypted off-primary-DB workflow is runtime-proven as `AUTHORITATIVE_CAPTURED_WINDOW_V1`. Scheduled run `35539838537` bound itself to current-frontier governed backup run `35536655149`, artifact `10612622254`, and exact backup cutoff `2026-09-20T20:50:05Z`; it executed the read-only export path and uploaded encrypted artifact `10614412005` with P30D retention. This establishes bounded post-backup source authority only for the captured window; it does not make future incident gaps authoritative.

Repository mechanics include the policy-neutral replay planner plus the separately governed account-deletion worker/finalizer authority. The restored-state orchestration continues to invoke `scripts/run-postgres-privacy-reconciliation-synthetic-drill.sh` for the collision-guarded synthetic replay/finalization mechanics. The merged recovered-state drill now validates ledger coverage, performs encrypted roundtrip and idempotent revocation/account-deletion-start replay, claims the exact deletion outbox event, executes the DB finalizer, simulates only the isolated Auth-provider ACK boundary, executes completion ACK, proves completion replay convergence, checks representative personalization/access state cannot resurrect, and checks approved P5Y Commerce evidence survives only in revoked form.

These expanded mechanics remain proven on the current frontier by run `35947730074`. The Production non-zero follow-on is now proven separately by run `35659483080`: exact governed backup `35643472159`, authoritative ledger `35653303484`, and Production canary `35653222211` were bound together, the ledger was replayed twice idempotently, account deletion was finalized/completed, non-resurrection checks passed, and identifier-free evidence artifact `10666580699` was uploaded. Therefore `authoritative_privacy_reconciliation=true` for that bounded captured window. `future_safe_privacy_reconciliation=false` and `dr_ready=false` remain because full hosted provider-managed Auth/Storage restore equivalence is still not proven.

## 12. RPO / RTO evidence

Current decision state:

```text
RPO: APPROVED — PT24H (24 hours)
RTO: APPROVED — PT6H (6 hours)
```

Daily backup frequency is not itself the approved RPO. Product Owner authority under #389 sets the objective at `PT24H`; schedule/capability must be validated against that objective.

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

Latest current-frontier synthetic run `35947730074` recorded:
- run head: `fcab2c63d3f682bd7e89bf048cff9d4d62c404dd`
- restore validation start: `2026-09-24T02:34:02Z`
- restore validation complete: `2026-09-24T02:34:05Z`
- isolated restore/validation diagnostic: `3s`
- workflow dispatch-to-completion elapsed: `66s`
- selected backup run: `35944326928`
- selected backup completed: `2026-09-24T01:48:20Z`
- synthetic incident/reference time: `2026-09-24T01:49:00Z`
- synthetic data-loss-window diagnostic: `40s`
- evidence artifact: `10787108939`, expires `2026-10-24T02:34:06Z`, digest `sha256:2128103fb02e8a11c8bf979c9daebed17356a17aa01e0f283e1aed5e26bf4236`

Those run `35947730074` values remain synthetic diagnostics only.

Full authoritative procedure run `35659483080` recorded:
- runtime head: `31746f635ae249811842b8d225c2734e4d1b4c51`
- selected governed backup: `35643472159`
- backup completed at: `2026-09-21T19:16:17Z`
- incident/reference time: `2026-09-21T20:48:33Z`
- authoritative ledger: `35653303484`
- Production canary: `35653222211`
- workflow start: `2026-09-21T21:50:39Z`
- workflow completion: `2026-09-21T21:51:46Z`
- achieved authoritative data-loss window: `5536s` (1h 32m 16s)
- achieved authoritative recovery duration: `67s`
- evidence artifact: `10666580699`, expires `2026-10-21T21:51:40Z`, digest `sha256:58d56b54f1b3ffe1d21fd1934bf3c2edce0826bb624bf261fad30b766f127c28`

Comparison result:
- RPO: **PASS** — `5536s <= PT24H`
- RTO: **PASS** — `67s <= PT6H`

These comparisons close the #389 full-procedure objective-comparison gate. They do not prove full hosted provider-managed Auth/Storage restore equivalence and therefore do not promote `DR Ready`.

## 13. #389 closure gate

Do not close `#389` until all are evidenced:

- [x] backup encryption secret provisioned through production control plane
- [x] exact Production Session Pooler endpoint path provisioned as the sole database-routing authority
- [x] actual production logical backup succeeded
- [x] backup schedule and 30-day artifact retention evidenced
- [x] provider plan / automatic backup / PITR state recorded
- [x] backup failure observability verified
- [x] exact backup point selection mechanics proven
- [x] historical isolated restore mechanics completed — run `35331742188` / migration frontier `1120`
- [x] historical integrity and database-level authorization baseline passed — run `35331742188`
- [x] bounded captured-window privacy source authority runtime-proven — run `35539838537`
- [x] account-deletion finalizer and recovered-state finalization mechanics implemented / post-merge CI green
- [x] fresh governed backup captured after deployed migration `1305` — run `35944326928` / artifact `10786441202`
- [x] isolated restore completed from that current-frontier backup — run `35947730074`
- [x] recovered-state synthetic finalization drill executed on that fresh governed restore — run `35947730074`
- [x] authoritative privacy/deletion/legal-retention reconciliation exercised for the applicable captured window — run `35659483080`
- [x] achieved recovery duration measured across the full authoritative recovery procedure — `67s`
- [x] full authoritative data-loss window measured — `5536s`
- [x] RPO approved — `PT24H`; full authoritative achieved evidence comparison **PASS** — `5536s`
- [x] RTO approved — `PT6H`; full authoritative achieved evidence comparison **PASS** — `67s`

The #389 backup/restore, privacy reconciliation, and objective-comparison closure gates are now evidenced. The issue may close without asserting full hosted provider recovery equivalence.

```text
DR Ready = FALSE / NOT EVIDENCED
reason   = provider-managed Auth/Storage full-restore equivalence remains unproven
```
