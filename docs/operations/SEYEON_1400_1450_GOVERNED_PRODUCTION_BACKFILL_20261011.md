# 세연 1400~1450 운영 DB 복구 — 단일 범위·백업 복원 증거 필수

Watchtower-Track: ops

## 적용 의도

운영 프로젝트 `cnsfpcdiyofqvhpcegfc`의 관계 Event/Correction/Snapshot 런타임은 1400~1450 이력 6건과 함수 11개가 빠져 있습니다. 1460~1510 및 원격 incident bundle `20261008090417`은 실제 운영에 남아 있습니다. 2026-10-11 읽기 전용 조회에서는 **early 0/6·0/11, late 6/6·18/18, 관계 기록 0건, 대화 Attempt 7건**을 확인했습니다.

이 작업은 **1400~1450 여섯 개만** 하나의 PostgreSQL 트랜잭션으로 설치하고 동일 트랜잭션에서 해당 이력 6건을 등록하는 전용 복구 코드입니다. 기존 `20261008090417`의 SQL을 재실행하거나 삭제하지 않습니다. `1520~1640`, 일반 `--include-all` 배포, 세연 공개, 유료 AI, 보안 G6는 포함하지 않습니다.

## 실제 실행의 선행 조건

GitHub에서 보호된 `main` SHA와 일치하는 배포 실행에만 입장합니다. 기존 `.github/workflows/supabase-production.yml`의 **수동 실행만** 사용하며, 다음을 모두 충족하지 않으면 운영 SQL을 시작하지 않습니다.

1. 프로젝트/Session Pooler/관리자 역할과 검증된 TLS 루트 인증서. 일반 `sslmode=require` 대신 `verify-full` 필수.
2. 암호화된 `Production PostgreSQL Logical Backup` 작업의 성공 실행 ID. 백업 완료로부터 실행 시점 **4시간 이내**여야 합니다.
3. 바로 그 백업을 실제로 사용한 `PostgreSQL Isolated Restore Drill` 성공 실행 ID와 유효한 증거 파일. 복원은 백업 후 실행됐고 해당 파일의 `backup_workflow_run_id`, `backup_migration_frontier=20261008090417`, 프로젝트 ID, 소스 해시·무결성이 일치해야 합니다.
4. `SEYEON_SCOPE_CONFIRMATION=APPLY_RELATIONSHIP_1400_1450_ONLY` 정확한 수동 입력. GitHub Actions의 `production` 환경·현재 main SHA·동시 실행 잠금을 통과해야 합니다.
5. 마이그레이션 사전 검사에서 `HOLD_OUT_OF_ORDER_RELATIONSHIP_HISTORY`, 원격 복구 SQL 지문 104,021 bytes / SHA-256 `4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894`, 기존 owner roles·RPC 18개·기존 관계 레코드 0개를 확인해야 합니다.

수동 실행 값: `relationship_backfill_1400_1450=true`, `backup_run_id=<성공한 새 백업 ID>`, `restore_run_id=<그 백업으로 복원 성공한 ID>`, `scoped_confirmation=APPLY_RELATIONSHIP_1400_1450_ONLY`.

**절차상 중요한 제한:** 현 GitHub 커넥터는 워크플로 수동 실행을 지원하지 않습니다. 코드 병합이 곧 운영 적용은 아닙니다. 정상화되지 않은 백업/복원 증거로는 수동 실행해도 즉시 HOLD되도록 설계했습니다.

## 실제 실행 방식

전용 스크립트 `scripts/operations/seyeon-production-relationship-backfill-guarded.sh`가 조건을 검증한 뒤 `psql --single-transaction -v ON_ERROR_STOP=1` 한 번에 다음을 전달합니다.

- 트랜잭션 내 advisory lock, PG17·역사·소유권·사용자 데이터 0건·서버 RPC 18개 fingerprint 검사
- 저장소의 정확한 1400/1410/1420/1430/1440/1450 파일 여섯 개
- 동일 트랜잭션 내 기존 RPC 정의·Owner·ACL fingerprint와 신규 함수 11개, 브라우저 EXECUTE 부정 검사
- 위 검증이 모두 PASS일 때만 1400~1450 이력 6건 삽입
- 한 단계라도 실패하면 트랜잭션 전체 롤백

복구 직후 별도의 읽기 전용 조회로 이력 6/6, 함수 11/11을 재확인합니다. 실행·복원 로그의 민감 SQL/비밀번호를 GitHub 이슈·Artifact에 기록하지 않습니다. 실제 정상 운영 사용자 데이터를 **읽거나 수정하는 복구가 아닙니다.**

## 기존 증거 및 남은 제한

- 정확한 104KB 원격 복구본의 PostgreSQL 17 격리 재현: [실행 #38074583070](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38074583070) 성공.
- [2026-10-10의 가장 최근 확인 백업 #38000115562](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38000115562)은 암호화된 아티팩트 ID `11649190277`, migration frontier `20261008090417`, 백업 성공을 증명합니다. **그러나 이 백업을 사용한 격리 복원 성공 증거가 없습니다. 4시간 이내 새 백업+짝지어진 복원 조건도 만족하지 않습니다.**
- 1400~1450이 복구되더라도 원격-only `20261008090417` 이력과 로컬 마이그레이션 카탈로그의 차이는 남을 수 있습니다. 일반 배포 차단을 제거하지 않습니다.
- 0860 owner 권한 예외는 전용 PG17 테스트의 별도 검증 계약입니다. 실제 Supabase 권한·사용자 데이터가 섞인 완전 복구와 동등하지 않습니다.
- `G0~G6`, 개인기록 모델 전송, 유료 AI, Projector 양수, 세연 공개 라우트는 별도의 승인 없이는 OFF/HOLD로 유지합니다.

## 운영 실행 판정

- **소스/검증/복구 트랜잭션 준비:** PR의 정적/부정 테스트, 전체 Integration, 병합 후 exact-main CI, 원격 bundle 격리 재현을 분리 판정.
- **Production 실행:** 새 백업과 해당 백업의 격리 복원 증거가 확인될 때에만 수동 작업 진입. 보관·복원 경계를 충족하지 못하면 **미실행/HOLD**.
- **복구 성공:** 정확한 scope의 실DB 카탈로그와 이력 조회, 권한 불변, 복구 아티팩트/실행 로그까지 합격해야 인정.

상세 작업 근거: #1887. 보안 최종 판정: #1866 (G6 별도).
