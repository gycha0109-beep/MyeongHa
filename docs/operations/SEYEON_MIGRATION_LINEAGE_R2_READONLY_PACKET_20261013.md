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

## 6. 2026-10-13 후속 관측 — 최신 암호화 백업·1720까지의 미적용 인벤토리

이 절은 1~5절의 역사적 관측을 대체하지 않고, **더 늦은 읽기 전용 Production/GitHub 관측**을 추가한다.

- **보수 코드 기준:** [PR #2011](https://github.com/gycha0109-beep/MyeongHa/pull/2011) main `9b7c10cb694afee5c1cb1d89050668eaa3d9f558`. [exact-main CI #38226729382](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38226729382) SUCCESS; [Supabase Production #38226729166](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38226729166)에서 일반 migration 및 backfill SKIPPED, Production 쓰기 없음.
- **새 post-fix 백업:** [#38328139495](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38328139495), 2026-10-13T00:40:24Z 완료 SUCCESS, 해당 main SHA. 암호화 artifact ID `11782211590`, 이름 `myeongha-postgres-20261013T003752Z`, artifact digest `sha256:6a6e68afaf91d0a3754d1fbe84ded0760aca30c418d9c89a79576e45be137567`; 만료 `2026-11-12T00:40:20Z`. strict TLS dump roles/schema/data PASS, frontier `20261008090417`. **백업 성공만 입증**하며 신규 격리 복원 증거는 2026-10-13T01:00Z 조회 시 없음. R1 HOLD.
- **로컬 인벤토리 확대:** 저장소에 `supabase/migrations/1720_standard_reader_product_scope_read_v1.sql` 존재. Production `supabase_migrations.schema_migrations` SELECT에서는 **1520~1720 총 21개 중 적용 0/21**. 이전 본문의 1520~1710 0/20은 당시 확인 범위를 나타낸다. **1720 Reader/Product Authority** 검토는 별도 소유자 결정 사항이며 배포 금지.
- **동일 원격 bundle 확인:** `20261008090417`은 1 statement, 104,021 bytes. 읽기 전용 재산출 SHA-256 `4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894`로 2026-10-12 기록과 일치. 지문 일치는 적용 출처·정당성이나 개별 1460~1510 SQL 정의 동등성 증명이 아니다.
- **초기 관계 DB 유지:** version/name 이력 1400~1510 **12/12**(각 개별 행 statements 0), 함수 이름 **11/11**, 관계 테이블 **RLS/브라우저 DML 차단 6/6**. 이는 현재 Production 카탈로그 관측이며 격리 복원 완전성 입증은 아니다.

### R1 수동 격리 복원 입력 (현재 우선)

[PostgreSQL Isolated Restore Drill](https://github.com/gycha0109-beep/MyeongHa/actions/workflows/postgres-isolated-restore-drill.yml) → `Run workflow` → `main`.

| 입력 | 값 |
| --- | --- |
| `backup_run_id` | `38328139495` |
| `incident_reference_utc` | `2026-10-13T00:40:24Z` |
| `watchtower_track` | `ops` |
| `privacy_ledger_run_id`, `production_privacy_canary_run_id` | 둘 다 비움 |

새 실행에서 동일 artifact/digest, migration snapshot **6/6**, 실제 restored PostgreSQL 함수 **11/11**, RLS 및 익명/인증 사용자 테이블 권한 **6/6**, synthetic privacy 및 evidence artifact가 모두 PASS하기 전에는 **R1 HOLD**. 검증 후에도 `supabase_managed_migration_ledger_fully_restored=false`, `dr_ready=false` 유지. 연결된 GitHub 도구는 수동 `workflow_dispatch`를 제공하지 않으므로 실행은 운영자 UI 조치가 필요하다.

### 후속 R2·DR 안전 경계

- 원격 104KB bundle의 Private original audit/source, 전체 SQL/Object/Owner/ACL fingerprint parity, **1520~1720 21건**의 Owner별 의존·회귀·rollback 및 forward-only 결정 전에는 Production 적용 금지.
- [DR Readiness #38226729128](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38226729128)은 역사적 `1310` 증거와 repository frontier `20261008043000` 불일치로 FAIL. 단순 숫자 변경·게이트 우회로 GREEN 처리하지 않는다. G0~G6, 유료 AI, 공개 경로는 별도 HOLD.


## 7. R2 후속 — 1460~1510 함수 카탈로그 지문 검증 (승인 아님)

- 실행 SQL: `scripts/operations/seyeon-r2-rpc-catalog-readonly.sql` — 1460~1500이 정의한 19종 함수의 검색경로 독립 시그니처, Owner, SECURITY DEFINER, volatility, ACL·DDL SHA-256, 익명/인증 실행 가능 여부만 출력. 함수 본문/실제 기록/비밀값 출력 없음.
- 검증기: `scripts/operations/verify-seyeon-r2-rpc-catalog.mjs` — 19개 정해진 이름 및 소유자, overload/유실, 사용자 실행권한, SHA-256 형식을 fail-closed 검사하며 동일 PostgreSQL major(17) 두 스냅샷의 exact equality를 비교. 부정 테스트 `tests/seyeon-r2-rpc-catalog.test.mjs`.
- Production 2026-10-13 읽기 전용 기초 확인에서 이름 19개가 관측되었고 browser EXECUTE는 모두 false. 다만 이 사실은 전체 exact-signature/DDL 동등성 또는 104KB SQL 계보 승인의 대체 증거가 아니다.
- 실행 예시 (권한이 승인된 각 환경에서 별도 수행): `psql -X -qAt -v ON_ERROR_STOP=1 -f scripts/operations/seyeon-r2-rpc-catalog-readonly.sql > protected-snapshot.json` 후 `node scripts/operations/verify-seyeon-r2-rpc-catalog.mjs isolated.json production.json`. 결과 스냅샷은 운영 전용 보관소에만 보관하고, 일반 PR/CI에는 검증 결과·건수·Run ID만 기록. Supabase 관리형 역할/객체, PG 설정 및 migration history 차이는 별도 조사.
- **R2 전체 HOLD:** 원격 단일 SQL 원본의 작성/적용 출처, 1460~1510 본문 차이와 timestamped DDL 중복/순서, 1520~1720 전체 21개의 종속성, forward-only Owner 방침/승인 미완료. Production 수정/복구/원장 repair 금지.


## 8. 2026-10-13 R1 최신 실행 증거 — R2 계보 정합성은 별도 HOLD

- 새로운 격리 복원 [#38337822738](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38337822738)가 `main@7af352c59738a0d36abd4d4fd78ba1789e57c121`에서 `backup_run_id=38328139495` 암호화 아티팩트를 실제 복원하여 **SUCCESS**. 이는 기존 2·6절 "실복원 미확보"보다 늦은 결과다.
- 실제 PostgreSQL 17 복원 결과 `1400~1450` 이력 스냅샷 **6/6**, 복원 관계 함수 `pg_proc` **11/11**, 관계 RLS/ACL **6/6**, 브라우저 직접 권한 차단, Synthetic Privacy Recovery **PASS**. 정확한 encrypted backup source/envelope 검증 단계 통과. Evidence artifact ID `11785825091`, SHA-256 `b98e443f0c50b8af05b0d890971ae78b6284ed70d98940f04fefaeee9252c82a`.
- **R1 scoped DONE**. 그러나 `dr_ready=false`, full `supabase_migrations` ledger 복원 false, hosted Supabase Auth/Storage 및 운영 개인정보 Privacy Ledger 실제 replay 미입증.
- **R2 계속 HOLD:** remote-only 104KB SQL의 출처·객체/DDL 동등성·Owner 승인, 저장소 1520~1720 21개 의존성 및 forward-only 배포정책 미해결. [#2030](https://github.com/gycha0109-beep/MyeongHa/pull/2030)의 read-only 19 RPC catalog parity 도구는 R2 비교 증거를 위한 것이며, R1 성공 또는 CI Green이 Production history 수정 승인으로 바뀌지 않는다.


## 9. 2026-10-13 R2-A/B — 원격 번들 제한적 객체 겹침 및 21개 후속 순서 검증 (배포 승인 아님)

Watchtower-Track: ops. R1 정확한 격리 복원 증거는 8절을 따른다. 이 절은 **읽기 전용 Production SQL + 저장소 SQL의 불변성 검증**을 설명한다.

### 원격 `20261008090417` SQL 본문 비반출 검사

- 신규 `scripts/operations/seyeon-r2-remote-bundle-overlap-readonly.sql`: Production 이력의 **단일 SQL을 DB 메모리에서만** 읽어 크기·SHA-256를 계산하고, `CREATE [OR REPLACE] FUNCTION public.*` 형태의 정규식상 이름 겹침을 **숫자로만** 출력한다. 원문 SQL·미확인 객체 이름·레코드·인증정보를 결과로 반환하지 않는다.
- 실제 Production SELECT 관측(2026-10-13 UTC): `20261008090417` **104,021 bytes**, SHA-256 `4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894` (기존 지문과 일치); 정의 토큰 **19**, 고유 함수명 **19**, 저장소 `1460~1510`의 대상 RPC 이름 중복 **19/19**.
- **증거 한계:** 정규식이 SQL 주석·문자열·동적 SQL을 파싱하지 않으므로 이는 이름 수준의 **lexical overlap screen**이다. 함수 **매개변수·Owner·SECURITY DEFINER·ACL·DDL 본문 동등성**을 주장하지 않는다. 실행 일시·작성자·도구·원격 번들 원본 보관처 미입증. `scripts/operations/seyeon-r2-rpc-catalog-readonly.sql`의 양 환경 metadata snapshot exact comparison은 별도 필요.

### 저장소 `1520~1720` 21개 forward-only 격리 검증

- 불변 목록: `scripts/operations/seyeon-r2-pending-migration-inventory.json`. **21개 파일**의 원래 Git Blob SHA, 버전, 증명 대상 객체, 선행 마이그레이션, 단위별 Owner 검토 책임과 `HOLD_OWNER_REVIEW`를 명시. 실제 버전 계보의 재작성/변경 없음.
- 검증기: `scripts/operations/verify-seyeon-r2-pending-migrations.mjs`. 누락·추가·중복·버전 순서 변경·원본 SQL 바이트 변조·선행 버전 역전·Owner 승인 암묵적 승격·원격-only 버전의 저장소 편입 시 fail-closed. 반환 결과의 `authorizedForProduction=false`, `drReady=false` 불변.
- 실제 PG17: `test/db/seyeon_r2_pending_catalog.sql`에서 후속 SQL replay **후** 주요 함수 18개, RLS+브라우저 직접권한 차단 테이블 6개, 비로그인 Owner 3개를 카탈로그 확인. `tests/seyeon-r2-pending-migrations.test.mjs`는 checksum·버전·의존성·Owner·객체 누락·무단 승인 부정 테스트. 기존 PostgreSQL 17 CI suite의 `seyeon-r2-pending-migrations` case에서 실행.
- 9개 묶음은 **연속된 버전의 검토 단위**이며 Production에 실행 가능한 배포 Batch가 아니다. 순서: ①1520 계정 삭제 ②1530 Character Artifact ③1540 Saju proof ④1550~1630 비용 Governor 기반 ⑤1640 G1 Pin ⑥1650 Subject lock ⑦1660 Reader locator ⑧1670~1710 Guest/정산/receipt ⑨1720 Reader Product scope. Supabase의 version 정렬 때문에 **앞 단위를 건너뛰어 뒤 단위만 push 불가**, 각 단위의 Owner 승인·회귀·Rollback/Recovery·사후검증 요구.
- **보증 한계:** Git Blob 불변성과 SQL의 선행 이름/객체 존재는 *정적 계약*이며, 전체 SQL AST/실행 시 Side Effect/SQL 동등성 증명이 아니다. 합성 PG17 재생은 Supabase hosted Role/Ext/Schema 편차를 모두 재현하지 않는다. 기존 1460~1510 및 timestamped migrations와 `104KB` 간 DDL·권한·history double-apply 충돌은 여전히 미해결.

### R2 Owner 결정에 남은 차단 조건

1. 원격 104KB SQL의 비공개 원본 보관·작성/실행 감사 주체 확인. 원문/PII는 이슈·CI·PR 반출 금지.
2. 저장소 1460~1510을 기존/원격 런타임과 **함수 정확한 시그니처·Owner·ACL·DDL fingerprint** 기준으로 격리 PG17 및 Production의 동일 major에서 검증; 의미적 차이는 별도 분석.
3. Timestamped 버전 `20261007150457` / `20261008043000`, 원격-only 104KB 번들, 21개 후속 버전의 실제 순서 충돌·중복 DDL·호스팅 Role 상호작용을 재현.
4. DB/Security/Character/Reader/Saju/Ops 각 Owner가 단위별 무효화·실패 복구 경로를 승인한 뒤 forward-only 대응을 결정. 기존 `20261008090417` 이력을 임의 수리·삭제·대체하지 않음.

**현 판정: R2 forensic metadata + 불변 의존성 스캐폴드 구축 중; Production 1520~1720 0/21, remote-only 1, 전체 DR readiness HOLD.** CI/PR 성공이나 R1 성공은 마이그레이션 배포 또는 세연 AI 보안 G0~G6 승인으로 자동 전환되지 않는다.


## 10. 2026-10-13 R2-C — Production vs PG17 19 RPC aggregate exact 지문 비교 결과

**실측 결과: `HOLD_R2_RPC_CATALOG_NOT_EQUIVALENT` — ACL 원본 지문만 불일치.**

- Production에서 `scripts/operations/seyeon-r2-rpc-set-fingerprint-readonly.sql`을 SELECT로 실행. `2026-10-13` 당시 19/19 함수, 중복/누락 0, PG major=17, `anon`·`authenticated` EXECUTE 0. 함수 원문·인자 원문·ACL 원문·개인정보는 결과로 반환하지 않고 6가지 정렬 집계 SHA-256만 산출.
- Production 집계 기록 `scripts/operations/seyeon-r2-production-rpc-set-fingerprint-20261013.json`은 **집합 해시 및 검증 카운트만** 포함하고 `authorizesProduction=false`를 고정한다. 이 데이터는 원격-only 104KB SQL의 digest/출처·적용 로그 증거와는 별개다.
- 격리 PostgreSQL 17에서는 `test/db/run_ci_case.sh`의 `apply_pg17_migrations_through_seyeon_production_frontier`로 **저장소 번호 마이그레이션 1510까지 + 실제 보이는 timestamped 2개**만 재생. 1520~1720 21개는 재생하지 않고, 원격-only `20261008090417` 본문을 절대 가져오거나 재실행하지 않았다. 특수 0860 managed-principal 테스트는 기존 PG17 전용 제외 규칙대로 분리한다. 이것은 hosted Supabase 환경을 완전히 복제한 것이 아니다.
- [PR #2046](https://github.com/gycha0109-beep/MyeongHa/pull/2046) 최초 HEAD `233bfec7c02d3e24763f9bbb9f03d2732e0d6a98`, [CI #38350068457](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38350068457) PG17 job `115140250094`의 실제 aggregate comparison:
  - **MATCH:** function-name set 19, 정확한 함수 signature set, Owner set, `pg_get_functiondef` DDL set, SECURITY DEFINER/volatility/anon-auth 실행 가능 여부 flags set.
  - **MISMATCH:** `pg_proc.proacl::text` 기반 **ACL set SHA-256** 단독 (`mismatchFields=["aclSetSha256"]`).
  - **브라우저 실행:** 두 환경에서 `anon/authenticated` EXECUTE 0. ACL 표현 차이가 추가 role의 실제 권한 차이인지, ACL 배열 순서/표시 형태인지, default/explicit 차이인지는 *미분석*. 실무적 권한 동등성을 주장하지 않는다.
- `scripts/operations/verify-seyeon-r2-rpc-set-fingerprint.mjs`은 기대 19, 중복·누락·공개 실행권한 0, 모든 집계 해시 형식을 엄격 검증한다. 대조가 불일치해도 **실행 자체가 정상 완료되었다는 진단 검사 성공**과 **계보 동등성 PASS**를 혼동하지 않도록 항상 `HOLD_R2_RPC_CATALOG_NOT_EQUIVALENT`를 출력하고 `match=false`, `drReady=false`, `authorizedForProduction=false`를 유지한다. 2026-10-13 Production 측정 결과의 예상 불일치 필드 `['aclSetSha256']`도 별도로 고정한다. 해당 필드가 새로 늘거나 사라지면 `HOLD_R2_UNEXPECTED_PARITY_DRIFT_REQUIRES_REVIEW`로 CI를 실패시켜 무심코 새 계보 상태를 승인하지 않는다. CI의 GREEN은 **기존 ACL 단독 HOLD가 그대로 재현되었다는 진단 성공**일 뿐 ACL 일치/배포 승인 증거가 아니다.
- **Owner의 다음 안전 조사:** 승인된 격리 환경에서 기존 `scripts/operations/seyeon-r2-rpc-catalog-readonly.sql` 양쪽 출력물을 일반 CI·공개 PR/이슈가 아닌 보호된 운영 파일로만 저장 → 기존 `verify-seyeon-r2-rpc-catalog.mjs isolated.json production.json`을 오프라인 실행해 불일치 객체/필드 이름 확인 → raw ACL 배열 요소의 순서/명시 grant/default 및 effective `service_role`·runtime role 권한 차이를 분리하고 DB/Security Owner 검토. 원격 104KB 작성·실행 provenance 및 timestamped migration 순서 감사는 여전히 별도 HOLD.

**금지 유지:** Production migration repair/db push/DDL/Role/ACL/history 변경, 원격 SQL 재실행·공개 반출, G0~G6·유료 AI·사용자 공개, `dr_ready=true` 승격. 이전 R1 scoped restore PASS는 계속 유효하나 R2 또는 전체 DR Ready를 자동 승인하지 않는다.


## 11. 2026-10-13 R2-D — ACL mismatch 함수별 직접 Grant 조사 (HOLD 유지)

- [PR #2048](https://github.com/gycha0109-beep/MyeongHa/pull/2048): `scripts/operations/seyeon-r2-acl-grants-canonical-readonly.sql`은 기존 Production / 격리 PostgreSQL 17의 같은 **19 RPC**에 대해 원본 `proacl` 표현 SHA-256 및 `aclexplode`의 **grantor·grantee Role 이름 정렬** 정규화 Grant SHA-256, explicit/default 여부, 항목 수, 브라우저 EXECUTE 여부만 반환한다. **원문 ACL/함수 SQL, 사용자 데이터, 역할 목록은 반환하지 않는다.**
- Production 읽기 전용 관측: 19 RPC/명시 ACL 19, 전체 38 Grant 항목, 브라우저 EXECUTE 0. 보호된 집계 증거: `scripts/operations/seyeon-r2-production-acl-grants-20261013.json`.
- 기존 CI의 격리 PostgreSQL 17 `1510 + timestamped 2개` 동일 재생에서, 실제 `HOLD_R2_ACL_METADATA_NOT_EQUIVALENT`, 정규화 Grant 해시 불일치 **정확히 1/19**: `assert_seyeon_chat_thread_runtime_v1`; Grant 항목 수도 해당 함수에서만 다름. 다른 18개 함수는 raw ACL 및 정규화 Grant 모두 일치. 따라서 기존 전체 ACL 집합 불일치는 단순한 ACL 배열 순서/문자열 표현 차이로만 설명되지 않는다. [PR #2048 일반 CI](https://github.com/gycha0109-beep/MyeongHa/pull/2048) PostgreSQL 17 로그 기준이며, 최종 HEAD 재검증·병합 상태는 각 Run에서 확인해야 한다.
- 해당 함수의 Production **내부 read-only 범주형 권한 검사**: 명시 Grant 2개 중 Owner 자체 1개, `service_role` 직접 EXECUTE 1개. `anon` / `authenticated` / PUBLIC 직접 EXECUTE 0, Grant Option 0. 저장소 `1490_seyeon_production_chat_execution_runtime_v1.sql`에서 해당 helper 함수는 PUBLIC REVOKE 및 narrow owner 변경이 보이지만, wrapper와 달리 `service_role`에 대한 해당 직접 GRANT 선언을 확인하지 못했다. **Production 추가 Grant의 작성자·생성 시점·승인 상태는 미입증**이다.
- 격리 DB helper만의 별도 권한 수치 확인용 `scripts/operations/seyeon-r2-assert-helper-acl-readonly.sql` 추가. 실제 [CI #38352921252](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38352921252) PG17 job `115149262006`: **격리 DB totalEdges=1 / ownerEdges=1 / serverRoleDirectExecute=0 / browserRoleDirectExecute=0**, Production 읽기 전용 관측 **totalEdges=2 / ownerEdges=1 / service_role 직접 EXECUTE=1 / browser 직접 EXECUTE=0**. 따라서 실제로 저장소 재생에는 없는 privileged server role의 **명시적 Grant 1건이 Production에 추가**돼 있다는 정밀 증거다. 역할 상속·호출 경로 및 부여 시점·승인 원인은 별도 Owner 검증 대상이다. 로그에는 원문 ACL/Role graph/SQL을 기록하지 않았다.
- **보안 판단:** privileged server Role의 직접 EXECUTE 차이는 확인됐지만, 그 역할이 맡는 호출 경로의 정당성·Role 상속·추가 권한·Supabase 관리형 적용 역사는 조사 필요. 브라우저 직접 접근이 허용된 것으로 판단하지 않는다. Production ACL 제거/추가, 원격-only `20261008090417` repair/replay, 사용자 공개나 DR Ready 승격은 **모두 금지**. 본 PR은 예상된 함수 1개의 정규화 Grant/항목 수 불일치만 진단 성공으로 허용하고, 그 항목이 바뀌거나 다른 함수 ACL 차이가 생기거나 우연히 일치해도 `HOLD_R2_ACL_UNEXPECTED_DRIFT_REQUIRES_OWNER_REVIEW`로 CI를 실패시킨다. CI GREEN은 불일치 해소·보안 승인 의미가 아니다. DB/Security Owner가 기존 운영 Grant를 유지할지, 별도 forward-only 변경을 승인할지 판단해야 한다. R2 전체 **HOLD**.


## 12. 2026-10-14 R2-E — `service_role` ACL 생성 경로의 제한적 재현 (운영 변경 없음)

**선행 관측(확정):** [PR #2048](https://github.com/gycha0109-beep/MyeongHa/pull/2048)에서 19 RPC 중 18개 Grant 그래프가 일치했고 `assert_seyeon_chat_thread_runtime_v1(uuid,uuid)`만 Production에서 소유자 외 직접 `service_role EXECUTE` 1건이 추가로 존재한다. 브라우저 `anon/authenticated` 직접 EXECUTE는 0. PG catalog의 Grantor/Owner는 과거의 사람·실행시각을 알려주지 않는다.

**새 읽기 전용 관측:** `scripts/operations/seyeon-r2-creator-default-acl-readonly.sql`은 Production 현재 `postgres`의 함수 DEFAULT ACL 중 전역과 `public` 스키마 범위의 `service_role`·브라우저 EXECUTE 항목 **건수만** 계산한다. 2026-10-14 관측 결과는 `globalServiceRoleFunctionExecuteCount=0`, `publicSchemaServiceRoleFunctionExecuteCount=1`, `publicSchemaBrowserFunctionExecuteCount=0`이다. 이 결과는 **조회 당시 설정**이고 2026-10-08에 똑같았다는 과거 증거가 아니다.

**저장소 원인 후보:** `1490_seyeon_production_chat_execution_runtime_v1.sql`은 보조 RPC를 먼저 생성한 후 `REVOKE ALL ... FROM PUBLIC`하고 Owner를 `myeongha_seyeon_chat_runtime_owner`로 이전한다. 이 보조 RPC에는 명시적 `REVOKE ... FROM service_role`이 없다. 따라서 새 함수에 부여되는 `postgres`의 스키마 단위 기본권한이 원천이라면, `PUBLIC`만 철회해도 `service_role`의 직접 EXECUTE가 남는다는 **가설**이 성립한다. 이는 원격-only 104KB SQL의 실제 작성자·적용 도구·시각에 관한 단정이 아니다.

**통제된 격리 PostgreSQL 17 재현:**

- `test/db/seyeon_r2_creator_default_acl_synthetic.sql`: 오직 disposable PG17 트랜잭션에서 `postgres`의 `public` 함수 기본 `service_role EXECUTE`를 설정 → 개인정보 없는 테스트 함수 CREATE → `PUBLIC` REVOKE → Owner 이전 → 소유자 1 + `service_role` 1 + 브라우저 직접 허용 0 검사 → 전체 `ROLLBACK`.
- `test/db/seyeon_r2_helper_grant_transient.sql`: 위 재현과 별개로 동일 disposable DB의 실제 보조 RPC에 Owner 권한으로 정확한 추가 `service_role EXECUTE` **한 건만** 임시 부여하고 19개 원본/정규화 ACL 해시를 계산한 뒤 `ROLLBACK`.
- `scripts/operations/verify-seyeon-r2-helper-grant-causality.mjs`: 실제 격리 **변경 전 → 임시 한 건 추가 → ROLLBACK 후** 스냅샷을 2026-10-13 Production 보호된 해시 증거와 비교한다. 변경 전 불일치가 보조 RPC **한 개**뿐이어야 하고, 임시 추가 후 전체 정규화 Grant 집합이 일치해야 하며, 나머지 18개 RPC·브라우저 권한 및 ROLLBACK 이후가 불변이어야 PASS한다. 원본 ACL 표현 일치 여부는 별도 결과로 기록하며 과거 출처는 항상 `originEstablished=false`.
- 부정 테스트 `tests/seyeon-r2-helper-grant-causality.test.mjs`: 임의 다른 함수 ACL 변경, 새 브라우저 허용, 일관성 없는 단일 Grant, 실패한 ROLLBACK, 비정상 메타데이터를 fail-closed로 차단한다.
- 기존 PostgreSQL 17 CI `seyeon-r2-cross-env-catalog` case에 결합해 복원/재생 가능한 저장소 증거로만 사용한다. CI 합격은 **가설 재현 성공**이지 역사적 책임 확인·권한 수정 승인·R2 lineage 합격이 아니다.

**후속 Owner 결정:** 추가 직접 Grant가 서비스에 필요한지 Character/API/DB/Security Owner가 증명해야 한다. 제거가 필요하더라도 Production `REVOKE`/Role 변경은 별도 승인된 forward-only 안전 변경·영향 평가·Rollback·운영 검증 절차 뒤에만 가능하다. 재현이 정확히 맞더라도 역사적 104KB SQL 원본과 관리형 Audit는 비공개로 별도 확인해야 한다. `1520~1720` 적용 `0/21`, `dr_ready=false`, G0~G6/유료 모델/공개 HOLD 유지.


### 2026-10-14 PG17 실제 실행 검증 (가설의 재현 성공, 역사적 출처 HOLD)

- 정확한 PR 구현 HEAD `e1f09918c17cf7b98b8381c4b4c7d695ac862d11`에서 [CI #38492147105](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38492147105)의 PostgreSQL17 job `115619675865` **SUCCESS**.
- 격리에서 `PASS_R2_SYNTHETIC_POSTGRES_CREATOR_DEFAULT_EXECUTE_NOT_HISTORICAL_ACTOR`: 테스트 함수 생성 당시 `postgres` `public` 스키마 함수 기본권한을 통해 `service_role EXECUTE`가 부여되고 `PUBLIC REVOKE` 및 Owner 이전 뒤에도 해당 명시 권한이 유지되는 메커니즘을 재현.
- `PASS_R2_ONE_EDGE_ACL_EFFECT_REPRODUCED_ORIGIN_UNVERIFIED`: 격리 `assert_seyeon_chat_thread_runtime_v1`에 단 **1개의 임시 `service_role EXECUTE`**를 추가했을 때 19개 RPC의 정규화 Grant 그래프뿐 아니라 **원본 `proacl` SHA-256까지** Production 관측값과 일치 (`exactRawAclMatch=true`, `normalizedGrantGraphMatch=true`, `rawAclRemainingDifferences=[]`). 무관한 18 RPC, 브라우저 직접 EXECUTE 0, ROLLBACK 후 이전 ACL로 복구도 검증.
- **범위별 결론:** 저장소 1490의 `PUBLIC` 철회만으로 `service_role` 기본 권한을 자동 철회하지 않는다는 *기술적 메커니즘*이 설명력을 갖는다. **2026-10-08 실제 기본권한 이력·실제 실행 역할/시각·원격 SQL 적용 경로·권한 의도는 별개로 미증명**. 이 증거로 과거 적용 주체를 지목하거나 Production 권한을 임의로 변경하지 않는다. `originEstablished=false`, `authorizedForProduction=false`, `dr_ready=false`, R2 계보 및 G0~G6 HOLD.

## 13. 2026-10-14 R2-F — helper RPC 실질 EXECUTE 경로 조사 (Production 읽기 전용)

**승인 상태: HOLD.** R2-E의 ACL 생성 가설 검증과 별개의, **실제 Role 권한** 검증이다. Production schema/ACL/role/history 쓰기 없음.

- 2026-10-14 Production PostgreSQL 17에서 대상 `assert_seyeon_chat_thread_runtime_v1(uuid,uuid)` 1개에 대해 `has_function_privilege`, `has_schema_privilege`, `pg_has_role`, `aclexplode`를 **SELECT로만 실행**. 확인된 현재 상태: `service_role`은 직접 Grant를 통한 유효 EXECUTE를 가지며, 일반 `myeongha_api_executor`와 브라우저 `anon/authenticated`는 유효 EXECUTE가 없음. Narrow owner는 EXECUTE 허용. Role 목록·실제 membership graph·raw ACL·함수 본문·고객 데이터는 증거/CI/문서에 반출하지 않음.
- 저장소 API 바인딩 `apps/api/src/postgres-seyeon-production-chat-execution-v1.ts`에서 서버의 직접 SQL 호출은 `cmd_receive_seyeon_chat_turn_runtime_v1` 등 **wrapper RPC**를 사용한다. `1490_seyeon_production_chat_execution_runtime_v1.sql`에서는 보조 helper를 각 wrapper 내부에서 호출하며 helper는 SECURITY INVOKER이고 wrapper들은 SECURITY DEFINER다. **조사한 바인딩에서 helper의 직접 호출은 미확인**이나, 저장소 밖의 Privileged 호출·과거 운영 호출 부재까지 증명하지 않는다.
- 신규 `scripts/operations/seyeon-r2-effective-helper-readonly.sql`: 운영/격리에서 동일한 고정 Role 범주에 대한 direct/effective/schema/owner-inheritance 결과를 읽기 전용 측정. 출력 원본은 보호된 환경에만 보관.
- 신규 `test/db/seyeon_r2_effective_helper_grant_transient.sql`: 격리 PG17에서 보조 helper에 한 건만 합성 Grant → EXECUTE 측정 → ROLLBACK → 재측정. `verify-seyeon-r2-effective-helper.mjs` 및 부정 테스트가 브라우저·API Role 무단 실행, owner membership 경로, ROLLBACK 누수, 기타 drift에 fail-closed. 기존 R2 cross-env PostgreSQL 17 CI에 추가. 이 테스트는 원격 전용 SQL을 실행하지 않는다.
- 아직 **확인되지 않은 것**: 2026-10-08 실제 Role/도구/실행자·시각, 실제 Grant 승인자, helper 직접 호출하는 별도 privileged code, 불필요 Grant를 제거해도 영향 없다는 운영 증거. Character/API/DB/Security Owner가 helper의 직접 EXECUTE 필요 여부와 제거/유지 정책을 별도로 승인해야 한다.
- 정책 불변: Production `REVOKE`/`GRANT`/migration repair/db push 금지; `dr_ready=false`, R2/1520~1720/G0~G6/paid/public HOLD. PG17 합성 GREEN은 Production 배포·권한 정당성 승인 아님.


## 14. 2026-10-14 R2-G — timestamped ContentManifest ACL overlap / 최종 PG17 catalog 추가 감사

**계보 승인 아님.** 104KB SQL 원문·실제 사용자 레코드·Role graph·ACL 원문은 Production 밖으로 반출하지 않고, DB 내부 read-only 정규식 건수와 SHA-256만 확인한다.

- 원격-only `20261008090417`: 단일 SQL **104,021 bytes**, SHA-256 `4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894` 재확인. 저장소 번호 이력 `1460~1510` 6개 및 timestamped `20261007150457`/`20261008043000` 2개가 원격 ledger에 존재. Version 정렬은 보이지만 실제 실행 시각/트랜잭션 순서/도구 증거가 아니다.
- 원격 SQL **lexical-only**: `qry_content_bundle_manifest_v1` 문자열 8건, 이 함수의 정규식상 `REVOKE ALL` 2건·`GRANT EXECUTE` 1건, CREATE FUNCTION 0건. `assert_seyeon_chat_thread_runtime_v1` CREATE 1건, OWNER ALTER 1건, 직접 EXECUTE GRANT 0건. `cmd_promote_guest_v1` CREATE 0건. 정규식은 SQL 실행/주석/문자열/동적 SQL을 완전히 구별하지 못하므로 **실제 중복 DDL 여부·Grant 행위 및 성공/적용 순서를 확정하지 않는다**.
- 저장소 `1510_seyeon_production_runtime_composition_v1.sql` 및 `20261008043000_seyeon_manifest_acl_restore.sql`도 같은 ContentManifest 함수의 REVOKE/GRANT를 기술하므로, 원격 bundle과 **권한 효과의 중첩 검토 대상**이다. Timestamped `20261007150457`의 Guest Promotion CREATE 정의는 원격에서 lexical nonmatch; 이는 의존성이 없다는 증명이 아니다.
- 신규 `scripts/operations/seyeon-r2-g-remote-timestamped-readonly.sql` 및 `seyeon-r2-g-manifest-rpc-readonly.sql`: Production remote SQL은 DB 메모리에서만 검사. ContentManifest 최종 Owner/DDL/정규화 Grant/원본 ACL SHA와 SECURITY INVOKER·서버/브라우저 실행권한의 hash/category만 출력.
- Production ContentManifest catalog: 1 함수, 정규화 Grant edge **2**, SECURITY INVOKER, `myeongha_api_executor` EXECUTE 허용, `service_role`/browser 실행 불허. PG17 격리 재생(`1510 + timestamped 2`, 원격-only bundle 재실행 없음) 비교 결과는 기존 `seyeon-r2-cross-env-catalog`에 추가된 `verify-seyeon-r2-g-lineage.mjs` 검증으로 고정. 유효권한/Owner/DDL mismatch는 fail-closed; ACL raw-only drift도 HOLD로 기록. 부정 테스트는 잘못된 remote digest·history·토큰·ACL·브라우저 접근·Role/DDL drift를 거부한다.
- **원천 감사 미충족**: 승인된 비공개 원본 SQL 아카이브의 출처·보존 hash, 실제 실행 도구/주체/시각·승인자, timestamped/번호 migration의 실제 전환 트랜잭션 재구성이 필요. PostgreSQL 일반 catalog와 실패 로그만으로 역사적 성공 경로를 복원하거나 권한 의도를 승인하지 않는다.
- Production history/Role/ACL/DDL/DML **쓰기 0**. R1 scoped DONE; R2/R2-G source audit HOLD, `1520~1720` 0/21, `dr_ready=false`, #1866 G0~G6/유료 AI·사용자 공개 HOLD.

## 15. 2026-10-14 R2-H-1 — 1520 독립 Owner 검토 단위: 격리 PG17 함수교체·롤백 증명

- **검토 범위:** 9개 Owner 검토 단위 중 첫 번째 `deletion` / `1520_account_deletion_finalizer_relationship_runtime_sync.sql`만 대상으로 한다. 기존 인벤토리의 blob SHA `9cab84727c33d2ffb6985119b22ec284c9ed025a`를 변경하지 않는다. 1530~1720 및 원격 전용 `20261008090417` SQL은 실행하지 않는다.
- **재생 경계:** 기존 `apply_pg17_migrations_through_seyeon_production_frontier`에서 1510과 허용된 timestamped 2개까지만 격리 적용한 후, 별도 **한 연결의 BEGIN → 1520 → ROLLBACK** 실행. 전/후/복구 시 함수 `internal_finalize_account_deletion_db_v1(uuid,uuid,text)`의 DDL·Owner·ACL 지문 및 `SECURITY DEFINER`, `search_path`, browser/API/service EXECUTE, 1530 이후 객체 부재를 비교한다. 실제 개인정보 또는 권한 원문은 출력하지 않는다.
- **검증기/부정 테스트:** `verify-seyeon-r2-h-1520.mjs`, `tests/seyeon-r2-h-1520.test.mjs`는 교체 미발생, Owner/ACL 변형, 4개 Role 권한 상승, 잘못된 SECURITY DEFINER/search_path, 1530 선적용, ROLLBACK 불완전·승인 플래그 변조를 fail-closed로 거부한다. 기존 PostgreSQL 17 R2 교차환경 CI에 결합한다.
- **판정 경계:** 코드 검증 통과는 1520의 합성 재현 범위에서만 유효하다. 삭제 처리 실제 양수 데이터·운영 Lock 경합·회복, R2-G 출처·권한 의도, 9개 검토 단위의 Production 배포 승인은 미확인. Production SQL/Role/ACL/history/개인정보 쓰기 없음. `dr_ready=false`, R2/후속 migration/G0~G6/유료 모델/공개 HOLD 유지.

## 16. 2026-10-14 R2-H-2 — 1530 Character Artifact / 1520 의존성 통제 검증

- **검토 범위:** `1530_character_reading_artifact_durable_commit_v1.sql` (git blob `0b369d4955c935992e5243dcb4c2ec87c722a876`), 기존 `character-artifact` 단위. `1520` 의존성을 유지하되 운영 반영하지 않는다. `1540~1720` 및 원격-only 104KB bundle 재실행 금지.
- **재생:** 일회용 PG17, 기존 `1510 + timestamped 2` 기준 → 한 연결 `BEGIN` → 로컬 `1520` → SAVEPOINT → 로컬 `1530` → SAVEPOINT ROLLBACK → FULL ROLLBACK. 지문/카탈로그 **다섯 스냅샷**으로 1520이 실제 재생되었고 1530이 이를 변경하지 않으며 두 롤백이 정확한지 확인. 실제 고객 데이터 및 1530 유료 AI 사용 없음.
- **구체적 검증:** `character_reading_artifacts` 1개 테이블, RLS, PK 1/UNIQUE 2/FK 2/CHECK 4/index 4, trigger 1 (BEFORE UPDATE/DELETE), 단일 좁은 Role, RLS 정책 2개(Subject와 허용된 face artifact), SECURITY DEFINER 명령 1, Server executor EXECUTE, 브라우저·service 직접 EXECUTE / 테이블 DML 거부. Owner/DDL/ACL raw 정보는 출력하지 않음. 테스트·CI에서도 SHA/건수/boolean만 출력.
- **잠재 미승인 보안 사항:** 1530 원본은 `GRANT myeongha_character_reading_artifact_runtime_owner TO current_user` 이후 직접 멤버십 `REVOKE`를 포함하지 않는다. 격리에서 creator의 멤버십 잔존 여부를 측정하며 **성공적으로 재현되어도 `HOLD_R2_H_1530_CREATOR_ROLE_MEMBERSHIP_RETAINED_OWNER_REVIEW`**로 표기한다. Owner/Security 검증 없이 원본 파일을 바꾸거나 Production Role을 수정하지 않는다.
- **추가 미검증:** 실 운영 계정 삭제/생체 원본 오염 차단의 양수 트랜잭션, 두 세션 경합, Owner 실행 경계 및 롤백 Runbook. R2 원본 출처·승인 HOLD, `dr_ready=false`, G0~G6/유료/공개 HOLD.

## 17. 2026-10-14 R2-H-3 — 1540 Saju Proof Nonce Registry 독립 격리 검증

- **인벤토리/의존성:** `1540_saju_source_proof_nonce_claim_authority_v1.sql` Git blob `f6a87a80db1a1463cca34b7f09e157a8ede3b4cd`; `saju-proof`, Owner `saju-security`, requires `[]`. 1520/1530 또는 1550~1720을 이 검증에서 실행하지 않으며 21개 인벤토리/원본 SQL을 변경하지 않는다.
- **검증 경계:** 기존 1510 + 타임스탬프 2개가 적용된 폐기형 PostgreSQL 17에서 한 연결 `BEGIN → 1540 → synthetic digest/retention/duplicate constraint probes → ROLLBACK`. 운영 DB Production 읽기 전용, 실제 사용자·원본 nonce·서명·생년 정보 없음. 3개 보호 메타데이터 스냅샷으로 스키마 생성, RLS + FORCE RLS, replay digest 64자 검사/retention check, PK·index, 두 NOLOGIN/NOINHERIT/NOBYPASSRLS Role, 최소 컬럼별 GRANT, 4개 분리 RLS 정책 및 rollback을 검증.
- **부정 계약:** `anon`/`authenticated`/`service_role`/`myeongha_api_executor` 직접 테이블 DML 불가; runtime SELECT digest만/INSERT digest+retention만, DELETE 불가; GC SELECT digest+retention 및 DELETE만, INSERT/UPDATE 불가; 생성자의 두 신규 Role 직접 멤버십 없음. 원문 SQL·ACL·Row·Role graph 외부 반출 없이 건수/boolean만 확인.
- **범위 제한:** 원본 nonce가 API에서 SHA-256 도메인 분리되어 전달되는지, HTTP proof 경로 활성화, 키 관리, 클라이언트 replay 공격/동시성, 실제 GC 운영·만료 처리는 이번 DB 격리 카탈로그/합성 row 검증의 결과로 인정하지 않는다. GitHub CI GREEN은 Production 배포 승인/승격이 아니다. Owner 검토/배포/롤백 Runbook 및 R2-G 원천감사 HOLD; `dr_ready=false`, G0~G6/유료/공개 HOLD.
