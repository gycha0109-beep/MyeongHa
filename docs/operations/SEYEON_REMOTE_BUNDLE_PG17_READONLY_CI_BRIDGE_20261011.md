# 세연 정확본 104KB PostgreSQL 17 격리 재현 — 2026-10-11

Watchtower-Track: ops

## 목표 및 범위

PR #1921은 저장소 SQL의 역순 적용 가능성을 PostgreSQL 15 합성 환경에서 검증했고, PR #1926은 정확한 원격 이력 SQL이 **비공개 임시 파일에 이미 존재하는 경우**에만 PostgreSQL 17에서 재현할 수 있는 실행기를 제공했습니다.

이번 변경은 기존 `.github/workflows/production-seyeon-db-authority-audit.yml`의 **별도 격리 작업**에서 해당 임시 파일을 읽기 전용으로 직접 확보해 실행기를 연결합니다. 새로운 워크플로를 만들거나 운영 배포 워크플로를 수정하지 않습니다.

## 실행 및 안전 경계

- 기존 Production environment Secrets를 **원격 SQL 확보 단계에서만** 사용합니다. 프로젝트 ID `cnsfpcdiyofqvhpcegfc`, pooler 호스트명, 버전 `20261008090417`, 이름, statement 수 1개, UTF-8 104021 bytes, SHA-256 `4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894`를 검사합니다.
- PostgreSQL 연결은 `default_transaction_read_only=on`으로 시작하며 migration ledger에서 정확한 SQL 단일 본문을 **SELECT만** 수행합니다.
- SQL 원문은 `runner.temp`에 0600 권한으로 보관합니다. Actions 출력/Artifact/GitHub Issue/커밋에 원문·HEX·SQL 오류를 남기지 않습니다.
- **다음 실행 단계**에는 Production 비밀번호/호스트 환경변수가 제공되지 않습니다. 연결은 localhost:5432, `postgres:17.6` 서비스 DB로만 고정하고 테스트는 실패 시 즉시 중단합니다.
- 정확한 원격 SQL을 로컬 임시 DB에 재현한 뒤, 1400~1450을 단일 트랜잭션으로 후행 적용합니다. 선행 함수 11개, 1460~1510 RPC 지문/Owner/ACL 불변, 관계 테이블의 테스트 데이터 0건을 검사합니다.
- 테스트 후 원본 SQL 임시 파일과 로컬 오류 진단을 삭제합니다. 실제 운영 테이블/원격 migration marker에는 DDL·DML을 실행하지 않습니다.
- 자동 실행은 이 워크플로 파일 변경의 `main` push에서만 발생합니다. 그 외에는 **명시적인 수동 입력 `exact_remote_bundle_pg17=true`**가 있어야 실행됩니다. 일반 점검 수동 실행에서는 새 작업이 건너뛰어집니다.
- `supabase-production.yml` 및 `run-supabase-production-migrations.sh`와 연결하지 않으며 기존 1400~1450 배포 차단을 완화하지 않습니다.

## 검사 및 판정

- PR에서는 정적 보안 검사 및 일반/전체 Integration 검증을 수행합니다.
- 실제 원격 SQL 재현 증거는 병합 후 전용 `seyeon-exact-recovery-postgres17-isolated` 작업 로그의 `REMOTE_BUNDLE_SHA256_PASS`, `PASS_PG17_EXACT_BUNDLE`, `TEMP_PRIVATE_SQL_REMOVED`로 각각 판정합니다.
- 작업이 실패하면 실패 단계만 보고하고 SQL 전문은 공개하지 않습니다. 수집을 다시 실행할 때에도 원문을 Git 저장소에 기록하지 않습니다.
- **운영 배포는 독립적으로 계속 HOLD:** 데이터 존재 시 RLS/Trigger/Constraint, 1520~1640 의존성, 원격 이력 정합화, 실DB 백업/격리 복원, 운영 DB Owner + Security 승인 및 G0~G6 증거를 별도로 요구합니다.

## 현재 증거와 잔여 위험

- 실제 Production READ ONLY SQL에서 확인된 PG 17.6, 104021바이트, 정확한 SHA-256은 PR #1926까지의 검증 결과입니다.
- 본 파일의 신규 연결에 대한 CI/격리 실행 PASS는 **새 실행 로그가 확인된 후에만** 인정합니다.
- Production 자격증명이 있는 단계와 격리 실행 단계가 같은 작업용 Runner 파일시스템을 일시 공유하므로, Production Secret은 GitHub Environment 통제 및 보호된 main의 변경 검증을 거쳐서만 사용합니다.
- 한 번의 synthetic 재현으로 실제 Production 사용자 데이터/복원 가능성이나 G6를 증명하지 않습니다.
