# MyeongHa Web Deployment Baseline

Status: DEPLOY-01 implementation contract

## Current production-capable surface

This baseline deploys only `apps/web` as a static web artifact.

The following are intentionally not promoted to production runtime in this slice:

- `apps/api` command modules: no production HTTP entrypoint or production persistence adapter is declared yet.
- Supabase migrations: repository CI validates the DDL, but production migration execution is a separate release concern.
- Character/Saju provider secrets: no secret-dependent browser bundle is introduced here.

Do not create fake `/api` endpoints merely to make the deployment look complete.

## Vercel binding

The Vercel project is linked to GitHub repository `gycha0109-beep/MyeongHa`.

Repository-owned deployment contract:

```text
main push
→ Vercel Git integration
→ npm run build:web
→ public/
→ Vercel static deployment
```

`vercel.json` is the repository authority for the build command, output directory, Git branch deployment policy, and static response headers.

## Branch policy

Automatic Git deployments are enabled for `main` only.

All other branches are disabled by default because the repository has high branch/PR churn and the linked Vercel project currently runs on a Hobby plan. Preview deployments should be created deliberately when a deploy-specific review needs one, rather than for every evidence/research branch.

## Build isolation

`scripts/build-web-static.mjs` copies only public web asset types from `apps/web` into `public/`.

Development-only files such as these must not be published:

- `apps/web/package.json`
- `apps/web/README.md`
- `apps/web/dev-server.mjs`
- source maps
- dotfiles / environment files

`public/` is generated and ignored by Git.

## Verification

`npm run check` includes:

```text
build:web
→ verify:deploy
```

The deployment verifier checks:

- required public pages/assets exist;
- local HTML/CSS references resolve inside the generated artifact;
- development-only files do not leak;
- Vercel build/output policy remains pinned;
- non-main auto-deploy remains disabled;
- prototype deployments remain `noindex`.

## Public-launch boundary

The current web surface still contains non-canon placeholder characters and demo Reading material. For that reason the Vercel response includes:

```text
X-Robots-Tag: noindex, nofollow, noarchive
```

Removing `noindex` is a separate public-launch decision and must not happen as an incidental deployment change.

## Next deployment slices

### DEPLOY-02 — API runtime boundary

- choose the production HTTP runtime for `apps/api`;
- add explicit health/readiness endpoints;
- bind production persistence adapters;
- define request/auth/CORS boundary;
- deploy separately or behind same-origin routing without changing semantic authority.

### DEPLOY-03 — Production Supabase release path

- create a production project/environment boundary;
- define migration apply/rollback/recovery procedure;
- separate CI DDL verification from production migration execution;
- verify RLS/auth assumptions against the real environment.

### DEPLOY-04 — Environment and secret contract

- enumerate browser-public vs server-only variables;
- fail closed when required server secrets are absent;
- prevent secret values from entering static output or client logs.

### DEPLOY-05 — Domain / launch / observability

- custom domain and DNS;
- production smoke checks;
- runtime error/log policy;
- uptime/availability checks;
- remove `noindex` only after product launch gate.
