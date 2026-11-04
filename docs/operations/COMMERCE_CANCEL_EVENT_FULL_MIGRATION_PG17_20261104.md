# Commerce Payment — 원본 Reader 구매권과 PortOne 취소 이벤트 저장 후보의 PG17 통합 검증

**로드맵:** docs/operations/COMMERCE_PAYMENT_TRACK_STATUS_IMPLEMENTATION_ENDPOINTS_20261030.md 6절 1번(기존 Provider Event에 취소 기록 결속).

## 추가한 격리 검증

- PostgreSQL 17 CI 전용 임시 데이터베이스에서 **기존 전체 마이그레이션**과 공식 Reader B2/B3 독립 구매 Fixture를 그대로 사용합니다.
- 이전에 독립 간이 스키마만 검증한 docs/operations/candidates/commerce_portone_cancellation_event_persistence_v1.sql를 **트랜잭션 내부에서만** CREATE 하고 최종 ROLLBACK합니다. 운영 마이그레이션에 추가하지 않습니다.
- 정확한 Reader B2의 검증된 PortOne Production Receipt, 결제 Attempt, 구매 Intent를 이용해 기존 commerce_provider_events 원장에 한 번 기록한 다음, 동일 이벤트가 동일 ID로 replay되며 중복 기록되지 않는지 확인합니다.
- 같은 webhook ID에 다른 서명·다른 Reader 구매를 결속하는 시도와 대기 중 취소의 확정 저장을 거부해야 합니다. Reader B3의 독립 구매권, B2/B3 Entitlement revision, 기존 결제 영수증 및 Entitlement Effects는 변하지 않아야 합니다.
- `test/db/commerce_portone_cancellation_persist_full_pg17.sh`는 GitHub Actions의 `postgres17`, loopback 호스트, 고정 포트, `myeongha_ci_case_숫자` 데이터베이스, 실제 서버 버전 17만 허용합니다. 별도 승인 없이 어떤 다른 DB도 사용하지 않습니다.

## 확인 범위와 아직 미완료인 것

- `test/db/commerce_portone_cancellation_persist_full_pg17.sql`과 기존 DB CI에서 **실제 통과 결과가 나와야** 해당 기존 마이그레이션 호환성을 증명합니다.
- 동시 연결 두 세션에서 동일한 webhook이 겹쳐 도착하는 경쟁, 신뢰 가능한 Provider NEWER/STALE 키, 법적 전달 사실, Reader R2/T2의 실제 최종 공유 잠금과 권한 회수 writer는 이 변경으로 완료되지 않습니다.
- 전액 취소 확인·서버 읽기 API와 이 후보 SQL의 운영 연결은 여전히 비활성입니다. refund POST, LIVE 결제, 운영 DB, 운영 마이그레이션, 소비자에게 반환되는 확정 판정은 변경하지 않습니다.
