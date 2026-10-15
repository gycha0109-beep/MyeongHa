# D3e23 — 명하 핵심 7개 테이블의 공용 서비스 계정 권한 실사 및 격리 시험

기록: **2026-10-15 15:52 KST** 기준 실제 Supabase MyengHa 프로젝트 PostgreSQL pg_catalog 읽기 전용 SQL 점검. **운영 권한 변경/실제 결제 기능 적용: HOLD**.

## 실제 연결 DB에서 확인한 사실

공용 `service_role`은 다음 **7개 테이블 모두**에서 SELECT/INSERT/UPDATE/DELETE 유효 권한을 가진다.

| 테이블 | 의미 | service_role 직접 추가/수정/삭제 |
|---|---|---|
| `public.commerce_account_links` | 결제사 계정 연결 | 가능 |
| `public.commerce_provider_events` | 결제사 이벤트 | 가능 |
| `public.commerce_receipts` | 구매·결제 영수증 | 가능 |
| `public.entitlement_events` | 이용권 상태 변경 기록 | 가능 |
| `public.entitlement_grants` | 이용권 권리 부여 | 가능 |
| `public.entitlements` | 현재 이용권 상태 | 가능 |
| `public.purchase_intents` | 구매 요청 | 가능 |

- 7개 모두 `postgres` 소유이며 RLS가 비활성화되어 있다. 일반 `anon`, `authenticated`, `myeongha_runtime`, `myeongha_worker_runtime`는 각 테이블 INSERT 권한이 없다.
- 이 사실은 **공용 역할 자체가 해당 테이블을 직접 수정할 수 있다는 뜻**이지만, 해당 테이블이 실제 Supabase REST API에 노출됐는지, 어떤 외부 사용자가 API 키에 접근 가능한지, 서비스가 이 경로를 사용 중인지 여부는 **별도 증거가 없어 미확인**이다.
- `commerce_payment_attempts` 등 다른 테이블은 같은 권한을 가졌다고 가정하지 않는다. 이번에 확인한 7개에 대해서만 확정한다.
- 관측 근거: `scripts/security/official_reader_cancel_seven_commerce_table_acl_readonly.sql`을 연결된 실제 DB에서 실행, `cutover_authorized=false`인 객체 7개를 반환. 실제 행이나 기밀은 읽지 않았다.

## 시험용 데이터베이스에서만 하는 변경

새 `test/db/official_reader_d3e23_seven_table_service_role_purchase_cancel_clone.sh`를 3개의 독립된 폐기형 PostgreSQL15 DB에서 실행한다. `CI=true`, `PGHOST=localhost`, `PGUSER=postgres`, 시험용 DB의 **정확한 이름**이 모두 맞을 때만 실행된다.

1. 실제 권한 관측을 **시험용 DB에만 재현**하고, 해당 DB의 `service_role` INSERT/UPDATE/DELETE 권한을 7개 테이블 모두에서 제거한다. SELECT는 유지한다.
2. `SET SESSION AUTHORIZATION service_role`인 독립 SQL 세션에서 각 테이블 INSERT/UPDATE/DELETE를 실행해 **각 시험당 21개의 실제 SQLSTATE 42501 거부**를 요구한다. 다른 역할의 쓰기 권한을 변경하지 않는다.
3. 기존 구매 사실/영수증 출처 일치 검사, 독립 승인 후 비공개 취소 및 중복 취소 방지, 2건의 동시 취소와 전체 롤백 검증을 **변경하지 않은 원본 스크립트**로 각각 재실행한다.
4. 각 시험 뒤 7개 테이블의 공용 계정 직접 쓰기 금지 및 읽기 유지 여부를 다시 확인한다. 3개 독립 시험이므로 모두 통과 시 63개 직접 SQL 쓰기 거부를 확인하게 된다.

**엄격한 한계:** 이 시험의 정상 구매/취소/복구 경로는 **가짜 구매·결제사 이벤트와 시험용 DB 소유자**가 사용되는 비공개 SQL이다. 실제 운영 API, 실결제 요청, 실제 PortOne 환불, Supabase REST/Data API, 새로운 키 수탁, 운영 Worker, 운영 복원, 권한 변경 시 다른 상품이 받을 영향은 검증하지 않는다. RLS 비활성화 자체를 이번 PR에서 변경하거나 운영 테이블 권한을 수정하지 않는다.

## 실제 운영 전환에 필요한 최소 확인

- Vercel `johnny-self/myeongha` 프로젝트의 환경변수 조회는 **403 Forbidden**이다. DB 비밀키의 **값**은 필요하지 않으며, **Production/Preview/Development 환경변수의 이름·적용 환경 및 권한 수준**을 확인할 수 있는 접근만 필요하다.
- 특히 `MYEONGHA_DATABASE_PRINCIPAL`의 실제 배포 계정이 전용 `myeongha_runtime`인지, API/Worker가 `postgres`나 공용 `service_role` 키를 보유하는지, `MYEONGHA_SUPABASE_API_KEY`가 일반 공개/비밀/관리자 키 중 무엇인지 메타데이터로 확인해야 한다.
- 운영 DBA와 Commerce 담당자가 모든 결제·조회·취소·복구 의존성을 확인하고, 적절한 데이터 경계/키 격리/롤백·사용처 감사·고객 영향 검증 후 승인해야 한다.
- **운영 REVOKE/GRANT, RLS 활성화, 키 변경, 실제 결제·환불, PR 병합/배포는 별도 명시적 승인까지 전부 금지.**

**현재 판정: 실측한 보안 위험 7개, 권한 격리의 시험 범위 확대. 운영 위험 해결 전까지 HOLD.**
