# Cloudflare 실제 프리뷰 배포 핸드오프 (2026-10-20)

> 작업 저장소: `gycha0109-beep/MyeongHa`  
> 대상 구현: [PR #2384](https://github.com/gycha0109-beep/MyeongHa/pull/2384) (`feat/ops/cloudflare-static-preview-20261020`, **draft, 미병합**)  
> 참조 설계: [PR #2381](https://github.com/gycha0109-beep/MyeongHa/pull/2381) (미병합)  
> 상태: **GitHub CI의 Wrangler workerd 로컬 검증 PASS. Cloudflare 실제 프리뷰 배포 불가 — 계정 GitHub 연결 및 workers.dev 미초기화.**

## 1. 실제 Cloudflare API 확인 결과

2026-10-20 Cloudflare 연결된 사용자 계정에 읽기/쓰기 API로 확인한 결과:

- Workers script: **0개** (Cloudflare REST `GET /accounts/{account_id}/workers/scripts` 성공).
- Workers Builds 토큰: **0개** (`GET /accounts/{account_id}/builds/tokens` 성공).
- `workers.dev` 계정 서브도메인: **없음** (`GET /accounts/{account_id}/workers/subdomain`: 404/10007, Cloudflare의 최초 Workers & Pages 페이지 진입 안내).
- `gycha0109-beep/MyeongHa` GitHub 저장소 연결 시도: `PUT /accounts/{account_id}/builds/repos/connections`에서 **404/8000008 Git account disconnected**, 저장소 연결 미생성.
- `GET /accounts/{account_id}/builds/account/limits`: build minutes 제한 소진 아님.
- 따라서 실제 Worker 생성/배포/원격 URL 획득/HTTP 실측은 **수행되지 않았음**. 외부 DNS/Vercel/결제/secret 변경 0.

위 장애는 빌드 코드 실패가 아니라 **Cloudflare 계정 최초 초기화 + Cloudflare GitHub App 계정 승인**에 필요한 절차임. 승인 없이 API로 GitHub App 설치를 대신하거나 거짓 성공을 기록하지 않는다.

## 2. 사용자 계정에서 반드시 필요한 최초 작업(1회)

Cloudflare 대시보드 [Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages)에 진입해 해당 계정의 Workers 화면을 열어 `workers.dev` 서브도메인을 초기화한다. 도메인 이름은 운영 도메인에 영향을 주지 않는 계정 전용 이름을 선택한다.

이어서 Cloudflare의 Worker **Settings → Builds → Connect → GitHub** 또는 **Create application → Import Git repository → GitHub** 경로를 열어 **Cloudflare Workers and Pages GitHub App** 설치/연동을 승인하고, 저장소 접근 대상에 **`gycha0109-beep/MyeongHa`만 선택**한다. 이는 계정/리포지터리 OAuth/App 설치 동의이므로 사용자가 GitHub/Cloudflare UI에서 직접 수행해야 한다. GitHub 앱 설치 상태는 [GitHub 설치 관리](https://github.com/settings/installations)에서 확인할 수 있다.

계정 초기화/앱 설치 전에는 자동 Build 토큰 발급 및 저장소 연결이 실패할 수 있으며, 민감 정보를 챗/커밋에 복사하지 않는다.

## 3. 배포 설정(초기화 완료 후 적용)

| 항목 | 값 / 제한 |
|---|---|
| Workers 이름 | `myeongha-static-preview` (기존 `wrangler.jsonc` 일치 필수) |
| 저장소 | `gycha0109-beep/MyeongHa` |
| 소스 / 검증 브랜치 | `feat/ops/cloudflare-static-preview-20261020` |
| 빌드 환경 | Node 24 |
| 설치 | `npm ci --ignore-scripts --no-audit --no-fund` |
| Build 명령 | `npm run build:cloudflare:static` |
| Preview 명령 | `npx --yes wrangler@4.151.2 preview` |
| 실제 운영 Deploy | **비활성 / HOLD**. `wrangler deploy`를 이관 완료 전 실행하지 않음 |
| 배포 설정 | 루트 `wrangler.jsonc` / `public/` Static Assets |
| 프리뷰 노출 | 필요 시 계정의 Access로 제한하고 외부 공개 전 404/503 deny 확인 |
| 시크릿 및 변수 | 0개 (Supabase/PortOne/OpenAI/Saju 비연결) |
| DNS, Vercel Production | 변경 금지 |
| 결제/Reader/세연 first Reveal | 보안 게이트 지속 HOLD |

**주의:** Workers Builds의 'production branch'는 해당 Cloudflare 프리뷰 전용 프로젝트에서도 Production 배포를 유발한다. 실제 계정 연결 직후 자동배포를 허용하지 말고 프리뷰 브랜치 동작/배포 명령을 검토한다. GitHub PR을 기존 Vercel 운영에 병합하지 않는다.

## 4. 검증에 쓰는 GitHub CI의 확정 결과

- `npm run build:web` 이후 `scripts/prepare-cloudflare-static.mjs`와 `verify-cloudflare-static.mjs`: HTML 11개, 정적 파일 185개, 최대 281,150 byte, CSP 파생·`_redirects` 생성과 파일 크기 경계 PASS.
- `wrangler dev` **4.151.2**, 로컬 workerd 실제 HTTP smoke: HTML 11개 PASS, 미이관 API `404`, `POST /api/chat/:id/turns` **503** 및 고정 error code PASS.
- Cloudflare 전체 시스템/원격 라우팅/실사용 브라우저 성능/원격 worker preview 검증은 **미수행**.
- 기존 `Web PR Domain Gates` 실패는 일본어/중국어 `aria-label`에 남은 한국어 `밤 화면으로 전환`에 기인. 이관 프리뷰와 무관한 기존 웹 i18n 문제로 별도 수정을 요함.

## 5. 원격 프리뷰가 생긴 뒤 실측해야 하는 항목

1. Cloudflare에서 실제 발급한 **프리뷰 URL**을 공식 UI/API로 취득하여 기록. URL을 추측해 만들지 않는다.
2. HTML 11개: 200, content-type HTML, CSP/Vercel parity, `X-Robots-Tag=noindex`, 보안 헤더.
3. `GET /`: 200/HTML, `/missing-page.html`: **404, SPA fallback 200 금지**.
4. `GET /api/health`, `GET /api/unknown`, `POST /api/auth/sign-in`: **404**. 기능적 API가 아직 없는 프리뷰다.
5. `POST /api/chat/synthetic-thread/turns`: **503 SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE**; response body에 assistant 생성 결과 없음.
6. 일반 브라우저 console/network에서 secret, 외부 API, Set-Cookie, 로그인 정보, 미승인 캐시 노출 없음 확인.
7. 원격 배포 artifact 기준 파일 수/크기/Worker CPU·요청 수 점검 후 새 기능을 한 엔드포인트씩 gate 검증.
8. 이관 실패 시 **프리뷰만 폐기 가능**, Vercel Production/DB/도메인 원상태 유지.

공식 근거: [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/), [Workers Builds API prerequisites](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/), [workers.dev 서브도메인](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/), [Preview](https://developers.cloudflare.com/workers/previews/).
