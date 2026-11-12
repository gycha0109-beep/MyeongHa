# GEPA 후보 평가·검토 게이트 — 오프라인 증거 계약 v1

> 2026-11-12 · Character Runtime Lab · 연구 전용 / 유료 호출·운영 변경 없음

## 목적

아키텍처 v0.3의 Candidate Registry & Promotion Gate는 proposed → offline_validated → owner_reviewed → heldout_passed → release_approved의 각 상태가 독립 증거에 연결되어야 한다. 기존 공통 평가의 캐릭터별 평균 퇴행 검증을 보완하여, **시나리오 가족 단위**, 각 캐릭터·개발/최적화 검증 자료의 범위, 8개 품질 차원, 허위기억·권한/관계 위반과 불확실성을 개별 검사한다.

## 구현

- 파일: scripts/character-optimization/candidate-evidence-review-v1.mjs
- 입력: 이미 고정된 공통/캐릭터 단독 실행 매니페스트, 단일 표현 슬롯 후보, 각 캐릭터의 개발·최적화 검증 **시나리오 가족별** 집계.
- 후보/매니페스트 SHA를 재계산하여 위조된 버전·허용 범위 밖 슬롯을 거부한다. 공통 후보는 해당 실행 명세에 속한 **모든 캐릭터**의 두 평가 분할을 각각 필요로 한다.
- 각 가족의 baseline과 candidate 점수를 같은 8개 차원에서 비교한다. 2턴·2회 반복을 통계적 독립 표본으로 부풀리지 않으며, 캐릭터 한 명의 퇴행을 나머지 캐릭터의 상승으로 덮지 않는다.
- 하드 실패·불확실성·검토되지 않은 입력·중복 및 분할 간 유사 가족 ID 혼합·봉인 홀드아웃 유입·사용자 원문 또는 알 수 없는 추가 필드를 거부하거나 보류한다.
- 출력은 가족별 대사나 사용자 정보를 출력하지 않는 집계이며, 기존 승인·검증이 연결되지 않은 수치를 진짜 평가 결과라고 주장하지 않는다.

## 보류 경계

이 모듈은 결과 접수 서식을 점검할 뿐이며, 결과를 독립적으로 측정하거나 사람의 검토 주체를 인증하지 않는다. 합성 점수가 모든 차원에서 좋아도:
- candidateRegistryStage는 항상 proposed,
- offlineValidated=false, ownerReviewGranted=false,
- heldoutPassed=false, releaseApproved=false, productionEligible=false,
- externalCallsAuthorized=false, externalCalls=0.

owner_reviewed/heldout_passed/release_approved 단계는 현재 구현하지 않는다. 특히 사람 검토표에 체크된 승인 주장, AI 점수, 사내 출처 인증 없는 JSON을 근거로 상태를 건너뛰지 않는다. 운영 콘텐츠 버전 변경, 기존 채팅 변경, DB/사주/기억/관계/Canon 갱신 없음.

## 실제 남은 작업

독립 평가 자료 확보와 사람 품질 판정, 원본·모델 출력·공급자 청구의 신뢰 가능한 출처 검증, 봉인된 최종 평가 실행기, 사용자 승인·변경 불가능한 콘텐츠 버전/롤백 경로가 필요하다. 특히 여울의 공개 H01~H10과 기존 288건은 신규 독립 최종 평가의 근거로 전환할 수 없다.

실행(합성 테스트): node --test scripts/character-optimization/candidate-evidence-review-v1.test.mjs
