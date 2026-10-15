# Reader 취소: 실제 DB 권한 실사와 운영 전환 조건 (2026-10-15)

**현황: HOLD — 출시 또는 실결제 처리 승인 아님**

## 1. 근거와 범위

2026-10-15 05:44:52 UTC(한국 14:44:52), 연결된 Supabase **MyengHa** PostgreSQL 17 프로젝트에 대해 읽기 전용 메타데이터를 조회했다. SQL 명령은 scripts/security/official_reader_cancel_live_cutover_readonly_audit.sql에 저장했고, 해당 연결에서 실행하여 응답 형식과 결과를 확인했다. 비교한 선행 작업은 Draft #2099, #2101, #2102, #2105, #2107이다.

주의: 연결 프로젝트가 실제 운영 API/Worker/결제 서비스에 어떻게 연결되는지는 DB 권한만으로 입증되지 않는다. 서버 비밀번호, API 키, 배포 환경변수, 고객 및 결제 원본 데이터는 **열람하거나 변경하지 않았다**. 앞선 CI 성공은 폐기 가능한 별도 시험 DB에만 귀속된다.

## 2. 실측 권한 판정

| 검사 | 실제 읽기 전용 관측 | 상태 |
|---|---|---|
| 취소 보호 함수 6개 | internal_apply_entitlement_effect_v1 **1개만 존재**. internal_private_cancel_review_v1, internal_private_cancel_commit_review_approval_v1, internal_apply_reviewed_official_reader_full_cancel_private_v1, internal_apply_official_reader_verified_cancel_batch_v1, internal_execute_official_reader_verified_cancel_v2 **5개 없음** | HOLD |
| 존재하는 이용권 효과 함수 | owner=postgres, SECURITY INVOKER. anon / authenticated / service_role / 일반 API와 Commerce 실행 계정은 유효 EXECUTE 없음 | 일부 직접 호출 차단 확인, owner 우회 별도 |
| 이용권 기록 테이블 | public.entitlement_events 존재. 일반 사용자와 API/Commerce 역할은 SELECT/INSERT/UPDATE/DELETE 권한 없음. **service_role은 네 가지 전부 허용** | **HOLD: 공용 서비스 경로에서 직접 수정 가능** |
| 관리자 역할 | postgres는 LOGIN 가능, 슈퍼유저는 아니지만 BYPASSRLS/CREATEROLE 보유. 이용권 기록 직접 변경 가능 | HOLD |
| 별도 취소 검증자·실행자·소유자 | myeongha_cancel_verifier, myeongha_cancel_executor, myeongha_cancel_owner는 **미존재**. 이름은 향후 설계 후보이지 승인된 실계정이 아님 | HOLD |
| Reader 취소 수신·검토·이중승인 테이블 | official_reader_portone_cancel_ingress_inbox_v1, official_reader_portone_cancel_ops_review_v1, official_reader_cancel_review_approval_v1 모두 **미존재** | HOLD |
| 관리자 실제 사용 | 한 시점에 postgres 연결 1개, authenticator 연결 2개 관측. 관리자 연결은 이번 메타데이터 조회 자체일 수 있음 | 관리자 자격증명 사용 이력·보관 위치 입증 불가 |
| 선행 시험 | CI #2107의 NOLOGIN 가상 소유자·검증/실행 역할 분리, 1회 승인·HALT 테스트 통과 | 운영 DB 권한 증명이 아님 |

**중요:** service_role이 NOLOGIN인 것과 Supabase 서버 API에서 service_role로 동작할 수 있다는 사실은 다르다. 서비스 키 사용과 테이블 권한을 별도 조사해야 한다. 함수 EXECUTE 차단만으로 entitlement_events에 대한 직접 INSERT/UPDATE/DELETE가 차단된 것은 아니다.

## 3. 운영 전환에 필요한 선행 조건 — 하나라도 미충족이면 HOLD

1. **환경과 승인 범위:** 연결된 Supabase 프로젝트와 실제 배포 API/Worker/Commerce의 연결 대상 식별자를 운영자가 독립 대조한다. 별도 비식별·폐기형 PostgreSQL 복제 DB를 준비한다.
2. **관리자 계정 분리:** 운영 API에 postgres 관리자 자격증명이나 service_role 비밀이 없는지 실제 배포 설정·비밀 저장소·연결 풀로 증명한다. DBA/마이그레이션 접근은 긴급 상황용 break-glass, 2인 승인, 비밀 회전 및 변경 감사를 요구한다. 이번 조회는 이 조건을 입증하지 못했다.
3. **실제 서비스 권한 분리:** 검증자, 실행자, NOLOGIN 객체 소유자를 최소권한으로 만들고 실제 프로세스/OS·DB 로그인 분리와 역할 회원권 부정을 증명한다. 일반 서비스 역할의 보호 함수 직접 실행 및 객체 소유자 전환은 허용하지 않는다. 기존 앱이 의존할 수 있으므로 허가 전에는 어떠한 운영 GRANT/REVOKE도 수행하지 않는다.
4. **서비스 계정의 이용권 직접 쓰기 제거 또는 동등한 격리:** 현재 service_role이 entitlement_events를 직접 INSERT/UPDATE/DELETE 할 수 있다. 이 우회 경로를 막는 데이터 경계 또는 해당 키의 독립 격리와 실접속 부정 증거 없이는 취소 게이트를 유일한 실행 통로라고 주장할 수 없다.
5. **누락된 취소 데이터 구조 배포 승인:** 5개 함수와 3개 테이블의 운영 필요성, 기존 마이그레이션 적용 순서, 충돌·롤백 방법을 담당자가 승인한다. 실서비스 상태가 시험 DB와 다른 동안 단순 파일 배포/자동 마이그레이션 금지.
6. **구형 관리자 SQL 우회 통제:** 원본 1080/1850/1880과 D3e6/8/1950의 기존 관리자 직접 호출, 우회 경로, 객체 소유자 직접 SQL 권한과 실행 감사를 모두 정리한다. NOLOGIN만으로 PostgreSQL 관리자 또는 최고권한 보유자의 우회를 없앨 수 없다.
7. **취소·이용권 처리의 원자적 신뢰:** 독립된 두 사람의 서명 승인, 복원 방지 가능한 정책 버전 기록, 실제 DB 최종 점검과 Reader 이용권 회수를 하나의 권한·트랜잭션 경계에서 검증한다. 서버 측 PortOne 취소 사실 확인, 증빙과 금액 정합성, 중복·동시·재실행·긴급중단, 결제 취소/재열람 차단·복원을 실결제 없이 먼저 시험한다.
8. **독립 안전·운영 승인:** DB 운영, 보안, 상거래, 법무, 개인정보, 운영 담당자의 증거별 승인과 장애 복구·감사·고객 통지 정책이 준비된 뒤에만 별도의 운영 전환을 논의한다.

## 4. 재검증 및 중단 규칙

- 읽기 전용 DB 권한 점검: scripts/security/official_reader_cancel_live_cutover_readonly_audit.sql
- 누락·우회 자동 HOLD 판정: test/support/private-official-reader-cancel-cutover-evidence-v1.ts
- 시험: test/official-reader-portone-cancel-private-live-cutover-audit-v1.test.ts
- 판정 코드 출력은 **releaseAuthorized=false 고정**이다. 서명되지 않은 메타데이터 파일 자체를 인증이나 배포 허가로 사용할 수 없다.
- 이 PR은 SQL 권한 변경·운영 DB 쓰기·결제사 호출·개인정보 접근·환불·이용권 회수·병합·배포를 수행하지 않는다.
- 실제 운영 계정의 자격증명·비밀 회전·배포 환경 확인이 불가하면 **미확인**으로 보고한다. DB 조회 결과가 정상이어도 출시 승인은 별도 필요하다.

**결론: 보안 실사 일부 완료, 운영 관리자/공용 서비스 계정에 대한 우회 통제·실제 취소 구조 전환은 미완료.**
