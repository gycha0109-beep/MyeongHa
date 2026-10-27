# Vercel 원본 의존성 정리 — 2026-10-26

작업 트랙: Ops / 기존 브랜치 `feat/ops/cloudflare-vercel-exit-readiness-20261025`, Draft PR #2597.

## 실제 제품 코드에서 정리한 의존성

- 모바일 런타임의 기본 API origin을 `https://myeongha.gycha0109.workers.dev`로 변경했습니다. 모바일 출시 사전검사도 정확히 이 origin만 승인하고 기존 Vercel origin을 거부합니다.
- 네이버 OAuth bridge는 기본 Cloudflare 요청에 같은 Cloudflare callback을 사용합니다. **기존 Vercel 호스트에서 수신한 요청에 한해서만** Vercel callback을 유지하고, 임의 요청 호스트를 승인하지 않습니다.
- Supabase 이메일 인증의 미인증 호스트 fallback을 Cloudflare로 변경했습니다. Vercel의 실제 동일 출처 요청은 사용 중인 대기 서비스를 깨뜨리지 않도록 그대로 Vercel로 돌아갑니다.
- 웹 소셜 callback helper는 승인된 Worker/custom host에는 같은 출처, 정확한 Vercel 운영/프로젝트 Preview 호스트에는 기존 Vercel callback을 반환합니다. 다른 도메인에서는 callback이 없으며 브라우저는 소셜 인증 요청을 시작하지 않습니다.
- Stage 9/10 종료 게이트의 `approvedPublicOrigin`은 **정확한 정본 Workers URL 또는 승인된 별도 HTTPS 사용자 정의 도메인**의 두 선택지를 허용합니다. 사용자 정의 도메인은 기술적으로 필수 조건이 아닙니다. 다른 Workers alias·Vercel·테스트/사설 호스트는 계속 거부합니다. 필수 E2E, 롤백, 운영 안정성, 명시적인 최종 종료 승인은 생략할 수 없습니다.

## 의도적으로 남겨 둔 Vercel 전용 운영 절차

다음은 클라이언트가 호출하는 기본 API가 아니라 **Vercel 운영 서비스를 관리·검증하는 코드**입니다. 실제 Vercel 종료 시 더 이상 실행하지 않거나, 동등한 Cloudflare 운영 절차로 대체해야 합니다.

- `.github/workflows/mobile-push-production-activate.yml`: Vercel Production 재배포와 기존 호스트 검사 포함.
- `.github/workflows/production-saju-service-origin-binding.yml`, `.github/workflows/production-saju-redeploy-recovery.yml`: Vercel 환경 변수 갱신 및 복구.
- Vercel 전용 WAF/Member/Guest/Postgres canary·운영 스크립트 및 관련 GitHub Actions: 기존 Vercel 배포를 대상으로 하므로 Cloudflare 보안 점검과 동일하다고 간주하지 않습니다.
- `config/security/production-security-alerting-v1.json`: 기존 Vercel 운영 도메인과 알림 토큰 관리.
- `vercel.json`: Vercel 대기 서비스를 현재까지 유지하는 설정입니다. 실제 종료 전에 무조건 제거하거나 운영 배포를 끊지 않습니다.

## 소스 수정만으로 해결되지 않는 잔여 항목

1. 이전에 빌드·설치한 모바일 앱에 Vercel URL이 포함돼 있다면 **소스 수정만으로 해당 바이너리는 변경되지 않습니다**. 출시·배포 상태와 재빌드가 필요합니다. 스토어 배포 여부는 확인되지 않았습니다.
2. `myeongha.vercel.app` 사용자·공유 링크는 Vercel 소유 주소입니다. 프로젝트를 삭제한 뒤 그 주소에서 새 Cloudflare 주소로 영구 리디렉션을 제공할 수 있다고 가정하면 안 됩니다. 기존 링크 이관과 신규 공지·진입점 확인이 필요합니다.
3. Supabase 및 네이버·기타 OAuth 제공자에 등록된 **실제 redirect allowlist**의 상태와 Cloudflare 콜백 성공은 아직 독립적으로 검증되지 않았습니다. 서버 코드만 수정해도 등록값은 바뀌지 않습니다.
4. Worker `/api/readiness` 200은 전체 보호 API의 양성 E2E 검증이 아닙니다. 실제 사용자 인증/DB/사주·보호 경계 수락, 정확한 Worker 버전, 롤백 및 안정성 증거가 필요합니다.
5. 이번 작업은 **소스 브랜치 변경**입니다. 기존 배포 버전, DNS, Vercel 프로젝트, 앱 바이너리, Supabase·OAuth 제공자 설정, 실제 운영 시크릿은 변경하지 않았습니다.

## 종료 판정

정확한 Cloudflare Worker 또는 사용자 정의 도메인을 최종 공개 origin으로 선택한 다음, 해당 origin에서 독립 수락 증거를 모아 `npm run verify:vercel-retirement`의 `ELIGIBLE_FOR_MANUAL_RETIREMENT`를 확인하십시오. 실제 서비스의 Vercel 사용 중단은 최종 사용자 승인 전에는 수행하지 않습니다.


## 2026-10-26 최종 CI / 운영 재검사 (읽기 전용)

- 기존 Ops Draft PR #2597, 커밋 `7805853b2c00a4e78acace921a9bb82cc63f71f2`: 연결된 5개 워크플로 모두 완료·성공. 종합 CI: https://github.com/gycha0109-beep/MyeongHa/actions/runs/40256805729
- `node scripts/verify-cloudflare-primary-e2e.mjs`: 익명 E2E 14/14 통과. 정적 웹, readiness 200, 무인증 Member/Saju 차단, 외부 Origin 차단, Chat 보안 HOLD를 확인. **인증된 Member 로그인·사주 실제 계산 성공 증거는 아님.**
- `npm run audit:vercel-retirement`: 실제 Cloudflare 버전 `d0cb53be-262f-423a-8b5f-276ca35a3816`을 조회. Vercel과 Cloudflare의 `/api/readiness`는 모두 HTTP 200, `userData=ready`, `sajuCalculation=ready`.
- Cloudflare 정본 `https://myeongha.gycha0109.workers.dev`를 공개 origin으로 **읽기 전용 자동 검증**하도록 종료 검사 기본값을 보정했습니다. 공개 Worker의 health, 12개 정적 경로, 버전 동등성 및 readiness 검증 통과. 별도 사용자 정의 도메인 필수 요구는 없습니다.
- 그러나 종료 게이트 결과는 **`HOLD`**. 별도 증거 12종(실제 OAuth callback, 인증된 회원/DB TLS·RLS, Guest→Member, 사주 양성 경로, 보호 AI/Commerce, 배포 버전·시크릿, 롤백·안정성·최종 종료 승인 포함)은 누락 상태이며 이를 자동으로 성공 처리하지 않습니다.
- Vercel 전용 CI/운영 스크립트는 대기 서비스 관리용으로 유지합니다. 삭제 전에 실행 대상을 옮기거나 더 이상 호출하지 않도록 절차를 종료해야 하며, 기존 EAS 바이너리/외부 제공자 설정/기존 Vercel 링크는 소스 수정만으로 이관되지 않습니다.
- **운영 배포·DNS·Supabase/OAuth provider 설정 변경·Vercel 비활성화·PR 병합·Secret 수정 없음.** 이 재검사는 Vercel 종료 승인이 아닙니다.

## 2026-10-26 Ops continuation: Cloudflare positive E2E and production probe cutover

- GitHub PR #2597 head `4cefa085fe3a7606faadede4e8515e60d6449a56`: GitGuardian Security Checks **success**, Governance, Mobile PR Bundle, Web PR Domain Gates, Web Auth Browser Regression and CI all **success**. GitGuardian: https://github.com/gycha0109-beep/MyeongHa/runs/121372162465
- The active Cloudflare Worker version was independently read as `9defd0bf-0561-4318-af5c-daed4d39105f` before the governed authenticated E2E dispatch. At that observation, HTTP health was 200; `/api/readiness` reported `ready`, `userData=ready`, `sajuCalculation=ready`.
- The existing GitHub `cloudflare-primary-e2e-member.yml` workflow was dispatched **on main**, pinned to that exact Worker version, and completed **successfully**: https://github.com/gycha0109-beep/MyeongHa/actions/runs/40261086788 . The pre-existing workflow's steps verified governed Member sign-in, canonical subject/DB ownership, current Birth revision and calculation-only Saju, with its security-owned production secret environment. No Member credential or private response was displayed or committed. The workflow commit was `95ecda3a0e2fb31ea484a824b8509a789f389887`. This is valid evidence **for the pinned version and tested paths only**, not for newer Worker deployments or unrelated branches.
- `npm run verify:production:api` now defaults to the canonical Cloudflare Worker instead of Vercel. The existing `MYEONGHA_PRODUCTION_ORIGIN` override remains usable to check the Vercel standby explicitly before retirement or rollback. Live health tests for both origins passed (HTTP 200, `{"status":"ok"}`); production health verifier regression tests: 7/7 passed.
- Remaining acceptance is not automatically promoted: real OAuth/provider callback round-trip, Guest-to-Member continuity, production secret binding parity, exact deployed source SHA, full Preview acceptance for the same release, rollback rehearsal, stability observation and explicit final Vercel shutdown approval all require independent evidence. Vercel-owned links and historical mobile binaries are not migrated by this source change.
- No Vercel shutdown, production Worker deploy, DNS changes, provider configuration, Supabase DB mutation, secret value disclosure or PR merge occurred. Vercel remains a live standby.

## Final-phase verification: OAuth, Guest continuity, rollback boundary — 2026-10-26 KST

This is a bounded operational evidence record, **not** a claim that Vercel may be deleted. All external probes used the already-authorized origins. No user data, password, cookie, OAuth state, authorization URL, or API token is stored in this file.

### Confirmed live

- GitHub PR #2597 previous commit `280a280681bf41842b2b5633d16bd96b01dd5288`: 5 GitHub Actions workflows succeeded; GitGuardian green as previously checked. This is CI success, not independently authenticated OAuth success.
- **Cloudflare deployed runtime changed during this final-stage session** from Worker #122 `9defd0bf-0561-4318-af5c-daed4d39105f` to #123 `37f7b28f-667c-4af1-98c0-f833e83200f2` (Cloudflare deployments API shows #123 at 100%). #122 has been retained as an immutable version candidate. Both versions present 41 bindings by **name and type**. Secret value parity, actual rollback, source SHA parity and persistent session continuity were **not** proven by this comparison.
- The governed Member→own PostgreSQL/Birth→calculation-only Saju production workflow [#40261086788](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40261086788) completed successfully for **#122 only**. It must be rerun, with its `worker_version` input pinned to **#123**, to attest the presently deployed Worker; historical success cannot be promoted to current release acceptance. This workflow already uses the production secret environment and requires explicit `VERIFY_CLOUDFLARE_PRIMARY_E2E` confirmation. No new workflow or test account is needed.
- On Worker **#123**, Google, Kakao and Naver `POST /api/auth/social/start` each returned HTTP 200, Supabase authorization URL, and a `redirect_to` pointing to the same Cloudflare `/auth.html?social=callback` origin. Request state/authorization URLs were not logged. This verifies **provider initiation and exact callback construction**, but *not* an actual third-party sign-in and callback exchange or provider dashboard allowlist.
- On Worker **#123**, `GET /api/session/bootstrap` returned **405**, unauthenticated `POST /api/auth/promote-guest` returned **401**, and a fake Naver callback state returned **400**. These verify security rejects only; no actual Guest→Member promotion occurred and no new Guest identity was created.
- The existing Cloudflare primary anonymous ingress E2E passed **14/14** on #123, including `/api/readiness=200` and auth/saju/chat hold boundaries. Focused offline OAuth/Guest/rollback gate and production verifier unit tests passed **85/85 across 10 files**.
- Read-only `npm run audit:vercel-retirement` on #123 returned `HOLD` with exactly 12 `MISSING_EVIDENCE` gates. Cloudflare, Vercel standby, and Cloudflare public-origin health/readiness all reported **ready**. #123 Worker version remained unchanged across the start/end of the audit. No shutdown was attempted.

### Cutover/rollback plan (not yet an executed rollback rehearsal)

1. Maintain the Vercel standby with verified health/readiness and its current separate application state. This is a safe fallback endpoint, **not** a substitute for redirecting established `myeongha.vercel.app` visitors after deletion.
2. Before any live rollback, pin and preserve the intended Worker version, obtain the exact source revision and non-DB secret binding parity; check how stale mobile binaries, browser sessions, callback allowlists and old public links behave after cutover.
3. Obtain evidence for a *real* OAuth provider round-trip and Guest→Member promotion with a governed test identity and an approved reversible scenario, without modifying a user's existing records.
4. Rehearse rollback only through the established operational deployment procedure with a separately scoped maintenance window. **Do not** silently deploy the preserved #122 Worker or switch DNS: this would affect concurrent development tracks and real traffic. Re-verify production Member and Saju on the actual recovered version after the rehearsal.
5. Record exact-SHA Preview/CI, production Secret parity, observed cutover stability and an explicit final Vercel shutdown decision. Until all are supported, leave the fail-closed retirement gate at `HOLD`.

**No production Worker deployment, rollback deployment, DNS change, Vercel shutdown, OAuth provider-console edit, synthetic Guest mutation, or PR merge was performed in this final-stage audit.**

## Windows Docker Desktop local acceptance — 2026-10-26 (Ops)

Executed on the authorized local Windows PC, Docker Desktop Linux engine 29.8.2 / Docker Compose 5.5.1, using Ops PR #2597 at commit `8f7604ee653fa2c5a6cb7526a895c915b151d66e`. **No Production credentials, database, user sessions, payments, Worker deploy, Vercel disable, or provider dashboard edits.**

1. `node scripts/local/verify-saju-bridge-docker-local.mjs` — **PASS** in isolated project `myeongha-saju-full-bc433ff178be`: four independent PostgreSQL 15 DB connections and real disposable Supabase GoTrue synthetic signup, JWT, and `/user` proof. The built-in runner tore down its containers, network and project volumes and verified no owned resources remain. This was **Phase 1**, not the opt-in Saju HTTP/TLS/Permit/recovery stages.
2. Actual disposable **PostgreSQL 17.6** container `myeongha-ops-guest-local-20261026`, no network access and ephemeral tmpfs DB; read-only bind mounts containing only repository migrations and DB test fixtures. Bootstrapped `test/db/bootstrap_supabase_auth_stub.sql`, applied **198 migrations** in repository order, skipping the separately governed managed-principal `0860_birth_profile_create_runtime_authority.sql`. Applied `test/db/guest_promotion_auth_fk_authority.sql` and ran the repository's unchanged `test/db/guest_promotion_concurrency.sh` against the **real PostgreSQL DB** — **PASS**.
   - Verified same canonical `subjects.id` and preserved profile/Birth ownership after Guest→Member promotion; exact Guest session consumption; response-loss idempotent replay; expired/consumed/wrong-subject/missing-auth and existing-Member collisions rejected; concurrent identical requests permit one mutation + replay; different Member IDs racing for one Guest admit one; two Guests racing for one Member identity admit one; `PUBLIC` EXECUTE remains revoked.
3. Ran an additional isolated transaction using a synthetic Guest subject, session and `auth.users` fixture: `BEGIN` → `public.cmd_promote_guest_v1` → verified Member state **inside** the transaction → `ROLLBACK` → verified original Guest subject and unconsumed session **after** the rollback. Result: **`PASS_DOCKER_GUEST_PROMOTION_TRANSACTION_ROLLBACK`**.
4. Removed the only separately created PG17 container and verified **0** owned Guest test containers, volumes and networks; the existing Saju runner also left **0** project containers. Other developers' Docker resources were not modified.

**Acceptance boundary:** this is real local GoTrue/SQL/transaction evidence, but the GoTrue and Guest promotion fixtures were **not one single complete application HTTP session**. It does not establish an actual third-party Google/Kakao/Naver OAuth provider callback, production Supabase allowlist parity, production Guest→Member HTTP promotion, nor rollback of the live Cloudflare Worker/DNS/Vercel. These require independent operational evidence before the retirement gate can move from `HOLD`.

## Ops 후속 구현 — Cloudflare 배포 검증을 Vercel과 분리 (2026-10-26)

- 공통 `npm run verify:deployment-config`는 이제 활성 Cloudflare 단일 Worker의 `wrangler.jsonc` 구조, 실제 Worker의 정적 파일 보안 헤더(noindex), API 12개 직접 경로·20개 rewrite 경로 및 Birth/Records/Chat 디스패처의 필수 매핑을 검증한다. 정적 HTML/CSS 참조 및 소스맵·개발 파일 유출 검사도 유지한다.
- 이 공통 검증 단계에서는 `vercel.json`을 읽지 않는다. Vercel 전용 리전, 자동 배포 정책, 함수 12개 수량 제한은 **Cloudflare 빌드의 필수 조건이 아니다**. Vercel standby 자체의 배포 설정이나 운영 안전 게이트는 변경하지 않았다.
- Cloudflare API 라우터 단위 테스트 또한 Vercel rewrite JSON을 기준 데이터로 사용하지 않고 실제 Worker 라우트 목록의 안전 경계·주요 목적지를 독립적으로 검사한다.
- 이것은 **코드·CI 의존성 분리**이며 실제 운영 Vercel 삭제 또는 Cloudflare 릴리스 승인 증거를 대신하지 않는다. 종료 게이트 `HOLD`, 독립 E2E와 정본 버전 확인, OAuth/Guest 연속성, 롤백 및 최종 사용자 종료 승인은 기존 정책대로 남는다.

Watchtower-Track: ops


## 2026-10-26 KST — latest deployed Worker, authenticated E2E and fail-closed retirement audit

- Independently queried the Cloudflare `myeongha` deployment API: latest 100% production Worker version `34eb0caa-a66f-4eb2-a869-de4ea3a98cc7` (deployment `91818edb-fdd9-456c-8184-94f6f48b7ac1`, created `2026-10-26T12:14:35Z`). Do not reuse the older #122/#123 version pins as proof for this release.
- Dispatched the existing production-scoped authenticated Member → DB ownership/current Birth → calculation-only Saju workflow on `main`, with exact `worker_version=34eb0caa-a66f-4eb2-a869-de4ea3a98cc7`. **PASS**, run https://github.com/gycha0109-beep/MyeongHa/actions/runs/40323466700, workflow source commit `0bc93474318f1af29b1fd0adab53c31ecea0d406`. No secrets or private response data were accessed or recorded in this document.
- From an authorized Windows execution environment, ran `node scripts/verify-cloudflare-primary-e2e.mjs` on the same canonical origin: anonymous ingress/boundary **14/14 PASS**, with expected unauthorized Member/Saju 401 and Chat security fences. Independent of the authenticated run above.
- Ran actual read-only `node scripts/verify-vercel-retirement-readiness.mjs` using the Ops PR branch commit `d1e99ab2d07d7fe867491b516877bbf140ab3233`: **HOLD**. Canonical Cloudflare, public origin and Vercel standby all returned HTTP 200 with `userData=ready`, `sajuCalculation=ready`; Worker version remained the same for the double-check. The auditor reported all 12 `MISSING_EVIDENCE` gates because no independently attested release manifest was supplied. A live workflow PASS is not automatically converted to a manifest check flag.
- Cloudflare API confirms 41 Worker bindings by **name and type** for this live version; actual Secret value parity is unproven. Full OAuth provider callback, production Guest→Member data continuity, full exact-release SHA provenance, rollback deployment/recovery and cutover stability observation still need independently verifiable evidence. User requested eventual Vercel retirement **after** validation; this is not unconditional authorization to bypass failing gates.
- The Ops PR remained draft and unmerged at verification time. **No production deploy, DNS change, Worker rollback, Supabase/provider edit, Vercel pause/deletion or secret mutation was made by this verification.** Do not pause Vercel until release acceptance succeeds.


## 2026-10-27 KST — latest version, governed OAuth start verification and termination HOLD

- Read-only Cloudflare deployment API independently identified **100% active** `myeongha` Worker `8553fcc5-ea3e-406f-a14e-c02d332aeaba` (deployment `16a3523b-2e0f-408b-8c33-ad377c836cc3`, created `2026-10-26T12:57:28Z`). This supersedes the previous positive authenticated E2E's `34eb0caa-a66f-4eb2-a869-de4ea3a98cc7`; there is **no completed version-pinned authenticated Member/DB/Saju run for the new version** in this evidence record.
- On the new deployed Worker, independently ran the existing production anonymous boundary suite: **14/14 PASS**. Cloudflare/public-origin/Vercel standby readiness were all HTTP 200 with `userData=ready` and `sajuCalculation=ready`. The read-only retirement auditor returned **HOLD**, listing the 12 missing independently attested manifest checks. That `HOLD` must not be bypassed by declaring a successful health check.
- Created repeatable zero-credential live OAuth initiation proof `scripts/operations/verify-cloudflare-oauth-start-live.mjs`. Invoked `node scripts/operations/verify-cloudflare-oauth-start-live.mjs --worker-version 8553fcc5-ea3e-406f-a14e-c02d332aeaba`: **PASS_START_ONLY** for Google, Kakao and Naver, correctly mapping Supabase `custom:naver`. All three returned same-origin Cloudflare `/auth.html?social=callback` and a valid state. Rechecked the Worker version before/after; no OAuth URL, state, token, session, cookie or credential was logged.
- Standalone regression tests in `test/cloudflare-oauth-start-live.test.mjs`: **5/5 PASS**, including rejecting unpinned/stale Worker versions, Vercel callback origin and wrong Naver provider alias. A provider authorization URL is **not proof** of a completed human/synthetic third-party provider callback, session establishment or provider-console allowlist. `oauthCallbackE2E` stays unsatisfied.
- Cloudflare version metadata for current and two previous versions show identical **41 binding names and types**, and the current version has a Preview capability. This does **not** attest the secret values, exact deployed Git source SHA, or complete Preview acceptance; corresponding evidence gates remain unresolved.
- Actual production Guest→Member preservation, exact-version governed authenticated E2E, live rollback with Member/Saju recheck, and post-cutover stability observation are unverified. Preserve the tested previous Worker version as a candidate only; do not deploy it unannounced while other tracks may be changing production. No Worker deployment/rollback, DNS change, provider edit, DB mutation, secret read/change, Vercel pause/deletion or PR merge was performed for this audit.
- User approved **eventual Vercel shutdown following verification**, but the actual retirement gate is not eligible. Do not pause the live Vercel standby on the basis of this conditional instruction while required checks are still missing.


### 2026-10-27 live deployment drift detected and revalidated

- During repeat execution of the new OAuth-start verifier, the previously pinned `8553fcc5-ea3e-406f-a14e-c02d332aeaba` failed closed with `WORKER_VERSION_DRIFT` (correct behavior, no OAuth authorization data leaked).
- Cloudflare deployment read confirmed new 100% version `7b3fa095-991d-400f-b781-fbfb78fd09e0` (deployment `19f7b6b5-8033-4c5c-97a6-252ef690d84b`, created `2026-10-27T00:58:40Z`).
- Re-ran `node scripts/operations/verify-cloudflare-oauth-start-live.mjs --worker-version 7b3fa095-991d-400f-b781-fbfb78fd09e0`: **Google/Kakao/Naver PASS_START_ONLY**. Re-ran existing anonymous Cloudflare primary suite: **14/14 PASS**. Neither is an authenticated positive Member→DB/Saju E2E or an actual OAuth callback exchange.
- While another track continues updating the primary Worker, **do not initiate live rollback rehearsal or Vercel shutdown** from this snapshot. A stable pinned release candidate, governed authenticated E2E, actual OAuth/Guest continuity and maintenance-safe recovery evidence remain necessary.


## 2026-10-27 — Vercel production pause executed; Cloudflare remains live

- On explicit user instruction to conclude Vercel operation, paused only the Vercel project `myeongha` (`prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP`, team `team_xuYA9OhCWlJETaYFOmeVodgS`) using Vercel's reversible pause operation. The response body was null; therefore live HTTP checks were used to confirm the effective state.
- **Confirmed after the pause:** `https://myeongha.vercel.app/`, `/api/health`, and `/api/readiness` each returned **HTTP 503**. This is an actual Vercel production **service stop**, not a project deletion, DNS redirect or Vercel subscription cancellation. Old Vercel-owned links no longer work and do not automatically forward to Cloudflare.
- **Confirmed after the pause:** `https://myeongha.gycha0109.workers.dev/`, `/api/health` and `/api/readiness` returned **HTTP 200**. The standalone Cloudflare anonymous ingress/security suite returned **14/14 PASS**, including protected API boundaries. Cloudflare's active Worker deployment was independently observed changing between sessions, so current production identity must always be independently checked.
- Before the pause, separately dispatched governed Member→DB ownership/current Birth→calculation-only Saju authenticated production E2E pinned to Worker `ae5115f4-0377-4032-9e3f-ae0459ea969c`. [GitHub Actions run #40431981101](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40431981101) **succeeded**. This attests its pinned Worker only; no claim is made that this authenticated E2E was rerun after the pause on a newer Worker.
- **Acceptance distinction:** The existing `verify-vercel-retirement-readiness.mjs` is a *pre-shutdown* gate and expects the Vercel standby to be healthy. The project was paused under direct user instruction before all of the independent retirement manifest gates had been satisfied (real third-party OAuth callback, production Guest→Member continuity, secret value parity, rollback rehearsal, exact source SHA and stability). Do **not** record `ELIGIBLE_FOR_MANUAL_RETIREMENT`, mark missing proofs PASS or claim a complete risk-free migration. The pause is reversible with the existing Vercel project, if later needed.
- No Cloudflare Worker deployment, live rollback, DB or provider mutation, PR merge or Vercel project deletion was performed by this Vercel pause action. The Ops PR remains the working branch.
