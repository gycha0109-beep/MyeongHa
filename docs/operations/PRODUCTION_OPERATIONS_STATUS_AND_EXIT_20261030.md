# Production Operations — 구현 목적·실제 엔드포인트·종료 기준 및 현황 보고서

> 기준일: 2026-10-30 KST (관측 시점별 스냅샷이며 지속적인 정상 상태 보증이 아님)
>
> 트랙: `ops` / 저장소: `gycha0109-beep/MyeongHa`
>
> 기준 소스: 병합된 `main` `a3a78bdf6df0824aed018e37cb70c0c1690d5b94` (PR [#2770](https://github.com/gycha0109-beep/MyeongHa/pull/2770))
>
> 최종 판정: **코드·배포·익명 운영 점검 일부 확인 / 전체 Production Operations ACCEPTANCE = 미완료**. `dr_ready=false`, `serviceResumptionAllowed=false` 상태를 변경하지 않음.

## Worklog — 운영 트랙 작업 이력

### 2026-11-01 KST — PR #2835 중복 통합 CI RED 원인 및 정식 재제출

- **정확한 실패:** [통합 #41232685886](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41232685886)에서는 `admission` FAILURE, `full` SKIPPED. `Integration requires the dedicated CI submission label event`가 원인이다. 일반 `ops` 라벨 이벤트는 정식 제출 이벤트가 아니므로 보안상 거부된 것이고, 애플리케이션·DB·복원 테스트의 실패가 아니다.
- **같은 원본의 독립 통과 증거:** [통합 #41232685514](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41232685514)는 동일 PR HEAD `8f910c72d6ec54968aeeda0997688c83125eefe3`의 `ci-integration-ready` 제출 이벤트를 받아 `admission`, 전체 `full`, `CI Integration Verify` **SUCCESS**. 다만 중복 실패 체크가 PR 차단 상태로 남았으므로 성공 실행만을 병합 완료로 간주하지 않는다.
- **조치:** Worklog의 현재 실패 진단을 커밋해 HEAD를 갱신한 뒤 필요한 기본 CI가 통과하면 `ci-integration-ready` 라벨 **하나만 제거/재적용**하여 새 HEAD를 전용 이벤트로 다시 제출한다. `ops` 라벨은 건드리지 않아 다른 일반 라벨 이벤트를 발생시키지 않는다. 자동 병합은 유지한다. 새 통합 CI의 실제 PASS 및 병합 완료는 별도 확인 전 미판정.
- **운영 보호:** 이 작업은 CI 제출 절차 및 문서 근거만 수정한다. Production DB·Cloudflare 배포·Supabase migration/Role/ACL/비밀 변경 없음. `dr_ready=false`, `serviceResumptionAllowed=false`, #1887 OPEN 유지.


### 2026-11-01 KST — Phase 8 실제 DB ACL·백업 신선도 확인 및 현재 Production 보호 백업 재실행

- **범위:** Supabase Production `cnsfpcdiyofqvhpcegfc`의 승인된 `scripts/operations/seyeon-r2-rpc-set-fingerprint-readonly.sql` 및 `seyeon-r2-acl-grants-canonical-readonly.sql`을 **SELECT만** 실행했다. PostgreSQL 17, 대상 RPC **19/19 존재**, 누락 **0**, `anon`/`authenticated` 직접 실행 가능 **0/19**. 함수 정의/Owner 등 원문·개인정보·비밀을 출력하지 않았으며 집계 fingerprint만 확인했다.
- **ACL 변화 주의:** 현 19개 RPC의 명시적 허가 관계 **38건**. 2026-10-29 기존 근거의 **37건**보다 1건 많으므로 정확한 변경 시점·승인 경로·기능별 기대 권한이 확정되기 전에는 **ACL 전체 동등성 PASS를 선언하지 않는다**. 브라우저 실행 권한이 새로 열린 증거는 없다. `GRANT`/`REVOKE` 미실행.
- **역사적 변경 위험 구분:** 원격 전용 `20261008090417`는 이번 읽기 전용 재확인에서 **104,021 UTF-8 byte**, SHA-256 `4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894`로 기존 기록과 일치. 기존 [2026-10-16 R2-G 위험 수용 결정](SEYEON_R2_G_OWNER_RISK_ACCEPTANCE_20261016.md)의 `CLOSED_RISK_ACCEPTED` 유지: 역사적 실행자·요청 ID·COMMIT 원본 추적을 개발 차단 조건으로 재개하지 않는다. 현재 운영 ACL/DDL/스키마 동등성과 DR 검증은 별개.
- **실제 백업 신선도:** 기존 기록에 적힌 2026-10-29 한 차례 외에도 자동 암호화 백업 [#40967959395](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40967959395) 및 [#41136999464](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41136999464) 모두 SUCCESS. 가장 최근 확인된 백업 #41136999464의 frontier는 `20261030021027`, 산출물 `13017123378` (암호화/보존기한 2026-11-29). 독립 조회한 현 Production 최신 migration `20261031182926`보다 과거 스냅샷이므로 **최신 스키마 커버/실제 복원 성공을 추정하지 않는다**.
- **보호 백업 성공 + 격리 복원 제출:** `main` `a71851de0f29db81e5891ed9ecf470450a59b5a9`에서 기존 `Production PostgreSQL Logical Backup`을 수동 실행, [백업 #41231798713](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41231798713) **SUCCESS**, 암호화 Artifact `13054460230` (2026-11-30T19:00:05Z 만료), 기록된 frontier `20261031185454`. 이후 Production `supabase_migrations`를 독립 SELECT하여 **227개 적용 이력, 최신 frontier `20261031185454` 일치** 확인. 해당 최신 원격-only 항목 이름은 `seyeon_owner_legacy_room_archive_preserving_history_20261101`이며 변경 SQL 본문·행은 출력하지 않았다. 기존 보호 [격리 PostgreSQL17 복원 #41232195180](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41232195180)을 backup_run_id `41231798713`, incident 기준 `2026-10-31T19:00:15Z`, ops 귀속으로 제출. **복원 성공은 아래 실증으로 확인했으나 Hosted 동등성은 미입증.** 운영 DB SQL/스키마/마이그레이션·비밀 설정을 변경하지 않았다.
- **최신 백업 격리 복원 PASS:** [Protected isolated PostgreSQL17 restore #41232195180](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41232195180) **SUCCESS**, 근거 artifact `13053338927` (SHA-256 `5d971573d819695baa206f62b2db3c92d9d82037e7d75d9329bcb54a8588cf8a`, 만료 2026-11-30T19:02:11Z). 복원 보고서가 `backup_workflow_run_id=41231798713`, `backup_migration_frontier=20261031185454`를 확인했다. 초기 6개 migration version/name snapshot, 11개 함수·6개 RLS, 인증 요청 제한 테이블/소유권/ACL/합성 admission PASS. 합성 개인정보 replay/finalization은 PASS지만 **실제 지속 수집 개인정보 이벤트 replay는 이번 실행에서 수행하지 않았다**. 검증 산출물 `recovered-serving-admission.json`은 `gate=BLOCKED`, `serviceResumptionAllowed=false`, `providerManagedDataFullRestore=false`, `futureSafePrivacyReconciliation=false`, `drReady=false`를 명시한다.
- **차단 유지:** Hosted Auth/Storage 원본 복구, 지속적인 독립 개인정보 삭제·철회 연속성, 전체 서비스 RPO 24시간/RTO 6시간은 아직 미입증. `dr_ready=false`, `provider_managed_data_full_restore=false`, `future_safe_privacy_reconciliation=false`, `serviceResumptionAllowed=false` 유지. #1887 OPEN.


### 2026-11-01 KST — Phase 8 실제 Supabase Production migration 이력 읽기 전용 대조

- **검증 경계:** 명하 Production Supabase `MyengHa` project ref `cnsfpcdiyofqvhpcegfc`의 `list_migrations` 읽기 전용 조회를 현장 수행. 비교 저장소는 GitHub `main` `cbef94d1d8c6fcbb9d9c6d2e798a6431fe0af0fd`의 `supabase/migrations/*.sql`; 파일을 변경하지 않았다. 버전 문자열의 **정확 일치 여부만** 비교했으며 실제 적용 SQL/DDL/ACL/checksum 동등성 검증이 아니다.
- **실측:** 원격 적용 이력 **226개**, 저장소 SQL 파일 **217개**, 버전 일치 **200개**, 원격에만 존재하는 버전 **26개**, 저장소에만 존재하는 버전 **17개**. 원격 최신 `20261031182926` (`s0_g0_relationship_original_lineage_scoped_owner_grant_20261101`); 저장소의 파일명 기준 최신 버전 `20261029185500`. 여러 다른 개발 트랙의 최신 변경이 포함될 수 있으므로 무단 정리·재배열 금지.
- **미해결 핵심:** 원격 전용 `20261008090417` (`seyeon_runtime_1460_1510_acl_before_owner_recovery`) 여전. 동일 논리 이름 `owner_kcp_sandbox_remove_daily_limit_v1`도 원격 `20261029012948`과 저장소 `20261029012000`으로 **버전 불일치**. 최신 Admin/보안 원격 버전은 저장소 파일에 없으며, 저장소의 최신 공식 사주 발급 migration 파일은 원격 적용 목록에서 확인되지 않았다.
- **판정 및 행동:** #1887 **OPEN**, `dr_ready=false`, `serviceResumptionAllowed=false` 유지. **Migration repair/revert/apply, Production DDL, DB 사용자·권한·데이터 변경 없음.** 각 불일치 버전의 원본·적용 SQL·DDL/checksum·승인/배포 귀속을 확인한 뒤에만 안전한 forward-only 정합화를 검토하고, 그 이후 최신 백업/격리 복원을 재실행한다. 단순 이름 유사성으로 동등성 확정 또는 DR 출시 승인 금지.


### 2026-11-01 KST — Phase 13 최신 Cloudflare 실제 배포 100% 및 익명·Member/DB/Saju E2E 수용 증거 갱신

- **실제 Provider 버전(독립 조회):** Cloudflare Workers `myeongha` 배포 API GET의 최신 배포 `4b583e11-0aa4-458b-b490-fa0f603df6af`, 2026-10-31T18:17:04Z, 활성 버전 `7e18da4b-4374-449d-8fd0-133bc6541244` 100% 확인. E2E 이후 동일 버전 100%를 재조회했다. 이는 GitHub `main` SHA 또는 전체 의존성/배포 아티팩트 동등성의 증거가 아니다.
- **현재 main 소스 근거:** 검증 두 건 모두 GitHub `main` checkout SHA `cbef94d1d8c6fcbb9d9c6d2e798a6431fe0af0fd`. 해당 source에서 운영 엔드포인트 검사를 실행했다는 뜻이며 Worker 바이너리가 같은 Git SHA로 빌드됐다는 독립 증빙은 아직 별도이다.
- **익명 live smoke PASS:** [Cloudflare Primary Worker E2E #41230000760](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41230000760) **SUCCESS**, 2026-10-31T18:33:55Z 종료. `operations` 모드 결과에 Worker 헤더 관측 버전 `7e18da4b-4374-449d-8fd0-133bc6541244` 일치, 화면 200, health 200, readiness(config-only) 200, 비인증 Member/Saju/preview 401, 교차 Origin 로그인 403, 미지 경로 404, 잘못된 health method 405 확인. `liveDependencyConnectivityProven=false`는 이 익명 검사의 정상 범위다.
- **로그인·DB·사주 실서비스 E2E PASS:** [Cloudflare Primary Worker Authenticated E2E #41230003340](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41230003340) **SUCCESS**, 정확한 동일 Worker 버전 요청 헤더 검증 후 전용 Member 로그인 200, DB 주체 귀속 200, 현재 Birth revision 조회 200, 계산-only Saju 연동 200. 기존 governed 계정/시크릿 사용, 새 사용자 등록·업무 프로필 수정·결제·해석·Provider Chat 없음(로그인 세션 발급은 발생). Chat 경로는 기존 503 HOLD를 유지하며 양성 Chat 기능 수용이 아니다.
- **판정 범위:** 현재 확인된 정확한 Worker 버전에서 익명 경계와 양성 Auth/DB/Saju 기본 경로를 각각 실증했다. 다만 readiness는 설정 점검이며 DB/Saju 장애 회복, 로그 실제 샘플/redaction, 의존성별 p95, rollback, Hosted Auth/Storage 통합 복원, RPO/RTO는 여전히 **NOT_ACCEPTED**. #1887, `dr_ready=false`, `serviceResumptionAllowed=false` 유지. 배포 버전이 바뀌면 이 두 실증을 새 버전의 수용으로 자동 복제하지 않는다.


### 2026-11-01 KST — PR #2821 병합 확인, PR #2829 전용 라벨 통합 재제출 및 운영 TLS 권한 구분

- **선행 병합:** [PR #2821](https://github.com/gycha0109-beep/MyeongHa/pull/2821) source `54279060c4906b4958e021801aa7119946f1c775`는 [동일 HEAD 통합 CI #41220458822](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41220458822) **SUCCESS** 후 2026-11-01 01:48 KST 병합 확인. PostgreSQL 18 격리 인증서 신뢰/호스트명/평문 차단 증거는 합성 환경에 한정된다.
- **후속 구현:** [PR #2829](https://github.com/gycha0109-beep/MyeongHa/pull/2829), source HEAD `3ff20f6a175a2c7a10cee8d7561172c2424ff4e9`. 기존 실소스 `buildProductionPostgresStrictTlsTargetV1`을 격리 PostgreSQL 18과 합성 CA/동적 fingerprint로 시험. 로컬 신규 **1/1 PASS**, TLS 관련 회귀 **38/38 PASS**, TypeScript PASS. CI 환경에 PostgreSQL 실행 경로가 없으면 실제 DB 검증 테스트는 skip하므로 CI green을 실DB 실증으로 대체하지 않는다.
- **최초 CI 정책 거부:** 동일 HEAD 기본 CI [#41224238048](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41224238048), Governance [#41224238067](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41224238067), Web PR [#41224238046](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41224238046) **SUCCESS**. [통합 #41224242474](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41224242474)은 `Integration requires the dedicated CI submission label event`로 admission FAILURE, `full` SKIPPED; 코드 실패로 오분류하지 않는다.
- **실제 재제출 및 완료:** 선행 검사가 성공한 원본 PR에 `ci-integration-ready` 라벨 적용. [신규 통합 #41227956293](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41227956293) 동 HEAD **SUCCESS**. [PR #2829](https://github.com/gycha0109-beep/MyeongHa/pull/2829)는 2026-11-01 03:15 KST 자동 병합, merge SHA `cbef94d1d8c6fcbb9d9c6d2e798a6431fe0af0fd` 확인. 최초 통합 RED는 제출 이벤트 오류이며 소스 검증 실패가 아니다.
- **기존 Production TLS authority와 구분:** `config/operations/production-postgres-tls-peer-verification-v1.json`에는 2026-09-28의 운영 인증서 pin, verify-full canary 및 일반 풀 활성화 검증 이력([#36475232900](https://github.com/gycha0109-beep/MyeongHa/actions/runs/36475232900), [#36497482499](https://github.com/gycha0109-beep/MyeongHa/actions/runs/36497482499))이 이미 있다. **운영 TLS 설정을 이번 작업에서 처음 구현한 것으로 기록하지 않는다.** 이는 과거 범위의 근거이며 현재 Cloudflare Worker·운영 DB·PG17/실제 RLS의 최신 종합 수용으로 자동 승격하지 않는다. #2829는 Production의 고정 CA/pin·실제 접속 비밀을 사용하지 않았다.
- **변경 및 다음 경계:** 이 기록은 기존 운영 Worklog에만 추가한다. Production DB/Cloudflare/Supabase/비밀·개인정보는 변경하지 않는다. #2829 통합·병합 확인 후 최신 배포와 연결된 읽기 전용 운영 DB 역할/TLS 증거 및 DR #1887 불일치 해소가 남는다. `dr_ready=false`, `serviceResumptionAllowed=false` 유지.


### 2026-11-01 KST — PR #2815 통합 CI 정책 거부 원인 확인 및 라벨 이벤트 재제출

- **대상:** [PR #2815](https://github.com/gycha0109-beep/MyeongHa/pull/2815), source HEAD `a6c9b409b280a75a82f5b7d6218243895a42879a`, Phase 7 격리 PostgreSQL 역할/RLS 트랜잭션 경계 실증.
- **RED 직접 원인:** [통합 CI #41215285132](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41215285132)의 admission 단계가 `Integration requires the dedicated CI submission label event`로 FAILURE. 전체 `full` job은 skipped여서 코드 테스트가 실패한 것이 아니며, 최초 일반 PR 이벤트의 필수 제출 형식이 잘못됐음.
- **다른 검사 결과:** 같은 HEAD의 [기본 CI #41215279578](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41215279578), [Governance #41215279620](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41215279620), [Web PR Domain Gates #41215279572](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41215279572), Cloudflare Workers Builds, `Work Track · ops` 모두 SUCCESS.
- **실제 재제출:** 필수 검사가 전부 성공한 후 PR #2815에 **`ci-integration-ready` 전용 라벨**을 적용해 [통합 CI #41216562286](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41216562286)을 동일 HEAD에서 새로 제출. 재제출 접수와 실행 상태는 확인했지만 **최종 결과/병합 여부는 미확정**이며 PASS 추정 금지. 단순 `rerun failed jobs`는 원래 이벤트를 바꾸지 못하므로 사용하지 않음.
- **변경 경계:** 제품 코드, 합성 RLS 테스트, PostgreSQL/Cloudflare 운영 설정, 비밀정보·사용자 데이터를 변경하지 않음. 기존 Worklog만 별도 문서 PR로 기록해 원본 PR의 통합 실행을 방해하지 않음. Phase 8 DR·Phase 13 전체 운영 수용 미완료; `dr_ready=false`, `serviceResumptionAllowed=false` 유지.

### 2026-11-01 KST — PR #2810 통합 CI 제출 이벤트 RED 확인 및 재제출

- **대상:** [Phase 11 격리 PostgreSQL 용량 계측 PR #2810](https://github.com/gycha0109-beep/MyeongHa/pull/2810), 원본 HEAD `d4d647ba7daad901f7f6571bbfea59bb0230c653`. 해당 HEAD의 GitHub [CI #41211802736](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41211802736), [Governance #41211802687](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41211802687), [웹 검사 #41211802683](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41211802683), Cloudflare Workers Builds와 작업 트랙 분류는 모두 **SUCCESS**.
- **RED 원인:** [통합 CI #41211807512](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41211807512)의 `admission` job #124568895568이 `Integration requires the dedicated CI submission label event`로 **FAILURE**. `full` job은 **skipped**로 실제 통합 테스트는 돌지 않음. SQL 측정 도구의 코드 실패가 아니라 **`ci-integration-ready` 전용 라벨 이벤트 미제출**에 따른 정책상 거부이며, 동일 실행의 실패 작업만 재시도해도 입력 이벤트가 바뀌지 않음.
- **실제 보정 및 재제출:** 모든 필수 체크가 완료되었음을 확인하고 **PR #2810에 `ci-integration-ready` 라벨을 적용**해 동일 HEAD의 새로운 [통합 CI #41213071138](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41213071138)를 제출. 최종 결과는 **본 기록 시점 pending**이므로 성공·병합을 추정하지 않음. 원래 PR의 소스 코드, 측정 결과, Production 서비스/DB, Cloudflare 설정 및 비밀은 변경하지 않음.
- **분리된 기록 PR:** 통합 검증이 진행되는 원본 PR #2810의 HEAD를 불필요하게 변경하지 않도록 이번 관측·재제출 기록만 본 기존 Worklog에 별도 커밋으로 누적. Phase 11은 **격리 DB 합성 측정**까지 완료했으나, 실제 운영 SQL/TLS/RLS, Phase 12 확장 기준, Phase 13 운영 수용, Phase 8 DR 수용은 여전히 **미완료**. `dr_ready=false` 및 `serviceResumptionAllowed=false` 유지.

### 2026-10-31 21:31 KST — PR #2803 통합 CI RED 보정 및 최신 main 병합 충돌 해결

- **실제 RED:** [통합 CI #41190779314](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41190779314) (최초 attempt 1)의 admission 실패는 `Integration requires the dedicated CI submission label event`. 이번 RED의 직접 원인은 **전용 `ci-integration-ready` 라벨 제출 이벤트가 아닌 PR 이벤트로 시작된 통합 CI**이며, 해당 커밋 `6a9fd49e`의 일반 CI·Web PR·Governance·Cloudflare Workers Builds는 모두 SUCCESS. 실패 작업을 단순 재실행해도 이벤트 유형이 바뀌지 않으므로 재실행만으로 해결할 수 없음.
- **추가 진행 차단:** PR #2803은 최신 `main` 반영 전 `mergeable_state=dirty`로 확인. 동일 보고서의 상단 Worklog에 PR #2799의 **Phase 7 DB 실측 기록**과 PR #2803의 **Phase 10–11 Health 계측 기록**이 각각 추가되어 문서 병합 충돌이 발생했음. 이는 제품 코드 충돌이 아님.
- **보정:** 기존 PR #2803 브랜치에 최신 `origin/main`을 병합하고 **두 Worklog 기록을 모두 보존**해 문서 충돌 해결. 다른 트랙의 최신 코드·문서도 본문을 변경하지 않고 그대로 병합. 충돌 마커 0건 및 `git diff --check` 확인.
- **실제 로컬 재검증:** 최신 `main` 병합 후 `tsc -p tsconfig.json --noEmit` **PASS** 및 `npx vitest run test/local-worker-health-capacity-phase10-11.test.ts` **PASS**. 로컬 Worker Health 50개 기준 표본 p95 **1.113ms**, 동시 4개/8개 각각 100건 모두 200(실패 0), p95 각각 **3.283ms / 6.141ms**. 단일 개발 PC 계측으로 Production 용량·SLO 증거가 아님.
- **재시도·종료 조건:** 보정한 새 HEAD의 일반 CI, Governance, Web PR 등 **필수 체크가 실제 SUCCESS인 것을 확인한 뒤** `ci-integration-ready` 전용 라벨 이벤트를 발생시켜 통합 검증 재제출. **신규 원격 CI·통합 결과 및 자동 병합은 완료 확인 전 성공으로 기록하지 않음.** Production DB/서비스/Cloudflare 설정 변경 없음. DR 및 운영 전체 수용 차단 유지.



### 2026-10-31 18:56 KST — Phase 10–11 격리 Worker Health 지연·동시 요청 계측

- **목표:** [Production Operations 아키텍처 §28–29](../architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md)의 기초 지연·제한된 동시 요청 측정을 기존 **루프백 전용 유틸**로 실제 수행. 실서비스 사용자의 요청이나 Production Worker/DB/Auth/Saju에 부하를 주지 않음.
- **구현:** [`test/local-worker-health-capacity-phase10-11.test.ts`](../../test/local-worker-health-capacity-phase10-11.test.ts) 추가. 실제 소스의 `myeongha-worker.mjs` `GET /api/health`를 임의 `127.0.0.1` 포트의 Node HTTP 서버를 통해 호출. 기존 `collectLoopbackApiBaseline`(warmup 5 + 표본 50), `measureControlledLoopbackCapacity`(100건씩 동시 4개·8개)를 재사용하며 총 255개의 **로컬 진단 요청**으로 측정. 성공 응답 200, 실패 0, 설정된 동시 상한 이내인지 검증. 측정 서버는 테스트 종료 때 모든 연결을 닫고 종료함.
- **실제 관측:** Windows Node 24 / Vitest 4.1.11의 **최종 재실행 PASS**, `tsc --noEmit` PASS. 마지막 실행에서 baseline p50 **0.569ms**, p95 **1.566ms**, p99 **2.677ms** (50개). 동시 4개·100건 모두 PASS, peak=4, 관측 **1,974.778req/s**, 성공 지연 p95 **2.685ms**. 동시 8개·100건 모두 PASS, peak=8, 관측 **1,883.399req/s**, 성공 지연 p95 **6.088ms**. 초기 계측도 전 건 성공했으나, 수치는 매 실행·PC 상태에 따라 달라지는 단일 실험값이며 서비스 SLO로 승인된 값이 아님.
- **재현 환경 보정:** Worker 원본은 `.js`로 표시되는 TypeScript 소스를 테스트 번들러가 해석하므로 순수 Node 직접 실행은 모듈 경로 오류였음. 해당 임시 CLI를 채택하지 않고 기존 Vitest 환경에서 실행되는 테스트로 구현. 외부 워크트리의 `node_modules` Junction은 동일 패키지 타입의 중복 선언 오류를 유발해 제거하고, **독립 `npm ci`** 후 타입 검사 및 측정을 모두 통과시킴.
- **명시적 수용 한계:** 이것은 **로컬·단순 Health 라우트의 마이크로 계측**일 뿐 Production web TTFB, API 사용자 경로 p95, DB/Auth/Saju 종단 지연, 실제 Cold start, 연결 풀·DB 포화 용량이나 Cloudflare Worker의 고객 트래픽 처리 한계를 입증하지 않음. `productionCapacityProven=false`, `realDbDependencyMeasured=false` 유지. Phase 10–12 전체 수용, Phase 13 Production Operations ACCEPTANCE, Phase 8 DR 준비 상태를 승격하지 않음.
- **추적·후속:** 브랜치 `ops/phase10-11-loopback-worker-health-worklog-20261031`에서 동일 문서와 재현 가능한 테스트를 PR로 제출. 이후 운영 경계의 정당한 합성 데이터·격리 DB를 연결한 별도 실측 필요.

### 2026-10-31 18:36 KST — Phase 7 격리 PostgreSQL 18 실제 SQL 지연·연결 고갈 실증

- **구현:** [`scripts/operations/verify-postgres-isolated-chaos-phase7.mjs`](../../scripts/operations/verify-postgres-isolated-chaos-phase7.mjs) 추가. 로컬 `PG_BIN_DIR` 아래의 `initdb`/`pg_ctl`로 **매번 임시 데이터 디렉터리와 임의 127.0.0.1 포트에 별도 PostgreSQL 인스턴스**를 생성하고, 실제 Node `pg.Pool`로 SQL/연결 테스트. 인스턴스는 `finally`에서 종료하고 임시 디렉터리를 삭제. 기존 로컬 PostgreSQL 서비스 및 Hosted/Production DB 설정·데이터에 접근하지 않음.
- **실제 SQL/포화 실행:** Windows Node 24·로컬 PostgreSQL 18에서 스크립트 exit 0 / 출력 `result=PASS`. 독립 DB의 `SELECT pg_sleep(0.6)`은 `statement_timeout=180ms`에 의해 PostgreSQL 오류 코드 **`57014`**로 중단됨(최종 재현 SQL 취소 **199ms**, 초기 성공 관측 **193ms**). 이어서 동일 풀 `SELECT 1` 성공으로 타임아웃 이후 연결 재사용 정상 확인. `max=1`로 첫 연결을 점유한 동안 대기 중인 두 번째 `pool.connect()`가 `connectionTimeoutMillis=250ms`에 따라 **261ms**에서 종료되며 최대 풀 연결이 1을 넘지 않음을 확인. 격리 서버를 정지한 뒤 새로운 `SELECT 1`의 연결 거부 `ECONNREFUSED` 약 **1ms** 관측.
- **환경 차이·수정:** 첫 시도는 로컬 환경의 SSL 기본설정으로 인해 분리된 인스턴스가 SSL 연결을 거부함. 스크립트 내부의 **임시 격리 DB용 설정에만** `ssl:false`를 명시한 뒤 실행 성공. 운영 DB의 필수 `verify-full` TLS 설정은 변경하지 않음. 테스트용 비밀·사용자 데이터 출력 없음. 실행 결과는 **단일 로컬 시점의 관측**이며 p95/SLO 지표로 사용하지 않음.
- **수용 경계/다음:** 기존 synthetic TCP 테스트와 달리 **실제 PostgreSQL SQL statement timeout과 풀 대기 고갈**까지 증명했으나, Production의 PG17/strict TLS/권한 역할, 실제 MyeongHa DB 라우트 503 경계, Hosted DB 용량·장애 및 복구, 모니터링은 여전히 미검증. Phase 7/13 전체 완료, `dr_ready`, `serviceResumptionAllowed` 승격 금지. 향후 필요 시 동등하게 격리된 PostgreSQL 17에서 같은 검증을 재현하고, 승인된 실제 API 경계로 확대.

### 2026-10-31 22:20 KST — Phase 7 DB 연결 장애 시 Records API HTTP 응답 실증

- **작업 목적:** 아키텍처 §34의 DB unavailable/slow 시 실제 사용자용 HTTP 경계가 안전한 오류를 반환하고, 별도 core health가 계속 가능한지 확인. 운영 DB/실사용자 데이터/실서비스에 요청이나 장애 주입을 하지 않음.
- **실제 구현:** [`test/cloudflare-records-db-fault-real-transport-phase7.test.mjs`](../../test/cloudflare-records-db-fault-real-transport-phase7.test.mjs) 추가. Cloudflare의 **실제 Records 요청 어댑터와 실제 소스 Records HTTP 런타임**을 통해 `GET /api/life-record`, `GET /api/readings`, `GET /api/memories` 3개 경로를 실행. 실제 Node `pg.Pool`은 임의 127.0.0.1 TCP 포트에 연결해 (1) TCP 연결 거부, (2) TCP 수락 후 PostgreSQL handshake 정지 두 조건을 재현. 각 요청은 연결 시도 1회, 정해진 연결 deadline 150ms 및 풀 종료 1회가 적용되는지 검증.
- **통제된 가정:** 운영 인증·TLS/호스트 승인 과정에 실제 계정/인증서를 투입하지 않도록 테스트 환경에서는 **출처·DB 승인 preflight 및 요청 identity verifier만 합성 결과로 주입**. 실제 route handler, Records HTTP runtime, `pg.Pool` TCP 오류, 503 반환/헤더 처리 코드는 프로덕션 소스 그대로 사용. 따라서 실제 Hosted Auth, Cloudflare TLS/RLS 운영 승인, SQL 실행까지 증명하지 않음.
- **실행 증거:** Node 24 / Vitest 4.1.11, 신규 실제 TCP 장애 **6/6 PASS**. 관련 Records API·HTTP/메서드 회귀 포함 **4파일 29/29 PASS** 및 `tsc -p tsconfig.json --noEmit` PASS. 두 조건 모두 각 API에서 HTTP **503** / `AUTH_UPSTREAM_UNAVAILABLE` / `Cache-Control: no-store`, 임의 연결 재시도 없음, pool close 1회, redirect/CORS/cookie/합성 DB 비밀·Bearer 비반사, **독립 `GET /api/health` 200** 확인. 테스트 실제 실행의 실패 처리 시간은 각 2초 이내. 서버와 소켓은 테스트 종료 때 닫음.
- **미완료/경계:** 실제 DB schema SQL 지연, Worker strict TLS `verify-full` 및 Supabase Auth 호출, Production PostgreSQL 17, Hosted DB/사용자 데이터, API p95 및 장애 알림/DR 등은 `NOT_OBSERVED`. Phase 7 전체·Phase 13 운영 수용·DR readiness 승격 금지 (`dr_ready=false`, `serviceResumptionAllowed=false`).
- **추적·다음:** [PR #2806](https://github.com/gycha0109-beep/MyeongHa/pull/2806), 브랜치 `ops/phase7-records-db-api-failure-worklog-20261031`, 최초 구현 커밋 `861656da808ded7131367304dceac01a1e43ea6e`. PR의 작업 분류는 저장소가 요구하는 단독 라인 `Watchtower-Track: ops` 형식으로 보정했으며, 새 커밋의 CI·통합 검사 결과는 **미확정**으로 남김. 이후 §34의 구성·계약에 맞는 안전한 격리 DB 환경에서 TLS/RLS/권한 및 장애 경계 검증, Phase 10~12 운영 실측으로 연결.



### 2026-10-31 18:30 KST — Phase 7 PostgreSQL 로컬 TCP 장애·연결 수 상한 검증

- **구현 목적:** [Production Operations 아키텍처 §34](../architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md)의 DB unavailable, DB slow, DB connection exhaustion 중 *연결·핸드셰이크 경계*를 통제된 비Production 환경에서 실제 소켓으로 검증. 실사용자·실서비스·운영 PostgreSQL 또는 Supabase에 접근하지 않음.
- **실제 변경:** [`test/postgres-subject-pool-loopback-chaos-phase7.test.ts`](../../test/postgres-subject-pool-loopback-chaos-phase7.test.ts) 추가. Node의 실제 `127.0.0.1` TCP 서버와 `pg.Pool`을 사용해 (1) 닫힌 포트의 `ECONNREFUSED`, (2) 연결은 받되 PostgreSQL 핸드셰이크를 진행하지 않는 서버, (3) `maxConnectionsPerRuntime=1`인 상태에서 4개 동시 연결 요청을 시험. 기존 일반 `buildNodePostgresPoolConfigV1`의 `connectionTimeoutMs=125`, `statementTimeoutMs=500`, `maxConnectionsPerRuntime=1` 설정과 실제 pg 드라이버 동작을 함께 확인. 매 실패 후 Cloudflare Worker의 독립 `GET /api/health`가 200인지 검증.
- **실행 증거:** Windows Node 24 + Vitest 4.1.11. 신규 **3/3 PASS**, 관련 PostgreSQL pool 기존 회귀 포함 **5파일 30/30 PASS**, `tsc -p tsconfig.json --noEmit` PASS. 열린 TCP 서버의 연결 수 최대치는 설정된 1을 넘지 않음. 로컬 TCP 요청 시간은 각 시험의 2초 이내 제한 조건을 만족. 합성 사용자·합성 PostgreSQL URL만 사용하며 실제 credential/SQL 데이터 없음.
- **범위 및 한계:** 이것은 **실제 TCP transport/연결 대기·풀 연결 상한 검증**이지, 운영의 strict TLS `verify-full` 경로나 실제 PostgreSQL SQL 실행, `pg_sleep` 등 SQL 지연 시 `statement_timeout` 실행, DB 실제 capacity/성능·500 응답 경로의 종단 간 실증을 대체하지 않는다. 테스트 서버는 PostgreSQL 프로토콜을 구현하지 않으며, 500ms `statementTimeoutMs`는 구성 연결만 검증했지 SQL에서 발동시킨 증거가 아님. §34 전체 Phase 7, Production Operations Phase 13, Hosted Auth/Storage DR은 **미수용**. `dr_ready=false` 및 `serviceResumptionAllowed=false` 유지.
- **추적/다음:** 브랜치 `ops/phase7-postgres-tcp-chaos-worklog-20261031`, 검증 파일과 본 Worklog를 함께 PR로 제출. 다음 순서는 실제 격리 PostgreSQL 인스턴스에서 SQL 지연·연결 점유 제한 및 적절한 오류 매핑을 측정하고, 안전한 성능/용량 기준으로 승격하는 것. Cloudflare Preview 인증 오류는 별도 추적.



### 2026-10-31 — 기록 화면 Guest 401 브라우저 검증 경로 수정

- **목적:** [브라우저 검증 #41178543614](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41178543614)의 최초 실행 및 1회 실패 작업 재실행 모두에서 나타난 `Records ledger authoritative 401 did not invalidate the rejected Guest` 오류를 실제 호출·응답 경계 기준으로 재현하고 해결한다.
- **원인 확인:** `apps/web/records-runtime-client.js`의 현 기록 조회 엔드포인트는 `/api/me`, `/api/life-record`, `/api/readings`임. 그러나 [`scripts/verify-web-auth-rejected-bearer-browser.mjs`](../../scripts/verify-web-auth-rejected-bearer-browser.mjs)의 `records-guest-401` 시나리오는 **기록 화면이 호출하지 않는 `/api/memories`** 에서만 401을 반환했음. 당시 실패 로그에도 실제 `/api/readings` 요청만 남고 `/api/memories` 요청은 없음. 따라서 401이 기록 화면에 도달하지 않은 채 정상 로드되어, 테스트가 Guest bearer 잔존을 실제 세션 무효화 버그로 잘못 판정했음.
- **수정:** 테스트의 Guest 401 주입 지점을 실제 `GET /api/readings`로 이동하고 미사용 `/api/memories` fixture 제거. `records-guest-401` 시나리오에서 **실제로 `/api/readings`에 해당 401을 주입했다는 별도 단언**을 추가하여 향후 페이지 API 이동 시 거짓 검증이 발생하지 않게 함. 제품 코드와 Auth/DB/Cloudflare 환경·비밀·데이터는 변경하지 않음.
- **로컬 실증:** Node 24, `npm run build:web` **PASS**, Windows Edge headless를 Chrome DevTools Protocol로 구동한 `node scripts/verify-web-auth-rejected-bearer-browser.mjs` **PASS** (`MyeongHa_WEB_AUTH_REJECTED_BEARER_BROWSER_PASS`, exit 0). 생성된 JSON 검증 산출물에서 `records-guest-401` 실제 요청은 `/api/me`, `/api/life-record`, **`/api/readings` (rejectedGuest=true)**이고 `/api/memories` 호출 없음. 401 후 Guest bearer가 비워지는 검증과 기존 Member 401/403 구분 테스트 모두 통과함. 산출물은 로컬에만 두고 저장소에 올리지 않음.
- **한계:** 로컬 합성 응답·브라우저 테스트 통과이며 Production 서버 장애·실제 사용자 세션/DR 수용 증거가 아님. **PR/원격 CI 성공 및 병합은 별도 확인 후 기록**하고 Phase 7 DB 장애/Phase 8 DR/Phase 13 운영 수용의 차단 상태는 유지함.
- **추적:** 작업 브랜치 `fix/ops/records-guest-401-browser-proof-20261031`; 원래 관련 PR [#2790](https://github.com/gycha0109-beep/MyeongHa/pull/2790), 재시도 Worklog PR [#2792](https://github.com/gycha0109-beep/MyeongHa/pull/2792). **다음:** GitHub Web Auth Browser Regression에서 재확인, 실제 정상 검증일 때 병합. 원격 실패 시 해당 테스트에서 드러난 새로운 원인을 수정.



### 2026-10-31 17:11 KST — PR #2790 RED 진단 및 실패 작업 재실행

- **요청·대상:** [Auth 로컬 장애 격리 PR #2790](https://github.com/gycha0109-beep/MyeongHa/pull/2790) (head `a012c48cf25cc3b28655cb32bb46bce785ff396c`). PR은 2026-10-31T07:05:39Z에 **실제 병합 완료**. 해당 head의 [기본 CI #41178543652](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41178543652), [정식 Integration #41178551294](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41178551294), Governance [#41178543651](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41178543651)는 SUCCESS. [이전 Integration #41178544791](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41178544791)의 제출 이벤트 admission 실패를 코드 오류로 혼동하지 않음.
- **실제 RED:** [Web Auth Browser Regression #41178543614](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41178543614)에서 첫 번째 검사 묶음 PASS, 두 번째 묶음 FAIL. [실패 작업 #124471023109](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41178543614/job/124471023109)은 `scripts/verify-web-auth-rejected-bearer-browser.mjs`의 'Records ledger authoritative 401 did not invalidate the rejected Guest' 오류. 당시 기록 화면 `/records.html`에서 인증 거부 Guest의 `active` bearer가 잔존하는 것으로 관측됨. 테스트 산출물과 원인 확정 전이므로 '일시적 플레키' 또는 본 운영 트랙의 Auth 서버 수정이 원인이라고 단정하지 않음.
- **재시도 확정 결과:** GitHub Actions의 **실패 작업만 다시 실행** 기능으로 동일 [실행 #41178543614](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41178543614)의 `run_attempt=2`를 실행함. 1번 shard **SUCCESS**, 2번 shard [job #124485970914](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41178543614/job/124485970914) **FAILURE**, 최종 집계 [job #124486205660](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41178543614/job/124486205660) **FAILURE**. 이전과 동일하게 `/records.html`의 401 응답 후 Guest bearer `active` 값이 남았고 `recordsStatus`가 비어 있었음. **일시적 플레키나 정상 결과로 승격 금지**; UI 인증·페이지 부트스트랩의 실제 원인 분석 및 소스 수정이 남음. 추가 무제한 재시도 금지.
- **별도 외부 RED:** PR #2790의 Cloudflare Workers Builds `eed91ae9-8a7e-4a80-9cc1-4504d4610710`는 Provider 기준 outcome FAIL, 대상은 PR 분기 `ops/phase7-auth-loopback-fault-worklog-20261031`, 배포명령 `node scripts/cloudflare-main-web-cd.mjs`. Cloudflare 제공 build logs는 본 조회에서 빈 배열이므로 구체적인 실패 원인을 **미확인**으로 유지. 앞선 [Cloudflare Preview 토큰 실패 Worklog](#2026-10-31--cloudflare-preview-red-실제-원인1회-재시도-pr-2783-후속)와 동일 원인이라고 단정하지 않음. Production 배포 실패로 승격하지 않음.
- **변경 및 운영 범위:** 이번 진단/재시도에서 Auth 애플리케이션 코드·Production 데이터·Cloudflare 운영 구성을 변경하지 않음. 본 문서에 사실 및 증거만 추가. **후속 작업:** 브라우저 재실행 결과가 실패라면 401 후 Guest bearer 무효화 경로를 별도 인증 UI 트랙 관점에서 실제 수정·재검증. Phase 7 DB 및 DR 미수용은 그대로 유지.



### 2026-10-31 15:55 KST — Phase 7 Supabase Auth 실제 로컬 HTTP 장애 검증

- **목적:** 아키텍처 §34의 Auth 불능 시 보호 요청 차단 및 독립 Health 유지 조건을 실제 로컬 TCP/HTTP에서 검증. Production Supabase 계정·DB·로그인 정보는 사용하지 않음.
- **구현:** [`apps/api/src/supabase-auth-loopback-fault-phase7.test.ts`](../../apps/api/src/supabase-auth-loopback-fault-phase7.test.ts) 추가. 고정된 Production Supabase 호스트로 향하는 테스트 호출만 테스트 안에서 로컬 `127.0.0.1` 서버로 치환하여 503 응답, 잘못된 자격증명 401, 요청 제한 429, TCP 연결 거부를 각각 주입. 실서비스·실사용자에 대한 실패 주입 없음.
- **검증 결과:** 신규 Vitest **4/4 PASS**, `npx tsc -p tsconfig.json --noEmit` **PASS**. 각 실패는 계약에 따른 `AUTH_UPSTREAM_UNAVAILABLE`/ `INVALID_CREDENTIALS`/ `RATE_LIMITED` 오류로 매핑, API `no-store`, 테스트 비밀번호·API 키·상류 오류 본문 비반사, 자동 재시도 없음, 독립 Cloudflare Worker `GET /api/health` 200 유지 확인.
- **구현 경계:** 기존 Auth 제품 코드 자체는 변경하지 않음. Auth 느린 응답 5초 실제 종단 간 지연, PostgreSQL 연결 고갈·지연, Cloudflare Production 장애, DR Hosted Auth/Storage 복구, 실제 운영 알림/용량은 **미검증**. 따라서 Phase 7 전체/Phase 8/Phase 13 운영 수용 완료를 주장하지 않음.
- **추적:** 작업 브랜치 `ops/phase7-auth-loopback-fault-worklog-20261031`; 로컬 테스트와 타입 검사 PASS. 후속 CI·PR 검증은 PR 체크 페이지에서 구분. **다음 작업:** DB 장애 및 요청/연결 지연 실증을 독립 격리 환경에서 수행.



이 보고서는 최신 구현 상태뿐 아니라 **각 실행 세션의 실제 변경·실행 증거·남은 차단 항목을 누적**한다. 후속 운영 작업은 기존 기록을 덮어쓰거나 임의 완료율을 붙이지 않고, 날짜별로 **무엇을 바꾸었는지 / 어떤 실행이 PASS·FAIL인지 / 실제로 검증하지 않은 범위 / 관련 PR·CI / 다음 종료 작업**을 남긴다. PR의 GREEN은 해당 운영 항목의 Production 수용을 자동으로 의미하지 않는다.

### 2026-10-31 — Cloudflare Preview RED 실제 원인·1회 재시도 (PR #2783 후속)

- **대상 및 판정 범위:** [PR #2783](https://github.com/gycha0109-beep/MyeongHa/pull/2783) HEAD `ea7815bfeaf97a0afd946bf2acbb5a72ffb3a155`, 외부 체크 [Workers Builds: myeongha #124464858847](https://github.com/gycha0109-beep/MyeongHa/pull/2783/checks?check_run_id=124464858847). Cloudflare **Preview** 빌드이며 `main` Production 배포/실서비스 가용성 판정과 구분.
- **원래 RED 원인:** Cloudflare Workers Build `deff648c-4733-4a1c-b223-3e7dcf1b551f` (2026-10-31T06:23:58Z 종료, FAIL). `npm run build:web` 성공, `npx wrangler preview`에서 Cloudflare API의 프리뷰 엔드포인트가 **Rate limited [10429]**를 반환. TypeScript 오류·웹 빌드 실패가 아니었음.
- **정확한 커밋 1회 수동 재시도:** 기존 Preview trigger `de1b9384-b760-44bd-9529-49fcf995ae7d`의 Workers Builds API에 원본 HEAD `ea7815bf...`를 한 번 제출. 신규 Build `ecd56543-e04f-4cf6-97d3-6d06a1216245` (2026-10-31T06:33:32Z 종료, **FAIL**): 웹 빌드는 다시 SUCCESS, Preview 배포 요청에서 **Authentication error [10000]** 및 `/accounts` 응답 **Invalid access token [9109]**. 이전 10429만으로 완전히 설명되는 사건이 아니며, Build에 연결된 **Preview용 인증 토큰 유효성/권한**이 수용 차단으로 드러남.
- **설정 경계 추가 확인(읽기 전용):** Cloudflare Workers Builds 설정의 `auto_build_enabled=true`, `previews_enabled=false`, Git 배포 브랜치 `ops/phase7-loopback-saju-chaos-worklog-20261030`, 배포 명령 `npx wrangler preview` 및 **빌드 토큰 등록 1개**를 확인. 해당 토큰은 현재 구성에서 단독 사용되므로 정상 Production용 대체 토큰이 있다고 가정할 수 없음. 이 임시 브랜치 기반 Build 설정은 `main` 실제 Production 배포 수용 근거와 별개이며, 임의로 수정하거나 `previews_enabled`를 전체 배포 준비 완료로 해석하면 안 됨.
- **재시도 제한:** 현재 토큰으로 다시 빌드를 반복하면 해결되지 않으므로 추가 재시도하지 않음. 원인 없는 소스 수정, Production 권한의 무분별한 Preview 재사용, 비밀 출력, Token/Cloudflare 설정 변경도 수행하지 않음. 해당 Cloudflare Workers Builds 토큰을 유효하고 필요한 권한 범위로 복구한 뒤, 임시 브랜치 프리뷰 빌드를 계속 유지할지/정리할지 Production 배포 경계와 구분해 결정해야 함. **동일 source SHA의 Preview 배포 성공**은 아직 미확인. 토큰 값은 보고서·CI·PR 댓글에 남기지 않음.
- **동일 PR 코드 검증/병합:** 수정 HEAD의 [GitHub CI #41176340904](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41176340904), [통합 CI #41176368371](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41176368371), Governance [#41176340854](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41176340854) **모두 SUCCESS**. PR은 2026-10-31T06:31:36Z에 자동 병합, `main` merge SHA `1704ad012debed1c3c0612c4a59c3b48cf189cc2`. 따라서 실패한 **브랜치 Preview 체크**가 이 PR의 실제 병합을 차단하지는 않았음.
- **현재 미증명:** Preview 배포 성공, 새 `main` SHA의 Cloudflare Production 배포 성공, 이후 최신 Worker 버전의 실서비스 E2E는 이 작업으로 **증명하지 않음**. Phase 8 DR 차단과 운영 수용 미완료도 유지.
- **다음 작업/블로커:** Preview Build 토큰 유효성 복구 및 동일 SHA 재검증이 외부 설정 블로커. 신규 코드 변경 없음. 본 Worklog는 **외부 서비스 체크 실패 원인과 재시도 결과**를 기록하는 작업으로, 운영 배포 완료를 선언하지 않음.

### 2026-10-31 15:20 KST — Phase 7 CI RED 실제 타입 오류 수정 및 재검증

- **대상:** [PR #2783](https://github.com/gycha0109-beep/MyeongHa/pull/2783), 이전 HEAD `8069e90dc05647f57f1c873ddc9749bc4822f24f`.
- **실패 사실:** [CI #41027086821](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41027086821)에서 기존 테스트 29개는 별개로, TypeScript의 `TS7016`(JavaScript Worker 모듈 타입 선언 부재), `TS2560/TS2559/TS7006`(HTTP 서버 listener의 타입을 options로 오인하고 매개변수가 암시적 any로 처리됨)으로 `npx tsc -p tsconfig.json --noEmit` FAIL. 이전 [통합 #41027106803](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41027106803)은 제출 이벤트 위반, 후속 [#41027119135](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41027119135)은 실제 `CI Verify` 실패로 선행 검증 거부. 서로 구별해야 함.
- **수정:** [`test/saju-production-calculation-loopback-chaos-phase7.test.ts`](../../test/saju-production-calculation-loopback-chaos-phase7.test.ts)의 `listen(handler)`를 Node `RequestListener`로 명시하여 실제 HTTP 함수 콜백을 정확하게 타입화. 이미 실행·검증된 JavaScript 기반 Cloudflare Worker import 한 줄에는 해당 단일 모듈의 타입 선언 부재만 국소적으로 설명·억제. 런타임 동작, 운영 비밀, Production 엔드포인트, 장애 시험 시나리오는 변경하지 않음.
- **재검증:** 수정 커밋 `4217945b219b5e124b7cdceec435060357f5a85c`. **이 Worklog 작성 시점의 신규 CI/tsc 결과는 미확인**이므로 PASS 주장 금지. PR의 후속 GitHub CI 타입 검사·통합 검사 링크와 결과가 확인되어야 종료됨.
- **남은 것:** CI에서 실제 타입·기능 테스트 재확인, 병합 조건 충족. Phase 7의 Hosted DB/Auth/Cloud Run 장애 주입과 Phase 8 DR 등 별도 미수용은 유지. **다음 작업:** 동일 PR의 CI 확인 후 자동 병합; 실패하면 같은 변경 범위 안에서 보수 수정.

### 2026-10-30 17:29 KST — Phase 7, Saju 종속 장애의 실제 루프백 HTTP 주입

- **구현 목적:** `docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md` §34 Saju kill/slow/wrong credential 장애 격리 조건을, 단순 mocked fetch가 아닌 **실제 TCP/HTTP 송수신**에서 재현한다. 사용자 데이터·Production 서버는 사용하지 않는다.
- **실제 변경:** [`test/saju-production-calculation-loopback-chaos-phase7.test.ts`](../../test/saju-production-calculation-loopback-chaos-phase7.test.ts) 추가. `127.0.0.1`의 단독 Node HTTP 서버가 (1) 연결이 끊긴 Saju origin, (2) 헤더 400ms 지연, (3) 헤더 후 응답 본문 400ms 지연, (4) 틀린 합성 Bearer를 주입한다. 실제 `fetch`를 쓰는 Saju 계산 어댑터의 deadline `80ms`, `TIMEOUT`/`NETWORK_FAILURE`/`HTTP_4XX`, 오류 비밀 비반사·공개 오류 축약, 단일 요청(재시도 금지)과 **각 경우 Cloudflare Worker의 독립 `GET /api/health` 200**을 확인한다. 생년월일 등은 고정된 합성 fixture이다.
- **실제 실행 결과:** Windows 격리 Git worktree, Node 24, Vitest 4.1.11. 기존 Saju HTTP/response cleanup/deadline/kill-switch 테스트 **5개 파일·25개 테스트 PASS** (`TEST_EXIT=0`), 신규 실제 루프백 TCP 장애 **1개 파일·4개 테스트 PASS** (`TEST_EXIT=0`). 실행 표적은 Production이 아니라 로컬 합성 HTTP 서버이다. 400ms 지연보다 짧은 80ms caller timeout 후 반환되고, core health는 계속 200이었다. 테스트 실행은 실시간 Production 서비스 장애를 발생시키지 않았다.
- **검증 범위/미완료:** **Saju production adapter 구현의 실제 로컬 네트워크 실패 경계**만 확인했다. Cloud Run 실제 인스턴스 kill, Hosted PostgreSQL 불능/slow/exhaustion, 전체 사용자 라우트의 Saju 장애 응답, Auth/비밀 회전, Production p95 및 장애 알림/복구는 **NOT_OBSERVED**. Phase 7 전체 완료·DR readiness·서비스 재개 승격은 불가.
- **추적:** [PR #2783](https://github.com/gycha0109-beep/MyeongHa/pull/2783), 최초 테스트/구현 커밋 `7cb9300ce5bf8d2b6e94a031f4009743107cad51`, 브랜치 `ops/phase7-loopback-saju-chaos-worklog-20261030`. [PR 체크](https://github.com/gycha0109-beep/MyeongHa/pull/2783/checks)는 원격 검증 증거이며, 아직 실행/완료 전에는 성공으로 간주하지 않는다. **다음 작업:** 안전한 격리 환경의 DB/Auth/Saju dependency 실제 실패·지연 검증과 Phase 10–12 측정. 필요한 통제 조건이 없으면 PASS가 아니라 BLOCKED로 분류한다.

### 2026-10-31 — PR #2796 통합 CI 실행 순서 RED 보정·실패 작업 재실행

- **실제 코드 및 독립 검증:** [PR #2796](https://github.com/gycha0109-beep/MyeongHa/pull/2796) head `4baa4d07972298e61139b65122feaf55667bdaf8`의 [Web Auth Browser Regression #41185845104](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41185845104), [CI #41185845072](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41185845072), [Governance #41185845015](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41185845015), [Web PR #41185845029](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41185845029), Cloudflare Workers Builds는 각각 **SUCCESS**. 따라서 Guest 401 브라우저 검증기 변경 자체가 이 RED의 원인은 아님.
- **실패 원인 구분:** [통합 #41185847945](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41185847945)는 별도 제출 라벨 이벤트가 아닌 요청이라 정책상 `Integration requires the dedicated CI submission label event`로 거부. 이후 라벨로 제출된 [통합 #41185858051](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41185858051)의 **첫 실행**은 필수 `Web PR Verify` 체크가 진행 중이라 `Required check is pending: Web PR Verify`로 admission FAIL. 이는 필수 검사 완료 전 통합 검증이 시작된 순서 문제.
- **실제 조치:** 같은 head에서 `Web PR Verify` 등 필수 체크가 모두 성공한 사실을 확인한 뒤, [통합 #41185858051](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41185858051)의 **실패 작업만 재실행** (attempt 2). 두 번째 진입 검사 `admission` **SUCCESS** 확인. 본 Worklog 작성 당시 전체 검사 `full` 실행 중으로, **전체 통합 CI/병합 완료는 아직 미확정**. 동일 소스의 추가 불필요한 수정이나 Cloudflare 설정·실서비스 변경은 수행하지 않음.
- **남은 것과 다음 작업:** 위 링크에서 attempt 2의 최종 `full` 및 `CI Integration Verify`를 확인하고 통과 시 자동 병합 처리. 새 소스가 배포되더라도 실제 운영/DR 승격에는 별도 최신 버전 증거가 필요함.
- **관련 추적:** [PR #2796 CI 체크](https://github.com/gycha0109-beep/MyeongHa/pull/2796/checks), [통합 재실행](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41185858051), [PR #2796 진행 상황 댓글](https://github.com/gycha0109-beep/MyeongHa/pull/2796#issuecomment-6541334063).

### 2026-10-31 23:46 KST — Phase 11 격리 PostgreSQL 실제 부하·연결 풀 포화 실측

- **로드맵:** Production Operations 아키텍처 Phase 11의 `controlled non-production tests` 및 `DB saturation ceilings` 검증을 실제 임시 PostgreSQL에서 실행. Phase 12의 확장 트리거를 미리 수치화하지 않으며, 운영 시스템/실사용자 데이터에는 접근하지 않음.
- **구현:** [`scripts/operations/measure-isolated-postgres-capacity-phase11.mjs`](../../scripts/operations/measure-isolated-postgres-capacity-phase11.mjs). `PG_BIN_DIR`로 지정한 로컬 PostgreSQL 18의 `initdb`/`pg_ctl`을 이용해 임시 데이터 디렉터리 및 임의 127.0.0.1 포트에 **별도 SQL 인스턴스** 생성. 단일 `pg.Pool`에 `max=2`, SQL `SELECT pg_sleep($1::double precision)` 합성 지연 **80ms**, 연결 획득 대기 **140ms**를 적용하고 동시 요청 1/2/4/8 단계에서 총 96건 측정. DB 첫 연결 과정은 별도 **1500ms 초기 warmup**으로 분리하여 초기 기동 시간을 포화 계측으로 오인하지 않음. 측정 및 예외 시 `finally`에서 DB 서버 정지·임시 파일 삭제, 다른 PostgreSQL 서비스 미변경.
- **측정값(2026-10-31 KST, 단일 로컬 실행):** 동시 1개 **20/20 성공**, 성공 p95 **95.079ms**, **10.688 성공 req/s**. 동시 2개 **20/20 성공**, p95 **97.511ms**, **20.381 req/s**. 동시 4개 **24/24 성공**, p95 **189.273ms**, **21.324 req/s**. 동시 8개 **16/32 성공·16/32 연결 획득 타임아웃(실패율 50%)**, 성공분만의 p95 **220.291ms**, **21.326 성공 req/s**. 서버 드라이버가 관측한 연결 수는 전 구간 최대 2, 높은 동시 요청 뒤 정상 `SELECT 1` 회복 PASS. 스크립트 최종 `result=PASS`, exit code 0.
- **실행 보정:** 최초 실행에서 임시 PostgreSQL의 두 번째 연결이 시작 과정에서 85ms 제한에 걸려 warmup이 실패한 사실을 확인. **기동 시 연결 준비**와 **측정 대상 연결 대기 한계**를 분리한 뒤 재실행해 PASS. 이는 실서비스 설정 변경이나 실제 DB의 장애·부하가 아님.
- **해석 한계:** 로컬 PostgreSQL **18** + `ssl:false`로 고정된 합성 `pg_sleep` 벤치마크이며 운영 PostgreSQL 버전, `verify-full` TLS/RLS, 실제 명하 SQL·인덱스·사용자 혼합 트래픽, Saju CPU/메모리, 인프라 규모·비용을 대표하지 않음. 표시한 p95는 **성공한 요청만** 기준이므로 실패율과 함께 해석해야 함. `productionCapacityProven=false`, `realMyeonghaQueriesMeasured=false`, `scalingThresholdApproved=false`; **Phase 11 전체 수용/Phase 12 확장 트리거/Phase 13 Production Operations ACCEPTANCE/DR 수용 모두 미완료**.
- **추적/다음:** 본 재현 스크립트와 Worklog를 같은 PR로 제출. 독립 진행 중인 [기록 조회 API 장애 PR #2806](https://github.com/gycha0109-beep/MyeongHa/pull/2806)은 필수 CI 통과 후 전용 통합 검증을 제출했고 **실행 중**임(작성 시점). 두 PR의 CI·병합 결과는 별도 증거 확인 전 PASS 또는 완료 추정 금지. 이후 실제 격리 DB의 MyeongHa 쿼리·권한/성능 증거 확보로 Phase 11~12 진행.

---

### 2026-11-01 — Phase 7 격리 PostgreSQL 실제 권한·RLS·트랜잭션 컨텍스트 검증

- **목표:** 운영 로드맵 Phase 7 §34의 DB 장애·격리 후속으로, P0-AUTH-01의 **기존 `executePostgresSubjectTransactionV1` 실제 트랜잭션 경로가 PostgreSQL 엔진의 RLS/권한 및 커넥션 재사용과 함께 동작하는지** 분리된 환경에서 확인. Production DB, Supabase, Cloudflare 서비스, 사용자 레코드에 접근하지 않음.
- **실제 구현:** [`test/postgres-subject-rls-isolated-phase7.test.ts`](../../test/postgres-subject-rls-isolated-phase7.test.ts) 추가. `PG_BIN_DIR`가 설정된 Windows 로컬에서 `initdb`/ `pg_ctl`로 **임시 PostgreSQL 18** 인스턴스를 임의 127.0.0.1 포트에서 생성하고 종료·삭제. 기존 프로덕션 소스 `executePostgresSubjectTransactionV1`을 그대로 사용해 `BEGIN`→`SET LOCAL ROLE myeongha_api_executor`→`begin_member_subject_context_v1`→`assert_myeongha_subject_context_v1`→SQL→`COMMIT/ROLLBACK` 흐름을 실제 SQL로 실행. 합성 member A/B, 임시 synthetic ledger 테이블·RLS 정책, 합성 resolver 함수만 테스트용으로 생성.
- **권한·격리 증거:** 비슈퍼유저 `NOBYPASSRLS` 로그인/역할, `NOINHERIT`와 명시적 `SET ROLE` 권한을 사용. login의 ledger 직접 조회 **42501** 차단, Member A는 A 1건만 조회, Member B는 B 1건만 조회. 동일 최대 1개 연결 풀에서 A→B→알 수 없는 Member 거부→A 재조회 후에도 사용자 간 데이터 혼입 **0건**, 트랜잭션 종료 후 `current_user` 원래 login 및 transaction-local subject 값 제거 확인. 무권한 별도 login의 `SET ROLE` 및 ledger `INSERT` **42501** 확인.
- **검증:** 로컬 Node 24, PostgreSQL 18, Vitest의 실제 `PG_BIN_DIR` 실증 **1/1 PASS** 및 TypeScript `tsc --noEmit` PASS. 외부 PostgreSQL이 설치되지 않은 CI 환경에서는 명시적으로 해당 실DB 실증을 **skip**하므로, 원격 CI PASS만으로 PostgreSQL 통합 실증을 주장하지 않음. 실행 명령: `PG_BIN_DIR=<installed PostgreSQL bin> npx vitest run test/postgres-subject-rls-isolated-phase7.test.ts`.
- **한계:** 실제 운영용 subject 함수 본문과 schema migration을 실행한 검증이 아닌 **동일 함수 이름/호출 계약을 가진 합성 정책과 데이터**로 RLS 엔진·권한·트랜잭션 컨텍스트를 검증. 로컬 합성 클러스터는 `ssl:false`이므로 `verify-full` TLS/인증서·운영 PG17·실제 Supabase RLS 정책, Hosted Auth/DR, 운영 capacity/Phase 13 ACCEPTANCE는 **미확인**. `dr_ready=false`, `serviceResumptionAllowed=false` 유지.
- **다음 작업:** 운영 실제 DB에 비접근 방식으로 인증서 검증/TLS 연결을 동일 격리 PostgreSQL에서 검증하고, 단계적 복구 또는 Phase 10~12의 실제 DB/사용자 부하에 대한 별도 승인된 근거를 확보. Worklog 기록은 기존 보고서에 누적하고 별도 문서를 만들지 않음.

### 2026-11-01 01:18 KST — Phase 7 격리 PostgreSQL 실TLS 인증서·호스트명·평문 차단 검증

- **로드맵 위치:** Phase 7 장애 격리 및 DB 연결 보안 후속. [Production Operations 아키텍처](../architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md)의 Production DB TLS 검증 조건을 운영 환경에 영향 없이, 별도 로컬 PostgreSQL 엔진에서 실제 연결로 검증. **운영 DB·Supabase·Cloudflare 설정/트래픽/계정 접근 없음**.
- **실제 구현:** [`scripts/operations/verify-isolated-postgres-tls-peer-phase7.mjs`](../../scripts/operations/verify-isolated-postgres-tls-peer-phase7.mjs). `PG_BIN_DIR` 및 `OPENSSL_BIN`을 명시적으로 요구하고 `initdb`로 매 실행 임시 PostgreSQL 18 데이터 디렉터리와 랜덤 `127.0.0.1` 포트를 생성. OpenSSL로 **당일 유효한 테스트용 자체 서명 서버 인증서와 별도 미신뢰 인증서**를 임시 생성하고, IP/DNS SAN을 가진 신뢰 인증서만 사용하는 `pg.Pool`의 `ssl: { ca, rejectUnauthorized: true }` 연결 후 실제 `pg_stat_ssl.ssl=true` SQL 결과를 검증. `pg_hba.conf`는 합성 비슈퍼유저 로그인에 **TLS 접속 허용, 평문 접속 거부** 규칙을 선행 적용. 최종 `finally`에서 격리 DB를 종료하고 개인키/인증서/임시 데이터를 모두 삭제하며 저장소에 인증서·비밀을 포함하지 않음.
- **실측 결과:** Windows Node 24.14.0 + 로컬 PostgreSQL 18 + Git OpenSSL 환경, 스크립트 `result=PASS`, exit code 0. (1) 신뢰한 테스트 인증서·올바른 호스트/IP SAN → 암호화 SQL 접속 **PASS**; (2) **미신뢰 인증서** → `DEPTH_ZERO_SELF_SIGNED_CERT` 거부; (3) **호스트명 불일치** → `ERR_TLS_CERT_ALTNAME_INVALID` 거부; (4) **TLS 없는 연결** → PostgreSQL `28000` 거부. 연결 로그인은 임시 비슈퍼유저. 관련 기존 TLS/subject pool 회귀 **4파일 48/48 PASS**, `tsc -p tsconfig.json --noEmit` PASS, `node --check` PASS.
- **실행 문제·보정:** 최초 실행은 Windows `pg_ctl -o` 옵션에 단일 따옴표가 **경로 문자의 일부**로 해석되어 임시 인증서를 찾지 못한 설정 오류. 따옴표를 제거해 재실행, 실제 TLS 연결 실증 PASS. **운영 서버 설정은 수정하지 않았음.**
- **수용 경계:** 이 테스트는 **임시 자체 서명 인증서 및 합성 DB 역할**을 가진 PostgreSQL 18의 `pg` 클라이언트 TLS 인증서·호스트명 검증 실증이지, 실제 Production PostgreSQL 17/Supabase CA 핀·권한 역할·RLS·MyeongHa `buildProductionNodePostgresPoolConfigV1` 전체 설정 경로 또는 Cloudflare 배포 인증 완료를 뜻하지 않음. 운영 승인 플래그 `dr_ready=false`, `serviceResumptionAllowed=false`, Phase 8/13 미수용 유지.
- **추적/다음:** 브랜치 `ops/phase7-isolated-postgres-tls-peer-20261101`로 실행 스크립트와 본 Worklog를 함께 PR 제출. 필요 시 격리 PostgreSQL 17 및 실제 production-config 변환 경로의 인증서 검증을 별도로 확인. [Worklog PR #2817](https://github.com/gycha0109-beep/MyeongHa/pull/2817)의 통합 CI는 당시 진행 중이므로 성공/병합 추정 금지.

### 2026-11-01 02:21 KST — Phase 7 엄격한 운영용 TLS 구성 함수의 격리 PostgreSQL 연결 검증

- **로드맵 목표:** 이전 [PR #2821](https://github.com/gycha0109-beep/MyeongHa/pull/2821)의 실제 TLS 소켓 검증을 확대하여, 기존 **명하 소스 함수 `buildProductionPostgresStrictTlsTargetV1`**가 생성한 연결 설정을 실제 PostgreSQL에 적용하고, 서명/CA 지문 및 SSL URL 검증으로 안전한 접속을 강제하는지 확인. Production DB/Supabase·Cloudflare 연결이나 설정·사용자 기록 변경 없음.
- **구현:** [`test/production-postgres-strict-tls-isolated-phase7.test.ts`](../../test/production-postgres-strict-tls-isolated-phase7.test.ts). `PG_BIN_DIR`과 `OPENSSL_BIN`을 제공했을 때만 실행되는 격리 실증. 임시 PostgreSQL 18/127.0.0.1, 일회성 자체 서명 CA·서버 인증서, 합성 비슈퍼유저와 일회성 DB URL을 생성. `X509Certificate.fingerprint256`를 일회성 테스트용 authority의 fingerprint로 전달하여 **기존 검증 함수**로 `sslmode=verify-full`을 검사한 뒤, 함수가 반환한 `connectionString`과 `ssl: {ca, rejectUnauthorized:true}`를 실제 `pg.Pool`에 그대로 적용. `pg_stat_ssl`의 `ssl=true`와 합성 로그인 계정을 실제 SQL로 확인. 모든 DB 파일·개인키/인증서는 `finally`에서 정리.
- **로컬 실행 증거:** Windows Node 24.14.0 / PostgreSQL 18 / Git OpenSSL / Vitest 4.1.11에서 **실DB TLS 연결 테스트 1/1 PASS**. (1) 합성 CA 지문이 일치한 실제 TLS SQL PASS, (2) 다른 CA를 허용된 지문으로 속이려는 시도는 연결 전에 `ROOT_CERTIFICATE_FINGERPRINT_MISMATCH`로 차단, (3) `sslmode=require`와 추가 `sslrootcert` URL 옵션은 각각 `TLS_MODE_NOT_VERIFY_FULL`, `AMBIGUOUS_SSL_CONFIGURATION`으로 차단, (4) 미신뢰 CA를 별도 테스트용 지문으로 허가해 구성해도 실제 드라이버는 `DEPTH_ZERO_SELF_SIGNED_CERT`로 접속 거부. 관련 기존 TLS/subject pool 회귀 **3파일·38/38 PASS**, `tsc -p tsconfig.json --noEmit` PASS.
- **실행 중 보정:** 첫 TLS 연결에서 명하용 `pg` 드라이버가 확인한 서버 이름은 `localhost`였는데 테스트 인증서 SAN에 IP만 존재해 **`ERR_TLS_CERT_ALTNAME_INVALID`로 정상 거부**됨. 테스트 인증서에 `DNS:localhost,IP:127.0.0.1` SAN을 모두 포함시켜 재실행 PASS. **실제 프로그램의 호스트명 검증을 끄거나 변경하지 않았음.**
- **제한 및 승인 경계:** 임시 테스트 지문을 권한 객체로 전달해 **일반 strict TLS 대상 생성 함수**의 실제 작동을 검증한 것으로, **상수 `PRODUCTION_POSTGRES_TLS_ROOT_FINGERPRINT256_V1`를 사용하는 운영 전용 `buildProductionNodePostgresPoolConfigV1`의 실제 운영 인증서 검증**, Supabase 원격 CA/로그인·RLS·PG17 및 Cloudflare 배포 연결은 여전히 미검증. CI에 `PG_BIN_DIR`/ `OPENSSL_BIN`이 없으면 실제 PostgreSQL 실증은 skip되므로 원격 GREEN만으로 실DB 성공을 주장하지 않음. Phase 8 DR/Phase 13 Production Operations ACCEPTANCE 미완료, `dr_ready=false`, `serviceResumptionAllowed=false` 유지.
- **후속:** 스크립트·문서 같은 PR 제출, CI 통과 후 운영 DB 접속을 요구하지 않는 나머지 미완료 증거를 로드맵 순으로 확보. 운영 데이터·비밀·인증서의 외부 문의나 변경은 진행하지 않음.

## 2026-10-30 16:52 KST 추가 검증 — 최신 Cloudflare 배포의 실제 양성·음성 E2E PASS

**이 절은 아래 §3.2와 §5의 구버전/미수용 항목 중 같은 엔드포인트·같은 조건을 대상으로 한 과거 상태보다 최신 증거**이다. 현재 운영 준비 전체가 완료되었다는 뜻이 아니라 **배포된 정확한 버전에 연결한 검증 부분집합**의 최신 관측이다.

- **고정 소스:** 병합된 `main` `c49d9815f0ddce16afd086528529ddac2674e149` — [CI #41020132039](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41020132039) SUCCESS, [Governance #41020132023](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41020132023) SUCCESS.
- **공급자 배포:** Worker `myeongha`, deployment `b09a6c35-43db-463b-9d9e-254e467fd869`, 2026-10-30T07:27:43.958354Z, exact version **`f549bc9f-eb92-4f7d-a65c-c71a4b4568f0`** 100%. Linked Workers Build `5a8676b5-5b61-4ef6-b765-200fcf598ebb`, outcome SUCCESS, pushed `main` source SHA exactly matching the above.
- **양성 로그인/DB/Saju:** [governed Production workflow #41022084481](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41022084481), completed SUCCESS, 2026-10-30T07:46:25Z. Workflow input was the independently read exact version `f549bc9f-...` (version header enforced before Member credential use). The sanitized actual verifier result is `mode=authenticated`, `result=PASS`, **18 checks**. Positive: Member sign-in `200`, authoritative current-subject DB read `200`, Birth Profile revision `200`, calculation-only Saju `200`. Negative: anonymous Member/Saju/preview `401`, cross-origin sign-in `403`, guarded Chat HOLD `503`, plus health/readiness/security fencing. No real payment, interpretation or chat output was requested. This proves successful live **calculation-only** integration at this version; not all Saju interpretation contracts or infrastructure capacity.
- **같은 배포 버전의 익명 ingress:** [governed Production workflow #41022755702](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41022755702), completed SUCCESS, 2026-10-30T07:52:40Z. Sanitized actual `mode=operations`, `result=PASS`, header `observedWorkerVersion=f549bc9f-eb92-4f7d-a65c-c71a4b4568f0`, **11 checks**: static root/hall `200`, health `200`, POST health `405`, configuration readiness `200`, anonymous Member/Saju/preview `401`, cross-origin sign-in `403`, unknown API `404`, operations admission `PASS`; applicable API no-store, security headers and non-reflection gates enforced.
- **한정된 실제 메트릭:** Cloudflare GraphQL Workers adaptive dataset, script `myeongha`, exact version `f549bc9f-...`, window `2026-10-30T07:27:43Z..07:54:00Z` returned `sum.requests=108`, `sum.errors=0`, `sum.subrequests=89`. Aggregated provider sample; 0 errors in this bounded query **does not prove** zero user-visible 4xx/5xx, DB/Saju latency, capacity threshold or SLO compliance.
- **롤백 후보 인벤토리(실행하지 않음):** 직전 Worker deployment `66739717-fe96-4103-9b25-6d63f2b007bf` at `2026-10-30T07:22:50Z`, version `9c79b61f-69b5-42e5-a5fa-a46257fafa03` previously 100%, build `e433919f-5f6e-4ba0-8aef-848f1e57d15d` SUCCESS from `main` `80268c01913d33bf6a68f1d230a7f4766aeca4e3`. **되돌릴 후보의 식별만 완료**, 그 버전의 종속성·스키마 호환성 및 실제 복귀 drill은 미실증이며 즉시 롤백을 승인하는 근거가 아님.

**이번 실제로 진전된 §33 범위:** ① 주 Worker 소스/버전 연결, ② 배포 상태, ④ live liveness, ⑤ *설정 기반* readiness, ⑥ 익명 음성 인증, ⑦ 합성/전용 Member를 이용한 양성 로그인·DB·Saju 계산, ⑧ 위 경로에서의 실제 의존성 호출, ⑨ *계산-only* Saju 연동, ⑩ API 응답 캐시 헤더, ⑪ 해당 응답에서의 제한된 비밀 반사 음성검증, ⑬ Worker 집계 메트릭, ⑭ 기술적 롤백 후보 **식별**의 각 범위. ③ 전체 구성 preflight/비밀 회전, ⑤의 지속적인 의존성 readiness, ⑨의 전체 Saju 계약, ⑩의 모든 실제 개인 데이터 응답, ⑪의 모든 본문/로그, ⑫ 로그 실측·redaction, ⑬ 종단간 지표·경보, ⑭ 복귀 drill, Phase 7 장애 주입, Phase 10–12 용량 실측, Phase 8 **DR/Hosted Auth-Storage 전체 복구**는 별도 증거가 필요하다. 전체 `Production Operations ACCEPTANCE`는 **미완료**, `dr_ready=false`, `serviceResumptionAllowed=false` 유지.

재검증/승격 규칙: 배포 버전이 바뀌면 해당 새 버전의 워크플로 결과 없이 기존 실측을 자동 승격하지 않는다. Auth/DB/Saju 건강이 영구히 보장되는 것이 아니며, 결과는 각 실행 시각의 관찰이다. 아래 최초 2026-10-30 기준 스냅샷의 과거 RED/미확인은 지우지 않고 이 최신 추가 기록으로 시간 범위를 명확히 한다.

## 1. 트랙의 구현 목적과 최종 엔드포인트(종료 상태)

**목적:** 명하의 실제 운영 경로가 어떤 소스·설정·의존성으로 서비스되는지 추적하고, 배포·비밀 관리·관측·장애 격리·캐시 보호·성능/용량·백업/복구를 **검증 가능한 증거**로 관리하여 문제가 생겼을 때 안전하게 중단·복원할 수 있도록 하는 것. 기능·사주 해석 결과의 품질 개선 트랙이나 다른 서비스의 임의 기능 구현 트랙이 아님.

**목표 토폴로지(공개 진입점):**

~~~text
클라이언트
  → https://myeongha.gycha0109.workers.dev
  → Cloudflare primary Worker "myeongha" (정적 웹 + API)
      ├─ Auth / current-subject / PostgreSQL (승인된 Hyperdrive·Supabase 경계)
      └─ Saju 계산 서비스 (별도 Cloud Run, 서비스 간 계약·인증 필요)
별도 통제 경계: GitHub main/CI/배포, Production 비밀, 백업·Hosted Auth/Storage 복구
~~~

현재 기본 웹/API 진입점은 Cloudflare Worker임. 예전 문서에 남아 있는 **Vercel primary**, **Saju 미배포**, **main 미보호** 등의 과거 진술은 이 보고서의 현재 배포·검증 근거로 사용하지 않음. Saju Cloud Run 및 Production 연결은 [P0-OPS-01 #388](https://github.com/gycha0109-beep/MyeongHa/issues/388)의 기존 이력을 따르되, 별도 Cloud Run 내부 URL/인증 값은 이 보고서에 출력하지 않고 **최신 버전과의 실호출 검증도 별도로 요구**함.

**최종 종료 조건:** [운영 아키텍처 §33의 14개 Production 검증 조건](../architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md)을 **해당 시점의 배포 버전과 연결된 증거로 확인**하고, §38의 Phase 1–13 잔여 실측·안전 복구 항목을 충족하거나 명확한 독립 차단 상태로 인계하는 것. PR 녹색, Cloudflare 배포 성공, `/api/readiness` 200, 진단 도구 구현은 각각 **전체 운영 수용 판정과 다름**. Hosted 서비스 복구의 차단 조건을 생략한 채 `production-ready`로 전환하지 않음.

## 2. 실제 HTTP/API 엔드포인트와 검증 경계

**고정 공개 Origin:** `https://myeongha.gycha0109.workers.dev`. 아래 표의 경로는 이 Origin에 붙는 경로. Cloudflare의 명시적 라우팅 근거는 [`workers/cloudflare-api-router.mjs`](../../workers/cloudflare-api-router.mjs)와 [`cloudflare/myeongha-worker.mjs`](../../cloudflare/myeongha-worker.mjs)임. 라우트 등록과 **실제 Production 정상 응답 검증을 구분**함.

| 엔드포인트 | 역할 / 안전 경계 | 확인된 동작·현재 한계 |
| --- | --- | --- |
| `GET /` 및 `GET /hall.html` | 정적 웹 진입 및 홀 UI | 이전 Worker 버전에서 각각 HTTP 200 실측 |
| `GET /api/health` | 공개 liveness, 민감정보 없는 `{"status":"ok"}` | 이전 Worker 버전에서 200, `no-store`·보안 헤더 검사 PASS. `POST`는 405 + `Allow: GET` |
| `GET /api/readiness` | 기능별 **설정 기반** readiness/상태 | 이전 버전에서 200 실측. DB 쿼리·Auth·Saju 네트워크 가용성을 증명하지 않음 |
| `GET /api/me` | 인증된 Member/Guest의 현재 주체·DB 경계 | 익명 요청 401 실측. 실제 Member DB 조회 200은 이번 운영 점검의 범위 밖 |
| `GET /api/me/birth-profile` | 인증된 주체의 출생정보 revision 조회 | 라우터 등록; 최신 Worker에서 성공적인 인증 조회 증거는 미확인 |
| `POST /api/me/saju/calculation` | 인증된 현재 출생 revision 기반 **계산만** | 익명 요청 401 실측. 최신 Worker에서 인증된 계산 및 Saju 종단 간 계약 미확인 |
| `POST /api/me/saju/preview-reading` | Saju 미리보기 동적 경로 | 익명 요청 401 실측. `/api/me` 디스패처로 매핑되는 rewrite; 인증된 해석 호출은 본 운영 점검에서 수행하지 않음 |
| `POST /api/auth/sign-in` | Member 로그인 / 보호된 세션 | 다른 Origin의 의도적 잘못된 로그인 403 실측. 실제 자격증명 로그인은 별도 governed 워크플로만 |
| `/api/auth/sign-up`, `/api/auth/sign-out`, `/api/auth/refresh` | 회원가입·로그아웃·갱신 | 직접 라우트 등록. 이 보고서는 각각의 실서비스 성공을 주장하지 않음 |
| `/api/session/bootstrap`, `/api/birth-profiles` | 세션 초기화·출생 프로필 관련 진입 | 직접 라우트 등록. 쓰기·민감 데이터 취급은 인증 경계를 따라 별도 검증 |
| `/api/chat`, `/api/chat/:threadId/turns` | 캐릭터 대화/턴 전송 | `/api/me` rewrite 경계. 익명 운영-readiness 점검은 해당 기능을 건드리지 않으며 별도 Chat admission·보안 트랙 소관 |
| `/api/life-record`, `/api/readings`, `/api/memories` | 개인 기록·리딩·메모리 | `/api/me` rewrite, 개인 데이터 `no-store` 경계. 이번 실서비스 기능 검증 대상은 아님 |
| `/api/__myeongha_e2e_unknown` | 존재하지 않는 API 거부 확인용 **테스트 경로** | 이전 버전에서 404 확인. 사용자 기능 엔드포인트가 아님 |

**보안/캐시 정책:** 동적 API의 성공·거부·실패 응답은 `no-store`여야 하며 민감정보를 반사하지 않아야 함. 정적 자산의 별도 CDN 캐시 정책과 혼동하지 않음. 관련: [Phase 9](API_CACHE_ISOLATION_PHASE9_20261030.md).

**실서비스 점검 호출 주체:** [`scripts/verify-cloudflare-primary-e2e.mjs`](../../scripts/verify-cloudflare-primary-e2e.mjs)의 `operations` 모드는 자격증명/DB 쓰기 없이 health, config-only readiness, 익명 인증 차단, 응답 헤더, Worker 버전 일치만 검사. [`.github/workflows/cloudflare-primary-e2e.yml`](../../.github/workflows/cloudflare-primary-e2e.yml)에서 사용. `authenticated` 모드는 [`.github/workflows/cloudflare-primary-e2e-member.yml`](../../.github/workflows/cloudflare-primary-e2e-member.yml)의 `main` 전용 수동 `workflow_dispatch`이며 Production 비밀과 **독립 확인한 정확한 Worker 버전**을 요구함. 임의 재호출·실제 결제·실제 사용자 기록 사용 금지.

## 3. 확인된 배포·CI·운영 실증 (시간/버전 분리)

### 3.1 병합된 `main` 기준 CI

| 증거 | 상태 | 링크 |
| --- | --- | --- |
| main CI | SUCCESS | [#41017690638](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41017690638) |
| main Governance | SUCCESS | [#41017690547](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41017690547) |
| main Web Browser Smoke | SUCCESS | [#41017690496](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41017690496) |
| main Supabase Production 워크플로 | SUCCESS | [#41017690459](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41017690459) |
| Supabase Production의 `deploy-migrations` 작업 | **SKIPPED**, 즉 SQL 배포 성공 증거 아님 | [동일 실행](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41017690459) |
| main Cloudflare 익명 live E2E | SUCCESS, **아래 구버전 관측** | [#41017690560](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41017690560) |

통합 PR [#2770](https://github.com/gycha0109-beep/MyeongHa/pull/2770)은 병합됨. [성공한 정식 통합 실행 #41016949355](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41016949355)과, 제출 라벨 이벤트가 아닌 시점에 시작되어 admission 실패한 [이전 실행 #41016926064](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41016926064)는 구분함. 과거 RED는 코드 회귀를 입증하지 않음.

### 3.2 **같은 소스 SHA라도 E2E와 배포 버전은 별개**

1. PR live 익명 운영 E2E [#41016924078](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41016924078), 2026-10-30T06:55:26Z: `PASS` / Worker version `cc165497-6906-4c36-96c1-9819f287e37d`. 총 11개 결과: 웹 `200/200`, health `200`, 잘못된 health method `405`, readiness `200`, 익명 Member/Saju/preview `401/401/401`, cross-origin 로그인 `403`, 미등록 API `404`, 최종 admission `PASS`.
2. 병합된 main E2E [#41017690560](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41017690560), 2026-10-30T07:03:16Z: 동일한 **이전 Worker version `cc165497-...`** 관측 및 `PASS`.
3. **그 이후의** Cloudflare Worker deployment `6c5fcebc-156a-4d1a-8af4-f2b510bf0773`, 2026-10-30T07:04:14Z: **version `9710d396-e68b-4019-98fa-4d29e291c786` 100%**. Workers Build `ecd56497-1f48-4553-81e9-57cb2f39c0b3` outcome `success`; 소스는 병합된 `main` `a3a78bdf6df0824aed018e37cb70c0c1690d5b94`.
4. 이 시점의 익명 live E2E는 **당시 병합 후 Worker 배포 완료보다 먼저 실행**되었음. 이후 **더 최신 main `c49d9815...`/Worker `f549bc9f-...`에서 실제 양성 E2E #41022084481과 익명 E2E #41022755702 모두 PASS**했으며, 보고서 상단 추가 검증을 현재 근거로 사용함. 이후 또다시 버전이 바뀌면 신규 검증이 필요함.

Cloudflare Provider observability 설정은 `enabled=true`, `logs.enabled=true`, `invocation_logs=false`로 읽혔음. 과거 버전 `cc165497-...`에 대해 읽은 bounded analytics 구간(2026-10-30T06:40:35Z–06:57:00Z)은 Worker 요청 11, 오류 0, subrequest 3. **작은 적응형 표본·Worker 단위 메트릭**이지 라우트별 p95, DB/Saju 경로 지연, 실제 용량, 로그 redaction 실증, 경보 전달 또는 승인된 SLO가 아님.

## 4. Phase 1–13 구현 현황 — 코드 구현과 수용 검증 분리

| 단계 | 실제 확보한 구현/증거 | 종료에 남은 것 |
| --- | --- | --- |
| **1. 토폴로지/서비스 목록** | 운영 아키텍처와 Cloudflare primary source·build 추적 | 새로운 배포/설정 변화 때 증거 최신화 |
| **2. Saju Production 호스팅** | Cloud Run 운영·Production 연동 기존 이력 [#388](https://github.com/gycha0109-beep/MyeongHa/issues/388) | **최신 Worker 버전** 기준 실 Saju 계산·계약/버전 검증 |
| **3. 비밀/환경** | Worker 환경/비밀 경계, auth 경계 테스트, `main` 및 Production 환경 정책 문서 | 비밀 로테이션·음성/양성·격리의 실제 시점별 검증을 누락 없이 수용 |
| **4. 배포/Health/롤백** | GitHub main 배포 근거, Cloudflare 100% 버전, 이전 버전 health/readiness 실측 | 새 배포 정확 버전의 live smoke, 의존성 readiness, 실제 rollback 후보/전환 근거 |
| **5. 구조화 로그** | 관련 로깅/비식별화 코드와 Cloudflare 로그 활성화 설정 | 해당 배포 버전의 실제 샘플 존재·redaction 검증 |
| **6. 메트릭/경보** | Cloudflare Worker bounded analytics 조회, 보안 경보 설정·테스트 이력 | 의존성별 golden signal, 생산 로그 연동, 실제 장애/알림 전달 및 보존 근거 |
| **7. 장애 격리/시간 제한** | 기존 예외·차단 경계 및 테스트 | DB/Saju/인증 실패 주입의 실제 제한·복원 실증 |
| **8. 백업/복구** | 암호화된 실제 DB 백업 [#40812111605](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40812111605), 격리 PG17 복원 [#40817391430](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40817391430) 성공 | **Hosted Auth/Storage, 개인정보 연속성, 스키마 동등성, 전체 서비스 RPO/RTO 미증명 — DR 차단** |
| **9. 캐시/CDN** | 동적 API 경로별 `no-store` 코드·회귀 검증, 이전 버전 live 헤더 검사 | 새 버전의 동일 정책 유지 근거 및 외부 CDN 계약 분리 |
| **10. 지연시간 기준선** | [루프백 p50/p95/p99 수집기](API_PERFORMANCE_BASELINE_PHASE10_20261030.md) | 실제 Auth/DB/Saju·제품 경로의 대표 지연 실측 및 병목 파악 |
| **11. 부하/용량** | [20–500 요청 1–8 동시성 수집기 + 5/15분 envelope](API_CONTROLLED_CAPACITY_PHASE11_20261030.md) | 격리된 실제 환경에서 지속 실측·DB/Saju 포화 한계 측정 |
| **12. 확장 임계치** | [측정 실패 경계 기반 진단 분석기](OBSERVED_SCALING_REVIEW_PHASE12_20261030.md) | DB pool/CPU·메모리·실제 서비스 수치를 사용한 수용 가능한 기준, 자동 확장 주장 금지 |
| **13. 최종 운영 수용** | 정확한 main SHA 증거 수집기, Cloudflare live 익명 E2E·Provider 버전 증거 | §33 14개 요건을 현재 배포 버전 기준으로 연결하고 미검증 항목 별도 처리 |

**Phase 8 상세 차단 근거:** [PostgreSQL DR 상태](POSTGRES_DR_READINESS_STATUS_V1.md) 및 [Hosted Auth/Storage gap matrix](HOSTED_AUTH_STORAGE_DR_GAP_MATRIX_V1.md). 당시 Production 원격 migration `20261029012948` vs 저장소 `20261029012000`, 원격 전용 `20261008090417` 등 [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887)의 불일치 미해결. 최신 실제 격리 복원은 성공했지만 일부 Provider 원본 행/관계가 빠져 **전체 Hosted 복구 동등성 아님**. 로컬 합성 Auth/Storage·JWT 폐기 테스트 PASS는 Production 연속성 증거로 승격하지 않음. 승인 RPO `PT24H` / RTO `PT6H` 충족도 미입증. `dr_ready=false`, `future_safe_privacy_reconciliation=false`, `serviceResumptionAllowed=false` 유지.

## 5. §33 Production 최소 14항목 수용 판정 — 현 시점

| ID | 확인 대상 | 판정 / 한계 |
| --- | --- | --- |
| 1 | 기대 소스 SHA·OCI digest | **부분 실증:** 최신 Worker Build의 GitHub main SHA 확인. Saju exact OCI/digest 수용은 별도 |
| 2 | Provider 배포 상태 | **관측:** 최신 Worker 100% 트래픽 및 성공 빌드. Saju/DB 전체 readiness와는 별개 |
| 3 | 비밀 비노출 구성 사전점검 | **미수용:** 전체 live preflight 증거 묶음 미확인 |
| 4 | Liveness | **현 배포 `f549bc9f-...` 실서비스 Health 200 PASS** ([#41022755702](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41022755702)) |
| 5 | Readiness·capability | **현 버전 config-only 200 PASS**, 양성 DB/Saju 호출 실측 PASS; **전 의존성·장애시 readiness는 미수용** |
| 6 | 음성 인증 smoke | **현 버전 익명 Member/Saju/preview 401 PASS**, cross-origin 403 PASS |
| 7 | 양성 인증 synthetic smoke | **현 버전 양성 실서비스 PASS:** Member 로그인·주체 귀속 DB·Birth Revision·Saju 계산-only 각 200 ([#41022084481](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41022084481)); 다른 기능 포함 전체 수용은 별도 |
| 8 | 필수 의존성 점검 | **부분 실증:** 현 버전 Member/Auth/DB/Saju 실제 정상 경로 200; 장애 시 지연·timeout·DB pool 가용성 미수용 |
| 9 | MyeongHa↔Saju 호환성 | **계산-only 실서비스 통합 PASS**; 전체 해석 계약·배포 간 호환성·장애 조건은 별도 수용 |
| 10 | 사용자 비공개 캐시 | **현 버전 익명·양성 검증 API no-store 헤더 검사 PASS**; 모든 개인 데이터 경로와 외부 CDN 계약은 별도 |
| 11 | 비밀 반사 금지 | **일부 실증:** 현 버전 익명·양성 검증 응답의 비밀/헤더 경계 검사 PASS. 전체 로그·본문·크로스서비스 검증 미수용 |
| 12 | 로그 존재·redaction | **설정 확인**. 실제 배포 샘플 및 redaction 증거 미수용 |
| 13 | 메트릭 존재 | **현 버전 Cloudflare Worker 집계 관측** (지정 구간 108건/Worker 오류 0건); 의존성 지표·운영 SLO는 미수용 |
| 14 | 롤백 후보 확인 | **이전 버전 후보 식별** (`9c79b61f-...`, 기존 main `80268c01...`); 호환성 검증 및 실제 롤백 drill 미수용 |

이 표는 별도 실증 결과를 수작업으로 구분한 **상태 보고**이며 `scripts/operations/inspect-main-operations-acceptance.mjs`가 자동으로 전 항목을 PASS 판정한 결과가 아님. 그 스크립트는 read-only GitHub workflow 증거만 수집하고 `acceptanceDecision=NOT_EVALUATED_BY_COLLECTOR`를 반환함.

## 6. 실제 종료까지의 실행 순서와 금지 사항

1. **새 배포의 익명 수용 (현 `f549bc9f-...` 버전 PASS):** Cloudflare에서 실제 100% 버전 재확인 → 같은 버전의 `/`, `/hall.html`, `/api/health`, `/api/readiness`, `/api/me`, `/api/me/saju/calculation`, `/api/me/saju/preview-reading`, `/api/auth/sign-in`를 기존 익명 운영 E2E로 검증 → 워크플로 URL·시각·버전 기록. 버전이 바뀌면 결과도 갱신.
2. **양성 의존성 수용 (현 `f549bc9f-...`의 Member/DB/Saju 계산-only PASS):** 이미 존재하는 governed `cloudflare-primary-e2e-member.yml` 사용. 별도 확인한 현재 Worker 버전 및 Production 합성/전용 Member 비밀의 범위 내에서 로그인, 주체 귀속 DB, Birth revision, 계산-only Saju 경로 검증. 비밀 값을 보고서/로그에 출력하지 않음.
3. **운영 장애·관측 수용:** 실제 버전 로그/redaction·의존성 메트릭·알림·롤백 근거를 확보. 안전한 **비운영** 환경에서 DB/Saju timeout/장애, 5/15분 실측, 부하·용량 및 확장 기준을 검증. 테스트 도구의 존재만으로 실측 완료 처리 금지.
4. **DR 통합 수용:** 실제 백업과 migration/DDL/ACL 동등성, 지속적인 독립 개인정보 삭제/철회 기록, Hosted Auth/Storage 복원, 전체 서비스 복구 및 RPO/RTO 확인. 관련 권한·안전 조건이 충족되기 전에는 서비스 재개 게이트를 열지 않음.
5. **종료 결정:** 위 증거를 §33 항목별 PASS/NOT_OBSERVED/BLOCKED로 묶어 최종 판정. **전부 충족하지 못했다면 전체 Production 운영 준비 완료를 선언하지 않고 차단 항목을 명시한 채 종료 가능 범위만 종료**. 임의 추가 기능/별도 승인자·외부업체 문의/근거 없는 완료율을 만들지 않음.

## 7. 실무상 바로 재사용할 파일/검증 진입점

| 구분 | 파일 또는 실행 지점 |
| --- | --- |
| 최상위 실행·수용 원칙 | [`docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md`](../architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md) (§33, §38) |
| Cloudflare 라우트 인벤토리 | [`workers/cloudflare-api-router.mjs`](../../workers/cloudflare-api-router.mjs) |
| 실제 익명 검증기·워크플로 | [`scripts/verify-cloudflare-primary-e2e.mjs`](../../scripts/verify-cloudflare-primary-e2e.mjs), [`cloudflare-primary-e2e.yml`](../../.github/workflows/cloudflare-primary-e2e.yml) |
| 실제 양성 Member/Saju 검증 | [`cloudflare-primary-e2e-member.yml`](../../.github/workflows/cloudflare-primary-e2e-member.yml) |
| main 소스별 read-only 검증 증거 | `node scripts/operations/inspect-main-operations-acceptance.mjs --sha <40자리-main-SHA>` |
| Saju/DB/복구 책임 경계 | [`POSTGRES_DR_READINESS_STATUS_V1.md`](POSTGRES_DR_READINESS_STATUS_V1.md), [`HOSTED_AUTH_STORAGE_DR_GAP_MATRIX_V1.md`](HOSTED_AUTH_STORAGE_DR_GAP_MATRIX_V1.md) |
| Phase 9–12 근거 | [캐시](API_CACHE_ISOLATION_PHASE9_20261030.md), [지연](API_PERFORMANCE_BASELINE_PHASE10_20261030.md), [부하](API_CONTROLLED_CAPACITY_PHASE11_20261030.md), [확장](OBSERVED_SCALING_REVIEW_PHASE12_20261030.md) |
| Phase 13 구체적 운영 evidence | [`MAIN_OPERATIONS_ACCEPTANCE_PHASE13_20261030.md`](MAIN_OPERATIONS_ACCEPTANCE_PHASE13_20261030.md) 및 [PR #2770 실측 댓글](https://github.com/gycha0109-beep/MyeongHa/pull/2770) |

**최신 실측 증거:** 이 보고서 상단의 2026-10-30 16:52 KST 추가 검증이 아래 초기 §3.2/§5 스냅샷보다 최신입니다.

**보고서 자체의 한계:** 이 파일을 병합하는 것은 **현황과 종료 조건의 권위 있는 스냅샷 기록**이지 Phase 1–13 수용의 완료 또는 새로운 Production 배포에 대한 자동 보증이 아님. 병합 후 main SHA나 Worker 버전이 바뀌면 재확인해야 함.

Watchtower-Track: ops
