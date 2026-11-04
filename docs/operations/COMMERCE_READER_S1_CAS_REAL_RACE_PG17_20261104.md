# 결제 트랙 — Reader 공통 S1 잠금 / 정확한 구매권 CAS의 실제 PostgreSQL17 경합 검증

**승인된 로드맵:** docs/operations/COMMERCE_PAYMENT_TRACK_STATUS_IMPLEMENTATION_ENDPOINTS_20261030.md 6절의 2번. 개발 전용·실제 결제/운영 DB/LIVE 제외.

## 기존 증거와 이번 보강

- 기존 비운영 코드(PR #2953)는 원본 Provider Event→Receipt→정확한 Reader 구매 Grant를 DB에서 판정하고, 기존 Reader S1 공통 범위의 advisory 잠금을 Grant 행 잠금보다 먼저 확보합니다. Provider NEWER/STALE 비교기가 신뢰 가능하게 연결되지 않은 동안 회수 명령은 허용하지 않습니다.
- 기존 단일 연결 테스트는 잠금·CAS 호출 순서를 검증했지만 실제 다른 트랜잭션이 S1을 점유하는 순간의 대기와 **대기 후 변화한 구매권 버전**까지 입증하지 않았습니다.
- 이번 검사는 기존 `commerce-stored-portone-hmac-lineage-pg17` 케이스의 **이미 구성된 일회성 PostgreSQL 17 DB와 Reader B2/B3 원본 구매 fixture를 재사용**합니다. 동일 스키마 마이그레이션을 한 번 더 실행하는 신규 CI 케이스는 추가하지 않습니다.
- 별도 B2 PortOne 합성 취소 Provider Event는 실제 PG 연락이나 환불 명령이 아닌 격리 데이터입니다. 첫 번째 연결이 B2 Reader S1 잠금을 점유하고, 두 번째 연결의 사전 검사가 해당 잠금에서 기다리는 것을 PostgreSQL의 `pg_stat_activity`로 확인합니다.
- 잠금을 가진 기존 쓰기 참여 연결이 해당 B2 Grant의 revision만 증가시켜 COMMIT한 뒤, 사전 검사가 새 버전을 다시 확인하여 `grant_cas_snapshot_changed`로 **회수를 보류**해야 합니다. 다른 B3 구매권은 기존 상태·revision을 유지하고 B2 이벤트의 Entitlement Effect는 새로 기록되지 않아야 합니다.
- 권한 검토기의 실제 반환값은 법적 환불·Reader T2 회수·Provider 최신 순서 입증을 의미하지 않으며, 검증 중에도 실제 refund POST/DB 운영 연결/공개 라우트는 실행하지 않습니다.

## 완료 조건

- `test/db/commerce_reader_s1_cas_race_pg17.sh`, 합성 이벤트 seed SQL, Node PostgreSQL 2연결 경합 실행기가 기존 격리 CI 케이스에 연결됐습니다.
- 최종 통합 CI에서 해당 **실제 PostgreSQL 17 케이스가 PASS**해야만 이 경합 검증 완료를 선언합니다. 시뮬레이션/정적 단위 테스트만 통과하면 미완료입니다.
- 취소 Provider의 신뢰 가능한 NEWER/STALE 판정, 법적 전달 완료 입증, 기존 Entitlement Writer를 이용한 실제 정확한 회수, 전체 구매→취소→삭제 종단 간 검증은 다른 미완료 항목입니다.
