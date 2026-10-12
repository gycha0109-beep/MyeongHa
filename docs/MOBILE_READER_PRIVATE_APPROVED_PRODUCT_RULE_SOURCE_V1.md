# D-01 일반 Standard Reader 정책 원본 — 비공개 구현 후보

> 상태: DRAFT / Product·DB·Reader 검토 필요 / 운영 정책 데이터 없음 / PUBLIC OFF
> 관련: #1828, #1979, #1981 / Watchtower-Track: applizing

## 이 변경에서 수행한 작업

- Forward-only migration 1730: Product ID, spec 버전, saju domain, 승인 revision, 적용 시각, 철회 이력을 각각 고정합니다.
- PostgreSQL private read: 현재 Product/spec가 활성이고 적용 기간 내 미철회 승인 revision이 정확히 하나일 때만 단일 규칙을 반환합니다. 0개 또는 중복이면 거절합니다.
- append-only 승인/철회 이력. Ordinary API executor, anon, authenticated, service_role은 테이블을 직접 읽거나 변경할 수 없습니다. 서버 executor에 비공개 함수 실행 권한만 허용합니다.
- 승인된 운영 정책 행은 하나도 추가하지 않았습니다. 테스트의 synthetic approval은 격리 PostgreSQL에만 존재합니다.
- 기존 Catalog/Unlock/Product scope와 동일 PostgreSQL 클라이언트로 호출하는 TypeScript read-only Port 추가. 실결제, Purchase Intent, v2 Binder, Grant, Reader public route 연결은 추가하지 않았습니다.

## 실제로 해결되지 않은 경계

1. approval_record_ref는 증빙 참조 필드이며 Product 운영 승인을 자동으로 증명하지 않습니다. 실제 승인 행을 생성하려면 Product·DB 소유자의 구체적 심사가 필요합니다.
2. migration 1220의 specialist can_initiate 검사는 변경하지 않았습니다. Standard Reader가 이 정책 조회에서 허용돼도 실제 결속은 계속 막힐 수 있습니다.
3. Premium 정책에 대한 specialist Capability, 공식 Reading 권한·현재 exact Grant·T2 환불 경합 검증은 별도 경계입니다.
4. DB 공통 잠금 #1983→#1984→#1987→#1993→#1996은 다른 트랙 소유입니다. 이 작업에 범위 잠금 코드는 포함하지 않았습니다.
5. #1960은 본선의 기존 1720과 충돌합니다. #1960 담당자의 migration 식별자 및 적용 이력 조정이 필요합니다.
6. 최신 운영 DR 준비 실패가 해소되기 전 운영 DB 적용·유료 공개·판매·환불 자동 거절 금지.

## 테스트

- test/postgres-standard-reader-approved-rule-v1.test.ts: 위조·잘못된 DB 응답·누락·중복·예외 거절
- test/db/standard_reader_approved_rule_real_pg.sql: 현재/과거 시간, 정책 중복, 개별 철회, 불변성, ACL, 비활성 Product
- test/postgres-standard-reader-rule-real-db.test.ts: 실제 PostgreSQL executor + TypeScript, Catalog/Unlock 연계
- test/db/standard_reader_product_policy_real_postgres.sh: 기존 격리 PostgreSQL 공통 경로에 포함

## 이후 순서

Product/DB 정책 기술 승인 → 승인 행의 감사 가능한 삽입 절차 → 공통 잠금 DB 트랙과 조율한 forward-only v2 binder 분기 → 실제 Grant/영수증/환불 경합 회귀 → 운영 배포 별도 승인.