# Cloudflare Auth·DB 이관 선행 계약과 보류 조건 (2026-10-20)

> 트랙: ops / 로드맵 [단계 5](https://github.com/gycha0109-beep/MyeongHa/pull/2381)  
> 작성 기준: `gycha0109-beep/MyeongHa` PR #2384 작업 브랜치의 기존 API/DB/Auth 구현 조사  
> 상태: **소스 의존성·승인 경계 확인. Auth/DB 이관 구현 및 외부 서비스 연결은 HOLD.**  
> Production Vercel·DNS·Supabase/PG·OAuth 앱·결제·AI에 대한 변경 또는 secret 생성/복사는 하지 않았다.

## 1. 현재 경계 및 사용 가능한 단계

- Cloudflare `myeongha` Preview에서 **`GET /api/health`만** 고정 JSON 200을 반환하며, 비공개 `/api/readiness`는 **GET/POST 404**다.
- 세연 최초 Reveal은 `POST /api/chat/:threadId/turns` **503 HOLD**, 그 외 Auth/DB/개인정보 API는 404다.
- 12개 직접 엔트리, 17개 Vercel rewrite path는 Worker의 `workers/cloudflare-api-router.mjs`에서 분류만 하며, `/api/me` 등 내부 target으로 라우팅하거나 Supabase/DB에 연결하지 않는다.
- Stage 5는 선행 요건 확인 전까지 **Cloudflare Preview에서 로그인·사용자 데이터 기능이 동작한다고 간주하지 않는다**.

## 2. 사실로 확인한 기존 실행 구조

| 구분 | 기존 코드 근거 | Cloudflare 연결 전 필수 계약 |
|---|---|---|
| 게스트 초기 세션 | `api/session/bootstrap.ts` → `production-guest-bootstrap-http-runtime` → `node-postgres-subject-pool` | TTL·남용 방지와 canonical subject를 그대로 증명해야 함 |
| 회원 인증 | `api/auth/sign-in.ts`, `sign-up.ts`, `refresh.ts`, `sign-out.ts` → `production-member-auth-http-runtime`, `supabase-auth-http` | Supabase auth 호출, 실패·만료 매핑, 자격증명·쿠키 범위를 이관해야 함 |
| 게스트 회원 승격 | `api/auth/promote-guest.ts` → `production-guest-promotion-runtime` | guest→member canonical subject 연속성 및 중복·교차 계정 거부 증명 |
| 네이버 소셜 | `naver-oauth-bridge-http.ts` | 현재 **`https://myeongha.vercel.app` origin 및 callback을 코드에 고정**. Cloudflare 임시 URL로 무단 치환하거나 기존 OAuth state 흐름 우회 금지 |
| 공통 소셜 시작 | `social-auth-start-http.ts` | 웹 리다이렉트 origin `https://myeongha.vercel.app`, 모바일 `myeongha://auth/callback`을 구분. Cloudflare host allowlist/redirect 승인 전 HOLD |
| 가입 후 리다이렉트 | `supabase-auth-http.ts` | 현재 웹 origin `https://myeongha.vercel.app`으로 고정. 새 호스트에서 임의 trusted redirect 열지 않음 |
| Refresh 쿠키 | `member-refresh-cookie.ts` | `myeongha_member_refresh_v1`, `Path=/api/auth`, `HttpOnly`, `Secure`, `SameSite=Strict`, host-only `domain:null`. Vercel·workers.dev 간 쿠키 공유 전제 금지 |
| 사용자 정보 | `api/birth-profiles.ts`, `api/me.ts` → `createNodePostgresSubjectPoolV1` | 브라우저 인증 주체를 서버 측 검증, subject-scoped DB 트랜잭션 내에서만 사용 |
| DB 권한 | `postgres-subject-execution.ts` | `SET LOCAL ROLE myeongha_api_executor` 및 `begin_member_subject_context_v1`, `begin_guest_subject_context_v1`, `assert_myeongha_subject_context_v1` 바인딩 유지 |
| DB TLS | `production-user-data-runtime-config.ts`, `production-postgres-tls-peer-verification.ts`, `node-postgres-subject-pool.ts` | verify-full, CA peer fingerprint, 전용 login principal/NOLOGIN execution role 분리와 RLS 유지. Worker TCP/`pg` 실행 동등성 미검증 |

## 3. 비밀값 없는 환경변수 이름 인벤토리

기존 소스의 `PRODUCTION_USER_DATA_RUNTIME_ENV_V1` 및 `PRODUCTION_POSTGRES_TLS_ACTIVATION_ENV_V1`에서 참조한 이름:

- DB/TLS: `MYEONGHA_DATABASE_URL`, `MYEONGHA_DATABASE_PRINCIPAL`, `MYEONGHA_DATABASE_TLS_PEER_MODE`, `MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM`
- Supabase / 게스트: `MYEONGHA_SUPABASE_URL`, `MYEONGHA_SUPABASE_API_KEY`, `MYEONGHA_GUEST_FINGERPRINT_SECRET`
- 네이버 브리지: `MYEONGHA_NAVER_OAUTH_BRIDGE_ENABLED`, `MYEONGHA_NAVER_CLIENT_ID`, `MYEONGHA_NAVER_OAUTH_BRIDGE_KEY`
- 소셜 공급자: `MYEONGHA_SOCIAL_AUTH_GOOGLE_ENABLED`, `MYEONGHA_SOCIAL_AUTH_KAKAO_ENABLED`, `MYEONGHA_SOCIAL_AUTH_NAVER_ENABLED`

**이 문서에 secret 값, PostgreSQL DSN, 인증서 본문, 토큰, 사용자 ID, 세션 쿠키는 포함하지 않는다.** 명하 운영 Vercel 환경변수를 Cloudflare에 자동 복사하지 않는다.

## 4. 실제 구현 전 필수 보안 수락

1. **정확한 Cloudflare HTTP 호스트와 OAuth redirect/CSRF/state 연결 정의.** 현재 웹·네이버 인증은 Vercel 호스트로 고정되어 있고, 프리뷰 Workers.dev 호스트에 세션을 자동 이관할 수 없다. 승인된 별도 호스트 바인딩/redirect allowlist만 허용.
2. **Worker `env` + secret scope/rotation 소유자 확정.** `process.env`와 `pg` Node 런타임을 그대로 붙여 동작한다고 가정하지 말고 Worker 호환 환경에서 분리된 실측 필요. 값은 GitHub·PR·로그에 쓰지 않음.
3. **Postgres SSL verify-full + peer fingerprint + nonprivileged login 검증.** `myeongha_api_executor` NOLOGIN role과 transaction-local subject context/RLS가 원격 Worker 경로에서도 동일하게 보호되는지 확인.
4. **인증 및 소유권 부정 테스트.** 게스트 만료/잘못된 OAuth state, cookie host/path/SameSite, 권한 없는 `/api/me`, 다른 회원 records/birth 접근, connection pool 오염, DB timeout/재시도에 대해 deny-first 확인.
5. **실사용 기능 노출 승인 경계.** Security/API/DB의 필수 승인이 없으면 positive 회원인증/DB API, TLS Canary, private records·chat, Saju, AI/Commerce를 공개하지 않는다.

## 5. 현재 기술 판단

- **완료:** 단계 4 health + deny-first router/HTTP·Chrome·로컬 런타임 검증. Stage 5 필요한 Auth/DB 의존성 및 host binding 단절 지점 분류.
- **미완료:** Cloudflare DB TCP/Hyperdrive/Node-compat 실제 경로 실측, OAuth 콜백/secret 실제 바인딩, subject/transaction RLS E2E, 실회원 로그인/사용자 데이터.
- **다음 실제 작업:** 승인된 환경 격리 방법과 호스트 정책이 정해지면 사용자 데이터 연결 없이 Worker 런타임 호환 adapter와 negative Auth/DB 테스트부터 이관. 승인 전에는 작업 범위를 문서/비밀값 없는 계약 검증으로 제한.


## 6. Workers 실측 결과 — 격리 로컬 런타임 (단계 5, 2026-10-20)

- [실제 GitHub Actions CI 실행](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39444480921)에서 `npm run verify:cloudflare:auth-db:local` **PASS**. `wrangler@4.151.2`, `2026-10-20` 호환성 날짜의 실제 `workerd`를 사용함.
- **`pg` Client/Pool 모듈**, 기존 `createNodePostgresSubjectPoolV1` 및 `buildProductionPostgresStrictTlsTargetV1` 모듈 **로딩 가능**. `node:crypto` SHA-256/X509과 `node:tls` API export 사용 가능. 이는 TCP 연결/인증서 피어 검증의 실제 성공이 아님.
- **자격증명 없는 환경을 기존 `parseProductionUserDataRuntimeConfigV1`이 거부**함을 확인. Workerd에서 기존 `member-refresh-cookie.ts`의 synthetic-only 쿠키 발급·읽기·폐기 및 `Path=/api/auth; HttpOnly; Secure; SameSite=Strict`, no Domain 계약 유지.
- 로컬 테스트는 `workers/cloudflare-auth-db-compat.local.jsonc`와 테스트 전용 Worker 엔트리로만 실행. **Cloudflare에 별도 프로젝트 생성 0, 배포 0, 비밀값 0, DB 쿼리 0, OAuth 호출 0**. 실제 프리뷰는 여전히 `wrangler.jsonc`의 `myeongha` 정적 Worker이며 Auth/DB API 404 차단.
- [Cloudflare 공식 Postgres/Node 호환 안내](https://developers.cloudflare.com/workers/tutorials/postgres/): 호환성 날짜 2026-08-04 이후 Node 호환 기능은 기본값. 이 설정만으로 명하 DB 보안 수락이 완료되지는 않음.

### 실연동 전에 반드시 변경해야 하는 구조

1. **요청 간 DB 연결 공유 금지.** 기존 `api/me.ts`와 `api/birth-profiles.ts`의 모듈 전역 `sharedPostgresPool` 캐시는 Vercel/Node 서버 중심 코드다. Workers는 [TCP 소켓을 전역에서 공유하거나 다른 요청에서 재사용할 수 없음](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/). Workers 런타임에는 요청 내부에서 Client/Pool을 생성·연결·해제하는 별도 adapter가 필요하고, 기존 Vercel Pool은 그대로 둔다.
2. **Direct TCP vs Hyperdrive 미결정.** Direct `pg`는 Workers 내부에서 CA·peer 및 네트워크 지연 검증이 필요. [Hyperdrive](https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/)는 트랜잭션 풀링 방식으로 같은 `BEGIN/COMMIT` 범위의 `SET`/SQL을 같은 연결에서 실행하며 종료 후 `RESET`하지만, 명하의 `SET LOCAL ROLE`·subject binding·RLS E2E 및 성능·사용량 검증은 별도 필요. 둘 중 어느 쪽도 자동 채택하지 않는다.
3. **TLS 신뢰 경계 구분.** [Hyperdrive는 verify-full과 사용자 지정 CA를 지원](https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/)하지만, 기존 앱이 실행하는 X509 피어 검증/고정 SHA-256 fingerprint와 **검증 주체가 동일하다고 가정할 수 없다**. Root CA·인증서 지문·피어 호스트를 입증하기 전 Hyperdrive 리소스를 만들지 않는다.
4. **호스트 및 세션 분리.** Vercel 고정 OAuth redirect와 host-only refresh cookie가 Workers.dev Preview에서 자동 연동되는 것은 불가능하다. 실제 콜백/쿠키 허용 호스트 정책과 Security/API/DB 승인이 확정되기 전에는 User Auth/DB route는 계속 404.
5. **최종 positive admission 요건:** 격리 DB에서 TLS verify-full, 전용 NOLOGIN execution role, 요청별 `BEGIN → SET LOCAL ROLE → canonical subject → RLS 검사 → COMMIT/ROLLBACK`, cross-user deny, pool isolation, TTL/CSRF, 네트워크 실패/timeout/동시성 회귀. 인증·DB 기능 공개/운영 전환은 별도 승인.

### 이 단계의 판정

**Workers 모듈 로딩/정적 정책 호환성: PASS. 실제 DB 연결·TLS 핸드셰이크·RLS·OAuth E2E: NOT TESTED/HOLD.** 프리뷰 공개 API 범위에는 변동이 없다.
