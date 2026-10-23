# 사주 브릿지 — 기존 Supabase 단일 프로젝트 S3 적용 승인 패킷 (2026-10-15)

Watchtower-Track: saju-bridge

> **상태: 검토용 / 아직 미승인 / Production 변경 0건.** 기존 명하 Supabase `MyengHa` 프로젝트(Ref `cnsfpcdiyofqvhpcegfc`) 하나만 사용한다. Neon·추가 Supabase 프로젝트·별도 서버를 만들지 않는다. 이 문서는 정확한 승인 범위와 금지 범위를 분리하기 위한 **적용 전 자료**다. **승인 문구, GitHub PR 병합, CI PASS를 운영 강인증이나 실행 허가로 해석하면 안 된다.**

## 1. 현재 Production 읽기 전용 확인 사실

2026-10-15 연결된 명하 Supabase의 `pg_catalog`, `supabase_migrations.schema_migrations` 및 기존 소스만 조회했다. Auth 사용자·출생 입력·키·개별 Reading 행은 읽지 않았다.

- 기존 서비스 테이블 `public.subjects`, `birth_profiles`, `birth_profile_revisions`, `readings`, `reading_execution_attempts` 존재. 기존 `readings`는 요청 중복 방지 고유 제약이 있고, 실제 Reading 데이터·기존 Auth 권한·결제/상품 기능 변경은 필요 없다.
- 기존 제한 로그인 `myeongha_runtime`, `myeongha_worker_runtime`, 비로그인 `myeongha_api_executor` 존재. 모두 기존 권한 유지.
- 명하 Production의 적용된 Supabase migration 수 **173**, 로컬 파일과 순서가 다른 마지막 원격 버전 **`20261008090417`**. 번호형 migration 최종 적용은 **`1510`**이며, 저장소에 있는 번호형 **`1520`부터 `1720`까지의 후속 migration은 적용 기록이 없다**. 특히 `1540_saju_source_proof_nonce_claim_authority_v1.sql`은 **소스에만 있고 실제 테이블/역할 미존재**.
- 현재 `saju_bridge_private` schema, `myeongha_saju_bridge_permit_owner`·`myeongha_saju_bridge_permit_executor` 역할 없음.
- 따라서 **전체 `supabase db push --include-all` 금지**. 기존 배포 스크립트 `scripts/operations/run-supabase-production-migrations.sh`의 일반 경로는 미적용 migration 전체를 포함시킬 수 있고, 관계/Se-yeon 복구 gate도 별개로 관리된다. 새 1730 SQL은 `supabase/proposals/`에 머물며 `supabase/migrations/`에 넣는 행위를 승인으로 오해하지 않는다.
- Production Supabase 조직은 Free. 이번 DB schema에는 신규 플랫폼·새 서버 비용이 없지만 기존 무료 할당량/CPU/데이터베이스 부하 증가 비용은 **무조건 0원이라고 보장하지 않는다**.

## 2. Owner에게 처음 요청할 승인 범위 — **S3A: 비활성 private DB 객체 준비만**

**승인 대상 SQL 소스:** [`supabase/proposals/1730_saju_bridge_single_project_operator_permit_v1.sql`](../supabase/proposals/1730_saju_bridge_single_project_operator_permit_v1.sql) (정확한 적용 SHA와 blob SHA는 **최종 CI 병합 후** 고정해서 재제시). GitHub의 `1730`은 **현재 배포 version이 아니라 초안 파일의 식별자**다. 실제 Production에 등록할 migration 이름/버전은 기존 migration 충돌·상태·원격 전용 버전을 재검토해 별도 지정할 것.

| 대상 | 허용되는 최소 변화 | 범위 밖 |
|---|---|---|
| 기존 `MyengHa` DB 1개 | 새 비공개 schema `saju_bridge_private` 1개 | 기존 `public`, `auth` 테이블 변경·데이터 이관·기존 사용자 조회/변경 |
| 새 tables | `operator_permits_v1`/ `audit_events_v1` **2개**, 생성 시 데이터 **0행** | 새로운 Reading/Subject/nonce/회원 DB, 예제 실제 회원, 초기 Permit 발급 |
| 새 roles | `myeongha_saju_bridge_permit_owner`, `myeongha_saju_bridge_permit_executor` **NOLOGIN 2개** | LOGIN 역할/비밀번호/Key/Root/KMS/별도 서비스 자격증명/role membership |
| 새 함수 | 비공개 `cmd_consume_operator_permit_v1`, FORCE RLS 및 최소 EXECUTE 권한만. 서버 라우트/실호출은 **연결 안 함** | PostgREST exposed schema 추가, `PUBLIC/anon/authenticated/service_role` 권한, 전용 API/Runner/상품·판매 허가 |
| 운영 이력 | 현재 적용된 원격 migration 기록·타 트랙 보류 범위를 **그대로 유지** | `1520..` 백로그 자동 적용/가짜 `migration repair`, 앱·상용 feature flag 변경 |

**추가 사용자 승인이 없으면 금지:** 실환경 Saju HTTPS/Bearer/HMAC 접속, DB 비밀번호/로그인 생성 및 role 부여, Permit ISSUED 삽입/소비, 실제 회원 접근, 프로덕션 Runner/Chat/Reading 공개, 정식 출시·판매·결제, 다른 미적용 migration의 적용.

**보안 잔여 위험(명시적 수용 대상):** 한 프로젝트 안의 논리 스키마/역할 분리는 하나의 관리자·클러스터·복구·장애 도메인을 공유한다. 고격리 3DB/별도 Auth/독립 Root/Attestor/외부 불변 감사 R01–R14를 충족하지 않으며 기존 SO-4 staging acceptance로 대체할 수 없다. DB 내부 감사 로그는 운영자가 수정 가능한 동일 도메인 증빙이다. 이 위험을 제품 **단일 프로젝트 대안**으로 수용하는 결정과 실제 정식 판매/출시 승인은 서로 다르다.

## 3. Owner 승인 전 반드시 준비·확인할 기술 게이트

1. **S2 증빙:** [S1 PR #2122](https://github.com/gycha0109-beep/MyeongHa/pull/2122) 정적·모의 검사 + **실제 CI용 PostgreSQL17**에서 SQL proposal 전체 DDL 적용 성공, 실제 역할/GRANT/RLS, 다른 계정 거부, 이중·경합 소비, 만료 후 row-lock 재평가, 잘못된 SHA/scope, COMMIT/ROLLBACK 및 audit 충돌 검증 PASS. CI DB는 각 작업 후 삭제. **운영 DB 검증 PASS로 승격하지 않는다.**
2. **변경 스냅샷 고정:** 승인 대상의 최종 `main` commit과 Git blob SHA, 단 하나의 SQL proposal content hash, 현재 Project Ref·DB PostgreSQL major/version·schema/role/함수 충돌 없음, 기존 migration frontier 및 기타 보류 작업과의 분리 확인.
3. **백업 및 되돌리기:** Production 백업/독립 복원 검증은 **실제 승인 전** 최신 유효 증거가 있어야 한다. 별도 유료 서버 구축이 전제는 아니지만 읽기 전용 백업의 생성·저장·보존 주체·개인정보 보호·TTL·복원 경로를 Owner와 확인해야 한다. 이전 백업의 CI PASS를 현재 복구 보증으로 가장하지 않는다.
4. **정확히 제한된 적용 경로:** 기존 main-push Supabase 전체 db-push와 분리된 **명시 승인된 일회성 guarded DDL**만, 프로젝트 ref·SQL digest·단일 트랜잭션·강제 TLS·최소 실행 자격증명·시간 창을 고정. `CREATE`·`ALTER`·`GRANT` 후 예상 권한·RLS·0행·기존 테이블 ACL 보존을 재조회. 프로젝트/버전/자격증명 불일치 또는 예상 밖 객체·작업 실패 시 **즉시 HOLD**.
5. **취소/복구:** SQL 적용 전이면 아무 변경도 하지 않고 보류. 단일 트랜잭션 실패는 자동 ROLLBACK. 이미 commit했다면 승인되지 않은 `DROP SCHEMA ... CASCADE`, 원장/감사 삭제, 전체 DB 복원은 실행하지 않는다. 객체가 비활성/0행이며 종속성이 없다는 독립 점검 후 **별도 Owner 승인을 받아** 정확한 역변경을 설계해야 한다.
6. **운영 권한은 별도 S3B/S5:** **실제로 사용할 LOGIN/Secret/Owner WebAuthn·서명·Target Authority**, 진짜 HTTPS 사주 엔진과 출생정보→Reading 결과의 일치, 기능별 공개/판매는 이번 최초 S3A 승인과 **독립된 추가 단계**다.

## 4. Owner 승인 판단을 위한 간단한 문구 (아직 요청 아님)

> **S3A 승인 여부:** 기존 MyengHa Supabase 프로젝트 `cnsfpcdiyofqvhpcegfc`에 한하여, 최종 검증된 `saju_bridge_private` 비공개 schema 1개, 데이터 0행의 테이블 2개, NOLOGIN 역할 2개, 제한된 미연결 함수 1개를 생성하는 단회 SQL 적용을 승인 / 보류. 추가 프로젝트·유료 서비스 0개, 기존 회원·Auth·Reading·결제·실행·키·로그인·배포 변경은 승인하지 않음. 단일 클러스터 공통 실패 위험과 고격리 3DB 미충족을 인지함.

**단순 구두 승인만으로 비반출 Root/독립 attestation/패스키 Owner 의도 검증을 기술적으로 입증할 수 있는 것은 아니다.** 실제 P3 이상 Operator 실행 권한은 그 구현·별도 행위 확인 전까지 `HOLD`.

## 5. 다음 작업의 분리

- **S2 완료:** 실제 폐기형 PostgreSQL 17 및 비슈퍼유저 managed migration actor 검증 PASS — PR #2128 병합, 최종 통합 CI 11/11 PASS. S2 증빙은 운영 DB 복원 증빙과 별개입니다.
- **사용자 판단 대기 지점:** S2 PASS와 정확한 소스·대상·위험을 제시해 **S3A DB DDL 허가만** 질문한다. 허가 후라도 최신 백업에 결속된 복원 리허설과 fresh preflight 등 미충족 안전 게이트가 있으면 SQL 적용 금지.
- **향후(첫 승인으로 수행하지 않음):** 제한적 DB 연결·Owner 인증/서명·실제 사주 엔진 검증, Reading/Entitlement 서비스 테스트, 단계적 출시 승인.

**불변:** `stagingAdmission=HOLD`, `operationalEvidence=NOT_VERIFIED`, `canRunOnce/canExecute/canPublish/canSell=false`, 기존 R01–R14는 NOT_VERIFIED. 누적 테스트 성공을 실제 출시 인가로 해석하지 않는다.


## 6. S2 병합 후 변경 원문 및 운영 증빙 고정 — 2026-10-15 추가 검토

> **S3A 코드 검증 완료 / 실제 운영 DDL 미적용 / 복구 gate 미충족.** 이 추가 검토는 새 인증·배포·실행 권한을 부여하지 않는다.

### 6.1 정확한 승인 대상 (immutable source pin)

- 저장소: `gycha0109-beep/MyeongHa` / 병합된 기준 `main@4f7accaa614b9faa15737c068f665e5ef8172123` (PR #2128, 2026-10-15 19:17 KST).
- SQL 파일: `supabase/proposals/1730_saju_bridge_single_project_operator_permit_v1.sql` — **절대 `supabase/migrations/`로 이동하지 않음**.
- 파일 Git blob SHA-1: `42e076799d627bc9e19fe28e1ad25b4548e05e61`.
- SQL 전체 내용 SHA-256 (파일에 저장된 9951 ASCII bytes, 최종 개행 포함): `900e0771915776b4a7c2a8b3cf60e24b83c79fcec14f27cf6356b44685b385e2`.
- PR HEAD: `c1e2dac0dd7e527947627bdf58b256da4b0e2f0b`; [최종 fixed-head CI #38718512449](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38718512449) **11/11 SUCCESS**; [PG17 scoped CI #38717886391](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38717886391) **9/9 SUCCESS**. 격리형 PG17에서 역할·RLS·거부 권한·정확한 permit·경합·잠금 대기 후 만료·실패 원자성 확인.
- 병합 후 [Supabase Production workflow #38719197486](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38719197486): `detect-production-db-relevance=success`, **`deploy-migrations=skipped`**. 따라서 이 병합의 일반 마이그레이션 배포 경로는 실행되지 않았다.

### 6.2 확인한 운영 인프라 경계 (읽기 전용)

- 연결된 실프로젝트 `MyengHa` / ref `cnsfpcdiyofqvhpcegfc` / Singapore / `ACTIVE_HEALTHY` / PostgreSQL **17.6.1.166**, 최신 관리 평면 조회로 일치.
- 연결된 프로젝트의 `list_migrations`: **173개**, 번호형 최신 **1510**, 최종 원격 타임스탬프 **20261008090417**. `1520`–`1720`, 특히 `1540` nonce는 소스에 있지만 적용 이력에 없음.
- `list_tables(saju_bridge_private)`는 **0개**로 응답. 이는 해당 schema·역할·함수 부재를 단독으로 보증하지 않는다. 이미 기록된 운영 `pg_catalog` 읽기 조회는 해당 객체 부재를 확인했지만, 이번 신규 사전 조회에서 민감한 시스템 카탈로그 SQL은 도구 보안 게이트가 차단했으므로 **승인 후 최종 적용 직전 별도 권한 있는 읽기 전용 확인이 다시 필요**하다.
- Security Advisor 재조회: 기존 `policy_exists_rls_disabled` 6건 및 `auth_leaked_password_protection` 1건. 별도 제품 위험이며 이번 S3A의 신설 private 객체에 대한 정책 자동 승격이나 임의 수정은 불허.

### 6.3 복구 증빙 — **현재 S3A 적용 보류 원인**

- [암호화 운영 논리 백업 #38641851823](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38641851823): **SUCCESS**, 2026-10-15 06:38 KST 시작. Artifact `myeongha-postgres-20261014T213954Z`, artifact ID `11930481921`, **expired=false**, 만료 예정 **2026-11-14 06:42 KST**. 백업 내용 다운로드·복호화·개인정보 조회는 하지 않음.
- 확인된 [격리 복원 리허설 #38090483306](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38090483306)은 **SUCCESS**이지만 **2026-10-11 07:11 KST 시작한 과거 복원**이다. 위 #38641851823의 백업과 **같은 아티팩트를 복원했다는 증거가 아니므로**, S3A 직전 fresh backup → isolated restore chain gate는 **NOT_VERIFIED**.
- **적용 전 필수:** 동일한 최근 백업 run/artifact를 출처로 한 새 격리 복원 리허설의 run ID, 성공, checksum/manifest, migration frontier, 의도한 복원 검증 통과를 독립 확인. 기존 Actions `postgres-isolated-restore-drill.yml` 재사용, 대상은 폐기형 격리 DB. Production에는 어떤 쓰기도 하지 않는다. 해당 검증이 완료되지 않으면 S3A를 승인받아도 적용 중단.

### 6.4 단일 SQL만의 일회성 적용 절차 — 아직 **미실행**

1. Owner가 S3A 범위·단일 프로젝트 공유 실패 도메인을 별도로 명시 승인하고, 실행 시간 창과 중단 책임자를 지정한다. 승인 전 쿼리·DDL에 신규 변경 없음.
2. 운영 마이그레이션 이력 및 대상 `pg_namespace/pg_roles/pg_class/pg_proc` 충돌을 **실행 직전** 읽기 전용으로 검증한다. 프로젝트 ref, DB host/TLS `verify-full` CA 검증, PostgreSQL major, 최소 관리자 실행 identity와 권한, source/commit/digest, 백업→동일 아티팩트 복원 증빙 모두 일치해야 한다. SQL 내용·지정 객체·기존 migration 경로가 바뀌면 HOLD.
3. 기존 `scripts/operations/run-supabase-production-migrations.sh` 및 `supabase db push --include-all` **사용 금지**. 운영 DB 연결은 승인된 executor/세션에서 **하나의 SQL 원문을 하나의 트랜잭션**(`BEGIN`→승인 SQL 원문→검증→`COMMIT`)으로 제한. 빈 테이블/새 역할/비공개 함수 외의 변화는 금지. 마이그레이션 history에 임의 버전 삽입·`migration repair` 금지. 승인하지 않은 신규 login/키 또는 서비스 호출 금지.
4. COMMIT 전/후 검증: schema 1개, 신설 empty table 2개, NOLOGIN/NOINHERIT/NOBYPASSRLS 역할 2개, 비공개 함수 1개, FORCE RLS, 기본 함수 `PUBLIC EXECUTE` 제거, client/API/service_role/기존 runtime 차단 및 executor의 permit 직접 쓰기 차단. `pg_roles`·객체 권한 catalog만 읽고 기존 회원·출생·Reading 행은 조회하지 않음. `supabase_migrations` 변동 없음, 기존 Production ACL/기능 변동 없음.
5. 프리플라이트나 commit 후 권한 차이 발견 시 즉시 서비스 연동·소비를 계속 HOLD. 트랜잭션 실패는 전체 ROLLBACK. COMMIT 여부 불명확하면 **재실행 금지** 후 읽기 전용 실제 catalog 판정. 이미 COMMIT된 객체는 Owner의 별도 변경 승인 없이 `DROP`/강제 복원/감사 삭제 금지. 독립된 되돌리기 계획을 먼저 심의한다.

### 6.5 S3A와 실제 사주 운영 승인 분리

S3A는 DB 내부 **미연결·무발급·0행 구조**만 만드는 승인이다. 기존 고격리 R01–R14는 모두 NOT_VERIFIED. 현 단계에서는 Owner 강인증/독립 서명, Login/Secret/연결, `1540` nonce 배포, 실사주 호출, 실사용자 Reading, 공개/판매, Runner 실행을 승인하거나 검증하지 않는다. 계속 `stagingAdmission=HOLD`, `operationalEvidence=NOT_VERIFIED`, `canRunOnce/canExecute/canPublish/canSell=false`.

## 7. Owner S3A 조건부 승인 후 동일 백업 복원 성공 — 2026-10-15 21:08 KST 재검증

> **S3A 승인 수신 / 동일 백업 격리 복원 gate PASS / S3A 운영 DDL 아직 미적용 / 남은 TLS·운영 executor gate HOLD.** 이 절은 6.3의 2026-10-15 20:50 KST 현재 미완료 상태를 후속 증거로 갱신한다. S3B, permit 소비·발급, 사주 연동, 공개 및 판매를 승인하지 않는다.

- Owner의 **조건부 S3A 승인**은 정확한 private 비활성 DB 객체에 한정한다. 모든 안전 게이트가 완비되기 전에는 단일 트랜잭션조차 실행하지 말라는 조건이 명시되어 있다.
- 최신 선택 백업: [Production PostgreSQL Logical Backup #38641851823](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38641851823), encrypted governed artifact `myeongha-postgres-20261014T213954Z` / ID `11930481921`, source SHA `8b62a3ee6fd882606bac2324f1c8c0c97bcbd141`.
- **정확한 원본에 대한 새 복원 PASS:** [Isolated Restore Drill #38731492782](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38731492782), 2026-10-15 12:01 UTC 시작, `workflow_dispatch`, `main@027c22cfb5ec1711e508bc56c0c925bd9c6f0957`, job `116410110318` **SUCCESS**. 로그에 `BACKUP_RUN_ID=38641851823`, 다운로드 원본 ID `11930481921`, archive SHA256 검증 `OK`, 실제 `github-actions-loopback-supabase-postgres` restore `success`, 스코프 복구 검증 및 `backup_migration_frontier=20261008090417`이 명시되어 있다. restore evidence artifact `postgres-isolated-restore-drill-38731492782` / ID `11970571071`. 운영 DB에는 복원하지 않았으며 새 Production 변경은 발생하지 않았다.
- 복원 workflow의 `dr_ready=false` 및 `authoritative_privacy_reconciliation=not_exercised_without_production_ledger` 경계는 그대로 유지한다. 이번 한 번의 동일 백업 복원 PASS가 전체 Production disaster recovery acceptance나 실제 개인정보 원장 리플레이 합격을 의미하지 않는다.
- **복원 후 read-only Production 확인:** 2026-10-15 12:08:12 UTC, `MyengHa` ref `cnsfpcdiyofqvhpcegfc`, `ACTIVE_HEALTHY`, PostgreSQL `17.6`, `current_user=postgres`. `pg_stat_ssl.ssl=true`인 관리 연결에서 target schema 0, `operator_permits_v1` 0, `audit_events_v1` 0, S3A 두 역할 0, private 함수 0. 현재 원격 migration 173개, timestamp 최종 `20261008090417`; `1540`·`1730`은 미적용. GitHub `main`도 `027c22cfb5ec1711e508bc56c0c925bd9c6f0957` 그대로.
- 승인된 SQL 원문은 변경 없음: Git blob `42e076799d627bc9e19fe28e1ad25b4548e05e61`, SHA-256 `900e0771915776b4a7c2a8b3cf60e24b83c79fcec14f27cf6356b44685b385e2`, 9951 bytes.

### 7.1 남은 강제 게이트 — 운영 DDL 적용 금지

1. 백업 생성 기존 경로에는 `PGSSLMODE=verify-full`, `PGSSLROOTCERT`, 루트 CA fingerprint pin을 검증하는 `scripts/operations/prepare-production-postgres-strict-libpq.mjs`가 있다. **그러나 현재 Supabase MCP 관리 연결은 TLS 암호화 여부(`ssl=true`)만 확인되었고, 실제 S3A DDL 적용 세션의 대상 pooler 호스트·CA·hostname `verify-full` 증빙은 없다.** 관리 연결의 암호화만으로 이 gate를 통과시켜서는 안 된다.
2. S3A 전용 일회성 승인 executor가 검증된 기존 Production `postgres.<project-ref>` Session Pooler 및 위의 pinned-CA `verify-full` 경로를 이용해 **정확한 파일만**, 이전과 동일한 backup/restore run 증거·Git blob/SHA-256·실행 직전 충돌/권한/원격 migration frontier·운영 실행 창/중단 책임자를 확인하고, 일회 트랜잭션 내에서 후조건(2 empty tables, 2 NOLOGIN roles, RLS/ACL/function/role membership, no migration history change)을 강제할 수 있는지 확인해야 한다.
3. 안전 증거 미충족, 새로운 백업이 이미 최신이 됨, main/SQL 변경, 예상 밖 기존 객체, TLS 검증 실패, 적용 세션 오류면 즉시 **HOLD**, Production 쓰기 금지. 기존 `supabase db push --include-all` / `migration repair` 금지. 승인이 신규 사용자·Auth·Birth·Reading·Commerce 행 조회를 허용하는 것은 아니다.

**현재 판정:** `S3A_OWNER_CONDITIONALLY_APPROVED`, `RESTORE_GATE=PASS`, `TLS_EXECUTOR_GATE=NOT_VERIFIED`, `S3A_APPLICATION=HOLD`; `stagingAdmission=HOLD`, `operationalEvidence=NOT_VERIFIED`, `canRunOnce/canExecute/canPublish/canSell=false`, R01–R14 `NOT_VERIFIED`.
