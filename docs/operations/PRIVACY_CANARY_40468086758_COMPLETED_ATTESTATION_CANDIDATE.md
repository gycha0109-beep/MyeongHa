# Production privacy canary 40468086758 — completed deletion / missing proof artifact

**Track:** ops · **Classification:** Read-only Production incident recovery evidence, not DR release
**Baseline observed:** 2026-10-28 KST
**DR ready:** `false`

## Exact provenance

- Failed parent Production Privacy Recovery Canary: [40468086758](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40468086758), head `ed52c0cd442dfcf4396804275da2df74321f5799`. The **destructive execute step passed**, cleanup of ephemeral API login passed, but the ledger dispatch binding step failed on moving-`main` SHA and no public parent-canary evidence was uploaded.
- Successful pre-deletion governed backup: [40468157715](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40468157715), same original head SHA, artifact `12717562316`, backup frontier `20261027043527`, completion `2026-10-27T07:39:48Z`.
- Successful post-deletion canonical privacy ledger: [40468500587](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40468500587), head `711c8719a7e7ed2d42a333ec56463f008d2e1fc5`, artifact `12716914499`, capture `2026-10-27T07:40:33Z`.
- The ledger manifest binds the exact backup run and backup source SHA and reports **one** `ACCOUNT_DELETION_STARTED` event. The ledger's authority class is `AUTHORITATIVE_CAPTURED_WINDOW_V1`; `futureSafePrivacyReconciliation` and `drReady` remain false. This covers only the captured interval, not any later incident.
- The two existing artifact ZIPs had their enclosed encrypted archive SHA-256 digests independently recomputed against the public manifests. These are ciphertext integrity checks; no decryption or protected data read is claimed.
- Read-only Production SQL check: one synthetic account link for this exact parent run; Subject `deleted`, deletion job `completed`, start outbox `processed`, Auth foreign key detached, Commerce link `revoked`, profile absent. The test doesn't publish any Subject/Auth IDs or row payloads.

## Why **not** to choose `resume` or `fresh`

The legacy `resume` operation requires `deletion_pending` / `running` / pending-or-processing outbox state, but the original worker already completed deletion. Existing `resume` therefore cannot recover this case and should NOT be retried. A new `fresh` run would create and delete an unrelated user and is not evidence of the existing completed incident.

The existing isolated restore provenance resolver intentionally requires **a successful, protected canary run with one uploaded public evidence artifact**, in addition to the successful ledger and backup. The failed parent has none, so authoritative replay of this particular pair must remain **blocked**. A downloaded ledger manifest does not replace the missing canary proof.

## Prepared, unreleased path

- `scripts/attest-completed-production-privacy-canary.mjs` is a candidate, strictly pinned to the three run IDs. It verifies historical run/job provenance and live GitHub artifact listings (exact IDs, archive digest, original-parent artifact absence and unexpired P30D evidence), then validates only read-only terminal DB and Hosted Auth state. It never performs deletion.
- Verified GitHub artifact metadata on 2026-10-28 KST: backup artifact `12717562316` (digest `sha256:ba8035581d928091abe9b3f6e49f079368898a9782735cc70653946d4a182506`, expires 2026-11-26T07:39:49Z); ledger artifact `12716914499` (digest `sha256:e381ce4d061da400215987d7ccb4919a0712abf236ee871eb4b0fd8f009018c6`, expires 2026-11-26T07:40:35Z). Parent had zero uploaded artifacts. Expiry and metadata integrity are not actual restoration evidence.
- The existing `.github/workflows/production-privacy-recovery-canary.yml` now has a **branch-local, unmerged** `attest_completed` candidate. Its separate protected job is read-only and has `actions: read`; the existing destructive `fresh`/`resume` job explicitly skips it. This is **not yet an available option on Production `main`**.
- The new job requires the exact three run IDs `40468086758` / `40468157715` / `40468500587`, `watchtower_track=ops`, `worker_credential_action=verify_only`, the exact dedicated confirmation `ATTEST_COMPLETED_40468086758_READ_ONLY`, a manual `main` dispatch by the named operator, and the protected `production` environment.
- It checks GitHub execution and artifact provenance, reads the terminal Production state in a `BEGIN READ ONLY` transaction, validates the original encrypted artifact pair without decryption, then constructs a distinct identifier-free attestation artifact. It does **not** rerun the failed parent or upload a synthetic claim of historical success.
- `scripts/operations/verify-completed-privacy-canary-artifact-pair.py` validates only public manifest/archive integrity and excludes raw row payloads. It cannot establish completed canary execution by itself.

**Operational blocker:** The prior workflow-edit safety refusal was reattempted on the same authorized Windows worktree without switching tools or credentials; this time the source edit succeeded. The job is still a **reviewed-code candidate, not an executed or approved Production proof**. Deploy to `main`, a successful explicit protected read-only dispatch, a correct uploaded artifact, and an exact evidence-linked isolated restore remain outstanding. Do not run either `fresh` or `resume` for this completed case.

After that protected proof exists, the established `postgres-isolated-restore-drill.yml` manual workflow can use the exact backup/ledger/new-successful-proof IDs and a reference UTC within the captured ledger window. Only a real successful isolated replay and verified evidence may advance *bounded* authoritative reconciliation; full hosted Auth/Storage provider recovery remains a separate unproven requirement.

**Non-claims:** no new `fresh` canary, no Production mutation, no provider-managed full restore, no raw decrypted ledger, no published user identifiers, `futureSafePrivacyReconciliation=false`, `dr_ready=false`.
