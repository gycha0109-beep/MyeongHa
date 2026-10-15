# D3e22 — 실제 배포 계정 확인 한계 및 구매·취소 회귀 검증

작성: 2026-10-15. **운영 배포·권한 변경: HOLD**.

## 1. 실제 서버의 계정·키 사용 확인

- Vercel의 myeongha 프로젝트는 명하 GitHub 저장소에 연결되어 있고, Production 배포 상태가 READY인 프로젝트 메타데이터를 확인했다.
- 그러나 환경변수 목록은 **403 Forbidden**이므로 운영·미리보기·개발 환경에서 실제 사용되는 데이터베이스 연결 URL, DB 로그인명, Supabase API 키 유형, 관리자·서비스키 주입 범위를 읽지 못했다. 값을 요구하거나 복호화/우회하지 않았다.
- 소스 코드상 일반 API는 MYEONGHA_DATABASE_PRINCIPAL 전용 계정과 TLS peer 검증을 요구하며 매 연결에서 DB current_user 및 myeongha_api_executor 회원권을 검사한다. 관리용 Supabase 마이그레이션은 별도 관리자 연결 설정으로 구분된다. **설계에 대한 확인이지 배포 실제 비밀의 확인이 아니다.**
- 연결된 Supabase MyengHa의 읽기 전용 권한 실사에서는 myeongha_runtime, myeongha_worker_runtime가 별도 LOGIN으로 존재하고 직접 entitlement_events 쓰기·보호 효과 함수 실행 권한이 없음을 확인했다. 공용 service_role의 원장 DML 권한과 postgres 관리자 권한은 여전히 존재한다.
- 운영자는 Vercel의 Production/Preview/Development 환경변수 **이름·적용 범위·유형/사용처** 및 실제 DB current_user 증빙만 접근 통제된 내부 증거로 확인해야 한다. **비밀 값·암호·토큰 원문은 채팅이나 PR에 기록하지 않는다.** 이번 검사의 환경 접근권한 부족은 그대로 미해결이다.

## 2. 사용자 기능 보존을 위한 확장 시험

test/db/official_reader_d3e22_service_role_purchase_cancel_regressions.sh 와 test/db/run_authority_core.sh 에서 아래 세 가지 기존 시험을 **각기 다른 폐기형 로컬 PostgreSQL 복제 DB**로 실행하도록 한다.

| 분리된 시험 | 기존에 검증하던 기능 | 이번에 추가하는 조건 |
|---|---|---|
| purchase | 구매 내역·결제 이벤트·이용권 출처 일치 여부, 불일치/순서 역전 보류, 승인 없는 원장 변동 없음 | 시험 DB의 service_role entitlement_events 직접 INSERT/UPDATE/DELETE 차단 후 원래 SQL 시험 전체 실행 |
| reviewed_cancel | 구매 사실과 운영 승인 확인 후 원래 비공개 1건 취소, 승인 누락·다른 고객·재실행 차단, 원자적 취소 처리 | 동일한 공용 DML 차단 상태에서 원래 비공개 취소 시험 전체 실행 |
| atomic_batch | 가짜 구매 이용권 2건의 동시 취소, 도중 오류 전체 롤백·중복 방지·기록 정합성 | 동일한 공용 DML 차단 상태에서 원래 비공개 다중 취소 시험 전체 실행 |

동작 순서:

1. CI=true, PGHOST=localhost, PGUSER=postgres, 시험별 고정 PGDATABASE 일치를 요구한다.
2. **폐기형 DB에서만** 실제 연결 DB에서 관찰한 service_role의 entitlement_events SELECT/INSERT/UPDATE/DELETE 권한을 시험상 재현한다.
3. 같은 시험 DB에서만 INSERT/UPDATE/DELETE를 REVOKE하며 SELECT는 유지한다.
4. 서비스 역할을 가장한 실제 별도 SQL 세션에서 3가지 직접 쓰기 시도가 SQLSTATE 42501로 모두 거부되는지 검사한다.
5. 기존 구매·취소 SQL 테스트를 **수정하지 않은 상태로** 실행하고, 각 시나리오의 성공 문구와 시험 후 공용 계정 권한 유지 여부를 검증한다.
6. 단일 재사용 DB가 아닌 서로 독립된 복제본에서 동작한다. 시험 종료 시 복제본은 제거된다.

**범위 한계:** 기존 비공개 구매·취소 시험들은 CI의 가짜 결제 사실·가짜 Subject·가짜 Provider 이벤트를 이용하며, 그 경로에서는 DB 소유자 권한을 사용한다. 이 시험의 성공은 그 **시험용 소유자 경로**가 제한된 공용 service_role의 직접 쓰기 권한에 의존하지 않았음을 의미한다. 실제 고객 구매 API, 결제사의 LIVE 환불, 비밀키 수탁, PortOne 운영 콜백, Supabase REST(Data API), 분산 운영 Worker, 보안관리자 수동 SQL의 무결성을 입증하지 않는다.

## 3. 운영 전환 금지 조건

- Vercel 운영 환경변수의 **승인된 읽기 전용 메타데이터 확인** 전에는 배포 계정/키가 안전하다고 판정하지 않는다.
- service_role 권한 축소가 다른 상품·외부 API·사용자 기능·사후 복구에 영향을 주지 않는지 DBA/상거래/운영 측에서 별도 증거와 원복 계획을 확인한다.
- 실제 Refund/Reader 이용권 회수는 독립 서명 승인, 시점 잠금, 별도 계정, DB owner 우회 통제와 일관성 확인까지 요구한다.
- 운영 DB에 GRANT/REVOKE 없음. 결제사 환불 없음. 고객 데이터 접근 없음. 본 작업은 Draft 상태이며 승인 없는 병합·배포 없음.

**결론: 이번 시험은 공용 계정의 직접 쓰기 권한을 줄일 수 있는지에 대한 추가 안전성 증거만 마련하며, 실제 운영 변경은 계속 HOLD이다.**
