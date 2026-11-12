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

- R16 초기 CI(42970122081)에서 백헌 Runtime의 번호 목록을 읽지 못해 실패. 문서 원본은 수정하지 않고 글머리표·번호 목록 두 형식을 허용하는 파서로 보정, 해당 형식 회귀 테스트 추가. 합성 실행·운영 상태와 무관한 소스 파싱 오류였다.

## 2026-11-11 — 승인 범위 검사 및 신규 여울 시나리오 가족 (오프라인)

- Approval scope inspection에서 역할별 호출 권한, 실행/데이터/모델/공급자 범위, 정책 해시, 승인 기간과 비용/횟수 상한을 검사한다. 형식이 맞는 주장도 발행 주체가 검증되지 않았으므로 paid_transport_authorized=false를 유지한다. 승인 정보 발행·저장 시스템과 실제 유료 송신은 만들지 않았다.
- 신규 합성 질문은 개발 4가족과 최적화 검증 4가족으로 분리하며 출처·시나리오별 해시와 검토 미완료 상태만 공통 평가에 제공한다. 비공개 기존 Y01~Y12와 의미 비교 및 사용자 검토 전에는 후보를 GEPA 입력으로 승격하지 않는다.
- 기존 합성 회귀 테스트에 승인 위조, 범위 불일치, 가격/호출 횟수 초과, 실행 승인 부재, 시나리오 중복·격리 검사를 추가한다. 실제 DeepSeek/OpenRouter/교사/심사 호출 0회, 운영 변경 없음.

## 2026-11-11 — 청구 불명 시 같은 실행 전체 중단

- 보류 상태('held')가 있어도 남은 예산으로 다음 요청을 예약할 수 있던 기존 경계를 확인하고, 기본 SQLite 장부와 정밀 모의 요청 장부 양쪽에서 보류 건 존재 시 동일 실행의 신규 요청을 원자적으로 거부하도록 고쳤다.
- 프로세스 재시작 후에도 보류 상태와 차단 상태가 유지되며, 이미 보류된 예산을 0으로 간주하거나 자동 해제하지 않는다. 기존 정상 병렬 예약은 유지한다.
- 종료된 요청의 실제 정산과 재시도 가능 조건은 외부 공급자 영수증을 검증하는 경로가 생기기 전까지 확대하지 않는다.

## 2026-11-11 — PR #3208 전체 통합 CI의 Node 테스트 실행기 충돌 수정

- 전체 통합 검사 [42973301443](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42973301443)에서 `npm test`의 Vitest 4.1.11이 `scripts/character-optimization/*.test.mjs` 네 파일을 수집했지만, 파일이 `node:test` 기반이어서 `No test suite found`로 실패한 것이 원인임을 로그로 확인했다. Vitest의 다른 9,082개 테스트는 통과했다.
- `vitest.config.ts`에서 해당 경로만 Vitest 수집에서 제외하고, 루트 `npm test`에 Node 자체 테스트 실행을 별도 연결한다. GEPA 격리 워크플로도 같은 네 파일을 Node로 실행하도록 맞춘다. 테스트를 무시하거나 삭제하는 조치가 아니라 실행기를 구분한 것이다.
- 기존 GitHub 보호 규칙이나 운영 환경·캐릭터 모델·GEPA 유료 호출은 변경하지 않았다. 후속 전체 통합 CI의 실제 재검증 결과로만 성공을 판정한다.

## 2026-11-11 — 정책 생성 후 요금표·라우팅·한도 변조 차단

- PR #3208 병합 뒤 후속 오프라인 작업. `DryRunPolicy`는 dataclass 필드 재할당만 막아 내부 dict/list가 mutable이었으므로, 정책 생성 시 원본 참조를 복사하고 `MappingProxyType` 및 불변 공급자 튜플로 고정한다.
- 기존 정책 해시의 JSON 직렬화 결과는 그대로 유지한다. 입력 원본 수정, 생성된 객체 내부 수정, 가격 인용, SQLite 사전예약의 음성 회귀 테스트를 추가한다.
- 실제 모델 가격표·사용자 예산 승인 권한·유료 제공자 송신·운영 변경은 범위 외이며 계속 차단한다.


## 2026-11-11 — 여울 파일럿 평가 자료·모델·비용 사전 등록

- 오프라인에서 기존 Y01~Y12와 신규 8가족 간 문장 유사도 의심 표시를 할 수 있는 비공개 입력 함수와, 4역할(학생·반사·심사·최종 평가)별 공급자·모델·토큰·재시도·비용 상한의 최악 비용 계산기를 추가했다.
- 기존 288건은 개발 근거, 여울 규칙 6건·대사 24건은 승인 0건의 검토 후보, 신규 개발 4/검증 4는 의미 중복 확인 전 후보로 둔다. 공개 H01~H10의 80상황·104턴 설계는 새로운 봉인 최종 평가로 인정하지 않는다.
- 가격표는 공급자별 변동 가능하므로 공개 웹페이지 가격을 승인 요금으로 자동 고정하지 않는다. 공식 학생 모델 ID만 후보로 기록하며 반사·심사 모델, 하위 공급자, 가격 원장 및 USD 예산은 아직 미확정이다.
- 소스·단가가 전부 입력되더라도 이 계산기 자체는 비권한적이며 **유료 API 0회**, 사용자 예산 승인·신뢰 가능한 네트워크 게이트·사람 검토·비공개 평가 근거 미충족 시 실행 HOLD를 유지한다.
- 상세 계약: docs/character-optimization/YEOUL_PILOT_READINESS_V1.md. 별도 여울 연구 PR #3187은 건드리지 않았다.

## 2026-11-11 — 비공개 288건 평가 원본의 안전한 검증 실행기

- user Library 정제본은 앞선 세션의 텍스트 조회로 Y01~Y12 12개 질문/288개 행과 신규 8가족의 문자 유사도 **임계값 초과 0건**을 확인했으나, 원본 raw-byte 복사는 허용되지 않아 파일 해시의 독립 대조·실제 로컬 CLI 실행은 하지 못했다.
- `yeoul-private-source-intake-v1.mjs`: 연구자가 별도 개인 폴더에 둔 실제 원본을 받으면 정확한 288행/12질문/4모델×3조건×2반복을 검증하고 사용자 평가·의견을 덮어쓰지 않은 채 신규 8가족과 겹칠 가능성을 일시적으로 검사한다.
- 유일한 출력은 저장소 밖 권한 0700 폴더의 0600 메타데이터 JSON. 비공개 대화·평점 메모·원질문을 내보내지 않으며 실제 바이트 SHA는 개인 보고서 안에서만 기록한다. 원본의 외부 진위 증명은 별도 필요하고, 0건 중복이 의미적 독립성 판정은 아니다.
- `yeoul-private-source-intake-v1.test.mjs`의 가상 288행·변조·중복·자동 변별력·비공개 출력·재실행 차단·심볼릭 링크 차단 테스트를 GitHub CI에 연결한다. 실제 유료 모델 호출 0건, 운영 변경 없음.

## 2026-11-12 — 공통/개별 후보의 가족별 회귀 및 증거 범위 검증

- 공통 GEPA 아키텍처 v0.3의 Candidate Registry & Promotion Gate 일부를 연구 전용으로 구현했다. 기존 후보/실행 해시와 수정 슬롯을 다시 확인하고, 캐릭터별 두 평가 분할 및 시나리오 가족의 유일성을 확인한다.
- 한국어 자연스러움·답변 관련성·주도성·인격·관계·기억 연속성·반복·효율성의 각 점수 하락과 허위기억/권한/공급자 실패·불확실성을 가족별 집계한다. 다른 캐릭터의 점수 상승이 한 캐릭터의 퇴행을 상쇄하지 않는다.
- 리뷰 원문·후보 텍스트·비공개 홀드아웃은 외부 출력에서 제외한다. 위조된 승인 상태, 승인되지 않은 가족·추가 비공개 필드, 누락된 검증 분할은 거부한다.
- 원본 근거 인증/사람 블라인드 검토/독립 최종평가가 없으므로 결과는 항상 proposed/HOLD이며 offline_validated·owner_reviewed·heldout_passed·release_approved가 아니다. 실제 모델 호출 0회, 운영 변경 없음.
- 관련 합성 테스트 8개 추가. CI 결과로만 저장소 통과를 판정한다.


## 2026-11-12 — 합성 최종평가 전용 컨테이너·단회 사용 기록

- research/character-optimization-gepa/sealed_holdout_runner.py, test_sealed_holdout_runner.py를 추가했다. 봉인 입력·동결 후보 해시를 별도 파일로 받고 실제 대사·사용자 원문 없이 가족별 점수 변화와 하드 실패만 출력한다.
- 동일 합성 봉인 입력은 한 SQLite 상태 원장당 단 한 번만 소비하며, 다른 후보를 지정해도 중복 실행을 거부한다. 비공개 파일 접근 권한·상태 장부·중복 평가·분할 혼합·위조 승인 주장을 차단하는 단위 테스트 9개를 추가했다.
- 기존 Character GEPA Pinned Offline Smoke 워크플로에 별도 무네트워크 합성 최종 평가 컨테이너와 재실행 실패 검증을 연결한다. 원격 모델 자격증명을 제공하지 않고 최적화 쪽에는 봉인 파일 마운트를 제공하지 않는다.
- 로컬 Python 3.13에서 합성 테스트 9개 통과. CI 안의 실제 Docker 검증은 해당 실행이 끝난 뒤에만 판정한다. **실제 비공개 최종 시험/품질 개선 검증/지출 승인/운영 적용은 여전히 미완료**이며 유료 호출 0회.

## 2026-11-12 — Node와 Python의 평가자료 계약 차이 보정

- 기존 Python GEPA 실행 진입점은 자료의 기본 필드와 분할 이름만 검사해 Node가 차단한 중복 가족·같은 내용의 다른 분할 재사용·캐릭터별 검증 자료 누락을 다시 거부하지 못했다. 위 필수 검사를 실행 직전에 이중화했다.
- Node에서도 평가 항목/가족 ID에 대사·개행·경로 조작 문자열이 들어오지 않도록 제한한다. Python 테스트용 한 건짜리 불완전 평가셋은 개발+검증의 서로 다른 합성 해시로 교정했고, 공개 고정 GEPA 모의 실행 데이터에도 동일한 계약을 적용했다.
- 비공개 원문/사용자 평점은 변경하지 않는다. 실제 유료 호출 0회, 운영·Canon·관계·기억·사주/DB 변경 없음. 테스트 성공은 CI 결과로만 판정한다.

- 첫 CI [#43138885776](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43138885776)에서 Python 파일의 정규식 선언이 잘려 SyntaxError가 발생했다. 문자열 치환 도중 특수 치환 토큰이 처리된 것이 원인이다. 원본 Python 파일부터 필요한 줄만 다시 조립하고, 새 Git Blob과 원문을 바이트 단위로 대조해 정규식과 전체 함수 정의가 온전함을 확인했다. 재실행 CI의 최종 결과를 통과 전까지 추정하지 않는다.

## 2026-11-12 — 사용자 누적 500원 한도 오프라인 견적 검증

- 사용자가 여울 GEPA 전체 유료 파일럿의 상한을 **500원**으로 명시했다. 견적 코드는 4역할/재시도 합계에 대해 USD→KRW 보수적 환산·호출별 원 올림·5개 추가 수수료 상한을 합산하고, 500원/501원 경계 및 위조된 가격/횟수/환율을 합성 테스트로 차단한다.
- 실제 카드 환율·가격표·수수료의 진위 및 신뢰 가능한 사용자 승인 경로는 미확정이다. **신규 OpenRouter 크레딧 구매는 USD 5 최소 구매 정책으로 500원 한도를 넘어 허용하지 않는다.** 기존 크레딧 잔액과 계정 권한을 확인해야 하며, 실제 전송·충전·운영 변경은 수행하지 않았다.
- 견적이 500원 이내라도 ownerApprovalGrantedToTransport=false, paidExecutionReady=false로 유지한다. 실제 API를 통해 요금·사용량을 측정하지 않았으므로 품질·실험 비용의 실측은 없다.

## 2026-11-12 — 여울 500원 합성 원자 예산 장부

- 기존 GovernedBudgetLedger의 동일 SQLite BEGIN IMMEDIATE 트랜잭션에 확장 지점을 추가하고, YeoulKrw500SyntheticLedger로 500원 누적 예약을 함께 검사한다. KRW 계상값은 각 가상 USD 예약에 보수적 환율 상한과 원 단위 올림을 적용한다.
- 한 파일럿 ID에 다른 run_id와 모든 역할/재시도를 합산하고 같은 SQLite 파일에서 비용 상한을 넘기면 예약하지 않는다. 이전 달러 전용 예약이 존재하면 향후 원화 보호 경로에서 거부한다.
- 가상 500/501원 경계·역할 공유·재시작·병렬 경쟁·기존 달러 경로 혼입·청구 불명 보류 등 8개 합성 테스트를 추가하고 고정 GEPA CI에 포함한다. CI 결과 미확정 전에는 성공이나 완성을 선언하지 않는다.
- 이 클래스는 실제 제공업체 결제 게이트가 아니고 채팅 승인 상태도 인증하지 않는다. OpenRouter 신규 크레딧/유료 모델 호출/운영 변경 0회. 사용자 500원 결정은 유지하되 실제 사용 권한은 계속 HOLD.

## 2026-11-12 — 원화 500원 전용 로컬 소켓 검증

- LocalSocketGateway에 KRW 500 전용 모드를 추가해 기존 예산 보호 없는 합성 요청을 거부하고, GovernedDryRunGate가 YeoulKrw500SyntheticLedger를 보유해야만 서버가 시작되도록 한다.
- 전용 합성 데몬과 로컬 소켓 테스트 7개를 구현해 첫 승인된 모의 요청·한도 초과·구형 요청·권한 위조/개인 대화 차단·불명 청구·재시작 보존·정책 미연결 서버 시작 거부를 확인하도록 한다.
- 기존 테스트 모의 소켓과 운영 송신 경로를 교체하지 않는다. 합성 환율/수수료는 실제 근거가 아니며 채팅 승인과 실제 승인 검증은 분리되어 있다. 새 모듈의 GitHub CI 결과 확인 전 성공을 확정하지 않는다.

## 2026-11-12 — 500원 파일럿의 다른 실행 청구 불명·보호 우회 중단

- 기존 500원 공동 장부가 실행별 청구 불명/달러 전용 우회만 점검해 **다른 실행의 이상 징후가 있어도 새 예약이 가능한 결함**을 수정했다.
- 동일 SQLite 장부 안에서 모든 USD 요청과 원화 보호 요청을 대조하고, 다른 실행의 청구 불명 상태를 검출하면 차단한다. 상태 출력에 전역 비정상 여부를 추가했다.
- 별개 실행 간 HOLD, 다른 실행의 USD 우회, 이미 진행된 보호 예약 이후의 우회, 타 실행 정상 정산의 4개 합성 테스트 추가. 실제 공급자·결제·운영 변경 없이 실송신 0회를 유지한다. CI 통과는 실제 결과 확인 후 판정한다.

## 2026-11-12 — GEPA Python 컨테이너 가변 태그 제거

- 기존 GEPA 오프라인 CI와 Dockerfile의 `python:3.14-slim`을 동일한 Docker 공식 다중 플랫폼 이미지 인덱스 SHA-256으로 고정했다. 검증한 linux/amd64 자식 이미지는 Python 3.14.10-slim-trixie이다.
- 기존 가상 평가·네트워크 차단·파일 격리 경로의 실행 방식과 비용 장부는 변경하지 않는다. 개별 및 전체 CI가 실제 통과하기 전까지 새 변경의 검증 성공으로 판정하지 않는다.
- apt/pip 전체 의존성 잠금, 실제 비용 송신 게이트/사용자 승인/비공개 평가·사람 검토는 기존 HOLD를 유지한다. 실제 유료 모델 호출·충전·운영 변경 0회.

## 2026-11-12 — R16 평가표 출처·가족 식별자 경계 수정

- R16 메타데이터 티켓의 가족 ID 검사가 기존에 비어 있지 않은 문자열만 요구하여 원문 대화·개행·경로를 연구 출력에 실을 수 있는 문제를 수정했다. 기존 평가자료 식별자 규격과 일치하는 짧은 ASCII ID만 허용한다.
- Runtime 출처도 `docs/character/` 아래의 정해진 캐릭터 문서 파일 형태로 고정해 경로 우회 및 위조 출처를 거부한다.
- 같은 개행 허용 문제가 공통 평가자료 식별자와 후보 가족 평가 집계에도 존재하여, 세 입력 경계를 모두 완전 일치하는 ASCII 식별자로 교정했다. 합성 부정 테스트에 개인 문장·경로·말미 개행·과도한 길이의 ID를 추가했다.
- 실제 캐릭터 평가 원본·30개 검토표·유료 모델 호출·운영 권한은 변경하지 않았다. CI 확인 전 새 수정의 합격 판정은 보류한다.


## 2026-11-12 — 여울 파일럿 중단·재시작 시 중복 예약 방지

- `YeoulKrw500SingleFlightLedger` 및 별도 실행 모드 잠금을 추가했습니다. 이전 실행의 `reserved` 예약이 남아 있으면 다른 실행/다른 역할의 예약도 원자적으로 차단합니다. 정상 정산된 예약 뒤에는 다음 요청이 가능하나 과금 불명 `held`는 파일럿 전체를 계속 중단합니다.
- 기존 병렬 합성 경로와 섞인 파일의 모드 변경은 거부합니다. 로컬 Python 단위 테스트 17건 통과(신규 5건). CI 결과는 별도 확인합니다.
- 이 단계는 실제 유료 POST 연결이 아니며 승인 출처·가격·환율·잔액·청구 대사·진짜 운영 게이트가 없으므로 실송신 0회, 신규 충전 0원, 운영 변경 없음입니다.

## 2026-11-12 — Python GEPA 평가기의 후보·입력·결과 경계 보강

- `gepa_api_contract.py`의 평가 연결부가 새 후보 문구 내용·사전등록 사례 일치 여부·결과 캐릭터 ID를 충분히 확인하지 않던 결함을 수정했다. 평가 결과의 허용되지 않은 자유 진단 코드·중복 코드도 거부하고 반환 객체는 고정 세 필드만 새로 구성한다.
- 평가기 내부 예외의 원문을 외부로 전달하지 않도록 단일 오류 코드로 처리했다. 생성 후보의 제어문자/권한 변경, 등록되지 않은 자료·다른 캐릭터, 임의 피드백/예외 반례를 합성 테스트에 추가했다.
- 연구용 합성 GEPA 연결부 수정일 뿐, 실제 개인 평가 자료·사람 검토·모델 인증/요금표/충전·운영 캐릭터/Canon/기억/관계는 변경하지 않는다. CI 통과를 확인하기 전에는 완료 판정하지 않는다. 유료 호출 0회.


## 2026-11-12 — 여울 OpenRouter 미승인 송신 차단·원화 예약 경로 연결

- Python 호스트에 고정 OpenRouter POST와 생성 영수증 GET 경로를 구현했다. 송신 전 실사용 승인 출처·가격·입력 토큰 검증을 필수로 두고 현재 미연결 상태에서는 즉시 거부한다.
- 승인된 미래 요청만 엄격한 여울 500원 공동 장부에 예약하도록 연결하고, 네트워크 실패·청구 불명은 그대로 HOLD 처리한다. 원화/달러 예약은 다른 역할·다른 실행과 공유하며 예기치 않은 재시도/복원은 열지 않는다.
- 오프라인 모의 통신/합성 비용 장부 테스트 27건 통과. CI 전체 확인은 별도 대기. 실제 OpenRouter 유료 요청 0회, 신규 충전 0원, 운영 변경 없음.

## 2026-11-12 — 여울·세연 공통 표현 슬롯의 실제 GEPA 무네트워크 시험 추가

- 단일 여울 검증에 더해 GEPA 신규 API로 두 캐릭터의 별도 개발/최적화 검증 합성 가족을 한 번의 `shared_expression` 최적화 실행에 넣는 자동 검증을 구현했다. 각 캐릭터별 점수를 가상으로 다르게 부여하여 실제 평가 실행 범위를 확인한다.
- 반사 모델을 호출하지 않는 가짜 전략, 봉인 시험 입력 없음, 10회 평가 상한, 네트워크 차단을 유지한다. 합성 점수는 실제 대사·캐릭터 품질 개선 근거가 아니며 승격 승인은 계속 불허한다.
- 현재 PR의 고정 GEPA CI에서 실제 통과하기 전까지 다중 캐릭터 실행 성공으로 단정하지 않는다. 500원 상한, 유료 호출 0회, 운영 변경 없음.
