# 명하 세연 — 무료 API 호출·서버 추가 없이 로컬 Docker 검증 (2026-10-19)

Watchtower-Track: security

## 목적

실제 AI 모델 호출, 운영 Supabase 연결, Vercel 라우팅 변경 또는 외부 서버를 **일절 하지 않고**, 이미 구현된 Node 24 HTTPS TLS 1.3 / 서버 인증 / 전용 DB 역할 / 비용 Governor / 보안 HTTP 응답 경계를 테스트합니다. 합성 응답·가짜 인증·가짜 DB만 사용하는 Node 컨테이너와 **별도의 일회용 실제 PostgreSQL 17 DB** 검사를 차례로 실행합니다.

**별도 상시 서버 구축은 로컬 검증의 필수 조건이 아닙니다.** 프로덕션에서도 별도 서버를 최종 요구할지 현재 확정되지 않았습니다. Vercel Fetch 기반 경로의 실제 송신·동의철회 ACK 보안 증명을 충족하는 동등한 구현이 가능하다면 기존 인프라 재사용을 평가할 수 있습니다. 현시점에서는 그 증거가 없으므로 Vercel 공개 세연 Route는 503으로 유지합니다. Docker 성공 = 운영 채팅 복구/G0~G6 승인 아님.

## 실행 (Windows PowerShell / Docker Desktop)

저장소 루트에서 현재 main을 동기화한 다음 실행합니다.

```powershell
git switch main
git pull origin main
node scripts/local/run-seyeon-zero-cost-docker.mjs --disposable-only
```

필요: Docker Desktop Linux containers 및 Docker CLI, 로컬 Node.js (런처는 Node 22+ 문법, 저장소 전체 개발은 Node 24), Git, Docker 초기 이미지 및 공개 npm 의존성 다운로드를 위한 인터넷. **실제 시험 컨테이너에는 네트워크가 없습니다.** 결제 카드, OpenAI API 키, Vercel 토큰, 운영 DB 주소·비밀번호, Supabase 서비스 키는 입력하지 마세요. Docker 자체의 라이선스·PC·인터넷 비용은 별개입니다.

## 실행 내용

1. Docker가 **로컬 Unix socket/Windows named pipe**에만 연결되어 있는지 검사합니다. 원격 SSH/TCP Docker 컨텍스트 또는 지정된 외부 Buildx Builder는 거부합니다.
2. `node:24-bookworm-slim` 및 저장소에 잠긴 공개 npm 패키지로 테스트 이미지를 만듭니다. Dockerfile 전용 allowlist는 `.env`, 인증서·개인키, `node_modules`, `.git`, `dist`, 임의 사용자 파일의 복사를 차단합니다. **이미지 생성 단계에서만** 공개 의존성 다운로드를 수행할 수 있습니다.
3. `--rm --network none --cap-drop ALL --security-opt no-new-privileges` 옵션으로 실제 TLS 1.3 / Member 인증·거부 / DB 원본 송출 / AI 비용 정책 거부 / 프로세스 진입점 보안 / Vercel 응답 HOLD 관련 **합성 Vitest**를 실행합니다. Docker 포트 바인딩 없음, 호스트 소스·비밀키 마운트 없음, Docker 환경변수로 인증정보 전달 없음. AI 모델 결과는 모두 **가짜 값**입니다.
4. 기존 `scripts/run-seyeon-c08-local-docker-pg17.mjs --disposable-only`를 호출해 별도 `postgres:17.6`의 **네트워크 격리된 일회용 DB**에서 첫 Thread·RLS·redacted 과거 기록 집계 검사를 실행합니다. 공식 PostgreSQL 이미지에 `git`이 없어도 pinned Git blob SHA-1을 검증하도록 coreutils 경로를 제공하며, Windows CRLF는 원본을 변경하지 않고 LF로 정규화한 **동일 고정 SQL 해시일 때만** 허용합니다. 이 단계는 **1510 기준선 재현만을 다룹니다.** 바로 뒤 별도 5단계에서 `20261018190000` 최종 함수의 DB 동작을 별도 검사합니다.
5. **최신 첫 대화 SQL 실DB 검증:** 기존 C08과 분리된 또 하나의 네트워크 격리 `postgres:17.6` 일회용 DB에 저장소의 검토된 전체 마이그레이션(기존 관리형 Principal 예외 0860은 제외)과 정확한 `20261018190000` SQL을 적용합니다. 합성 세연 첫 대화를 실제 `Receive → Attempt → 1640 사전 Pin → Generate → Validate → Commit v2` DB 명령으로 구성합니다. DB owner/Executor/anon 역할을 검증하고, **독립된 PostgreSQL 두 세션**으로 첫 응답의 `FOR UPDATE` 잠금이 Subject 수정 시도를 전송 인계 모델링 종료 전까지 차단하는지 확인합니다. 합성 AI 기록은 SQL 테스트용 행만 삽입하며 실제 모델을 호출하지 않습니다. 이 검사는 **실제 Node HTTP 전송이나 Vercel 프록시/클라이언트 ACK를 증명하지 않습니다.**
6. 종료 또는 실패 시 컨테이너를 삭제하고 테스트 이미지를 제거합니다. 원본 저장소·운영 DB에는 SQL을 실행하지 않습니다.

성공 시 두 단계가 각각 표시되고 최종적으로 아래가 출력됩니다.

```text
PASS_SEYEON_ZERO_COST_DOCKER_SYNTHETIC_TLS
PASS_SEYEON_ZERO_COST_DOCKER_DISPOSABLE_PG17
PASS_FIRST_ZERO_PG17_PRODUCTION_SQL_OWNER_ACL
PASS_FIRST_ZERO_PG17_REAL_PIN_GENERATE_VALIDATE_COMMIT_V2_SYNTHETIC_PROVIDER
PASS_FIRST_ZERO_PG17_CURRENT_MEMBER_LOCKED_ORIGINAL_ONLY
PASS_FIRST_ZERO_PG17_TWO_BACKENDS_SEND_LOCK_BLOCKS_SUBJECT_MUTATION
PASS_FIRST_ZERO_DOCKER_LOCAL_PG17_ACTUAL_LOCKED_SQL
PASS_SEYEON_ZERO_COST_DOCKER_FIRST_ZERO_LOCKED_PG17
PASS_SEYEON_ZERO_COST_DOCKER_ALL_OFFLINE_PHASES
```

실패하면 `HOLD_SEYEON_ZERO_COST_DOCKER_...` 또는 기존 PG17의 `HOLD_C08_...`가 표시됩니다. 별도 운영 승인이 필요한 상황이 아니라면 **오류 코드만 확인**하면 됩니다. 실제 Docker 실행 성공은 개인 PC에서 명령 수행 후 확인해야 하며, GitHub CI는 테스트 이미지의 실제 Windows Docker Desktop 실행을 대신하지 않습니다.

## 범위와 출시 보류

- 검증 가능: 실제 Node TLS 1.3 로컬 소켓, 가짜 Supabase 인증 401/회원, 가짜 PG 잠금 원본과 권한 거부, Governor 구성 실패 시 비용 호출 0, 로컬 PG17 C08 실제 RLS/Thread count 및 별도 최신 SQL의 Executor ACL/원본 DB 조회/2세션 잠금 경합.
- 미검증: 실제 운영 PostgreSQL과 Node TLS+AI 전체 연결, Node 실제 HTTP 전송과 동일 트랜잭션 결합, **실제 OpenAI 모델 품질 및 과금**, Vercel Proxy 송신/클라이언트 수신, 개인기억 양수 Grant·Commit·철회 ACK·Replay/History 공개. 운영 함수 설치 확인은 별도 운영 단계의 증거입니다.
- 로컬 테스트가 끝나도 `api/me.ts` 세연 Fetch 경로 503을 **해제하지 않습니다**. 서버리스 Vercel만으로 안전한 최초 공개를 증명할 수 있는지 보안 G3 계약과 프록시 ACK 경계의 별도 구현·검증이 필요하며, 불가능하다고 확인되는 경우에만 외부 직접 TLS 서버를 선택합니다.
