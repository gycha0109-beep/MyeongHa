# Cloudflare Auth/DB 이관 — OAuth Origin·Callback 및 격리 DB 승인 매트릭스 v1

> 트랙: ops / 로드맵 단계 5 (인증·세션·Supabase/PostgreSQL), 2026-10-21  
> 대상: [Cloudflare 구현 Draft PR #2384](https://github.com/gycha0109-beep/MyeongHa/pull/2384)  
> 상태: **승인 요청용 계약 정리. Cloudflare Auth/DB positive admission은 HOLD.**  
> 근거: `apps/api/src/social-auth-start-http.ts`, `naver-oauth-bridge-http.ts`, `supabase-auth-http.ts`, `member-refresh-cookie.ts`, `production-user-data-runtime-config.ts`, `docs/CLOUDFLARE_AUTH_DB_TRANSPORT_DECISION_V1.md`.  
> **이 문서는 OAuth provider·Supabase 프로젝트·Worker 변수/secret·DB credential·DNS를 수정하거나 신규 권한을 승인하지 않는다.**

## 1. 현재 코드가 실제 허용하는 URL (기존 Vercel 계약)

| 흐름 | 기존에 코드로 확인된 URL/형태 | 유지해야 할 보안 조건 | Cloudflare 상태 |
|---|---|---|---|
| Web 소셜 인증 시작 후 redirect | `https://myeongha.vercel.app/auth.html?social=callback` (서버가 `state` 추가) | **HTTPS, 정확한 origin/path, `social` 단일 키**, 추가 임의 query·userinfo·hash 불허, random state TTL 10분 | 이 주소를 Workers Preview 주소로 자동 치환 **금지** |
| 모바일 소셜 인증 | `myeongha://auth/callback` (서버가 `state` 추가) | `myeongha:` 스킴, `auth` host, `/callback` path, 최초 redirect URI query·fragment 없음 | 기존 모바일 딥링크 **불변**, 신규 웹 origin과 혼합 금지 |
| 소셜 provider start | `/api/auth/social/start` → 고정 Supabase `/auth/v1/authorize` | Google/Kakao/Naver provider flag 개별 gate, `redirect_to` exact 값, 요청 본문 한도 | **404**, Supabase로 전송하지 않음 |
| 네이버 OAuth transport | `https://myeongha.vercel.app/api/auth/social/naver/authorize` 및 `/callback`, `/token`, `/userinfo` | 네이버 등록 callback은 **정확히** `https://myeongha.vercel.app/api/auth/social/naver/callback`; PKCE S256, 밀봉된 AES-GCM state, state TTL 10분, action/method 검증 | 전체 **404**, 새 등록 URL 미승인 |
| 네이버↔Supabase bridge | 기존 상수 `MYEONGHA_PRODUCTION_SUPABASE_ORIGIN + /auth/v1/callback` | Supabase governed project origin 유지, code/verifier/state 바인딩, token credential 로그 금지 | 새 Worker → Supabase bridge 연결 **HOLD** |
| Supabase 이메일 가입 확인 | 기존 `https://myeongha.vercel.app/auth.html?confirmed=1&next=...` | `next`는 기존 HTML allowlist: `hall.html`, `reading.html`, `reading-detail.html`, `chat-hub.html`, `chat.html`, `records.html`, `my.html`. 외부 origin은 hall fallback | Cloudflare signup redirect 교체 **HOLD** |
| 브라우저 refresh 쿠키 | `myeongha_member_refresh_v1`; `Path=/api/auth; HttpOnly; Secure; SameSite=Strict`; **Domain 없음** | 호스트 전용 쿠키는 `myeongha.vercel.app`과 `*.workers.dev` 사이에 공유되지 않음. 로그인/갱신/로그아웃 별 속성 동일성 필요 | Workers 발급·읽기·삭제 **HOLD** |
| 개인 API | `/api/me`, `/api/birth-profiles`, `/api/readiness` 등 | 검증된 인증 주체 → canonical subject → RLS·verify-full; `readiness`는 private TLS canary | **404**, 새 웹 호스트를 인증 근거로 사용 금지 |

**주의:** 이 표는 URL·호스트 보안 계약을 정리한 것이며 실제 OAuth callback/state/CSRF E2E를 완료했다는 뜻이 아니다. 현재 명하 Preview URL은 **정적 프리뷰 전용**이며 OAuth/DB 승인된 호스트가 아니다.

## 2. Cloudflare 전환에 필요한 정확한 허용 URL 결정란 (미승인)

| 운영 결정 | 채워야 할 실제 승인값 또는 정책 | 현재 판정 |
|---|---|---|
| Auth 테스트 전용 HTTPS origin | 신규/기존 **정확한 FQDN 하나**와 소유권. `https://`, 포트 포함 여부, preview vs production 구분, rollback 호스트 | **UNSET / HOLD** |
| Web social callback allowlist | 승인 origin 기준 **정확히** `/auth.html?social=callback`; state 추가·검증, 중복·오염 query 거부 | **UNSET / HOLD** |
| Naver provider callback | 승인 origin 기준 정확히 `/api/auth/social/naver/callback`; 네이버 개발자 설정·Supabase bridge callback 양측 호환 승인 | **UNSET / HOLD** |
| Supabase 웹 확인 redirect | 승인 origin 기준 `/auth.html?confirmed=1&next=...`; 공급자 allowlist·email confirmation 정책 검토 | **UNSET / HOLD** |
| Mobile callback | 현행 `myeongha://auth/callback` 유지 또는 별도 모바일 담당 승인 | **현행 값 보존 / 새 변경 없음** |
| Refresh cookie scope | 새 origin에서 host-only, `Path=/api/auth`, HttpOnly, Secure, SameSite=Strict; 기존 Vercel 세션을 새 호스트로 자동 복사하지 않는 전환·재로그인 정책 | **UNSET / HOLD** |
| Callback/state/CSRF 검증 | Google/Kakao/Naver provider별 exact redirect, PKCE, state 발급·수신/일회성·TTL·재전송, login CSRF 및 host spoof 부정 검사 | **미실측 / HOLD** |
| Worker Auth runtime secret | DB, Supabase, guest fingerprint, Naver bridge 등 **키 이름·격리된 binding namespace·소유자·rotation/폐기 계획만**. 값은 GitHub에 작성하지 않음 | **설정 미승인 / HOLD** |
| Web/Worker 사이 CORS | 필요한 정확한 `Origin` 및 method/header/credentials 정책. wildcard+credentials 금지; 같은 origin 기준을 먼저 검토 | **UNSET / HOLD** |

승인값이 없는 항목은 임의의 `workers.dev` 주소나 `myeongha.vercel.app`을 복사하여 **승인됨(PASS)**으로 승격시키지 않는다. `Host`, `X-Forwarded-Host`, query `redirect_uri`, 임의 사용자 입력을 승인 호스트의 대용으로 사용하지 않는다.

## 3. Worker → 격리 PostgreSQL 실접속 선행 승인

| 계약 | Security/API/DB에서 확인할 정확한 증거 | 현재 |
|---|---|---|
| 대상 DB 분리 | 운영 데이터가 없는 합성 전용 DB의 **공개 경로로 도달 가능한 DNS FQDN/port**와 소유자, 네트워크 제한. Cloudflare TCP는 loopback/private IP 대상 직접 연결 불가 | **UNSET** |
| 비밀값 운영 | Cloudflare Worker용 **개별 secret binding 권한·rotation·폐기**, 운영 Vercel secret 재사용/자동 복사 불허 | **UNSET** |
| TLS 인증서 | **verify-full**, CA trust root/SHA256 pin, DNS SAN/hostname 일치, 거부 시 fail-closed. 원문 인증서/DSN은 PR·로그 금지 | **UNSET** |
| Postgres 역할 | 비특권 login principal, **NOLOGIN `myeongha_api_executor`**, `SET LOCAL ROLE`, transaction-bound member/guest resolver, RLS 및 다른 사용자 read/write 차단 | **Node·일회용 PostgreSQL 증명만 완료** |
| 요청별 pool | max=1 후보, scope 종료 시 await close, 오류 시 rollback/discard, 요청 간 subject 오염·동시성·cancel/timeout 회귀 | **합성 + Node 일회용 DB만 완료** |
| 성능/비용 | Workers 전용 handshake/connect/close 지연, 연결·CPU·subrequest 한도와 DB max connections, 비용/traffic owner | **UNSET** |
| Hyperdrive 대안 | Direct TCP가 불가한 경우에만 **별도 승인**, 사용자/권한 SQL 쿼리 cache disabled, Custom CA + verify-full의 신뢰 주체 및 RLS 동등성 검증 | **생성·채택 HOLD** |

현재 수락 근거: [일회용 PostgreSQL TLS/RLS Node CI #39530395189](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39530395189). **Node TLS/RLS PASS ≠ 배포된 Workers에서 같은 DB 보안 경계 PASS**. 이 문서로 원격 endpoint가 생기거나 OAuth provider callback을 등록한 것으로 간주하지 않는다.

## 4. 별도 승인 이후에만 할 실제 실행 순서

1. Security/API/DB와 사용자 승인 범위를 exact OAuth origin, 격리 DB target, TLS/role/secret binding, 비용 상한, 즉시 차단/삭제 절차까지 **값을 숨긴 승인 기록**으로 고정.
2. Cloudflare 기존 `myeongha` Preview에서만 **승인된 격리 네트워크 target**을 이용해 TLS root/hostname/role/member·guest/RLS/negative cases를 실측. 새 Cloudflare Production Worker·DNS 변경 금지.
3. OAuth는 provider 등록 URL·Supabase redirect allowlist의 exact 허용값이 일치할 때, **합성 테스트 사용자만** 허용. state/CSRF/cookie/renew/logout/호스트 분리를 검증하고 기존 Vercel origin은 유지.
4. 실패 시 해당 Auth/DB route 404, `/api/readiness` 404로 유지하고, 사용한 test credential 폐기·Preview 이전 버전 rollback. **단계 6 사주·관상으로 자동 진행하지 않음.**

## 5. 현시점 판정과 승인 요청

- **EVIDENCED:** Worker 정적 Preview 및 `/api/health`, API denial, 로컬 Worker Node import/쿠키 계약, 요청별 Pool 합성 테스트, Node↔일회용 PostgreSQL TLS/회원 RLS.
- **HOLD:** Workers→접근 가능한 실제 격리 DB TLS/RLS, preview OAuth/Web/모바일 콜백 등록, refresh cookie host 이동, positive `/api/auth/*`, `/api/me` 및 private `/api/readiness`.
- **필요 승인:** 격리 DB 접속 target 및 비용·credential scope, 별도 정확한 HTTPS Auth origin, 공급자별 redirect/callback 허용 URL, Security/API/DB 기술 수락. **미정값은 미정으로 유지.**
- **기존 운영 불변:** Vercel, Supabase production schema/credential, Naver/Google/Kakao provider 설정, Workers production routing, DNS, Saju, Seyeon AI, PortOne 결제는 변경하지 않는다.

## 6. 테스트 전용 환경 결정 — 사용자 지시 (2026-10-21)

- **테스트만을 위한 DB는 로컬 Docker Desktop/Linux Docker에서만 구성한다.** 새 클라우드 PostgreSQL, 외부에서 접근 가능한 테스트용 DB, Hyperdrive 리소스, OAuth용 새 공개 도메인·유료 리소스를 이 단계에서 **생성하지 않는다**. 사용자 테스트 환경을 이유로 Production 자격증명이나 DB를 재사용하지 않는다.
- Windows/Linux 로컬 실행 준비: Node 24, 로컬 Docker 엔진, 사전 보유한 `postgres:15` 이미지, 프로젝트 `npm ci --ignore-scripts`. `npm run test:cloudflare:auth-db:docker-local`은 로컬 socket/npipe만 수락하고 `127.0.0.1` 임의 포트에만 일회용 PostgreSQL을 연다. 외부 이미지 자동 pull 없음.
- 실행 중 ephemeral CA·SAN 인증서 및 비특권 DB 계정과 합성 Member A/B 데이터를 생성한다. 실제 TLS handshake, CA/hostname 부정 검사, `SET LOCAL ROLE`, canonical subject/RLS, rollback·교차 사용자 읽기 차단을 기존 E2E 테스트로 검증한다. **완료 시 고유 Docker 컨테이너/익명 데이터 볼륨/CA 볼륨/임시 인증서 파일을 제거**하며 다른 Docker 프로젝트는 건드리지 않는다.
- 사용자 PC의 Docker Desktop은 이 GitHub 채팅 커넥터에서 직접 실행할 수 없다. **이 스크립트는 로컬 실행용으로 준비된 것이며 실제 사용자 PC 실행 PASS 증거는 아직 없다.** 기존 GitHub Actions 일회용 DB E2E의 PASS와 혼동하지 않는다.
- Workers TCP는 localhost/private IP에 직접 접속할 수 없으므로 Docker 테스트 성공을 Cloudflare Workers→DB 연결 성공으로 승격하지 않는다. **이 단계의 목적은 로컬 Node/PostgreSQL 보안 정책 입증**이다. 원격 DB·OAuth가 꼭 필요한 후속 런타임/공개 단계는 별도 승인까지 HOLD하며 로컬 Docker로 공개 서비스 연결을 우회하지 않는다.

## 7. 단계 5 후속 구현 — Worker Auth 응답·쿠키 경계 (2026-10-22)

- 근거: 통합 로드맵 PR #2437(기존 트랙 현재 구현 우선), Cloudflare 단계별 계획 PR #2381, 구현 Draft PR #2420.
- 기존 Worker 단계 5 Auth/Guest/프로필 후보를 재구현하지 않고 `workers/cloudflare-auth-db-api.mjs`의 **최종 응답 경계**를 보강했다. 허용된 JSON/host-only refresh cookie만 그대로 전달하고 no-store/CSP/기타 보안 헤더를 강제한다. 실수로 나온 HTML, SSE, plain-text 또는 일반 3xx는 고정 503으로 차단하고 CORS 응답 헤더는 제거한다.
- 네이버 OAuth의 기존 GET authorize → `https://nid.naver.com/oauth2.0/authorize`, GET callback → 기존 Supabase 프로젝트의 정확한 `/auth/v1/callback` **두 302 대상만** 예외로 유지한다. 다른 host/path, 임의 응답의 Location, redirect-set-cookie는 거부한다.
- Cookie를 포함한 브라우저 POST는 Origin 또는 Fetch Metadata의 **실제 동일 출처 신호**가 없는 경우 DB·Auth 생성 이전 404로 거부한다. Credential 없는 API/서버 간 요청의 기존 정책 및 Vercel 런타임은 바꾸지 않는다.
- `test/cloudflare-auth-admission.test.mjs`의 오프라인 방어 회귀로 검증한다. **실제 Worker↔Supabase Auth/DB, OAuth 등록, 공개 테스트 호스트, Secret 또는 실제 세션은 연결하지 않았다**. 인증·DB positive 가동 승인과 테스트용 로컬 Docker only 정책을 유지한다.
- Saju Calculation-only, 세연 private first/History/Replay 503, Reader 공식 근거, PortOne 공개/실결제 차단과 Vercel Production·DNS는 불변이다.
