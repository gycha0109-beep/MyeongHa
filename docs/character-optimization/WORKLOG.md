# Character GEPA Offline Optimization Worklog

## 2026-11-11 — first implementation, local evidence

- Design source: user-approved start from Character GEPA architecture v0.3; code work permitted, paid experimentation and runtime/content changes not authorized.
- Added shared, research-only ESM profile/run/candidate/corpus contracts under `scripts/character-optimization/`. The implementation intentionally avoids adding a new npm workspace until its package-lock and integration requirements are verified.
- Added evaluation metadata schema, hard-gate veto and per-character no-regression check; never infer quality improvement from preflight scores or assume user approval.
- Added Python GEPA-new-API contract probe and strict preflight (no network, no real engine execution). Local environment lacks the `gepa` package, so actual GEPA import compatibility remains unverified. PyPI publicly lists `gepa` v0.1.4; package is not installed/pinned here.
- Added single-host SQLite WAL research budget ledger with transactional per-request reservation, role caps and conservative unresolved-charge hold. This is **not** yet wired as mandatory OS-level outbound gateway; outbound calls remain disabled.
- Local tests: `node --test scripts/character-optimization/contracts-v1.test.mjs` — 17 pass; `PYTHONPATH=research/character-optimization-gepa python -m unittest -v test_offline` — 10 pass. Synthetic fixtures only; no old paid 288 execution repeated.
- Non-goals: no canonical character changes; no 30-entry review approval; no production model/router changes; no new DB tables; no secret/user transcripts committed.

## Blockers

- Actual GEPA package installation and compatible `optimize_anything` interface verification pending; cannot report GEPA optimization as running.
- Before external calls: new owner-approved model/budget/stop-rule packet, complete outbound gateway/isolated mounts, independently reviewed candidate materials. 

## 2026-11-11 — historical Yeoul bridge extension

- Implemented strict private-input historical bridge for original 288 development rows: validates complete 4×3×12×2 matrix and matching user labels, emits DeepSeek-only aggregate failure categories without raw replies/notes, never auto-approves review entries.
- Locally reconstructed previous private text extraction of the historical JSON (not raw-byte authenticated), checked 288 total / 94 historical good / 72 DeepSeek / 36 DeepSeek good. No external calls, no response re-generation; no private source committed.
- New synthetic source-leak/authority/matrix validation tests, bringing Node synthetic total to 17 PASS.
- Remaining: consolidate the historic bridge with the pending Yeoul PR after independent integration and verify the original-file content hash when backing source is available.

## 2026-11-11 — SQLite concurrency repair

- Concurrent process/threads opening the first SQLite WAL file could conflict when setting journal mode. Reworked connection handling with bounded lock retry and explicit close. Eight independent rounds of 10 offline Python tests passed after the fix. No paid call or real provider gateway execution was involved.

## 2026-11-11 — new GEPA API call builder (no invocation)

- Added `research/character-optimization-gepa/gepa_api_contract.py`, a fail-closed builder for the documented new `optimize_anything` arguments (`seed_candidate`, separate development/validation data, explicitly supplied evaluator/reflection callable, `OptimizeAnythingConfig`-shaped factory, `test_set=None`, private output location).
- Refuses missing reflection callable, secret or unreviewed fields in evaluation feedback, wrong candidate hash, inappropriate mutable slot and holdout exposure. No GEPA function is called and no model/provider is contacted by this adapter.
- Added six Python mock-contract checks. This only verifies the expected argument shape using a fake configuration class; the genuine GEPA v0.1.4 installation, Python compatibility, OS sandbox, and actual optimization behavior are still unverified.

## 2026-11-11 — upstream GEPA release/API incompatibility

- Source inspection: PyPI gepa==0.1.4 (legacy GEPAConfig) does not expose the OptimizeAnythingConfig/test_set shape in the v0.3 architecture. Upstream main revision ce5b0d6e3d6af6c6dbec6de2c54536bbb961d309 has the new config source but no install/runtime verification in MyeongHa yet.
- No unverified dependency pin or paid optimizer invocation. See GEPA_SOURCE_COMPATIBILITY.md. Exact commit install, private offline evaluation and gateway checks remain future work.

## 2026-11-11 — Correct GEPA argument contract and private output symlink check

- Remove synthetic-only `_contract_status` from the kwargs destined for `optimize_anything(**kwargs)`; this was an invalid keyword in the pinned upstream new API. The preflight remains a separate call.
- Reject symlinked private output directories before `Path.resolve()` so the check is not bypassed by path normalization. Add independent synthetic tests.
- Local checks: Node 17/17 and Python 17/17 pass. Installed GEPA runtime remains unverified, remote model calls 0.
