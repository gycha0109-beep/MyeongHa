# Cloudflare Worker Preview — Git-connected CD (scoped v1)

Watchtower-Track: ops

## Deployment mechanism

Cloudflare Workers Builds is connected to gycha0109-beep/MyeongHa through its GitHub integration. Git push on the admitted branch starts a build and deploys a Worker Preview. GitHub Actions remains the independent PR test/merge gate. Do not manually POST Cloudflare builds or upload a Worker from a local machine.

| Field | Pinned value |
| --- | --- |
| Repository | gycha0109-beep/MyeongHa |
| Admitted branch | feat/approved-character-card-labels-20261022 |
| Worker | myeongha |
| Preview name | approved-character-labels |
| Cloudflare build command | npm run build:web && npm run verify:deployment-config |
| Cloudflare deploy command | node scripts/cloudflare-preview-cd.mjs |
| Wrangler version | 4.152.0, pinned inside the script |
| Static assets | public/, built from the 11 Web entry pages |
| Config and Worker | wrangler.jsonc and cloudflare/preview-worker.mjs |

GitHub push → Workers Builds npm ci → web build and static artifact verification → preview CD script → pinned Wrangler preview → preview URL and GitHub check. GitHub Actions CI/Governance/Web/Mobile are independently required by the PR's existing merge policy. Preview CD starts on push and can finish before GitHub Actions; it is not an all-green-before-preview gate.

## Preview and safety scope

Preview: https://approved-character-labels-myeongha.gycha0109.workers.dev

- Standard production workers.dev URL is disabled; isolated preview URLs remain enabled.
- Static files only. Unported /api/* routes return 503 in the preview Worker; no proxy to live Vercel/API or live Postgres.
- Preserve response CSP, no-store, frame denial and noindex. Do not turn unknown URLs into SPA index.html.
- Existing Vercel Production, DNS, Supabase, Saju, Seyeon Reveal HOLD and PortOne activation remain unchanged.
- Preview success does not imply public production readiness or main-branch deployment.

## Admission and failures

The source-controlled deploy script rejects non-Workers-Builds invocations, unapproved branches, missing or mismatched WORKERS_CI_COMMIT_SHA compared with git HEAD, unsafe Wrangler routing, or missing generated HTML assets. Cloudflare's Git branch filter independently permits only the named branch.

On a RED build, investigate that run and fix the source in Git. A new commit triggers automatic CD; do not manually retry or upload during ordinary CD. A previous successful Preview is separate from a failed candidate. Revert or fix via Git to roll forward or return to a known commit. Confirm the Cloudflare check is GREEN for the exact SHA and verify the published preview still denies /api/*.

Changing the tracked branch, deploying main, enabling real API/DB, exposing billing or switching DNS requires separate Ops/Security authorization under the Cloudflare migration roadmap, not this limited CD.
