# 세연 KEY2 평가: 병렬 main에 독립적인 1회 복구 (2026-10-19)

Watchtower-Track: character-memory

## 원인
첫 실측 워크플로 #39217368031, HEAD `27c3ed3b28baba2052ecae8aa6a4fc487589f2ee`는 Actions의 빌드와 준비 테스트 성공 후 `C08_KEY2_SINGLE_MAIN_RUN_HOLD`로 멈췄다. 최초 실행 스크립트의 `current main SHA === GITHUB_SHA` 조건은 **병렬 PR 병합으로 main이 전진하면 무조건 실패**했다. 해당 오류는 provider 생성·요청 예약 이전에 발생했고, 기존 Job 로그에서 첫 admission throw가 확인된다. 최초 호출 시도 0회, 실측 결과 0개, Artifact 0개다. 이는 실제 청구 정산 0원 증명이 아니다.

## 수정
- GitHub Actions가 각 실행에 부여한 고정 `GITHUB_SHA`로 소스를 checkout하고, GitHub workflow run 기록의 `head_sha`와 동일한지만 확인한다.
- 그 이후 `main` 브랜치가 변경되어도 중단하지 않는다. 서로 다른 개발 트랙의 병렬 병합을 정상 지원한다.
- 과거 #39217368031의 완료/실패/HEAD/attempt 불변을 입장 조건으로 삼는다. 새 복구 workflow는 `push main`에서 이 문서와 marker가 최초 병합될 때 **딱 한 번만** 실행한다. 새 workflow 자신의 `total_count=1`, `run_attempt=1`을 엄격히 확인해 중복 시 차단한다.
- 기존 실측 Gold 3쌍, `OPENAI_API_KEY2`만 사용, 최대 6회, 건별 선예약·응답/토큰 확인 전 다음 호출 불가, 보수적 19,662 microUSD 예약/추가 누적 5,000원, 자동 재시도 0회, Gold 불일치 시 중지 계약을 **공유 실행기로 그대로 재사용**한다.
- 기존 첫 실행 워크플로는 그대로 유지하며 재실행하지 않는다. 이 복구는 운영 모델 교체/Production 메모리·ACL·사용자데이터·G0~G6 권한 승격이 아니다.

## 결과 판정
복구 실행에 실패하거나 사용량 결과가 불명인 경우에도 재시도/중복 발송하지 않는다. 모든 수치 결과는 새로운 Actions Job 및 Artifact로만 기록한다. 실제 Gold screen PASS, Provider invoice, 5회→3회 종단 비교, Production 승인 여부는 각각 구분한다.
