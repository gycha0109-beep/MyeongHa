# 세연 실제 원격 복구본 — 격리 PostgreSQL 17 재현 절차 (준비 단계)

Watchtower-Track: ops
관련: #1887, #1866, PR #1921

## 현재 확보한 읽기 전용 원격 사실 (2026-10-11 KST)

- Supabase 프로젝트: `cnsfpcdiyofqvhpcegfc`; PostgreSQL `17.6`.
- `supabase_migrations.schema_migrations` 버전 `20261008090417` / 이름 `seyeon_runtime_1460_1510_acl_before_owner_recovery`.
- `statements` 1개, **104,021 UTF-8 bytes**, SHA-256 `4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894`.
- SQL 시작은 선행 함수/역할/후행 marker 상태를 검사하는 전용 preflight입니다. 끝에는 1460~1510 **6개 marker INSERT + ACL postcheck**가 포함됩니다.
- 원격 DB에 SQL 원문 재실행·DDL/DML·migration repair·이력 변경은 **전혀 수행하지 않았습니다**.

## 격리 재현 스크립트

`test/db/seyeon_remote_bundle_pg17_isolated.sh`는 승인된 경로에서 원격 이력의 **정확한 복사본을 안전한 임시 파일**로 전달받을 때만 실행됩니다. 기존 PR #1921의 로컬 원본 SQL 합성 테스트와 다르게 원격 복구본 원문을 입력받으며, 해시/길이/로컬 접속조건/PG17을 강제합니다.

1. CI의 `localhost` PostgreSQL 17과 별도의 임시 DB를 사용합니다.
2. 0010~1390을 설치하고 임시 migration history 테이블을 만듭니다.
3. 1400~1450과 후행 1460~1510이 없는 조건에서 원격 복구 SQL을 **격리 DB에서만 단일 트랜잭션으로 실행**합니다.
4. SQL 내 자체 preflight, 6개 이력 marker, 주요 후행 함수의 ACL을 확인합니다.
5. 후행 RPC 정의+Owner+ACL+보안 속성 지문을 저장하고 1400~1450 여섯 파일을 별도 단일 트랜잭션으로 실행합니다.
6. 조기 함수 11개와 후행 RPC 불변, ACL 불변, 관계 기록 0개를 검사한 뒤 임시 DB와 로그를 삭제합니다.

예시 (기밀 원문이 저장소 바깥의 임시 파일에 준비된 **승인된 격리 CI 환경만**):

```bash
CI=true PGHOST=localhost PGUSER=postgres PGDATABASE=myeongha_test \
  SEYEON_REMOTE_BUNDLE_FILE=/secure/tmp/incident-verified.sql \
  bash test/db/seyeon_remote_bundle_pg17_isolated.sh
```

기밀 SQL 원문·비밀번호를 GitHub 저장소, 이슈, CI 로그/Artifact에 올리지 않습니다. Production 자격증명이 있는 환경에서는 스크립트가 실행을 거부합니다. 파일을 확보할 때는 기존 읽기 전용 `seyeon-production-history-fingerprint-dryrun.sh`의 SHA 검증·HEX 수집 방식처럼 통제된 채널을 사용하고, 수집과 격리 실행은 **분리**합니다. 일반 Production 배포 워크플로에 연결하지 않습니다.

## 검증 단계 구분

- **구현 완료**: 실행 스크립트·입력 강제·격리 절차를 저장소에 추가.
- **정적/부정 테스트**: 잘못된 환경/SQL을 실제 PostgreSQL 연결 전에 차단하는지 검증.
- **원격본 PG17 실제 재현**: 정확한 104KB 파일이 승인된 격리 환경에 확보되고 스크립트를 실행해 `PASS_PG17_EXACT_BUNDLE`을 얻기 전까지 **미검증/HOLD**.
- **Production 적용**: 실제 데이터·RLS·Trigger/Constraint·1520~1640·DR 복원·Owner 승인 전까지 **HOLD**.

절대 이 경로가 원격 SQL 배포를 승인하거나 로컬 `supabase/migrations`에 복구 이력 SQL을 복제하는 명분이 되지 않습니다.
