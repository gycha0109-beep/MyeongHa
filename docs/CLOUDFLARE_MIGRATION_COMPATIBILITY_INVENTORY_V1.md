# Cloudflare 이관 호환성 인벤토리 v1 (2026-10-20)

> 대상: `gycha0109-beep/MyeongHa` / 조사한 기준 `main@afd500c5f8638517ea24b430be736057c7a0aa6e`  
> 상태: **기존 코드·배포 설정 기반 inventory**. 실제 Worker 프리뷰, 런타임 호환성, Production 동등성은 아직 PASS가 아님.  
> 설계/로드맵: [설계 PR #2381](https://github.com/gycha0109-beep/MyeongHa/pull/2381) (미병합)  
> Track Key: `ops`

## 1. 확인한 직접 API 엔트리(12개)

| 엔트리 | 현재 코드 | Workers 호환성 위험 / 실행 단계 |
|---|---|---|
| GET `/api/health` | `api/health.ts` | security observability wrapping; 기본 HTTP 단계 |
| `/api/readiness` | `api/readiness.ts` | 비공개 POST TLS canary + pg + Bearer; 공개 health와 분리 |
| `/api/session/bootstrap` | `api/session/bootstrap.ts` | Guest TTL/남용 방어, Auth 단계 |
| `/api/auth/sign-in` | `api/auth/sign-in.ts` | Member 로그인 + 소셜 OAuth 브리지, Auth 단계 |
| `/api/auth/sign-up` | `api/auth/sign-up.ts` | 회원 가입, Auth 단계 |
| `/api/auth/sign-out` | `api/auth/sign-out.ts` | Supabase 로그아웃, Auth 단계 |
| `/api/auth/refresh` | `api/auth/refresh.ts` | Session 연장/쿠키, Auth 단계 |
| `/api/auth/promote-guest` | `api/auth/promote-guest.ts` | Guest→Member canonical subject 유지, Auth/DB 단계 |
| `/api/birth-profiles` | `api/birth-profiles.ts` | pg/TLS/정확한 owner, DB 단계 |
| `/api/me` | `api/me.ts` | pg와 chat/records/target-person/AI 연동, 단계별 Gate |
| `/api/me/birth-profile` | `api/me/birth-profile.ts` | 현재 subject birth, DB 단계 |
| `/api/me/saju/calculation` | `api/me/saju/calculation.ts` | 승인된 HTTPS calculation-only Saju producer, Saju 단계 |

이 목록은 `main` Git 트리의 `api/**/*.ts` 직접 엔트리 파일을 확인한 결과다. 임의의 파일명만으로 새 public API를 추가하지 않는다.

## 2. Vercel rewrites: 17개 원본 기준 전체 목록

| # | 공개 경로 | 현재 Vercel 함수/marker | Workers 설계 판단 |
|---:|---|---|---|
| 1 | `/api/auth/social/naver/authorize` | `sign-in?__myeongha_naver_oauth_bridge=authorize` | Auth HOLD; exact action |
| 2 | `/api/auth/social/naver/callback` | `sign-in?__myeongha_naver_oauth_bridge=callback` | Auth HOLD; OAuth state/redirect |
| 3 | `/api/auth/social/naver/token` | `sign-in?__myeongha_naver_oauth_bridge=token` | Auth HOLD; 서버 secret |
| 4 | `/api/auth/social/naver/userinfo` | `sign-in?__myeongha_naver_oauth_bridge=userinfo` | Auth HOLD; token exposure 방어 |
| 5 | `/api/auth/social/start` | `sign-in?__myeongha_social_auth_start=1` | Auth HOLD |
| 6 | `/api/me/saju/preview-reading` | `me?__myeongha_saju_preview_reading=1` | Reading authority 독립 유지 |
| 7 | `/api/chat` | `me?__myeongha_chat_open=1` | Auth + Thread owner |
| 8 | `/api/chat/:threadId/turns` | `me?__myeongha_chat_turn_send=1&__myeongha_chat_thread_id=:threadId` | **AI first-reveal 503 HOLD** |
| 9 | `/api/chat/:threadId` | `me?__myeongha_chat_thread_id=:threadId` | Chat read owner |
| 10 | `/api/life-record` | `me?__myeongha_records_read=life-record` | Subject private read |
| 11 | `/api/readings` | `me?__myeongha_records_read=readings` | Reading product scope |
| 12 | `/api/memories` | `me?__myeongha_records_read=memories` | Consent/retraction read |
| 13 | `/api/birth-profiles/:id` | `birth-profiles?__myeongha_birth_profile_id=:id` | Revision/owner authorization |
| 14 | `/api/device-installations/register` | `me?__myeongha_device_installation_action=register` | Subject/device authorization |
| 15 | `/api/device-installations/:id/revoke` | `me?__myeongha_device_installation_action=revoke&__myeongha_device_installation_id=:id` | Device revoke |
| 16 | `/api/target-persons` | `me?__myeongha_target_person_read=list` | Target person owner |
| 17 | `/api/target-persons/:id` | `me?__myeongha_target_person_read=detail&__myeongha_target_person_id=:id` | Detail cross-user deny |

**이관 첫 Worker는 위 29개 표기 경로 전체에 대해 API 성공 응답을 제공하지 않는다.** 직접 엔트리/rewrites의 `/api/*` 영역을 deny-only로 묶는다. 다음 별도 단계에서 endpoint 단위로만 positive admission을 허용한다.

## 3. 정적 빌드 계약(실제 확인)

- `package.json`: Node `>=24 <25`, npm workspaces; `npm run build:web`는 `scripts/build-web-static.mjs` 다음 Vite build.
- `apps/web/vite.config.ts`: `public/`에 `emptyOutDir:false`로 **멀티페이지** 빌드. HTML entries: `index.html`, `hall.html`, `auth.html`, `birth.html`, `chat-hub.html`, `chat.html`, `my.html`, `reading.html`, `face-reading.html`, `reading-detail.html`, `records.html`.
- `vercel.json`: `buildCommand: npm run build:web`, `outputDirectory: public`, `cleanUrls:false`, `trailingSlash:false`, Vercel host 기반 redirect, 전역 CSP/보안 헤더.
- `scripts/build-web-static.mjs`: source file extension allowlist에 **`_headers`가 없음**. Vite 후 별도 생성 필요.
- Cloudflare 전용 설계: `assets.directory: ./public`, `html_handling:none`, `not_found_handling:none`, `run_worker_first:["/api","/api/*"]`. `none` 선택으로 원래 명시적인 `.html` 경로를 보존하고, 누락 경로의 SPA 200 fallback을 막는다. **클라우드 실측 전 후보**.

## 4. 실행 위험 / 다음 소유자

| 표면 | 확인한 근거 | 무엇을 검증해야 하는가 |
|---|---|---|
| `process.env` | `api/me.ts`, Auth handler, Saju handler | Worker `env`/secrets로 안전하게 주입할 수 있는가 |
| `pg`/직접 TLS | `apps/api/src/node-postgres-subject-pool.ts`, `api/readiness.ts` | CA peer verify-full, non-BYPASSRLS role, transaction-local `subjects.id` 격리 |
| Direct Saju API | `docs/P0_DECISION_REGISTER.md`의 P0-SA-01 | 기존 HTTPS Bearer + 계산 전용, version/redirect/timeout |
| First Reveal | `apps/api/src/seyeon-vercel-fetch-reveal-fence-v1.ts` | 미승인 assistant first body 503 차단, ACK/기억 철회 |
| OAuth | `api/auth/sign-in.ts`, Vercel Naver rewrites | state/CSRF/cookie/SameSite/redirect host parity |
| PortOne | Commerce 결정/운영 트랙 | webhook raw bytes, 서버 조회/검증/멱등 entitlement; 공용 경로 미승인 |
| Browser | `apps/web/src`, `apps/web/api-envelope.js`, 각 runtime client | HTTP shape/status/쿠키/캐시와 실제 URL 호출 경로 교차 검증 |

**정직한 한계**: 모든 client-side fetch call-site의 동적 URL 변형, 개별 API 허용 HTTP method/status, 이미지 업로드 런타임 및 Cloudflare CPU/네트워크 성능은 아직 계측하지 않았다. 후속 Auth/DB/Face 단계에서 해당 기능별 route matrix를 더 좁혀 갱신한다. 기존 차단 정책과 충돌하는 '샘플 API 성공'을 구현하지 않는다.

## 5. 바로 이어서 실행하는 코드 범위

1. **Cloudflare 전용** config/최소 Worker/Headers 생성/검증 파일 추가. Vercel 파일·빌드는 변경하지 않음.
2. Node 표준 라이브러리 기반 실패 경계/헤더 검사 추가. 실제 Worker 런타임과 11개 HTML 검증은 Node24 + Wrangler 환경이 갖춰질 때 실행.
3. Cloudflare 계정 Worker 생성/GitHub 연동/프리뷰 리소스 등록과 운영·DNS·비용 변경은 별도 승인 전 HOLD.
4. 다음 API 단계는 기존 Source owner/Auth/Commerce/AI gate를 훼손하지 않도록 **denial → handler별 positive verification**으로 진행.

관련 Cloudflare 문서: [Static Assets](https://developers.cloudflare.com/workers/static-assets/), [Wrangler assets 설정](https://developers.cloudflare.com/workers/wrangler/configuration/#assets), [Static Assets headers](https://developers.cloudflare.com/workers/static-assets/headers/).
