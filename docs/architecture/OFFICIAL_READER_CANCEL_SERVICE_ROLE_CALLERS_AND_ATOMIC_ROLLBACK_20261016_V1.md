# D3e28 — 운영 호출 역할·관리자 경로 실사 및 7개 Commerce 테이블 ACL 원자 전환/원복 시험

**2026-10-16 / Draft / HOLD / 운영 데이터 변경 없음**

## 1. 감사 기준과 증거 종류

- 명하 코드 기준: 부모 PR #2137 `241e48d649e98fccdd60215da01c5ca0b995bb4b`. `apps/api/src/production-user-data-runtime-config.ts`, `postgres-commerce-internal-execution.ts`, `production-account-deletion-worker-db-config.ts`, `node-postgres-account-deletion-worker-pool.ts`, `production-account-deletion-auth-admin-config.ts`, `official-reader-portone-cancel-private-execution-login-preflight-v1.ts`를 확인했다.
- 실제 Supabase MyengHa `cnsfpcdiyofqvhpcegfc`에서 `pg_roles`, `pg_has_role`, `pg_proc`, `has_function_privilege` 등 **메타데이터만 SELECT**했다. 실제 DB 로그인 비밀번호, 고객·상품·결제·환불 행 및 키 원문은 읽지 않았다.
- 현재 Vercel Production의 실제 실행 연결세션과 Webhook/Worker 실행 여부는 해당 DB 메타데이터만으로 확정할 수 없다. **코드 계약 + DB 역할 구성 일치**와 **실배포 실행 증명**은 별도다.

## 2. 실제 운영 DB 역할 구성

| 연결/실행 주체 | 소스 계약 | 실제 PostgreSQL 역할 근거 | 판정 범위 |
| --- | --- | --- | --- |
| 사용자 API 로그인 | `MYEONGHA_DATABASE_PRINCIPAL=myeongha_runtime` → 거래 내 `SET LOCAL ROLE myeongha_api_executor` | `myeongha_runtime`: LOGIN=true, BYPASSRLS=false; `myeongha_api_executor` 구성원=true | 코드/메타데이터 합치. **현재 배포의 세션이 그 계정인지 직접 검증한 것은 아님** |
| 결제 내부 검증 | 위 API 로그인 → `SET LOCAL ROLE myeongha_commerce_internal_executor` | `myeongha_runtime`의 Commerce executor 구성원=true | 좁은 실제 함수 권한을 통해 결제 검증 실행. 일반 테이블 직접 쓰기는 부여되지 않음 |
| 계정 삭제 Worker | `MYEONGHA_WORKER_DATABASE_PRINCIPAL=myeongha_worker_runtime` → `myeongha_system_executor` | `myeongha_worker_runtime`: LOGIN=true, BYPASSRLS=false, System executor 구성원=true; Commerce/API executor 구성원=false | 계정 삭제용 Worker 계약이며 **유료 Reader 취소 실행자로 자동 전용 불가** |
| Auth 계정 삭제 관리자 | `MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET`가 **일반** `MYEONGHA_SUPABASE_API_KEY`와 달라야 한다고 코드상 검증 | 별도 Supabase Auth Admin 키; 해당 키의 Vercel 실제 존재·등급·접근자는 미확인 | 정상 사용자 로그인용 `publishable` 키와 **별개의 보안 범위** |
| `service_role` | 일반 API나 Worker의 DB 연결 계정으로 사용하지 않음 | LOGIN=false / BYPASSRLS=true; 중요 7개 Commerce/이용권 테이블에 직접 DML 21종 가능 | **직접 권한 우회가 아직 열려 있음. RLS 활성화만으로 해소 불가** |
| `postgres` | 별도 마이그레이션·관리 경로 | LOGIN=true / BYPASSRLS=true / 7개 객체 owner. 역할 관리자 권한 존재 | 기존 DB owner를 SQL REVOKE로 봉쇄했다고 주장할 수 없음 |
| 전용 Reader 취소 실행자 | D3e9 등의 테스트는 **별도 격리 로그인에 대한 부정적 사전검사** | 실제 전용 `myeongha_cancel_executor` / owner 운영 구성은 이전 실사 기준 미구현 | 운영 취소 처리 권한을 승인할 증거 아님 |

**PostgreSQL 함수 카탈로그 분리** (테이블명을 직접 참조하는 함수 범위):
- `cmd_create_purchase_intent_v3`, `cmd_create_payment_attempt_v1` 등의 SECURITY DEFINER 함수는 `myeongha_api_executor`에 EXECUTE, `service_role`에는 EXECUTE 없음.
- `cmd_persist_verified_payment_evidence_v1` 및 Provider 검증 함수는 `myeongha_commerce_internal_executor`에 EXECUTE, `service_role`에는 EXECUTE 없음.
- `cmd_restore_entitlements_runtime_v1`은 비로그인 `myeongha_entitlement_restore_owner`의 DEFINER이며 `myeongha_api_executor`에 EXECUTE, `service_role`에는 EXECUTE 없음.
- `service_role`의 `cmd_create_purchase_intent_v1` 등 일부 **SECURITY INVOKER / trigger function EXECUTE**는 여전히 있음. 해당 함수 실행 권한은 직접 DML과 달리 별도로 감사해야 한다.
- 이 결과는 **함수명 직접 검색에 해당하는 1차 호출면**이며 다른 함수·동적 SQL·트리거의 전이적 그래프 전부를 증명하지 않는다.

## 3. 기존 시험에서 누락됐던 ACL 롤백 경계

D3e23에서는 폐기형 DB에서 7개 `service_role` 직접 INSERT/UPDATE/DELETE를 REVOKE 후 구매/취소 회귀를 검증했다. 하지만 **한 거래로 전체 7개가 변경되는지, 중간 실패 후 자동 복구되는지, 명시적 GRANT 원복 후 같은 축소를 재실행할 수 있는지**는 이전 테스트의 보증 범위 밖이었다.

신규 `test/db/official_reader_d3e28_seven_table_acl_atomic_rollback_clone.sh`는 오직 아래 세 DB에서만 실행 가능하다.
`myeongha_cancel_d3e23_purchase_ci`, `myeongha_cancel_d3e23_reviewed_ci`, `myeongha_cancel_d3e23_batch_ci`; 반드시 `CI=true`, `PGHOST=localhost`, `PGUSER=postgres`, 정확한 접속 DB명 검증이 선행된다.

시험 순서:

1. D3e23에서 이미 제한된 7개 테이블의 유효 직접 DML **0/21**, service SELECT 7개 유지, 일반 API·Worker·anon·authenticated 직접 INSERT 없음, 인접 테이블 2개 service_role 쓰기 없음, 9개 테이블의 실제 ACL 카탈로그 체크섬을 기억한다.
2. 기존 DML 21개 비트를 **테스트 DB에만** `GRANT`로 일괄 복구한다. 유효 DML 21/21이며 다른 역할 영향 없음이 확인되어야 한다.
3. `BEGIN` 안에서 7개 `REVOKE` 직후 의도적인 SQL 예외를 발생시켜 거래를 종료한다. **자동 롤백으로 이전 21/21 권한이 모두 유지**되어야 한다.
4. 동일한 7개 `REVOKE`를 다시 **한 트랜잭션**에서 실행하고, COMMIT 전 7개가 모두 쓰기 불가이며 SELECT만 가능한지 DO 가드로 검증한 뒤 COMMIT한다.
5. 유효 직접 DML 0/21, 다른 역할·인접 2개 변경 없음, 9개 테이블의 ACL 체크섬이 시작 시점과 정확히 동일해야 한다.
6. **그다음에만** 기존 구매 원본 / 유료 취소 원본 / 2건 원자 취소 원본을 변경 없이 각각 재실행한다. 시험 DB는 끝나면 자동 폐기된다.

**이 시험은 클론 SQL ACL의 되돌림 가능성을 확인하는 테스트일 뿐, 실결제 이후 이용권·고객 권리를 경제적/법적으로 복구한다는 뜻이 아닙니다.**

## 4. 운영 전환 및 복구 계획 — 여전히 실행 보류

운영 이행 전 DBA·보안·Commerce·운영 담당자가 전용 DB 로그인/Worker 실제 세션, 전체 PortOne/환불/취소/복원 기능, Data API 노출, 비상 통제자, 실사용 키 접근 이력과 호출 로그를 독립 확인하고 승인해야 한다.

정식 변경 시 운영자의 사전 ACL 스냅샷 및 `service_role`의 모든 전이/호출 경로 확인 → 변경 창 동안의 구매·취소 Writer 점검 → **별도 승인된 단일 SQL 트랜잭션**으로 7개 직접 DML 축소 → 그 자리에서 권한 검사 및 정상 기능 점검 → 문제가 있으면 **승인된 원래 ACL 스냅샷에 한해** 빠른 원복 → 외부 결제 처리·이용권 기록 불변 및 복구 절차 검증이 필요하다.

본 PR은 운영에 실행 가능한 미검증 REVOKE/GRANT 배포 스크립트를 만들지 않는다. 원복 판단에는 단순 SQL 권한 외에, 이미 진행된 외부 결제/환불 및 실서비스 이용권 상태의 보상이 필요한지 별도 고려해야 한다.

**GO/NO-GO: NO-GO. Draft 유지. Production REVOKE·GRANT / migration / merge / deploy / PortOne live call / 고객 데이터 변경 전부 금지.**
