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

## 2026-11-12 — Python GEPA 평가기의 후보·입력·결과 경계 보강

- `gepa_api_contract.py`의 평가 연결부가 새 후보 문구 내용·사전등록 사례 일치 여부·결과 캐릭터 ID를 충분히 확인하지 않던 결함을 수정했다. 평가 결과의 허용되지 않은 자유 진단 코드·중복 코드도 거부하고 반환 객체는 고정 세 필드만 새로 구성한다.
- 평가기 내부 예외의 원문을 외부로 전달하지 않도록 단일 오류 코드로 처리했다. 생성 후보의 제어문자/권한 변경, 등록되지 않은 자료·다른 캐릭터, 임의 피드백/예외 반례를 합성 테스트에 추가했다.
- 연구용 합성 GEPA 연결부 수정일 뿐, 실제 개인 평가 자료·사람 검토·모델 인증/요금표/충전·운영 캐릭터/Canon/기억/관계는 변경하지 않는다. CI 통과를 확인하기 전에는 완료 판정하지 않는다. 유료 호출 0회.

## 2026-11-12 — 여울·세연 공통 표현 슬롯의 실제 GEPA 무네트워크 시험 추가

- 단일 여울 검증에 더해 GEPA 신규 API로 두 캐릭터의 별도 개발/최적화 검증 합성 가족을 한 번의 `shared_expression` 최적화 실행에 넣는 자동 검증을 구현했다. 각 캐릭터별 점수를 가상으로 다르게 부여하여 실제 평가 실행 범위를 확인한다.
- 반사 모델을 호출하지 않는 가짜 전략, 봉인 시험 입력 없음, 10회 평가 상한, 네트워크 차단을 유지한다. 합성 점수는 실제 대사·캐릭터 품질 개선 근거가 아니며 승격 승인은 계속 불허한다.
- 현재 PR의 고정 GEPA CI에서 실제 통과하기 전까지 다중 캐릭터 실행 성공으로 단정하지 않는다. 500원 상한, 유료 호출 0회, 운영 변경 없음.

## 2026-11-12 — GEPA 품질 점수의 필수 실패 우선 차단

- Python GEPA 평가기가 필수 실패 5종이 기록된 후보에 높은 점수를 돌려줄 수 있는 결함을 수정했다. 강제 0점은 필수 실패 코드에만 적용하고 기존 합성 설명 진단은 구분한다.
- 최고점+필수 실패 5종, 일반 설명 코드 및 혼합 코드에 대한 합성 시험을 추가했다. 원본 답변과 평가 의견은 사용하지 않았고 실제 실패 탐지 모델을 구축하거나 품질 향상을 주장하지 않는다.
- 해당 PR CI와 통합 CI 통과 전까지 최종 검증은 보류. 유료 호출·크레딧 충전·운영/Canon/기억/관계 변경 없음.

## 2026-11-12 — 실제 GEPA 결과의 Python 동결·Node 승인 전 접수 구현

- 기존 오프라인 GEPA 실행이 반환한 최상위 후보를 Python에서 실제로 검증한 뒤 문구/해시·시험 메타데이터만 출력하는 버전 1 결과 패킷을 만들었다. GEPA 평가 원문, 내부 로그, 사용자 발화, 진단 자유 필드는 복제하지 않는다.
- Node에서는 원래 실행 매니페스트의 버전/캐릭터 범위/단일 표현 슬롯/문구 해시를 독립 검증하며, 승인 전 후보 객체를 기존 가족별 검토 함수와 연결하도록 구현했다.
- 단일·공통 2캐릭터 합성 인계, 조작된 출력·가짜 승인·개인 자료 혼입을 차단하는 양 언어 테스트 및 실제 잠금 GEPA 합성 실행 동결 검증 추가. 현재 PR CI의 성공 확인 전 최종 통과를 주장하지 않는다.
- 사람 검토·개인 평가 원본·신규 비공개 홀드아웃·유료 모델 송신·운영 변경 없음. 500원 상한 유지, 실송신 0회.

## 2026-11-12 — 실제 GEPA 평가 점수의 불확실성 무효화 보정

- Python 실제 GEPA 평가기의 피드백 구조에 명시적인 불리언 `uncertain`을 필수 추가하고 불확실한 경우 최고 품질 점수도 0.0으로 처리한다. 기존 다섯 필수 실패와 캐릭터별 원문/권한 차단은 유지한다.
- 명시적인 true/false, 누락/숫자/문자열 위조, 최고점 무효화 테스트와 실제 GEPA 단일/공통 합성 평가의 알려진 판정 입력을 갱신했다. 별도 모델 호출·실제 사람 평가·원본 데이터 수정은 하지 않았다.
- 고정 GEPA CI 및 통합 검사 통과가 확인되기 전 합격 판정 금지. 전체 500원 한도와 유료 송신 0회 유지.

## 2026-11-13 — GEPA Python 결과의 실제 Node 접수 경로 연결

- 별도 모의 파일로만 검증하던 Python GEPA 결과 동결과 Node 후보 등록을 동일한 실제 고정 GEPA 합성 실행에 연결했다. Node가 단일 공통 표현 슬롯/여울·세연 각 개발·검증 가족을 생성하고 Python이 이를 사용해 네트워크 차단 컨테이너에서 최적화를 수행한다.
- Python이 실제 선택한 후보를 최소한의 동결 파일로 기록하면 Node가 원래 매니페스트와 최초 후보 SHA·슬롯을 확인한 뒤 기존 메타데이터 집계 검토로 전달한다. 후보 승격은 `proposed` 이상 불허.
- 워크플로에 실제 교차 언어 인계 단계를 추가했다. 해당 PR의 고정 GEPA CI 성공/병합은 아직 증거 확인 전이므로 단정하지 않는다. 신규 실사용 평가·인간 검토·유료 호출/충전·운영 변경 없음. 누적 500원 상한 유지.

## 2026-11-13 — GEPA 설치 신원 증빙 및 소스 단일화

- 서로 다른 위치에 하드코딩된 공식 GEPA 소스 설치 경로를 하나의 연구 요구사항 파일로 통일하고, 빌드 인수로 다른 커밋을 선택하는 경로를 제거했다.
- Python 실행 버전·Git 직접 설치 메타데이터·요구사항을 비교하는 실패 우선 검증기, 위조/누락 반례 테스트, 격리 CI 실행 단계를 추가했다. 실제 고정 이미지 안에서 결과를 확인하기 전 성공을 주장하지 않는다.
- Python 이미지/GEPA 원본 신원만 확인한다. pip·apt 전이 의존성 전체 잠금, 원본 사용자 평가·사람 검토, 유료 모델 호출/충전 및 운영 반영은 미완료 또는 미실행이다. 500원 전체 상한 유지.

## 2026-11-13 — 여울 합성 자료의 개발·검증 분할 간 유사도 점검

- 기존 공개 여울 신규 가족 8개(개발 4·최적화 검증 4)에 대해 교차 분할 16가족쌍의 문장 겹침을 검사하도록 신규 함수와 계획 연동을 구현했다. 공백·구두점·표기 변형 및 다중턴 유사성을 감지하고 의심 중복은 등록 거부 처리한다.
- 출력은 카운트와 가족 ID만 포함한다. 합성 반례 테스트를 추가하되 실제 원본 288건에 접근하거나 재실험하지 않는다.
- CI 통과/병합이 증명되기 전 완료로 판정하지 않는다. 어휘 검사가 의미 독립성을 보증하지 않으며 사용자 검토 30건·새 비공개 최종평가·유료 모델 호출·운영 적용은 여전히 HOLD, 누적 500원 상한 유지.

## 2026-11-13 — 실제 GEPA 선택 후보와 캐릭터별 가상 점수 연결

- 고정 GEPA가 선택한 실제 공통 표현 후보를 Python에서 시작 후보와 함께 동일한 합성 평가기에 다시 평가해, 여울/세연의 개발·검증 각 가족 점수를 비공개 메타데이터 파일로 동결하도록 구현했다.
- Node에서는 SHA 및 가족 커버리지 검사 후 기존 가족별 회귀 검사에 실제 반환 후보에서 재평가한 점수를 전달한다. 여울 향상과 세연 퇴행이 전체 평균 상승에 가려지지 않는 합성 반례, 결과 조작·원문/승인 혼입 거부 검증을 추가했다.
- CI 통과/병합 확인 전 최종 통과 주장 금지. 동일 합성 평가기의 비독립 점수임을 명시하고, 원본 288건·검토 후보 30건·유료 API·운영 캐릭터 변경 없음. 500원 총상한 유지.

## 2026-11-13 — GEPA 선택 후보의 분리된 8축 합성 퇴행 검증

- Python의 오프라인 GEPA 평가기가 8개의 각기 다른 합성 품질축 점수로 평균을 계산하도록 변경하고, 같은 최종 후보의 가족별 기초·후보 점수 8개를 동결한 원본 인계로 Node의 검증기를 연결했다.
- Node는 정확한 8개 점수 필드, 부동소수/범위, 가족/캐릭터 ID, 후보 SHA 정합성을 확인한다. 세연의 평균은 개선되지만 인격 충실도만 악화되는 반례를 새로 검증한다.
- 현재 PR의 전체 CI/통합 검사 성공은 아직 확인 전. 이것은 가상 점수의 기술적 연결 검증일 뿐 사람 품질 검증은 아니다. 유료 호출·충전·기존 원본/운영 변경 없음. 전체 500원 상한 유지.

## 2026-11-13 — 실제 GEPA 실행기와 봉인 입력의 접근 경계 검증

- `optimizer_sealed_boundary_v1.py`를 고정 GEPA Python 실행 직전에 연결했다. 코드 마운트·호스트 표식 경로·컨테이너 봉인 디렉터리 부재·자격 증명 부재를 검사하며 누락/노출 시 실패 우선 처리한다.
- CI는 호스트에만 존재하는 0700/0600 **합성 봉인 표식**을 생성하고 실제 GEPA 컨테이너에 해당 디렉터리를 마운트하지 않는다. 호스트 표식/봉인 마운트/심볼릭 링크/환경 비밀키 위조에 대한 단위시험을 추가했다.
- CI 통과 전에는 성공 판정 금지. 새 진짜 비공개 봉인 자료·독립 품질·사람 검토·유료 모델 승인·운영 변경은 미충족이며, 누적 500원 상한·실송신 0회 유지.


## 2026-11-13 — 실제 GEPA 선택 후보 SHA의 격리 합성 최종평가 연결

- 공식 고정 GEPA 실행 이후 생성한 실제 동결 후보와 매니페스트·여울/세연의 합성 개발/검증 입력을 Node에서 재확인하고, **선택 후보의 SHA만** 최종 평가용 최소 파일로 기록한다. 정해진 합성 소스가 아니면 거부한다.
- 기존 별도 단회 최종평가 Docker와 해당 후보 파일을 실제 연결한다. 최적화 종료 후 별도로 생성한 합성 봉인 자료에서 퇴행 항목 집계·후보 해시 일치·두 번째 실행 차단을 검사한다. 실제 모델 평가나 원문은 다루지 않는다.
- 전체 CI/병합이 확인될 때까지 성공 판정 보류. H01~H10을 새 독립 홀드아웃으로 취급하지 않고, 사람 검토 30건·실제 유료 모델 호출·추가 크레딧·운영 콘텐츠 변경 없음. 여울 전체 500원 상한 유지.

## 2026-11-13 — 여울 파일럿의 사전 판정·중단 기준 누락 검증

- 기존 파일럿 준비도 검사에 성공·중단·퇴행 기준의 **명시적 초안 입력**을 연결했다. 독립 가족 수·블라인드 사람 비교 비율은 기본값을 만들지 않고 입력을 요구하며, 캐릭터별 8축 퇴행·하드 실패·불확실성과 500원 전체 예산·청구 불명·자료 누출 중단을 고정 검사한다.
- 공개된 과거 홀드아웃의 재사용·위조 승인·비공개 원문 필드의 혼입을 거부하고 초안 해시만 최소 집계한다. 새로운 값을 넣더라도 사용자 검토/불변 사전등록/실제 비용 승인 및 운영 권한은 **HOLD**다.
- 관련 Node 테스트를 기존 CI 범위에 편입한다. 실제 사람 평가·원본 전송·유료 모델 호출·충전·운영 콘텐츠 변경 없음. 500원 한도 유지. CI/병합 확인 전 완료 주장 금지.

## 2026-11-13 — 여울 기존 288건 원본의 자동 변별력 처리 후 직접 검증

- 로컬 원본 평가 파일은 288행/12질문/4모델/3조건/2반복을 보존했지만, 기존 미검토 자동 변별력 항목 36행·9그룹이 남아 정제본만 허용하는 기본 접수기가 거부했다.
- 기본의 엄격한 정제본 검증은 유지하고, 별도 명시 옵션에서만 **알려진 원본의 36·9 구조**가 정확히 일치할 때 메모리 복사본의 자동 판정만 제외한 뒤 기존 검증기로 전달한다. 사용자 등급·메모·대사·원본 파일을 변경하거나 공개하지 않는다.
- 실제 비공개 원본의 로컬 재검증에서 288개 유일 조합/DeepSeek 72건/양호 94건/신규 8가족 문자 중복 의심 0건 확인. 이는 과거 개발 증거의 입력 정합성이지 사람의 독립 평가나 GEPA 품질 개선이 아니다.
- 금액 전체 500원 한도, 새 유료 요청·충전·운영 변경 0회. 코드 합격은 해당 커밋의 Linux CI에서 최종 판정한다.

## 2026-11-13 — DeepSeek 과거 72건 실패 검토 집계의 실제 원본 실행

- 비공개 로컬 원본 288건을 기존 엄격한 원본 계약으로 선행 검사하고, 그중 DeepSeek 72건의 사용자 평가만 질문·프롬프트별로 집계하는 오프라인 검토 기능을 구현했다. **실제 원본 실행**에서 Y07의 6건 전부 비양호를 확인하고, 기존 질문 12가족을 사람 검토 우선순위로 정리했다.
- 동일 질문·반복의 조건별 양호 변화는 관찰 분포로만 표시하며 독립 실험이나 GEPA 품질 개선이라고 부르지 않는다. 사용자의 원평가/메모·원문·원본 해시는 공개하지 않고, 사용자 평가 라벨에서 확정적 권한 위반을 자동 추정하지 않는다.
- 새 Node 검증 4건 및 실제 원본 로컬 실행 통과. 모델 호출·유료 지출·운영 내용 변경 0건. 사용자 검토 30건·신규 독립 비공개 자료·지출/송신 승인 없이는 HOLD.

## 2026-11-13 — DeepSeek Y07 실패 6건의 비공개 사람 검토표 생성기

- 현재 `main`의 기존 DeepSeek 72건 검증 함수를 사용해 Y07의 6개 비양호 평가만 검토 대상화하고 원본 질문·응답·기존 의견과 **빈 사람 판정 칸**을 저장소 밖 Markdown으로 내보내는 로컬 전용 코드를 작성했다.
- 파일 원본 수정·기존 출력 덮어쓰기·저장소 내부 출력·외부 모델 송신·사람 검토 완료 자동 선언은 차단한다. 집 PC의 현재 로컬 원본 가용성은 미확정이라 이번 작업에서 신규 실측 사용자 검토 결과를 만들지 않는다.
- 합성 288행 계약·미검토 자동 필드 36/9 제외·누락 시 거부·내부 경로 거부 등에 대한 신규 Node 4건을 통과했다. CI·통합 병합 전에는 코드 완료 판정하지 않는다. 사람 30건·비공개 홀드아웃·유료 호출/500원 총상한/운영 변경은 계속 HOLD.

## 2026-11-13 — 여울 Y07 사람 검토표 결과 접수기 연결

- `yeoul-y07-review-intake-v1.mjs`에서 기존 `yeoul-y07-private-human-review-v1.mjs`의 생성 원형을 288행 원본으로 재생성하고, 각 항목의 판정 체크박스·1줄 근거/수정 방향만 변경 허용한다. 원본 질문·응답·평점/의견의 수정, 근거 없는 선택, 중복 선택 및 6건 미완료 상태의 완료 선언은 거부한다.
- 검토 결과는 6건의 범주별 집계와 미결 건수만 **저장소 밖 로컬 파일 신규 생성**으로 보존한다. 판정 메모와 원문은 JSON 결과에서 제외하고, 신원·승인 검증·유료 모델 호출·운영 반영은 항상 false/0이다. 새로운 실제 사람 평가 결과를 생성했다고 주장하지 않는다.
- 합성 288행·비공개 원형 처리·부분/전체 선택·위조·덮어쓰기 거부를 포함해 관련 Node 14건 로컬 통과. 원본 288건을 보유한 Academy PC의 연결이 종료되어 **실제 Y07 사람 검토는 미진행**. 이번 PR의 공식 CI 및 병합 확인 전 완료 판정 금지.

## 2026-11-13 — Y07 실패 사례 직접 검토를 위한 로컬 브라우저 화면 구현

- 이미 병합된 Y07 평가 원본 검증기를 재사용해 기존 비양호 6개 응답을 오프라인 HTML로 생성하도록 했다. 외부 리소스·네트워크 요청 없이 질문·응답·기존 의견을 펼쳐 보고 각 사례별 검토 판정과 근거·수정 방향을 작성한다.
- 브라우저에서 JSON 초안을 저장하고 다시 불러올 수 있지만, 승인/품질 향상/Canon 위반/운영 반영 상태는 언제나 미검증으로 표시한다. 개인 원문 HTML은 반드시 저장소 밖 신규 파일이며 기존 출력 덮어쓰기, 저장소 원본 사용·HTML 주입을 제한한다.
- Node 24 오프라인 합성 288행 테스트 5건 통과, 실제 파일 생성·원본 불변·HTML 텍스트 이스케이프 포함. 실제 학원 PC 원본에 접근할 수 없어 이번 세션의 **개인 실측 검토표 생성 및 사람 판정은 미완료**. 유료 전송 0, 500원 전체 상한 및 HOLD 유지. 개별·통합 CI 통과/병합은 추후 확인.

## 2026-11-13 — Y07 HTML 검토 초안의 원본 잠금 검증·메타데이터 반환

- 이미 병합된 `yeoul-y07-review-intake-v1.mjs`는 수기로 편집한 Markdown만 접수하므로, 브라우저 JSON 초안의 정확한 6개 사례 키·판정·근거를 **기존 원본 288건 기반 검토표와 기존 접수 검증기에 연결**했다.
- 검토가 미완료인 경우, 판단 보류, 다른 판정, 근거가 있는 경우를 분리한다. 사람 근거의 개행은 단일 행에 정규화하고 원본 질문·답변·메모는 결과 집계에서 제외한다. 외부 원격 송신 없이 읽기 전용 검사 후 로컬 JSON 결과만 신규 생성하며 기존 파일 덮어쓰기 금지.
- 로컬 Node 24 신규 연동 6건과 브라우저/기존 Markdown 접수 관련 11건 = **17건 통과**. 실제 원본 접근/사람 검토/신뢰 가능한 승인/새 독립 홀드아웃은 미완료. 해당 커밋의 개별·통합 CI·병합 전에는 코드 검증 최종 합격으로 판정하지 않는다. 500원 전체 한도 및 유료 호출 0.

## 2026-11-14 — 기존 여울 질문과 신규 8가족의 의미 중복 사람 검토 지원

- 실제 병합된 #3187 이후 `main`을 기준으로 신규 여울 개발 4가족·최적화 검증 4가족에 대해 기존 Y01~Y12와 **사람의 의미 중복 판단을 받을 수 있는** 비공개 로컬 HTML 생성기와 초안 JSON 접수기를 추가했다.
- 원본 288행/12질문 동일성 검사, 알려진 미검토 자동 필드 36·9의 명시적 메모리 제외, HTML 원문 이스케이프, 항목별 판정/근거·중복 Y문항 ID의 일관성, 저장소 밖 신규 파일 생성 및 덮어쓰기 거부를 구현했다.
- 출력에는 집계 건수와 신규 가족 ID만 넣고 원문/사람 의견을 포함하지 않는다. 어떤 판정도 검토자 신원 인증이나 최적화 데이터 승격을 입증하지 않으며 승인 없이 운영·Canon·관계·기억·DB·유료 모델을 변경하지 않는다.
- 실제 학원 PC의 원본에 접근할 수 없어 사람 검토는 미실행. CI·통합 검사 통과 및 병합 전에는 코드 완료 주장 금지. 유료 모델 호출 0회, 총 500원 한도 유지.

## 2026-11-14 — 여울 의미 중복 검토 초안의 원본 질문 연결 검증

- 이미 병합된 비공개 12×8 의미 비교 검토 기능에서, 다른 원본으로 작성한 검토 JSON도 동일 12개 ID만 있으면 접수될 수 있던 누락된 연결 검사를 보완했다.
- 검토 화면이 기존 질문 12개 원문과 현재 신규 8가족 매니페스트에서 로컬 전용 확인값을 만들고, JSON 저장/다시 불러오기/접수 시 일치하지 않는 자료를 거부하도록 수정했다. 기존 확인값 없는 초안은 새 화면에서 다시 생성해야 한다.
- 원본 확인값은 **비공개 HTML과 비공개 JSON 초안**에만 보관하고 공개 가능한 최소 집계·로그에는 남기지 않는다. 확인값 일치는 신뢰 가능한 원본 진위·실제 사람 검토자 신원·사용자 승인·자료 독립성 증명이 아니다.
- 로컬 합성 테스트는 원본 질문 변경·위조된 확인값·누락된 확인값 거부 및 기존 검토 기능을 확인한다. 실제 원본 288건 PC 접속 장애로 실제 사람 검토는 대기. 새로운 유료 모델 호출 0회, 운영 변경 없음. 새 HEAD CI와 통합 검사 완료 전에는 병합 완료로 보고하지 않는다.

## 2026-11-14 — 여울 새 봉인 최종평가 초안 접수기

- #3299 실제 병합과 성공 CI를 확인하고 기존 4단계 미완료 항목인 비공개 최종평가 자료의 새 입력 형식·중복 사전 검증을 구현했다.
- 공개 H01~H10 및 기존 개발/최적화 8가족의 정확한 문장 재사용 차단, 신규 질문군 내부와 기존 공개 자료 간 유사성 의심 집계, 선택적 기존 Y01~Y12 비교를 마련했다.
- 결과에는 원문·가족별 ID/점수·원본 해시를 내지 않는다. 기존 합성 단회 평가기와 GEPA 평가 입력/모델은 변경하지 않았다. 실제 새 홀드아웃·사람 승인·출처 인증·실측 개선·유료 송신·운영 반영은 미완료이고 500원 상한/유료 호출 0회 유지.

## 2026-11-14 — GEPA 빌드 wheel 잠금 파일 및 Docker/CI 일치 검증

- PR #3300의 통합 CI 성공 및 병합을 확인하고, 로드맵 3단계에서 미고정이던 GEPA PEP 517 빌드 도구의 실제 버전과 5개 wheel SHA-256을 잠금 파일로 추가했다.
- Dockerfile과 공식 CI에 해시 필수·wheel 전용·추가 자동 의존성 설치 금지·빌드 격리 중지·사전 설치된 빌드 의존성 점검을 연결했다. 공식 GEPA Git 커밋과 Python 베이스 SHA는 유지한다.
- 집 PC에서 실제 Docker 이미지 빌드 완료, 인터넷 차단/읽기 전용 컨테이너에서 공식 GEPA 합성 실행 포함 8개 Python 테스트 성공. 해시 위조·버전 변경·빌드 패키지 누락을 거부하는 오프라인 계약도 통과했다.
- apt/system 패키지 전체 잠금 및 실제 데이터/사람 평가·신뢰 가능한 실송신/비용 승인 게이트는 미완료. 유료 모델 호출·운영 변경 0회, 여울 전체 지출 상한 500원 유지. 통합 CI 및 병합 최종 성공은 새 PR 커밋 기준 별도 확인.

## 2026-11-14 — GEPA Debian 스냅샷과 실행 이미지 분리

- #3303이 현재 HEAD의 개별/통합 CI 성공 후 실제 병합된 것을 확인했다. 공식 Python 베이스 이미지가 기록한 2026-11-04 Debian 스냅샷을 실제 Docker에서 조회해 trixie·보안 패키지 목록 접근을 확인했다.
- 빌드 때의 APT 저장소 시점과 Git·CA 패키지 버전을 고정했다. Docker 다단계 구조로 **빌드 단계에서만 APT와 Git을 사용**하고 최종 런타임은 원본 SHA가 고정된 Python 베이스 + 설치된 Python 패키지로 구성한다. 기존 GEPA Git SHA와 해시 고정 Python 빌드 wheel은 유지했다.
- 집 PC에서 새 이미지 빌드 성공, 네트워크 차단/읽기 전용 소스 및 전용 임시 폴더 실행, 공식 GEPA 합성 검증 8건 PASS. 불필요한 Git 실행 파일이 최종 이미지에 없는 것도 확인했다.
- 서명된 APT 스냅샷은 고정됐지만 모든 Debian 전이 .deb의 별도 SHA 목록/다중 플랫폼 결과 바이트는 입증하지 않았다. 원본 학원 PC 연결 불가, 실제 사람 검토 44건·새 독립 봉인 평가·유료 모델 송신 승인 없음. 전체 500원 한도 및 모델 호출/운영 변경 0건 유지. 신규 PR의 CI 및 병합 전에는 최종 완료라고 주장하지 않는다.

## 2026-11-14 — GEPA 빌드 Debian 패키지 31개 파일 해시 고정

- PR #3304의 최신 HEAD에 대한 통합 CI 성공과 실제 병합을 확인하고, 같은 로드맵 3단계에서 시스템 다운로드 파일 해시 검증의 미완료 범위를 처리했다.
- Debian 2026-11-04 고정 스냅샷의 linux/amd64 빌드에서 Git·전이 의존성 패키지 31개를 실제 다운로드해 SHA-256을 기록하고, Docker 빌드를 **다운로드 → 파일 집합/해시 검증 → 설치** 순서로 변경했다. 최종 실행 이미지는 빌드용 Git·APT 설치물을 포함하지 않는다.
- 로컬 소스 계약 11건과 실제 Docker 빌드, 최종 격리된 GEPA 합성 실행 13건을 통과했다. 다른 아키텍처와 기반 이미지의 기존 OS 패키지, Python wheel 산출물 전체 바이트까지 완전한 잠금은 주장하지 않는다.
- 사용자 비공개 원본 288건·사람 검토 44건·새 독립 평가·실제 공급자 요금/승인·운영 적용은 여전히 미완료. 실제 유료 API 호출 0회, 사용자 전체 파일럿 한도 500원 유지. 새 PR의 현재 HEAD·main CI와 실제 병합 확인 전에는 완료를 선언하지 않는다.

## 2026-11-14 — R16 평가 원본 156개 캐릭터/분할 혼입 검사

- PR #3307 현 HEAD의 개별·공식 통합 CI 성공과 실제 병합을 확인했다. 기존 로드맵 2단계의 R16 캐릭터별 평가 경계 검사를 진행했다.
- 네 명의 DRAFT Runtime을 읽어 항목 31+46+41+38=156개를 원본 SHA·캐릭터·범주·설명 해시로 확인했다. 같은 원문 설명의 교차 캐릭터 그룹 0건이며 의미적 독립성은 미확인이다.
- 기존 R16 티켓 계약을 이용해 교차 캐릭터 항목 교체, 원본 출처 불일치, 가족별 개발/검증 혼합, 동일 평가 설명의 다른 분할 사용, 승인/점수 위조를 거부한다. 출력은 최소 수·범주 메타데이터뿐이다.
- 다른 5명 R16 원본, 여울 44건 사람 검토·독립 최종평가·유료 승인/운영 반영은 미완료다. 합성 검사로 실제 품질 개선을 주장하지 않는다. 유료 호출 0건·전체 500원 상한 유지.
