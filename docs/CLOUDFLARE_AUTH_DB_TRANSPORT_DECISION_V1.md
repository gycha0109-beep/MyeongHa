# Cloudflare PostgreSQL 연결 방식 조건부 결정 — 단계 5 (2026-10-21)

> 범위: 명하 이관 PR [#2384](https://github.com/gycha0109-beep/MyeongHa/pull/2384), Cloudflare Worker **`myeongha`** 하나.  
> 실행 상태: **코드 후보/합성 차단 테스트만 구현. 실제 DB 연결·Hyperdrive 생성·Cloudflare secret 등록·운영 배포 없음.**  
> 결론: **Direct TCP는 우선 실측 후보, Hyperdrive는 조건부 보류. 어느 방식도 아직 운영 승인 또는 보안 수락이 아니다.**

## 1. 결정의 근거가 되는 기존 명하 계약

1. `production-user-data-runtime-config.ts`는 비특권 로그인 역할, 전용 PostgreSQL URL, `MYEONGHA_DATABASE_TLS_PEER_MODE=verify-full` 및 CA PEM 바인딩을 필수로 요구한다.
2. `production-postgres-tls-peer-verification.ts`는 **기존에 고정된 X509 Root CA SHA-256 fingerprint와 Supabase project authority**를 검사하고, `rejectUnauthorized: true` 및 서버 hostname 검증을 유지한다. 실제 원격 서버 handshake 결과까지 이 코드만으로 입증되지는 않는다.
3. `node-postgres-subject-pool.ts`는 `current_user` 및 `pg_has_role` 사전검사 후 connection을 공개한다. 일반 Vercel 런타임에는 전역 공유 `Pool`이 있지만, Workers에서는 요청 간 소켓 공유가 금지된다.
4. `postgres-subject-execution.ts`는 같은 checkout 안에서 `BEGIN → SET LOCAL ROLE myeongha_api_executor → canonical member/guest resolver → assert subject → user query → COMMIT/ROLLBACK`을 강제한다. 실행 역할은 기존 **NOLOGIN** 및 **RLS**를 보존해야 한다.
5. `cloudflare-request-subject-scope.ts`는 요청 내부에서만 Pool 생성·`await close()` 및 종료 후 재사용 거부를 검증했다. 이는 **합성 테스트 11개**로 확인했고 실제 DB는 아직 연결하지 않았다.

## 2. Direct TCP / Hyperdrive 비교

| 항목 | Direct TCP (우선 실측 후보) | Hyperdrive (조건부 보류) |
|---|---|---|
| Worker에서 PostgreSQL 접근 | 공식 `node:net`/TCP sockets + `pg` 지원 | Worker Hyperdrive binding의 별도 PostgreSQL 연결 문자열 + `pg` 지원 |
| TLS 검증 주체 | **Workers 내 node-postgres**. 기존 `verify-full`·고정 CA fingerprint·hostname 검증 재사용 후보 | **Hyperdrive → origin**. `verify-full` + Custom CA를 지원하지만 애플리케이션의 동일한 피어 인증서 검증 증거라고 단정 불가 |
| DB 연결 수명 | 매 요청 `Pool(max=1)` 생성 → `await close()`; 요청 간 공유 금지 | Workers 쪽도 매 요청 client 사용; Hyperdrive는 origin에 자체 pool을 유지 |
| P0-AUTH-01 트랜잭션 | 기존 login principal preflight, `SET LOCAL ROLE`, canonical subject, RLS 흐름 재사용 후보 | [트랜잭션 단위 연결 유지와 `SET` 지원](https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/)하지만 same-client subject/RLS 교차 사용자 E2E 필요 |
| 읽기 캐시 | `pg` 자체 cache 없는 구성, HTTP/Cloudflare 별도 캐시 비활성 | Hyperdrive는 [쿼리 캐시가 기본 활성](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/). 명하 Auth/permission/RLS/read-after-write 경로에서는 **`--caching-disabled` 필수** |
| 부하와 연결 규모 | 요청마다 연결 → DB/pooler 연결량·초기 지연·Workers TCP 한도 주의 | 글로벌 연결 풀에 따른 비용·지연 이점 후보지만 DB 최대 연결 수·트랜잭션 점유율 확인 필요 |
| 운영 자원 및 승인 | 기존 CA/DB endpoint를 사용하더라도 Cloudflare secret과 Workers DB 네트워크 접근은 **명시적 승인 필요** | **Hyperdrive 새 리소스와 DB credential/TLS 설정** 승인 필요. 기본 Free 사용 가능하지만 한도 있음 |
| 현재 실측 | Workers 모듈 로딩·쿠키 검증 PASS. **실제 TCP/handshake/RLS 미실행** | 공식 문서 검토만 완료. 리소스·binding·TLS/RLS 실측 **미실행** |
| 현재 선택 | **시험 대상만 선정**, positive API 활성화 HOLD | **활성화·생성 HOLD**, Direct TCP 실패가 증명될 경우 다시 평가 |

공식 문서: [Workers TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/), [Workers PostgreSQL 연결](https://developers.cloudflare.com/workers/tutorials/postgres/), [Hyperdrive PostgreSQL](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/), [Hyperdrive transaction pooling](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/), [Hyperdrive SSL/custom CA](https://developers.cloudflare.com/hyperdrive/configuration/tls-ssl-certificates-for-hyperdrive/), [쿼리 캐시 비활성화](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/), [Hyperdrive Free 포함 및 사용량 제한](https://developers.cloudflare.com/hyperdrive/platform/pricing/).

## 3. Direct TCP 후보 구현과 정확한 비활성 경계

- `apps/api/src/cloudflare-direct-postgres-candidate.ts`: **실제 Worker dispatcher에는 import하지 않음.**
- 함수 `withCloudflareDirectPostgresSubjectTransactionV1`은 **호출 시점**의 환경만 읽고 기존 Production PostgreSQL 설정 파서 → 기존 고정 CA 지문을 검증하는 TLS target builder → `Pool(max=1)` → 요청별 close → 기존 verified subject transaction을 사용한다.
- `maxConnectionsPerRuntime=1`, connect/statement timeout 5초, idle timeout 1초. 이는 테스트 가능한 제한 설정이며 실제 타임아웃 적정성/Worker 기동 부하는 미실측이다.
- **TLS 검증 실패 때도 연결 시도하지 않고 즉시 거부**하도록 CA PEM 지문·SSL downgrade 관련 부정 테스트를 추가했다.
- 기존 `api/me.ts`·`api/birth-profiles.ts`의 Vercel 전역 Pool은 건드리지 않는다. Cloudflare `wrangler.jsonc`와 프리뷰 `workers/cloudflare-static-preview.mjs`에도 DB 관련 runtime wiring을 추가하지 않는다.
- **합성 부정 테스트:** `npm run test:cloudflare:direct-db`. 자격증명/CA/모드 누락, TLS disable/prefer/verify-ca, PostgreSQL privileged login 역할, 잘못된 CA, Hyperdrive binding 오인, 유효하지 않은 database URL. 테스트는 `.invalid` host와 가짜 비밀값만 사용하고 **DB 네트워크 호출을 하지 않음**.

## 4. 실접속 승인 전 수락 조건

1. Security/API/DB 소유자 승인: 실제 Cloudflare 별도 secret scope, OAuth callback origins, DB principal/계정 권한, 운영과 격리된 synthetic 대상 DB, credential 회전·폐기 방식.
2. 첫 네트워크 실측: Worker→DB/pooler TLS **실제** handshake, 원격 hostname 검증, CA root fingerprint, `sslmode=verify-full` evidence, 실패 시 연결 전면 거부. 연결 문자열·PEM 원문을 GitHub/출력에 기록하지 않음.
3. 권한 실측: login `current_user`, NOLOGIN `SET LOCAL ROLE`, 회원/게스트 canonical subject, `RLS` 교차 사용자 읽기·쓰기 거부, timeout/rollback/subject contamination/동시성 2명 이상 확인.
4. 부하 측정: Workers 5초 제한·요청당 연결 1개가 지연과 Supabase connection limit 안에 들어오는지 확인. 미달이면 Hyperdrive 등 대안을 별도 기술 승인으로 재평가.
5. Hyperdrive를 다시 평가할 경우: **query caching disabled**, origin `verify-full`+custom CA 근거, 인증서 지문 동등성 여부 판단, SQL 트랜잭션·RLS 동일성, 요청별 client 연결 관리, DB 세션 권한 오염/캐시 교차 노출 부정 테스트 후에만 채택한다.

## 5. 경계 판정

| 구분 | 결과 |
|---|---|
| 현재 Worker Preview (11 HTML, health만 공개) | 계속 유지, 기존 404/503 차단 변동 없음 |
| 요청별 DB 연결 관리 / 합성 RLS 트랜잭션 / secret 누락 차단 | PR CI 테스트 대상으로 검증 중 |
| Direct TCP 실접속 / CA 피어 handshake / 소유권 RLS E2E | **HOLD — 실측·승인 전** |
| Hyperdrive 설정 생성·바인딩 | **HOLD — 선택·승인 전** |
| OAuth/DB/API positive admission | **HOLD — Security/API/DB 승인 전** |
| Production DNS/Vercel/PG/PortOne/세연 AI | **변경 금지·미변경** |

다음 이관 재개 시 이 문서와 PR #2384 최신 GitHub Actions 결과를 읽고, 사용자 인증·실DB 연결 승인 없이 방어적 코드와 격리된 합성 E2E만 추가한다.

## 6. 일회용 PostgreSQL 실측과 Workers 로컬 TCP 한계 (2026-10-21)

- Cloudflare 공식 [TCP Sockets 문서](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/#proxy-request-failed-cannot-connect-to-the-specified-address)에 따르면, **`localhost` 및 private IP는 Workers TCP 연결의 허용 대상이 아니다.** 따라서 GitHub Actions의 루프백 PostgreSQL을 `wrangler dev`의 Worker 코드에서 직접 접속시키는 방식으로는 운영 Workers Direct TCP 성공을 입증할 수 없다.
- 실제 로컬 Worker에서의 디버깅: 격리 PG와 Worker 프로세스 기동 및 secrets binding 성공 → 멤버 요청의 **연결/사전검사 단계에서 internal error**. DNS 별칭을 127.0.0.1로 바꾸고 `nodejs_compat`을 넣어도 이를 Workers TLS/RLS 성공으로 수락할 수 없었다. **실패한 실험은 성공으로 기록하지 않으며**, 불가능한 루프백 TCP를 요구하는 CI 테스트 엔트리 3개를 제거했다.
- 대신 `test/cloudflare-request-scope-real-tls-postgres.e2e.test.ts`에 **일회용 PostgreSQL 15를 사용하는 실제 노드 TCP·TLS·RLS E2E**를 구현했다. 기존 `scripts/local/setup-saju-bridge-tls-subject-ci.sh`의 Docker PG와 일회용 self-signed CA, **non-superuser `myeongha_runtime`** 로그인, 실제 명하 migration과 가상 회원 A/B를 재사용한다.
- 테스트는 실제 네트워크 TLS handshake, CA PEM 검증·hostname SAN 검증, pg_stat_ssl TLS 활성, login `session_user`와 NOLOGIN `SET LOCAL ROLE myeongha_api_executor`, Member A/B 별 RLS 격리, 없는 Member 거부, rollback 후 다른 Member 재조회, 잘못된 CA/SAN/평문 연결/비밀번호 거부를 확인한다. 해당 검증은 **`withCloudflareRequestSubjectScopeV1` 및 기존 `executePostgresSubjectTransactionV1` 어댑터를 실제 PG에 연결하는 Node 프로세스 기반 실측**이다.
- CI `cloudflare-auth-db-tls-local` job은 이 일회용 Node E2E를 필수 통과 조건으로 삼는다. 테스트 fixture는 GitHub Actions 실행 환경 내에서만 생성되며 종료 시 DB Docker 컨테이너·CA 키·파일을 삭제한다.
- **확인되지 않은 사항:** 원격 Cloudflare Workers→실제 DB TCP 연결, 운영 서버의 고정 SHA-256 CA 피어 핸드셰이크, Cloudflare Workers가 접근 가능한 승인된 스테이징 DB 호스트, Hyperdrive TLS trust delegation, OAuth/Auth E2E. Node CI 성공을 Workers 실네트워크의 성공이라고 표시하지 않는다.
- 최종 원격 검증은 Security/API/DB 승인으로 지정된 격리 네트워크 경유의 **접속 가능한 DB 엔드포인트** 및 허용된 Worker Preview binding이 마련되어야 수행 가능하다. 루프백 제한을 보안 우회나 Production DB 접근으로 해결하지 않는다.
