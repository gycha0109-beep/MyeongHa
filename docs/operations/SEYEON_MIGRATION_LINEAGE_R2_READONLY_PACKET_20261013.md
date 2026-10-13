# 세연 운영 마이그레이션 R2 — 읽기 전용 계보 판단 패킷 (2026-10-13)

Watchtower-Track: ops  
관련 이슈: [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887) / AI Security [#1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866)  
선행: [2026-10-10 계보 조사](SEYEON_PRODUCTION_MIGRATION_LINEAGE_HOLD_20261010.md) / [복구 후 실행 로드맵](SEYEON_POST_RECOVERY_EXECUTION_ROADMAP_20261012.md)  
기준 저장소 SHA: `bf6aa054c7572521479234609917963e3cbc962b`  
범위: Production **SELECT만**, DB DDL/DML/Role/마이그레이션 history 수정 **0**.

## 1. 2026-10-13 재검증한 현재 Production 사실

아래 숫자는 2026-10-13 KST에 Supabase 연결로 실행한 **읽기 전용** `supabase_migrations.schema_migrations`, `pg_proc`, `pg_class` 집계 결과다. 실제 SQL 본문, 사용자 레코드, 비밀값은 조회 결과로 반출하지 않았다.

| 범위 | 재검증 결과 | 판정 |
| --- | --- | --- |
| 1400·1410·1420·1430·1440·1450 | 이력 6/6 존재 | 적용 이력 확인 |
| 1460·1470·1480·1490·1500·1510 | 이력 6/6 존재 | 적용 이력 확인 |
| 1520~1710 (10단위 20개) | 이력 0/20 | **Production 배포 금지 유지** |
| 핵심 관계 함수 11종 | `pg_proc` 11/11, 브라우저 EXECUTE 0/11 | 현 운영 접근 기준 PASS |
| 관계 테이블 6종 | RLS ON 6/6, 브라우저 직접 DML 허용 0/6 | 현 운영 접근 기준 PASS |
| `20261007150457` | `guest_promotion_auth_fk_validation`, 2 statements, 6,389 bytes, MD5 `2a2340919352bfb45f98ab96d8eb6645` | 원격 존재 |
| `20261008043000` | `seyeon_manifest_acl_restore`, 7 statements, 3,563 bytes, MD5 `aa481e41e195c83647fd2b3a327c0776` | 원격 존재 |
| 원격 전용 `20261008090417` | `seyeon_runtime_1460_1510_acl_before_owner_recovery`, **1 statement / 104,021 bytes** / MD5 `f70776d8c0f6369f6f13484ba9fa2271` | **계보 HOLD** |

원격 전용 104KB statement의 이름·길이·MD5는 2026-10-10 포렌식 결과와 일치한다. MD5는 식별 보조값이지 SQL 출처/정당성/서명 검증이 아니다. 기존 2026-10-10 조사에 기재된 SHA-256은 이번 조회에서 **다시 계산하지 않았으므로** 현재 확인값으로 표기하지 않는다.

**중요한 구분:** 현재 DB에 관계 테이블·함수가 존재하고 접근통제가 정상이라는 증거와, 해당 DDL이 저장소의 정확한 순서/이력으로 재현 가능하다는 증거는 별개다. 단순 `max(version)` 또는 존재 6/6로 미해결 계보를 승인하지 않는다.

## 2. DR / 백업 복원 현황 (서로 다른 합격 기준)

- 관계 1400~1450 운영 복구 [#38198526367](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38198526367) 이후 생성된 **암호화 백업** [#38204929259](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38204929259), artifact `11726324690`는 SUCCESS, 2026-11-11 UTC까지의 보관 만료 기록이 있다.
- 실제 복원 [#38205504194](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38205504194)은 함수 기본권한 문제로 RED, [#38222071108](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38222071108)은 테이블 기본권한 문제로 RED. 둘 다 fail-closed이며 정확한 6 이력/11 함수/6 RLS 전체 증거가 아님.
- 복원 전 함수/테이블 생성 기본권한 정렬은 [PR #1998](https://github.com/gycha0109-beep/MyeongHa/pull/1998), [PR #2011](https://github.com/gycha0109-beep/MyeongHa/pull/2011)로 병합했고, 후자의 전체 통합 [#38224308752](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38224308752) PASS. **병합 후 새 격리 복원 Run은 아직 확인되지 않음.**
- 기존 [DR Readiness Status v1](POSTGRES_DR_READINESS_STATUS_V1.md)의 `production_schema_latest_deployed_migration: 1310` 및 `latest_isolated_restore_run_id: 36295215761`은 **2026-09-27의 시점별 역사적 증거**이다. 현재 사실로 읽거나 단순 번호 치환으로 GREEN 처리해서는 안 된다. [DR authority #38226729128](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38226729128)도 구증거 1310과 저장소 frontier `20261008043000` 불일치로 FAIL.
- `dr_ready=false`. Provider Auth/Storage 전체 복원 동등성, 제한된 privacy ledger 이후의 미래 안전성, 전체 마이그레이션 ledger 복원은 **미증명**이다.

## 3. R2 결정해야 할 사항 — 승인 전 단순 해결 금지

| 의사결정 | 필요한 증거 | 소유·차단 |
| --- | --- | --- |
| 원격 전용 `20261008090417`의 실제 생성·적용 근거 | 승인된 비공개 저장소에서 원본 SQL·원본 digest·작성/실행 Audit 및 DB 객체 diff 확보 | Production DB Authority |
| 저장소 1460~1510 및 timestamped SQL과의 의미 중첩·순서 | 객체 소유자, RPC 서명·ACL, 열·제약·의존성 parity; 중복 적용 시 결과 검증 | DB Authority / Security |
| 이력 정합성 방침 | 비공개 원본 보관·재현 가능한 아카이브, 조건부 전진 정합성 조정 또는 명시 승인된 history reconciliation 중 한 방식을 문서로 결정 | DB Authority / Ops |
| 1520~1710 배포 Batch / 실행 순서 | 각 migration 필요 객체·이전 범위·권한·롤백·Owner·격리 PG17 replay와 정확한 차이 | 관련 Reader/Saju/Governor/Subject Owner |
| R1 복원 증거 완성 | 동일 `38204929259` 백업으로 신규 격리 복원, source digest 및 6/6·11/11·RLS 6/6·synthetic privacy·evidence artifact | Ops 승인자 |
| 전체 DR readiness 갱신 | 완전한 현재 schema 증거, bounded ledger 범위, Provider 관리 시스템, RPO/RTO 권한 | Product Owner / Ops |

**금지:** `supabase migration repair --status reverted 20261008090417`, 104KB SQL의 무조건 재실행/공개 게시, 다른 SQL로 같은 버전의 역사를 대체, 무제한 `db push`, 단순 DB 숫자 조작, DR gate 비활성화, G0~G6/외부 모델 공개 승인으로 자동 승격.

## 4. 이 패킷 이후 작업 순서

1. **R1 Owner 작업(별도 실행):** [PostgreSQL Isolated Restore Drill](https://github.com/gycha0109-beep/MyeongHa/actions/workflows/postgres-isolated-restore-drill.yml)에서 branch `main`, `backup_run_id=38204929259`, `incident_reference_utc=2026-10-12T04:46:04Z`, `watchtower_track=ops`; privacy 입력 2개 비움. 새 Run이 PASS하기 전 R1 HOLD.
2. **R2 읽기 전용:** `scripts/operations/seyeon-production-migration-lineage-readonly.sql`을 운영 전용 read-only 권한으로 재실행하고 버전·본문 size/digest·객체 권한 fingerprint를 대조. SQL 원문과 개인정보는 로그·PR·이슈에 게시하지 않는다.
3. **R2 Owner 결정:** 생성 출처를 확인할 수 없으면 그대로 `HOLD_OWNER_RECONCILIATION_REQUIRED` 유지. 재현 가능한 fresh PG17 전체 replay 및 원격과의 diff까지 완료한 뒤에만 forward-only 조정 후보 작성.
4. **향후 변경(별도 명시 승인):** 실제 Production history/DDL/기능 활성화, source privacy 변경, Reviewer 권한 확대는 본 문서·PR만으로 실행할 수 없다.

## 5. 종료 판정

- **읽기 전용 현재 상태 재측정: 완료.**
- **원격 버전 계보 정합성: HOLD — Owner 정책·원본 감사·재현성 증거 대기.**
- **후속 Production 배포: HOLD.**
- **R1 관계 런타임 정밀 격리 복원: HOLD — 신규 Run 증거 대기.**
- **전체 서비스 DR Ready: FALSE.**

본 문서는 관측/의사결정 패킷이다. 실행 권한을 위임하거나 현재 미해결 게이트를 승인하지 않는다.
