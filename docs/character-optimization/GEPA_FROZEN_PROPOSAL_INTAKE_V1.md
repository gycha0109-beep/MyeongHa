# GEPA 실제 결과 → 승인 전 후보 등록 연결부 v1

> 2026-11-12 · character-runtime-lab · **합성 오프라인 실행만 / 승인·유료 전송·운영 변경 금지**

## 목적과 입력

캐릭터 공통/개별 표현 슬롯의 GEPA 탐색이 끝나도 `Result.best_candidate`가 자동으로 서비스 표현 규칙이 되어서는 안 된다. 공식 잠금 GEPA 실제 실행 결과를 최소한의 **승인 전 후보 객체**로 동결하고, 기존 Node 후보 검토 계약과 연결하는 처리 경계를 구현한다.

- Python `gepa_result_proposal.freeze_offline_gepa_result(result, envelope, immutable_sources_sha256, max_evals)`는 실행 결과의 단일 허용 슬롯, 문구 안전 형식, 합성 점수, 평가 횟수 상한을 검증한다.
- 동결 출력 `character-gepa-frozen-result-v1`에는 최초 연구 실행 식별 해시·시작 후보 해시·동결 문구와 SHA-256·검토 상태·제한된 합성 지표만 포함한다. GEPA의 `eval_log`, 반사 예시, 사용자 대사 또는 임의 메타데이터를 복제하지 않는다.
- Node `gepa-result-intake-v1.mjs`는 기존 고정 실행 매니페스트의 SHA-256, 캐릭터 집합/표현 슬롯, 후보 문자열과 해시를 다시 확인하고 `validateCandidate()`로 후보 형식을 재검사한다.
- 검토에 사용할 후보 객체는 `pending_owner_review` 상태만 허용한다. 다른 검토자가 작성한 가족별 평가 집계가 있다면 기존 `inspectCandidateReviewReadiness()`에 **별도로** 넣을 수 있지만, 출처 인증·사람 검토·최종 비공개 시험을 자동 통과하지 않는다.
- Python 공식 잠금 GEPA 합성 실행 1캐릭터/2캐릭터 시험에서 실제 결과 동결을 수행하고, Node 독립 단위시험은 같은 버전 JSON 구조를 점검한다.

## 명시적인 비신뢰 경계

- 이 메시지의 Run SHA·문구 SHA는 **출처를 주장하거나 데이터 변조를 탐지하는 값**일 뿐 사용자 권한/생성 모델/원본 증거 자체를 인증하지 않는다. Python 호출자가 제공한 고정 컨텍스트 SHA도 Node 매니페스트와 대조하기 전에는 주장에 불과하다.
- `bestScoreSyntheticOnly`는 인위적 시험 숫자이며 사용자 경험 향상이나 독립 검증 결과가 아니다. 신뢰할 만한 판단 근거가 없어 `sourceAuthenticated=false`, `independentQualityGainEstablished=false`를 유지한다.
- `candidateRegistryStage=proposed` 외 상태 승격 없음. 사람 검토·홀드아웃·운영 배포 승인 모두 false다.
- 개인 평가 원본 288건·여울 검토 후보 30건·캐릭터별 비공개 자료를 새 경계로 옮기지 않는다. 여울 전체 실험 500원 한도 유지, **유료 모델 요청·신규 충전·자동충전·운영 Canon/기억/관계/사주/DB 변경 0회**.

## 검증 명령

- Python: `python -m unittest -v test_gepa_result_proposal test_pinned_gepa_offline` (잠금 GEPA 설치 환경)
- Node: `node --test scripts/character-optimization/gepa-result-intake-v1.test.mjs`
- CI: `.github/workflows/character-gepa-offline-pinned.yml`에서 고정 GEPA 소스 및 실제 무네트워크 합성 실행.
