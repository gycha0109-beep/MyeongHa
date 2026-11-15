# 고정 GEPA 실제 실행 → Python 동결 → Node 검토 전 접수

> 2026-11-13 · character-runtime-lab · 공통 2캐릭터 합성 실행 · **모든 외부 모델 호출 금지**

## 보완하는 공백

이전에는 공식 소스 버전의 실제 GEPA 최적화 결과 동결(Python)과 후보 검토 접수(Node)를 **서로 다른 테스트 자료**로 시험했다. 두 프로세스가 같은 실행 매니페스트·표현 슬롯·버전을 사용하는지 입증하는 엔드투엔드 인계는 미구현이었다.

이번 변경으로 `scripts/character-optimization/gepa-crosslang-handoff-v1.mjs`와 `research/character-optimization-gepa/gepa_crosslang_synthetic_handoff.py`를 추가한다.

1. Node가 기존 `createOptimizationRun → validateCandidate → buildGepaResearchPayload`를 사용해 여울·세연의 분리된 개발/검증 합성 자료 네 가족과 공통 표현 슬롯 하나를 생성한다. 실제 캐릭터 문서·기억·사용자 발화를 입력하지 않는다.
2. Python이 해당 Node 생성 매니페스트·평가자료·초깃값을 읽고, 공식 고정 소스 `ce5b0d6e3d6af6c6dbec6de2c54536bbb961d309`의 실제 `optimize_anything`을 실행한다. 모델을 쓰지 않는 고정 가상 반사 전략과 평가기를 주입한다.
3. Python은 `freeze_offline_gepa_result`로 실제 반환 후보의 허용 슬롯·문구·SHA-256·합성 점수·평가 횟수만 파일에 기록한다. GEPA 내부 평가 기록과 개인 원문은 파일에 기록하지 않는다.
4. Node가 **Python이 실제 생성한 같은 파일**을 다시 읽고 `intakeFrozenGepaResult`로 실행 매니페스트·최초 문구 해시·두 캐릭터의 표현 슬롯을 검증한다. 기존 `inspectCandidateReviewReadiness`에는 별도로 만든 `unreviewed` 합성 집계만 전달한다.
5. 인계의 결과가 항상 `proposed`, `ownerReviewGranted=false`, `releaseApproved=false`, `productionEligible=false`, `externalCalls=0`인지 확인한다.

CI의 고정 GEPA 이미지는 `--network none`, 읽기 전용 연구 코드, 삭제된 권한, 읽기 전용 컨테이너 루트에서 실행하고 별도 임시 연구 결과 디렉터리만 기록한다. Node는 이 컨테이너 밖에서 입력과 동결 출력을 확인한다. 실행 결과는 서비스에 자동 적용되지 않는다.

## 증명과 비증명

**증명 대상:** 두 언어의 매니페스트·후보 인계, 고정 GEPA 실제 API 실행, 원본 로그 미인계, 격리된 가상 처리, 승인 없는 단계 유지.

**증명하지 않는 것:** 평가 알고리즘 자체의 한국어 자연스러움 개선, 캐릭터별 실제 비퇴행, 실사용 288개 평가·미검토 30개, 새 비공개 홀드아웃, 출처·권한 인증, 사람의 블라인드 비교, 모델 단가 및 실제 원화 청구, 누적 500원 범위의 유료 전송 승인.

합성 점수는 인위적인 숫자다. 실제 서비스와 연결하지 않고 유료 학생/반사/심사/최종평가 모델 호출 및 크레딧 충전 0회를 유지한다. Canon·관계·기억·사주·DB·운영 캐릭터를 수정하지 않는다.

## 실행 근거

- 자동 검사: `.github/workflows/character-gepa-offline-pinned.yml`의 `Prove real pinned GEPA result reaches Node review as unapproved candidate` 단계.
- Node: `node scripts/character-optimization/gepa-crosslang-handoff-v1.mjs prepare ABSOLUTE_TMP_DIR`와 `verify ABSOLUTE_TMP_DIR`.
- Python: 고정 GEPA가 설치된 격리 컨테이너의 `python /opt/myeongha/gepa_crosslang_synthetic_handoff.py ABSOLUTE_TMP_DIR`.
- 개별·통합 CI 성공과 실제 병합 여부를 별도로 확인한 후에만 이 경계의 완료를 인정한다.
