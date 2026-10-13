# 세연 R1 복원 대기 및 R2 Production 마이그레이션 계보 기준선 — 2026-10-13

> Watchtower-Track: ops  
> Owner: Operations / DB Authority (#1887)  
> 기준: **GitHub main** `9b7c10cb694afee5c1cb1d89050668eaa3d9f558`; **Production** `cnsfpcdiyofqvhpcegfc`  
> 실행 형태: GitHub 읽기 및 Production의 **SELECT 전용** 카탈로그 조회. 이 문서로 **DB DDL/DML, migration repair, 유료 AI, 서비스 공개 또는 DR Ready 승인하지 않는다.**

## A. 판정

| 검증 | 관측 | 판정 |
| --- | --- | --- |
| 보수 코드 | PR [#2011](https://github.com/gycha0109-beep/MyeongHa/pull/2011) → main `9b7c10c` | MERGED |
| 병합 후 exact-main CI | [#38226729382](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38226729382) | SUCCESS |
| Governance | [#38226729226](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38226729226) | SUCCESS |
| Production 배포 | [#38226729166](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38226729166), 일반 마이그레이션·scoped backfill SKIPPED | 운영 SQL 변경 없음 |
| 최신 post-merge 암호화 백업 | [#38328139495](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38328139495), scheduled, `2026-10-13T00:40:24Z` 완료 | SUCCESS |
| 신규 보수 코드 + **실제 백업**의 짝지어진 격리 복원 | 2026-10-13T01:00Z 기준 최근 Actions 목록에서 새 성공 실행 미확인. 기존 [#38222071108](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38222071108)는 구버전 table ACL 차이로 FAILED | **R1 HOLD** |
| 전체 DR Readiness | [#38226729128](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38226729128): 기존 증거 frontier `1310` vs repository `20261008043000` | **FAIL/HOLD** |

### 최신 암호화 백업 출처

- `backup_run_id=38328139495`; GitHub Workflow `production-postgres-backup.yml` / source branch `main`.
- Source SHA: `9b7c10cb694afee5c1cb1d89050668eaa3d9f558`.
- Encrypted artifact: `11782211590`, `myeongha-postgres-20261013T003752Z`, GitHub artifact checksum `sha256:6a6e68afaf91d0a3754d1fbe84ded0760aca30c418d9c89a79576e45be137567`, expires `2026-11-12T00:40:20Z`.
- Production backup job: strict TLS/LibPQ authority and strict transport `roles/schema/data` PASS; `migration_frontier=20261008090417`.
- 새 백업의 성공은 **복원** 성공을 의미하지 않는다. 저장소에서 Supabase 관리형 `supabase_migrations` 전체 원장을 portable dump에 포함하지 않는다는 한계도 유지.

### R1 실제 다음 증거

[PostgreSQL Isolated Restore Drill](https://github.com/gycha0109-beep/MyeongHa/actions/workflows/postgres-isolated-restore-drill.yml)을 보호된 `main`에서 수동 실행:

| input | value |
| --- | --- |
| `backup_run_id` | `38328139495` |
| `incident_reference_utc` | `2026-10-13T00:40:24Z` |
| `privacy_ledger_run_id` | 빈 값 |
| `production_privacy_canary_run_id` | 빈 값 |
| `watchtower_track` | `ops` |

**R1 승인 조건:** 위 ID의 exact artifact/암호문 digest 복원, **6/6 scoped version/name source snapshot**, **실제 복원 PG17에서 함수 11/11**, **관계 테이블 6/6 RLS 및 anon/authenticated DML 권한 0**, synthetic privacy, 복원 증거 아티팩트와 envelope의 정확한 출처가 모두 SUCCESS. `dr_ready=false` 및 `supabase_managed_migration_ledger_fully_restored=false`는 R1 후에도 변하지 않는다. GitHub 커넥터는 `workflow_dispatch`를 지원하지 않아 이 문서 작성자는 실행을 트리거하지 않았다.

## B. R2 Production 계보 — 새로운 읽기 전용 관측

**근거:** 2026-10-13, Production `supabase_migrations.schema_migrations`의 SELECT와 `pg_catalog` 직접 확인. 사용자 레코드 원문, 104KB SQL 본문, 인증 비밀은 읽어 출력하거나 외부 이슈에 공개하지 않았다.

| 범위 | Production | 의미 |
| --- | --- | --- |
| `1400~1450` | **6/6** 이력 존재; 대상 함수 **11/11** 이름 존재 | 2026-10-12 scoped early 복구 뒤 유지 |
| `1460~1510` | **6/6** 이력 존재 | 원격 bundle과 동등성을 **의미하지 않음** |
| `1400~1510` 개별 12행 | `statements` 저장 배열 길이 0, SQL 본문 0 bytes | 이력 version/name 존재와 독립 재현 가능성을 혼동 금지 |
| `1520~1720` | **0/21** 이력 존재 | 로컬 저장소 마이그레이션 21개 전부 미적용. 2026-10-12 로드맵의 `1520~1710 = 20개`보다 **1720이 추가된 현재 인벤토리** |
| `20261007150457` | 존재, 2 statements | 현재 source history 관측 |
| `20261008043000` | 존재, 7 statements | 현재 source history 관측 |
| 원격 전용 `20261008090417` | 이름 `seyeon_runtime_1460_1510_acl_before_owner_recovery`; **1 statement / 104,021 bytes** | 저장소 migrations 폴더에 동명 migration 파일 없음 |
| 원격 bundle SQL SHA-256 | `4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894` | 2026-10-12 기록 지문과 정확히 일치; **서명이나 배포 승인 증거는 아님** |
| `public` 초기 관계 6 테이블 | **6/6 RLS ON**, anon/authenticated DML 없음 | Production read-only catalog만 검증, full hosted DR 증거 아님 |

**증거 경계:** 11개 함수의 현재 **이름 수**와 6개 초기 RLS/ACL만 이번 SELECT로 확인. 원격 bundle과 로컬 함수 **전체 정의·Owner·signature·ACL fingerprint parity**는 아직 미완료. `20261008090417`의 SQL 작성자·수동 실행 경로·초기 개별 history 삽입 주체는 추정하지 않는다.

### R2 forward-only 판단 준비

1. **원본 보관/비교:** 원격 전용 SQL 본문은 승인된 비공개 운영 경로에서만 보존한다. 지문·statement count와 별도로 로컬 1460~1510, timestamp migration, Owner/RPC의 실제 DDL 및 권한 fingerprint를 일회용 PG17에서 비교한다.
2. **불일치 분류:** 1400~1510의 이력 존재, 과거 bundle의 중복 방지 guard, timestamped migration, 아직 미적용인 1520~1720을 **각기 다른 원인/Authority**로 추적한다.
3. **순서·안전 검증:** 1520~1720의 21개를 범위별 검토하고 role/ACL, 개인정보 삭제/Reader, 비용 governor, Guest/Worker 및 1720 표준 Reader 범위를 따로 다룬다. 자동 숫자순 적용, 일반 `db push`를 안전하다고 간주하지 않는다.
4. **Owner 승인:** exact SHA 및 주요 Object Diff, 테스트, 복구 가능성, 트랜잭션/롤백 계획을 갖춘 **Forward-only 정합성 결정서**를 DB Authority가 승인하기 전까지 Production 마이그레이션 배포 HOLD.
5. **DR Readiness:** 과거 `1310` 증거를 임의 숫자로 교체하거나 FAIL Gate를 우회하지 않는다. 새 격리 복원 증거 수집 뒤 DR 계약의 현재 스키마 입장 기준을 별도 정리하고, 전체 hosted Auth/Storage/관리 이력의 DR 승인은 추가 검증이 필요하다.

**최종 판정:** `R1=HOLD_ACTUAL_ISOLATED_RESTORE`; `R2=HOLD_OWNER_LINEAGE_RECONCILIATION`; `1520~1720_DEPLOY=HOLD`; `G0..G6=HOLD`; `DR_READY=false`.

상위 로드맵: [SEYEON_POST_RECOVERY_EXECUTION_ROADMAP_20261012.md](SEYEON_POST_RECOVERY_EXECUTION_ROADMAP_20261012.md). 역사적 조사 문서: [SEYEON_PRODUCTION_MIGRATION_LINEAGE_HOLD_20261010.md](SEYEON_PRODUCTION_MIGRATION_LINEAGE_HOLD_20261010.md).
