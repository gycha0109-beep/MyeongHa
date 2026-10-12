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

CI와의 관계: 기존 `saju-bridge-cross-repo-local-http.yml` 하나에 **Compose 기반 스모크 단계만 연결**한다. 전체 기능 테스트 및 GitHub one-command 기존 흐름은 유지하고 새로운 대형 CI 워크플로를 만들지 않는다.

강제종료/전원 꺼짐 등으로 finally가 실행되지 않은 경우 남을 수 있다. 로그에 출력된 고유 프로젝트 이름으로 소유 자원을 확인한 뒤 **그 프로젝트만** 정리한다. `docker system prune`, 다른 프로젝트 전체 제거 금지.

### Docker Desktop 엔진 연결 실패 대응 (Windows)

`docker compose version`과 `docker context inspect`는 Docker Engine이 꺼져 있어도 성공할 수 있다. 실행기는 Docker 자원을 만들기 전에 **실제 `docker info --format '{{.OSType}}'` 응답이 `linux`인지** 확인한다.

```powershell
docker context ls
docker info
docker compose version
```

- `open //./pipe/docker_engine: The system cannot find the file specified`는 Docker CLI에서 로컬 Windows named pipe의 Engine에 연결하지 못했다는 의미이다. Docker Desktop을 실행하고 Linux containers 모드로 전환한 뒤 `docker info`의 Server 항목을 확인한다.
- 이 **사전 연결 검사**에서 실패한 경우에는 생성 시도 자체를 시작하지 않았으므로 `CLEANUP BLOCKED`를 출력하지 않는다. 이전 실행기가 `docker compose config`에서 실패하면서 정리 명령도 실패했다면, 로그만으로 컨테이너가 실제 남았다고 단정하지 않는다.
- 이전 실행의 특정 프로젝트 잔여 자원을 조사할 경우 다른 프로젝트를 건드리지 않고 정확한 라벨로만 확인한다. 예: `docker ps -a --filter "label=com.docker.compose.project=myeongha-saju-full-47f68ba34a0d"`; 같은 필터를 `docker volume ls` 및 `docker network ls`에도 적용한다.
- 이미지 다운로드나 컨테이너 생성 **이후** 엔진이 중단된다면 정리를 완수할 수 없을 수 있으므로 원래 프로젝트 ID에 한정해 사용자가 재확인해야 한다. Docker Engine 연결 오류를 검증 실패나 자원 정리 완료로 표시하지 않는다.
- Windows Docker Desktop 직접 실행의 확인 기록은 사용자의 실제 기기 출력으로만 인정하며 GitHub Ubuntu CI로 대신하지 않는다.

## 4. 단계별 로드맵 · 종료 게이트

| 단계 | 구현 | 게이트 | 범위 상태 |
|---|---|---|---|
| 0 | 기존 GitHub 2J + 독립 TLS/두 DB 중단 처리 재사용, #1986 | exact-head 범위/최종 CI 성공·병합 | 완료: **합성 CI만** |
| 1 | Windows Docker 기초 4DB + GoTrue + 폐기 실행기 | 단일 명령, 실 GoTrue JWT 검증, DB 네 곳 실 SQL, 자원 잔존 0, 기존 CI 최소 스모크 통과 | 이번 구현 |
| 2 | 고정 Saju SHA의 실 HTTP/HMAC, Subject schema/fixture 및 기존 테스트 재사용 | 실제 Saju HTTP 200 proof, Auth JWT→Subject Current Birth→Nonce 원자 claim, 병렬 중복 차단 | 미구현 |
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
