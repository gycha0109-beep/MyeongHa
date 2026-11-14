## 2026-11-14 — 실제 Provider 원장 복원 첫 실행 실패·출력 보호 보강

- **실행:** 보호 격리 복구 [#43571674258](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43571674258), 정확한 짝지어진 백업 #43424903445, `restore_disposable_provider_ledger=true`. 복구·동일 실행 암호화 Provider 원장 복호화·원본 SQL 지문·버전 출처 검증은 PASS, **일회용 원장 행 삽입 단계에서 FAIL**. SQL 원문이 포함된 JSON을 PostgreSQL `COPY`의 직접 입력으로 전송하다가 JSON 오류가 발생한 것이 원인; 245행 복원은 **미증명**. 이 실패가 Production DB를 변경하지 않았음(재조회 245개/frontier `20261113062455`, 공유 메모리 3개 미적용).
- **출력 보호 사고·조치:** 스크립트의 stderr 차단과 달리 일회용 PostgreSQL 서버 오류 로그가 **보호된 마이그레이션 SQL 일부**를 출력함. 실제 사용자 행 노출은 관측되지 않았지만, 로그 외부 접근·복제 여부는 별도 미증명. 해당 GitHub 실행의 로그 삭제 API 요청을 실행해 **HTTP 204**를 확인, 실행 ID·실패 결과는 보존. 본 문서에는 SQL 원문·운영자·사용자 정보 미기록.
- **수정:** 원문 JSON 직접 COPY를 폐기하고, Node에서 봉인 원장 검증 후 **표준 JSON 직렬화→base64 ASCII를 COPY(text)에 전송→일회용 DB 내 decode 후 JSONB 생성** 방식으로 전환. 원문 데이터 전송 전 세션 `log_min_error_statement=panic`, `log_error_verbosity=terse`, `log_statement=none` 설정을 먼저 요구하고 실패 시 중단. CI stdout/stderr 및 새 증거는 비식별 상태/개수만 유지.
- **로컬 확인:** Vitest 해당 2개 검사 PASS, 복구 workflow 안전성 검증 PASS. 별도 로컬 PostgreSQL 17에 특수문자·개행·정규표현식을 포함한 **합성 원장 2행**을 base64 전송·행 복원하여 전체 6개 필드 일치 PASS; 임시 컨테이너 정리. **실제 봉인 원장 새 격리 실행 결과는 아직 없음**, 변경 승인 전 `drReady=false`, `serviceResumptionAllowed=false`, `ROADMAP_COMPLETE=false` 유지.
- **다음:** 변경 PR 통합 CI·병합 후 새 보호 runner에서 동일 백업 #43424903445에 제한 재실증하고, 245행 정확 복원·기존 합성 개인정보 검증·로그 비노출을 별도 수용. 동일 실패 반복 실행 금지.

Watchtower-Track: ops

## 2026-11-14 Provider 원장 행의 일회용 DB 재구성 경로 구현 — 실제 원본 실행 대기

- **정확한 작업 대상:** 기존 암호화 Production 백업과 같은 실행으로 봉인된 Provider migration source [#43424903445](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43424903445)(245개/frontier `20261113062455`). 이전 [격리 복구 #43553728311](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43553728311)에서는 원본 SQL 포함 원장을 복호화·지문 검증만 했고 **복원 대상 `supabase_migrations.schema_migrations`에 245행을 재구성하지 않았음**. 이 차단만 한정해 새 선택 경로를 추가.
- **신규 보호 경로:** `restore_disposable_provider_ledger=true`는 `verify_provider_migration_source=true` 및 `restore_clone_shared_memory_rehearsal=true`, 정확한 백업·사고기준 시각·`main`에서만 허용. 기존 복구 후 동일 보호 runner 내 원장 원문을 임시 복호화하고 **오직 loopback PG17**에 원본 기록의 6개 필드(`version`, `name`, `statements`, `created_by`, `idempotency_key`, `rollback`)를 행 단위로 원자적 재구성. **기록된 과거 SQL 문장은 절대 실행하지 않음.** 원문·운영자 메타데이터·DB 오류를 CI 로그·아티팩트에 출력하지 않음. 원본 봉인 해시 검증과 6개 필드 JSONB 완전 동일성, 행수/frontier 확인이 실패하면 HOLD.
- **실제 완료 범위:** `test/ops/provider-ledger-disposable-replay.test.mjs` 2개 PASS, 워크플로 정적 보호 검사 PASS, 2026-11-14 *로컬 별도 PostgreSQL 17*의 합성 2행 replay 실제 DB 입력·일치 결과 (`allFieldsExact=true`, `countMatch=true`, `frontierMatch=true`) PASS 후 컨테이너 정리. **실제 봉인 245행의 새 보호 workflow 실행은 아직 전**. SQL 텍스트 재실행 없이 원장 기록 보존만 실증; Source SQL 미보유 12개/역사적 실행자 미인증은 해소하지 않음.
- **최종 수용 제한:** 실제 245행 격리 재생이 성공하더라도 *Provider 서비스가 관리하는 원장 복구·Auth 세션·Storage 객체·권한 계승*을 입증하지는 못함. `fullProviderMigrationLedgerRestored=false`, `drReady=false`, `serviceResumptionAllowed=false`; 새 evidence `disposable-provider-migration-ledger-restore.json`은 일회용 기록 재구성 결과로만 판정. Production SQL/repair/Canary/Hosted 변경 없음.
- **다음:** PR 정확한 HEAD의 일반/통합 CI 통과 및 `main` 병합 후, 이전과 같은 짝지어진 백업 #43424903445로 새 flag를 설정해 보호 격리 실행 **1회**. 실제 아티팩트 6필드 정확성·privacy 검증·DR HOLD 결과를 보고 Phase 8-B의 남은 Provider-compatible Hosted target 범위와 구분.

Watchtower-Track: ops

## 2026-11-14 현재 배포 의존성·최소 Production 정합화 변경안 — 읽기 전용 검증, 적용 보류

> **아직 사용자 승인 요청 전의 단일 조건부 변경 후보**이며, 이 기록은 Production SQL 실행이나 migration history 수정 권한을 발급하지 않는다. 2026-11-14 보호 격리 복구 [#43553728311](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43553728311)의 실제 결과를 사용한다.

1. **정확한 대상·기준:** Supabase `cnsfpcdiyofqvhpcegfc`, PostgreSQL 17.6, `public`과 기존 `supabase_migrations` 이력. 11/14 실제 원격 관측은 245개/frontier `20261113062455`; 공유 메모리 2360/2370/2380의 이력·테이블·삭제 재생 함수가 모두 없음. 원격 전용 `20261008090417`·`20261028011357`는 **유지**, 저장소 alias `20261028110500`은 **임의 기록 금지**. 45/82 차이는 무차별 배포 대상이 아님.
2. **현재 배포 의존성:** GitHub `main` 확인 `f4027f9cdb2a08d132a2425116d561b00bcb7509`에서 `apps/api/src/character-shared-memory-http-v1.ts`는 `/api/me/shared-memory` 명세를 제공하지만 `workers/cloudflare-api-router.mjs`의 Cloudflare allowlist에 해당 경로는 없음. 확인한 현재 주 채팅 실행 코드에도 공유 메모리 독자 조회의 직접 연결은 확인되지 않음. Cloudflare Worker `myeongha`의 실제 100% 배포 버전 `1d995e41-8c91-40c4-97dc-ebe958d678af`는 2026-11-14 03:58 UTC 기록이고, **Cloudflare Workers Builds의 해당 버전 빌드 `df4efe5b-505b-478a-9100-304e612e30da`가 `main` commit `f4027f9cdb2a08d132a2425116d561b00bcb7509`의 `npm run build:web` 및 `node scripts/cloudflare-main-web-cd.mjs` 성공을 독립 표기**해 배포 SHA까지 확인됨. 이 기능의 *출시 필요성*과 이미 서비스 중인 채팅 장애를 혼동하지 않는다. 캐릭터·프론트 기능 연결은 타 트랙 책임이며 여기서 중복 구현하지 않는다.
3. **기존 코드·권한 선행조건:** `subjects`, `data_deletion_jobs`, `current_myeongha_subject_id()`, `internal_finalize_account_deletion_db_v1(uuid,uuid,text)` 존재; finalizer 소유자는 `postgres`, `myeongha_api_executor`는 non-superuser/non-BYPASSRLS. 기존 세연 pinned RPC는 현재 존재하며 API role만 실행 가능. #2200의 남은 P0001/실송수신 실패는 별도 진단이며 1640을 재적용하지 않는다.
4. **이미 구현·재사용하는 읽기 전용 중단 게이트:** `scripts/operations/production-shared-memory-forward-preflight-readonly.sql`을 실제 Production에 SELECT로 1회 실행해 `baselineMatchesExpected=true` 실측. 이 검사는 사용자 데이터/원문 SQL을 읽지 않고 245/frontier, 기존 원격 이력 2개 보존, 공유 객체 부재, 필요 함수/역할을 확인한다. 그 결과는 **이전 시점의 기준선 일치**이지 변경 승인·전체 SQL 실행 가능성이나 최신 배포 동등성 증명이 아니다. 적용 직전 다시 실행하고 한 항목이라도 달라지면 중단한다.
5. **최소 SQL 세트(다른 이력 제외):** 기존 변경 없는 `2360_subject_shared_memory_owner_managed_v1.sql` (Git blob `ddf51632a08735042adb0cff1bdbbf1b64e7c65a`) → `2370_subject_shared_memory_account_finalization_erasure_v1.sql` (`90848c31cd5dfc0de1ffb0b30cb46c95ef5c0710`) → `2380_subject_shared_memory_note_deletion_recovery_v1.sql` (`3cafb2d702bb17b6677ae550bd8b540d3e884158`). 2380 단독 설치·SQL 재생성·원격 전용 SQL 수정 없음.
6. **객체·권한 변화:** 사용자 직접 작성 메모리 테이블(Owner RLS forced, API 역할 제한), 계정 최종 삭제의 물리 소거 트리거, 메모리 삭제 이벤트 테이블·삭제 트리거, 특권 복구 전용 함수. 브라우저 `anon/authenticated`의 직접 SELECT 및 내부 복구 함수 EXECUTE는 불허. 최종 삭제 시점의 기존 finalizer 상태 조건 불일치가 발견되면 실패 폐쇄하므로 기존 계정 삭제 경로와 충돌 가능성을 수용 검증해야 한다.
7. **실행 순서·원자성:** 먼저 **적용 시점과 일치하는 새 암호화 Production 백업 + 같은 실행의 Provider 원장**을 확보·지문 검증한다. 오직 사용자가 정확한 대상/세 SQL/이력 등록을 승인한 후 보호된 production 전용 접속에서 해시·현재 권한·기존 객체 부재를 재검증하고 `postgres` owner 컨텍스트로 세 SQL을 **하나의 트랜잭션**에 순차 적용한다. 일반 `supabase db push --include-all` 또는 원격 전체 마이그레이션 repair는 사용하지 않는다.
8. **이력 등록 방식과 중복 방지:** SQL 적용 후 객체/함수/권한 결과가 맞는 경우에만 **새로 실행한 정확한 2360/2370/2380 세 버전**을 최신 지원 CLI의 대상 지정 이력 절차로 기록하고 readback한다. 이는 별도 명시 승인 범위이며 현재 유효한 원격 45개를 없애거나 옛 `20261028110500`을 가짜 적용 처리하는 작업이 아니다. SQL은 재실행 가능한 idempotent DDL이 아니므로, 스키마는 존재하고 이력 등록만 누락된 경우 전체 SQL을 재실행하지 않고 HOLD·분리 정합화한다.
9. **기존 데이터 영향:** 기존 공유 메모리 테이블은 현재 없어 사용자 메모리 기존 행 이관은 없음. `subjects` 및 삭제 작업 테이블의 기존 행을 일괄 수정하지 않으며 기존 채팅·Reader·Commerce 데이터를 변경하지 않음. 단, 새 트리거는 **향후** 계정 삭제 완료 전환의 정합성을 강제하므로 삭제 시나리오 실패는 기능 활성화 차단으로 판정한다.
10. **실패·되돌리기:** 3 SQL 중 실패하면 그 단일 트랜잭션을 전부 롤백하고 이력 등록 없이 중단. 커밋 후 이력/권한 검증 실패면 기능 노출을 중단하고 기존 Worker 버전을 유지·복구하되, 이미 저장될 수 있는 메모리·삭제 이벤트의 손실 위험 때문에 테이블 DROP/DB 과거 백업 덮어쓰기를 자동 rollback으로 사용하지 않는다. 별도 정방향 복구안과 명시 승인을 받는다.
11. **이후 읽기 전용 수용:** 세 적용 버전·정확한 Git source SHA/DB 실행 출처, 테이블·정책·소유자·GRANT/RLS·트리거·복구 함수, 원격 2개 역사 이력 보존 및 배포 SHA 호환성을 확인. 격리 PG17의 실제 동일 SQL 3종 적용/권한/합성 개인정보 비재노출·재생 2회 PASS는 이미 `#43553728311`에서 확보. 새 버전 기준 전체 백업/복구, 실제 독립 개인정보 원장, Hosted Auth/Storage, RPO 24h/RTO 6h, #2200 실제 채팅 수용은 **별도 HOLD**.
12. **승인·운영 판정:** 현재 Cloudflare 경로 및 실제 배포 SHA를 확정하고 해당 기능을 Production에 열기로 결정할 때, 위 정확한 SQL 3종 + 적용 방식 + 세 신규 이력 ID 기록을 대상으로 사용자에게 **단일 명시 승인**을 요청한다. 승인 전 Production SQL·실데이터 삭제·Provider 비용 발생 작업 없음. `NOT_ACCEPTED` / `drReady=false` / `serviceResumptionAllowed=false` / `ROADMAP_COMPLETE=false` 유지.

Watchtower-Track: ops

## 2026-11-14 실제 현재 백업 격리 개인정보 마이그레이션 실증 — 제한 PASS, 전체 DR HOLD

- **보호 실행:** [PostgreSQL Isolated Restore Drill #43553728311](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43553728311) **SUCCESS**, 정확한 `main` SHA `986cc1cc2e2b095350158990cb7660ed2de0692d`. 비식별 증거 artifact `14097053341` (`postgres-isolated-restore-drill-43553728311`, 만료 2026-12-14 UTC).
- **소스 검증:** 백업·암호화 Provider 원장 **동일 실행 #43424903445**, 백업 소스 `6eab97337811128282f5f5ec6320e4608d5f9c09`, 프로젝트 `cnsfpcdiyofqvhpcegfc`, 원격 이력 **245개**, frontier `20261113062455`, catalog SHA256 `405e10e50f47cb123f94babf57aff2ef40db3c61da185cc60cbe6581f0c43dba` 일치. 암호화 원장 복호화·원본 무결성 **PASS**, 원본 SQL 본문 12개 미보유/전체 Provider migration ledger 대상 복구 **HOLD**.
- **일회용 DB의 실제 결과:** 백업 원본에 대한 이전 스키마/역할/ACL 관측을 먼저 수행한 다음, **PG17 loopback 복원 클론에만** 고정 SQL `2360→2370→2380`을 **단일 트랜잭션**으로 적용. `disposable-shared-memory-privacy-rehearsal.json`: 세 버전 적용 및 메타데이터/권한 검사 PASS, `productionDatabaseChanged=false`, `cloneStillMatchesOriginalProductionSchema=false`, `drReady=false`. 기존 합성 개인정보 삭제·복구 검사 **PASS** (5개 합성 이벤트, 동일 원장 두 번째 재생 멱등 PASS, 공유 메모리 재노출 차단·계정 삭제·Commerce 보존 가드 PASS). **실제 Production 데이터 삭제/Privacy Canary는 실행하지 않음.**
- **복원 범위의 한계:** 원본/복원 public 스키마 catalog 비교는 범위 한정 관측이며 공유 MVCC snapshot 동등성은 미증명. Provider-managed 141 COPY block 중 112 replay, 3 column projection, 29 skip; **full Provider restore=false**. Hosted `auth.identities`/`auth.sessions`/Storage, 로그인·갱신·객체 바이트 및 전체 RPO 24h/RTO 6h 실측 **미완료**. `recovered-serving-admission.json`은 `gate=BLOCKED`, `serviceResumptionAllowed=false`, `drReady=false`.
- **직접 운영 재확인:** 2026-11-14 읽기 전용 Supabase에서 migration **245개/frontier `20261113062455` 유지**, 세 공유 메모리 객체/삭제 재생 함수 **부재**. 이번 실증은 **세 SQL의 현재 백업 기준 격리 정방향 적용 가능성만** 입증한다. 운영 이력 45/82·원격 전용 두 버전·실배포 의존성을 구분한 최소 변경안을 마련하고, 운영 DB SQL 적용 전 대상/순서/보존/롤백/재검증 근거와 사용자 명시 승인을 받는다.
- **판정:** #1887 OPEN / `NOT_ACCEPTED` / `drReady=false` / `serviceResumptionAllowed=false` / `ROADMAP_COMPLETE=false`. 합성 복구 결과를 실제 Production 개인정보 원장 연속성이나 서비스 재개로 승격하지 않는다.

Watchtower-Track: ops

## 2026-11-13 현재 운영 백업의 개인정보 복구 선행 마이그레이션 — 격리 적용 경로 구현

- 보호된 [백업 #43424903445](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43424903445)는 실측한 현재 원격 이력 **245건 / frontier `20261113062455`**를 암호화 원장과 함께 보존한다. 현재 Production에는 수동 공유 메모리 `2360`, 계정 삭제시 메모리 소거 `2370`, 삭제 이벤트 재생 `2380`의 테이블·함수/원장이 존재하지 않는다. 그러므로 백업 무결성만으로 최신 승인된 **개인정보 복구 기능까지 검증됐다고 선언할 수 없다**.
- 기존 격리 복구의 원본 스키마 비교를 **먼저 수행한 후**, 오직 복구 실행의 `restore_clone_shared_memory_rehearsal=true`에서만 위 세 기존 SQL 파일을 일회용 loopback PG17에 `--single-transaction`으로 순차 적용하고, 함수·RLS·브라우저·API 역할 분리 및 삭제 이벤트 트리거를 검사하게 했다. 실행은 **정확한 backup run `43424903445` / source SHA `6eab97337811128282f5f5ec6320e4608d5f9c09` / reference `2026-11-13T12:29:12Z` / 보호된 `main` / Provider 봉인 원장 동시 검증 필수 / Production canary·실제 개인정보 원장 없음**에만 허용한다.
- 이 뒤의 기존 **합성 개인정보 삭제·복구 재검증은 생략하지 않으며**, clone에만 변경을 적용했다는 JSON을 별도 보존한다. 실측 통과 여부는 병합 후 실제 보호 워크플로 결과로만 판정한다. **통과하더라도 Production에 세 SQL이 적용됐다는 뜻이 아니며, 원본 현재 스키마 복구 동등성·Hosted Auth/Storage·실제 삭제 원장 재생·RPO/RTO·서비스 재개 판정은 모두 HOLD**. 정상 모드의 개인정보 검사/차단은 그대로 유지한다.
- **다음:** 보호된 PR CI·병합 → 정확한 최신 백업 복구 + 클론 한정 3개 SQL 적용·권한·합성 프라이버시 실증 → 그 결과로만 **Production 적용 필요 여부, 원격 이력 45건 보존 전략, 단일 변경 계획·롤백**을 확정한다. Production 변경은 구체적 사용자 승인 후에만. #1887 OPEN, `NOT_ACCEPTED`, `drReady=false`, `serviceResumptionAllowed=false`, `ROADMAP_COMPLETE=false`.

## 2026-11-13 최신 스키마 백업 출처·암호화 무결성 PASS, 복구 검증은 별도 HOLD

- **현재 적용 이력 포함 백업:** [#43424903445](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43424903445) SUCCESS, Git checkout `6eab97337811128282f5f5ec6320e4608d5f9c09`. 백업 artifact `14037181099` (GitHub ZIP SHA256 `27f2d0536ec2f3e7a92823b1cb7a0a451c41cd3b6fc6521aa404da5630ffe60b`), 암호화 Provider 원장 `14037056434` (ZIP SHA256 `217b7dae06d5f5d6a0365b1df64e0fc90e039420b835596d5a5105e913b613b3`), 만료 `2026-12-13`. 각 암호문 SHA256을 공개 manifest의 `encrypted_sha256` / `encryptedArchiveSha256`과 실제 파일 해시로 독립 일치 확인. 양쪽 manifest에 현재 원격 frontier `20261113062455`, 적용 원장 **245개**, catalog SHA256 `405e10e50f47cb123f94babf57aff2ef40db3c61da185cc60cbe6581f0c43dba` 동일. Backed-up schema catalog bracket 안정 표시는 **같은 pg_dump snapshot 보장이나 독립 복원 결과는 아님**. 암호화 원장에는 SQL 본문 12개 누락·역사적 실행자 미인증 경계가 남아 있음.
- **이전 검증 재활용:** [기존 2026-11-07 KCP 버전 쌍 SHA 테스트](POSTGRES_OWNER_KCP_SANDBOX_MIGRATION_BYTE_PARITY_20261107.md)가 이미 증명한 원격 `20261028011357` ↔ 저장소 `20261028110500`의 `\n\ncommit;\n` 마지막 10바이트 차이를 11/13 **현재 원격 SQL SHA256 `e248ae6880f6765305274c4541763a3a93d12ab6822540ef6f1b2f3e1e0967c4`**로 재확인. 저장소 파일에서 해당 종결자만 제외한 지문 정확히 동일. 현재 `cmd_persist_owner_kcp_signed_sandbox_receipt_v1(uuid,uuid,text,text)` 함수 본문 7,710바이트 MD5도 저장소 본문과 정확히 일치. **이미 확정된 바이트 비교를 다시 수행하지 않음**; 버전 불일치·배포 주체는 여전히 별개 미입증, Production `migration repair`·과거 파일 리네임·재적용 승인 없음.
- **최단 후속:** 정상화가 필요한 다른 실제 변경과 현재 배포 요구사항만 선별해 최소 정합화안을 격리 검증한다. 최근 백업은 현재 마이그레이션 frontier의 봉인 증거일 뿐, `2380` 및 개인정보 삭제 복구/Hosted Auth·Storage/RPO·RTO가 없는 Production 상태에서 full DR PASS가 될 수 없다. **부분 백업 성공 ≠ 전체 복구 성공**. `NOT_ACCEPTED`, `drReady=false`, `serviceResumptionAllowed=false`, #1887 OPEN, `ROADMAP_COMPLETE=false`.

# 2026-11-13 운영 트랙 우선순위 재정렬 — 실제 출시 차단 최단 해소

> **현재 실행 기준(최우선).** 총괄 트랙 지시에 따라 `현재 운영 DB 정합화 → 최소 변경안 격리 검증 → 승인된 운영 반영 → 현재 스키마 기준 복구/서비스 수용` 순서로 진행한다. 아래의 기존 Phase 8–13 수용조건·날짜별 증거는 유지하지만, 과거 200개 SQL 비교·12개 단일 SQL·154개 다중 SQL을 **모두 해명해야 다음 단계로 넘어간다**는 식으로 해석하지 않는다. 현재 실제 운영 차단에 직접 연관된 변경과 개인정보·권한 안전 위험을 우선 조사한다. 이미 검증한 부분은 재검증보다 재사용한다.

## 0.1 2026-11-13 실제 Production DB 읽기 전용 기준선

- **접근 대상:** Supabase 프로젝트 `cnsfpcdiyofqvhpcegfc`, PostgreSQL 17.6. 민감 데이터나 원본 SQL 본문을 조회·출력하지 않고 메타데이터, 객체 존재 여부, 함수 실행 권한, 마이그레이션명·버전·개수만 조회. 기준 저장소 `main` SHA `6eab97337811128282f5f5ec6320e4608d5f9c09`.
- **실제 운영 이력 245개 / 저장소 SQL 파일 282개 / 공통 버전 200개 / 운영 전용 45개 / 저장소 전용 82개.** 현재 원격 최종 버전 `20261113062455` (`admin_a4_proof_retention_safety_window_29_days_20261113`). 이는 이전 봉인 원장 242개/저장소 276개 기준과 **다른 시점의 최신 관측**으로, 숫자 차이를 단순 적용 실패나 127개 의미적 SQL 불일치로 간주하지 않는다.
- #1887 역사적 충돌 **계속 유효:** 운영 전용 `20261008090417`(원격 SQL 본문 104,021 bytes, 1 statement), 운영 전용 `20261028011357`(9,260 bytes, 1 statement)는 그대로 기록되어 있으며, 저장소의 동일 논리명 후보 `20261028110500_owner_sandbox_signed_receipt_persistence_v1.sql`은 원격 적용 이력에 없음. 후자의 저장소 텍스트는 9,270문자이며 **이름 유사성만으로 원본/DDL 동등성 또는 안전한 repair를 단정하지 않는다**.
- #2200에서 과거 없었던 `1640` 이력과 `public.cmd_mark_seyeon_chat_context_ready_pinned_v1(uuid,uuid,uuid,jsonb)`가 **지금은 실제 존재**한다. 함수 소유자는 `myeongha_seyeon_chat_runtime_owner`; `SECURITY DEFINER`이며 `myeongha_api_executor` EXECUTE=true, `anon` 및 `authenticated` EXECUTE=false. 옛 `cmd_mark_seyeon_chat_context_ready_runtime_v1`의 API 실행 권한은 false. **함수/권한 부재라는 과거 하위 원인은 해결 관측, 실제 채팅 송·수신과 P0001 재시도/idempotency는 아직 미검증**. #2200 전체 이슈는 OPEN.
- `2380` shared-memory note deletion recovery 이력, 대응 공유 메모리·삭제 이벤트 테이블, 삭제 재생 함수는 **현재 Production에 없음**. 옛 복구 시도 [#43418694784](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43418694784)의 개인정보 단계 실패는 이 차단을 정상 감지한 것이다. 현재 필요한 기능/배포 의존성과 선행 schema를 점검하지 않고 `2380`만 임의 적용하지 않는다.
- **백업 시점 차단:** 가장 최근 확인한 성공 backup run [#43330215791](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43330215791)은 `2026-11-12T23:36:01Z`에 시작되어 원격 최종 버전 `2026-11-13T06:24:55Z`보다 이르다. 따라서 **현재 전체 스키마를 포함하는 최신 검증 완료 백업/복구 증거가 아님**. 이후 backup의 존재/시점/무결성·독립 개인정보 원장 연속성을 실제로 검증해야 한다.
- 현재 `NOT_ACCEPTED`, `drReady=false`, `serviceResumptionAllowed=false`, P0 [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887) OPEN, `ROADMAP_COMPLETE=false`. #2025 상업 호스팅 조건은 **별도 병렬 확인**하며 DB 조사·정합화를 지연시키지 않는다.

## 0.2 실제 남은 작업과 실행 순서 (기존 로드맵 Phase 8 / 11 / 12 / 13에 매핑)

| 순서 | 사용자에게 필요한 실제 결과 | 현재 증거 / 구체적인 다음 작업 | 승인 경계 |
|---|---|---|---|
| **1 — 현재 운영 DB 원인 확정** | 배포에 영향을 주는 원격/저장소 차이의 목록 및 원인 | **진행 중:** 원격 245·파일 282 전수 버전 분류 완료. 운영 전용 45·저장소 전용 82를 릴리스 필수/정상적인 별도 배포/진짜 충돌로 구분하고, 우선 #1887의 `20261008090417`, `20261028011357` ↔ `20261028110500`의 SQL·DDL·권한·실제 사용 여부 확인. 현재 배포 코드 SHA 및 RPC·로그를 연결 | 읽기 전용 자율 수행 |
| **2 — 최소 정합화 설계·격리 검증** | 데이터/권한 보존하는 *단일* 정방향/정본화/이력 정합화 방안과 롤백 | **미완료:** 45개 모두 삭제하거나 82개 모두 적용하지 않음. 원격 전용 유효 기능 보존, `migration repair`는 실제 SQL/객체 동등성 입증 전 금지. 현재 배포에 필요한 변경만 격리 PG17에서 순서·idempotency·권한·데이터 보존 검증 | 격리 구현 자율, Production 적용 전 사용자 명시 승인 |
| **3 — 현재 스키마에 맞는 백업·복구** | 정확한 최종 적용 버전/시점의 암호화 백업 및 격리 검증 | **미완료:** `20261113062455` 이후 생성/원장 결합된 백업 확인; 기존 복구 도구 재사용. 삭제·철회·환불 후 비재노출, Owner/Role/GRANT/RLS, Auth 로그인·세션·토큰·Storage 객체/정책의 필요한 범위, RPO PT24H/RTO PT6H 실제 측정. 과거 43174606843 source-only 증거는 현재 복구 승인 대신 사용 불가 | 읽기 전용/안전 격리 자율; 유료 Hosted·실데이터 이동·Production canary는 비용/데이터 보호 계획 제시 후 사용자 승인 |
| **4 — 실제 장애·출시 의존성** | 채팅·결제/Reader 차단 및 서비스 재개 최소 검증 | **일부 해소:** #2200 pinned RPC 및 제한된 실행 권한 확인. 남은 P0001/재시도·현재 API 배포 호환성·수신 E2E를 개인정보·실결제 무부작용 범위에서 확인; Commerce·사주 기능 중복 개발 금지 | 운영 데이터 쓰기/사용자 상태 변경·배포는 구체적 승인 후 |
| **5 — 승인 적용 및 운영 수용** | 현재 DB 정합화 실제 반영, 관련 CI/복구/서비스 상태의 재확인 | **미완료:** 단일 변경안의 영향, 순서, 롤백, 복구 증거를 사용자에게 제시. 승인받은 범위만 Production 변경. 기존 Phase 11·12·13 종료 조건은 실제 남은 조건만 수행 | Production DB·배포·요금제/DNS/Hosted 전환은 사용자 승인 |

### 0.3 중단·완료 규칙

1. 1인 개발 프로젝트의 내부 의사결정은 **사용자 단독**이다. 존재하지 않는 다른 책임자·위원회·승인자를 만들지 않는다. 실행 환경·증거·자동화 검사의 독립성은 유지한다.
2. **운영 DB에 쓰기 전** 실제 변경 SQL/대상/순서, 예상 영향·권한, 사전 백업, 실패 시 되돌릴 방법, 격리 테스트 결과를 제시하고 **사용자의 명시 승인**을 받는다. 무승인 migration history 삭제·repair·db push·데이터 변경 금지.
3. 현재 릴리스에 필요하지 않은 과거 SQL 187개 전체의 개별 해명·중복 문서/검사를 **출시 차단 해소의 선행 조건으로 확대하지 않는다**. 단, 실제 차이·권한·개인정보 위험은 미입증으로 표기하고 필요한 안전 검증은 생략하지 않는다.
4. DR Ready와 서비스 재개는 현재 스키마·Auth/Storage·Privacy·RPO/RTO의 실제 수용이 충족될 때만 선언한다. 운영 DB 정합화 완료와 **명하 전체 출시 가능 여부**는 별도 판단한다.
5. 관련 CI가 단지 실행 중이라는 이유로 다른 독립 작업을 중지하지 않는다. 모든 기존 종료조건이 충족될 때만 `ROADMAP_COMPLETE` 선언. 과거 기록은 아래에 그대로 보존하며, 상단 현재 기준선이 **실행 우선순위**를 결정한다.

---

## 2026-11-13 Gate 1 / Phase 8-A — 옛 백업에서 최신 개인정보 마이그레이션 차단 확인 및 출처 전용 검증 분리 (실증 대기)

- [격리 복구 #43418694784](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43418694784)는 **FAILURE**다. 봉인 원장 복호화·버전 SQL 내용 비교는 로그상 완료했으나 결과 아티팩트가 없으므로 **새 12개 코드 토큰 분류는 실증 완료가 아니다**. 이후 개인정보 합성 재생 단계에서 `FAIL restored DB is missing governed shared-memory deletion replay migration`으로 중단됐다. 옛 백업 `43174606843`에는 뒤에 추가된 shared-memory 삭제 재생 테이블·함수(저장소 migration `2380`)가 없다. 이는 **정상적인 fail-closed 차단**이며 운영 복구 성공으로 승격하지 않는다.
- 최신 정상 전체 DR 절차의 개인정보 preflight나 필수 검증을 제거하지 않고, **Phase 8-A 전용 `migration_source_only_diagnostic`** 수동 모드를 추가했다. 오직 보호된 `main`, 원본 run `43174606843`, incident `2026-11-12T07:25:00Z`, `verify_provider_migration_source=true`, 개인정보 원장/canary 입력 없음, S0=false에서만 허용한다. PostgreSQL 격리 복원·암호화 출처 복호화·원본 SHA·버전 SQL 비교·스키마/역할 관측은 계속 실행하되 **새 schema 부재로 수행 불가능한 합성 개인정보 재생은 이 진단 모드에서만 미실행**한다.
- 출처 전용 실행은 별도 **비식별 제한 증거 `migration-source-only-diagnostic-boundary.json`**을 반드시 남겨 원장/checkout/backup 출처와 `syntheticPrivacyReconciliationExercised=false`, `authoritativePrivacyReconciliationExercised=false`, `serviceResumptionAllowed=false`, `drReady=false`를 함께 입증하도록 했다. 전체 복구 실행은 기존 synthetic privacy 검사를 그대로 통과해야 한다.
- **다음:** PR 병합 이후 *동일 원본 백업*으로 제한된 진단을 1회 실행해 이전 미처분 12개 단일 SQL의 `CODE_TOKENS_IDENTICAL_IGNORING_TRIVIA` / `CODE_TOKEN_BYTES_DIFFER` / `LEXICAL_SCAN_INDETERMINATE` 실제 분류와 결과 SHA·아티팩트 ID를 보존한다. 이 결과도 SQL 의미·권한·RLS 동등성이나 DR Ready 입증은 아니다. 기존 다중 SQL 154개·원문 NULL 12개 및 Provider/Hosted/독립 개인정보/RPO/RTO 미입증 유지. P0 #1887 OPEN / `NOT_ACCEPTED` / `drReady=false` / `serviceResumptionAllowed=false`.

## 2026-11-13 Gate 1 / Phase 8-A — 12개 SQL 실제 코드 차이 검증 경로 구현 (보호 실증 대기)

- 이전 보호된 복구 [#43406911458](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43406911458)의 정확한 결과와 [21개 바이트 차이 실측](POSTGRES_COMMON_VERSION_MIGRATION_BYTE_DIFFERENCE_REAL_PROOF_20261113.json) 및 [12개 저장소 SQL 대상 객체 조사](POSTGRES_COMMON_VERSION_MIGRATION_12_REPO_OBJECT_EFFECT_SCOPE_20261113.json)를 재활용한다. 바이트가 다른 단일 SQL 21개 중 9개는 저장소 끝 `;`+LF 추가, 2개는 원본 끝 76바이트 추가, 10개는 내부 상이 구간이다. 실제 SQL 의미/권한 영향은 여전히 미입증.
- 승인된 기존 격리 원장 복호화 단계에서만 **원본 SQL과 정확한 checkout SQL의 실행 코드 토큰을 보수적으로 대조**하도록 구현했다. 주석·토큰 사이 공백만 무시하며 문자열·인용 식별자·달러 인용 함수 본문은 원문 바이트 그대로 보존한다. 불확실한 인용/이스케이프/주석은 `LEXICAL_SCAN_INDETERMINATE`로 보류한다. 출력은 `CODE_TOKENS_IDENTICAL_IGNORING_TRIVIA`, `CODE_TOKEN_BYTES_DIFFER`, `LEXICAL_SCAN_INDETERMINATE`의 **비식별 분류만** 추가하고 SQL 토큰·내용·실행자·민감값은 저장하지 않는다.
- **중요 수용 경계:** 코드 토큰 일치 후보도 SQL 의미·역사적 실행·현재 DDL/권한/RLS 동등성 **증명이 아니다**. 단일 byte-exact 13·나머지 187 및 전체 DR HOLD를 유지하고, 154개 다중 statement framing과 원문 누락 12개는 새 분류 대상에 포함하지 않는다. 합성 단위 검사 7건 통과. **새 보호 실행 결과 전에는 12개의 새 분류 개수를 추정하지 않는다.**
- **다음:** PR 병합 이후 보호된 main에서 **기존 백업 #43174606843만** 사용해 `verify_provider_migration_source=true` 격리 복구를 1회 실행하고 분류·실제 SHA·아티팩트·실행 번호를 증거로 보존한다. 원본 코드 토큰이 실제로 다르면 기존 객체·권한·역할·RLS 관측과 연결해 버전별 미입증 범위를 처분한다. Production DDL/DML·재적용·repair·유료 Hosted 생성·privacy canary 금지. `NOT_ACCEPTED` / `drReady=false` / `serviceResumptionAllowed=false`, #1887 OPEN.

## 2026-11-13 Gate 1 / Phase 8-A — 단일 SQL 21개 실제 차이 위치 실증 (12개 내용/영향 처분 HOLD)

- 보호된 `main` 격리 복구 [#43406911458](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43406911458) **SUCCESS** (원본 백업 #43174606843 재사용, checkout `b88fde700f8fcc40ee7c224f3a0d7ffc3a04603a`, artifact `14026803978`, ZIP SHA-256 `b9f779ae4360cf8b13ee85e79c43b0c3c1a4b6da98ad57205b1b47bc0ef2fe0c`, 원본 parity JSON SHA-256 `a30da4e0554a77f6bffb87f1aeeebc0da4eb2adccef9f87128c75b1325cfa0a5`).
- 실제 원장/저장소/공통 분류 **242/276/200**, source-only **42**, repo-only **76**. 기존 완전 일치 **13**, 전체 byte-exact 미입증 **187** 유지. 단일 statement bytes 불일치 21개를 봉인된 격리 runner에서 실제 바이트로 조사하여 **저장소 `;`+LF 2바이트 추가 9개**, **원본 source 끝부분 추가 2개(`1600`, `1630`)**, **원본·저장소 내부 상이 구간 10개(`1580`, `1590`, `1610`, `1620`, `1640`, `1650`, `1670`, `1680`, `1690`, `1710`)**를 관측했다.
- **실제 비식별 21개 전수 측정값:** [POSTGRES_COMMON_VERSION_MIGRATION_BYTE_DIFFERENCE_REAL_PROOF_20261113.json](POSTGRES_COMMON_VERSION_MIGRATION_BYTE_DIFFERENCE_REAL_PROOF_20261113.json). 원문 SQL/변경 구간/작성자·개인정보는 공개하지 않았고, 바이트 길이·위치·해시 및 실행 출처만 보존했다. 파일 일부가 다르다는 사실은 SQL 의미 차이, 역사적 실행 인과나 복원된 객체/권한 영향까지 입증하지 않는다.
- **다음 Phase 8-A 실제 미완료:** 12개 SQL의 끝부분/내부 차이가 실행 명령·권한·RLS에 미치는 영향을 안전한 원본 증거와 현재 객체 실측으로 처분한다. 다중 statement 154개 framing 보류, 원문 NULL 12개, Provider migration ledger 대상 복원 및 전체 DDL/owner/role/GRANT/RLS 동등성은 별도 HOLD. 기존 41개 source-only 처분·A4 실측을 반복하지 않는다. Production 변경·migration repair/replay·Hosted 생성·privacy canary 없음. #1887 OPEN, `NOT_ACCEPTED`, `drReady=false`, `serviceResumptionAllowed=false`, `ROADMAP_COMPLETE=false`.

## 2026-11-13 Gate 1 / Phase 8-A — 미해결 단일 SQL 12개의 봉인 공간 차이 위치 실측 도구 (실증 대기)

- [PR #3279](https://github.com/gycha0109-beep/MyeongHa/pull/3279)까지 기존 21개 단일 SQL 불일치 중 9개의 *원본 statement = 저장소 파일 prefix* SHA 일치(저장소 뒤에 `0x3b0a`)만 확인했고, **12개는 실제 내용 차이의 범위를 확인하지 못했다**. 스키마 94개·함수 322개·기존 48개 역할 연결의 격리 관측은 버전별 SQL 실행 인과 증거가 아니다.
- 이를 위한 승인 범위 내 추가 구현: 기존 `verify_provider_migration_source=true` 격리 복호화와 exact checked-out main SQL을 사용해, 단일 원본 불일치의 **공통 시작·끝 바이트 길이, 양측 상이 구간 길이, 변경 위치 분류, 저장소 2바이트 종결자 추가 여부**만 산출한다. 원본 SQL 구문/부분 문자열·작성자·자격증명은 저장하거나 공개하지 않는다. 기존 raw-byte exact 판단과 200개 분류 수량은 변경하지 않는다.
- **실제 실행 전에는 12개 결과·의미적 동등성·현재 객체/권한 효과를 추정하지 않는다.** PR 병합 후 기존 백업 `43174606843`을 재사용해 보호된 main 격리 복구로 실증하고, 관련 JSON을 바이트 무결성·실행 SHA와 묶어 보존한다. Production 변경·원문 재실행·migration repair·privacy canary·유료 Hosted 대상 생성 없음. P0 #1887 OPEN, `NOT_ACCEPTED` / `drReady=false` / `serviceResumptionAllowed=false` 유지.

## 2026-11-13 Gate 1 / Phase 8-A — 21개 단일 SQL 바이트 불일치의 지문 기반 처분 진전

- 보호된 격리 복구 [#43372543611](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43372543611)의 비식별 SQL 지문 및 그 실행에서 체크아웃한 exact main `ccf52e1132f9afb6b956ebb399dc380154719d74`의 저장소 파일을 독립적으로 대조했다. **단일 statement bytes 불일치 21개 중 9개는 원본 statement SHA-256과 저장소 파일 앞부분 SHA-256이 정확히 동일**하고, 저장소 쪽에 2바이트 `;` + LF가 추가된 사실을 확인. 나머지 **12개는 제한된 형식 변환 검사에서 원인을 확인하지 못했다**.
- [21개 버전별 분류 및 검사 한계](./POSTGRES_COMMON_VERSION_MIGRATION_SINGLE_STATEMENT_FINGERPRINT_TRIAGE_20261113.json)를 증거로 보존한다. 9개를 기존 byte-exact 13개에 합산하지 않으며, 원본 파일 동등성·SQL 의미·역사적 실행 인과·현재 객체/권한 동등성으로 승격하지 않는다. 154개 다중 statement 구성 보류 및 12개 원문 NULL은 별도로 유지한다.
- **남은 Phase 8-A:** 단일 미확정 12개와 다중 SQL 154개의 source framing/실제 SQL 영향 처분, 현재 schema·owner·role·GRANT·RLS 및 Provider ledger target 복구 검증. 기존 원격 전용 41개/신규 A4 조사 재활용. P0 #1887 OPEN, `NOT_ACCEPTED`, `drReady=false`, `serviceResumptionAllowed=false`; Production 변경·migration repair 없음.

## 2026-11-13 Gate 1 / Phase 8-A — 공통 SQL 원문 200개 실제 비교 성공 (후속 처분 미완료)

- [실제 격리 복구 #43372543611](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43372543611) SUCCESS, exact main `ccf52e1132f9afb6b956ebb399dc380154719d74`, source run `43174606843`, artifact `14012916977` (ZIP SHA-256 `1aa91ac0b1273263b1452f4c6a26da724c8dea99003260fe4381d2ea9860f078`).
- 원장 242개 / 저장소 276개 / 공통 200개 / 원격 전용 42개 / 저장소 전용 76개. **단일 원문 바이트 일치 13개, 단일 바이트 불일치 21개, 다중 SQL framing 보류 148개, 다중 SQL 재구성 일치·원문 증명 보류 6개, 원문 누락 12개.** 총 187개 byte-exact 미입증. 전체 분류와 각 지문은 [실제 비식별 증거](POSTGRES_COMMON_VERSION_MIGRATION_BODY_PARITY_REAL_PROOF_20261113.json) 참조.
- 다음은 21개 단일 불일치와 154개 다중 statement의 실제 근거별 처분 및 원문 없는 12개 위험 보류. 자동 정규화로 동등 판정하거나 SQL을 재실행·repair하지 않는다. 이전 source-only 41개 처분과 신규 A4 권한 실측 재활용.
- 아직 Provider ledger 대상 복원·전체 스키마/권한·Hosted Auth/Storage·개인정보·전체 RPO/RTO는 미입증. `NOT_ACCEPTED` / `drReady=false` / `serviceResumptionAllowed=false` / #1887 OPEN / `ROADMAP_COMPLETE=false`. 아래 '실측 대기'는 이 실행 이전의 역사 기록.

## 2026-11-13 Gate 1 / Phase 8-A — 공통 원장 버전 200개 SQL raw-byte 대조 경로 구현 (실측 대기)

- PR #3267 필수 통합 CI [#43354735084](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43354735084) SUCCESS·보호된 main 병합, 신규 원격 전용 A4 버전 `20261109071019`의 현재 전용 역할·5개 열 SELECT 권한 실측 기록 완료. 기존 원격 버전 242/저장소 276/공통 200, 원격 전용 42·저장소 전용 76의 당시 비교는 별도 실증으로 보존한다.
- **다음 승인 범위 내 구현:** 기존 원장 봉인·복호화·정확한 main 버전 대조를 재활용해 공통 200개 버전의 SQL *저장 원문*과 저장소 파일 bytes를 대조하는 격리 검증 도구를 추가했다. 단일 statement만 raw-byte equality로 인정한다. NULL, 부분 NULL, 다중 statement의 재구성, 동일 버전에서 이름 상이, raw bytes 불일치를 구분하며 원문 SQL·작성자·개인정보를 아티팩트에 출력하지 않는다.
- 이 기능은 기존 수동 격리 복구의 `verify_provider_migration_source=true`인 경우에만 추가된다. `sourcePacketSha256`, 원장 frontier와 repository HEAD가 맞지 않으면 거부한다. 합성 테스트 3개·Node/Bash 문법 확인 완료. **보호된 main에 병합한 뒤 실측하기 전에는 본문 일치 건수를 새로 확정하거나 DR 게이트를 승격하지 않는다.** 세부 설계 [공통 버전 SQL 본문 비교](POSTGRES_COMMON_VERSION_MIGRATION_BODY_PARITY_20261113.md).
- 이 작업은 roadmap 8-A의 적용된 SQL 출처 정합성 근거만 보강한다. Source SQL 일부 일치가 역사적 실행 인과관계, 전체 객체 DDL/ACL parity, 실제 Provider ledger 복원, Hosted Auth/Storage 및 개인정보 연속성이나 RPO/RTO 달성을 보장하지 않는다. 원본 이력 덮어쓰기·재적용 없음. `NOT_ACCEPTED`·`drReady=false`·`serviceResumptionAllowed=false`, #1887 OPEN 유지.

## 2026-11-13 Gate 1 / Phase 8-A — 신규 원격 전용 A4 20261109071019의 현재 객체·권한 효과 점검

- PR [#3261](https://github.com/gycha0109-beep/MyeongHa/pull/3261) 필수 통합 CI [#43351167715](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43351167715) SUCCESS 및 병합. 정확한 원장·main 버전 차이는 **242 / 276 / 공통 200 / 원격 전용 42 / 저장소 전용 76**이며, 신규 원격 전용은 `20261109071019` 단 1개.
- **실제 Production SELECT-only 점검**: source 원장 이름 `admin_a4_reading_ai_cost_binding_reader_rls_off_managed_v1_20261109`; 원문 statement **1개·5,512바이트·SHA-256 `974840e6f7ef77717983ed2baec7e2f08712b9ea2048456f2f907f06388992e8`**. SQL은 dedicated 비밀번호 없는 LOGIN 역할 생성, `public` USAGE, `public.reading_execution_attempts`의 5개 열 SELECT만 부여하며 새 RLS 정책·Worker credential을 설치하지 않는다.
- 같은 날 현재 DB에서 dedicated 역할 존재·LOGIN=true·password NULL·NOINHERIT/NOBYPASSRLS 등 제한, 관리자 멤버십 1개(`supabase_admin` grantor → `postgres` 수신, ADMIN=true/INHERIT=false/SET=false), 테이블 13개 열 중 `external_request_ref,id,reading_id,state,subject_id` 다섯 열만 SELECT 가능, 추가 열·테이블 전체 SELECT·INSERT/UPDATE/DELETE 불가, `public` USAGE=true 확인. 테이블 RLS OFF이고 정책 정의 2개가 존재한다(비활성). 현재 역할·직접 ACL은 source SQL의 선언된 목표와 부합한다.
- [재실행 가능한 읽기 전용 관측 SQL](../../scripts/operations/production-admin-a4-reader-current-readonly.sql)과 [비식별 실측 증거](POSTGRES_A4_READER_REMOTE_ONLY_MIGRATION_EFFECT_20261113.json)를 보존했다. 기존 [41개 역사적 처분표](POSTGRES_REMOTE_ONLY_MIGRATION_DISPOSITION_20261107.json)의 내용은 변경하지 않고, 최신 reconciliation 항목에 신규 1개 적용 목적과 현 상태만 기록했다.
- **수용 경계:** 원장 `created_by` 값의 존재는 과거 실행자 인증 증명이 아니며, 현재 객체/ACL 일치는 과거 SQL 인과관계·정확한 snapshot·전체 Provider 원장 대상 복원·실제 Hosted 재해복구·Worker binding·독립 개인정보·전체 RPO/RTO를 입증하지 않는다. 기존 12개 NULL 원문 SQL도 미해결. `NOT_ACCEPTED`, `drReady=false`, `serviceResumptionAllowed=false`, P0 #1887 OPEN.

## 2026-11-13 Gate 1 / Phase 8-A — 정확한 본원 원장 242개와 main 버전 정합성 실측

- PR [#3259](https://github.com/gycha0109-beep/MyeongHa/pull/3259)의 필수 통합 CI SUCCESS 후 main 병합. 실제 보호 main [#43350336600](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43350336600) SUCCESS (백업 source [#43174606843](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43174606843)). 동일 원장 복호화·SHA/catalog 지문을 다시 확인한 뒤 exact checked-out `main` SHA `9a5f903d8c3498a18363286000525f8114671b9e`의 파일 버전과 대조: Production 원장 **242**, 저장소 파일 **276**, 공통 200, 원격 전용 **42**, 저장소 전용 **76**.
- 기존 2026-11-07 처분표의 원격 전용 **41개 모두 보존**; 이후 새 원격 전용 버전은 `20261109071019` **1개**. 정확한 버전 일치 상태의 이름 불일치 0개, 동일 이름·다른 버전 쌍 `20261029012948` ↔ `20261029012000`은 계속 별도로 표시. SQL body NULL 12개, 원격 원장의 원문 적용 SQL 동등성 및 대상 migration ledger 복구 미증명.
- 원본 [41개 처분표](POSTGRES_REMOTE_ONLY_MIGRATION_DISPOSITION_20261107.json)의 역사적 항목은 그대로 두고 새 `currentFrontierReconciliation`에 실측 범위를 추가했다. [전체 실제 증거](POSTGRES_SEALED_PROVIDER_MIGRATION_FILE_LINEAGE_PROOF_20261113.json)에는 42개 원격 전용·76개 저장소 전용 버전 ID가 포함되어 있으며, SQL 본문·작성자·개인정보는 없다.
- Phase 8-A 다음 미완료 항목은 신규 원격 전용 `20261109071019`의 *적용 SQL·현재 객체/권한 효과*를 원본과 독립적으로 검증하는 것(실행자 인증 및 기존 누락 12개 SQL 본문은 검증 불가능 상태로 별도 HOLD). **원본 기록 자동 수정, SQL 재실행, Hosted DR 수용 승격 금지.** `NOT_ACCEPTED`, `drReady=false`, `serviceResumptionAllowed=false`, P0 #1887 OPEN.

## 2026-11-13 Gate 1 / Phase 8-A·8-B — direct role replay observed in isolation

- PR [#3255](https://github.com/gycha0109-beep/MyeongHa/pull/3255) merged. Protected main [#43343813577](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43343813577) actual disposable PG17 restore and sealed-source verification SUCCESS. The guarded independent proof confirms source cross-boundary role edges **48**, executed isolated replay **48**, observed target edges **48**, and directly observed grant options/grantor attribution match. The source filtered roles.sql still excludes all 48; this is a staged disposable replay, **not** a portable Provider/Hosted restore guarantee. [Exact evidence](POSTGRES_ISOLATED_PROVIDER_ROLE_REPLAY_REAL_PROOF_20261113.json).
- Previously proven same-run source ledger decryption remains valid (242 history entries / 12 NULL statement bodies). Target Provider migration ledger was not restored. No new Hosted DR target or Production writes were performed. Full application/Provider equivalence and Auth/Storage/privacy/RPO/RTO remain Phase 8-A through 8-D blockers; #1887 OPEN, `NOT_ACCEPTED`, `drReady=false`, `serviceResumptionAllowed=false`. The approved roadmap's scope does not change.

## 2026-11-12 Gate 1 Phase 8-A/8-B: actual paired Provider source decryption proof

- [PR #3251](https://github.com/gycha0109-beep/MyeongHa/pull/3251) merged. Protected main isolated restore [#43179685582](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43179685582) SUCCESS using same-run backup and encrypted Provider history from source backup [#43174606843](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43174606843). **Actual decryption and SHA/full original statement-history fingerprint verification pass** for 242 versions and frontier `20261109071019`; historical SQL bodies are missing for 12 entries.
- Isolated application comparison: 3/3 schemas, 94/94 tables and 322/322 routines present, with 2 schema + 8 table + 19 routine legacy ACL-digest differences, although observed direct recipient privileges and canonical grantor entries match for those objects. Application internal role graph: 43/43 roles and 7/7 edges (portable grantor rewrites); app↔external boundary edges: observed 48/48 on isolated target but original filtered `roles.sql` excludes all 48. **This does not prove Provider role ownership, inherited access, full schema/permission or Hosted service parity.** A shared source/dump MVCC snapshot is unproven. Detailed [paired decryption evidence](POSTGRES_PAIRED_PROVIDER_LEDGER_DECRYPTION_PROOF_20261112.json).
- This closes only the optional **source-ledger decryption/integrity subtask**, not Phase 8-A/8-B/Gate 1. No target migration ledger replay, no repair, no Hosted Auth/Storage restoration, no Production writes, no privacy canary. P0 #1887 remains open, `NOT_ACCEPTED`, `drReady=false`, `serviceResumptionAllowed=false`. Approved remaining Gate 1 tasks remain exactly as enumerated below; no scope additions.

# Production Operations — 종료 집중 로드맵

## 2026-11-12 current-frontier Provider source capture + isolated restore evidence

- Production SELECT-only encrypted Provider source run [#43174606843](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43174606843) SUCCESS: 242 original history rows, catalog SHA `91f24b544486d2cd9af2ef8694278c80e9a2a40a7e93a3aeedf14250d08e3a47`, 12 NULL statement bodies. Archive ciphertext integrity matches public manifest and checksum; see [sealed-source evidence](POSTGRES_PROVIDER_LEDGER_SEALED_CAPTURE_REAL_RUN_20261112.json).
- Matching backup isolated restore [#43176401912](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43176401912) SUCCESS; entire schema/role/Provider migration equivalence **not** passed, service gate BLOCKED. See [current-frontier isolated evidence](POSTGRES_CURRENT_FRONTIER_ISOLATED_RESTORE_20261112.json).
- Phase 8-A/8-B next boundary: verify that exact same-run encrypted original history can be independently decrypted and re-fingerprinted **in disposable isolation only**. No target migration-history write, schema repair, or historical SQL replay is permitted. That verification alone will not close Phase 8 or alter Gate 1/P0 conditions. Whole roadmap scope unchanged.

## 2026-11-12 evidence addendum — Gate 1 migration ledger source HOLD (no roadmap scope change)

- PR [#3239](https://github.com/gycha0109-beep/MyeongHa/pull/3239) merged; exact-main isolated [#43158737963](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43158737963) completed successfully. The observed local Provider migration history table is **absent** in disposable CLI 3.1.0/PostgreSQL17; source 242 entries/frontier 20261109071019 **cannot be compared to target null metadata**. Evidence: [POSTGRES_PROVIDER_MIGRATION_LEDGER_ABSENCE_20261112.json](POSTGRES_PROVIDER_MIGRATION_LEDGER_ABSENCE_20261112.json).
- The existing sealed backup deliberately **excludes full migration history rows**, retaining count/frontier/fingerprint only (see [Backup Runbook](POSTGRES_BACKUP_RESTORE_RUNBOOK_V1.md)). This does not supply reconstructable Provider migration records. Phase 8-A/8-B therefore requires a separately authorized source and read-only identity/SQL/object/permissions equivalence before any supported isolated recovery route.
- Existing 93/93 Provider row and Auth FK proofs are **reused**, not repeated. Hosted Auth/Storage, current-frontier service restore, privacy continuity and service RPO/RTO remain unproven; P0 #1887 OPEN, `NOT_ACCEPTED`, `drReady=false`, `serviceResumptionAllowed=false`. Phase 8 and full roadmap remain incomplete.


> 기준일: 2026-11-07 KST  
> 트랙: `ops` / 저장소: `gycha0109-beep/MyeongHa`  
> 기준 main: 최초 `2f04f8f2a0d912e42bf348781e17d20ff7094675`; 최신 백업 source `8ccf60d89eb6d3fab789fb34e0d479c51d84b9af` (각 증거는 자체 SHA 기준)  
> 권위 문서: `docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md` §33–§38, `PRODUCTION_OPERATIONS_STATUS_AND_EXIT_20261030.md`, Phase 8 DR 문서 및 Issue [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887)

## 1. 개정 목적과 유지 범위

이 문서는 Production Operations의 기존 13단계 목표·필수 수용 기준을 바꾸지 않고, 2026-11-07 현재 확보된 실증을 재사용해 **남은 차단과 최종 수용 검증에 작업을 집중**하도록 실행 순서를 개정한다.

- 최종 목표는 기존과 동일하다: 명하 Production을 관찰·격리·복구할 수 있고, 실제 용량과 확장 판단 근거를 갖춘 운영 체계.
- Phase 1–13과 Architecture §33의 14개 Production 검증 항목, §34 장애 행렬, §35 필수 Runbook은 그대로 유지한다.
- 이미 통과한 비운영 실증을 이유 없이 반복하지 않는다. 새 배포·구성 변경 또는 기존 증거의 범위 불일치가 있을 때만 해당 검증을 갱신한다.
- Phase 1–7 및 9–10은 새 기능을 다시 구현하는 트랙으로 되돌리지 않는다. 남은 항목은 Phase 13 최종 수용에서 필요한 증거만 보완한다.
- Production SQL/DDL, migration repair/deploy, 계정·토큰·Storage, 비밀, 트래픽, 유료 리소스 변경은 이 로드맵만으로 승인된 것으로 간주하지 않는다.

**현재 판정:** `NOT_ACCEPTED` / P0 [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887) OPEN / `dr_ready=false` / `serviceResumptionAllowed=false`.

## 2. 현재 기준점 — 이미 확보한 증거

| 영역 | 현재 확인된 사실 | 수용 범위와 한계 |
|---|---|---|
| Production Worker 익명 E2E | [#42271216975](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42271216975), main `1609aa8…`, Worker `295b9496-795b-44a3-b3f9-141c0b83e47d` | 화면·Health 200, 설정 기반 Readiness 200, 익명 Member/Saju/Preview 401, Cross-origin 403, unknown route 404. 실제 DB/Auth/Saju 연결 증명은 아님. |
| Production DB 현황 | PostgreSQL 17.6, 원격 migration 원장 241개, 최신 `20261105075227` | 읽기 전용 관측. 전체 저장소 SQL/DDL/권한 동등성은 미증명. |
| Migration 비교 | Production 241개 / main SQL 276개. 정확한 버전 ID 기준 원격 전용 41개·저장소 전용 76개이며, 동일 이름의 버전 불일치 쌍 8개가 포함됨. 이 중 4개는 전체 byte 일치, 4개는 저장소 파일 끝의 `\n\ncommit;\n` 10 bytes를 제외한 원격 prefix 일치, 1개(`20261029012948` ↔ `20261029012000`)는 전체 byte 일치. | 위 쌍은 최신 SELECT-only 비교에서 원격·저장소 SQL 전체 7,349 bytes가 MD5/SHA-256까지 일치함을 확인. 버전 ID 및 배포 provenance는 별도 미해결. 원격 `20261008090417`은 104,021 bytes, 6개 로컬 marker는 비어 있고, 후속 1520–1640 13개와 Pin 컬럼/함수가 현재 Production에 존재함. 상세는 [11/07 read-only snapshot](POSTGRES_MIGRATION_METADATA_OBSERVATION_20261107.json). |
| 현재 Frontier 백업 | [#42309503582](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42309503582), 암호화 artifact `13548176984`, source `8ccf60d…`, frontier `20261105075227` | **정확히 이 백업**을 사용한 격리 PostgreSQL 17 복원 [#42375717923](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42375717923) SUCCESS 확인. 이는 Provider-managed 전체 복구·독립 개인정보 연속성·DR 서비스 재개의 증거가 아님. |
| 격리 PostgreSQL 복원 | **최신 대상 백업** [#42375717923](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42375717923), 증거 artifact `13575965386`, source migration 241개 / frontier `20261105075227` | 격리 복원·source catalog fingerprint 및 합성 Privacy 4건 확인. Provider COPY 27블록(138행) 제외·3블록(77행) 투영, 257행 replay(투영 포함). Hosted Auth/Storage·완전한 provider ledger·실사용자 개인정보 연속성은 미증명. |
| 개인정보 원장 | 최신 확인 [#42352614447](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42352614447), artifact `13566018275`, 암호화 캡처 SUCCESS. | payload 이벤트 수·누락 없는 연속성은 이번 조회에서 미인증. 최신 감시 [#42363914282](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42363914282)는 9,582초로 7,200초 기준 초과 RED. 이전 0건 스냅샷을 non-zero 증거로 사용 금지. |
| Phase 11 제품 경로 | [#42244701347](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42244701347) | 격리 GoTrue JWT + PG18 RLS + 실제 Saju + local workerd, 900초·3,600/3,600 성공, p95 174.231ms / p99 184.088ms, Saju 장애 503·Health 200·복구 4/4. Production Worker admission/Hosted Hyperdrive/Production capacity 증거는 아님. |
| Phase 12 진단 | `OBSERVED_SCALING_REVIEW_PHASE12_20261030.md` | DB pool 2개 조건에서 concurrency 8 실패 및 Saju CPU 제한 압력 신호 확인. 진단 신호이지 Production 임계치나 자동 확장 승인 아님. |

참고: [PR #3092](https://github.com/gycha0109-beep/MyeongHa/pull/3092)의 최신 Worklog에는 현재 main 익명 E2E, 개인정보 원장 노후화, migration source parity 분석이 추가 기록되어 있다. PR 병합 전후에는 반드시 새 main SHA와 최신 관측을 다시 읽는다.

## 3. 종료 실행 순서

### Gate 0 — 기준선 고정

1. 이 로드맵과 최신 운영 Worklog를 main에 반영한다.
2. 병합 직후 main SHA, 최신 Worker version, Production migration frontier, 최신 백업·개인정보 원장·감시 결과, #1887 상태를 다시 읽는다.
3. 과거 성공 결과를 새 배포 버전이나 새 백업 frontier에 자동 승격하지 않는다.

Gate 0은 문서 병합 및 기준선 동기화일 뿐 Production 수용 완료가 아니다.

### Gate 1 — Phase 8: DR 복구 차단 해소 (최우선 P0)

Phase 8은 다음 네 묶음을 모두 닫아야 한다. 백업 생성이나 격리 PostgreSQL 복원만 반복해서는 종료할 수 없다.

#### 8-A. Migration / DB 출처 정합성

1. 현재 Production 원장과 정확한 main migration 파일을 SELECT-only로 대조했다. 2026-11-07 기준 원격 241개 / 저장소 276개이며, 정확한 버전 ID 기준 원격 전용 41개 / 저장소 전용 76개다. 동일 이름의 버전 불일치 쌍 8개는 아래 4번과 같이 개별 SQL 본문/종료 구문을 대조하며 version identity는 별도로 유지한다.
2. 불일치 버전은 확인 가능한 배포/자동화 출처·시점, 저장소 대응 파일, statement/DDL checksum, 객체·함수·정책 영향, owner·role·membership·GRANT/REVOKE, rollback/forward-only 방향으로 처분한다. R2-G에서 종료한 과거 개인 실행자·요청 ID·COMMIT 로그 추적은 `CLOSED_RISK_ACCEPTED`이며 다시 차단 조건으로 만들지 않는다.
3. `20261008090417`은 104,021-byte 원격 단일 statement다. 현재 Production에는 관련 1460–1510 marker 6/6이 존재하지만 저장 statement는 모두 비어 있고, 후속 1520–1640 13개 migration·Pin 컬럼 2개·pinned 함수가 이미 존재한다. 현재 investigation은 `HOLD_CHANGED_RUNTIME_SCHEMA_REASSESS`다. 19개 R2 RPC catalog는 19/19 존재하며, `myeongha_api_executor` EXECUTE 17/19, `service_role`·`anon`·`authenticated`는 0/19다. 거부된 두 함수는 legacy assert/context-ready 경로이고, 현재 pinned context-ready replacement는 1 overload로 존재하며 API executor 실행이 허용된다. 이것은 현재 접근 경계의 증거이지, 원격 wrapper·전체 DDL·Owner·role membership·정책·grant graph의 격리 복원 parity 증명은 아니다.
4. `20261029012948` 원격 statement와 `20261029012000` main 파일은 현재 Production에 대해 SELECT-only로 직접 비교했다. 양쪽 모두 7,349 bytes이며 exact byte equality, MD5 `c13c8ae6680c9c5aef35909ba81b7b1b`, SHA-256 `b544d06947b31d3d6593ef29e611ac062fe86455caf23ac2f91925b839de86e6`가 일치한다. 정규화 SHA-256도 `0cfe257bb188bb8d40961959db6e0ca28f50236115e543eb72d0f283ea3bd53d`로 일치한다. 따라서 이 쌍의 SQL source equivalence는 확인됐지만 remote/local version identity와 적용 provenance는 해결되지 않았다. 원격 metadata의 `created_by`는 존재하나 인증된 실행자 증명은 아니며 idempotency key와 rollback statement는 없다.
5. 원격 전용 41개·저장소 전용 76개와 동일 이름/다른 버전 8쌍을 개별 처분한다. 현재 8쌍 중 4개는 byte-exact, 4개는 저장소 끝의 `\n\ncommit;\n` 10 bytes를 제외한 원격 prefix 일치다. Prefix 일치 4쌍은 SQL statement framing 차이를 기록하고, version identity 불일치를 자동으로 정리하지 않는다. 저장소 전용 76개를 자동 배포 실패로 분류하지 않는다.
6. 전체 schema, function, owner, role membership, grants, RLS/policy 및 provider migration ledger의 복구 동등성을 증명한다.
7. 현재 Production 기준으로 확인한 권한·정책 상태를 복구 기준으로 사용한다. 과거 bundle은 19 routine / 18 owner transfer / 19 policy이며 현재는 routine 19/19 존재, owner transfer 18/18 일치, 정책 19/19가 이름·테이블·명령·대상 역할 기준으로 일치한다. 관련 현재 정책은 38개로 후속 정책 19개가 추가되어 있으므로 과거 19개와 단순 개수 비교하지 않는다.
8. `myeongha_seyeon_chat_runtime_owner`의 현재 `postgres` 멤버십 2개 중 하나는 `20261104043413`에서 SET 권한을 임시 부여한 뒤 회수하며 남긴 비상속·비관리자·비SET 멤버십이다. 현재 `pg_has_role` 결과는 MEMBER=true / USAGE=false / SET=false다. 이 마이그레이션은 Production 원장에만 있고 main 파일은 없으므로 remote-only 처분표에 포함한다. 이전 1개 멤버십 postcheck는 현재 frontier 수용 조건으로 재사용하지 않는다.
9. 적용된 `1640` 원격 SQL(10,303 bytes)과 main 파일(10,147 bytes)은 권한 소유권 전환·회수 방식이 실질적으로 다르다. 원격은 owner 역할로 전환해 legacy EXECUTE를 회수하고 `GRANTED BY postgres`로 임시 멤버십을 제거하지만 main 파일은 `current_user`에 직접 회수한다. 이미 적용된 migration file/history는 수정·재적용하지 않고 source/provenance 차이로 별도 처분한다.
10. `20261026025332`는 원격 9개 statement를 재구성한 결과와 main 파일의 공백 제거 token stream이 일치한다. statement framing/version identity는 별도 유지한다.
11. Production 원장에만 존재하는 S0/Se-yeon migration 12개를 현재 권한·함수·정책 효과와 함께 처분한다. 이 중 `20261025193416` 및 `20261031182926`은 본문에 Production 미배포 문구가 있고 `20261031182505`는 disposable S0 전용 문구가 있으나 Production 원장에는 적용 기록이 있다. 현재 main에 대응 SQL 파일은 12개 모두 없다. `20261025193416`의 guard는 postgres 사용자/DB, PG17, private schema 부재만 검사하고 프로젝트/환경 식별자를 검사하지 않는다. 주석을 실제 배포 방지 장치로 간주하지 않는다.
12. `scripts/operations/production-authority-frontier-readonly.sql`을 추가하고 Production에서 read-only 실행을 확인했다. 역할/멤버십, 스키마 권한, 테이블·컬럼 ACL hash, RLS/policy hash, RPC 실행 권한 및 선택 migration metadata를 함께 기록한다.
13. RLS 비활성 테이블과 실제 접근 경로를 분리해 판정한다. `chat_turns`·`chat_turn_attempts`는 정책 정의가 각 3개 있지만 RLS 비활성이고 API executor 직접 테이블/컬럼 권한은 없다. 현재 G0 함수는 subject/thread 조건을 명시한다. `memory_proposals`는 정책 2개가 있으나 RLS 비활성이고, API/anon/auth 직접 권한과 신규 S0 proposal-accept EXECUTE는 없으며 positive-source registry도 disabled다. 이는 현재 fail-closed 경계이지 RLS 수용 완료가 아니다. 해당 유형을 활성화하기 전에 RLS enable 또는 승인된 동등한 행 범위 통제를 증명한다.
14. `cmd_commit_chat_turn_legacy_v1`은 service_role 전용의 별도 사용자 선택 기반 proposal 처리 경로이며 신규 positive-source registry를 참조하지 않는다. 신규 S0 proposal-accept 경로가 비활성이라고 해서 모든 legacy memory acceptance가 비활성이라고 판정하지 않는다.
15. `docs/operations/POSTGRES_REMOTE_ONLY_MIGRATION_DISPOSITION_20261107.json`에 원격 전용 41개 전체의 실제 원장 버전·SQL 본문 해시·statement 수·대응 저장소 버전·영향 신호를 기록했다. 분류는 Se-yeon 23 / Admin 8 / Commerce 8 / API DB Auth 1 / historical bundle 1이다. 이는 전수 목록 및 출처 추적 증거이지 41개 전체의 현재 객체/ACL/DDL 복구 동등성 증명은 아니다. 개별 대상 효과를 추가 대조한다.
16. 현재 `conversation_recall` registry는 `enabled=false` / `writable_enabled=false`지만 AI 모델 정책 2개는 active다. 2026-11-07 UTC 예산 행은 없고 10/25–10/31 예산 7개만 존재한다. 기존 AI 비용 원장 29건은 전부 settled이며 24건은 Owner 일일 한도 면제 플래그, 1건은 usage_unknown이다. 비용 원장과 positive-memory 경계는 동일한 stop switch가 아니다. 일반 사용자 daily admission은 해당 날짜 예산 부재로 fail-closed이나 Owner 별도 예외는 남아 있으므로 글로벌 AI 비활성 완료라고 판정하지 않는다. 새 호출·설정 변경 없이 SELECT-only로 확인했다.
17. 적용된 원격 전용 migration 41개를 대상으로 [읽기 전용 객체명 대조](POSTGRES_REMOTE_ONLY_OBJECT_PRESENCE_20261107.json)를 실행했다. SQL 선언 출현 횟수 기준 함수 82/82, 정책 82/82, 테이블 16/16이 현재 DB에 같은 이름·소속으로 존재한다. 이는 `CREATE` 텍스트의 이름 존재 확인에 불과하며, 함수 본문·소유권·권한·정책 식·실제 스키마·복구 DB의 동등성은 아직 미입증이다. 검증은 `scripts/operations/production-remote-only-object-presence-readonly.sql`로 재현 가능하다.

**금지:** blind `migration repair`, migration history rewrite, 추측에 의한 재적용, Production DDL/DML. 실제 정합화가 필요하면 근거 있는 forward-only 계획을 먼저 제시하고 사용자 승인을 받은 뒤 별도 실행한다.

#### 8-B. 현재 Frontier의 Provider-equivalent 복구

1. 현재 Production frontier를 고정한 암호화 백업과 checksum/catalog fingerprint를 사용한다. 백업 #42309503582 / artifact `13548176984` (source `8ccf60d…`, frontier `20261105075227`)를 사용한 **정확한 격리 복원 #42375717923이 SUCCESS**이며, evidence artifact `13575965386` / SHA-256 `a474462113eeb780f30f7bb996d7a400ac81fa6538657199cfd891ac3ab504b9`를 남겼다. 소스 catalog 241개 / fingerprint `b1076fcf360f3f12c1e3fcdadb34adec87e2f8c02b7592915bb6298db2e98600`를 검증했다. 이는 해당 백업의 PostgreSQL 격리 복원 증거만이며, frontier가 바뀌면 새 백업·연계 증거를 확보한다.
2. 최신 복원 #42375717923에서도 **27개 skipped(138행) / 3개 projected(77행) Provider COPY block**이 남았다. 합성 개인정보 복원 4건과 257행 replay(투영 포함)를 실제 Production 개인정보 연속성으로 승격하지 않는다. 이 누락을 해소할 Hosted-compatible 복구 경로를 확보하고 전체 Supabase migration ledger·Provider-managed 데이터의 실제 복구를 별도로 검사한다.
3. Hosted Auth는 사용자·identity 연결, sessions, refresh-token 관계, JWT signing configuration, MFA/SSO 등 해당 서비스에서 사용하는 상태를 복원하고 로그인·갱신·로그아웃·삭제 계정·폐기 토큰을 검사한다.
4. Hosted Storage는 bucket·metadata·policy와 실제 object bytes를 복원한다. synthetic object checksum, 허용된 다운로드, 비인가 접근 거부, 삭제·철회 후 접근 차단을 확인한다.
5. 복구 대상은 Provider-compatible isolated Hosted target이어야 한다. 현재 확인된 전용 DR target은 없다. 기존 Production `MyengHa` 또는 `Refund_management` 프로젝트를 임의로 재사용하지 않는다.
6. 새 Hosted project나 유료 리소스가 필요하면 생성 전에 비용·대상·부작용을 사용자에게 보고하고 명시적 승인을 받는다. 승인 전에는 프로비저닝하지 않는다.

#### 8-C. 독립 개인정보 연속성과 현재 Frontier Replay

1. 최신 백업과 정확히 결합된 개인정보 원장을 새로 확보하고, 감시기가 7,200초 freshness 기준 안에서 성공했는지 확인한다. 기존 #42262739511 RED를 무시하거나 freshness 한도를 완화하지 않는다.
2. 기존 #42242496615는 `eventCount=0`이므로 non-zero replay 증거가 아니다. 최신 암호화 원장 #42352614447 / artifact `13566018275`는 캡처 성공만 확인했고 이벤트 수·독립 연속성은 미인증이다. 최신 감시 #42363914282는 9,582초로 7,200초 freshness RED다. 과거 #40633679630도 다른 backup/ledger pair에 묶여 있으므로 현재 frontier 증거로 재사용하지 않는다.
3. Production disposable privacy canary는 사용자가 정확한 승인 문자열 `RUN_SYNTHETIC_PRODUCTION_PRIVACY_CANARY`를 명시한 뒤에만 실행한다. 해당 canary는 합성 전용 계정·주체를 만들고 기존 삭제 API/worker 경로를 실행한 뒤 정해진 정리 절차를 수행한다. 승인 전 dispatch 금지.
4. 승인된 canary가 만든 non-zero Production event를 현재 backup과 같은 복구 증거 묶음에 결합하고, 격리 복원본에서 authoritative ledger를 재생한다. 2회 재생 idempotency, finalizer 완료, no-resurrection, stale JWT·Auth·Storage 접근 차단, 법적 보존 데이터 유지까지 확인한다.
5. 위 canary는 한 captured window의 replay 증거다. `futureSafePrivacyReconciliation=true`를 위해서는 Primary PostgreSQL 손실 후에도 살아남고 사고 기준 시점까지 누락 구간 없이 삭제·철회 이벤트를 제공하는 독립적인 durable source continuity를 별도로 입증한다. GitHub Actions freshness watcher는 감시 도구이지 독립 이벤트 원장이 아니다.

#### 8-D. 전체 서비스 RPO / RTO와 재개 게이트

- 승인된 목표는 기존 Product Owner 결정 그대로 RPO `PT24H`, RTO `PT6H`다. 값을 새로 만들거나 낮추지 않는다.
- 기존 authoritative isolated procedure의 5,536초 RPO / 67초 RTO 비교는 해당 절차의 목표 비교를 충족한 과거 증거다. Hosted Auth/Storage 전체 복구 동등성을 대신하지 않는다.
- 전체 복구 시험에서 백업 기준 시점부터 실제 복구 가능한 서비스 상태까지의 데이터 손실 구간과 전체 소요 시간을 측정해 각각 PT24H / PT6H 이내인지 확인한다. 4초 DB-only restore 또는 58,508초 synthetic reference interval을 전체 서비스 RPO/RTO로 사용하지 않는다.
- DB·Auth·Storage·Worker·Saju 연결과 삭제/철회·접근권한을 확인한 후에만 recovered-serving admission을 재평가한다.

**Phase 8 종료 조건:** migration/DDL/ACL/provider ledger 정합성, provider-managed full restore, Hosted Auth/Storage 복구, 독립 개인정보 연속성, future-safe replay, 전체 서비스 RPO/RTO가 모두 증거로 확인되고 `dr_ready=true`, `serviceResumptionAllowed=true`가 산출되어야 한다. 하나라도 빠지면 #1887은 OPEN, Phase 8은 BLOCKED로 유지한다.

### Gate 2 — Phase 11: 이미 성공한 실측 재사용 + 부족한 조합만 보완

기존 [#42244701347](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42244701347)의 15분 workerd overlap 제품 경로 실측은 유효한 격리 증거로 인정한다. 동일한 3,600건·4 req/s 시험을 이유 없이 반복하지 않는다.

남은 검증은 기존 증거에 없는 조합으로 한정한다.

1. 현재 제품 경로에서 DB pool acquisition timeout / DB unavailable 또는 slow DB가 발생했을 때 요청이 bounded-fail 되는지, Health가 독립 유지되는지, 복구 후 계산이 회복되는지 확인한다. 이미 통과한 Saju outage/recovery는 반복하지 않는다.
2. 필요한 경우에만 동일한 격리 workerd + GoTrue + PG + Saju 구성에서 DB 압력과 Saju 자원 압력을 구분 측정한다. 동시성·지속시간·성공/503/transport/skipped·p50/p95/p99·DB/Auth/Saju 시간·CPU/memory·복구를 하나의 sanitized evidence로 남긴다.
3. `productionWorkerAdmissionMeasured=false`, `hostedHyperdriveMeasured=false`, `productionCapacityProven=false`를 유지한다. 격리 실측을 Production 처리량이나 실제 Cloudflare/Hyperdrive 한계로 바꾸지 않는다.
4. 외부 Production 부하 주입이나 사용자 트래픽 실험은 하지 않는다.

**Phase 11 종료 조건:** 기존 overlap 실증을 포함해 제품 경로의 DB/Saju 주요 실패·복구 경계와 대표 비운영 자원 한계가 재현 가능하고, 모든 요청·오류·복구·정리 증거가 완전해야 한다. Production capacity claim은 별도 실제 Production 계측이 없는 한 계속 금지한다.

### Gate 3 — Phase 12: 확장 판단 기준 확정

1. Phase 11에서 검증된 DB pool·acquisition latency·Saju adapter latency·CPU throttling·memory·API p95/p99만 입력으로 사용한다.
2. 현재 관측된 concurrency 4의 clean 범위, concurrency 8의 DB pool 실패, Saju 0.01 CPU 압력 결과는 진단 근거이지 Production 확장 임계치가 아니다.
3. 측정된 대표 비운영 구성에서 확장/축소를 검토할 수 있는 지표, 관찰 구간, 지속 조건, 복구 여유, 수동 조치 기준을 명시한다. 숫자는 실제 반복 측정과 기존 서비스 목표에서만 도출한다.
4. `automaticScalingEnabled=false`를 유지한다. 수동 운영 기준과 Production 수치 임계치는 증거·사용자 승인 전까지 미승인으로 둔다. Health 단일 경로에서 degradation이 없었다는 결과로 확장 임계치를 만들지 않는다.

**Phase 12 종료 조건:** 확장·축소를 판단할 측정 지표와 경계, 근거 실험, 수동 대응 절차가 문서화되고 승인되어야 한다. 자동 확장 활성화는 이 로드맵의 목표가 아니다.

### Gate 4 — Phase 13: 최신 배포 버전 최종 수용

현재 Worker `295b9496-795b-44a3-b3f9-141c0b83e47d`의 익명 E2E는 통과했지만 Readiness는 configuration-only다. 다음 14개 항목을 동일한 최신 배포/소스 증거에 연결해 최종 판정한다.

| §33 항목 | 현재 판정 | 최종 종료에 필요한 증거 |
|---|---|---|
| 1–2. 소스 SHA / Provider 배포 | 부분 확인 | 현재 Worker version·100% traffic·build source SHA 및 Saju exact image digest를 같은 시점에 결합 |
| 3. Secret/config preflight | 미수용 | secret 값 노출 없이 필수 설정·rotation 상태·환경 분리 확인 |
| 4–5. Liveness / Readiness | 부분 확인 | Health 외에 실제 dependency/capability 상태와 degraded semantics 확인. config-only readiness를 연결 성공으로 간주하지 않음 |
| 6. Negative auth | 현재 Worker PASS | 익명 Member/Saju/Preview 401, cross-origin 403 등 exact-version 검사 유지 |
| 7–9. Positive auth / dependency / Saju compatibility | 현재 버전 미수용 | 기존 governed synthetic Member 경로를 정확한 최신 Worker version에 묶어 로그인·주체 귀속 DB·Birth revision·계산-only Saju 검증 |
| 10. Private no-store / CDN | 부분 확인 | 성공한 private 경로 전체의 no-store 및 CDN 사용자 간 격리 검사 |
| 11–12. Secret non-reflection / log redaction | 부분 확인 | 최신 버전의 응답·헤더·로그 필드에서 비밀/식별자 비노출 확인 |
| 13. Metrics / alerting | 미수용 | 최신 버전과 DB/Auth/Saju dependency golden signals, 실제 경보 발생·전달·보존 근거 |
| 14. Rollback candidate | 부분 확인 | 정확한 직전 artifact·source·호환성 확인 및 기존 안전 절차에 따른 rollback/recovery 증거 |

추가 규칙:

- [#42271216975](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42271216975)는 익명 운영 ingress 증거로만 사용한다. 같은 main의 [Supabase Production #42271105691](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42271105691)은 `deploy-migrations`가 SKIPPED였으므로 migration 배포 성공으로 간주하지 않는다.
- `inspect-main-operations-acceptance.mjs`는 exact-SHA 증거 수집기이며 `acceptanceDecision=NOT_EVALUATED_BY_COLLECTOR`를 반환한다. 수집기 성공을 14개 항목 자동 PASS로 해석하지 않는다.
- Positive Production smoke에 기존 수동 확인 문자열 또는 승인 절차가 요구되면 임의 dispatch하지 않는다. 사용자 데이터·실결제·실제 Reader/Chat 부작용은 만들지 않고 전용 합성 주체만 사용한다.
- 배포가 바뀌면 그 이전 버전의 live E2E·로그·메트릭·rollback 증거를 최신 버전 수용으로 승격하지 않는다.

**Phase 13 종료 조건:** §33의 14개 항목이 모두 증거 기반 PASS이고, §34 적용 가능한 장애 행렬 및 §35 Runbook이 확인되며, Phase 8 재개 게이트가 열린 상태여야 한다.

## 4. 최종 종료 판정

다음 조건을 모두 충족할 때만 전체 Production Operations를 완료 처리한다.

1. Phase 8 종료 조건 전부 충족, #1887 해결 및 종료 근거 기록.
2. Phase 11 주요 제품 의존성 실패·복구 실측 완료. 이미 성공한 overlap 실험은 재사용하고 미측정 조합만 보완.
3. Phase 12 수동 확장·축소 판단 기준과 근거가 승인됨. 자동 확장은 별도 목표가 아님.
4. Phase 13 §33 14개 항목 PASS, §34 장애 행렬 및 §35 Runbook 종료 조건 충족.
5. 최신 main SHA와 실제 배포 Worker/Saju artifact가 일치하고, 버전별 수용 증거가 유효함.
6. `dr_ready=true`, `serviceResumptionAllowed=true`. Phase 11 비운영 용량 실측과 Phase 12 수동 확장 판단 기준이 각각 증거와 승인 범위 안에서 완료됨. 실제 Production 계측·승인이 없다면 `productionCapacityProven=false`는 그대로 유지하며 격리 수치를 Production 용량으로 승격하지 않는다.
7. 미해결 차단·승인 대기·증거 만료가 없음.

위 조건을 충족하기 전에는 `ROADMAP_COMPLETE`를 선언하지 않는다. 문서 병합, CI GREEN, 백업 성공, 격리 복원 성공 또는 익명 E2E PASS 하나만으로 전체 종료를 선언하지 않는다.

## 5. 승인·안전 경계

| 작업 | 진행 조건 |
|---|---|
| Read-only migration/source/ACL 조사 | 기존 권한 범위에서 독립적으로 진행 가능 |
| 비운영 격리 부하·복구 실험 | 합성 데이터·루프백/격리 대상·기존 워크플로만 사용 |
| Production privacy canary | 정확한 사용자 승인 `RUN_SYNTHETIC_PRODUCTION_PRIVACY_CANARY` 필요 |
| Production migration repair/deploy 또는 DDL/DML | 원인·영향·forward-only 계획을 먼저 제시하고 사용자 명시 승인 필요 |
| 신규 Hosted DR project / 유료 리소스 | 대상·비용·부작용을 보고하고 사용자 승인 후 생성 |
| Production traffic, secret, IAM, provider configuration 변경 | 별도 명시 승인 없이는 실행하지 않음 |

기존 Production 프로젝트를 테스트 DR 대상으로 전환하지 않는다. 실제 사용자 데이터·토큰·객체 내용을 로그나 산출물에 남기지 않는다. 외부 업체 문의나 로드맵 밖의 기능 추가는 하지 않는다.

## 6. 기존 기준 문서

- [Production Operations architecture](../architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md) — 운영 계약·14개 수용 항목·장애 행렬·Runbook·Phase 정의의 권위 문서.
- [Production Operations status/worklog](PRODUCTION_OPERATIONS_STATUS_AND_EXIT_20261030.md) — 날짜별 실측 및 현재 상태 기록.
- [PostgreSQL DR readiness](POSTGRES_DR_READINESS_STATUS_V1.md), [Hosted Auth/Storage gap matrix](HOSTED_AUTH_STORAGE_DR_GAP_MATRIX_V1.md), [Privacy ledger authority](POSTGRES_PRIVACY_RECOVERY_LEDGER_AUTHORITY_V1.md), [Privacy replay](POSTGRES_PRIVACY_RECONCILIATION_REPLAY_V1.md) — Phase 8 상세 권한·복구 경계.
- [Phase 11 capacity evidence](API_CONTROLLED_CAPACITY_PHASE11_20261030.md), [Phase 12 scaling review](OBSERVED_SCALING_REVIEW_PHASE12_20261030.md), [Phase 13 acceptance evidence](MAIN_OPERATIONS_ACCEPTANCE_PHASE13_20261030.md) — 이미 확보한 실측과 잔여 검증 근거.

Watchtower-Track: ops
### 2026-11-08 / Gate 1 Phase 8-C — scheduled privacy ledger predecessor attempt repair

- Exact RED [#42404193088](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42404193088) attempt 1 on `3bdec3c162b132284498ebed38e15feaf32c0ff9` was a main scheduled Production PostgreSQL Privacy Recovery Ledger run. The predecessor resolver rejected **two unexpired artifacts in the same previously successful re-run ID**, not a failed DB query or missing encryption secret.
- Observed predecessor [#42381192945](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42381192945) attempt 2 has the valid latest upload artifact `13582736761` created at 2026-11-07T17:00:59Z and earlier attempt 1 artifact `13577209175` at 14:21:35Z. The source must match the **last successful attempt's exact upload step window**, and still fail closed if that step has missing/expired/ambiguous evidence.
- This correction changes only selection/read-only metadata behavior. New PR exact-SHA CI and a fresh successful **main run using merged workflow code** are required before declaring scheduled RED closed. Re-running #42404193088 without a source change uses the old SHA and does not verify the fix. Independent continuity, RPO, Hosted DR and service resumption remain unproven; #1887 stays open.
