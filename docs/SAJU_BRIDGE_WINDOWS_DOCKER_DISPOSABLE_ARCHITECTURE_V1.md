# 사주 브릿지 — Windows Docker Desktop 폐기형 로컬 검증 설계·로드맵 v1 (2026-10-12)

Watchtower-Track: saju-bridge

상위 기준: [사주 브릿지 완료 로드맵](./SAJU_HELD_STAGING_COMPLETION_ROADMAP_8C2B2D.md) · [로컬 우선 검증](./SAJU_HELD_LOCAL_FIRST_VERIFICATION_8C2B2D.md) · [실환경 증빙 R01–R14](./SAJU_HELD_STAGING_OPERATIONAL_EVIDENCE_RUNBOOK_8C2B2D30401.md).

> **합성·폐기형 시험의 권한 경계:** 본 Docker 작업은 운영 스테이징 3-04-03B/3-04-04 및 2D-4가 아니다. 운영 Root/Attestor/Runner/Supabase/DB/KMS/결제/공개 환경에는 접근하지 않는다. stagingAdmission=HOLD, stagingConnection=NOT_VERIFIED, sourceAuthority=NOT_EVALUATED, releaseAuthorization=NOT_EVALUATED, canRunOnce/canExecute/canPublish/canSell=false 유지.

## 1. 범위와 현재 구현 상태

- 선행 #1986: 기존 GitHub-hosted 일회용 GoTrue→Subject/Birth→Saju HTTP/HMAC→Nonce TLS→Admission TLS 경로, 2개 DB 부분 커밋 차단·잔존 자원 검사. 최종 통합 CI 성공 후 squash `4c48211a9608dc637d394378df6d6aeb13dde3d5` 병합. `node scripts/local/verify-saju-bridge-full.mjs`는 **GitHub CLI로 기존 Actions 실행을 호출하는 명령**이지 로컬 Docker 실행이 아니다.
- 이번 구현 1차 범위: 별도 `scripts/local/saju-bridge-full.compose.yml`에 실 GoTrue와 Auth/Subject/Nonce/Admission 4개 PostgreSQL 15 컨테이너를 구성하고 Windows/리눅스 공통 `node scripts/local/verify-saju-bridge-docker-local.mjs`로 구동·인증/DB 기초 점검·완전 폐기까지 확인한다.
- **1차 성공이라고 주장하지 않을 범위:** Subject 마이그레이션 및 RLS, Saju 프로세스 HTTP/HMAC, CA 검증 TLS·각 DB 최소 권한 로그인, 유효한 Permit V2 처리, 분산 실패 복구. 별도 2~4차로 실행 코드를 연결하고 기존 Vitest 검사를 재사용한다. 현재 CI-only TLS 스크립트는 로컬용인 것처럼 CI 가드를 제거하지 않는다.

## 2. 아키텍처 및 격리 정책

```text
Windows PowerShell / Node 24 launcher
  ├─ docker compose --project-name myeongha-saju-full-<random>
  │    ├─ auth-db       PostgreSQL 15 / auth init / project-scoped volume
  │    ├─ gotrue        supabase/gotrue:v2.196.0 / synthetic email signup
  │    ├─ subject-db    PostgreSQL 15 / dedicated project-scoped volume
  │    ├─ nonce-db      PostgreSQL 15 / dedicated project-scoped volume
  │    ├─ admission-db  PostgreSQL 15 / dedicated project-scoped volume
  │    └─ auth-verifier Node 24 / internal-only GoTrue signup + /user probe
  ├─ SQL probe in each PostgreSQL container
  └─ docker compose down --volumes --remove-orphans + owned-resource absence check
```

- 모든 서비스는 Compose 소유의 `internal: true` 네트워크, 호스트 포트 노출 0개. `GOTRUE_API_HOST=0.0.0.0`은 컨테이너 네트워크 내부 리스닝만 의미한다.
- 각 DB는 물리적으로 분리된 컨테이너/볼륨과 실행마다 난수 암호를 사용한다. 초기 점검은 PostgreSQL 관리 계정으로 수행하므로 독립 최소권한/SSL 증빙으로 승격 금지.
- Compose가 사용할 값만 allowlist 환경으로 전달. 외부 `DOCKER_HOST`/원격 Docker context, 운영 URL, 운영 DB/Secret, 사용자 데이터, 임의 외부 실행 대상, 포트 포워딩을 허용하지 않는다. 로컬 Docker Desktop Linux 엔진만 대상.
- 인증 DB의 `auth` 스키마와 `search_path`는 해당 일회용 DB의 init SQL에서만 설정한다.
- SQL은 특정 데이터베이스 이름을 점검하고 `SELECT current_database()`만 수행한다. 운영 migration이나 GRANT를 이번 초기 스모크에 포함하지 않는다.
- DB 데이터는 재시작 후 보존 검증을 위해 `tmpfs` 대신 **실행별 임시 named volume**을 사용하며, 마지막에 볼륨을 삭제한다.
- 이미지 최초 pull 시 네트워크를 사용할 수 있다. 별도 유료 클라우드 자원/계정 생성은 하지 않는다. Docker Desktop 라이선스와 GitHub Actions 사용량은 사용자의 플랜에 따라 별도 확인.
- `docker.sock`을 앱/검증 컨테이너에 마운트하지 않는다. Docker CLI의 중단·장애 주입은 호스트 launcher가 프로젝트 이름/리소스 소유를 검증하고 수행한다.

## 3. 실행 계약

준비: Windows Docker Desktop에서 Linux containers 활성화, Docker Compose v2, Node.js 24. 명하 루트에서:

```powershell
node scripts/local/verify-saju-bridge-docker-local.mjs
```

검증 순서: Docker context 로컬 확인 → 실행 ID·4종 암호·JWT secret 생성 → Compose 구성 검증 → DB 4종 기동·health → GoTrue 기동 → DB별 이름/SELECT 1 확인 → 합성 가입과 인증된 GET /user 확인 → 실패/성공 관계없이 정리 → Docker의 프로젝트 라벨로 컨테이너·볼륨·네트워크 잔여 0개 확인. 스모크 응답에 비밀키나 사용자 토큰을 출력하지 않는다.

CI와의 관계: 기존 `saju-bridge-cross-repo-local-http.yml` 하나에 **Compose 기반 스모크 및 2단계 HTTP/HMAC 검증**을 연결한다. 전체 기능 테스트 및 GitHub one-command 기존 흐름은 유지하고 새로운 대형 CI 워크플로를 만들지 않는다.

강제종료/전원 꺼짐 등으로 finally가 실행되지 않은 경우 남을 수 있다. 로그에 출력된 고유 프로젝트 이름으로 소유 자원을 확인한 뒤 **그 프로젝트만** 정리한다. `docker system prune`, 다른 프로젝트 전체 제거 금지.

### 3A. 2단계 중간 구현 — 실제 Saju HTTP/HMAC 루프백 (2026-10-13)

**Phase 1 명령은 그대로 유지**한다. 별도의 고정 Saju 소스 체크아웃을 보유한 경우에만 명시적으로 2단계 HTTP 검증을 실행한다.

```powershell
# Saju 저장소를 MyeongHa 옆에 체크아웃하고 아래 SHA로 고정
git -C ..\Saju checkout cd0acf9abd447826ccaefba56112d046e560ee04

# MyeongHa 저장소 루트에서 실행
node scripts/local/verify-saju-bridge-docker-local.mjs --http ../Saju
```

- `--http` 모드는 Saju의 **정확한 고정 커밋**과 clean worktree를 요구하며, 임의 URL/원격 Saju 서버를 받지 않는다. Saju가 없거나 다른 SHA이면 성공 처리하지 않는다.
- [2단계 Compose 오버레이](../scripts/local/saju-bridge-http.compose.yml)를 추가한다. `node:24-bookworm-slim`의 의존성 준비 컨테이너가 저장소를 **읽기 전용**으로 마운트하고, `.git`/`node_modules`/`.env*` 등을 제외한 소스 스냅샷을 **실행별 writable named volume**에 복사한다. 이 스냅샷 안에서 `npm ci --ignore-scripts`와 Saju `npm run build`를 실행하므로 Windows 호스트의 `node_modules`를 수정하거나 Linux 의존성으로 오염시키지 않는다. 실제 HTTP/HMAC 검증기는 Saju 스냅샷은 읽기 전용으로, 명하 스냅샷은 Vitest의 임시 `.vite-temp` 캐시 생성 때문에 쓰기 가능으로 마운트한다. **두 스냅샷 모두 일회용 볼륨이며 호스트 체크아웃은 끝까지 읽기 전용**이다.
- 의존성 설치 단계만 일반 `npm-egress` 네트워크를 사용하여 npm 패키지를 내려받는다. 이 단계에 Auth/DB/HMAC 비밀값을 전달하지 않는다. 실제 HTTP/HMAC 검증기는 **Compose `internal: true` 네트워크**에서만 실행하며 호스트 포트를 열지 않는다. npm registry 다운로드에는 네트워크 연결이 필요할 수 있다.
- 검증기는 기존 `verify-saju-bridge-http.mjs`와 `test/saju-held-cross-repo-local-http.test.ts`를 변경 없이 재사용한다. 동일 컨테이너 내에서 실제 Saju Node HTTP listener를 루프백에 띄우고, MyeongHa의 Bearer/HMAC·발급 Proof/위변조·경로 차단 검사를 실행한다. Saju HTTP 응답이 200 Proof가 아니면 테스트 실패이다.
- 기존 1단계의 GoTrue·4개 DB SQL 스모크를 먼저 실행하며, HTTP 검증과 DB 바인딩은 **아직 서로 연결되지 않는다**. 이 단계에서 인증된 회원의 Current Birth 조회, PostgreSQL Nonce 원자 소비, Admission Permit을 통과했다고 주장하지 않는다.
- 기존 단일 GitHub CI의 Compose 검증 단계에 `--http ../saju`를 연결한다. 다른 대형 CI 워크플로를 추가하지 않는다.
- `--http` 모드는 저장소 루트의 실제 `.env`, `.env.local`, `.env.production`, `.env.development` 존재 시 소스 마운트를 거부한다. 루트 이외의 모든 사용자 파일을 자동으로 검사하는 것은 아니므로 **비밀 파일이 포함된 체크아웃을 제공하지 않는다.** 테스트용 키만 실행 시 생성하고, 종료 시 컨테이너·네트워크·의존성 볼륨·빌드 볼륨을 모두 제거한다.
- Windows 실기기에서 2단계 `--http` 실행 증빙은 별도로 기록한다. GitHub Ubuntu CI 성공만으로 Windows 통과로 표기하지 않는다.

**2단계 남은 작업:** GoTrue 발급 회원 UUID→Subject/Birth fixture→실제 Saju HTTP/HMAC→Nonce PostgreSQL 원자 claim까지 동일 Docker 실행에서 연결한다. 기존 테스트가 `127.0.0.1`과 별도 CI TLS hostname을 가정하므로, 운영 정책을 완화하지 않고 테스트 전용 DNS/네트워크 어댑터를 추가해야 한다.

### 3B. Phase 2B — GoTrue JWT → Subject/Birth → Saju HMAC → 독립 Nonce PG (2026-10-13)

1단계 `(인수 없음)`과 HTTP 단독 `--http`의 성공 계약은 그대로 유지한다. 다음 명령은 **추가** DB 바인딩 검증을 선택한다.

```powershell
# 명하 루트에서, 깨끗한 지정 Saju 커밋만 사용
node scripts/local/verify-saju-bridge-docker-local.mjs --binding ../Saju-bridge-verify
```

- `--binding`은 Phase 1/2 GoTrue·DB/실제 HTTP/HMAC 검증을 선행한 뒤에만 진행한다. Subject DB에는 운영과 분리된 테스트용 `auth.users` 스텁 및 전체 기존 마이그레이션을 적용하고, 허용된 DB 이름만 사용하는 **합성 Subject/Birth fixture**를 적재한다. Nonce DB에는 기존 `1540_saju_source_proof_nonce_claim_authority_v1.sql`만 적용한다.
- 각각의 물리 DB에 제한 로그인 `myeongha_runtime` / `myeongha_docker_nonce_login`을 발급하고, 서로의 역할·테이블에 접근할 수 없는 것을 검사한다. 생성·입력된 DB 비밀번호는 실행별 난수이다.
- 기존 Production 바인딩 함수 `bindAuthenticatedMemberSajuHeldProofV1`를 실제 GoTrue `/user`와 Saju 발급 서비스에 연결한다. 테스트 전용 Auth `/auth/v1/user` 경로 매핑과 합성 `auth.users` 행을 사용하되 JWT·Subject ID는 클라이언트 메타데이터를 신뢰하지 않고 실제 소유 관계로 검증한다.
- 검증 항목: 소유자의 JWT/Current Birth/원자 Nonce 소비 HELD(배포 가능 상태가 아님), 다른 회원의 위조 메타데이터 거부, 변조·누락 JWT 거부, 두 세션의 동일 Saju HMAC proof 동시 재사용 중 정확히 한 건만 소비, DB 격리와 ACL 거부.
- 신규 테스트 `test/saju-held-docker-member-birth-nonce.test.ts` 및 전용 Saju loopback runner는 기존 기능 코드나 운영 API를 변경하지 않는다. `--binding`도 실행이 끝나면 동일한 Compose 소유 컨테이너/볼륨/네트워크 삭제를 확인한다.
- **제한:** Subject/Nonce의 Docker 테스트 연결은 이 단계에서 아직 *plaintext 내부 네트워크*이다. CA 검증 TLS 및 Admission/Permit V2, 장애 주입·복구, 운영 Root/Attestor/R01–R14/2D-4는 HOLD이다. CI가 Linux에서 PASS여도 Windows 실기기 `--binding`은 직접 실행하지 않으면 NOT_VERIFIED로 남는다.

### 3C. Phase 3A — 세 개의 독립 Docker PostgreSQL TLS (2026-10-13)

이전 `--http`와 `--binding` 호출은 변경 없이 유지한다. Windows Docker Desktop/Linux에서 **실제 전송계층 강제**를 검사하려면 명시적으로 `--tls`를 선택한다.

```powershell
node scripts/local/verify-saju-bridge-docker-local.mjs --tls ../Saju-bridge-verify
```

- Docker 프로젝트 내부에서만 접근할 수 있는 세 가지 **서로 다른 일회용 CA**(Subject, Nonce, Admission)를 만든다. 서버 인증서는 각 `subject-db`, `nonce-db`, `admission-db` DNS SAN에 귀속되며, TLS 1.2+를 요구한다. CA 키·인증서·DB 데이터는 실행별 프로젝트 볼륨에만 존재하고 종료 후 모두 제거한다.
- `pg_hba.conf`에서 호스트 비TLS 접속을 명시적으로 거부하고 호스트 TLS 접속에는 SCRAM-SHA-256을 적용한다. 구성 후 fixture/bootstrap용 `psql`도 `PGSSLMODE=verify-full`과 해당 독립 CA 인증서를 사용한다.
- 기존 GoTrue JWT→Subject/Birth→Saju HMAC→Nonce 원자 소비 테스트는 **Subject/Nonce의 TLS 검증 로그인**을 통해 실행한다. 추가로 Admission은 별도 `myeongha_docker_admission_tls_probe` 제한 LOGIN을 마련하지만 **Permit 테이블/Runner/서명 승인 절차는 생성하거나 실행하지 않는다**.
- 세 DB 각각에서 `pg_stat_ssl`의 암호화 연결, 독립 CA 식별, **다른 DB의 CA를 이용한 접속 실패**, **일반 텍스트 접속 실패**, 다른 DB의 테이블 및 역할 부재를 검사한다.
- GoTrue의 내부 Auth DB 연결은 Phase 1/2B의 별도 상태를 유지한다. Phase 3A 성공은 GoTrue 내부 DB 자체의 TLS 보증을 의미하지 않는다.
- Scope CI는 같은 GitHub Actions 흐름에서 `--tls` 모드를 실행한다. 별도 워크플로, 운영 URL, 퍼블릭 호스트 포트, 인증서 영속 저장, 새로운 유료 자원을 만들지 않는다.
- **Phase 3A는 Permit V2 소비 및 양 DB 커밋 분리/복구의 합격을 뜻하지 않는다.** 운영 Root/Attestor, R01–R14, 2D-4, 스테이징 입장·상품/판매 권한은 기존대로 HOLD다. Windows의 `--tls` Phase 3A 실측은 2026-10-13 사용자 제출 로그로 **PASS** 확인하였다.

### 3D. Phase 3B — 합성 서명 Permit V2의 독립 Admission TLS 원자 소비 (2026-10-13)

`--permit`은 Phase 1·2·2B·3A를 **전부 같은 일회용 Docker 프로젝트**에서 실행한 뒤, 분리된 Admission DB에서 추가 테스트를 수행한다.

```powershell
node scripts/local/verify-saju-bridge-docker-local.mjs --permit ../Saju-bridge-verify
```

- 기존 `test/db/fixtures/saju_staging_operator_admission_schema_8c2b2d302.sql`을 **이름이 고정된 폐기 Admission DB**에만 로드한다. 이것은 **운영 마이그레이션이 아니라 기존 CI용 합성 RLS/ACL fixture**다.
- 기존 Phase 3A TLS-only 제한 로그인에 `myeongha_saju_staging_admission_runtime` 멤버십만 별도로 부여한다. 합성 `issuer`/`revoker` 역할은 부여하지 않으며, Subject·Nonce의 실제 DB/롤과 격리한다. DB에는 서버가 생성한 새 Ed25519 테스트 키로 서명한 합성 Permit V2 레코드를 테스트 전용 관리자 연결로 삽입한다.
- 구현 재사용: `canonicalSajuHeldStagingPermitApprovalBytesV2`, `createSajuHeldStagingPostgresAdmissionPortV2`, 기존 Manifest/ConnectionPlan digest를 그대로 호출한다. 서로 다른 독립 PostgreSQL 세션이 같은 Permit을 동시에 소비할 때 **한 건만 성공**, 이후 재시도 불허, 서명·승인 키·계획·CA 지문 변조/취소/만료/연결 실패는 fail closed여야 한다.
- Subject/Nonce/Admission TLS CA 값은 실제 일회용 컨테이너의 CA 인증서에서 계산한다. 단, 서명된 Manifest/ConnectionPlan의 도메인 이름은 **CI 합성 메타데이터**이며 실제 운영 DNS나 인프라의 승인 근거가 아니다.
- `--permit`은 오직 `saju-bridge-permit.compose.yml`과 테스트 스크립트에서만 Admission Permit 테이블/권한을 추가한다. 평상시 `--tls` 및 `--binding`에는 전혀 새 Permits를 생성하지 않는다. 모든 테스트 종료 시 컨테이너·CA 볼륨·DB 볼륨을 삭제 확인한다.
- **중요:** 합성 키/서명 검증 + 원자 소비는 실제 운영자 승인이나 stagingAdmission 성공을 의미하지 않는다. Runner는 **절대 호출하지 않는다**. COMMIT 불확실성, 네트워크 분할, Subject와 Nonce의 서로 다른 결과·복구는 별도 Phase 4로 HOLD한다. `canExecute`, `canPublish`, `canSell`은 계속 false다. Linux CI 통과와 Windows 실기기 `--permit` 검증은 별개이다. **2026-10-13 사용자가 `Phase 3B PASS` Windows 로그를 제출하여 Windows Phase 3B PASS로 반영했다.**

### 3E. Phase 4A — 실제 DB 재시작·가용성 중단, 합성 COMMIT ACK 불확실성 (2026-10-13)

`--recovery`는 **기존 Phase 1/2/2B/3A/3B를 전부 통과한 같은 일회용 Docker 프로젝트에서만** 실행한다.

```powershell
node scripts/local/verify-saju-bridge-docker-local.mjs --recovery ../Saju-bridge-verify
```

검증 계약:

- 새 볼륨을 발급하지 않고 **Subject/Nonce/Admission의 기존 PG data 볼륨과 개별 CA**를 보존한 채 `docker compose restart`한다. 재시작 후 각 DB를 **하나씩 실제 정지**하고, 해당 제한 역할이 TLS 쿼리에 실패하는지 확인한 뒤 재기동한다.
- 처음에 동일 단일 컨테이너 세션의 실제 Nonce DB unique claim과 실제 Admission Permit V2 소비를 발생시킨다. COMMIT 자체는 **실제 PostgreSQL 서버에서 완료**하고, 테스트 전용 어댑터가 그 **응답만 고의로 유실 처리**해 결과를 false로 만든다. 다른 독립 세션에서 row가 durable하게 기록됐는지 확인한다. 이 fault seam은 *모의 ACK 유실*이지 커밋 도중의 실제 패킷 단절 검증이 아니다.
- 실제 PG 재시작과 순차 DB 중단을 거친 뒤, Nonce digest 1건, Permit `CONSUMED`, Subject fixture 불변을 검증한다. 같은 키·Permit의 재소비가 차단되는지 검사하고, 재시도 가능한 Nonce 만료 시각이 지나면 조용히 PASS하지 않고 테스트를 실패시킨다.
- 네트워크/Docker 소켓을 테스트 컨테이너에 넘기지 않는다. Docker stop/restart는 기존 host runner만 수행하고, 연결 자격 증명/키/합성 ID/CA는 project-scoped ephemeral volume/env만 사용한다. 모든 종료 후 기존 `down --volumes --remove-orphans` 및 프로젝트 자원 잔존 0 검사를 동일하게 수행한다.
- **남은 HOLD:** 커밋 진행 도중 *실제 네트워크 단절*, Subject와 Nonce에 각각 다른 commit 결과가 발생하는 분산 트랜잭션·보상·운영 복구, DB 영구 손상, 실제 Runner/Root/Attestor/stagingAdmission/서비스 승격. 이 실험이 성공해도 `canExecute`, `canPublish`, `canSell`은 false이고 운영 R01–R14/2D-4는 HOLD다.
- Linux scoped/full CI가 통과하더라도 **Windows `--recovery`는 2026-10-14 사용자 제출 로그로 **PASS** 확인. Phase 4B `--crash-commit` Windows 실기기 실행은 별도 NOT_VERIFIED**다. 앞선 Windows 3B PASS와 혼동하지 않는다.

### 3F. Phase 4B — 실제 PostgreSQL COMMIT 진입 중 DB SIGKILL (2026-10-14)

`--crash-commit`은 **Phase 1/2/2B/3A/3B/4A를 먼저 통과한 같은 일회용 Docker 프로젝트**에서 Nonce 전용 4B 테스트를 추가한다.

```powershell
node scripts/local/verify-saju-bridge-docker-local.mjs --crash-commit ../Saju-bridge-verify
```

- 실 PostgreSQL Nonce DB에서만 일회용 `DEFERRABLE INITIALLY DEFERRED` 트리거를 삽입한다. 해당 트리거는 **COMMIT 명령 처리 도중** `pg_sleep`로 제어 가능한 관측 지점을 만든다. 호스트 측 테스트 전용 컨트롤러가 `pg_stat_activity`의 `query=COMMIT` 및 `wait_event=PgSleep`를 **직접 확인한 후**, 그 프로젝트의 **Nonce DB 컨테이너 하나에만** `docker compose kill -s SIGKILL`을 호출한다.
- 실제 Nonce 소비는 기존 `createSajuSourceProofPostgresNonceClaimV1`을 그대로 사용하며 독립 TLS `verify-full` 연결이다. COMMIT 시점의 DB 소멸로 결과가 false여야 하며, 자동 재시도는 없다. 같은 데이터 볼륨으로 복구한 뒤 해당 합성 replay digest가 DB에 남지 않았는지 확인한다. 미관측/롤백 실패/서비스 복구 실패는 BLOCKED 처리한다.
- 독립 Admission Permit V2는 앞선 Phase 4A의 이미 소비된 `CONSUMED` 상태가 불변인지만 확인한다. **Admission DB 자체를 COMMIT 도중 죽이는 실험은 이 단계에 포함하지 않는다.**
- 이 방법은 **실제 COMMIT 처리 중 물리적 DB 프로세스 중단**을 검증하지만 **네트워크만 끊는 파티션**도 아니고, 임의 시점의 crash가 항상 롤백된다는 일반적인 보장도 아니다. 지연 트리거를 통해 의도적으로 COMMIT 완료 전 중단하는 *한 가지 결정적 시나리오*만 증명한다.
- 테스트 컨테이너에는 Docker 소켓/호스트 포트를 마운트하지 않고, 로컬에서 이미 허용한 Docker CLI만 해당 실행별 Compose 프로젝트에 사용한다. 성공·실패 후 트리거 삭제, 기존 `down --volumes --remove-orphans` 잔여 자원 0 확인이 선행돼야 PASS 가능하다.
- 운영 Root/Attestor/Runner/R01–R14/2D-4, 승인 가능한 Permit, 서비스/판매/출시 권한은 전부 HOLD. `canExecute`, `canPublish`, `canSell`은 false. **실제 네트워크 분할, Admission COMMIT 중단, 분산 DB 트랜잭션 보상·복구는 별도 다음 단계**이다.

### 3G. Phase 4C-1 — 실제 네트워크 단절 중 Nonce COMMIT (2026-10-14)

Phase 4A/4B의 의미를 확대하지 않는다. 네트워크 단절 실험은 물리적인 DB 종료와 별도이며, 아래 명령은 이전 4A·4B 검증 후 **동일 일회용 Docker 프로젝트**에서 4C-1을 실행한다.

```powershell
node scripts/local/verify-saju-bridge-docker-local.mjs --partition-commit ../Saju-bridge-verify
```

- 호스트 컨트롤러가 실제 Nonce PostgreSQL의 `pg_stat_activity`에서 지연 트리거 내부 `query=COMMIT / wait_event=PgSleep`를 관측한다. 이 때 **DB에는 손대지 않고** 실행별 이름 및 Docker Compose project/service label로 검증한 `saju-recovery-verifier` 컨테이너만 일회용 internal `disposable` 네트워크에서 실제 `docker network disconnect --force`한다.
- 단절 후 테스트 클라이언트의 Docker network endpoint가 제거됐는지 확인한다. 같은 Nonce PostgreSQL의 `pg_postmaster_start_time()`이 단절 전후 불변이어야 한다. Docker CLI는 호스트에만 있으며 테스트 컨테이너로 소켓을 넘기지 않는다.
- 기존 운영 Nonce claim adapter를 실제 TLS `verify-full` 연결에서 **단 한 번** 호출한다. 네트워크 단절 후 이 호출은 `false`여야 하며, 새 연결을 열어 자동 재시도해서는 안 된다. 실험 제어용 쿼리/통신 timeout은 성공 근거가 아니다. 단절·COMMIT 진입·서버 생존·클라이언트 실패를 각각 검증한다.
- 새 검증 컨테이너로 DB의 실제 replay digest 기록을 읽는다. 단절 상황에서 서버의 COMMIT 결과는 **0 또는 1**일 수 있으며, 결과를 미리 롤백이라고 가정하지 않는다. `1`이면 별도 명시적 중복 차단 probe가 `false`인지 확인하고, `0`이면 retry를 **실행하지 않는다**. 이미 Phase 4A에서 `CONSUMED`인 합성 Admission Permit은 불변이어야 한다.
- 네트워크 연결 복구는 원래 단절된 일회용 클라이언트의 자동 재실행이 아니라 새 검증 컨테이너의 정상 TLS 접속으로 증명한다. 컨트롤러는 오직 확인된 일회용 클라이언트만 제거하며, 부모의 `down --volumes --remove-orphans`가 프로젝트 컨테이너·네트워크·볼륨 0개를 최종 확인한다.
- 기존 `--crash-commit`의 Phase 4B 검증 및 출력은 변경하지 않는다. 기존 CI는 중복 인프라 실행 없이 `--partition-commit` 한 번으로 4B + 4C-1까지 검사한다. **Linux CI 통과는 Windows 실기기 증빙이 아니다.**
- **범위 제한:** 이것은 **클라이언트 컨테이너의 네트워크 분리**이지 서버-서버 분리나 임의 packet-loss simulation, Admission COMMIT 실패 또는 3DB 분산 복구가 아니다. `durable=0`인 결과에서 자동 보상/재수행을 허용한다는 뜻이 아니다. Production 운영 Root/Attestor/Runner, R01–R14, 2D-4, `canExecute`, `canPublish`, `canSell`은 모두 HOLD/false 그대로다.

### 3H. Phase 4C-2 — Admission Permit V2 실제 COMMIT 도중 DB SIGKILL (2026-10-14)

`--admission-crash`는 Phase 1/2/2B/3A/3B/4A/4B/4C-1을 같은 실행별 Docker 프로젝트에서 선행하고 **새 합성 Permit V2**에 대해 4C-2를 별도 검증한다.

```powershell
node scripts/local/verify-saju-bridge-docker-local.mjs --admission-crash ../Saju-bridge-verify
```

- 일회용 Admission DB만 대상으로 `DEFERRABLE INITIALLY DEFERRED` UPDATE constraint trigger에 `pg_sleep`을 설치한다. 실제 제한 로그인 + 독립 CA TLS `verify-full` 및 기존 `createSajuHeldStagingPostgresAdmissionPortV2`의 Ed25519 서명 검증 경로에서 합성 `ISSUED → CONSUMED`를 1회 시도한다.
- 호스트의 `pg_stat_activity`에서 **Admission PostgreSQL `COMMIT` / `PgSleep`**을 관측한 경우에만 이 프로젝트의 `admission-db`에 `docker compose kill -s SIGKILL`을 실행한다. Nonce/Subject/Auth 컨테이너는 강제 종료하지 않는다. 관측 실패면 테스트 실패이고 모의 ACK 유실로 성공 처리하지 않는다.
- 장애 시 소비 어댑터가 `false`를 반환하고 **동일 인스턴스의 재소비도 거부**해야 한다. DB 재시작 후 중단 대상은 `ISSUED, consumed_at_ms IS NULL`; 사전에 만든 `REVOKED`는 그대로 `REVOKED`; Phase 4A에서 정상 커밋한 다른 Permit은 `CONSUMED`를 유지해야 한다. Nonce 1건과 Subject fixture도 불변임을 별도로 읽는다.
- **중요한 안전 경계:** 이번 결과는 *실제 COMMIT 처리 중 물리적 프로세스 종료로 해당 트랜잭션이 롤백된 결정적 사례*다. 일반적인 COMMIT 장애가 언제나 롤백된다는 뜻이 아니다. 서버가 이미 커밋한 뒤 ACK만 유실되는 경우는 Phase 4A/4C-1에서 별도 취급한다. 실패 반환 뒤 **새 권한/새 세션으로 동일 Permit 자동 재시도·승인**은 검증하거나 허용하지 않는다. 원래 Permit이 ISSUED로 남아도 운영 승인으로 승격되지 않는다.
- 테스트 컨테이너는 Docker 소켓을 소유하지 않는다. 호스트에서 검사된 실행별 자원만 중단한다. `admission-db`를 복구하고 지연 트리거를 제거한 뒤 부모의 `down --volumes --remove-orphans`가 해당 실행의 컨테이너·네트워크·볼륨 잔존 0을 확인해야 PASS다.
- 기존 CI workflow의 한 Docker 실증 단계에서 `--admission-crash`를 사용한다. Linux PASS를 Windows 실기기 검증으로 바꾸지 않는다.
- **HOLD:** 실제 운영 Root/Attestor/Runner, R01–R14/2D-4 및 스테이징/상품/결제 권한 승인, Subject·Nonce·Admission 상이 결과에 대한 분산 복구·보상(4C-3)은 여전히 미검증. `canExecute=false`, `canPublish=false`, `canSell=false`.

### 3I. Phase 4C-3 — 독립 DB의 부분 성공 관측과 읽기 전용 HOLD (2026-10-14)

**검증 명령 (Windows Docker Desktop / Linux):**

```powershell
node scripts/local/verify-saju-bridge-docker-local.mjs --cross-db ../Saju-bridge-verify
```

- 각 호출은 일회용 프로젝트 `myeongha-saju-full-<12 hex>`만 사용하며 Phase 1→4A→4B→4C-1→4C-2를 먼저 거친다. `--admission-crash` 등 기존 옵션의 동작은 그대로 유지한다.
- 새 `test/saju-held-docker-cross-db-phase4c3.test.ts`에서 **서로 겹치지 않는 세 합성 Permit V2와 세 Replay key**를 생성한다. 기존 실제 Nonce PG claim adapter, 실제 Ed25519 서명 Permit V2 소비 adapter를 사용한다. 서로 다른 데이터베이스에 각각 *독립 커밋*을 남겨 다음 사례를 고정한다.
  1. **Nonce 단독 성공:** Nonce `CLAIMED`, Permit `ISSUED`.
  2. **Permit 단독 소비:** Nonce `ABSENT`, Permit `CONSUMED`.
  3. **Nonce + 철회 Permit:** Nonce `CLAIMED`, Permit `REVOKED`.
- Subject는 독립된 기존 일회용 fixture에 존재해야 한다. 각 DB 영속 볼륨을 유지한 상태로 **세 DB 실제 재시작** 후 각 상태를 별도 `BEGIN READ ONLY` 트랜잭션으로 관측·판별한다. DB 간 글로벌 원자적 스냅샷·2PC·Saga 합의는 **없으며 이 결과로 간주해서도 안 된다.** 서로 다른 커밋이 교차한 불일치 증거만 입증한다.
- 실제 `nonce-db`, `admission-db`, `subject-db`를 각각 물리적으로 `docker compose stop`하고 접근 불가를 테스트한다. 어느 한 DB든 읽지 못하면 *이미 확인한 과거 결과를 재사용하지 않고* `UNKNOWN_HOLD`가 반환돼야 한다. 각 DB를 다시 시작하고 최종 상태 불변을 재검증한다.
- 판별기 `scripts/local/saju-bridge-cross-db-observation-v1.mjs`는 **순수 읽기 전용 분류 함수**이고 애플리케이션 라우트·배포 DB 로그인·Runner·실제 Authorization에 연결되지 않는다. `NONCE_ONLY_HOLD`, `PERMIT_ONLY_HOLD`, `REVOKED_WITH_NONCE_HOLD` 및 양측이 모두 영속된 `BOTH_DURABLE_UNVERIFIED_HOLD`까지 모든 분류의 `decision=HOLD_MANUAL_REVIEW`, `automaticRetry=false`, `automaticCompensation=false`, `canExecute/canPublish/canSell=false`를 강제한다.
- 검증용 `postgres` 로그인은 **폐기 가능한 PG의 실측 전용**으로만 사용되며 운영/스테이징 관측 권한을 만들지 않는다. observer는 원본 키·비밀번호를 기록하지 않고, 실행별 컨테이너·네트워크·볼륨 전부 `down --volumes --remove-orphans` 후 잔존 0을 검사한다. Docker 소켓이 컨테이너에 없다.
- **범위 한정:** 이것은 분산 **자동 복구 구현이 아니다.** 실제 장애에서 커밋된 쌍이 동일 logical attempt에 속한다는 승인, 전역 시간/순서 보장, 보상·재시도 정책 및 cross-DB exactly-once 처리는 증명하지 않는다. 소스 근거가 없는 운영 복구는 금지한다. Phase 4C-3는 READ-ONLY 진단/격리 관측의 PASS만 의미한다.
- **미검증/HOLD:** Windows 실기기 4C-3 로그, Root/Attestor/Runner, R01–R14, 2D-4, 스테이징 운영 승인과 실제 분산 보상 절차, `canExecute/canPublish/canSell` 모두 HOLD/false. **Linux GitHub CI PASS는 Windows Acceptance의 대체가 아니다.**

## 4. 단계별 로드맵 · 종료 게이트

| 단계 | 구현 | 게이트 | 범위 상태 |
|---|---|---|---|
| 0 | 기존 GitHub 2J + 독립 TLS/두 DB 중단 처리 재사용, #1986 | exact-head 범위/최종 CI 성공·병합 | 완료: **합성 CI만** |
| 1 | Windows Docker 기초 4DB + GoTrue + 폐기 실행기 | 단일 명령, 실 GoTrue JWT 검증, DB 네 곳 실 SQL, 자원 잔존 0, 기존 CI 최소 스모크 통과 | 이번 구현 |
| 2 | 고정 Saju SHA의 실 HTTP/HMAC, Subject schema/fixture 및 기존 테스트 재사용 | 실제 Saju HTTP 200 proof, Auth JWT→Subject Current Birth→Nonce 원자 claim, 병렬 중복 차단 | **Phase 2B 구현:** CI·Windows 실행 증빙 별도 |
| 3 | 별도 Subject/Nonce/Admission TLS, 서로 다른 CA·SAN·제한 로그인, Permit V2 | TLS verify-full/틀린 CA/비TLS 차단, 한 번만 Permit 소비, RLS·ACL 거부 | **Phase 3A 구현:** TLS까지; Permit V2와 Windows --tls 실측 별도 |
| 4 | 실제 네트워크 중단·커밋 후 연결 단절·DB 재시작·볼륨 보존·복구 | 중복 허용 0, 불확실한 커밋 자동 재시도 0, 잘못된 승격 0, 재시작 후 사용 상태 유지 | **4A 합성 ACK 유실 + 실제 stop/restart 구현**, 물리 mid-COMMIT 단절/분산 복구는 HOLD |
| 5 | Windows Docker Desktop 실제 기기 및 Linux CI 공통 재현성 | 동일 테스트 매트릭스·정리·SHA/버전 기록, scoped + final CI PASS, 병합/issue 업데이트 | 미구현 |

**Phase 1 완료 조건과 Phase 5 완료 조건을 혼동하지 않는다.** GitHub Ubuntu 성공만으로 Windows 호스트 실측 완료라고 쓰지 않는다. Windows 실제 장치에서 실행한 증빙이 없으면 Windows는 NOT_VERIFIED.

## 5. 기술 위험 및 검증 범위

1. 기존 `verify-saju-bridge-http.mjs`와 일부 Vitest는 호스트 루프백 `127.0.0.1`, 포트 5432/9999/5443~5445, `/etc/hosts` 및 `GITHUB_ACTIONS=true`를 전제한다. Compose 서비스 DNS로 직접 변경하면 안전한 local-only guard와 기존 TLS hostname 테스트가 깨질 수 있다. **프로덕션 어댑터를 완화하지 말고**, 테스트 전용 runner 측 hostname/인증서/환경 주입 어댑터를 2~3단계에서 설계한다.
2. GoTrue 자동 마이그레이션은 `auth` 스키마와 `search_path`에 의존한다. GoTrue 실제 가입·JWT 검증을 통과해야 성공이다. HTTP 헬스 200만으로 성공 처리 금지.
3. 볼륨이 남아 있다면 성공 메시지를 출력하지 않는다. 재기동 복구 검사는 삭제 시나리오와 별도 수행한다.
4. 테스트 자체 CA·GoTrue JWT·서명키·사용자/출생정보는 전부 폐기형이고, 외부 운영 증빙 R01–R14·독립 Root custody를 대체하지 않는다.
5. 유효한 Saju 인증/Permit 결속 및 최종 Runner 승인, 상품/결제/출시는 별도 소유 트랙이다.

## 6. 검증·변경 기록 원칙

- 단계별 purpose/변경 경로/CI run/Windows 재현 결과/잔여 risk 기록.
- 기존 test·workflow 재사용, 새로운 Production migration/API endpoint/상품·결제 코드는 수정하지 않음.
- 선행 범위 CI → exact-head 최종 통합 CI → squash → main 포함 확인. 오류 시 신규 대형 CI 반복 대신 실패 단계의 근거부터 확인.
- 대상 이슈: [#1871](https://github.com/gycha0109-beep/MyeongHa/issues/1871). 별도 인프라 승인·실환경 3-04-03B/04/2D-4는 이슈의 HOLD 해제를 의미하지 않음.
