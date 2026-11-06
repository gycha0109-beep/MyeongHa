# Admin Console — home-PC continuation (2026-11-02)

## Current verified status — 2026-11-06 (supersedes all earlier dated status below)

### Protected read-only production release

- PR #3079 was merged: https://github.com/gycha0109-beep/MyeongHa/pull/3079. It expands the dedicated production Reader readback from 9 to 20 existing ID-free Admin query kinds; it does not add a customer-write path.
- The 20-query protected production readback passed: https://github.com/gycha0109-beep/MyeongHa/actions/runs/42206759314.
- The current main Admin code was then released through the existing protected read-only release workflow, not by editing Worker settings manually: https://github.com/gycha0109-beep/MyeongHa/actions/runs/42215510970. Main HEAD was 2388332a17025e5d049ace2d001886c703e39efa; all workflow steps passed.
- Cloudflare readback after deployment confirmed Worker myeongha-admin version d29f88d3-f047-40dd-b28a-0e0d268b0cef at 100% traffic. MYEONGHA_ADMIN_PRIVATE_ENABLED=true; credit commands, audit retention and analytics retention are all false.
- Live Worker bindings contain only the separate Reader and Audit Writer Hyperdrives, the existing MEMBER_AUTH_SERVICE → myeongha service binding, assets and rate limiter. No Command/Retention/Analytics-Retention Hyperdrive is present. Existing customer Worker myeongha was not redeployed or modified.
- Cloudflare Access readback confirms the Admin application has exactly one Owner email only allow policy with one email selector. Reader and Audit Writer are distinct database logins; both Hyperdrive origins now use direct PostgreSQL port 5432, TLS verify-full and disabled caching. The release preflight rejects the prior Supavisor transaction pooler/6543 configuration.
- The current release's protected preflight passed: live Access/Hyperdrive checks, TLS/minimum-role checks, all 20 actual Reader queries, and Audit Writer INSERT/denied-operation rollback verification. Post-deploy Access/Hyperdrive checks and anonymous asset/API denial also passed.

### Remaining acceptance — do not overstate

1. **Fresh authenticated Worker read + audit:** the Reader-origin repair record requires one fresh Owner GET /api/admin/users after the direct-origin correction, then a correlated read:users / allowed audit event. The 20-query DB smoke is not the same as a browser request through the Worker. Earlier user-provided screenshots showed populated user and commerce rows, but their capture time does not establish this post-repair request. The connected browser tab at the latest inspection was at the Owner authentication form; no new request was generated from that tab.
2. **Non-Owner app-policy denial:** still unverified at the Admin Access application. The previous non-Owner attempt was rejected at Cloudflare account-membership level before the Admin app policy; it is not an app-level denied-login event. Do not fabricate an identity, create an account, change Access policy, or count anonymous redirects as proof.
3. **A4 Reading-generation costs:** HOLD. Saju PR #2739 remains open: https://github.com/gycha0109-beep/Saju/pull/2739. The production authority mapping a Saju provider request/call to the exact MyeongHa Subject/Reading/execution attempt is not implemented/verified. Saju-native Reading IDs are not interchangeable with MyeongHa DB UUIDs. No provider cost collection or complete-cost claim.
4. **A5 analytics:** collection and retention remain inactive; consent/version, source-event routes, deletion binding and retention prerequisites are not approved/verified for live collection.
5. **A6 commands:** customer-changing commands remain unavailable; no Command Executor binding is deployed. Do not enable credit/refund/account commands or mutate customer records without the domain execution contract and explicit Owner approval.
6. **A7 presentation publishing:** the database installation alone does not activate publishing. Executor binding/authentication and Owner audit verification remain outstanding; public publishing is not enabled.

ROADMAP_COMPLETE remains **not reached**. The successful read-only release and 20-query Reader check complete those specific gates only; they do not complete the entire A0–A7 system.


This handoff contains **no secrets**. It is for continuing the existing Admin track from a second Windows PC without copying credentials from the school PC.

## 2026-11-04 live read-only authorization verification — no activation

**Execution:** Read-only Cloudflare configuration/Access-log API and read-only PostgreSQL privilege-catalog queries through the connected MyeongHa Supabase project. No production customer rows, secrets, tokens, or session details were read out, and no DB role grants, Worker flags, policies, or deployment were changed.

| Boundary | Live evidence | Status |
| --- | --- | --- |
| Cloudflare Access configuration | Exact Admin hostname, single exact Owner-email allow rule, binding email/AUD match; no additional allow/bypass rule detected | Verified configuration; real non-Owner app-policy denial still unobserved |
| Anonymous/other-account observation | Owner has previously returned `ADMIN_PRIVATE_DISABLED`. A second-account browser showed `Cloudflare sign-in is restricted to members of the account.`; this proves login did not continue, **not** that the Admin app's Owner policy was evaluated | Edge restriction observed; separate app-policy evidence missing |
| Cloudflare Access auth logs | Query of app authentication logs from 2026-11-04 00:00 UTC returned one allowed login and zero denied logins; second-account attempt did **not** yield an app-specific denied-login record | Do not run or mark the log-based denied-user proof as passed |
| Worker bindings | Four Admin activation flags `false`, dedicated Reader/Audit Hyperdrive bindings present, Member verification key secret binding present. Most recently verified inactive deployment 2026-11-04 06:47 UTC | Disabled and isolated |
| Supabase Production | Correct project reported `ACTIVE_HEALTHY`, PostgreSQL 17.6.1.166. Both dedicated Reader/Audit Writer roles exist with LOGIN, NOINHERIT, no superuser/CREATEROLE/CREATEDB/BYPASSRLS and no inherited role memberships | Live catalog properties verified, not a fresh scoped TLS login |
| Reader DB privileges | Can SELECT public subject ID and audit metadata; cannot edit subjects or audit entries, insert audit events, or select birth date, payment receipt payload, Reading input snapshots | Live privilege checks passed |
| Audit Writer DB privileges | Can INSERT audit request ID; cannot SELECT audit entries, modify/delete audit rows, read/modify subjects or access commerce receipts | Live privilege checks passed |
| Audit protections | Audit table has RLS and FORCE RLS, with six current policies | Live catalog checks passed |
| Dedicated TLS and rolled-back audit probes | Previously passed in inactive stage job on [GitHub Actions #41787539667](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41787539667); not repeated in this read-only audit | Existing evidence retained, not misrepresented as a new test |
| Member authentication & real Admin reads | Active route requires `MYEONGHA_ADMIN_PRIVATE_ENABLED=true`, but verified current Worker is deliberately `false`. No short-lived authenticated Member credential provided or stored | **Not tested**. No claim of successful end-to-end Member auth/API reads |

**Next existing roadmap gates:** obtain accurate non-Owner app Access deny evidence when possible without creating a fictitious token; then perform controlled real Member email+Auth UUID binding and least-privilege Reader/Audit API behavior verification **only through a separately approved secure release/test path**. A real read-only activation or temporary enablement requires the user's explicit approval; do not silently toggle the Admin feature. Credit commands, retention, analytics and unrelated public Worker remain disabled/unmodified.

**Completion:** `ROADMAP_COMPLETE` not reached.

## 2026-11-04 non-Owner gate verification correction (implementation only)

The Cloudflare Access policy denies unauthorized identities **at the edge**; those users do not receive a valid JWT for the protected Admin application. The original two-JWT `inactive-stage-owner-probe.mjs` remains a separate test for two independently issued app JWTs, but **cannot be used as the only proof of a denied login** and must never be satisfied by an invented JWT.

`apps/admin/inactive-stage-denied-login-log.mjs` is the alternative for the existing non-Owner real-session gate. After an actual attempt from an existing non-Owner email address, it reads the **live Cloudflare Access authentication log** for exactly that email and application within an explicitly bounded 30-minute interval. It accepts only `action=login`, `allowed=false`, the exact app ID and exact non-Owner identity; an allowed login for that identity in the window fails. Log values, token, and identity are not printed or stored; the CLI only emits redacted pass/fail counts. It does not create accounts or sessions. This evidence must be combined with the separately verified Owner acceptance, Access policy readback and anonymous denial before claiming the full Access gate.

**Execution prerequisite not yet met:** no real non-Owner login attempt is on record. Tests with synthetic log fixtures do not count as this gate. The user does not need to create a new account if an existing different email identity is available. Never store the email/session/API token in the repository or CI secrets solely for this probe, and never broaden Owner allow rules to create a test.

Member identity and real operational Reader/Audit request verification remain separate uncompleted gates; read-only activation requires explicit approval.

## 2026-11-04 follow-up: Cloudflare policy simulation and remaining gates

- [Admin work-log PR #2963](https://github.com/gycha0109-beep/MyeongHa/pull/2963) merged after [11/11 integration jobs succeeded](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41790239741). No production Worker code or credentials changed.
- Re-read the **live** `MyeongHa Admin Owner Only` Cloudflare Access application and single exact-email allow policy. Confirmed exact hostname, Access AUD and Owner binding match; no Everyone / Bypass or additional policy. The dedicated Worker remains deployed with all four activation flags `false`, Reader and Audit Hyperdrive bindings present. Anonymous requests to `/admin/`, `/admin/index.html`, and `/api/admin/session` each redirected to Access (HTTP 302) rather than returning privileged content.
- Ran Cloudflare's **policy simulation against the exact configured Owner-only rule**. Simulation ID `281e584c0e442c56c104f3f70cdde8357d84280b2a50e57f4eed97d4620ea810` completed: **1 existing authenticated user evaluated, 1 allowed, 0 blocked, 0 errored**. This is **not** a non-Owner denial test because the test population contained no other authenticated user. It does not prove a second person's real login is denied.
- A real **Owner** browser previously returned `ADMIN_PRIVATE_DISABLED` after signing/Owner validation, and remains the recorded acceptance evidence. Do not mistake the simulation or anonymous 302s for a second account's real session.
- **Next blocked existing gate:** a genuine non-Owner login attempt/session must be observed without creating a fictitious user or storing JWTs/cookies. The existing dual-session `apps/admin/inactive-stage-owner-probe.mjs` cannot run truthfully with only the Owner's session.
- **Independent gates before read-only operational launch:** real Member identity binding (email plus auth UUID in the same verified provider result) and actual Reader/Audit production request/permission behavior, distinct from the already-passed rollback-only DB role preflights. These require a separately controlled test/release path and cannot be claimed from an inactive `MYEONGHA_ADMIN_PRIVATE_ENABLED=false` Worker. An actual change to operational readiness/activation requires the user's **explicit approval**; no activation was made.
- Credit commands, refunds/account actions, retention and analytics maintenance remain disabled. No new roadmap tasks were introduced.

## Current Admin evidence and work log — 2026-11-04 (latest)

**Scope:** isolated `myeongha-admin` Worker and Owner-only Access gate; no customer-facing Worker, customer DML, credit command, or operational activation change in this verification.

| Step | Verified outcome | Evidence |
| --- | --- | --- |
| Access Owner gate failure diagnosed | Repeated real browser denials `ADMIN_ACCESS_REQUIRED`; Cloudflare Workers telemetry showed `source=assertion`, then fixed denial stage `signing_keys_fetch_exception`. No JWT/cookie/email logged. | PRs [#2954](https://github.com/gycha0109-beep/MyeongHa/pull/2954) and [#2955](https://github.com/gycha0109-beep/MyeongHa/pull/2955) |
| Workers runtime compatibility fixed | Signing key retrieval changed to Workers-supported manual redirect handling; unexpected 3xx responses still explicitly denied and RS256/issuer/AUD/expiry/exact Owner signature validation preserved. | [PR #2959](https://github.com/gycha0109-beep/MyeongHa/pull/2959), [integration CI (11/11 success)](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41785645208) |
| Inactive stage deployed | Latest verified inactive deploy from `main` commit `4bfd9f62142651ab69b136586d76498b1992247d`; both private-build and inactive-stage jobs passed, including live policy/role checks and anonymous denial. | [Admin Console Private Build #41787539667](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41787539667) |
| Real Owner browser passed gate | User-observed screenshot on 2026-11-04 showed precisely `{"error":"ADMIN_PRIVATE_DISABLED"}`, not the former `ADMIN_ACCESS_REQUIRED`; this is the expected success response **only after** signing and Owner validation while the console itself remains off. No live session credential retained. | User-supplied visual acceptance evidence in conversation, not stored in repository |
| Post-acceptance read-only checks | Cloudflare app still has a single exact-email allow policy, its AUD and Owner identity match Worker bindings, separate Reader and Audit Hyperdrives remain present, and all four feature flags stay `false`. Unauthenticated HTTP checks of `/admin/`, `/admin/index.html`, `/api/admin/session` return Access redirects (302), not content. | Cloudflare read-only policy/binding review and anonymous HTTP probe on 2026-11-04 |

**Not completed:** Actual **non-Owner Access session** denial has **not** been exercised live. The existing `apps/admin/inactive-stage-owner-probe.mjs` requires two distinct ephemeral, real Access JWTs and tests the inactive boundary only. Do not create a fictitious user, store tokens in Secrets, paste tokens into a chat, or count anonymous 302 / synthetically signed unit tests as a real non-Owner session.

**Remaining approved order:** (1) obtain authorized, ephemeral non-Owner session and run that probe without persisting credentials; (2) independently verify Member identity and real Reader/Audit operational read behavior under the approved release procedure; (3) seek separate Owner approval **before** enabling read-only Admin functionality. Credit commands, retention, and analytics maintenance must remain disabled pending their own prerequisites and explicit approval.

**Roadmap status:** `ROADMAP_COMPLETE` **not reached**; Owner authentication and isolated inactive staging are complete, operational read activation is not. Older historical status sections below must not override this latest evidence.

## Current verified status — 2026-11-04 (supersedes the dated handoff below)

- PR #2940 merged after the required integration CI passed: https://github.com/gycha0109-beep/MyeongHa/pull/2940.
- The Admin Console inactive staging workflow **passed both jobs** on `main` at commit `d80a15f2eb4b974f9840d5cbda186a5fb28d03d9`: https://github.com/gycha0109-beep/MyeongHa/actions/runs/41765513749.
- The dedicated `myeongha-admin` Worker was deployed with `MYEONGHA_ADMIN_PRIVATE_ENABLED`, credit commands, retention and analytics retention **all false**. The deployed bindings and the Member-verification secret were read back successfully.
- The staging CI verified the existing one-Owner Cloudflare Access policy; separate Reader/Audit Writer Hyperdrive identities; live PostgreSQL minimum privileges; audit INSERT and forbidden operations in a rolled-back transaction; and post-deployment Access/Hyperdrive policy readback.
- Anonymous access to the deployed Admin page, API and static assets was rejected in the stage HTTP probe. **Real Owner and non-Owner Access login sessions were not exercised**, and Member authentication and production Admin reads were **not** activated or verified.
- The existing customer-facing `myeongha` Worker was not the deployment target; do not conflate this isolated inactive stage with opening the Admin console for operational use.
- **Next existing roadmap gate:** exercise the dedicated `apps/admin/inactive-stage-owner-probe.mjs` with short-lived real Owner and denied-user Access JWTs supplied only as ephemeral process environment values. Never commit, persist in GitHub Actions Secrets, or paste these sessions into reports or chat. The probe verifies only the inactive Access boundary, not Member auth or production reads. Actual Admin feature activation requires separate explicit approval and its own verification; leave credit commands, retention and analytics disabled.
- Entries below describe the **2026-11-02 historical handoff**, including statements that the Worker was then undeployed. Those entries are retained as dated evidence, not the current deployment state.

## Verified completed work (historical 2026-11-02)

- Dedicated Supabase DB roles for Reader and Audit Writer were created previously.
- Cloudflare dedicated Hyperdrives were created, read back and verified with TLS verify-full and caching disabled:
  - Reader: `6d081e4736e44213bb0b6e08af7e88cc`
  - Audit Writer: `8a3a715514b64e1e9e7cb0e53d08949e`
- Twelve required stage credentials are present by **name** as encrypted environment secrets in the repository's existing GitHub Actions `Production` environment. Values must never be copied into the repository, chat or a handoff archive.
- Non-deploying private-build CI passed: https://github.com/gycha0109-beep/MyeongHa/actions/runs/41400478918
- Inactive staging CI ran: https://github.com/gycha0109-beep/MyeongHa/actions/runs/41402190932. The private-build job **passed**. The `stage-inactive` job **failed before any steps began** because GitHub environment `Production` allows **only the `main` branch**, while the Admin implementation remains on `feat/admin-console/admin-01-shell-20261026`. The branch policy was confirmed by GitHub API. This failure is **not** evidence of a Worker deployment or a database/API token failure.
- PR: https://github.com/gycha0109-beep/MyeongHa/pull/2630 (draft). The Admin Worker remains **undeployed / inactive**, and existing customer-facing `myeongha` Worker and three member/Seyeon Hyperdrives remain unchanged.

## Resume at home

1. On a trusted Windows home PC with Git, open PowerShell.
2. Use this file (retrieved from the GitHub branch) as `scripts/admin-home-continue.ps1`. Execute it on the home PC. It clones the same existing branch to `$env:USERPROFILE\Documents\MyeongHa-admin-console-home-20261102` and refuses to overwrite a dirty repo.
3. Continue normal source edits and PR CI from the home checkout. Do **not** export database passwords, API tokens or certificate private keys to your home PC; the relevant GitHub Actions encrypted Secrets are already configured for CI.
4. Deploy the isolated Admin Worker only after resolving the **Production main-only environment branch policy** through the existing governance path (e.g. approved merge to main when PR readiness is achieved, or an explicitly separately scoped staging environment and credentials). Do not relax Production branch protection or automatically merge the draft PR to force staging.
5. For status checks: `gh run view 41402190932 --repo gycha0109-beep/MyeongHa`; `gh pr view 2630 --repo gycha0109-beep/MyeongHa`.

## Remaining roadmap

1. Resolve the proper protected deployment path without weakening existing customer production controls.
2. Deploy `myeongha-admin` **with all features false**, protected by the dedicated Cloudflare Access owner policy.
3. Read back deployed bindings and verify real Reader/Audit Writer access, denied operations, owner-only login and anonymous rejection.
4. Activate only the approved Admin features after independent verification. Credit commands and retention/analytics maintenance remain disabled until their respective prerequisites are met.

## Security and machine boundaries

- `Production` Secrets are encrypted and cannot be read back through the GitHub UI or API. Their presence proves registration, not validity. Secret values are not part of this handoff.
- School-local `prod-ca-2021.crt` is **not** committed; no cert or role passwords are needed for basic home development.
- Do not clone over the existing home checkout with unrelated local changes. The helper uses a dedicated folder.
- The prior school-local credential bootstrap is complete; do not rotate or re-register credentials merely to work from home.
