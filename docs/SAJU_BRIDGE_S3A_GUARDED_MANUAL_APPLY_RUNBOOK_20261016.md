# 명하 사주 브릿지 S3A — 단회 비활성 DB 객체 적용 절차

> **현재: OWNER_CONDITIONALLY_APPROVED / EXECUTION=HOLD.** `saju_bridge_private`의 비활성 객체 생성만 허가됨. Owner의 승인으로 인증·Reading·허가증 발급·기능 공개·결제·고격리 R01–R14 검증이 되었다고 해석하지 않는다.

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
6. 관리자 read-only preflight: DB/PG17/SSL, S3A 객체·역할 충돌 0개, remote migration 총 173건/latest timestamp `20261008090417`, `1540`·`1730` 미적용. 하나라도 다르면 **HOLD**.

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
