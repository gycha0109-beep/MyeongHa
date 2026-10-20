# 명하 Cloudflare Workers 이관 아키텍처 v1.0

> 저장소: `gycha0109-beep/MyeongHa`  
> 작성일: 2026-10-20 (KST)  
> 사실 확인 기준: `main@3f7e31c39c436474e6190058ea426e7a538e1cfc`  
> 상태: **설계 기준안 / 구현·배포·운영 전환 미승인**  
> 동반 로드맵: [CLOUDFLARE_MIGRATION_ROADMAP_V1.md](./CLOUDFLARE_MIGRATION_ROADMAP_V1.md)  
> 실행 트랙: `ops` / 기존 Vercel Production 유지

## 0. 결정과 비결정

**목표**: 명하의 웹 호스팅을 장기적으로 Vercel에서 Cloudflare Workers + Static Assets로 이전하되, 기존 Vercel·Supabase·Saju producer의 권위와 가용성을 보호하며 별도 Cloudflare 프리뷰에서 검증한다.

**채택한 방향(사용자 인계)**: Workers + Static Assets 우선; GitHub 연동과 Wrangler; Preview/rollback; 기존 Supabase DB/Auth 유지; 처음에는 Vercel Production 운영 유지.

**이 문서만으로 허가되지 않는 일**:
- Cloudflare Worker/Pages 프로젝트 생성, GitHub App 설치·권한 확장, 유료 플랜, 과금 수단 등록, 도메인/DNS 변경, Production traffic 전환.
- Vercel Production 비활성화/삭제, Vercel의 환경변수·시크릿 삭제.
- 기존 세연 AI `503` Reveal 차단 해제, 메모리 동의/철회·전송 ACK 상태 변경, 결제 웹훅 공개, 유료 구매 활성화, RLS/DB 권한 변경.
- Cloudflare의 개별 호환성 또는 무료 한도 충족을 확인하지 않고 API 전체를 Production-ready로 선언.

문서 안에서 **확인된 사실**은 아래 '1'과 저장소의 정확한 경로로 한정한다. **목표 설계**는 2장 이후에 기술하며 코드를 이미 구현했다는 의미가 아니다. 사용자 인계의 'G0-D04 승인 전 출시 금지'는 독립 Release Gate로 유지한다. 실제 승인 현황은 최신 보안/API/DB 정본에서 다시 확인한다.

## 1. 출발점: 실제 저장소와 플랫폼

| 영역 | 2026-10-20 저장소/계정에서 확인한 사실 | 이관에 미치는 영향 |
|---|---|---|
| GitHub | `main@3f7e31c...` / Node `>=24 <25` / npm workspaces | CI와 변경 기준 SHA 고정 |
| Web | React 19 / Vite 8; `apps/web/vite.config.ts`는 **11개 HTML entry** | **SPA가 아닌 멀티페이지**. 없는 URL에 `index.html`을 무조건 반환하지 않음 |
| Web build | `npm run build:web` → `public/`; `scripts/build-web-static.mjs` + Vite | Static Assets 입력은 우선 `public/` 후보. 빌드 결과만 공개 |
| Vercel | `vercel.json`의 Node API Functions, 15개 rewrites, host redirect, CSP 등 | Worker의 명시적 경로 규칙으로 변환·동등성 검증 |
| API | `api/me.ts`는 `process.env` + `pg` connection pool + 세연 fence; `api/readiness.ts`는 TLS canary | `nodejs_compat`만 켠 채 복사해서 실행해서는 안 됨 |
| Auth | `api/auth/sign-in.ts`가 Naver bridge/social/start rewrite 파라미터에 의존 | callback, state, CSRF, cookie origin, redirect 일치 검증 |
| Saju | `P0-SA-01 DECIDED`: 독립 HTTPS calculation-only producer, Bearer | Workers는 producer를 대체/내장하지 않음 |
| DB | `P0-AUTH-01 DECIDED`: non-BYPASSRLS role + transaction-local canonical subject; TLS verify-full 경계 | 새 Driver/Proxy도 동일 DB 보안 계약 증명 필요 |
| Commerce | Web one-off + PortOne V2 결정, 공개 결제/Reader 활성화 별도 HOLD | Webhook route를 '이관 편의'로 새로 공개하지 않음 |
| Cloudflare | 연결 계정의 Worker scripts **0**, Pages projects **0** (2026-10-20 read-only API 조회) | Worker/preview 실배포는 아직 시작 전 |
| Vercel | 현재 Production을 Cloudflare에서 실측·대체한 사실 없음 | Cloudflare 부재/실패 시 Vercel 경로 그대로 유지 |

**현재 사실 판단의 우선순위**: fresh `main` / 결정 레지스터 / 운영 증거 > 이 문서의 기준시점 snapshot > 오래된 인계 문서. 예: [P0_DECISION_REGISTER.md](./P0_DECISION_REGISTER.md)에서 `P0-AUTH-01`은 현재 `DECIDED`이며, 과거의 OPEN 설명을 다시 적용하면 안 된다.

## 2. 목표 토폴로지와 격리

```text
                           (현재 운영)                   (독립 검증)
브라우저 ─────────────────▶ Vercel Production           Cloudflare Worker preview (*.workers.dev)
                               │                                      │
                       현행 Vercel API                    Workers + Static Assets
                               │                                      │
                    기존 Subject/Auth/API               명시적 /api/* 라우트 + 호환 어댑터
                               │                                      │
                         Supabase DB/Auth  ◀──── (검증된 권한·TLS 경로만; 테스트 owner)
                               │
                    Saju HTTPS calculation producer
                               │
                (이관 단계에서 공개/매출/운영 권한 불변)
```

- Cloudflare는 **실행 위치와 전달계층**만 바꾼다. `auth.users.id ≠ subjects.id`이며, 사용자 소유권·RLS·결제·사주 의미·Reader 지식 권한은 기존 소유자가 유지한다.
- 검증 전 Worker는 정적 UI만 서빙한다. `/api/*`는 알 수 없는 경로를 HTML로 변환하지 않고, 미이관 경로는 명시적으로 차단한다. 초기 프리뷰에서 유효하지 않은 데모 응답을 'API 성공'으로 위장하지 않는다.
- 기존 Production API로의 **암묵적 프록시 금지**. 검증 목적의 프록시가 필요하다면 target/호출 주체/cookie/CSRF/로그·비용·개인정보 경계를 별도 승인하고, 읽기/쓰기 범위를 제한해야 한다.
- 별도 Worker 테스트 주소에 Production 사용자 데이터를 입력하거나 Production 결제·메모리 권한 쓰기를 수행하지 않는다. 검증용 계정 및 안전한 데이터 분리가 확인된 경우에만 해당 테스트를 연다.
- Cloudflare Worker가 속한 계정/도메인과 GitHub 저장소 접근도 최소 권한으로 유지한다.

### 2.1 두 개의 호환 단계

1. **정적 호스팅 단계**: 기존 `npm run build:web` 결과를 동일하게 서빙. CSS·이미지·폰트·상대경로·보안 헤더·캐시·404·HTML entry 검증.
2. **실행 API 단계**: 각 endpoint의 입력·인증·권한·DB/producer·오류·응답 보존을 개별 증명. 일부 API가 통과했다는 이유로 나머지 API가 '이관 완료'가 되지 않는다.

보안 차단 경로는 실행 위치가 바뀌어도 동일 차단을 유지한다.

## 3. Worker/Static Assets 설계

### 3.1 빌드와 리포지토리 배치(미구현 제안)

- Vercel `vercel.json`, 기존 `api/`, `npm run build:web`를 유지한다.
- Cloudflare 전용 설정은 **별도** `wrangler.jsonc` 또는 `wrangler.toml`(구현 시 단일 형식 선택)에 두고, 이름은 `myeongha-preview` 등의 전용 별개 Worker 이름을 제안한다.
- `assets.directory`는 `./public` 후보이고, 빌드 명령은 기존 `npm ci` → `npm run build:web` → 자산 검사. Node 24/npm 버전은 lockfile 및 CI와 맞춘다.
- `assets.html_handling`은 `vercel.json`의 `cleanUrls:false`, `trailingSlash:false`, 11개 HTML 파일의 실측과 맞추어 **검증 후** 값을 결정한다. `none`은 우선 후보이지 확정된 동작이 아니다.
- `assets.not_found_handling`은 SPA fallback을 채택하지 않고 원본의 없는 페이지 `404` 동작을 검증한다. `/chat.html`을 `/chat`으로 몰래 변경하는 정규화 금지.
- API 단계에서 `assets.run_worker_first:["/api/*"]` 후보를 사용하며, 정적 파일과 API 이름 충돌·`Sec-Fetch-Mode` 변형·OPTIONS 요청을 실 배포에서 비교한다.
- SPA/SSG 전용 Cloudflare 샘플 설정을 복사해 멀티페이지 앱에 일괄 적용하지 않는다.

### 3.2 보안 헤더

Vercel `vercel.json`에서 확인된 baseline:
- `Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-Robots-Tag: noindex, nofollow, noarchive`

Workers Static Assets에서는 `_headers`로 정적 응답에 적용할 수 있다. **주의**: 현재 `scripts/build-web-static.mjs`는 확장자 allowlist 방식이라 `_headers`를 기존 앱 폴더에 그냥 추가해도 `public/`에 복사되지 않는다. 구현 시 **명시적 생성/복사 경로**를 만들고 Vite 빌드 후에도 존재하는지 검사한다. Worker API 응답은 Worker 코드에서 각각 동일 기준을 설정해야 한다. CSS/JSON/CSP 버그를 피하려고 전면 헤더를 축소하지 않는다.

HTTP cache: HTML/인증/AI/개인기록/API/결제는 비캐시(`no-store` 등 기존 정책 유지), 해시 자산만 적절히 캐시. `Set-Cookie` 또는 토큰 포함 응답이 CDN에서 캐시되는 사례는 실패 처리.

## 4. Vercel → Worker API 전환 표(초기 inventory)

현재 `vercel.json` rewrite 및 파일에서 확인한 경로를 출발점으로 한다. **실제 method·status·shape는 route별 계약 시험으로 확정**한다.

| 공개 URL/그룹 | 현재 목적지·계약 | Workers 실행 방향 | 사전 조건 |
|---|---|---|---|
| `/api/health` | `api/health.ts` | 최소 health handler 포팅 | HTTP 및 security observability parity |
| `/api/readiness` | `api/readiness.ts` + 보호된 PostgreSQL TLS canary | 독립 보호 endpoint | bearer/TLS verify-full; 미승인 운영 canary 금지 |
| `/api/auth/sign-in`, `/api/auth/social/start` | `api/auth/sign-in.ts`; query marker rewrite | 이름별 router → 기존 auth use-case | CSRF, redirect, cookies, replay 거부 |
| `/api/auth/social/naver/{authorize,callback,token,userinfo}` | Naver bridge marker rewrite | 별도 명시적 matcher | exact action, duplicate marker, OAuth allowlist 검증 |
| `/api/me`, `/api/me/saju/preview-reading` | `api/me.ts`; marker rewrite | 검증된 router/adapters | 동일 owner resolver 및 사주 scope |
| `/api/chat`, `/api/chat/:threadId`, `/api/chat/:threadId/turns` | `api/me.ts`; chat marker rewrite | 단계별 explicit route, 기본 차단 | 세연 최초 Reveal + ACK/기억 철회 승인 전 positive send 금지 |
| `/api/life-record`, `/api/readings`, `/api/memories` | `api/me.ts`; records marker | owner-authorized read | User/Reader 지식 격리와 deny parity |
| `/api/birth-profiles`, `/api/birth-profiles/:id` | `api/birth-profiles.ts`와 id marker | request identity 및 param sanitization | revision/owner/권한 경계 |
| `/api/device-installations/register`, `/api/device-installations/:id/revoke` | `api/me.ts`; action marker | action-specific matcher | 인증/소유권/멱등성 |
| `/api/target-persons`, `/api/target-persons/:id` | `api/me.ts`; read marker | exact route/ID validation | 교차 사용자 접근 거부 |
| `/api/me/saju/calculation` | `api/me/saju/calculation.ts` | producer HTTP bridge | `P0-SA-01` calculation-only, timeout/no redirects |
| PortOne ingress/webhook | provider code 존재, 공개 route 활성화는 별도 상태 | 원본 활성화 상태 그대로(기본 차단) | 결제 authority/서명 검증/서버 lookup/운영 승인 |

구현 시 `api/` 전체 파일 트리 + `vercel.json` + 클라이언트 실제 호출 목록으로 최종 route/method/status matrix를 자동·수동 교차 수립한다. **위 표가 누락 없는 최종 API 계약 목록이라는 주장은 하지 않는다.** Unmatched API `404` 또는 원본에 부합하는 `403/503`를 반환하고 SPA HTML로 fallback하지 않는다.

### 4.1 Vercel host 전용 로직

`vercel.json`의 `myeongha-*-johnny-self.vercel.app` → `myeongha.vercel.app` 조건부 redirect는 Vercel 도메인 전용이다. Cloudflare preview에는 자동으로 이식하지 않는다. 모든 redirect는 host·path·query·credential 전달과 open-redirect를 검증한 뒤 정확히 필요한 것만 재현한다.

## 5. Node.js 런타임 / 환경변수 호환성

Workers는 Vercel Node.js 24 프로세스가 아니다. Node 호환 API가 일부 제공되더라도 모든 socket·TLS·프로세스 전역 상태·stream/cancel semantics·모듈 로딩·의존성이 동등하다고 가정할 수 없다.

필수 호환성 감사:
1. `process.env`, top-level lazy singleton, `Buffer`, `node:crypto`, `node:tls`, `node:net`, `pg`, `@vercel/oidc` 실제 call-site 검토.
2. 요청마다 `env`/bindings 전달 방식, Worker isolate lifecycle, module init 예외·secrets missing의 fail-closed 설계. `process.env` 직렬 복사 금지.
3. AbortSignal, streaming, backpressure, body-size/deadline, cancellation, error map, logging/observability E2E parity.
4. Worker script 번들·startup·CPU/메모리·subrequest 비용의 현장 측정; 큰 모듈은 배포 불가 판정 가능.
5. 스테이징을 포함한 *정확한* 검증 SHA를 기준으로 pass/fail evidence 확보.

### 5.1 PostgreSQL · Supabase

- DB/Auth 데이터와 기존 migrations는 이전하지 않는다. `auth.users.id`를 `subjects.id`로 치환하거나 `service_role`로 user CRUD를 대체하지 않는다.
- 현재 `apps/api/src/node-postgres-subject-pool.ts`의 `pg` Pool / TLS peer verification / dedicated login / `myeongha_api_executor` 및 transaction-local subject context 계약을 읽고, Worker 실행 환경에서 **동등 보안성이 증명된** DB adapter를 구현한다.
- Cloudflare 공식 문서는 Workers PostgreSQL TCP sockets / Hyperdrive / `pg`를 지원한다. 그러나 **가능하다 ≠ 명하의 RLS/strict TLS/연결 정책과 호환성 증명**. 직접 연결과 Hyperdrive를 비교해 인증서, TLS `verify-full`, 커넥션 수, 연결 풀링, transaction pinning, role/subject context, rollback과 예산을 판정한다.
- Hyperdrive 채택은 의무가 아니며 리소스 생성/credential 등록/운영 권한을 자동 승인하지 않는다. 실패하면 Auth/DB 데이터 API를 우회 연결하지 말고 해당 단계 HOLD.
- `MYEONGHA_DATABASE_URL`, `MYEONGHA_DATABASE_PRINCIPAL`, `MYEONGHA_DATABASE_TLS_PEER_MODE`, `MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM`, `MYEONGHA_SUPABASE_URL`, `MYEONGHA_SUPABASE_API_KEY`, `MYEONGHA_GUEST_FINGERPRINT_SECRET` 등의 **키 이름과 소유·회전 절차**를 별도 inventory에만 기록; 값/일부 값/로그/PR/CI output 기재 금지.
- OAuth provider/Supabase 허용 URL은 preview와 production을 분리; wildcard callback 추가를 기본으로 삼지 않는다.

### 5.2 Saju/관상/OpenAI

- 기존 HTTPS Saju calculation-only producer 호출만 허용: Bearer 서버 전용, redirect 미추종, 입력·schema·policy 정합성, upstream 장애 시 fail-closed. Product Reading/interpretation을 계산만으로 승격하지 않는다.
- 관상: 이미지 원본의 ephemeral default, 파일 타입·크기·MIME 검증, 재처리/삭제/로그·cache 차단, 권한 없는 이미지 유출 방지. 사진이 있으면 Workers 메모리/CPU/업로드 스트리밍 예산 검증.
- OpenAI/LLM: 서버 secret, rate/cost governor, prompt-injection 및 output guard, `store:false` 등 현재 사용 중인 provider contract를 유지. Worker에서 호출 가능하다는 사실만으로 세연 AI 출시 승인 불가.
- 외부 provider의 실패·연결 끊김·중복 요청은 원본의 commit/ACK 및 side-effect 멱등성을 유지해야 한다.

## 6. 세연 최초 Reveal·기억 철회·ACK 보안 경계

확인된 current code: `apps/api/src/seyeon-vercel-fetch-reveal-fence-v1.ts`는 Vercel Fetch Response 경계에서 trusted 정적 4xx preflight만 통과시키고 나머지는 `503 SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE`로 보호한다.

Cloudflare 포팅 시 **이름이 Vercel인 guard 파일을 지웠다는 이유로** 첫 assistant payload를 반환하거나 WS/SSE streaming을 켜지 않는다. `503` 의미가 유지되는 플랫폼 독립 interlock을 제안할 수 있지만, 선행 Gate 서명·전송/클라이언트 수신 ACK 경계가 승인되기 전에는 positive first reveal = **false**.

기본 금지:
- 첫 AI 출력의 commit 이전/후 응답·stream·프록시 handoff를 근거 없이 'atomic'으로 선언.
- 메모리 저장·철회 승인과 Context Assembly 제외 타이밍을 임의 변경.
- 수신 ACK 미확인 상태에서 재시도·모델 재호출·중복 관계 이벤트 생성.
- User/Reader cross-grant 접근 또는 guard 이후에 미검증 텍스트 추가.
- `G0-D04` Security/API/DB 기술 승인 없이 사용자 데이터·첫 Reveal을 활성화.

**별도 근거**: `docs/AI_SECURITY_TRUST_BOUNDARY_V1.md`, `docs/READER_RUNTIME_SEYEON_FIRST_RELEASE_GATES_2026-10-09.md`, 현재 보안 승인/이슈 정본. Cloudflare 사용은 이 승인들을 대체하지 않는다.

## 7. 결제·웹훅 불변 조건

- `P0-CM-01`: launch Web one-off; `P0-CM-02`: PortOne V2. 최신 `P0-CM-03`은 개별 판매/Offer/charge activation HOLD를 구분한다.
- 브라우저 redirect/callback은 결제 완료 증거가 아니다. webhook 인증 → 서버 PortOne 결제 조회 → exact amount/currency/product/environment 비교 → verified evidence → 멱등 entitlement 흐름을 보존한다.
- Webhook raw-body bytes, signature, timestamp, replay, IP/CSRF 정책, no-store, request limits, status/retry를 양 런타임에서 동등성 검증. Worker Body/stream을 JSON 파싱 후 검증하는 역순 금지.
- 새 Cloudflare callback URL을 PortOne에 등록하거나 public route를 열기 전에 Commerce/운영별 명시 승인과 실수납/환불 위험 격리 필요.
- Preview에서 실결제/실 Entitlement 수정 금지. 인증 실패/미승인/중복 event는 provider 전달 오류와 내부 상태를 분리해 관측.

## 8. GitHub Builds / Preview / Rollback

- GitHub 원본은 그대로 두고, Vercel 자동배포 규칙을 변경하지 않는다. Cloudflare Builds GitHub 연동 **전** Preview-only 운영 방식과 prod branch auto-deploy 여부를 확인한다.
- 권장: Cloudflare 계정에 전용 Worker를 만들고, Preview branches 만 연결해 독립 주소로 검증. `main` push가 예상 없이 Cloudflare 운영에 배포되지 않도록 deployment policy 확정 전 자동 Production 연결 금지.
- GitHub 권한은 repo 단위로 제한; secret 입력은 Cloudflare의 Variables and Secrets / Secret binding에 별도 등록. `vars` 평문에 secret 넣지 않는다.
- Preview build도 외부에서 접근 가능한 URL을 갖는다고 가정하여 dummy/test identity, noindex, 미승인 API 차단. 공식 Cloudflare preview에도 secrets/bindings/격리 구성을 검증한다.
- Rollback은 Workers version/deployment 기준으로 **검증된 직전 버전**을 선택한다. static asset + Worker/route/secret 참조 불일치가 없는지 되돌린 뒤 재검증. DNS 전환 이후에는 Cloudflare rollback과 Vercel 원복 경로를 별도로 보존한다.
- GitHub Actions의 기존 CI 및 CI Watchtower `ops` Track Key를 재사용; 기존 CI가 검증하지 않는 독립 배포 검증만 최소 별도 workflow를 허용한다.

## 9. Cloudflare 공식 한도 / 비용 가정 (2026-10-20 조회)

| 항목 | Workers Free 기준 | 실행 시 확인 |
|---|---|---|
| Worker 요청 | 100,000/day | UTC reset·요청 유형·호출 패턴 |
| HTTP CPU | 10 ms/request | **Wall time과 다름**; 앱 라우트별 계측 |
| 메모리 | 128 MB/invocation | 이미지·DB driver·bundle |
| 외부 subrequest | 50/request | DB/AI/provider/hop 합산 |
| bundle size | 64 MiB | 정적 자산 파일 수와 별도 |
| Workers 계정 수 | 100 | 현재 프로젝트 수와 별도 |
| Static Assets | 20,000 files/version, 25 MiB/file | 빌드 출력의 실측 |
| Workers Builds | 무료 3,000분/월, 동시 1개, 20분/빌드 | builds와 request quota 분리 |
| Workers Paid | 최저 월 $5 플랜(별도 승인) | 새 과금 전에 공식 가격 재확인 |
| Supabase/OpenAI/PortOne | Cloudflare 포함 비용 아님 | provider 비용과 별도 산정 |

**가격·한도는 작성일 공식 문서 확인값이지 영구 계약이 아니다**. 프런트 정적 자산 요청과 Worker 코드 경유 요청을 구분해 사용량을 기록한다. 무료 계정 CPU 초과/429 시 클라이언트가 재시도 폭주하지 않도록 설계한다.

## 10. 검증 매트릭스 (모든 항목은 증거 기록)

| 구간 | 성공 기준 | 실패/보존 기준 |
|---|---|---|
| Static | 11 HTML entry + CSS/JS/이미지 로드; 404/redirect/header parity | SPA fallback, 민감파일 노출, 보안 헤더 누락 불가 |
| Auth | Guest/Member 로그인·logout·reauth·OAuth state/callback·쿠키 일치 | 위조 owner/cross-origin/CSRF 차단 |
| Database | transaction-local subject + RLS, CA 검증, connection limit | bypass role·connection context bleed 0 |
| Saju | 정확한 policy/version으로 계산-only 결과 parity | producer timeout/failure 시 LLM fallthrough 금지 |
| Face | 업로드/결과/삭제/ephemeral image 계약 | raw image/log/cache 잔존 금지 |
| Character AI | memory consent/revoke/cross-reader·guard·ACK·중복차단 | **미승인 positive Reveal 0; 503 fence 유지** |
| Commerce | signature/raw body/provider lookup/replay·Entitlement parity | 미승인 public webhook/실판매 금지 |
| Runtime | CPU, bundling, memory, API 50 subrequests, 비용 | 무료 한도 초과·알 수 없는 실패는 HOLD |
| Release | exact SHA + current CI + preview URL + smoke + rollback rehearsal | Vercel 장애 유발/DNS 조기 변경 금지 |

테스트 종류: 정상 요청 + 입력 변조/권한 거부 + 취소/timeout/duplicate/retry + origin/host mismatch + rollback 후 세션 복구. 불명확한 status 또는 미승인 경로는 성공으로 수리하지 않고 **fail closed**.

## 11. 결정·승인 표

| Gate | 소유자/증거 | 승인 전 허용 |
|---|---|---|
| CF-ACCOUNT | 사용자: Git 연결, 프로젝트/계정 접근 및 요금/과금 | 읽기 점검·문서·로컬 빌드만 |
| CF-PREVIEW | 사용자: 독립 Worker preview 생성·테스트 도메인 | 별도 브랜치 코드 검토·PR |
| CF-AUTH-DB | Security/API/DB: TLS + subject RLS + OAuth | 정적 서비스 및 mock/negative testing |
| CF-SEYEON-G0 | Security/API/DB: G0-D04, 첫 Reveal/ACK/기억 철회 계약 | 기존 503 HOLD 및 정적 UI |
| CF-COMMERCE | Commerce/Security/운영: webhook·SKU·merchant 승인 | 비활성 라우트와 non-financial mock |
| CF-COST | 사용자: Paid plan/카드/예산 상한 | 무료 한도 안 검증만 |
| CF-CUTOVER | 사용자: DNS/운영 traffic 전환 승인 + 모든 출시 gate PASS | 기존 Vercel Production 유지 |

Gate 별 pass evidence는 정확한 git SHA, Cloudflare Worker version/preview URL, 테스트 방식·일시·환경, 실패 항목, rollback 가능 상태를 포함. 항목 하나가 미증명되면 관련 단계는 HOLD이며 전체 배포 승인으로 자동 전파되지 않는다.

## 12. 미해결 주요 위험과 대안

| 위험 | 1차 조치 | 승인 전 상태 |
|---|---|---|
| Vercel Node runtime과 Workers 비호환 | actual `pg`/TLS/streams/build bundle 실증 | 해당 API 미이관·미활성 |
| Free 10ms CPU 초과 | 정적 우선 + endpoint 계측; 필요 시 상위 플랜 *별도 제안* | 업그레이드 금지 |
| `_headers` 빌드 누락 | allowlist-aware 생성기 + 배포 산출물 검사 | 헤더 parity 전 public preview 보류 |
| 멀티페이지 URL 정규화 | exact path, HTML/404 parity tests | SPA fallback 금지 |
| OAuth/쿠키 host mismatch | preview 전용 허용 URL·테스트 identity | 실제 사용자 로그인 금지 |
| DB connection/TLS 불일치 | 직접 PG vs Hyperdrive 통제 비교 + negative RLS tests | user-data routes HOLD |
| First Reveal fence 우회 | platform-independent outer deny + G0-D04 기술 승인 | positive response HOLD |
| 웹훅 노출/중복 과금 | route-level explicit deny + provider evidence tests | public ingress HOLD |
| GitHub main 자동 이중배포 | Cloudflare preview-only 구성 및 deployment gate | CF Production auto deploy 금지 |
| DNS 전환 후 장애 | Vercel 원복 + versions rollback drill + TTL 계획 | traffic switch 금지 |

## 13. 정본·공식 참조

### 현재 저장소(구현/정책 정본)
- `vercel.json`; `package.json`; `apps/web/vite.config.ts`; `scripts/build-web-static.mjs`
- `api/me.ts`; `api/readiness.ts`; `api/auth/sign-in.ts`; `apps/api/src/node-postgres-subject-pool.ts`
- `apps/api/src/seyeon-vercel-fetch-reveal-fence-v1.ts`
- [P0 Decision Register](./P0_DECISION_REGISTER.md); [AI Security Trust Boundary](./AI_SECURITY_TRUST_BOUNDARY_V1.md)
- [Saju Calculation Ingress](./SAJU_PRODUCTION_CALCULATION_INGRESS_V1.md); [Reader Release Gate](./READER_RUNTIME_SEYEON_FIRST_RELEASE_GATES_2026-10-09.md)
- `docs/COMMERCE_WEB_PSP_DECISION_V1.md`; `docs/COMMERCE_GUEST_PURCHASE_OWNERSHIP_DECISION_V1.md`
- `docs/SAJU_BRIDGE_SINGLE_SUPABASE_INTEGRATION_DESIGN_V1.md`

### Cloudflare (2026-10-20 기준 조회)
- [Workers Free limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Workers Builds pricing/limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)
- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Static Assets routing](https://developers.cloudflare.com/workers/static-assets/routing/)
- [Static Assets `_headers`](https://developers.cloudflare.com/workers/static-assets/headers/)
- [Wrangler config](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Workers Builds/Git branches](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)
- [Worker previews](https://developers.cloudflare.com/workers/previews/)
- [Workers rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
- [Workers Node APIs](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)
- [Workers PostgreSQL](https://developers.cloudflare.com/workers/tutorials/postgres/)
- [Hyperdrive PostgreSQL](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/)
- [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

**결론**: Worker 정적 프리뷰와 이후 API 호환성 검증은 수행할 수 있으나, 이 문서의 채택은 **Production DB/세연 Reveal/결제/Cloudflare Cutover 승인**을 대신하지 않는다.
