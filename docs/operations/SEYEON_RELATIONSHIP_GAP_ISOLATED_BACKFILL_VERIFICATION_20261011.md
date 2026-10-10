# 세연 운영 관계 마이그레이션 역전 — 격리 PostgreSQL 검증

Watchtower-Track: ops
연계: #1887 / #1866. 범위는 **offline synthetic rehearsal**입니다.

## 관측된 Production 문제

- 선행 1400~1450 이력 6개 및 함수 11개 누락
- 후행 1460~1510 이력 및 런타임 존재
- 원격 전용 복구 SQL `20261008090417`는 저장소와 다르게 ACL을 pre-owner로 이동한 별도 incident bundle
- 운영 배포는 `HOLD_OUT_OF_ORDER_RELATIONSHIP_HISTORY`로 차단 중

## 이번 격리 검증

CI의 로컬 PostgreSQL(서비스 계정 `postgres`, DB `myeongha_test`)에서만 작동하는
`test/db/relationship_gap_retroactive_backfill_synthetic.sh`를 추가했습니다.

1. 전용 임시 DB 생성 및 Supabase auth fixture 설치.
2. 저장소의 초기 마이그레이션 0010~1390 설치.
3. 선행 1400~1450을 건너뛰고 **1460~1510을 먼저 적용**, 이전 관계 함수 11개가 실제로 없음을 확인.
4. 서버 전용 18개 함수의 definition·owner·ACL fingerprint 및 기존 ACL 감사 결과 확인.
5. 가짜 로컬 이력 테이블을 만들어 `HOLD_OUT_OF_ORDER_RELATIONSHIP_HISTORY` 재현.
6. 그 DB에서만 1400~1450 전체 SQL을 **단일 트랜잭션**으로 후행 적용. 하나라도 실패하면 롤백.
7. 함수 11개 설치, 기존 런타임 fingerprint 및 ACL 유지, 관계 기록 미생성 확인.
8. 오직 테스트 DB의 가상 이력에서만 Preliminary History Check로 변화하는지 확인.
9. CI 종료 시 임시 DB 삭제.

운영 호스트와 SQL 실행 혼동을 막기 위해 `CI=true`, `PGHOST=localhost`, `PGDATABASE=myeongha_test`, `PGUSER=postgres`를 모두 강제합니다. 실제 Production 비밀번호·실사용자 데이터·Remote SQL 원문은 사용하지 않습니다.

## 검증 결과의 한계

이 테스트는 **저장소 SQL 기준으로 SQL 순서 역전 자체가 로컬 PG에서 기술적으로 실행 가능한지** 검증합니다. 원격 104KB incident bundle의 정확한 재생, Supabase hosted role/Extension/배포 정책, 기존 실제 데이터의 제약·트리거·경합·복원, PG17 운영 Snapshot, 배포 승인 등을 증명하지 않습니다.

특히 1460~1510은 *실운영에서 pre-owner ACL을 조정한 별도 복구본*이라는 사실 때문에, 원본 local SQL 재실행이 통과했다고 Production 배포를 허가해서는 안 됩니다.

## 종료 조건

- CI synthetic rehearsal / 회귀 통과 시 **isolated synthetic PASS**로만 기록.
- 실제 운영 1400~1450 적용, `20261008090417` 이력 정합화, 1520~1640 및 DR/보안 G6는 DB Owner 승인 전까지 **HOLD**.
