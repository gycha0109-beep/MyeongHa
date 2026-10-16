# 사주 브릿지 S3A — PostgreSQL 17 무멤버십 유지 실행 경로 조사 (2026-10-16)

Watchtower-Track: saju-bridge

> **판정: PROVIDER_CAPABILITY_NOT_VERIFIED / PRODUCTION_HOLD.** Owner는 2026-10-16에 **옵션 1(기존 보안 규칙 유지)의 조사·설계·폐기형 테스트만 승인**했다. Production DDL/GRANT/역할 생성/계정 승격, 운영 워크플로 재시도, 신규 유료 자원, 역할 계약 변경, S4–S6 활성화는 **승인하지 않았다**.

> **2026-10-16 후속 확정 조사 — SELF_SERVICE_PATH_BLOCKED / NO_SUPPORT_CONTACT.** Owner는 공급자 문의/고객센터 연결을 하지 않겠다고 명시했다. 공개 Supabase/PostgreSQL 17 문서·PG 소스 및 **명하 현재 운영 DB의 읽기 전용 역할 카탈로그**를 직접 재확인했다. **현재 사용 가능한 고객 `postgres` 실행 경로에서는 원본 1730의 새 역할 2개와 `pg_auth_members=0` 조건을 동시에 충족할 수 없다.** 현재 연결에서 `supabase_admin`은 superuser지만 `postgres`가 멤버가 아니고 `SET ROLE`도 불가능하다. 문제를 은폐하는 `REVOKE`/설정/CLI 우회는 불가. 이 제한은 SQL 작성 미숙이 아니라 관리형 권한 경계다. 연락·티켓 생성은 후속 필수 작업이 **아니다**. **별도 Owner 승인 없는 운영 적용·보안 계약 변경 모두 HOLD**.

## 1. 확인한 사실과 원인

- Production PostgreSQL 17의 접속 주체 `postgres`는 `rolsuper=false`, `rolcreaterole=true`. [실패한 S3A 운영 실행](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38846217625)은 postcheck의 `S3A HOLD: unexpected explicit role membership`으로 종료했고, 단일 트랜잭션 전량 ROLLBACK 후 읽기 전용 재조회에서 브릿지 객체/역할 0개, migration 173개를 확인했다.
- PostgreSQL 17은 비슈퍼유저 `CREATEROLE`이 역할을 생성할 때 bootstrap superuser grantor의 `ADMIN TRUE / SET FALSE / INHERIT FALSE` 멤버십을 자동 부여한다. 해당 비슈퍼유저는 이 implicit bootstrap grant를 제거할 수 없다. `INHERIT FALSE`/`SET FALSE`만으로 보안 문제가 사라지는 것도 아니다. [PG17 Role Attributes](https://www.postgresql.org/docs/17/role-attributes.html), [PG17 pg_auth_members](https://www.postgresql.org/docs/17/catalog-pg-auth-members.html).
- Supabase 관리형 서비스는 기본 `postgres` 계정에 superuser 권한을 부여하지 않는다. Dashboard SQL Editor 역시 같은 `postgres`로 실행한다. **SQL Editor·새 연결 문자열·`SET ROLE`·마이그레이션 CLI로 우회할 수 있다고 간주하지 않는다.** [Supabase superuser 제한](https://supabase.com/docs/guides/database/postgres/roles-superuser), [SQL Editor 실행 계정](https://supabase.com/docs/guides/troubleshooting/tracking-postgres-role-activity-to-specific-dashboard-users-8d3715).
- **중요한 실행기 제약:** 현재 `saju-bridge-s3a-preflight.sql`은 `current_user='postgres'` **이면서** `rolsuper=true`를 요구한다. `run-saju-bridge-s3a-guarded-apply.sh`는 Supabase pooler 접속 계정을 `postgres.<project_ref>`로 고정했다. **별개인 공급자 superuser가 존재한다는 가정만으로 기존 실행 경로를 사용할 수 없다.** 실제 지원 경로 확인 후 exact executor/preflight/감사 계획을 새로 검토해야 한다.

## 2. 원칙을 지키는 가능한 경로와 판정

| 후보 | 무멤버십 계약 | 현재 결론 |
|---|---|---|
| 현재 Production `postgres`로 `1730` 재실행 | PostgreSQL 17에서 자동 ADMIN이 남아 불충족 | **불가능 / 재시도 금지** |
| `NOINHERIT`, `SET FALSE`, `REVOKE` 조합 / 임시 트랜잭션 | bootstrap grant가 잔존 | **불가능 / 우회 금지** |
| 공급자의 **공식 지원·감사 가능한 특권 실행**으로 새 역할 생성·소유권 전환 후 무멤버십 postcheck | **원리상 가능**. PG17 폐기형 superuser 양성 대조로만 확인 | **공급자 지원 여부 미확인 / 운영 불허** |
| 공급자가 두 역할만 사전 생성 | 기존 preflight가 선존재 역할을 차단하고, 이어지는 `GRANT role TO current_user`/owner transfer 권한도 별도 검증 필요 | **현재 승인 원문/실행기와 그대로 호환되지 않음** |
| auto-ADMIN 허용 또는 postcheck 조건 완화 | `pg_auth_members=0` 계약 위반 | **옵션 1에서 배제 / 신규 Owner 설계 승인 필요** |

권장 검토 순서: **(A)** Supabase Support에 *기존 관리형 Production 인스턴스에서* 공급자가 내부적으로 원자적·감사 가능한 privileged schema/role provisioning을 지원하는지 문의(비밀값/접근권한 요청 없음). **(B)** 가능하다는 공식 서면 답변에서 지원되는 executor identity, transaction, audit, 책임/복구 경계 확보. **(C)** 기존 `1730` SQL은 수정하지 않고 그 실행 경로용 별도 preflight/guarded entrypoint 필요성 판단·폐기형 부정 테스트. **(D)** 백업/복원/해시/고정 SHA/고립성, precommit zero-membership postcheck, 실패 시 전량 rollback, 외부 독립 read-only 카탈로그 검사 설계 검수. **(E)** 그다음 Owner에게 **정확한 Production 작업 계획을 다시 제시하여 별도 승인**. 지원 불가 답변이면 경로 1은 현재 Supabase 관리형 인스턴스에서 **HOLD**; 계약을 몰래 완화하거나 테스트 성과로 운영 허가를 승격하지 않는다.

특권 수행 주체의 admin/superuser 보유 자체를 없앨 수 있다는 뜻이 아니다. 여기서 계약상 목표는 **브릿지 NOLOGIN 두 역할에 대한 `pg_auth_members` 명시적 멤버십 0건, 고객 `postgres`의 bootstrap-admin 자동 부여 방지, 기존 권한/ACL/RLS 불변**이다. 공급자 특권 실행은 서비스 관리자 신뢰 경계 안의 *통제·감사 가능한* 예외여야 한다.

## 2A. 공급자 문의 없는 독립 검증 — 2026-10-16

실제 `cnsfpcdiyofqvhpcegfc` 운영 DB에 `SELECT`만 실행하여 확인:

| 실측 항목 | 관찰 |
|---|---|
| PostgreSQL | 17 (`server_version_num=170006`) |
| 현재 DB·실행자 | `postgres` / `postgres` |
| `postgres` | `rolsuper=false`, `rolcreaterole=true` |
| 내부 `supabase_admin` | `rolsuper=true`, `rolcanlogin=true`이나 현재 실행자는 `MEMBER=false`, `SET=false` |
| `createrole_self_grant` | 빈 문자열(추가 SET/INHERIT 자기 부여는 이미 꺼짐) |
| 브릿지 대상 역할 | 0개 |
| `saju_bridge_private` | 없음 |
| 기존 `myeongha_*` 역할 | 조회된 모든 역할이 이미 다른 역할의 멤버십을 보유함. 이름만 바꾸는 것은 기존 계약을 유지하는 해법이 아님 |

**추가 공식 근거:**

1. [PostgreSQL 17 Role Attributes](https://www.postgresql.org/docs/17/role-attributes.html): `CREATEROLE` 비슈퍼유저가 역할을 생성하면 부트스트랩 슈퍼유저가 `ADMIN TRUE / SET FALSE / INHERIT FALSE` 멤버십을 자동 부여한다. 이 역할 생성자는 해당 grant를 제거할 수 없다.
2. [PostgreSQL 역할 생성 구현](https://github.com/postgres/postgres/blob/master/src/backend/commands/user.c): `createrole_self_grant` 분기 **앞에** bootstrap-admin 자동 부여가 별도로 수행된다. 따라서 `SET createrole_self_grant = ''` 또는 `NOINHERIT` 변경은 무의미하다.
3. [Supabase 관리형 Superuser 제한](https://supabase.com/docs/guides/database/postgres/roles-superuser) 및 [Supabase 기본 역할](https://supabase.com/docs/guides/database/postgres/roles): 기본 `postgres`에 슈퍼유저 권한이 제공되지 않으며 `supabase_admin`은 내부 관리 역할.
4. [PostgreSQL 17 DROP ROLE / ALTER ROLE](https://www.postgresql.org/docs/17/sql-droprole.html): 기존 명하 서비스 역할을 제거하거나 재명명하는 식의 우회는 의존성과 기설정 멤버십을 안전하게 제거하지 못하며 운영 서비스에 영향이 있어 배제한다.

**결론 범위:** 현재 이용 가능한 관리형 연결과 원본 S3A SQL/무멤버십 불변식을 유지한 **셀프서비스 적용 방법 없음**. 별도 관리형 제공자 권한이나 관리형 서비스 외 PostgreSQL은 사용 가능하다고 *가정할 수 없고*, 이를 고객에게 요청하지 않는다. 이 결론이 모든 가능한 미래 공급자 서비스 기능의 부재를 증명하는 것은 아니다.

**현실적인 다음 설계 갈래:** 기존 보안 목표(공개 경로 없음, 서버 실행자 최소 권한, 실회원 데이터 미접근, 권한 상승 방지, 원자적 소비/감사, 실패 시 HOLD)를 유지하면서 **새 역할 생성이 필요 없는 별도 DB 보안 아키텍처**를 검토할 수는 있다. 그러나 `pg_auth_members=0`이란 **기존의 정확한 구현 불변식까지 그대로 충족한다고 주장하지 않는다**. 실효 권한·소유자·SECURITY DEFINER·로그인 분리 위험을 폐기형 PG17에서 입증해야 하고, 새 보안 계약/SQL/운영 실행에는 **새 Owner 승인**이 필요하다. 현재로서는 동등성 검증 전이므로 이 대안도 적용 금지.

## 3. 구현 및 테스트 경계

- **원본 불변**: `supabase/proposals/1730_saju_bridge_single_project_operator_permit_v1.sql` SHA-256 `900e0771915776b4a7c2a8b3cf60e24b83c79fcec14f27cf6356b44685b385e2` / git blob `42e076799d627bc9e19fe28e1ad25b4548e05e61`. `saju-bridge-s3a-postcheck.sql`의 정확한 `pg_auth_members=0` 불변 조건 유지.
- 기존 `test/operations/saju_bridge_s3a_nonsuper_pg17_guard.sh`는 비슈퍼유저 auto-ADMIN 및 DDL 전 HOLD를 검증한다.
- 신규 `test/operations/saju_bridge_s3a_privileged_pg17_control.sh`는 GitHub Actions 내부 **localhost·전용 고정 테스트 암호·PG17 superuser `postgres`** 조건에서만 실행한다. 같은 `preflight.sql → immutable 1730 → postcheck.sql`을 한 트랜잭션에서 성공시키고 **명시적 ROLLBACK** 후 대상 schema/role 0개 및 migration 173개를 검사한다. 운영 DB 접근 코드/환경변수/접속정보를 사용하지 않는다.
- 기존 `test/operations/saju_bridge_s3a_atomic_pg17.sh`의 ACL 실패 ROLLBACK 및 후속 검사는 그대로 유지한다.
- **양성 폐기형 CI는 Supabase 공급자의 서비스 제공 약속이나 운영 실행 권한을 증명하지 않는다.** 이 PR은 실제 배포 엔트리포인트, DB 권한, 인증, 사용자 경로, 상품/결제를 바꾸지 않는다.

## 4. 후속 조치 — 외부 문의 없음

- 고객센터/Support 문의, 메일, 티켓 생성, 내부 슈퍼유저 요청 **하지 않음**.
- 현행 S3A 실행 경로는 **SELF_SERVICE_PATH_BLOCKED**로 기록하고 추가 재실행 중지.
- 별도 비용/인프라가 없는 코드·권한·운영 데이터 흐름 중심으로 **역할 생성 없는 대체 설계의 실제 보안 동등성 검토**만 허용. 검증 전에는 이전 무멤버십 계약을 완화하거나 변경했다고 해석하지 않음.
- 모든 실제 운영 DB DDL·권한 변경은 사용자에게 정확한 변경 영향과 검증 결과를 제시한 뒤 **별도로 승인**받아야 함.

## 5. 불변 상태

```text
S3A_SELF_SERVICE_EXACT_PATH=BLOCKED
S3A_PROVIDER_SUPPORTED_PATH=NOT_VERIFIED
S3A_EXTERNAL_SUPPORT_CONTACT=NONE
S3A_PRODUCTION_APPLICATION=HOLD
OWNER_PRODUCTION_DB_APPROVAL=NOT_GRANTED
stagingAdmission=HOLD
operationalEvidence=NOT_VERIFIED
R01-R14=NOT_VERIFIED
canRunOnce=false
canExecute=false
canPublish=false
canSell=false
```
