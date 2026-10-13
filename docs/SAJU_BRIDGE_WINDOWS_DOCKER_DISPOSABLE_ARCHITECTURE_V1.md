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

## 4. 단계별 로드맵 · 종료 게이트

| 단계 | 구현 | 게이트 | 범위 상태 |
|---|---|---|---|
| 0 | 기존 GitHub 2J + 독립 TLS/두 DB 중단 처리 재사용, #1986 | exact-head 범위/최종 CI 성공·병합 | 완료: **합성 CI만** |
| 1 | Windows Docker 기초 4DB + GoTrue + 폐기 실행기 | 단일 명령, 실 GoTrue JWT 검증, DB 네 곳 실 SQL, 자원 잔존 0, 기존 CI 최소 스모크 통과 | 이번 구현 |
| 2 | 고정 Saju SHA의 실 HTTP/HMAC, Subject schema/fixture 및 기존 테스트 재사용 | 실제 Saju HTTP 200 proof, Auth JWT→Subject Current Birth→Nonce 원자 claim, 병렬 중복 차단 | **Phase 2B 구현:** CI·Windows 실행 증빙 별도 |
| 3 | 별도 Subject/Nonce/Admission TLS, 서로 다른 CA·SAN·제한 로그인, Permit V2 | TLS verify-full/틀린 CA/비TLS 차단, 한 번만 Permit 소비, RLS·ACL 거부 | 미구현 |
| 4 | 실제 네트워크 중단·커밋 후 연결 단절·DB 재시작·볼륨 보존·복구 | 중복 허용 0, 불확실한 커밋 자동 재시도 0, 잘못된 승격 0, 재시작 후 사용 상태 유지 | 미구현 |
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
