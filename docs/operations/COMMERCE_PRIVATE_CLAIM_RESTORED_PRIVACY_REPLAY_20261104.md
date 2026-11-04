# Commerce Payment — 복원된 PostgreSQL의 개인 청약철회 Claim 삭제 재검사

**개발 로드맵:** 결제 트랙 실행 로드맵 4번. 기존 P0-PR-01의 보존·삭제 정책을 변경하거나 재승인 요청하지 않습니다.

## 확인한 기존 기능

- 2320 단계 SQL에는 개인 청약철회 접수 삭제와 이미 삭제된 Subject의 Claim 잔여 데이터 발견 시 재실행 거부가 구현돼 있습니다.
- 기존 격리 PostgreSQL 17 검증은 대상 Subject의 Claim 삭제, 타 Subject의 Claim 및 Commerce P5Y 원장 보존, 삭제 후 잔여 Claim에 대한 재실행 거부를 검사합니다.
- 복원된 백업의 권위 있는 privacy replay 스크립트는 계정 삭제 및 완료 재실행을 확인하지만, **새 개인 청약철회 Claim 테이블에 대한 종료 상태 검증은 누락**돼 있었습니다.

## 이번 구현

- scripts/operations/run-restored-postgres-authoritative-privacy-replay.sh 에서 replay 후 복원 DB의 personal withdrawal Claim 테이블 유무를 먼저 확인합니다.
- 해당 테이블이 실제 존재하는 스키마에서만, 각 삭제 대상 Subject의 Claim이 **계정 삭제 최종 처리 후 0건이며, 완료 단계 재실행 후에도 0건**임을 개별 확인합니다. 남아 있거나 복원된 Claim이 발견되면 전체 격리 복원 검증이 즉시 실패합니다. 검증 대상 Subject만 조회하며, 출력 증거에 해당 식별자 또는 Claim 본문을 기록하지 않습니다.
- 테이블 자체가 존재하지 않는 과거 백업은 **schema-absent-no-private-claim-proof**로 명시합니다. 예전 백업의 성공을 새 Claim DELETE 검증 성공으로 오인하지 않습니다. 테이블이 존재하고 모두 0건이면 **exact-subject-after-finalizer-and-completion-pass**를 출력합니다.
- 기존 계정 삭제·익명화·Commerce 장기 보존 정책, PG·Reader·LIVE 및 운영 DB 마이그레이션은 변경하지 않습니다.

## 검증 범위와 한계

- test/commerce-private-claim-restored-replay-guard.test.mjs: 복원 실행 스크립트의 정확한 Subject 재검사 연결, 실패 차단, 표기 구분, 기존 2320/격리 PG17 삭제 증거 재사용, Bash 구문을 확인합니다.
- 실제 복원 PostgreSQL 17 및 통합 CI 결과가 확인되기 전에는 복원 실행 PASS나 로드맵 4번 완료를 선언하지 않습니다.
- 서버/앱 출시 플래그, 운영 데이터, 정식 판매 및 실제 환불은 전혀 건드리지 않습니다.
