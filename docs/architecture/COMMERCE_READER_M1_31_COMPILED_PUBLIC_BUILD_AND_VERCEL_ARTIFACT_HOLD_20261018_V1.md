# M1-31 — Built static web output and Vercel deployment evidence boundary

> 2026-10-18 · Watchtower-Track: commerce · stacked Draft on M1-30 #2287. Read-only deployment metadata, local/CI build outputs only. **No deployment, promotion, rollback, production SQL or paid Reader activation.**

## M1-30 carried evidence

M1-30 exact head `f662ecb66ea3ad697bc27dc3b5e24acbd4835acf` finished CI `39109672929` SUCCESS (Commerce, db-authority-core, CI Verify) plus Governance, Web PR Gates and Web Auth Browser SUCCESS. Its 6 checked-in first-party API graph tests and 11 `/api/me` dispatcher negatives passed. However that verified **source-tree routes**, not bytes published in a hosting build or the live serverless deployment.

## M1-31 new candidate artifact admission

Vercel's checked-in `vercel.json` declares `buildCommand: npm run build:web` and `outputDirectory: public`. The revised `build:web` script now ends with

`node scripts/ci/official-reader-public-build-output-fence.mjs --check`

**after** the existing static copy + Vite build succeed. This scans **actual built local/CI `public/` files**, recursively, and fails on:

- Compiled JS/HTML/CSS/JSON/SVG/text containing the exact private Reader SQL entrypoint, minimal-read module identifier, private transaction constructor, or internal Writer SQL identifier.
- Vite source maps, TypeScript/SQL/PEM/key sources, env files, package manifests or raw serverless `api/me` source accidentally copied into public static content.
- Symlinks or unsupported file types, missing `public/index.html`, output path escape or missing built output.

The inspection emits a deterministic SHA-256 inventory digest of **file names, lengths and content digests**, without copying contents or uploading secrets. This digest describes the **local/CI static browser candidate**, not a production deployment's attested content hash. Six synthetic Vitest negatives/positives in `official-reader-public-build-artifact-m1-31.test.mjs` prove the check flags deliberately injected Reader/Writer SQL, source files, source maps and symlinks, and accepts a clean fake bundle. Real build invocations execute the same scanner automatically.

M1-30's source import/rewrite graph + dispatcher regression remain required alongside this **new independent compiled static-byte fence**. Passing both cannot prove absence of a runtime-generated endpoint, credential compromise, unpublished serverless function manifest or dynamic third-party code.

## Independent read-only live Vercel metadata observation

Authorized Vercel project's id `prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP` was inspected **read-only**. The latest READY production deployment encountered in this check was:

- deployment `dpl_BdqGVBHJe5N5BR2Utj5134hTpoTy`, `main` SHA `5f9f9d7f26a6c9054582e812344b7e385573a1b9`, status READY;
- **not** the M1-30 PR commit `f662ecb...`, and **not** this M1-31 branch;
- Vercel `list_deployment_files` returned **404 file tree not found** for that deployment. This is unavailable artifact evidence, **not proof** that the Reader module is absent from actual deployed functions.

Therefore the real deployed serverless bundle for the new candidate has **NOT** been audited. The main production deployment must **not** be represented as a tested preview of this Draft PR. No new Vercel deployment was created, and no production domain/alias was changed.

## Release/operations gates

The actual serverless deployment bundle/tree (exact deployment ID, exact commit SHA, target, route manifest, immutable serverless function byte inventory) requires independent future attestation with authorized read-only artifact access. Until then `HOLD_M1_31_LIVE_FUNCTION_BUNDLE_UNVERIFIED` is mandatory, regardless of source graph and static output CI.

The dated 2026-10-17 live migrations observation (45 reviewed source versions absent from live and one remote-only historical SeYeon restore), managed Supabase Owner/GRANTOR evidence, authentic nonproduction restore/DR drill, 15 Owner/recovery gates, paid Reader/private Writer and actual payments/refunds remain unresolved. No production SQL, ACL extension, API release, deployment or PR merge permitted by this test.
