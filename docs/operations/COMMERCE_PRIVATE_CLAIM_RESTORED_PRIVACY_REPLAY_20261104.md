# Commerce Payment — 복원된 PostgreSQL의 개인 청약철회 Claim 삭제 재검사

**개발 로드맵:** 결제 트랙 실행 로드맵 4번. 기존 P0-PR-01의 보존·삭제 정책을 변경하거나 재승인 요청하지 않습니다.

## 확인한 기존 기능

- 2320 단계 SQL에는 개인 청약철회 접수 삭제와 이미 삭제된 Subject의 Claim 잔여 데이터 발견 시 재실행 거부가 구현돼 있습니다.
- 기존 격리 PostgreSQL 17 검증은 대상 Subject의 Claim 삭제, 타 Subject의 Claim 및 Commerce P5Y 원장 보존, 삭제 후 잔여 Claim에 대한 재실행 거부를 검사합니다.
- 복원된 백업의 권위 있는 privacy replay 스크립트는 계정 삭제 및 완료 재실행을 확인하지만, **새 개인 청약철회 Claim 테이블에 대한 종료 상태 검증은 누락**돼 있었습니다.

## 이번 구현

- scripts/operations/run-restored-postgres-authoritative-privacy-replay.sh 에서 replay 후 복원 DB의 personal withdrawal Claim 테이블 유무를 먼저 확인합니다.
- 해당 테이블이 실제 존재하는 스키마에서만, 각 삭제 대상 Subject의 Claim이 **계정 삭제 최종 처리 후 0건이며, 완료 단계 재실행 후에도 0건**임을 개별 확인합니다. 남아 있거나 복원된 Claim이 발견되면 전체 격리 복원 검증이 즉시 실패합니다. 검증 대상 Subject만 조회하며, 출력 증거에 해당 식별자 또는 Claim 본문을 기록하지 않습니다.
- 테이블 자체가 존재하지 않는 과거 백업은 **schema-absent-no-private-claim-proof**로 명시합니다. 테이블이 있더라도 각 대상의 삭제 전 Claim이 모두 0건이면 **exact-subject-zero-after-replay-no-pre-finalizer-deletion-witness**로 표시하며 실제 삭제를 입증했다고 주장하지 않습니다. 삭제 전 Claim이 존재한 대상이 최소 하나 있고, 모든 대상의 최종 처리·완료 재실행 후 Claim이 0건인 경우에만 **exact-subject-after-finalizer-and-completion-pass**로 표시합니다. 식별자나 Claim 본문 없이 `private_withdrawal_claim_deletion_witnessed`로 관측 여부를 별도 기록합니다.
- 격리 복원 DB에서 전체 Claim 행 건수도 삭제 전과 모든 대상의 완료 재실행 후에 **집계값만** 조회합니다. 이전 전체 건수에서 삭제 대상의 사전 Claim 건수 합계를 뺀 값과 이후 전체 건수가 다르면 즉시 실패합니다. 이 보조 검사는 다른 고객 행의 **과잉 삭제를 건수 차이로 탐지**하지만, 개별 행의 완전한 동일성·실제 백업 복원 성공까지 입증하지는 않습니다. 결과에는 `private_withdrawal_claim_unrelated_row_count_guard`만 표시하고 개인 식별자·원문·건수 자체는 내보내지 않습니다.
- 집계 건수 보존만으로는 같은 건수의 타 고객 Claim 내용 변경이나 행 교체를 탐지하지 못합니다. 이를 보완하기 위해 **삭제 대상 Subject를 제외한 모든 Claim 행의 전체 JSON 값을 개별 SHA-256으로 해싱하고, 정렬된 행 지문 흐름의 SHA-256을 삭제 전후에 비교**합니다. 테이블 내부에서만 원본 값이 해싱되며 외부에는 총지문이나 고객 식별자·본문을 남기지 않습니다. 서로 다르면 격리 복원 검증 자체를 실패시킵니다. 대상 외 행이 아예 없다면 `no-unrelated-claim-row-to-witness`로 구분하고, 실제 대상 외 행이 존재하고 일치한 경우에만 `sha256-full-row-multiset-consistent`로 표시합니다. 이는 암호학적 지문 일치의 증거이지 별도 백업 진본성이나 법적 제공 완료를 증명하지는 않습니다.
- 기존 계정 삭제·익명화·Commerce 장기 보존 정책, PG·Reader·LIVE 및 운영 DB 마이그레이션은 변경하지 않습니다.

## 검증 범위와 한계

- test/commerce-private-claim-restored-replay-guard.test.mjs: 복원 실행 스크립트의 정확한 Subject 재검사 연결, 실패 차단, 표기 구분, 기존 2320/격리 PG17 삭제 증거 재사용, Bash 구문을 확인합니다. `scripts/operations/commerce-private-claim-restored-evidence-classifier-v1.mjs`의 삭제 관측·집계 건수 보존·대상 외 행 전체 SHA-256 지문 보존 판정 함수를 정상·오류 사례로 실행 검증합니다. 이 검사는 독립적·합성 분기 검증이지 실제 복원 PostgreSQL 실행 성공은 아닙니다.
- 실제 복원 PostgreSQL 17 및 통합 CI 결과가 확인되기 전에는 복원 실행 PASS나 로드맵 4번 완료를 선언하지 않습니다.
- 서버/앱 출시 플래그, 운영 데이터, 정식 판매 및 실제 환불은 전혀 건드리지 않습니다.
