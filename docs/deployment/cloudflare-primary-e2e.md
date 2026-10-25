# Cloudflare primary Worker live E2E

Watchtower-Track: ops

Target is **only** https://myeongha.gycha0109.workers.dev; no Vercel or second Worker proxy.

## Execution

- PR changes to the E2E verifier run the **anonymous** workflow against the currently deployed primary Worker without GitHub Secrets.
- After the PR is merged to main, a main push of these files additionally runs a separate **authenticated** workflow using the existing production Member smoke account in GitHub's \`production\` environment. A workflow_dispatch on main needs exact \`VERIFY_CLOUDFLARE_PRIMARY_E2E\` confirmation.
- The CLI can be used on a permitted network with \`MYEONGHA_CLOUDFLARE_E2E_MODE=anonymous node scripts/verify-cloudflare-primary-e2e.mjs\`.
- No registration, Birth-profile creation, chat turn sends, LLM invocation or Commerce mutation takes place. The only authenticated calls with effects are a Member session sign-in (consumes one ordinary rate-limit slot) and the existing calculation-only POST.

## Evidence rules

- HTTP 200 + constant JSON is necessary for /api/health.
- /api/readiness is a **configuration-only** signal. A 404/503 here must be recorded, not interpreted as successful DB connectivity. Real DB proof requires Member /api/me = 200 and exact expected subject, plus current Birth revision.
- Anonymous Saju requests must not succeed. A 404 indicates its governed positive mode may still be disabled; this **does not** count as positive Saju E2E evidence.
- Positive Saju proof needs Member sign-in, DB subject verification, Birth revision match, 200 calculation-only result, and no interpretation authority.
- Every protected chat probe must remain non-200, JSON 503, without cookies, redirects or cross-origin access.
- Scripts emit only case identifiers and HTTP codes. They deliberately never log credentials, token, cookie, subject ID, raw response bodies, SQL or personal data.
- A successful offline Vitest check is not live E2E success; require successful live workflow jobs and confirm production deploy provenance before removal of \`myeongha-web\`.

GitHub governance requires the PR-triggered anonymous workflow to contain **no production Secret references**. The production Member E2E is isolated in `cloudflare-primary-e2e-member.yml` and cannot run on PR events.

Observed 2026-10-25 public E2E: readiness=503, unauthenticated Member=503, Saju calculation=404. This is **not** authorization to force a positive E2E or enable Saju mode. Follow the existing Security Cloudflare Saju canary prerequisite gate before using a Member credential.

## Saju-only emergency kill switch (2026-10-25)

The **one** existing production Worker owns both Saju routes. Added
`MYEONGHA_CLOUDFLARE_SAJU_KILL_SWITCH` is a server-side **stop switch**
for `/api/me/saju/calculation` and `/api/me/saju/preview-reading`.
It does not add another Worker, public route, DB role or permission.

- Exact `true` (or any explicitly malformed value) returns the original
  no-store 404 before Saju credentials, DB, producer or reading request body.
- Exact `false` or absence only clears this emergency stop. It **does not**
  activate either route. The existing independent exact approval modes remain
  `MYEONGHA_CLOUDFLARE_SAJU_MODE=approved-calculation-only-v1` and
  `MYEONGHA_CLOUDFLARE_SAJU_PREVIEW_MODE=approved-preview-reading-v1`.
- The existing global `MYEONGHA_CLOUDFLARE_EMERGENCY_HOLD` remains a
  separate, broader Auth/DB emergency stop. Neither gate can override the other.
- A production ON switch is a non-sensitive, independent `secret_text`
  binding on `myeongha` only, preserved by `wrangler deploy --keep-vars`.
  Do not add the secret or its value to git, logs or a browser request.
- To unblock, first verify the approved producer Bearer exists in the authorized
  source, the current Member/DB/TLS binding is valid, approved calculation and
  preview configurations are present, the approved abuse-admission policy is
  active, and the pinned Worker version is correct. The already-existing
  Cloudflare Saju canary must pass its governed phases. Do not invent a Bearer,
  copy an unknown secret or flip activation values to bypass failed canaries.
- Emergency response to any anomaly: turn this stop switch to exact `true`
  through the authorized Cloudflare Worker secret API; verify returned deployment
  identity and then repeat credential-free HTTP checks. Do not change the
  existing Seyeon Chat security gate or the whole-worker emergency HOLD.

A PASS of unauthenticated boundary E2E proves only that these surfaces are
stopped or access-controlled, **not** that Member Saju production calculation
succeeds. Do not remove `myeongha-web` based on a kill-switch test alone.
