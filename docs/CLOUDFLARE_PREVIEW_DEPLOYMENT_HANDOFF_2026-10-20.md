# Cloudflare 프리뷰 배포·실측 검증 결과 (2026-10-20)

## 로드맵 4단계 후속 실행 증거 (API Health/라우터)

- **추가한 공개 경로는 단 하나:** `GET /api/health → 200 {"status":"ok"}` (DB·Auth·Saju·AI와 무관한 정적 liveness).
- health의 POST/PUT/DELETE/OPTIONS/HEAD: `405 Allow: GET`, `Cache-Control: no-store`; query marker/URL 변형은 404로 거부.
- **`/api/readiness`와 사설 Postgres TLS Canary는 GET/POST 포함 모두 404 HOLD**, 인증·회원 데이터/기록/사주 계산도 404.
- Vercel 12 직접 API 경로와 17 재작성 경로를 `workers/cloudflare-api-router.mjs`에서 1:1 매칭하고 내부 query marker 위조·중복값을 handler로 전달하지 않음. 세연 최초 `POST /api/chat/:threadId/turns`는 503 HOLD 유지.
- 원격 [Cloudflare Preview HTTP/Chrome 실행 #39436910190](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39436910190): 실제 HTTPS **55개 요청 PASS, 실패 0**, Chrome 11개 화면 PASS. `GET /api/health` 200, 나머지 메서드 405, readiness 404, 세연 503 확인.
- 기존 `workers.dev` 운영용 경로는 계속 **비활성화**; Preview URL만 활성화. PR Draft/미병합.
- **다음 단계 5:** Auth/DB 격리 이관. Security/API/DB 승인 및 secret·OAuth callback·RLS/TLS 검증 전에는 보호된 positive API 허용 금지.


## 현재 기준

- Cloudflare Worker 프로젝트: **`myeongha`**. 본 이관의 정식 프로젝트 이름이며 다시 만들지 않는다.
- 배포 출처: `gycha0109-beep/MyeongHa` / `feat/ops/cloudflare-static-preview-20261020` ([구현 PR #2384](https://github.com/gycha0109-beep/MyeongHa/pull/2384), **Draft/미병합**).
- 실제 배포 프리뷰: **https://feat-ops-cloudflare-static-preview-20261020-myeongha.gycha0109.workers.dev**
- Cloudflare `workers.dev` 운영용 경로: **disabled** (`enabled=false`); **preview only** (`previews_enabled=true`). 운영 DNS/Vercel/Supabase/AI/PortOne 미변경.
- Cloudflare 빌드 설정: `npm run build:cloudflare:static`; 작업 브랜치 Preview는 `npx wrangler preview`. 프리뷰는 **정적 화면 + API deny-only**이며 실제 기능 API를 사용할 수 없다.

## 실행 이력과 원인

1. Cloudflare 초기 `main` 빌드 `b969abc1`: `npm run build:cloudflare:static` 스크립트가 `main`에 아직 없어 실패. **이관 PR을 운영 `main`에 병합하지 않는다.**
2. 작업 브랜치 `wrangler.jsonc`를 Cloudflare Worker `myeongha` 이름에 정렬하고 `"previews": {}`를 추가: 프리뷰 전용 배포 성공.
3. `workers.dev` 프리뷰 URL만 활성화하고 운영 경로는 계속 차단함.
4. Cloudflare API에서 Worker Preview URL 및 배포 기록 확인. 이후 GitHub Actions 기반의 **실제 원격 HTTP + Headless Chrome** 검증 추가.
5. 처음 원격 검사에서 `X-Robots-Tag`가 21개 응답 모두 **`noindex`**로 나옴. 이는 Workers.dev 프리뷰에 Cloudflare가 자동 적용하는 값으로 [공식 문서](https://developers.cloudflare.com/workers/previews/custom-domains/#protect-preview-content)에서 확인. **Vercel 보안 정책 변경 없이** 원격 프리뷰에서만 이 동작을 허용하도록 검사 수정.
6. 최신 원격 실측 [GitHub Actions 성공 실행 39431693825](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39431693825), 커밋 `a3fab7efa2c494d707c010f320fdf8e46aac37fe`:
   - 원격 HTTPS 요청 **21개 PASS, 실패 0건**.
   - `GET /` 및 HTML **11개 모두 HTTP 200**, MIME/기본 HTML 형태 확인.
   - Vercel 기준 CSP, Referrer-Policy, X-Content-Type-Options, X-Frame-Options parity 및 Preview 강제 `noindex` 확인.
   - HTML/no-store, API/no-store, `Set-Cookie` 부재 확인.
   - 존재하지 않는 경로 및 미이관 API `404`, 응답 본문 비공개.
   - `POST /api/chat/synthetic-thread-id/turns` `503 SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE`; GET 같은 경로 `404`.
   - 실제 Chrome 브라우저에서 **11개 HTML 페이지의 DOM 렌더링 성공**, 실패 0건.
7. 별도 Web PR Domain Gates에 기존 일본어/중국어 테마 접근성 레이블 `밤 화면으로 전환` 번역 누락이 있어 코드·단위 테스트 보강. 해당 수정의 최종 CI 결과는 정확한 최신 PR SHA로 별도 확인할 것.

## 검증 범위와 제외 범위

| 경계 | 현재 결과 |
|---|---|
| Cloudflare 계정 및 GitHub 연동 | 완료 |
| Cloudflare 프리뷰 배포 | 완료 |
| 원격 HTTP 21개 검사 | PASS |
| Chrome 실제 화면 11개 진입·렌더링 | PASS |
| Worker 로컬 런타임 `wrangler dev` 4.151.2 | PASS (이전 CI) |
| 인증/DB/API 실제 이관 | **미착수** |
| 사주 producer/관상 업로드/AI/결제 운영 | **미승인·비활성** |
| 로그인·회원 개인정보·전체 사용자 흐름 E2E | **미검증** (의도적 API 차단) |
| Vercel 운영 DNS 전환 | **미실행** |
| 실제 접근 제어(Cloudflare Access) | **OFF**, 프리뷰 URL 외부 공개 상태 (데이터/API 없음) |
| 기존 GitHub Web Domain Gate | 테마 i18n 누락 수정을 추가했으며 최신 CI 추적 필요 |

## 다음 단계

1. 최신 SHA에서 원격 55개 HTTP / Chrome 11개 / 전체 CI·Governance·Mobile·Web 검사를 확인하고 기술 증거를 고정한다.
2. [설계/로드맵 PR #2381](https://github.com/gycha0109-beep/MyeongHa/pull/2381)의 순서에 따라 **기본 라우터와 Health 기능의 격리 이관**을 별도 승인·회귀 경계 아래 진행한다.
3. 인증·DB, 사주·관상, AI·결제는 상호 분리된 단계로 이관하고 운영 트래픽 전환 전에 회귀/보안/데이터 승인 절차를 거친다.
4. 새 Worker를 만들거나 `main`에 프리뷰 구현을 병합해 운영 배포하지 않는다.

참고: [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) · [Previews](https://developers.cloudflare.com/workers/previews/) · [Workers.dev 프리뷰 noindex](https://developers.cloudflare.com/workers/previews/custom-domains/#protect-preview-content).


## 2026-10-22 단계 9 — PR별 Cloudflare 원격 Preview 검사 연결

- Cloudflare 계정에서 단일 Worker myeongha 아래 두 **기존 Preview**를 읽기 전용으로 확인. 기존 #2384 프리뷰 URL은 그대로 유지하며, #2420 프리뷰도 feat-ops-cloudflare-authdb-clean-snapshot-20261021-myeongha.gycha0109.workers.dev 형태로 이미 존재함. 새 Worker/Cloudflare 리소스 생성 없음.
- cloudflare-preview-remote-smoke.yml의 해당 두 PR 브랜치만 원격 HTTP + Chrome 실행 대상으로 설정. 외부 임의 포크/브랜치의 Preview URL을 신뢰하지 않는다. Stage 4는 Chat GET 404, Stage 5/S-CF2는 Protected History/turns/replay GET 503 및 generic chat open 404를 각각 구별한다. 어느 경우도 세연 개인정보/Provider positive 호출은 없음.
- 원격 검사에 출처 SHA를 나타내는 응답이 없으므로, HTTP/Chrome 성공만으로 **정확한 HEAD SHA가 실제 배포된 증거라고 주장하지 않는다**. 별도 Cloudflare 배포 메타데이터의 commit tag와 CI 검사 SHA가 일치하는지 확인해야 한다. 배포 지연 중 이전 Worker로 검사되면 실배포 수락 HOLD.
- 운영 workers.dev disabled, preview enabled, Vercel Production 및 DNS, DB/OAuth/AI/Commerce/Secret 변경 없음. 프리뷰 검사는 오직 읽기/합성 음성 HTTP 테스트이며, 실제 운영 E2E가 아니다.
