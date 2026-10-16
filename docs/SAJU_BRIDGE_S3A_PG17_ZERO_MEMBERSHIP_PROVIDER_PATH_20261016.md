# 사주 브릿지 S3A — PostgreSQL 17 무멤버십 유지 실행 경로 조사 (2026-10-16)

Watchtower-Track: saju-bridge

> **판정: PROVIDER_CAPABILITY_NOT_VERIFIED / PRODUCTION_HOLD.** Owner는 2026-10-16에 **옵션 1(기존 보안 규칙 유지)의 조사·설계·폐기형 테스트만 승인**했다. Production DDL/GRANT/역할 생성/계정 승격, 운영 워크플로 재시도, 신규 유료 자원, 역할 계약 변경, S4–S6 활성화는 **승인하지 않았다**.

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

## 3. 구현 및 테스트 경계

- **원본 불변**: `supabase/proposals/1730_saju_bridge_single_project_operator_permit_v1.sql` SHA-256 `900e0771915776b4a7c2a8b3cf60e24b83c79fcec14f27cf6356b44685b385e2` / git blob `42e076799d627bc9e19fe28e1ad25b4548e05e61`. `saju-bridge-s3a-postcheck.sql`의 정확한 `pg_auth_members=0` 불변 조건 유지.
- 기존 `test/operations/saju_bridge_s3a_nonsuper_pg17_guard.sh`는 비슈퍼유저 auto-ADMIN 및 DDL 전 HOLD를 검증한다.
- 신규 `test/operations/saju_bridge_s3a_privileged_pg17_control.sh`는 GitHub Actions 내부 **localhost·전용 고정 테스트 암호·PG17 superuser `postgres`** 조건에서만 실행한다. 같은 `preflight.sql → immutable 1730 → postcheck.sql`을 한 트랜잭션에서 성공시키고 **명시적 ROLLBACK** 후 대상 schema/role 0개 및 migration 173개를 검사한다. 운영 DB 접근 코드/환경변수/접속정보를 사용하지 않는다.
- 기존 `test/operations/saju_bridge_s3a_atomic_pg17.sh`의 ACL 실패 ROLLBACK 및 후속 검사는 그대로 유지한다.
- **양성 폐기형 CI는 Supabase 공급자의 서비스 제공 약속이나 운영 실행 권한을 증명하지 않는다.** 이 PR은 실제 배포 엔트리포인트, DB 권한, 인증, 사용자 경로, 상품/결제를 바꾸지 않는다.

## 4. Supabase Support 확인 요청 초안 (정보 공개 최소화)

> **Subject:** PostgreSQL 17 CREATEROLE auto-ADMIN membership: supported managed provisioning with zero role memberships?
>
> Our hosted PostgreSQL 17 project uses the default non-superuser `postgres` with `CREATEROLE`. When it creates two `NOLOGIN NOINHERIT NOBYPASSRLS` roles inside an atomic schema migration, PostgreSQL adds bootstrap-superuser-granted `ADMIN TRUE / SET FALSE / INHERIT FALSE` memberships to the creator. Our pre-commit security check requires **zero rows in `pg_auth_members` for these roles**, so we rolled the migration back. We have not deployed the objects.
>
> Does Supabase offer a **supported, auditable, provider-executed** method to provision those roles and their owned private schema/function atomically, without leaving any memberships for either role or giving customer accounts superuser privileges? We are **not requesting superuser credentials or an unapproved production operation**. If supported, what executor-identity, change-review, transaction/rollback and audit controls apply? If unsupported, please confirm. We will independently review and authorize any production change.

**제출 여부: NOT_SUBMITTED.** 공식 문의는 사용자/계정 소유자의 별도 행동이며, 본 PR로 자동 문의·승인·운영 작업이 생성되지 않는다. 공개 이슈나 PR에는 비밀번호, DB 접속 문자열, CA PEM, 고객 데이터, 토큰을 게시하지 않는다.

## 5. 불변 상태

```text
S3A_PROVIDER_SUPPORTED_PATH=NOT_VERIFIED
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
