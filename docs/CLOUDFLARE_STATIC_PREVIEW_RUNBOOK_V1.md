# Cloudflare 정적 프리뷰 구현·검증 실행 안내 (v1, 2026-10-20)

> 작업 브랜치: `feat/ops/cloudflare-static-preview-20261020`  
> 참고 설계/로드맵: [문서 PR #2381](https://github.com/gycha0109-beep/MyeongHa/pull/2381)  
> 현재 범위: **로컬 정적 빌드 및 API deny-only Worker 코드**. 계정/사이트/실제 Cloudflare 배포 미실시.

## 바로 실행할 수 있는 명령 (Node 24, npm)

1. `npm ci --ignore-scripts --no-audit --no-fund`
2. `npm run test:cloudflare:static` — Worker API 거부, 세연 최초 Reveal 503, CSP 생성·변조 거부, 정적 산출물 검사 단위 테스트.
3. `npm run build:cloudflare:static` — **기존** `npm run build:web` 그대로 실행 → `public/_headers` 생성 → 11 HTML, 파일 한도, 보안 헤더 검증.
4. `npm run verify:deployment-config` — 기존 Vercel 배포 산출물 회귀 검증. `_headers`는 Cloudflare 용도로만 생성되므로 이 단계는 별도로 PASS 여부 판단.

이 PR은 `wrangler` 패키지 또는 Vercel의 배포 설정을 추가/교체하지 않는다. 다음 단계에서 사용할 정확한 Wrangler v4 버전을 잠금 파일에 고정하고 실제 `wrangler dev`/Worker runtime smoke를 실행해야 한다. **현재 단계에서 진짜 Workers 런타임이 통과했다고 주장하지 않는다.**

## 설계한 배포 경계

- `wrangler.jsonc`: `assets.directory=./public`, `html_handling=none`, `not_found_handling=none`, `run_worker_first=["/api", "/api/*"]`.
- Worker `workers/cloudflare-static-preview.mjs`: 새 Cloudflare 실행 환경에 대한 **deny-only** handler. 모든 `/api/*`의 positive response는 아직 허용하지 않음. `POST /api/chat/:threadId/turns`는 `503 SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE`; 다른 API는 `404`; 자산 미일치 URL도 `404`.
- `workers_dev=false`: 운영 Worker 기본 공개 서브도메인 자동 노출을 피함. `preview_urls=true`는 승인 후에만 계정을 통해 배포될 미리보기 경로용; 프리뷰도 외부 접속 가능성으로 취급.
- 정적 파일은 Worker 코드보다 자산 우선순위로 제공되어 API용 CPU와 혼동하지 않는다. **아직 Cloudflare에서 실제 라우팅을 실측하지 않았다.**
- `scripts/prepare-cloudflare-static.mjs`: 현재 `vercel.json`의 전역 5개 보안 헤더를 strict validation 후 `public/_headers`에 복제. CSP 약화·헤더 누락·변조·중복이면 빌드 실패.
- `scripts/verify-cloudflare-static.mjs`: 11 HTML, 전체 정적 파일, Cloudflare 설정, 보안 헤더, `source.map`/시크릿 파일 금지, Workers Free 정적 파일 수/크기를 점검.
- `public/`는 빌드 산출물이며 Git에 넣지 않는다. 실제 HTML 화면·헤더·캐시는 Worker 프리뷰 이후 브라우저에서 재검증.

## 고의적으로 하지 않은 작업

1. `vercel.json`, 기존 `api/`/DB/보안 로직, 환경변수/secret, GitHub Actions workflow, Supabase 설정 미변경.
2. 외부 API 프록시, OAuth callback 재설정, Saju producer 재호스팅, 관상 이미지 전달, OpenAI 호출, 결제 웹훅 공개 **없음**.
3. 세연 first Reveal의 `503` guard/G0-D04, 메모리 철회·수신 ACK, Reader grant를 느슨하게 하지 않음.
4. GitHub 저장소를 Cloudflare Builds에 연결하거나 Cloudflare Worker를 생성하지 않음.
5. Wrangler 배포 검증/실제 11페이지 브라우저 렌더링/CPU·메모리/요청량 실측을 완료했다고 선언하지 않음.

## 검증 시나리오(후속 런타임 단계)

| HTTP 입력 | 현재 설계 예상 결과 | 다음 단계 증명 |
|---|---|---|
| `GET /`, `GET /index.html` | 정적 index 제공 | MIME/CSP/cache/브라우저 캡처 |
| `GET /chat.html`, `/face-reading.html` 등 11개 | 같은 경로의 HTML 제공 | Vercel과 정적 자원/상대경로 parity |
| `GET /missing-page.html` | 404 | SPA fallback 금지 |
| `GET /api/health` | 404 (미이관) | Worker 우선 처리 |
| `POST /api/auth/sign-in` | 404 (미이관) | credentials/user-data 호출 0 |
| `POST /api/chat/thread/turns` | 503 fixed JSON | protected assistant body 0 |
| `GET /api/unknown` | 404/no-store | 정적 HTML 노출 0 |
| 쿠키/헤더/기밀 파일 | static/cdn에 응답·cache 되면 안 됨 | 실제 브라우저/HTTP negative 검사 |

## 다음 실제 작업

1. Node24 환경에서 `npm run test:cloudflare:static`과 `npm run build:cloudflare:static`을 실행하고 정확한 SHA의 CI 결과를 확인한다.
2. 파일 용량/정적 라우팅 등의 출력 기록을 근거로 문제만 수정한다.
3. Cloudflare 전용 Wrangler v4를 pinned dependency로 등록해 실제 `wrangler dev` local HTTP parity 검사.
4. 사용자에게 계정 내 전용 Worker 및 GitHub preview 연동에 관한 명시 승인 범위가 정해질 때에만 Cloudflare 리소스 생성·배포를 실행한다.
5. 이후부터 기존 로드맵대로 health + router, Auth/DB, Saju/Face, AI/Commerce 독립 승인 단계를 밟는다.

## 사용자 보고

- 한 작업: 실제 수정·검증 결과만.
- 남은 작업: 아직 수행하지 않은 주요 항목.
- 다음 작업: 바로 이어지는 로드맵 작업.
- 승인/차단: 외부 계정/과금/보안/운영 변경 승인 필요 시에만.
