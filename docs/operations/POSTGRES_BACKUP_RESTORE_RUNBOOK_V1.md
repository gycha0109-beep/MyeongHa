# MyeongHa PostgreSQL Backup / Restore Runbook v1

> Scope: non-character production operations only  
> Issue: `#389` — authoritative persistent-data recovery  
> Evidence date: 2026-09-18 KST  
> Production state: BACKUP PRODUCTION-PROVEN / RESTORE NOT YET PASSED

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
application-owned logical dump  = IMPLEMENTED BY REPOSITORY WORKFLOW
successful production dump      = EVIDENCED — run 35260191079
isolated restore drill path     = IMPLEMENTED / EXECUTED
isolated restore                = NOT YET EVIDENCED — run 35271689987 reached provider-managed data replay and exposed Auth schema-version skew
RPO                             = OPEN DECISION
RTO                             = OPEN DECISION
```

Restore drill: EXECUTED / NOT YET PASSED.

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

The credentials and endpoint path are production-proven by successful backup run `35260191079`.

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
run ID        35260191079
artifact ID   10513872847
artifact      myeongha-postgres-20260917T184004Z
source SHA    ef61941313ee3a870076847c5dfb5c1b05ba4159
ZIP digest    sha256:601fbbac6149d960789e9500e8299f73ab3b0659a8201d4c60fa94ff73a7b9f8
retention     30 days
```

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

## 6. Restore drill runtime history

Observed evidence:

- `35261643085`: source-run/artifact authority passed; historical plaintext checksum entries used producer-runner absolute paths. PR `#934` normalized the three governed dump members by basename and changed future checksums to relative paths.
- `35264061319`: ciphertext and all plaintext checksums passed; vanilla PostgreSQL lacked the Supabase `anon` role baseline. PR `#936` moved the drill to Supabase PostgreSQL `17.6.1.166`.
- `35265689965`: Supabase image initialized and MyeongHa role creation progressed; hosted-only `supabase_realtime_admin` was absent. PR `#940` made provider-managed role replay fail-closed and provider-aware without fabricating roles.
- `35268484039`: role boundary passed; schema replay reached MyeongHa owner assignment and failed because demoted `postgres` could not `SET ROLE` to the dumped application owner. PR `#946` separated loopback `supabase_admin` replay from ordinary `postgres` validation.
- `35270505668`: privileged replay progressed through the new owner boundary, then two MyeongHa role-membership statements failed only because the dump preserved `GRANTED BY "postgres"` provenance. PR `#950` normalizes only exact `myeongha_* -> myeongha_*` grantor provenance and verifies the resulting membership plus `INHERIT` state through `pg_auth_members`.
- `35271689987`: #950 role replay passed and `schema.sql` completed. `data.sql` then failed on the first incompatible hosted-Auth COPY shape: the source `auth.audit_log_entries` COPY contained `ip_address`, while the pinned loopback provider baseline did not have that target column. Archive integrity, source authority, role handling, and application schema replay had already passed.

The last failure is a provider schema-version mismatch, not corruption of the governed backup and not a MyeongHa application-schema failure.

Current Supabase self-hosted restore guidance explicitly warns that platform projects may run newer Auth/Storage schema revisions than a self-hosted target. It lists missing provider tables/columns in `data.sql` as a known restore incompatibility and recommends excluding the incompatible COPY block before the final single-transaction restore.

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

- application-owned `public` COPY blocks are fail-closed: a missing target relation, missing source column, or required unbacked target column is fatal;
- a provider-managed COPY block is replayed when its COPY column shape is compatible with the isolated target;
- only an incompatible provider-managed COPY block may be omitted from the loopback portability replay;
- every omission is recorded as schema/table metadata and reason in JSON evidence; no row contents are emitted;
- the transformation is generic and must not hardcode a specific Auth/Storage table or column discovered by a previous failure;
- compatible provider data continues to replay, including `auth.users`;
- `auth.users` is mandatory for this drill because `public.subjects.auth_user_id` has a foreign key to it;
- after data replay, `subjects.auth_user_id` must have zero dangling references to `auth.users`;
- final data replay remains `--single-transaction`, `ON_ERROR_STOP=1`, with `session_replication_role=replica`.

A successful run that omitted any incompatible provider-managed COPY block must record:

```text
provider_managed_data_full_restore = false
```

Such a run may prove application-data portability and application-critical Auth identity continuity, but it is **not** evidence of full provider-managed Auth/Storage data recovery. The encrypted source artifact still contains the original provider data; the omission applies only to this self-hosted loopback validation path.

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
4. `auth.users` was included in compatible provider replay;
5. `subjects.auth_user_id` has zero dangling references;
6. provider-managed COPY omissions, if any, are recorded explicitly;
7. no user-owned row contents are emitted to GitHub logs or evidence artifacts.

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

## 10. Authorization verification

Before a restored state can be considered usable, verify at minimum:

- the production API execution role remains non-superuser and non-BYPASSRLS;
- MyeongHa application roles were restored exactly as governed;
- application membership/INHERIT edges normalized for grantor portability still match the source authority;
- application object ownership required by current runtime authority is intact;
- arbitrary client-supplied subject identifiers cannot become owner authority;
- one subject cannot read another subject's protected rows.

The loopback workflow currently verifies only the database-level baseline subset. Broader serving-path authorization and privacy reconciliation remain separate closure gates.

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

The loopback workflow may record an isolated restore/validation duration and data-loss-window candidate. Those are diagnostic metrics, not a full achieved RTO, because privacy/deletion reconciliation is deliberately outside this workflow.

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
- [ ] isolated restore completed
- [ ] integrity verification passed
- [ ] authorization verification passed
- [ ] privacy/deletion/legal-retention reconciliation exercised
- [ ] achieved recovery duration measured
- [ ] achieved data-loss window measured
- [ ] RPO approved and compared with achieved evidence
- [ ] RTO approved and compared with achieved evidence

Until all closure gates are satisfied:

```text
DR Ready = FALSE / NOT EVIDENCED
```
