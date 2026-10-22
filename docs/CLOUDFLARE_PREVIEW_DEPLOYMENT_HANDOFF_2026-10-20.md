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


## 2026-10-22 단계 9 — 빌드 커밋 일치 원격 수락 게이트

- 기존 HTTP/Chrome 체크가 **이전 프리뷰 배포본**에서 성공해도 최신 PR HEAD 성공으로 인정하지 않도록 Cloudflare 전용 빌드 스탬프 `public/_myeongha-preview-build.json` 생성. `npm run build:cloudflare:static`의 정적 후처리 단계에서 git checkout의 정확한 40자리 HEAD만 기록하며, 기존 `npm run build:web`·Vercel Production에는 산출하지 않는다. 일반 공개 Git 커밋 SHA 외 Secret/환경변수/토큰은 기록하지 않는다.
- `verify-cloudflare-static.mjs`가 번들 배포 전에 산출물의 커밋과 현재 checkout을 비교하고, 해당 JSON 응답에는 `Cache-Control: no-store` 및 기존 Vercel 보안 헤더를 추가한다. Static Assets의 HTML/fallback/API 라우팅은 변경하지 않는다.
- 보안 Draft #2420의 기존 원격 HTTP/Chrome workflow는 checkout PR head SHA를 `MYEONGHA_CLOUDFLARE_EXPECTED_HEAD`로 주입. 별도 원격 Worker URL의 빌드 영수증이 동일한 SHA를 반환할 때까지 제한된 배포 지연을 허용하고, 끝까지 불일치하면 workflow **FAIL** 처리하여 이전 버전 PASS를 허용하지 않는다. #2384 Stage4 legacy smoke는 기존 계약 유지.
- 이 증거는 코드 버전/정적 배포의 동일성이지 실제 Supabase OAuth/DB TLS/RLS, 세연 Reveal, 사주 Product Reading, PortOne 실운영 승인/성공 증거가 아니다. DNS/Worker Production/유료 리소스/Secret 전환 없음.


## 2026-10-22 단계 9 — Cloudflare Auth·DB 긴급 차단 스위치

- 신규 선택적 Worker 바인딩 이름 `MYEONGHA_CLOUDFLARE_EMERGENCY_HOLD`: 미설정 또는 문자열 `false`이면 기존 승인 및 fail-closed 정책 유지, 문자열 `true` 또는 그 밖의 설정값/읽기 실패는 즉시 보호 API 강제 HOLD. `wrangler.jsonc`에 변수를 넣거나 기존 배포에 실설정 변경을 하지 않았다.
- 활성 시 인증·OAuth·게스트·개인정보·사주 계산 API는 DB·Supabase·Producer 접근 이전 404/no-store; 세연 Chat 첫 요청·History·Replay는 원래 정적 503 보안 방벽 유지, 공개 `GET /api/health`만 200 유지. 건강 상태만 공개하는 것이 DB readiness/로그인 성공을 의미하지 않음.
- `test/cloudflare-auth-admission.test.mjs`에 비정상/접근 불가 바인딩, 위험한 데이터 풀 탐색 우회 방지, 영구 차단 이후 Health·세연 격리를 명시. 운영 Vercel/DNS/DB/Secret/OAuth/Cloudflare Paid/PortOne/세연 positive Release는 변경하지 않음.
- 실제 Preview 또는 운영 Worker에서 이 스위치를 사용하려면 Cloudflare Worker 설정 접근 권한이 필요하며, 테스트의 단순 바인딩 합성값은 실제 on/off 동작 증명과 구분한다.

## 2026-10-22 단계 9 — 무변경 Preview 복구 후보 사전 리허설

- 최신 S-CF2 Preview 원격 검사는 [실행 #39731076575](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39731076575)에서 **정확한 Git SHA `d4f7cebb3d9be6b4ad9e526c53e3f5b8585cc9c0` 스탬프, HTTP 58건 및 Chrome 11화면 PASS**를 기록했고 [동일 SHA의 전체 CI #39731076716](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39731076716)도 PASS했다.
- Cloudflare Preview deployment API의 **기존 고유 배포 URL** `https://59a14b13-myeongha.gycha0109.workers.dev`을 이전 안전 버전으로 고정. 해당 URL의 Cloudflare 배포 메타데이터는 `d4f7ceb` 태그/2026-10-22T06:04:44Z를 반환한다. 고유 배포 URL을 조회해 **이전 버전의 40자리 빌드 SHA `d4f7cebb3d9be6b4ad9e526c53e3f5b8585cc9c0` 일치 및 읽기 전용 HTTP 58개/API 404·503/11개 HTML, Chrome 11개 페이지 렌더링**을 검사하는 새 CI 단계를 작성했다.
- 구현은 기존 `.github/workflows/cloudflare-preview-remote-smoke.yml`에 분기된 **이전 배포 Preview smoke 2단계**를 추가한 것이다. 현재 Preview URL·기존 #2384 Stage 4 테스트·운영 Worker·DNS/DB/Auth 설정 변경 없음. **실제 Preview 롤백·복귀는 수행하지 않았다.** 이 작업은 복구 가능한 구 버전의 동작 증빙(READ-ONLY candidate rehearsal)이며, 실제 rollback 복구 성공과 구별해 별도 수락할 것.
- 사용법: 새 SHA로 변경된 PR의 CI에서는 **현재 Preview 최신 SHA 검사**를 먼저 수행한 후, 위 과거 고유 배포 URL을 pinned SHA로 검사한다. 두 회귀 중 하나라도 실패하면 rollback readiness를 FAIL로 판단한다. 향후 고유 URL이 만료·삭제되면 임의 대체값을 추측하지 말고 Cloudflare 배포 메타데이터로 새 검증 후보를 확정한 뒤 명시적으로 변경할 것.
- 비상 전환 기준: OAuth/DB TLS/권한 오류, 사고성 민감 본문, 예상 외 redirect/cookie, AI/결제 재실행 위험 발생 시 우선 해당 보호 라우트를 HOLD. 이후 Security/API/DB·운영 수락 범위를 좁혀 **Cloudflare Preview만** 승인된 이전 버전으로 재배포하고, 원래 버전 재배포까지 연속해서 검증한다. GitHub/Cloudflare mutation 승인·적절한 버전 아티팩트와 owner 인수 없이는 실제 배포 조작하지 않는다.

## 2026-10-22 단계 9 — 원본 Vercel 정적 복구 경로 별도 실측

- `scripts/verify-cloudflare-vercel-standby.mjs`: 기존 `https://myeongha.vercel.app`의 **정확한 11개 정적 HTML 경로만** HTTPS GET, 200/HTML 형태, `vercel.json`의 5종 보안 헤더, 리다이렉트 및 응답 쿠키 부재를 검사한다. Cookie/Authorization/실사용자/DB/Reader/PortOne API 요청 없음. 실제 HTML 및 오류 원문은 수집·출력하지 않는다.
- 기존 Cloudflare Preview 검사 Workflows에서 #2420 브랜치에 한해 현재 SHA, 이전 고유 Preview, Vercel 원본 정적 페이지의 **세 경로를 별도로 확인**한다. `test/cloudflare-vercel-standby.test.mjs`로 요청 범위와 인증정보 무전송, CSP/redirect/MIME/transport 실패를 격리된 모의 fetch로 검사한다.
- 스테이징 Preview 이전 버전의 읽기 전용 검사와 Vercel 정적 서비스 응답은 **실제 Cloudflare mutable branch Preview rollback/redeploy나 운영 DNS failback 실행을 뜻하지 않는다**. Auth/DB·OAuth·Saju/Face/AI·결제 실서비스 연동은 계속 HOLD. 운영 인프라/Secret/비용 변경 없음.


## 2026-10-22 단계 9 — 기존 Preview 이름에서만 실행 가능한 되돌림/재복원 스크립트

- `scripts/local/rehearse-cloudflare-preview-rollback.mjs`를 추가. 기본 동작은 **DRY RUN**: 지정된 이전/복원 40자리 Git SHA, 기존 Ops Preview 전용 브랜치·Worker `myeongha`·`workers_dev=false`, clean worktree, 선조(ancestor) 커밋을 확인할 뿐 네트워크/Cloudflare를 변경하지 않는다. PR branch/ref 보존.
- 명시적으로 `--apply --confirm-preview-only`인 경우에만 기존 프리뷰 `feat/ops/cloudflare-authdb-clean-snapshot-20261021` 이름으로 `wrangler@4.151.2 preview`를 이용해 *과거 소스 임시 worktree 빌드 → Preview 버전 재게시 → 정확한 SHA+58건 HTTP 계약 검증 → 최신 소스 임시 worktree 빌드·재게시 → SHA+HTTP 재검증* 순서를 수행하도록 구현. `wrangler deploy`/Production URL/운영 DNS/API 키 이관/유료 리소스 생성은 사용하지 않는다. 예외 발생 시 이전 프리뷰 게시가 완료된 경우에는 우선 복귀를 시도하며, 복귀 검증 실패를 절대로 PASS로 기록하지 않는다.
- `test/cloudflare-preview-rollback.test.mjs`에 dry-run 기본값, 정확한 SHA 및 이중 확인 요구, 명령 범위 축소 회귀를 추가. **현재 세션에서는 이 스크립트의 --apply를 실행하지 않았으며 실제 mutable Preview 롤백/복귀는 미증명**. 실제 사용에는 인증된 로컬 Wrangler/기존 Preview 권한, 기동 가능한 Node24/git checkout 및 배포 중 다른 Cloudflare Builds 갱신 충돌 없음이 필요하다.
- 이 스크립트는 인증·DB positive 활성화를 뜻하지 않으며 세연 첫/History/Replay 503, Commerce/PortOne HOLD, Vercel Production/DNS 변경 금지와 독립이다.

## 2026-10-22 — GitHub Actions에서 Preview 복원 사전 점검 실행

- 원격 Preview smoke Workflow에 **클라우드 CI 러너의 복원 DRY RUN**을 추가. 이전 고정된 40자리 Git SHA `d4f7cebb3d9be6b4ad9e526c53e3f5b8585cc9c0`와 실행 시점의 정확한 PR head를 비교하고, 두 버전의 원본 `wrangler.jsonc`, 부모-선조 관계 및 기존 Ops Preview 이름이 맞는지 확인한다. `--apply` 옵션 없이 실행되며 **클라우드 배포·시크릿·DNS·운영 Worker에 쓰기 작업이 전혀 없다**.
- PR #2384 구형 Stage 4는 기존의 1-커밋 checkout 및 smoke 계약을 그대로 유지한다. #2420은 제한된 Git 히스토리를 다운로드하고 PR head의 로컬 브랜치를 구성해 위 사전 점검을 수행한다. **사용자 Windows 데스크탑에 접근할 이유가 없고, 명하 Ops GitHub CI만 사용한다.**
- 실제 이전 Preview로 변경하고 최신 Preview로 복원하는 **mutating rehearsal은 여전히 별개 미실행**. 원격 CI의 준비성 PASS를 실제 rollback 완료라고 기록하지 않는다. Wrangler 배포 권한이 있는 적법한 CI 환경 또는 Cloudflare 전용 배포 실행 경로가 확보된 시점에만 `--apply`를 사용한다.

## 2026-10-22 단계 9 — 기존 Preview Smoke에 무자격 증명·무과금 실측 타이밍 집계

- 기존 `scripts/verify-cloudflare-preview-remote.mjs`의 **이미 수행하는 합성 HTTP probe의 응답 헤더 수신 시각**만 `performance.now()`로 재서 `opsProbeMetrics` 출력에 추가했다. **추가 네트워크 호출 없음**, 실제 사용자 계정/세션/메시지/결제 요청 없음.
- `scripts/cloudflare-preview-smoke-metrics.mjs`는 `static / health / api-denial / protected-hold` 별 n/p50/p95/max(밀리초), 원본 router의 **고정 route ID별** n/p50/p95/max 및 429·예상 밖 5xx·전송 실패·명세와 다른 HTTP 결과를 집계한다. 민감한 실제 URL, query, thread ID, 본문, 쿠키, 토큰, DSN을 로그에 쓰지 않는다. **세연 의도된 503 HOLD**는 오류율 분자에 넣지 않고 별도 `expectedHolds503`으로 집계한다.
- 수치는 **GitHub Runner→Cloudflare HTTPS 응답 헤더까지의 단일 합성 검사 지연**이다. Worker 실제 CPU 시간·메모리·실제 사용자 트래픽 분포·Cloudflare billable invocation·Workers Builds 사용 분수·청구 비용을 대신하지 않는다. 각 라우트에 표본이 1개일 수 있으므로 p50/p95가 운영 성능을 통계적으로 입증하지 않는다.
- Cloudflare 연결의 **빌드 한도 소진 boolean은 읽기 전용 조회 가능**, 실제 billed usage / billing usage API에는 현재 권한 403. **청구 0원, 특정 비용 수치 또는 CPU 예산 PASS를 추측하지 않는다.** 비용/CPU/라우트별 실제 p95 실측은 해당 메트릭 조회 승인/접근과 실서비스에서 정식 부하 자료 확보 전까지 Stage 9 부분 HOLD다.
- 테스트 `test/cloudflare-preview-smoke-metrics.test.mjs`에서 percentile·route ID redaction·429·의도된 503 처리·미확정 CPU/비용 표기·비정상 샘플 거부를 합성 검증한다. 기존 S-CF2 원격 smoke와 고정 이전 배포 검사에도 함께 적용되며 #2384 Stage 4 결과 계약은 유지한다.
