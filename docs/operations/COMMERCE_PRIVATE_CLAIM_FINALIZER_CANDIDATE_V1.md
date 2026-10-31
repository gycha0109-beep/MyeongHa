# Commerce Payment P4 — 개인 환불 접수 기록의 계정 삭제 함수 연결 후보

**작성일:** 2026-10-31
**기준:** 확정된 개인정보 삭제 정책 P0-PR-01. 정책 재결정이나 보유 기간 연장 없음.

## 실제 변경

- `docs/operations/candidates/account_deletion_finalizer_with_private_withdrawal_claim_v1.sql`: 마지막 운영용 계정 삭제 함수의 정규 정의(`1520_account_deletion_finalizer_relationship_runtime_sync.sql`)를 복사한 **비배포 수정 후보**. 기존 선행검사/행 잠금/기존 테이블 삭제 순서/Commerce P5Y 보존·계정 링크 해제/Subject tombstone을 유지합니다.
- `digital_reading_withdrawal_claims_private_v1`의 **정확한 Subject DELETE**를 기존 Reader 접근권/Reading 이력 삭제보다 앞에 배치합니다. Claim의 Purchase Intent FK는 보존되는 Commerce 구매 증거를 가리키므로, 개인 Claim 행만 삭제합니다.
- 이미 삭제된 계정의 최종 처리 재실행 시 개인 Claim 행이 다시 나타났다면 정상 재실행으로 보고하지 않고 거부합니다.
- 개인 Claim 삭제 후에도 같은 Subject의 Claim 행이 남아 있으면 트랜잭션을 실패시켜 삭제 완료 상태가 반영되지 않게 합니다.
- 신규 테이블 후보의 INSERT-only trigger는 기존 계정 삭제 최종 처리 함수 **소유자와 트랜잭션 로컬 Subject가 일치할 때만** DELETE를 허용합니다. 다른 계정 Claim 삭제·일반 사용자 UPDATE/DELETE는 거부합니다.

## 검증 및 미완료

- 구조 검증 `test/commerce-private-claim-finalizer-disposition-candidate-v1.test.mjs`: 운영 중인 마지막 계정 삭제 함수 정의와 수정 후보의 **정확한 3개 삽입 지점을 제외한 본문 동일성**, 기존 구매 증거 삭제 금지, 계정 삭제 replay/잔여 데이터 검증, 외부 권한 부여 금지를 검사합니다.
- 합성 DB 검사 `test/db/commerce_private_claim_finalizer_delete_v1_smoke.sql`: 독립 두 Subject, 각각 구매 Intent/Claim을 생성하고 일반 삭제 거부, 정확한 삭제 Subject의 Claim만 제거, 다른 계정 Claim 및 구매 증거 보존 확인. 격리 PGlite 0.5.13 / PostgreSQL 18.6 WASM에서 **PASS**.
- **검증하지 않은 부분:** 실제 전체 계정 삭제 함수 실행, 전체 PostgreSQL 17 마이그레이션/FK graph/트리거, 삭제 후 복원 데이터 재조정과 운영 권한, 일반 소비자 청약철회 접수·확인. 추가 검증 전까지 `claimDispositionGraphIntegrated=false`와 **비배포 상태를 그대로 유지**합니다.
- 정책 자체는 이미 결정됐으며 사용자 재승인은 필요하지 않습니다. 기존 Commerce P5Y 증거 테이블이나 Reader 공개 정책은 변경하지 않습니다.
