# 명하 사주 브릿지 S3A — 단회 비활성 DB 객체 적용 절차

> **현재: OWNER_CONDITIONALLY_APPROVED / EXECUTION=HOLD.** `saju_bridge_private`의 비활성 객체 생성만 허가됨. Owner의 승인으로 인증·Reading·허가증 발급·기능 공개·결제·고격리 R01–R14 검증이 되었다고 해석하지 않는다.

## 2026-10-16 실행 차단: PostgreSQL 17 비슈퍼유저 자동 ADMIN 멤버십

- [수동 S3A 실행 #38846217625](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38846217625)는 최신 동일 백업/복원 검증, `verify-full` TLS, 정확한 SQL 해시와 트랜잭션 내 사전검사까지 통과한 후, **`saju-bridge-s3a-postcheck.sql:115`의 `S3A HOLD: unexpected explicit role membership`** 에서 `psql exit code 3`으로 중단됐다.
- 실행기는 단일 트랜잭션이므로 해당 실패는 전량 ROLLBACK. 2026-10-16 03:40 UTC 운영 DB 읽기 전용 재확인에서 스키마/테이블/역할/함수 모두 존재하지 않으며, 마이그레이션은 173건이다. 사주 브릿지 운영 변경은 0건.
- **재현된 원인:** 실제 Supabase Production `postgres`는 `rolsuper=false`, `rolcreaterole=true`인 PostgreSQL 17 계정이다. PostgreSQL 16+에서는 비슈퍼유저 `CREATEROLE`이 새 역할을 생성하면 bootstrap superuser 명의의 `ADMIN TRUE / SET FALSE / INHERIT FALSE` 멤버십이 생성자에게 자동 부여된다. 비슈퍼유저 생성자가 `REVOKE ... FROM CURRENT_USER`를 해도 해당 bootstrap grant를 제거하지 못한다. [PostgreSQL 17 role-attributes 공식 문서](https://www.postgresql.org/docs/17/role-attributes.html).
- **승인된 불변 SQL과 보안 조건의 충돌:** 원본 `1730`은 `pg_auth_members` 대상 멤버십 **0건**을 필수로 요구하지만, 현재 Production 관리 접속자는 자동 멤버십을 회피/제거할 수 없다. 임의로 postcheck를 완화하거나 새 비밀값/슈퍼유저 우회를 마련하는 것은 Owner가 승인한 정확한 적용 범위를 벗어난다.
- 재발 방지를 위해 `saju-bridge-s3a-preflight.sql`에서 `rolsuper`를 확인하고 **객체 생성 전** `S3A HOLD: PostgreSQL 17 non-superuser role creator cannot satisfy zero-membership contract`를 발생시키도록 개선했다. 별도 disposable PG17 CI는 비슈퍼유저 CREATEROLE의 자동 bootstrap ADMIN 멤버십을 실증하고, 기존 SQL/후속 단계가 실행되기 전에 실패하며 객체가 남지 않는지 확인한다. 승인된 원본 `1730` 및 SHA256/Git blob, 최종 `postcheck`의 무멤버십 불변 조건은 변경하지 않는다.
- **즉시 중단:** 현행 프로덕션 계정으로 수동 워크플로를 **재실행하지 않는다**. 기존 백업/복원/시간 조건이 충족되어도 정상 적용이 불가능하다.
- **다음 Owner 승인 분기 필요:** (1) 원래 무멤버십 조건을 충족하는 공급자 지원·감사 가능한 역할 설치 권한 및 실행 경로를 별도 검증/승인하거나, (2) bootstrap 자동 관리자 멤버십 위험을 명시적으로 수용하고 역할 위임·재위임 공격면을 재설계한 새로운 권한 계약과 exact SQL/checks/증빙에 대해 별도 승인한다. 어느 경로도 이번 조건부 S3A 승인에 포함되지 않는다. 모든 제품 기능·발급·판매·운영 admission은 HOLD.

## 승인된 정확한 소스

- 기존 단일 Supabase `MyengHa` (`cnsfpcdiyofqvhpcegfc`), PostgreSQL major 17.
- 오직 `supabase/proposals/1730_saju_bridge_single_project_operator_permit_v1.sql`: Git blob `42e076799d627bc9e19fe28e1ad25b4548e05e61`, SHA-256 `900e0771915776b4a7c2a8b3cf60e24b83c79fcec14f27cf6356b44685b385e2`.
- 대상: 새 private schema 1개, 빈 테이블 2개, NOLOGIN·NOINHERIT·NOBYPASSRLS 역할 2개, private security-definer 함수 1개 및 해당 객체 RLS/ACL. 신규 로그인·secret·별도 인프라·permit 행 0개.
- **자동 배포 금지:** `supabase db push --include-all`, migration repair, `supabase/migrations/`로 이동, 기존 사용자/읽기/상거래 데이터 접근 금지.

## 운영자 실행 전 차단 조건

1. **당일 가장 최신 성공 백업**과 그 **동일 아티팩트의 새로운 격리 복원 성공**이 있어야 한다. 2026-10-16 확인 백업 [#38809117944](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38809117944), artifact `12006819539`가 2026-10-15 복원 성공 [#38731492782](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38731492782)의 원본 `38641851823`을 대체했다. **#38731492782를 #38809117944의 복원 증빙으로 사용하면 안 된다.** 실행 시 또 다른 백업이 생기면 다시 최신 성공 백업을 기준으로 한다.
2. 운영자의 GitHub actor/triggering_actor와 stop_owner가 모두 `gycha0109-beep`이고, 기존 `production` environment 승인 보호를 통과해야 한다. 재실행(run_attempt > 1) 불가.
3. 최신 백업 성공 완료 30시간 이내, 그 백업의 격리 복원 성공 완료 4시간 이내. 둘의 run ID, project ref, source SHA, 체크섬, frontier `20261008090417`와 restore envelope를 독립 검증. `dr_ready=false`는 그대로 유지한다.
4. 실제 실행 시 GitHub `main`의 SHA 고정·현재 HEAD 일치, Owner가 지정한 UTC 실행 종료 시각이 **실행 시점으로부터 30분 이내**여야 한다.
5. 기존 Production secret 이름 `SUPABASE_DB_PASSWORD`, `SUPABASE_PRODUCTION_SESSION_POOLER_HOST`, `SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM`만 사용. 실행 세션에서 기존 `prepare-production-postgres-strict-libpq.mjs`로 CA 지문·접속 대상·호스트명을 검증하고, libpq `PGSSLMODE=verify-full` / `PGSSLROOTCERT`를 적용한다.
6. 관리자 read-only preflight: DB/PG17, 실제 libpq 클라이언트 `verify-full` TLS(고정 CA·호스트명 및 `psql \\conninfo`의 TLS handshake 확인), S3A 객체·역할 충돌 0개, remote migration 총 173건/latest timestamp `20261008090417`, `1540`·`1730` 미적용. 하나라도 다르면 **HOLD**. Supabase Session Pooler가 TLS를 종단할 수 있으므로 PostgreSQL 내부 `pg_stat_ssl`은 클라이언트→Pooler 암호화를 증명하는 지표가 아니다. 연결 확인 출력에는 호스트명·접속 문자열을 남기지 않는다.

## 실제 일회성 트리거

이 PR이 별도 CI와 통합 CI를 통과해 병합된 **후에만**, GitHub Actions의 **Saju Bridge S3A Guarded Dormant Objects** 워크플로를 `main`에서 **수동 실행**한다. 워크플로는 push/schedule 트리거가 없다.

- `confirm`: `APPLY_SAJU_BRIDGE_S3A_DORMANT_1730_ONLY`
- `backup_run_id`: 실행 직전 확인한 *최신 성공* Production Backup 실행 ID
- `restore_run_id`: 해당 백업을 복원한 새 성공 Isolated Restore 실행 ID
- `execution_window_end_utc`: 운영자가 지정한 향후 30분 이내의 UTC `YYYY-MM-DDTHH:MM:SSZ`
- `stop_owner`: `gycha0109-beep`
- `watchtower_track`: `saju-bridge`

코드가 보장하는 SQL 실행은 하나의 `psql --single-transaction`으로 `preflight.sql → 승인된 원문 1730 SQL → postcheck.sql`이다. SQL 오류·RLS/ACL·0행·역할 멤버십·migration mismatch 시 **COMMIT 전에 전체 ROLLBACK**. 직후 read-only postcheck를 재실행한다.

## 복구 및 차단

- 미실행·취소·preflight 실패는 운영 DB DDL **0건**.
- COMMIT 여부 불명확·부분 검증 실패 시 **재실행·DROP/CASCADE·전체 복원 금지**. 읽기 전용 카탈로그로 실제 상태를 먼저 판정하고 별도 Owner 역변경 승인을 받는다.
- 성공 후에도 `stagingAdmission=HOLD`, `operationalEvidence=NOT_VERIFIED`, `canRunOnce/canExecute/canPublish/canSell=false`, R01–R14 NOT_VERIFIED.
