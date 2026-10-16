# D3e29 — Reader 취소: 간접 SECURITY DEFINER 우회·7테이블 ACL 원복 격리 검증

> 2026-10-16 KST. 부모 Draft [#2150](https://github.com/gycha0109-beep/MyeongHa/pull/2150) HEAD `d907f3f9e67278423747200ebe08ca555ee65c6e`. **Draft / HOLD / NO MERGE / NO LIVE CUTOVER.**

## 실측: 운영 PostgreSQL 17.6, pg_catalog 읽기 전용

새 `scripts/security/official_reader_cancel_service_role_definer_inventory_readonly.sql`을 연결된 `cnsfpcdiyofqvhpcegfc`에 SELECT-only 실행했습니다. 보호 테이블이나 고객/구매/영수증/비밀값을 열람하지 않았습니다.

- `public`의 `service_role` EXECUTE 가능한 **SECURITY DEFINER 함수·프로시저 0개**. 본문에 7개 테이블 이름이 없는 간접 호출, 동적 SQL, nested SQL까지 포함해 **entrypoint 자체**를 일괄 탐색한 것입니다.
- 다른 스키마: Supabase 관리 `vault.create_secret` / `vault.update_secret` **2개** (`supabase_admin` 소유). 이 운영관리 스키마의 EXECUTE는 기존 Supabase 역할 구조에 속하므로 앱 `public` Commerce 접근과 동일한 취약점으로 단정하지 않습니다. 반대로 이 2개가 Commerce에 영향 없다는 실행 경로/보관권한까지 증명한 것도 아닙니다.
- 7개 보호 테이블 사용자 정의 트리거 **13개**, 트리거 함수 SECURITY DEFINER 0개. 이 사실은 트리거·간접 호출 전체의 무해함을 의미하지 않습니다.
- 실제 `service_role`의 7개 테이블 직접 DML은 D3e28에서 실측한 대로 **아직 전부 유효**합니다. 그러므로 본 검사가 0개라고 운영 격리가 이루어진 것은 아닙니다.

## 신규 폐기형 PostgreSQL 부정·복구 검증

기존 D3e23의 구매·승인된 단건 전체 취소·2건 원자 취소용 **동일한 세 로컬 CI DB**에서만 실행합니다. `CI=true`, `PGHOST=localhost`, `PGUSER=postgres` 및 정확한 DB 이름 3종을 모두 요구합니다.

1. `test/db/official_reader_d3e29_indirect_definer_guard.sh`: PUBLIC EXECUTE 회수 뒤 `service_role`에게 **가짜 간접 함수 체인**과 **이름을 분할한 dynamic SQL**을 실행할 수 있는 SECURITY DEFINER 함수 두 개를 임시 등록합니다. 둘 다 절대 호출하지 않습니다. D3e27의 직접 테이블명 scanner는 0개, 새 전범위 카탈로그는 정확히 2개를 탐지해야 합니다. DROP 뒤 다시 0개와 카탈로그 동일성을 확인합니다.
2. `test/db/official_reader_d3e29_acl_snapshot_rollback.sh`: 각 보호 테이블의 `pg_class` ACL grantor/grantee/권한/GRANT OPTION, owner, RLS 및 `service_role` 실효 SELECT/DML을 날짜 없는 스냅샷으로 보관합니다. D3e23의 최초 운영 유사 권한 → `REVOKE` 상태 → 정상 구매·취소 회귀 이후 **GRANT 복원** → 다시 REVOKE 제한 상태까지 정확히 비교합니다. GRANT/REVOKE는 로컬 시험 DB에서만 실행합니다. 7개 합성 fixture 테이블 행 수가 변하지 않아야 합니다.
3. 기존 63건 직접 DML 거부, 3종 D3e27 가짜 함수 탐지, D3e28 실행 역할 부정 및 기존 구매·취소 본문은 그대로 유지합니다.

## 한계 / HOLD

이 검사에서의 `public` 0개는 일반 기능까지 모든 전이 호출·외부 관리자 직접 SQL·과거 배포 실행 이미지·PostgREST 공개 스키마 설정을 인증하지 않습니다. 별도 계정·진짜 키 관리·`vault` 정책·소유자 접근과 3세션 신규 Grant 경쟁/T2 read는 추후 독립 검증이 필요합니다. `service_role` 실제 운영 ACL 축소, 관리자 자격 변경, 마이그레이션 배포, 실결제·환불·회수·PR 병합/배포는 **전부 금지**입니다.

**검증 인정 조건:** 새 정확한 PR HEAD의 PostgreSQL authority core + Work Track commerce + Governance + Web PR 최종 성공을 확인할 때까지 오프라인 테스트 결과는 **미확정**. CI PASS는 운영 Cutover 허가가 아닙니다.
