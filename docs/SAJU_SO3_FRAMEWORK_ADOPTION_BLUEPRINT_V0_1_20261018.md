# SO-3 고격리 스테이징 프레임워크 조합 상세 설계 v0.1 (2026-10-18)

Watchtower-Track: saju-bridge

> **2026-10-18 Owner 상위 제약 — 추가 비용 0원 확정:** SO-3에는 신규 유료 구독·클라우드 프로젝트/컴퓨트·KMS·서버·저장소·데이터 전송·CI 초과 과금을 **일절 집행하지 않는다.** 기존 시스템을 이용하더라도 추가 청구가 발생할 수 있으면 실행하지 않는다. 아래 P2/P3 신규 자원 토폴로지는 **비활성 장기 대안 설계**일 뿐 현재 도입 후보/비용 승인 요청/구축 로드맵이 아니다. P0 로컬/기존 한도 안에서 무비용으로 입증 가능한 것만 진행한다. 사용자가 이 제약을 새로 명시적으로 변경하지 않는 한 유료 공급자 추천·견적/승인 반복 요구도 하지 않는다. **고격리 실환경 R01–R14를 비용 없이 충족했다고 주장하지 않는다.**

> **상태: 설계/공급자 적합성 평가만 착수 — P0, 운영 미연결.** 이 문서는 신규 운영 실행 단계가 아니며 기존 3-04-02 → 3-04-03B → 3-04-04 → 2D-4의 하위 구현 선택 문서다. 설계·가격 조사·소스 기반 검증 외에 새 클라우드 프로젝트, 유료 리소스, DB/Secret/IAM/서명 키, 독립 Probe, Runner를 생성·수정·실행하지 않는다.
>
> **제품 경로와 분리:** 일반 명하 회원의 Saju Calculation/Preview는 신규 계정 없는 EXISTING_AUTHORITIES_V2를 사용하며 [Member-only Production E2E #39034130032](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39034130032)에서 해당 SHA 시점 성공. Guest 운영 양성 E2E/영속 테스트 데이터 정리 결정은 [#2266](https://github.com/gycha0109-beep/MyeongHa/issues/2266)에서 별도 관리. **본 SO-3은 Member/Guest 제품 사용에 필요한 추가 DB 역할, S3A Permit 설치 또는 출시 전제조건이 아니다.**

## 0. 기존 권위와 결정 계층

선행 소스(충돌 시 다음 기존 계약이 우선):
- [SO-4 Supabase-first 독립성 설계](./SAJU_SO4_SUPABASE_ISOLATION_P0.md): Auth+Subject 1개 + Nonce 1개 + Admission 1개, 실제로 별개의 **3 Postgres 클러스터**가 최소. `MyengHa` Production / `Refund_management` 재사용 금지.
- [3-04-01 운영 증빙 런북](./SAJU_HELD_STAGING_OPERATIONAL_EVIDENCE_RUNBOOK_8C2B2D30401.md): R01–R14의 정의·출처와 승인/중단 정책.
- [3-04-02 독립 Root/Registry/Challenge](./SAJU_HELD_STAGING_INDEPENDENT_TRUST_CUSTODY_8C2B2D30402.md), [SO-3 1인 운영 신뢰 경계](./MYEONGHA_SOLO_OWNER_SEGREGATED_AUTHORITY_ARCHITECTURE_V0_1.md).
- [3-04-03A Evidence Index](./SAJU_HELD_STAGING_EVIDENCE_INDEX_8C2B2D30403A.md), [T01–T40 추적표](./SAJU_SOLO_OWNER_SO3B_R_T_COVERAGE_MATRIX.md).
- 기존 순수 검증 포트 `assessSajuSo4SupabaseStagingIsolationClaimV1`과 `assessSajuSoloOwnerProviderReadinessClaimV1`은 **무 I/O·무 운영 인가**, 결과를 Runner에 전송하거나 실환경 증빙으로 승격하지 않는다.

### 결정

1. **재구축 금지:** 이미 Windows Docker Phase 5까지 인수된 `scripts/local/saju-bridge-*.compose.yml` 및 실제 GoTrue/Postgres/TLS/Nonce/HMAC CI를 Testcontainers 등으로 다시 쓰지 않는다.
2. **운영 관찰과 구성 자동화를 분리:** OpenTofu는 *미래 승인 후 자원 구성*을 돕고, 그 자체로 R01–R14 독립 출처를 보증하지 않는다. 대상 워크로드의 자기증빙을 인정하지 않는다.
3. **기본 도입 순서:** 현재는 기존 Docker/CI + 현재 TypeScript 검증기/런북만 사용. 향후 OpenTofu(계획/프로비저닝), 독립 키 custody(KMS 또는 별도 OpenBao), 선택적 Conftest/OPA(정적 정책), InSpec(독립 read-only 운영 설정 검사)를 **필요한 부분에만** 도입한다. 모두를 설치하는 것이 성공 조건은 아니다.
4. **제로 신규 비용 P0:** 이 문서와 비밀 없는 구성·계약 검사까지만 가능. 기존 코드는 `maxIncrementalCostUsdCents=0`으로 가정·검증한다. 비용 0이 아닌 안을 자동 승인받은 것처럼 이 계약의 조건을 바꾸지 않는다.
5. **인간은 Owner 1명:** Operator·Attestor는 서로 다른 서비스 신원/권한/키/보안 도메인이며 사람 2명의 심사로 가장하지 않는다. 행위별 재인증, 감사/복구, 키 회전이 실제 관리 평면에서 검증되기 전 P2/P3/P4 HOLD.

## 1. 채택할 토폴로지 (논리·물리 구분)

```text
[기존 GitHub Actions: PR scoped CI / exact-head Integration]
         | (P0: 소스 테스트만; apply 자격증명 없음)
         v
[OpenTofu IaC 후보 — 승인된 P2 환경만, 분리된 backend/관리 IAM]
         |
         +-- [격리 Auth + Subject: 신규 Supabase Project A]
         |       - 합성 Member/Auth JWT, Birth/Subject / 제한 DB 역할
         |       - 독립 Subject TLS peer / CA / RLS/ACL
         |
         +-- [격리 Nonce: 신규 Supabase Project B]
         |       - 별도 물리 Postgres, 최소 권한, 재사용/경합/불확실 COMMIT
         |
         +-- [격리 Admission: 신규 Supabase Project C]
         |       - 별도 물리 Postgres, Permit V2 소비, V1 경로 차단
         |
         +-- [격리 Saju Proof HTTPS ingress + loopback upstream]
                 - Production Saju Origin/Bearer/HMAC 재사용 금지

[별도 SECURITY/CUSTODY PLANE — 앱/테스트 DB/CI와 다른 보안 도메인]
   +-- Root SPKI pin (외부 신뢰 anchor; non-exportable 관리 대상)
   +-- Registry signed revision / monotonic floor / revoke audit
   +-- Operator signer (서명 전 Owner 의도 재인증)
   +-- Challenge issuer & durable one-time ledger
   +-- Attestor read-only probe ID + 별도 서명 키
   +-- Append-only/보존/복구 가능한 감사 기록 + trusted time
          |
          v
  [기존 Target Evidence V1/Index + Trust Evaluator: 독립 원본 검증]
          |
       [HOLD] 3-04-04 Target Authority V2 — 별도 승인/설계
          |
       [HOLD] 2D-4 1회 Runner — 또 다른 P3 승인
```

**한 PC의 3개 Docker 컨테이너는 분리 테스트일 뿐 세 개의 독립 클라우드 DB 및 별도 보안 관리 도메인 증빙이 아니다.** 신규 Supabase Project 3개도 자동으로 별개 Root custody/Attestor 독립성을 보장하지 않는다. R05에서 독립 Auth 관리 평면을 추가 요구한다면 Project A(Auth+Subject 공유)를 다시 설계하고 4개 이상의 분리 대상을 산정한다.

## 2. 프레임워크 적합성·정확한 책임

| 도구 | 채택 등급/시점 | 명하에서 *새로 담당*할 일 | 기존에 있으므로 다시 만들지 않을 일 | 한계 및 검증 포인트 |
|---|---|---|---|---|
| **Docker Compose + 기존 GitHub Actions** | **유지, 즉시** | 기존 폐기형 테스트·부정 시나리오의 참조 인수 | 기존 GoTrue/PG15·17, TLS·Nonce·Permit·원자성 재작성 | CI의 성공 ≠ 실제 클라우드 증빙 |
| **Supabase CLI** | **선택, 준비 시** | 승인된 *신규* Auth/Subject 환경에만 버전 고정된 migration/seed 검토 | 운영 `MyengHa`/Refund 수정, prod 데이터 복제 | CLI/마이그레이션 대상 ref를 별도 승인 allowlist로 제한 |
| **Testcontainers** | **보류** | 향후 컴포넌트 단위 병렬 테스트가 현 Compose로 해결 불가할 때만 평가 | Windows Phase 5 전체 재구축 | 신규 Docker 데몬 API 의존성·CI 안정성 비용 |
| **OpenTofu** | **P0 검토 / P2 별도 승인** | 보안 도메인/네트워크/격리 클러스터/Saju ingress/TTL·태그의 선언적 plan·drift·destroy 계획 | 기존 프로덕션 Vercel/Cloud Run 원본 상태 import·조작 | Supabase Project 생성/폐기 provider/API 지원 실제 조사 필수; 지원하지 않으면 수동 승인 생성 + OpenTofu는 지원 리소스만 관리. state/plan에 비밀 유출 금지 |
| **OpenBao Transit** | **후보, P2 보안 계정 필요** | Operator·Attestor 서로 다른 Ed25519 key/purpose의 sign/verify; 별도 IAM/정책 및 감사 시험 | 기존 Registry/Permit/Evidence 서명 계약 교체 | **같은 PC/동일 GitHub Runner의 OpenBao는 독립 Root 증빙이 아님**. HA·unseal·backup·audit·root seal·별도 신원 전부 검증해야 함. Root trust anchor를 앱이 전달한 키로 자동 신뢰하지 않음 |
| **관리형 KMS/Secret Manager** | **OpenBao 대안, P2 검토** | 비반출 signing key, IAM principal별 사용 제한/로그·회전 | 앱/CI에 private key 파일 배포 | **요구되는 Ed25519 서명 및 공개키/SPKI 호환성은 공급자별 검증 필수**. 불일치하면 암호 계약을 조용히 바꾸지 말 것 |
| **OPA / Conftest** | **선택, P0 static lint만** | OpenTofu plan/manifest의 Prod Ref 금지, 예상외 리소스/비용 상한/TTL 필드 정적 검사 | 기존 `assessSajuHeldStagingTargetTrustV1`·권한 계산 재구현 | 정책 PASS는 부정 조건 *필터*일 뿐 독립 IAM/운영 허가 아님. Runner boolean 게이트로 연결 금지 |
| **Chef InSpec** | **선택, 실제 P2 read-only attestor** | 외부 주체의 DB/TLS/IAM/서버 설정 검사, JSON 등 구조화된 관찰값 수집 | 기존 앱 테스트의 Auth/Nonce/Trust 로직 재작성 | InSpec 출력은 *원자료 후보*이며 검증자 독립성·서명·원본 보존·버전/라이선스 검토 없이 증빙 인수 금지 |
| **기존 Target Evidence V1 + Trust Evaluator** | **유지** | R01–R14 정확한 sourceKind·SHA/digest/신선도·서명·철회 결속 | 신규 범용 Evidence 스키마 작성 | INDEXED_UNVERIFIED / SIGNED_ASSERTIONS_UNANCHORED를 VERIFIED로 자동 승격 금지 |

상용 호스팅·보안 통제/키·관찰 주체를 대신할 **'프레임워크 하나'는 없다**. 목표는 기존 안전장치의 실제 공급자를 선택하는 것이며 오케스트레이션 프레임워크 교체가 아니다.

## 3. R01–R14 실체화 매핑 — 운영 인수 기준

| ID / sourceKind | 재사용할 기존 검증 / 미래 공급자 | 운영에서 **실제로** 확보할 비밀 아닌 판정 근거 | 필수 거부·장애 사례 |
|---|---|---|---|
| R01 `ROOT_CUSTODY` | Root-pin preflight + 별도 보안 계정 KMS/OpenBao 후보 | 외부 읽기 전용 root SPKI 지문·custody principal·key export 정책·Owner 인증 audit ref | 자체 제출 Root, 앱/CI가 Root 교체 가능, non-exportable 불명 |
| R02 `REGISTRY_ROLLBACK_LEDGER` | Registry floor V1 + 별도 durable store | 실제 high-water revision, 철회 목록·복원·snapshot anchor | 오래된 Registry 허용, 백업 복구 후 revision 감소, race |
| R03 `OPERATOR_APPROVAL_LEDGER` | Permit V2/solo-owner intent + signer | Owner 행위별 승인 이벤트, scope SHA/TTL, Operator key purpose + sign audit | Owner 로그인만 있고 행위 승인 없음, Attestor key로 서명 |
| R04 `CHALLENGE_LEDGER` | Challenge 계약 + 별도 발급/소비 DB | 발급자/원장·원자 소비/TTL·permitId·digest와 감사 ref | 재사용, 병렬 중복, COMMIT 불확실 자동 재시도 |
| R05 `AUTH_MANAGEMENT_PLANE` | 기존 GoTrue 합성 E2E + 신규 Staging Auth | Production과 다른 Auth project/control-plane ref·JWT issuer·격리 Member | Production/refund 재사용, prod JWT 혼입 |
| R06 `SUBJECT_DB_TLS_PROBE` | TLS Subject test + 별도 Subject cluster | 실제 cluster identity, server DNS SAN, CA peer 검증·제한 로그인 | CA/hostname 불일치·평문 연결·클러스터 혼용 |
| R07 `SUBJECT_DB_PRIVILEGE_PROBE` | 기존 RLS/ACL 부정 테스트 + read-only catalog | session_user/current_user, NOINHERIT/RLS/ACL/거부 로그 | cross-subject 조회, role escape, broad grants |
| R08 `NONCE_DB_ISOLATION_PROBE` | Nonce PG CI + 신규 Postgres B | Subject/Admission과 다른 실제 클러스터, 전용 ID, 재사용 차단 | 같은 VM/클러스터의 다른 schema, nonce 2회 소비 |
| R09 `ADMISSION_DB_ISOLATION_PROBE` | Admission PG v2 + 신규 Postgres C | 별도 실제 클러스터·전용 consumer, V1 비활성·불확실 COMMIT 감사 | 다른 Permit 소비, V1 우회, Partial commit |
| R10 `PROOF_INGRESS_PROBE` | 로컬 Saju HTTP/HMAC + 별도 staging HTTPS | 별도 URL·TLS peer/route allowlist·DNS/SSRF/loopback 정책 | prod origin 재사용, redirect/SSRF, TLS peer mismatch |
| R11 `PROOF_KEY_CUSTODY` | Bearer/HMAC 검증 + 보안 secret plane | staging-only purpose/key-id/rotation TTL, 권한·로그·Secret 출처 | Prod key 재사용, signing key 혼용/유출 |
| R12 `DEPLOYMENT_ATTESTATION` | 기존 SHA/digest/Manifest + 공급자 deployment API | 명하·사주 승인 SHA 및 target deployment ID·Manifest/Plan digest | 소스 SHA와 실제 serving SHA 상이, 승인 후 drift |
| R13 `TEST_MEMBER_ACCESS_PROBE` | 로컬 Member/Birth/GoTrue 검증 + 새 disposable identity | Prod와 격리된 테스트 Member/Birth 생성·접근 거부·파기 계획 | 실제 사용자 데이터, 다른 회원 접근 허용 |
| R14 `ROLLBACK_DRILL_RECORD` | recovery CI + 외부 감사/복구 운영자 | 실제 key revoke/kill switch/backup rollback drill·복구 참조 | 승인 취소 후 사용, replay, 감사 소실/복구 실패 |

**공통 증빙 파이프라인:** 대상 운영 관리 API/TLS/DB의 *별도 최소권한 Attestor*가 관찰 → 제한된 원본 저장소/감사 참조에 보관 → 독립 트러스트 anchor와 신뢰 시각을 기준으로 확인 → 기존 `TargetEvidenceV1`의 sourceKind 및 환경/두 SHA/두 digest/challenge를 대조 → `EvidenceIndexV1` 접수. 앱 API/CI가 자체 작성한 성공 JSON은 출처 증명이 아니다. R12는 current serving SHA drift 감시와 결합하며 문서나 GitHub HEAD만으로 current deployment를 추론하지 않는다.

## 4. 단계별 실제 구현 순서와 Exit Gate

| 기존 단계 | P0/P2 범위 | 산출물 | 종료 조건 / 아직 금지 |
|---|---|---|---|
| **설계 P0 — 지금** | **읽기 전용 소스 검토, 공식 문서/견적, 문서화** | 이 채택 설계, 도구별 책임, R01–R14 매핑, 선택/비선택, 가격 모델과 위험 | 기존 scoped + integration CI / merge까지. `maxIncrementalCostUsdCents=0`, 인프라·키·DB 미변경 |
| **3-04-02(D) — 추후 별도 승인** | Owner 행위별 강인증 + 예산/기한 + 별도 SECURITY/CUSTODY 도메인 | Root pin·Registry floor·revocations·Operator·Challenge 원장·복구 감사 R01–R04 | 독립 IAM/키 출처·서명/회전/되돌림 거부/복구 실측. 하나라도 불명확 → HOLD |
| **3-04-03B(D) — 추후 별도 승인** | 신규 staging Auth/Subject/Nonce/Admission, staging-only Saju ingress + 독립 attestor | R05–R14 실제 대상·권한·TLS·배포 SHA·폐기형 Member 증빙 | 관리 평면·물리 DB·TLS peer·원본 증빙/Attestor 서명 검증, Production 혼입 0 |
| **3-04-04(E) — 별도 설계·검수** | **운영 검증 후에만** Target Authority V2 | Intent/Permit/Evidence/Challenge/floor/revocation/drift/cost/TTL fail-closed 재판정 | 기존 V1 boolean 우회 금지, 부정 시험 전부 거부. 아직 Runner 연결 없음 |
| **2D-4 — 또 다른 P3 승인** | 폐기형 staging 대상 한 번만, 사후 정리 | 단회 Permit 소비·수동 복구·원본 감사·삭제/잔존 판정 | 재시도 없음. 실행·철회·정리 판정 후에도 Product 출시/판매 별도 |

**선후관계:** 이번 문서 채택만으로 3-04-02(D)를 착수하거나 기존 완성된 Windows/local Docker acceptance를 반복하지 않는다. 비용과 추가 보안 계정/신원/기간을 Owner가 실제 P2로 승인할 때 외부 공급자 PoC를 시작한다. 단계마다 `snapshot_sha` 고정 후 drift 발생 시 재심사.

## 5. 구성·관리 책임의 구체적인 제안

- **환경 경계:** `environmentId=myeongha-staging-<id>` 하나에 Auth/Subject/Nonce/Admission/Saju ingress를 묶되, 보안 계정 Root custody는 별도 권한/감사/백업 범위로 둔다. Prod Supabase ref `cnsfpcdiyofqvhpcegfc`와 Refund ref `uhytfztmvgkdpimccyzh`는 denylist. 재사용 금지 범위에 Production Saju Cloud Run, Vercel env secrets, JWT·Bearer/HMAC/CA PEM·실회원 출생 데이터를 포함한다.
- **IaC 루트/State:** 승인된 보안 도메인별 별도 OpenTofu backend/최소 IAM. 암호화한 plan/state만 저장하고 비용·TTL·태그·자원 수·가용 기간을 승인 manifest와 대조. backend 자격증명/secret을 GitHub 소스·plan·PR artifact·이슈에 넣지 않는다. `tofu apply/destroy`는 P2 별도 Owner 확인과 보존·복구 계획 없이는 금지. `destroy`가 외부 감사/백업/청구까지 삭제했다는 주장 금지.
- **키/정책:** Root/Operator/Attestor 각각 key purpose와 별도 principal, 출처 인증과 독립 감사. OpenBao 자체 seal/unseal 및 복구용 Root 계정이 동일 워크로드에 있으면 SO-3 R01 FAIL. OPA는 계획/정책 lint만, **실제 권한 판정은 기존 도메인 검증 + 추후 승인된 Target Authority V2**에서 재평가.
- **DB:** Subject/Nonce/Admission은 서로 다른 서비스 인스턴스/클러스터·전용 최소 권한 로그인·TLS hostname/CA를 실제 세션/관리 API에서 독립 확인. Postgres 포트를 인터넷 전역에 개방하지 않는다. 별개 schema, 이름만 다른 프로젝트, 다른 connection string만으로 격리 주장 금지.
- **오류·재시도:** COMMIT 미확인, 키 서명 실패, 증빙 소실, 서비스 장애, 버전 drift → STOP/HOLD; 자동 재호출/Permit 재생/백필 금지. Root/floor/revocation/Challenge/Admission DB 분산 트랜잭션을 정확히 한 번 성공한 것처럼 보정하지 않는다.
- **증거 원본:** Owner 본인과 다른 서비스 신원으로 수집, tamper-evident retention, 보존 기간(기존 provider readiness proposal은 30~3650일 범위), 접근 감사. 읽기 전용 Attestor에 sign/Root 교체/IAM 변경 권한 부여 금지.
- **폐기:** 사전 TTL + 파기 체크리스트. staging Guest/Member/Birth와 서비스 키/DB/서버/임시 State, 백업과 보존 원장을 **서로 구분**해 종료. `kubectl delete` / `tofu destroy` 성공만으로 데이터·백업 완전 삭제 주장 금지.
- **GitHub Integration:** 기존 `Watchtower-Track: saju-bridge`, scope CI 및 exact-head Integration 경로만 사용. 별도 상시 자동배포·유료 리소스 apply 워크플로/승인 자동화 신설 금지.

## 6. Owner 결정 반영 — 추가 비용 0원만 허용 (유료 토폴로지 장기 중단)

### 집행 불가 / 예산 불변식

```text
MAX_INCREMENTAL_SPEND_KRW=0
MAX_INCREMENTAL_SPEND_USD_CENTS=0
PAID_STAGING_PROVISIONING=PROHIBITED
SUPABASE_NEW_PAID_PROJECT=PROHIBITED
PAID_KMS_OPENBAO_HOSTING=PROHIBITED
PAID_CLOUD_RUN_OR_AUDIT_STORAGE=PROHIBITED
BILLABLE_CI_OVERAGE=PROHIBITED
AUTO_UPGRADE_OR_PAYMENT_METHOD_CHANGE=PROHIBITED
```

- 이전 단순 견적/월 요금 예시는 **실행 대안에서 철회**한다. 가격이 싸거나 시간당 과금이 작다는 이유로 신규 유료 환경을 생성하지 않는다.
- **현재 무료/보유 자원만 사용:** 이미 인수된 Docker Compose, GoTrue/PostgreSQL(폐기형), TypeScript Trust/Evidence 계약, 기존 CI 설정과 유료 초과 없는 무료 실행분. 동일 Docker Phase 5를 증거 재수집 목적으로 반복하지 않는다.
- OpenTofu/OPA/OpenBao/InSpec를 소프트웨어로 무료 설치할 수 있더라도 **기존 장비 내 도구 사용은 독립된 Root custody/클라우드 3DB/외부 Attestor의 운영 입증이 아니다.** 기존 코드가 동일 검사를 한다면 도입하지 않는다.
- 새 서비스의 *무료 티어*도 무조건 무료라고 가정하지 않는다. 카드 등록·자동 과금·사용량 초과·free 한도/종료 정책을 사전 증명하지 못하면 **신규 리소스 0개**. 신뢰된 별도 관리 도메인/세 독립 Postgres 클러스터가 없다면 실제 SO-3 실행은 계속 HOLD.
- GitHub Actions도 플랜에 따른 과금 위험이 있으므로 별도 고비용 반복 실행/신규 백그라운드 워크플로를 만들지 않는다. 기존 필수 PR/Integration CI는 가용 무료 한도/과금 중지 보장이 확인되는 범위에서만 사용한다.
- Product EXISTING_AUTHORITIES_V2의 일반 Member Calculation/Preview는 이 고격리 인프라와 **별개**이므로 기존 운영 경로를 비용 없이 유지한다. Guest E2E는 #2266의 영속 데이터/승인 기준을 따른다.

### 0원으로 가능한 결과와 불가능한 결과

| 구분 | 제로 비용 실행/평가 | 판정 가능 범위 |
|---|---|---|
| 기존 로컬 Compose/GoTrue/3PG/TLS/Nonce·Admission | 검증 완료 근거와 회귀 테스트 인수, 추가 비용 없는 수정에 한정 | `LOCAL_TESTED` 또는 `SYNTHETIC_ONLY`; 실환경 독립성 없음 |
| SO-3 Target Evidence/Registry/Challenge/Owner Intent | 기존 정적 계약/부정 케이스 강화, redacted sourceKind 인덱스 재사용 | `INDEXED_UNVERIFIED` 또는 `SIGNED_ASSERTIONS_UNANCHORED` 이상으로 운영 승격 금지 |
| OPA/Conftest/OpenTofu 등 | 무료 실행 가능한 정적 규칙/plan lint가 **실제 중복 제거**에 유익할 때만 선택 | 정책/구성상 오류 검출; IAM/프로젝트/키 실증 아님 |
| 신규 독립 Staging Auth/Subject/Nonce/Admission + 외부 Root/Attestor | 추가 비용 발생 또는 무과금·독립성 미증명 시 구축하지 않음 | R01–R14 `NOT_VERIFIED`; 2D-4 `HOLD` |
| 일반 Product V2 현재 운영 | 기존 Prod 인프라·계약 및 이미 수행한 Member E2E 근거만 사용 | Member 운영 경로의 당시 검증 유지; 고격리 Staging/출시·결제 승인 아님 |

**종료 선택:** 비과금 환경으로 세 클러스터 및 외부 Root/Attestor 요건을 충족하는 독립 공급자가 실제 존재함이 입증되지 않는 한, SO-3을 억지로 PASS시키거나 Production/Refund 프로젝트를 우회 재사용하지 않는다. "현재 비용 0원으로는 운영 독립 증빙 일부를 얻을 수 없다"는 결론을 정식 HOLD로 기록한다.

## 7. 다음 실행 가능한 행동 / 완료 기준

**P0에서 지금 완료할 수 있는 일:** 기존 R01–R14 증빙 공백 분류·코드/런북/무료 도구의 중복 제거 및 무과금 검증 → docs-only PR 검증·병합. 유료 견적/신규 리소스 구매 제안·기존 Docker Phase 5 재실행·신규 Phase 신설 없음. 기존 PR/Integration CI 또한 무료 실행 한도 및 과금 차단 범위 내에서만 수행.

**장기 보류된 실환경 운영 진입 조건(S01–S06) — 현재 0원 정책으로 신규 유료 구축 불가:**
- S01: 별도 보안·Staging 소유 조직/계정, 신규 Supabase 3프로젝트 실제 계획, 격리 수준, 지역.
- S02: Owner 행위별 강인증(P2/P3/P4), 복구 인증기, kill switch.
- S03: Ed25519 Root pin/Registry floor/revocation의 실제 custody 공급자와 관리자 분리.
- S04: Operator sign/Attestor read-only+sign/Challenge ledger의 신원·키·권한 분리.
- S05: 총 금액/최대 시간/종료·폐기·백업 보존, 감사 저장소 및 요금 경보.
- S06: R05–R14 실제 probe의 허용 대상 및 네트워크/secret 범위, 두 repo 배포 SHA/digest 동결.

**P0 EXIT:** 기존 authority/sourceKind/Role 계약과 충돌 없음, R01–R14 원본 정의 정확히 대응, 무엇이 LOCAL_TESTED/PLAN_ONLY/REAL_STAGING_NOT_VERIFIED인지 구분, 공급자 비용·독립성·키 호환성 검증 과제가 명시되어 있음, CI+SHA 병합 증빙.

```text
BRIDGE_PRODUCT_INTEGRATION_PROFILE=EXISTING_AUTHORITIES_V2
SO3_INCREMENTAL_COST_CAP_KRW=0
SO3_PAID_STAGING=PROHIBITED
SO3_FREE_EXISTING_RESOURCES_ONLY=true
SO3_FRAMEWORK_ADOPTION=DESIGN_ONLY
SO3_NEW_CLOUD_RESOURCES=0
SO3_NEW_PRODUCTION_DB_ROLES=0
SO3_EXTERNAL_PROVIDER_SIGNING=NOT_VERIFIED
SO3_R01_R14=NOT_VERIFIED
stagingConnection=NOT_VERIFIED
stagingAdmission=HOLD
canRunOnce=false
canExecute=false
canPublish=false
canSell=false
```
