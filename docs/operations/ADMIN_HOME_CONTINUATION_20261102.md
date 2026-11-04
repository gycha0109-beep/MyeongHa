# Admin Console — home-PC continuation (2026-11-02)

This handoff contains **no secrets**. It is for continuing the existing Admin track from a second Windows PC without copying credentials from the school PC.

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
