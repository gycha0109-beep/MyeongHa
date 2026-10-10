# 세연 Production 1400–1450 단일 복구 — 근거 있는 일회성 실행 (2026-10-11)

Watchtower-Track: ops

## 입력 실증과 권한

- Source backup [#38088591661](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38088591661): Production 암호화 PostgreSQL 17 논리 백업 성공, run 완료 `2026-10-10T21:44:36Z`, artifact ID `11682862555`, migration frontier `20261008090417`.
- Paired isolated restore [#38090483306](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38090483306): 정확한 source run/artifact로 복원 성공, 복원 산출물 ID `11683439631`, `postgres-isolated-restore-drill-38090483306`, frontier `20261008090417`, rate-limit schema/ACL 복구 PASS, `dr_ready=false` 유지.
- 실제 Production 관계 migration `1400..1450` 이력과 함수 11개는 **아직 없음**. 관계 기록 0건, late `1460..1510` 이력 6건. 원격 incident bundle `20261008090417`은 비공개로 유지하며 재실행하지 않음.
- 사용자 요청으로 보호된 `main`에서 일회성 Production 백필을 실행하되, 일반 Supabase 배포·별도 마이그레이션 재시도·보안 G6 승격은 금지.

## 유일하게 허용하는 실행

- 기존 `.github/workflows/supabase-production.yml`만 수정. 새 workflow나 외부 API/secret 경로를 추가하지 않음.
- marker 경로 `.github/ops/seyeon-relationship-1400-1450-restore-38090483306.once` 및 정확한 본문 `SEYEON-SCOPED-BACKFILL-1400-1450-38088591661-38090483306-V1`.
- 보호된 main의 **정확한 병합 커밋 제목** `ops(seyeon): apply one-shot 1400-1450 38088591661 38090483306` 및 marker 포함 변경, migration SQL 파일 동반 변경 없음 확인. 이 경우에만 일회성 전용 job 진입.
- 일반 `deploy-migrations`는 이 한 건에서 **강제 SKIPPED**. 기존 수동 `workflow_dispatch` 인터페이스도 유지.
- 전용 job은 `production` 환경의 보호된 기존 자격증명을 사용하지만, 주입된 `SEYEON_BACKUP_RUN_ID=38088591661`, `SEYEON_RESTORE_RUN_ID=38090483306`, `SEYEON_SCOPE_CONFIRMATION=APPLY_RELATIONSHIP_1400_1450_ONLY`가 일치해야만 실행.
- 별도의 `seyeon-production-relationship-backfill-guarded.sh`는 **현재 main SHA 불일치, 4시간 초과 백업, 다른 복원 증거, 잘못된 암호화 SHA, TLS 검증 실패, 원격 migration drift, ACL/소유권 변화, 관계 레코드 존재** 시 거부. 어떤 검증도 제거하지 않음.
- 승인된 6개 원본 SQL과 이력 6건만 하나의 PostgreSQL 트랜잭션으로 실행. 함수 11개, 기존 18개 RPC/소유자/ACL, 브라우저 EXECUTE 차단, owner 역할 구성 불변을 검증한 뒤 commit.
- 어떤 검증/DDL 단계라도 실패하면 하나의 트랜잭션으로 rollback. 마지막 원격 read-only catalog로 `6:11` 확인. 추가적인 `1520..1640`, 기존 remote SQL 재적용, 유료 AI 및 공개 ON 금지.

## 성공/실패 판정

- PR CI + 전 트랙 Integration + Governance PASS 확인 후 병합. **병합 전에는 운영 DB 변경 없음.**
- 병합 후 [Supabase Production Actions](https://github.com/gycha0109-beep/MyeongHa/actions/workflows/supabase-production.yml)에서 `governed-seyeon-relationship-backfill-1400-1450` job 성공을 확인.
- 성공 로그 `PASS_SCOPED_PRODUCTION_1400_1450`과 별도의 Production 읽기 전용 catalog `early_history=6`, `early_functions=11`, `late_history=6`, 원격 incident 지문 불변을 모두 확인해야 최종 완료.
- 실패는 실제 원인이 해결되지 않은 `HOLD`로 판정하고, 보호를 해제해 재시도하지 않음. 유효한 rollback/재시도 결정은 새 PR 및 위험 검토 필요.
- #1887 운영 차단 이슈, #1866 보안 증거를 갱신. G6는 별도이고 여전히 HOLD.
