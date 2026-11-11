# 캐릭터 공통 최적화 — 연구·실험 정책

> Watchtower-Track: character-runtime-lab
> 기준: GEPA 설계 v0.3 · 현재 승인 범위 오프라인 연구만

## 무조건 유지할 경계

1. 명하의 기존 캐릭터 Canon/Bible/Runtime, 관계·기억·사주·콘텐츠 권한은 최적화 알고리즘이 바꿀 수 없다. 표현 슬롯에 새 문구를 제안할 수 있을 뿐이다.
2. 사람 검토가 끝나지 않은 예시는 정답 대사로 사용하지 않는다. 288건 사용자 평가·후속 메모의 원문은 GitHub/공개 CI 및 외부 심사·교사 호출에 전송하지 않는다.
3. 개발/검증/최종 봉인/장기 대화 자료를 독립적으로 분리하며, 봉인 테스트는 GEPA 내장 `test_set`, 교사 background, 최적화 로그에 전달하지 않는다.
4. 현재 공통 패키지는 **실네트워크 호출 기능이 없다**. `executionMode: 'offline'` 및 USD 0/호출 0만 허용한다. GEPA 라이브·승인 실험 연결은 후속 별도 작업이며 비용 장부와 사용자가 승인한 호출/예산 없이는 실행하지 않는다.
5. 소프트 품질 점수가 높아도 허위 기억·권한 침범·타인 프라이버시 노출·무승인 모델 fallback·미확인 과금이 있으면 후보 승격을 막는다. 자동 검사는 완벽하지 않으며 사람 검토를 남긴다.
6. `approvalRef` 같은 자기 신고 문자열은 승인 증거가 아니다. 연구 후보 → 사용자 검토 → 봉인 평가 → 운영 승인/전환은 각각 별도 결정이다.
7. 공통 규칙은 독립적으로 검증된 캐릭터에만 적용한다. 전체 평균 점수가 개선됐더라도 한 명의 후퇴가 있으면 통과시키지 않는다.

## 사용 방법 (현재 오프라인 구현)

```sh
node --test scripts/character-optimization/test/*.test.mjs
node scripts/character-optimization/validate-offline-manifest.mjs /private/run.json /private/profiles.json /private/dataset-metadata.json
```

- 인풋은 *코드에 정의된 구조의 메타데이터 JSON*이다. 원문 대사, 장기기억, 사용자 식별자를 포함해서는 안 된다.
- 최적화용 CLI는 development/optimizer_validation 메타데이터만 받는다. `sealed_holdout`/`long_horizon`이 있으면 거절한다.
- 결과는 집계 수·해시·상태만 표준 출력한다. 실제 대사 생성·GEPA 탐색·API 요청·자동 배포는 수행하지 않는다.
- 실제 파일 시스템 격리, 동의 검증, GEPA 버전 잠금, 충돌 안전 비용 장부는 아직 구현하지 않았다.

## 신규 합성 개발 자료 초안

`scripts/character-optimization/fixtures/yeoul-synthetic-development-v1.json`은 공개 가능 합성 **초안**이며, 개발 8개·검증 4개만 포함한다. 사용자가 검수해 중복·캐릭터 적합성을 확인하기 전에는 자동 최적화에서 사용하지 않는다. 최종 홀드아웃은 여기에 포함되지 않는다.
