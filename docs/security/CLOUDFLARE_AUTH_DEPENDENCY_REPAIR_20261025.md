# Cloudflare API restore direct dependency repair

Watchtower-Track: security

## Scope

PR #2572 restores the single primary Cloudflare Worker's existing API consumers.
Its CI run `40131343791` failed because the imported caller passes the approved
server `webOrigin`, while the two shared OAuth modules still accept only the
legacy default origin. The Preview configuration fixture also omits the newly
required `nodejs_compat` flag.

Restore only the existing Ops shared-module composition contract and update that
fixture. The caller remains responsible for the exact approved host and request
origin binding in `approvedCloudflareAuthOriginV1`. Shared modules validate an
exact HTTPS origin before producing a callback. Provider activation flags, PKCE,
Supabase callback, mobile deeplink, and the existing default origin remain intact.
No request parameter or client-supplied header selects the trusted origin.

## Validation

Targeted OAuth/Cloudflare boundary tests: 6 files / 60 cases PASS, including
malformed trusted-origin rejection, Cloudflare Naver PKCE, web/mobile callbacks,
and existing shared/browser consumers. `npm run build` PASS; `git diff --check`
PASS. Required remote CI remains a merge gate.
Synthetic provider tests do not establish live OAuth-provider approval, an
authenticated Production session, or Saju admission enforcement. Cloudflare
positive/quota canary and runtime event ingestion remain separate rollout gates.
