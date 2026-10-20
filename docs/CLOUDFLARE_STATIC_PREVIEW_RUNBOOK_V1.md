# Cloudflare 정적 프리뷰 + 기본 API 라우터 실행 안내 (2026-10-20)

> 저장소: `gycha0109-beep/MyeongHa` / [구현 PR #2384](https://github.com/gycha0109-beep/MyeongHa/pull/2384) (**Draft, 미병합**)  
> 참조: [이관 로드맵 PR #2381](https://github.com/gycha0109-beep/MyeongHa/pull/2381)  
> Cloudflare 단일 Worker 프로젝트: **`myeongha`** (운영 도메인은 여전히 Vercel)  
> 현재 범위: 로드맵 1~4단계, Static Assets 11개 + 유일한 공개 liveness `GET /api/health`.

## 검증 및 재현 (Node 24, GitHub CI)

1. `npm ci --ignore-scripts --no-audit --no-fund`
2. `npm run test:cloudflare:static`: 모든 직접 엔트리 12개/rewrites 17개 경로 분류와 권한 차단, health `200/405`, readiness `404`, 세연 `503`, CSP·헤더·파일 검증.
3. `npm run build:cloudflare:static`: 웹 기존 11 HTML 빌드 → `public/_headers`·`_redirects` 생성 → 전체 정적 자산/파일 노출/헤더 정책 검사.
4. `npm run verify:cloudflare:local`: `wrangler@4.151.2`를 CI에서 일회성 설치한 **실제 workerd 로컬 HTTP 검사**. AWS/Cloudflare credential 불필요, 외부 배포 없음.
5. `node scripts/verify-cloudflare-preview-remote.mjs`: 실제 배포된 Cloudflare Preview URL에서 HTTPS 경로·보안 헤더·차단 정책 검사. PR에 있는 `Cloudflare Preview Remote Smoke` Workflow가 자동 실행한다.
6. `node scripts/verify-cloudflare-preview-browser.mjs`: Actions Runner Headless Chrome으로 원격 11개 화면 렌더링 검사.
7. `npm run verify:deployment-config`: 기존 Vercel 배포 구조 회귀 검사. Vercel 설정은 바꾸지 않는다.

## 운영/프리뷰 격리

- Cloudflare Worker `myeongha`: `wrangler.jsonc`의 `workers_dev=false`, `preview_urls=true`, `previews={}`.
- Production Worker URL은 Cloudflare API에서 **disabled**, Preview URL만 enabled.
- GitHub Branch Preview: `feat/ops/cloudflare-static-preview-20261020`; 빌드 `npm run build:cloudflare:static`, Publish `npx wrangler preview`.
- 정적 자산 `./public`, `html_handling:none`, `not_found_handling:none`, `run_worker_first:['/api','/api/*']`; `/`만 `/index.html`로 200 rewrite.
- 보안 헤더 `public/_headers`는 **Vercel `vercel.json`에서 5종을 정확히 생성**. Worker API 응답은 별도 명시된 동일 보안 헤더와 `no-store` 사용.
- Workers.dev Preview는 Cloudflare가 `X-Robots-Tag: noindex`로 응답을 덮어쓴다. 그 경계만 원격 검사에서 허용하고 나머지 헤더는 exact Vercel policy를 요구한다.
- 프리뷰 URL: https://feat-ops-cloudflare-static-preview-20261020-myeongha.gycha0109.workers.dev
- 사용자 로그인/토큰/DB·Saju producer/OpenAI·PortOne secret **전달·보관하지 않음**.

## 단계 4 공개 API와 거부 계약

| HTTP | Cloudflare Preview 기대값 | 근거/제한 |
|---|---|---|
| `GET /`, `GET /index.html` 및 11개 HTML | 200 HTML | 보안 헤더 / 캐시 no-store |
| `GET /api/health` | 200 `{"status":"ok"}` | **유일한 공개 positive API**. 서비스/DB readiness를 나타내지 않음 |
| `POST/HEAD/OPTIONS/PUT/DELETE /api/health` | 405 `Allow: GET` | CORS 허용하지 않음 |
| `GET /api/health?...` 및 인코딩/슬래시 변형 | 404 | rewrite marker/중복·변조 불수용 |
| `GET/POST /api/readiness` | **404** | Vercel의 비공개 Postgres TLS Canary는 절대 호출하지 않음 |
| `GET/POST /api/auth/*`, `/api/me/*`, 기존 rewrites | **404** | 12 direct + 17 rewrite는 명시적 matcher로 분류하되 승인 없이 dispatch 금지 |
| `POST /api/chat/:threadId/turns` | **503 `SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE`** | 세연 최초 Reveal HOLD 유지 |
| `GET /api/chat/:threadId/turns` | 404 | 차단 우회 금지 |
| 존재하지 않는 HTML, unknown `/api/*` | 404 | SPA fallback 200 금지 |

별도 보안 경계: marker query parameter를 사용한 handler spoofing, CORS preflight, method mismatch, URL 인코딩·추가 세그먼트와 비공개 TLS canary 접근 모두 거부. 405는 공개 health에서만 허용한다.

## 확인된 실행 기록 및 후속 승인

- 로컬 정적 파일: 11 HTML / 185 files / 최대 281,150 bytes, 원격 정적 브라우저 11개 PASS.
- 기존 Stage 3 원격 [HTTP 21개·Chrome 11개 검증 성공](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39433142823).
- Stage 4 원격 [HTTP 55개·Chrome 11개 검증](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39436910190): `GET /api/health` 200 / 메서드 405 / readiness 404 / 세연 503.
- 검증 완결 판단은 **최신 PR SHA의 전체 CI 결과**를 포함하여 내린다.

**금지:** PR 자동병합, `wrangler deploy`(운영), Vercel/DNS 전환, Auth/DB 연결/secret 등록, RLS 완화, Saju producer 인증 우회, 세연 AI positive Reveal, 결제 웹훅/판매 활성화.

**다음 단계:** 로드맵 5단계(Auth/DB)에서 OAuth·session/guest subject·TLS verify-full·unprivileged DB role·RLS·cookie 경계를 별도 권한 승인 및 격리된 E2E로 확인한다. 이를 충족하지 않으면 Auth/DB 경로는 404 HOLD로 유지한다.
