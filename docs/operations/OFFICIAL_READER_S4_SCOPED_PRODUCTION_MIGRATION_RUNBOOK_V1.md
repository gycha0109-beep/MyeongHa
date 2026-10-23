# Official Reader 1740–2290 — 전용 운영 배포 경로 (미실행)

Watchtower-Track: db-authority-core / Privacy #2318. 연계: #1887, 상위 DB Draft #2301.

## 현재 확인된 근거 (2026-10-23, 운영 PostgreSQL 17.6 읽기 전용)
- 기존 관계 1400–1450 원격 이력 6/6 및 함수 11개 존재
- 1650–1720 필요한 원격 이력 확인
- 공식 Reader 1740–2290 **56개 전부 아직 이력 미적용**
- 유료 보호 원문 테이블/삭제 큐 미설치
- 원격 전용 20261008090417 이력은 계속 존재한다. 이를 수리하거나 재실행하지 않는다.
- 운영 DB에 다른 프로젝트의 당일 마이그레이션이 적용된 이력이 있으므로 과거 고정 frontier를 믿지 않는다.

## 구현
- `scripts/operations/stage-official-reader-s4-production-migrations.py`: 정확히 1740..2290 (10 간격, 56개) 원본만 선택. SQL과 SHA-256을 대조 가능한 private staging 및 이력 INSERT 생성. 환경 접속/SQL 실행 없음.
- `scripts/operations/official-reader-s4-scoped-migration-pre.sql`: 전제 버전, 원격 104,021B SQL SHA-256, 미설치 S4 범위, 기존 스키마 중복 방지; 동일 트랜잭션 내 잠금.
- `scripts/operations/official-reader-s4-scoped-migration-post.sql`: 56개 이력 및 양쪽 보호 RLS/FORCE RLS와 내부 워커 함수가 모두 존재해야 커밋.
- `scripts/operations/apply-official-reader-s4-scoped-production-migrations.sh`: 별도 **수동 실행 전용**, 단일 `psql --single-transaction`에서 정확히 원본 56개 + 대응 SQL 이력을 순서대로 적용. 어떤 오류도 전체 롤백. `supabase db push --include-all`·`migration repair`·역사적 복구 SQL 재실행 없음.
- `.github/workflows/supabase-production.yml`: 수동 `reader_s4_scoped_apply` 선택 때 **일반 deploy-migrations job을 실행하지 않음**. 세연 1400–1450 범위와 동시 선택도 금지.

## 운영 적용 전제

1. 위 변경이 검증 후 **보호된 main**에 병합되어 있을 것. Draft PR에서는 운영 액션을 실행할 수 없음.
2. **현재 main SHA**의 성공한 Production Backup 실행 및 **그 백업의 성공한 격리 Restore 실행**. 백업 완료는 최근 4시간 이내이고 양쪽 SHA가 동일해야 함.
3. 정확한 backup/restore GitHub Actions Run ID를 입력. Restore artifact의 암호화 백업 SHA-256, 원본 artifact 존재, 백업 migration frontier를 현재 Production frontier와 일치 확인.
4. GitHub Actions → **Supabase Production** → Run workflow (main) → `reader_s4_scoped_apply=true`, 두 Run ID, `reader_s4_confirmation=APPLY_OFFICIAL_READER_1740_2290_ONLY`.
5. 보호된 `production` environment의 DB 암호·TLS 신뢰 루트가 존재할 것. 위 4번은 실제 운영 스키마와 이력을 **변경하는 위험한 작업**이므로 사용자의 명시적인 실행 결정과 올바른 백업 증거가 먼저 필요하다.
6. 적용 중 실패하거나 중복 스키마를 발견하면 DB 변경 및 이력 전부 롤백. 기존 고객 데이터는 수동 정리하지 않음.

## 적용 뒤 남는 작업

- 적용 성공이 **운영 삭제 기한·P30D 구백업 재노출 차단 증거 자체는 아니다.**
- 독립 원장과 암호키 분리 마운트 및 Worker 권한·수명주기 실운영 증거가 있어야 관리형 삭제 워커를 활성화할 수 있다.
- 실제 24시간 파기 목표와 오래된 백업 격리 복원 후 비재노출을 실측해야 #2318 기술 종료 가능.
- 법적 위험은 별도 법무 트랙에서 처리하며 S4 배포로 자동 승인되지 않는다.
- 공개 Reader·유료 AI·일반 복원 소비자는 계속 OFF.
