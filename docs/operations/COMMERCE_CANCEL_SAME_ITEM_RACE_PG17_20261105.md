# Commerce Payment — 동시 취소 웹훅 원본 Receipt 잠금 실제 PostgreSQL 17 증명

기준: 2026-11-05, 개발 로드맵 6절 1번(기존 Provider Event 중복 방지), 운영 비활성.

## 구현 및 검증 범위
- 기존 전체 PostgreSQL 17 마이그레이션과 공식 독립 Reader B2/B3 구매 fixture를 재사용합니다. 신규 CI 데이터베이스 또는 새로운 Commerce 원장을 만들지 않습니다.
- 기존 SQL 단독 검증은 원래대로 BEGIN/ROLLBACK하고, 그다음 검토된 취소 이벤트 저장 SQL 후보만 일회용 CI DB에 재설치하여 **서로 다른 실제 PostgreSQL 연결 두 개**로 경합을 재현합니다.
- 첫 번째 연결이 B2의 원본 검증 Receipt를 잡고 취소 Event를 삽입한 상태에서, 두 번째 연결은 **같은 cancellationId HMAC, 다른 서명 웹훅 ID**로 취소를 저장하려 합니다. pg_stat_activity/pg_blocking_pids로 실제 행·트랜잭션 잠금 대기를 확인한 다음 첫 연결을 COMMIT합니다.
- 두 번째 연결은 같은 취소 항목의 중복 저장에 실패해야 합니다(23505 원본 Receipt 중복 충돌 또는 40001 직렬화 실패). 같은 웹훅 ID의 정확한 재전송은 기존 Event를 replay=true로 반환해야 합니다.
- 최종 B2 원본 Receipt에 같은 취소 항목의 Event 1건만 존재하는지, B2/B3 Grant의 상태·revision, Receipt 관계, Entitlement Effect 0건을 검증합니다.

## 안전 경계
- GitHub Actions, DB_SUITE=postgres17, localhost:5432, myeongha_ci_case_숫자 및 서버 버전 17을 모두 만족하지 않으면 **실행을 거부**합니다.
- 합성 데이터만 사용하며 PortOne 외부 API GET/POST, 운영 DB, public webhook, 실제 권한 발급·회수·Reader T2, LIVE 판매·환불은 전혀 실행하지 않습니다.
- 후보 SQL은 supabase/migrations/에 추가하지 않습니다. 일회용 CI DB 내에서만 설치되고 해당 케이스 종료 시 DB와 함께 제거됩니다.
- Provider NEWER/STALE 비교나 법적 전달 증명은 이 경합 검증이 해결하지 않습니다. 실제 PostgreSQL 17 통합 CI에서 스크립트 성공을 관측하기 전에는 완료로 주장하지 않습니다.
