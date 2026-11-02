# Production privacy canary 40468086758 — completed deletion / separately recovered read-only proof

**Track:** ops · **Classification:** Read-only Production incident recovery evidence, not DR release
**Baseline observed:** 2026-10-28 KST
**DR ready:** `false`

## 2026-10-28 — actual successful isolated restore / bounded authoritative replay

The protected [PostgreSQL 17 restore workflow #40655447574](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40655447574) **completed SUCCESS** on `main` SHA `39fc280b393d15e39c47fa24596573eacd697f47`. It used the previously captured `40468157715` backup (migration `20261027043527`), `40468500587` authoritative privacy ledger (one event), and `40633679630` successful read-only attestation of the failed parent `40468086758`, with incident reference `2026-10-27T07:40:33Z`.

Verified evidence artifact `12801666793` (`postgres-isolated-restore-drill-40655447574`) includes `restore-evidence.json`, `privacy-reconciliation-evidence.json` and `authoritative-privacy-reconciliation-evidence.json`. ZIP SHA-256 `59ea25bf3d29b7a06e9f26bd1616c41c10f651ee11da56a0d7342717b6b5ab6d`, expires `2026-11-27T08:16:04Z`. Restored application integrity/role ownership/ACL, Auth user-ID links, one-event governed privacy replay, repeated replay and completion idempotency, non-resurrection and Commerce P5Y retention passed.

**Strict limits:** `authoritative_source_scope=captured-window-only`; `future_safe_privacy_reconciliation=false`, `provider_managed_data_full_restore=false` (3 projected / 27 skipped provider-managed COPY blocks), `dr_ready=false`. Neither Hosted Auth session/token/login functionality nor Storage file bytes were restored end-to-end. Latest read-only live Production migration `20261028011357` is ahead of backup `20261027043527`. The failed parent `40468086758` and failed initial restore `40645496534` remain FAILURE. **Never rerun `fresh` or `resume` for this completed case.**

The older *pending isolated restore* instructions and failure investigations below are historical execution records, not the current operational state.

## Exact provenance

- Failed parent Production Privacy Recovery Canary: [40468086758](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40468086758), head `ed52c0cd442dfcf4396804275da2df74321f5799`. The **destructive execute step passed**, cleanup of ephemeral API login passed, but the ledger dispatch binding step failed on moving-`main` SHA and no public parent-canary evidence was uploaded.
- Successful pre-deletion governed backup: [40468157715](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40468157715), same original head SHA, artifact `12717562316`, backup frontier `20261027043527`, completion `2026-10-27T07:39:48Z`.
- Successful post-deletion canonical privacy ledger: [40468500587](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40468500587), head `711c8719a7e7ed2d42a333ec56463f008d2e1fc5`, artifact `12716914499`, capture `2026-10-27T07:40:33Z`.
- The ledger manifest binds the exact backup run and backup source SHA and reports **one** `ACCOUNT_DELETION_STARTED` event. The ledger's authority class is `AUTHORITATIVE_CAPTURED_WINDOW_V1`; `futureSafePrivacyReconciliation` and `drReady` remain false. This covers only the captured interval, not any later incident.
- The two existing artifact ZIPs had their enclosed encrypted archive SHA-256 digests independently recomputed against the public manifests. These are ciphertext integrity checks; no decryption or protected data read is claimed.
- Read-only Production SQL check: one synthetic account link for this exact parent run; Subject `deleted`, deletion job `completed`, start outbox `processed`, Auth foreign key detached, Commerce link `revoked`, profile absent. The test doesn't publish any Subject/Auth IDs or row payloads.

## Why **not** to choose `resume` or `fresh`

The legacy `resume` operation requires `deletion_pending` / `running` / pending-or-processing outbox state, but the original worker already completed deletion. Existing `resume` therefore cannot recover this case and should NOT be retried. A new `fresh` run would create and delete an unrelated user and is not evidence of the existing completed incident.

The existing isolated restore provenance resolver requires **a successful, protected canary run with one uploaded public evidence artifact** in addition to the exact successful ledger and backup. The original failed parent has none and remains ineligible. A **separate protected read-only attestation** was successful on 2026-10-28 (run `40633679630`, artifact `12792696575`); the resolver must use that new run ID and verify its artifact. The original failed run must never be relabeled as successful.

## Prepared evidence path and verified protected outcome

- `scripts/attest-completed-production-privacy-canary.mjs` is a candidate, strictly pinned to the three run IDs. It verifies historical run/job provenance and live GitHub artifact listings (exact IDs, archive digest, original-parent artifact absence and unexpired P30D evidence), then validates only read-only terminal DB and Hosted Auth state. It never performs deletion.
- Verified GitHub artifact metadata on 2026-10-28 KST: backup artifact `12717562316` (digest `sha256:ba8035581d928091abe9b3f6e49f079368898a9782735cc70653946d4a182506`, expires 2026-11-26T07:39:49Z); ledger artifact `12716914499` (digest `sha256:e381ce4d061da400215987d7ccb4919a0712abf236ee871eb4b0fd8f009018c6`, expires 2026-11-26T07:40:35Z). Parent had zero uploaded artifacts. Expiry and metadata integrity are not actual restoration evidence.
- `.github/workflows/production-privacy-recovery-canary.yml` now exposes `attest_completed` on `main` (PR #2674, merged as `51ec18f4faeb05f5a4cc034a35273776c0a54ba6`). The separate protected job has `actions: read`; the existing destructive `fresh`/`resume` job explicitly skips it.
- The new job requires the exact three run IDs `40468086758` / `40468157715` / `40468500587`, `watchtower_track=ops`, `worker_credential_action=verify_only`, the exact dedicated confirmation `ATTEST_COMPLETED_40468086758_READ_ONLY`, a manual `main` dispatch by the named operator, and the protected `production` environment.
- It checks GitHub execution and artifact provenance, reads the terminal Production state in a `BEGIN READ ONLY` transaction, validates the original encrypted artifact pair without decryption, then constructs a distinct identifier-free attestation artifact. It does **not** rerun the failed parent or upload a synthetic claim of historical success.
- `scripts/operations/verify-completed-privacy-canary-artifact-pair.py` validates only public manifest/archive integrity and excludes raw row payloads. It cannot establish completed canary execution by itself.

**Historical pre-restore boundary (superseded by successful run `40655447574`):** Protected read-only completion proof **succeeded and uploaded its evidence** (run `40633679630`). At that earlier stage the **isolated PostgreSQL 17 restore/replay had not run**, and full hosted Auth/Storage equivalence remains unproven. Never rerun `fresh` or `resume` for this completed case.

The protected proof now exists. The established `postgres-isolated-restore-drill.yml` manual workflow can use exact backup `40468157715`, ledger `40468500587`, successful proof `40633679630`, and the captured incident time `2026-10-27T07:40:33Z`. The new `scripts/operations/assert-privacy-replay-canary-evidence.mjs` restore gate explicitly distinguishes this read-only attestation from a fresh/resumed deletion. It accepts a historical completed-case proof only with the original failed run bound as `resumedFromCanaryRunId=40468086758`, the exact backup and ledger IDs, a **different** successful proof workflow run, `hostedAuthDeletionInvoked=false` in the new execution and the explicit `already_absent_verified` observation. Existing fresh/resume replay support remains unchanged. The already successful protected workflow authority and public artifact requirements are not bypassed. Only a real successful isolated replay and verified evidence may advance *bounded* authoritative reconciliation; full hosted Auth/Storage provider recovery remains a separate unproven requirement.

## Historical completed read-only execution inputs / formerly pending isolated restore

The protected `Production Privacy Recovery Canary` manual dispatch **already succeeded** on 2026-10-28 as run `40633679630`; the successful input scope was:
- `operation = attest_completed`
- `confirmation = ATTEST_COMPLETED_40468086758_READ_ONLY`
- `watchtower_track = ops`
- `resume_canary_run_id = 40468086758`
- `resume_backup_run_id = 40468157715`
- `attest_ledger_run_id = 40468500587`
- `worker_credential_action = verify_only`
- `worker_credential_confirmation` left empty.

This **did not** execute a new deletion, rerun the old canary, or sync credentials. GitHub execution metadata and downloaded proof ZIP were checked: the read-only job completed successfully, the destructive job was skipped, the proof artifact is identifier-free, and the original failed parent remains failed. A green PR CI alone would not establish any of these.

Then and only then run the existing manual `PostgreSQL Isolated Restore Drill` with:
- `backup_run_id = 40468157715`
- `privacy_ledger_run_id = 40468500587`
- `production_privacy_canary_run_id = 40633679630`
- `incident_reference_utc = 2026-10-27T07:40:33Z` (actual ledger capture; the recovered manifest must agree exactly)
- `watchtower_track = ops`, `seyeon_security_s0_rehearsal = false`.

Require actual completed SUCCESS and inspect the identifier-free restore/reconciliation evidence. Never infer hosted provider Auth/Storage equivalence or flip `dr_ready` from a loopback restore alone.

## Verified protected evidence publication (2026-10-28)

- Protected workflow run: [40633679630](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40633679630); completed `success`, `workflow_dispatch` on `main`, commit `53d9389cc61b0c73af1071a07e94aebfbb685975`, first attempt, operator `gycha0109-beep`.
- Read-only job `historical-completed-canary-read-only-attestation`: **success**, including terminal database state, encrypted artifact pair checksum, identifier-free proof assembly and upload. Legacy destructive `production-privacy-recovery-canary` job: **skipped**.
- Only uploaded artifact: `production-privacy-recovery-canary-40633679630`, artifact ID **12792696575**, archive SHA-256 **8685cbce68726c68c08dd5124beda2f4f2773b6c031aa3d08cb9a8e6723da4e3**, expires `2026-11-27T04:41:31Z`.
- Downloaded ZIP checked independently: exactly one `production-privacy-canary-public-evidence.json`, with `canaryOperation=attest_completed`, `resumedFromCanaryRunId=40468086758`, `governedBackupRunId=40468157715`, `privacyRecoveryLedgerRunId=40468500587`, `privacyRecoveryLedgerEventCount=1`, `accountDeletionStartedEventCount=1`, `hostedAuthDeletionInvoked=false`, `authoritativePrivacyReconciliation=false`, `futureSafePrivacyReconciliation=false`, `drReady=false`.
- Evidence is **historical completion + encrypted artifact provenance only**, not actual restore, post-restore nonresurrection, provider Auth/Storage equivalence, or global DR readiness.


## Failed isolated restore attempt #40645496534 (2026-10-28)

- [Protected restore drill #40645496534](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40645496534) completed **failure** on `main` (head `53d9389cc61b0c73af1071a07e94aebfbb685975`). The source backup authorization and download/checksum passed.
- First failing step: `Resolve authoritative Production privacy replay provenance` (job `122673245000`). No ledger replay, restored-state validation, or successful restore evidence occurred; no restore artifact was uploaded.
- Root cause verified against actual GitHub workflow-run API metadata: ledger #40468500587 has `name="[WT:ops] Production PostgreSQL Privacy Recovery Ledger"` and read-only completion proof #40633679630 has `name="[WT:ops] Production Privacy Recovery Canary"`; the pre-existing resolver demanded the same two names **without** the `[WT:ops]` run-name prefix. All other assertions were not reached.
- Fixed on the existing ops branch in `scripts/operations/resolve-postgres-authoritative-privacy-replay-source.sh` by requiring the **exact returned ops run names**, while retaining the precise workflow path, successful conclusion, authorized event/branch/repository and unexpired single-artifact conditions. Added focused positive/negative regression checks for both names and wrong metadata.
- **Only after review, CI and main integration** retry `PostgreSQL Isolated Restore Drill` as a **new workflow dispatch** using backup `40468157715`, ledger `40468500587`, successful read-only proof `40633679630`, incident reference `2026-10-27T07:40:33Z`, `watchtower_track=ops`, and S0 rehearsal disabled. Do not re-run the failed attempt by using `rerun` on its earlier SHA, do not dispatch `fresh` or `resume`, and do not regenerate the completed deletion.
- `authoritativePrivacyReconciliation`, `provider_managed_data_full_restore`, `futureSafePrivacyReconciliation` and `dr_ready` remain unproven/false for real restored state.

## Auth / Storage provider recovery boundary (2026-10-28 read-only inventory)

A separate read-only Production PostgreSQL query observed PostgreSQL 17.6, **4** current Hosted Auth user rows, **28** current Auth session rows, **0** Storage buckets, and **0** Storage object metadata rows. The query returned counts only and performed no writes. This is the live inventory at one instant, **not** the 2026-10-27 backup-time snapshot, identity-credential recovery, or proof of physical object recovery.

Hosted Auth application identity continuity on a loopback PostgreSQL restore and the present count-only snapshot do not establish usable hosted Auth recovery (configuration, credentials, session behavior, or token correctness). An empty current Storage metadata count does not prove that the historical backup had no objects, nor that a provider-restored service would recover files. The existing `provider_managed_data_full_restore=false` and `dr_ready=false` remain mandatory.

The now-merged workflow builds the publicly uploaded proof through `scripts/operations/build-completed-privacy-canary-proof.mjs`, replacing an inline JSON expression. It explicitly allowlists non-sensitive fields, rejects unexpected/private keys and incorrect incident or ciphertext-report links, writes evidence without overwriting an existing file, and cross-checks the output against the isolated replay evidence consumer. The workflow subsequently passed actual protected execution #40633679630; this still does **not** establish isolated restore success or provider Auth/Storage recovery.

**Non-claims:** no new `fresh` canary, no Production mutation, no provider-managed full restore, no raw decrypted ledger, no published user identifiers, `futureSafePrivacyReconciliation=false`, `dr_ready=false`.
