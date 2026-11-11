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

## 2026-11-11 — 로드맵 본문 복구 및 GEPA 실제 무네트워크 실행 CI 추가

- 이전 커밋의 ROADMAP.md 본문에 일시적 파일 읽기 오류 문구가 저장된 결함 확인; 승인된 v0.3 설계의 필수 구현 단계와 현재 작업 상태를 복원했다.
- 신규 GEPA API가 있는 공식 소스 커밋 `ce5b0d6e3d6af6c6dbec6de2c54536bbb961d309`을 GH Actions 격리 Python 환경에 고정 설치하고, 사람 평가나 유료 LLM 대신 합성 평가·가짜 반사 전략으로 `optimize_anything` 실행을 확인하는 경로를 추가했다.
- `OPENAI_API_KEY`/`OPENROUTER_API_KEY` 등 키를 비우고, Python 실행 중 socket 연결을 예외로 차단하며, 봉인 홀드아웃을 GEPA에 넘기지 않는다. 저장소 외부 출력 디렉터리만 허용한다.
- 주의: 이번 코드는 GH Actions 완료 후에만 실제 GEPA 새 API 호환성이 확인된다. OS 차원의 전체 격리·실 비용 게이트·문장 의미 품질 실험은 아직 미완료다.

## 2026-11-11 — first pinned GEPA CI failure and corrections

- Newly pinned source revision installed successfully. Its first smoke test was stopped locally by the expected max_evals<=10 guard because the test incorrectly requested 16. Test now uses 10, preserving the fail-closed contract.
- Governance workflow-map rejected the new pull-request workflow because it had not been registered in docs/ci/workflow-responsibility-map.json; added an explicit character-runtime-lab mapping.
- No external AI model or user messages were sent; real GEPA execution confirmation remains pending the next CI.

## 2026-11-11 — Pinned GEPA offline smoke ran; research bridge data isolation hardening

- Genuine GEPA pinned source commit ce5b0d6e3d6af6c6dbec6de2c54536bbb961d309 installed in GH Actions. In-process fake reflection and synthetic evaluation improved fabricated score from 0.2 to 0.8; 18 Python tests PASS. Evidence: https://github.com/gycha0109-beep/MyeongHa/actions/runs/42963466961 . This is **not a real quality gain** and external model calls remain 0.
- Enforce manifest hash, original candidate hash, immutable context hash, unique scenario families, separate dev/validation sets, cohort-appropriate character IDs, and shared-cohort per-character split coverage at the GEPA boundary. Add synthetic negative tests.
- Installed GEPA was derived from a pinned source commit whose project metadata still reports version 0.1.4; do not confuse it with published PyPI v0.1.4. Full OS file/network isolation and provider spend gateway remain unfinished.

## 2026-11-11 — OS-isolated synthetic optimizer/holdout and single-ledger dry-run gate

- Added a synthetic-only gateway admission path for student/reflection/judge/holdout that uses the real shared SQLite reservation ledger; rejects duplicate IDs, unapproved simulated models, supplier mismatch, uncertain cost and over-budget charges without HTTP calls. The module has deliberately **no real provider transport**, so this is not a live security gateway.
- The pinned GEPA workflow now runs two distinct Docker containers with `--network none`, read-only research-source mount and unprivileged user. The optimizer receives no sealed mount; the separate final evaluator gets only a generated synthetic holdout fixture. Both are forbidden from network egress and source writes at OS level.
- This proves the isolated synthetic harness, **not** that a future paid GEPA optimization + forwarding gateway is isolated; real approved network gateway, private datasets, token/price authorization and sealed final evaluation remain unimplemented.

## 2026-11-11 — Pinned GEPA in OS-denied-network runtime (new CI gate)

- Added a build-time-only container image installing official GEPA source SHA ce5b0d6e3d6af6c6dbec6de2c54536bbb961d309. No model credentials are provided.
- The new CI step runs the *real* pinned GEPA fake-reflector optimizer **inside** an unprivileged Docker container with `--network none`, read-only code mount and private temporary outputs. This closes the gap between separately proving Docker isolation and separately running real GEPA.
- Image base python:3.14-slim is currently tag-based, not a digest lock; pin its digest once a validated image digest is collected. A passing isolated smoke still cannot authorize live provider calls or prove user dialogue quality.

## 2026-11-11 — Single local socket gateway shared by Node and no-network optimizer client

- Added an explicitly synthetic-only Unix-domain socket service hosted outside the optimizer container, backed by the existing transactional SQLite ledger. It rejects malformed/oversized requests, unknown models, missing usage, duplicate attempts and over-budget admissions without exposing user text or any provider network client.
- New CI probes use a Node process and a Python client inside a `--network none` Docker container connecting to the same host service. A post-run ledger check verifies two distinct reservations and no external calls.
- This is **not** the live OpenRouter transport: owner approval verification, model token ceiling/price controls, real provider response accounting and dedicated production gateway deployment remain pending. No paid calls authorized.

## 2026-11-11 — 모의 토큰·요금·공급자·재시도 통제

- 기존 SQLite 장부와 Unix 소켓 서버를 재사용해 별도 통제형 합성 요청 경로를 구현했다. 요청의 역할·대상·모델·설정 해시·공급자 정책·요금표 버전, 입력/출력/추론 토큰을 검증하며, 과금 불명·초과·응답 모델/공급자 불일치는 예약을 보류한다.
- 동시 예약/재시도 횟수 제한과 실행 정책 해시를 SQLite 트랜잭션에 고정한다. 클라이언트의 approvalRef는 입력 스키마에서 거부하고, 모든 통제형 응답에 approval_state=synthetic_only, external_calls=0을 남긴다.
- 확인 범위: 관련 가짜 요청 테스트만. 실제 사용자 승인 확인 시스템, 유료 공급자 송신, 검증된 공식 가격표, 비용 전체 강제 게이트, 실제 비공개 연구 입력 격리는 앞으로의 필수 과제다.

## 2026-11-11 — R16 캐릭터 평가 소스 메타데이터

- 기존 Character Runtime Standard v1의 R16 항목을 읽기 전용으로 연결하는 모듈을 추가했다. Source SHA, R16 분류와 항목별 해시, 캐릭터 식별을 검증하며 원문 대사·평가 질문은 GEPA 전달 계약에서 제외한다.
- 실제 Runtime 문서가 확인된 여울·세연·라현(v0.2)·백헌에서 R16 분류 구조를 검사한다. 검토되지 않은 문서를 승인된 기준으로 올리지 않는다.
- 소스 없는 나머지 캐릭터에는 R16 질문을 임의 생성하지 않고 미완료로 남긴다. 유료 모델 호출·운영 변경 없음.
