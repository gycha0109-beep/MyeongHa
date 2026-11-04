# Commerce Payment — Reader 공통 S1 잠금 선행·정확한 구매권 회수 사전검증

**개발 로드맵:** docs/operations/COMMERCE_PAYMENT_TRACK_STATUS_IMPLEMENTATION_ENDPOINTS_20261030.md 6절, 단계 2(정확한 Reader 구매권 회수 연결). 개발 전용/운영 미활성.

## 기존 구현에서 확인한 누락

기존 commerce-exact-reader-revoke-cas-locked-preflight-v1.mjs는 VERIFIED Provider Event→Receipt→정확한 Reader Grant 행을 FOR UPDATE로 잠그고 revision/last_provider_ordering_key를 비교했지만, 공식 Reader S1 범위 잠금을 먼저 확보하지 않았습니다. 기존 1740/1770/1820 Reader S2 writer와 다른 순서로 잠그면 경쟁 환경에서 최종 권한 변경과 같은 선형화 경계를 관찰했다고 볼 수 없습니다.

## 변경

- 정식 Provider Event·원본 Receipt·구매 Grant·Reader 접근 기록의 **DB 연결에서만** 해당 구매의 Subject×Reading×Reader 잠금 범위를 조회합니다. 사용자/웹훅이 Reader나 Subject를 선택하지 못합니다.
- 기존 1770 Writer와 같은 데이터베이스 정렬 순서로 각각 internal_acquire_official_reader_scope_lock_v1을 먼저 호출합니다. Reader 잠금 함수가 요구하는 READ COMMITTED를 사용하며, 제한 시간·잠금 대기 제한 후 종료 시 모든 잠금을 ROLLBACK합니다.
- 잠금 대기 후 독립 쿼리에서 범위를 다시 조회해 삽입·삭제·결속 변경을 감지합니다. 이후 원본 Provider Event→정확한 Reader Grant 행 순서로 잠그고 CAS(revision + 마지막 Provider key)를 검증합니다. 행 잠금 뒤에도 같은 범위를 다시 확인합니다.
- 구매 Scope가 없거나, 64개를 초과하거나, 원본 Receipt/Reader 범위가 변경되거나, CAS가 달라지면 **보류**합니다. 여러 구매권이 존재해도 이벤트가 가리키는 원본 Receipt의 구매 Grant만 검사합니다.
- 이번 사전검사는 S1 잠금 자체를 관측했더라도 Reader의 최종 T2 운영 잠금·Provider 최신 순서·법적 환불 결론·실제 Entitlement Effect 권한을 주장하지 않습니다. sourceOrderClassification은 신뢰 가능한 새로운 비교기가 없으면 INCOMPARABLE이며, 모든 writer 실행 허가는 false입니다.

## 테스트·미완료

- 기존 test/commerce-exact-reader-revoke-cas-locked-preflight-v1.test.mjs 및 test/commerce-current-cancel-set-reader-locked-cas-review-v1.test.mjs에서 S1 잠금 선행, 범위 변경, 원본 Receipt 불일치, 다른 구매권 보호, 잠금/버전 검사와 최종 ROLLBACK을 확인합니다.
- 소유자 테스트 통과와 PostgreSQL 17 실제 DB 경합 검증 근거 없이 실제 Reader T2 선형화 완료라고 선언하지 않습니다. 공식 Reader 기존 비공개 함수 ACL을 변경하지 않습니다.
- 운영 DB·공개 라우트·판매·PG 환불 POST·Entitlement Writer 호출·LIVE는 변경하지 않았습니다.

참고: PostgreSQL 17 Explicit Locking — https://www.postgresql.org/docs/17/explicit-locking.html
