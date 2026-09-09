# MyeongHa PostgreSQL Backup / Restore Runbook v1

> Scope: non-character production operations only  
> Issue: `#389` — authoritative persistent-data recovery  
> Evidence date: 2026-09-09 KST  
> Production state: IMPLEMENTED / NOT YET PRODUCTION-PROVEN

## 1. Current production authority

Fresh control-plane evidence at the time this runbook was introduced:

- Supabase project ref: `cnsfpcdiyofqvhpcegfc`
- Project state: `ACTIVE_HEALTHY`
- Region: `ap-southeast-1`
- PostgreSQL: `17.6.1.166` / engine 17
- Current Supabase organization plan: `free`

Current Supabase backup documentation states that automatic daily backups are provided to Pro, Team, and Enterprise projects and recommends regular `supabase db dump` exports plus off-site retention for Free projects.

Therefore this repository does **not** treat provider health, an assumed dashboard backup, or an undocumented platform snapshot as recovery evidence.

Current operating classification:

```text
provider automatic daily backup = NOT RELIED UPON ON CURRENT FREE PLAN
provider retention              = NOT RELIED UPON ON CURRENT FREE PLAN
PITR                            = NOT AVAILABLE UNDER THE CURRENT FREE-PLAN OPERATING BASELINE
application-owned logical dump  = IMPLEMENTED BY REPOSITORY WORKFLOW
successful production dump      = NOT YET EVIDENCED
isolated restore drill path     = IMPLEMENTED / NOT YET EXECUTED
isolated restore                = NOT YET EVIDENCED
RPO                             = OPEN DECISION
RTO                             = OPEN DECISION
```

Restore drill: NOT YET EVIDENCED

## 2. Backup contract

Workflow:

```text
.github/workflows/production-postgres-backup.yml
```

Triggers:

- scheduled daily at `18:17 UTC` (`03:17 KST`)
- explicit `workflow_dispatch`

The schedule is a backup frequency, **not an approved RPO**.

The workflow:

1. resolves the exact production PRIMARY session-pooler endpoint from the Supabase Management API;
2. uses the production database administrator credential only inside the protected GitHub `production` environment;
3. runs a pinned stable Supabase CLI version;
4. exports `roles.sql`, `schema.sql`, and `data.sql` using Supabase-supported dump commands;
5. records SHA-256 checksums of plaintext dump files inside the protected archive;
6. creates a manifest containing project ref, exact repository SHA, CLI version, and UTC timestamps;
7. encrypts the archive before upload using AES-256-CBC + PBKDF2;
8. deletes the plaintext archive before artifact publication;
9. uploads only the encrypted archive, its encrypted checksum, and a non-sensitive manifest;
10. retains the GitHub Actions artifact for 30 days.

The GitHub artifact is **off-Supabase** and therefore protects against a Supabase-only failure. It is not treated as a fully independent administrative/security domain from the source repository. A separate object-storage/account boundary may be required later if repository-account compromise or deletion is within the approved disaster model.

## 3. Required credentials

Existing production recovery inputs:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_DB_PASSWORD
```

New backup-only secret:

```text
MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE
```

Rules:

- minimum 32 characters;
- store only as a protected GitHub production environment secret;
- do not reuse the database password;
- do not place it in repository files, issue comments, logs, artifacts, or Vercel client/runtime configuration;
- recovery operators must have a documented break-glass path to the passphrase that does not depend on the database being healthy.

Until this secret exists and an actual scheduled/manual run succeeds, `#389` cannot claim a verified backup schedule.

## 4. Backup success evidence

A backup point is admissible for a drill only when all of the following are available from one workflow run:

```text
workflow run ID
exact GITHUB_SHA
UTC started/completed timestamps
encrypted artifact name
encrypted artifact SHA-256
manifest project_ref == cnsfpcdiyofqvhpcegfc
workflow conclusion == success
```

A repository workflow definition without such a successful run is implementation evidence, not backup evidence.

Backup failure observability for v1 is the scheduled GitHub Actions workflow conclusion. A failed or missing scheduled run must be treated as a production operations alert until a dedicated alerting sink is approved.

## 5. Restore target rule

For a recovery drill, never restore directly over the serving production project.

Use an isolated target that is explicitly designated for recovery testing. Preferred order:

1. isolated Supabase recovery project with compatible PostgreSQL/Supabase capabilities; or
2. an explicitly approved isolated Supabase-compatible/self-hosted target when the purpose is portability validation.

Creating a paid project/branch or other billable resource requires the normal cost approval flow before creation.

Before restore, record:

```text
drill_id
source backup workflow run ID
source backup UTC point
source exact SHA
target project/database identifier
target PostgreSQL version
restore operator
restore_start_utc
```

### 5.1 Repository-isolated restore drill workflow

The repository now provides an executable, **manual-only** restore portability path:

```text
.github/workflows/postgres-isolated-restore-drill.yml
```

Its target is **GitHub Actions loopback PostgreSQL 17.6**. The workflow does not accept a remote restore database URL. The restore harness hardcodes only:

```text
postgresql://postgres:restore-drill@127.0.0.1:5432/postgres
```

The workflow requires:

- a numeric successful backup workflow run ID;
- a canonical synthetic incident/reference UTC timestamp;
- the protected backup passphrase from the `production` environment.

Before any decryption, it verifies that the selected source run is exactly the repository's successful `Production PostgreSQL Logical Backup` workflow on `main`, and that exactly one non-expired governed backup artifact exists. It then downloads that exact artifact, verifies ciphertext and plaintext checksums plus both manifests, restores only into the loopback PostgreSQL service container, runs baseline structural/authorization checks, and uploads only a JSON evidence artifact.

Decrypted SQL/data files are not uploaded.

This workflow is **implementation and future drill machinery only** until it is run against an actual successful production backup artifact. A successful loopback restore may evidence restore portability, basic structure, and baseline role safety; it does not by itself establish that a recovered state is safe to serve. In particular, privacy reconciliation is not exercised by the workflow, and full RTO remains open until the post-backup deletion/revocation reconciliation procedure is exercised and verified.

## 6. Download, verify, and decrypt

After downloading the chosen artifact to the controlled recovery environment:

```bash
sha256sum -c myeongha-postgres-*.tar.gz.enc.sha256

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in myeongha-postgres-*.tar.gz.enc \
  -out myeongha-postgres-restore.tar.gz \
  -pass env:MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE

tar -xzf myeongha-postgres-restore.tar.gz
sha256sum -c plaintext-sha256.txt
```

Stop immediately on any checksum/decryption mismatch.

Do not upload decrypted dump files back into GitHub Actions artifacts.

## 7. Isolated restore procedure

Follow the current Supabase backup/restore guidance for the target environment. For the logical archive produced by this workflow, the baseline restore shape is:

```bash
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file roles.sql \
  --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "$RESTORE_DATABASE_URL"
```

Before executing:

- enable required non-default extensions on the isolated target;
- confirm target version compatibility;
- ensure the target contains no production-serving traffic;
- review any Supabase-managed schema/version differences called out by current Supabase guidance.

After restore:

- reset passwords for any restored custom LOGIN roles as required by Supabase guidance;
- recreate provider-level settings that are outside the logical database dump only when needed for the drill;
- do not copy production provider secrets into the isolated drill unless an explicit test requires them.

## 8. Integrity verification

The drill is not successful when `psql` merely exits zero.

At minimum verify:

1. expected application schemas/tables/functions exist;
2. migrations/authority functions required by the current production SHA are present;
3. representative critical row counts are internally consistent;
4. foreign-key / ownership relationships used by current product authority remain valid;
5. no unexpected orphan ownership rows are introduced;
6. restored data can be read through the same governed database authority path used by the application;
7. authentication/account data required by the chosen restore target is verified explicitly rather than assumed from the dump format.

Record exact queries and summarized counts in the drill evidence. Do not publish user-owned row contents in GitHub logs or issue comments.

## 9. Authorization verification

Before a restored state is considered usable, run negative and positive authorization checks against the isolated target:

- arbitrary client-supplied subject identifiers cannot become owner authority;
- one subject cannot read another subject's protected rows;
- the production API execution role model remains non-superuser and non-BYPASSRLS where applicable;
- current owner resolution and relevant command/query authorities still fail closed;
- any temporary recovery credential is removed after the drill.

A data restore without authorization verification does not satisfy `#389`.

## 10. Privacy / deletion reconciliation before any recovered state can serve

A historical backup can contain data that was deleted or access that was revoked after the backup point. Therefore a restored state must never be promoted to serving production immediately after database restore.

Recovery reconciliation must account for the authoritative deletion/access history that is newer than the backup point, including the applicable current implementation of:

```text
data_deletion_jobs / deletion tombstones or successor authority
revoked share artifacts
revoked memory / record access grants
device installation and notification revocation state
account lifecycle / merged/deleted subject state
commerce records that must be retained only under their governing legal/product policy
```

Procedure:

1. establish the backup cutoff timestamp;
2. establish the authoritative post-cutoff deletion/revocation ledger available outside or after the recovered snapshot;
3. replay or reconcile those deletions/revocations against the isolated restored state;
4. verify affected records/access are absent or disabled;
5. separately verify legally retained commerce records are retained only as permitted;
6. only after reconciliation may a recovered state be considered for serving traffic.

If no independent post-cutoff deletion/revocation evidence exists, record that as a blocking recovery gap rather than silently serving the historical state.

## 11. RPO / RTO evidence

Architecture does not derive business objectives from whichever provider feature happens to exist.

Current decision state:

```text
RPO: OPEN DECISION
RTO: OPEN DECISION
```

The daily workflow provides a nominal maximum interval between successful scheduled backup attempts of 24 hours, but this is **not** an approved RPO and does not account for a failed run.

Each drill must record:

```text
incident/reference time (synthetic for drill)
selected backup completed_at_utc
restore_start_utc
restore_database_complete_utc
privacy_reconciliation_complete_utc
authorization_verification_complete_utc
drill_complete_utc
achieved recovery duration
achieved data-loss window
```

Definitions for evidence reporting:

```text
achieved recovery duration
= drill_complete_utc - restore_start_utc

achieved data-loss window
= incident/reference time - selected backup completed_at_utc
```

The loopback restore workflow records an isolated restore/validation duration and a synthetic data-loss-window candidate. Those are diagnostic drill metrics, not a full achieved RTO, because privacy/deletion reconciliation is deliberately not automated in that workflow.

Only after business-approved RPO/RTO values are recorded may the measured values be labeled PASS/FAIL against those objectives.

## 12. #389 closure gate

Do not close `#389` until all are evidenced:

- [ ] backup encryption secret provisioned through the production control plane
- [ ] at least one actual production logical backup run succeeded
- [ ] actual backup schedule and 30-day artifact retention evidenced from runtime
- [ ] current provider plan / automatic backup / PITR state recorded
- [ ] backup failure observability verified
- [ ] exact backup point selected for a drill
- [ ] isolated restore completed
- [ ] integrity verification passed
- [ ] authorization verification passed
- [ ] privacy/deletion/legal-retention reconciliation exercised
- [ ] achieved recovery duration measured
- [ ] achieved data-loss window measured
- [ ] RPO approved and compared with achieved evidence
- [ ] RTO approved and compared with achieved evidence

Until then:

```text
DR Ready = FALSE / NOT EVIDENCED
```
