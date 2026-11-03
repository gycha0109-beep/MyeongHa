# Admin Console — home-PC continuation (2026-11-02)

This handoff contains **no secrets**. It is for continuing the existing Admin track from a second Windows PC without copying credentials from the school PC.

## Verified completed work

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
