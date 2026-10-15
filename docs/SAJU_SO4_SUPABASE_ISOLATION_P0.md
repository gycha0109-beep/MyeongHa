# SO-4 Supabase-first Staging 독립성 P0 / 운영 미연결

Watchtower-Track: saju-bridge

> **동일 프로젝트 제품 통합 대안(2026-10-15):** [기존 명하 Supabase 단일 프로젝트 설계](./SAJU_BRIDGE_SINGLE_SUPABASE_INTEGRATION_DESIGN_V1.md). 본 SO-4의 독립 클러스터 staging 검증과는 **별도 보안·실행 프로파일**이다. §2의 Production staging 재사용 금지는 기존 **고격리 운영 증빙 R01–R14**에 계속 적용된다. 새로운 제품 통합 프로파일은 물리적 분리 미충족을 명시하고 Owner 위험 수용 및 별도 출시 승인을 받기 전 미실행/HOLD다. 세 schema를 3DB처럼 가장하거나 기존 evidence 상태를 승격하지 않는다.

> **목적:** 3-04-03B의 R01–R14 실환경 검증을 위한 공급자 선택·별도 환경의 조건을 고정한다. **이번 변경은 신규 Supabase 프로젝트 생성, 비용 지출, Production 연결, DB GRANT, 키 생성, SQL 변경, Runner 실행을 전혀 수행하지 않는다.**
>
> 선행: SO-3B #1963, [운영 증빙 런북](./SAJU_HELD_STAGING_OPERATIONAL_EVIDENCE_RUNBOOK_8C2B2D30401.md), [1인 운영 설계](./MYEONGHA_SOLO_OWNER_SEGREGATED_AUTHORITY_ARCHITECTURE_V0_1.md), #1871.

## 1. 2026-10-12 read-only Supabase 관리 평면 인벤토리 (독립 서명 증빙 아님)

| 관찰 | 읽기 전용 결과 | SO-4 권한 |
|---|---|---|
| 연결된 `명하` 계정 | `MyengHa`, `Refund_management` 두 프로젝트, 모두 ACTIVE_HEALTHY | 어떠한 신규 실행 허가도 없음 |
| `MyengHa` | 기존 Production. 저장소 `MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF`와 일치 | **SO-4 Staging 재사용 금지** |
| `Refund_management` | 별도 목적의 기존 프로젝트 | Staging 전용/전환 금지 |
| SO-4 독립 Staging/Auth | 관리 평면 인벤토리에 없음 | R05 = NOT_VERIFIED |
| Subject/Nonce/Admission | **서로 다른** 실제 클러스터의 독립 로그인·CA/DNS SAN·TLS 및 ACL 증빙 없음 | R06~R09 = NOT_VERIFIED |
| Supabase Security Advisor | `public.characters`, `chat_turn_attempts`, `chat_turns`, `subject_merge_actions`, `subject_merge_jobs`, `world_events`에서 `policy_exists_rls_disabled` 6건 | 공통 Production 보안 트랙에 이관; SO-4 증빙/권한 승격 불가 |
| 해당 6개 테이블의 클라이언트 권한(읽기 전용 SQL) | `anon`·`authenticated` SELECT 등 조회 권한 없음 확인 | 직접 공개 노출의 증거는 없으나 RLS 후속 보안 점검 필요 |

**한계:** 위 값은 연결 계정이 제공한 당시 목록과 원격 관리 API 응답의 요약이다. 독립 Attestor 서명, IAM provenance, 불변 감사 저장소, 신뢰 시계, 다른 관리 계정의 전체 인벤토리까지 검증하지 못했다. 따라서 R01–R14 어느 항목도 VERIFIED 아님. Project ref/상태는 비밀이 아닌 식별자라 해도 소스 증명으로 승격 금지.

## 2. Supabase-first 토폴로지 결정 및 불가한 지름길

- **채택:** 명하 Production Supabase는 그대로 두고 **별도** Staging Auth/Subject Supabase project를 준비. Supabase PostgreSQL은 서비스 계층에 재사용하되 Nonce·Admission은 **각각 별도의 실제 DB 클러스터**를 사용. Supabase 전용 구현이면 최소 3개의 신규 격리 프로젝트(Auth+Subject 겸용 1, Nonce 1, Admission 1)가 필요하다는 계획상 하한을 둔다. Auth와 Subject가 물리적으로 같은 프로젝트여도 R05에서 더 엄격한 별도 인증 관리 평면이 요구되면 추가 분리한다.
- **거부:** 기존 Production 안의 스키마만 분리; 기존 Refund 프로젝트 전용; Production의 Branch를 단순히 이름이 다르다는 이유로 독립 Root/보안 계정/원장으로 간주; 하나의 신규 Supabase DB에서 Subject·Nonce·Admission 스키마 3개를 만들고 3DB 독립이라 주장하는 구성.
- **잠정 대안:** 기존 로컬 폐기형 PostgreSQL 15/17·GoTrue·TLS 3DB CI 경로는 유지하며, 비용이 없는 계약·합성 부정 테스트를 먼저 한다. 실제 클라우드 요건 충족 여부는 별도 승인/감사 이후 판단.
- **실제 검증:** R01–R04는 독립 Root/Revision/Challenge·immutable external audit. R05–R09는 관리 평면과 실제 TLS/클러스터/제한 로그인/원자성. R10–R14는 Saju HTTPS ingress/키, 배포 SHA, 폐기형 Member/Birth, 복구 리허설. 이들 전부 **NOT_VERIFIED**.

## 3. 비용 및 승인 게이트

- [Supabase 과금 가이드](https://supabase.com/docs/guides/platform/billing-on-supabase): Free는 활성 프로젝트 2개 한도를 설명한다. 현재 목록에는 2개가 있다. **현재 조직의 실제 구독/과금·다른 Owner/Admin 계정 한도/신규 프로젝트 견적은 별도로 확인 필요**. 특정 프로젝트의 비용이 0임을 보장하지 않는다.
- [Supabase Branching 사용량](https://supabase.com/docs/guides/platform/manage-your-usage/branching): 미리보기 브랜치는 기본적으로 별도 자원 사용량이 발생하고 **Spend Cap으로 보호되지 않는다.** Production branch는 SO-4의 독립 운영 증빙 대체도 아니다.
- **P0(현재):** 소스/설계/합성 체크/읽기 전용 현재 현황 정리. 신규 인프라 증분 예산 상한 0, 자동 실행 허가 없음.
- **P2(별도 Owner 승인 후):** 생성할 새 Auth/Subject, Nonce, Admission 프로젝트 각각의 리전/구독/일당·월당 상한, 파기 시각, 네트워크 접근, 최소권한 IAM/Secret, 운영자 강인증, 외부 독립 Root/KMS/감사 경계 검토. 가격/한도·책임자 미확정이면 신규 프로젝트를 만들지 않는다.
- **P3/P4:** 실제 Runner/Root 변경·Production/Commerce/결제는 그 자체로 별도 승인. P2 동의는 P3/P4 승인이 아니다.

## 4. 새 P0 코드 / 무권한 결과

- `apps/api/src/saju-so4-supabase-staging-isolation-preflight-v1.ts`의 `assessSajuSo4SupabaseStagingIsolationClaimV1`은 **호출자가 낸 계획/목록을 비교하는 순수 함수**다. `observedProjects`가 운영 API 결과인지를 검증하지 않는다. 프로젝트 Ref/이름/주소가 다르다고 별도 서버·IAM·인증이 증명되는 것도 아니다.
- `NO_STAGING_RESOURCES`: 현 2개 프로젝트 인벤토리 + 계획 대상 없음. `BLOCKED`: Production/기존 비관련 자원 혼입, 미등록 프로젝트, Subject/Nonce/Admission 동일 프로젝트, 추가 과금 주장, 악성 속성, 유효하지 않은 범위. `CONSISTENT_UNVERIFIED_ORIGIN`: 격리 프로젝트가 있다고 주장하는 계획도 **실제 검증/권한 아님**.
- 미래 계획의 Auth+Subject 동일 Supabase project 구성 허용은 *설계만*이며 관리·키 custody 및 R05 검증은 별도. 실제 R05 요구가 독립 Auth 제어 평면이면 분리할 때까지 HOLD.
- `test/saju-so4-supabase-staging-isolation-preflight-v1.test.ts`는 S01–S16 synthetic fixtures를 검증. 실제 Supabase 리소스를 변경하거나 네트워크를 호출하지 않는다.

## 4A. 2026-10-15 로컬 Docker 재사용 우선 — 실환경 미보유 확인 및 R01–R14 격차 인수

**새 서버부터 준비하지 않는다.** 사용자는 별도의 스테이징 서버·보안/백업 인프라를 보유하지 않으며, 이 제약 때문에 기존 Docker 폐기형 검증을 사용했다. [Windows Phase 5 #2103](https://github.com/gycha0109-beep/MyeongHa/pull/2103)에서 MyeongHa SHA 2ddb1d4fe3f7101244ee3a628b2d1a6a7f6bc1f5 / 검증용 Saju SHA cd0acf9abd447826ccaefba56112d046e560ee04, Node 24.20.0, Docker 29.8.2 / Compose 5.5.1의 로컬 --replay-review 15개 Phase PASS·일회용 컨테이너/네트워크/볼륨 완전 정리·종료 코드 0을 **사용자 제출 자료**로 인수했다. 전체 원본 로그는 사용자 대화에 있으며 GitHub에 올리지 않았다.

**공급자 설계 결정과 실제 인프라를 분리:** 본 문서 §2의 **Supabase-first는 이미 채택된 설계 방향**이다. §1의 2026-10-12 관리 평면 인벤토리는 그 시점의 읽기 전용 관찰일 뿐 오늘의 독립 스테이징 프로젝트나 현재 요금을 보증하지 않는다. 기존 MyengHa / Refund_management 프로젝트를 임의로 전용 스테이징으로 변경하지 않는다. 따라서 [3-04-01 런북 §2A의 S01](./SAJU_HELD_STAGING_OPERATIONAL_EVIDENCE_RUNBOOK_8C2B2D30401.md)은 **공급자 설계안 존재 / 실 스테이징 자원·보안 계정·비용 승인 없음**으로 해석하고 공급자 선택을 사용자에게 다시 처음부터 묻지 않는다.

### 기존 테스트가 입증한 것과 남은 실제 증거

LOCAL_TESTED는 **폐기형 Docker 환경에서만** 실측되었음을 뜻한다. DESIGN_OR_SYNTHETIC_ONLY는 코드/검증 계약 또는 테스트 전용 값만 있고 독립 출처가 없다는 뜻이다. 어느 쪽이든 운영 열은 전부 NOT_VERIFIED다.

| 증빙 | 추가 비용 없는 기존 근거 및 정확한 한계 | 실환경에만 남은 증거 | 운영 상태 |
|---|---|---|---|
| R01 Root custody | Phase 4G 합성 Ed25519 서명·변조 차단; SO-2 pin 계약: DESIGN_OR_SYNTHETIC_ONLY | 별도 관리 계정의 비반출 Root 키·SPKI pin·IAM·custody audit | NOT_VERIFIED |
| R02 Registry/floor | SO-2 DB 합성 floor / rollback·revocation 부정 검사: DESIGN_OR_SYNTHETIC_ONLY | 별도 영속 high-water·독립 backup restore·회전/철회 감사 | NOT_VERIFIED |
| R03 Operator approval | Phase 3B 합성 Permit V2 서명/일회 소비·SO-3B 목적 분리 계약: DESIGN_OR_SYNTHETIC_ONLY | Owner 행위별 인증·서명 서비스 신원·키 목적·승인 원장 | NOT_VERIFIED |
| R04 Challenge | Phase 2B/3B/4A–4C의 합성 Nonce/Permit 원자 상태 및 장애 차단: LOCAL_TESTED | 외부 Challenge issuer/ledger·독립 조회·불명확 COMMIT 감사 | NOT_VERIFIED |
| R05 Auth | 폐기형 GoTrue 가입·JWT·/user 및 Member/Birth 결속: LOCAL_TESTED | 별도 Auth 프로젝트·관리 평면/Production 분리 | NOT_VERIFIED |
| R06 Subject TLS | 폐기형 Subject PG CA/SAN/TLS verify-full 로그인: LOCAL_TESTED | 실제 클러스터 식별·CA/peer/DNS SAN·network provenance | NOT_VERIFIED |
| R07 Subject 권한 | 폐기형 Subject/Birth RLS·제한 권한 DB 검증: LOCAL_TESTED | 실제 role membership·권한 거부·ACL/RLS 실측 | NOT_VERIFIED |
| R08 Nonce 클러스터 | 폐기형 분리 Nonce PG TLS·재사용 차단 및 물리적 COMMIT 장애: LOCAL_TESTED | 별도 스테이징 PG 클러스터·TLS/role/audit 출처 | NOT_VERIFIED |
| R09 Admission 클러스터 | 폐기형 분리 Admission PG TLS·Permit V2 일회 소비, COMMIT SIGKILL: LOCAL_TESTED | 별도 스테이징 클러스터·실제 제한 권한·V1 차단 | NOT_VERIFIED |
| R10 Saju ingress | **로컬 HTTP/HMAC loopback** 검증: LOCAL_TESTED | 실제 HTTPS ingress/TLS peer·DNS/SSRF·loopback 프록시 | NOT_VERIFIED |
| R11 Saju keys | 합성 Bearer/HMAC 결속·오염/재생 차단: LOCAL_TESTED | 실제 Secret custody·issuer/audience·rotation·키 분리 | NOT_VERIFIED |
| R12 배포 SHA | Windows 사용자 제출 두 checkout SHA 확인: LOCAL_TESTED | 스테이징 배포 두 SHA·Manifest/Plan의 서명 provenance | NOT_VERIFIED |
| R13 시험 Member | 폐기형 GoTrue/Subject/Birth 합성 회원 검증·자원 삭제: LOCAL_TESTED | 격리 스테이징의 시험 계정만 접근·사용 후 폐기 기록 | NOT_VERIFIED |
| R14 중단/복구 | 로컬 DB stop/restart·network partition·SIGKILL·fail-closed/cleanup: LOCAL_TESTED | 실제 키 revoke·감사·백업 복원·Owner 복구 절차의 증빙 | NOT_VERIFIED |

**P0 실행 결론:** 위 테스트를 같은 조건으로 재실행해도 R01–R14 운영 증명은 늘어나지 않는다. 새로운 4I/합성 신뢰 엔진·유사 스테이징 시뮬레이션을 추가하지 않는다. 현재 로컬 경로는 **재현 가능한 회귀 검증/회수 증빙으로 유지**하고 재시험은 새 결함·코드 변경·환경 변경의 근거가 있을 때만 실시한다.

**외부 의존 시작점:** R01–R04는 실제 보안 관리 평면·Key custody·audit/ledger에, R05–R14는 별도 실환경의 Auth/DB/HTTPS·배포/복구에 의존한다. 실서비스 권한, 실제 스테이징 비용·인증 수단·격리 방식이 정해지기 전에는 SO3_PREPARATION_STARTED_P0 / SO3_OPERATIONAL_ADMISSION_NOT_APPROVED에서 중지한다. 공급자별 리소스와 비용표를 검토하더라도 **프로젝트/KMS/WORM/Secret/DB GRANT·서버 생성 또는 Runner 실행을 자동으로 하지 않는다.**

## 5. 다음 작업과 절대 금지

1. P0 범위 CI/전체 통합 CI PASS → Squash 병합 → 이슈 #1871에 읽기 전용 발견사항 및 남은 P2 비용/권한 승인 기록.
2. 보안 검토 별도 이슈에는 RLS 권고 6건을 전달. **Production DB의 RLS/GRANT 변경은 이 SO-4 PR에서 하지 않는다.**
3. 실제 Staging/Root/Nonce/Admission 리소스, Secret, 네트워크 probe, 실회원·Birth는 승인 전 생성·접속하지 않는다.
4. 모든 반환에서 R01–R14=`NOT_VERIFIED`, `stagingAdmission=HOLD`, `mayRunProbe=false`, `canRunOnce/canExecute/canPublish/canSell=false`. CI 성공은 P2 승인 대체 불가.

**종료 조건:** P0 코드+합성검사+PR/CI 병합. 다음 P2 운영은 격리·가격·인증/복구·감사/폐기 승인 없으므로 HOLD.
