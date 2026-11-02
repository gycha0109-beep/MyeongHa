# Commerce P4 — 개인 환불 접수 기록의 PostgreSQL 17 전체 계정 삭제 검증

작성일: 2026-10-31

## 목적과 구현

기존 개인정보 삭제 정책 `P0-PR-01`에 따라 보존 대상이 아닌 개인 청약철회 Claim을 정확한 계정 삭제 트랜잭션에서 제거합니다. 앞서 작성한 테이블·최종 삭제 함수 **비배포 후보**를 실제 전체 PostgreSQL 17 마이그레이션 환경에서 실행 검증할 수 있도록 기존 계정 삭제 테스트와 통합했습니다.

- `test/db/commerce_private_claim_finalizer_full_pg17.sh`: 반드시 PostgreSQL 17 및 격리 `myeongha_*` 테스트 DB인지 검증한 뒤, 기존의 개인 Claim 테이블·최종 삭제 함수 후보 SQL만 설치합니다. 실제 `supabase/migrations/` 또는 운영 DB를 수정하지 않습니다.
- `test/db/account_deletion_db_finalizer.sh`: 특정 환경 변수일 때만 새 Claim 증거의 seed/롤백/삭제 완료 검증을 끼워 넣습니다. 기본 기존 테스트 실행 동작은 변경하지 않습니다.
- `test/db/commerce_private_claim_finalizer_pg17_assertions.sh`: 본인 계정과 다른 계정에 각각 구매 Intent와 개인 Claim을 합성 생성합니다. 일반 DELETE 차단, 외래키 오류로 삭제 실패 시 정확한 원본 Claim 롤백, 정상 계정 삭제 시 해당 Claim 0건·타인 Claim 1건·보존되는 두 Purchase Intent 2건, 이미 삭제된 계정에 개인 Claim이 복원된 경우 최종 삭제 재실행 거부와 해당 검증 트랜잭션 롤백을 확인합니다.
- `scripts/ci/db-suites.json`과 `test/db/run_ci_case.sh`: PostgreSQL **17 전용** 독립 CI 데이터베이스 검사 항목에 추가했습니다. PostgreSQL 15의 일반 `db-authority-core`에서는 실행하지 않습니다.
- `test/commerce-private-claim-real-pg17-finalizer-v1.test.mjs`: 공개 권한/운영 마이그레이션 변경 금지와 테스트 연결을 검증합니다.

## 안전 경계

- P0-PR-01 승인된 DELETE 분류는 유지합니다. Commerce 구매 Intent/Receipt/Grant 보존 정책을 바꾸지 않습니다.
- **현재 비배포 후보 유지:** 두 SQL은 `docs/operations/candidates/`에만 있고, 고객 청약철회 접수·환불·Reader 자동 Grant 회수·LIVE 결제 API는 활성화하지 않습니다.
- 이 통합 테스트가 통과해도 계정 삭제 이후 백업 복원 시 Claim 삭제 재조정, 실제 고객 수락 UX 및 운영 배포 준비는 별도 검증 대상입니다.
- 실제 PostgreSQL 17에서 최종 삭제 함수를 실행한 PASS 근거는 GitHub `db-authority-core` 통합 CI가 성공한 뒤에만 확정합니다.
