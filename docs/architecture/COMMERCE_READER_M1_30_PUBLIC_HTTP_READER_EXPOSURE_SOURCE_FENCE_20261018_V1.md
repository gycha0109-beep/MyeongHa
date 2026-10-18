# M1-30 — Public API reachability fence for internal Reader minimal observation

> 2026-10-18 · Watchtower-Track: commerce · stacked Draft after M1-29 #2284. No production API or database changes, Provider calls, paid Reader activation, private Writer execution or merge.

## M1-29 evidence carried forward

M1-29 established an in-process production `GET /api/me` composition test: actual runtime and Member/Guest verifier modules, synthetic upstream HTTP and strict mock DB; member Supabase Auth response and guest HMAC-backed resolver were used, not client-chosen Subject/GUC/DB-role headers. The canonical Subject and fixed execution role were bound by the existing ordinary-user transaction adapter. M1-29 did **not** create a public official Reader minimal-read endpoint or authenticate a real deployment.

The separate internal recovery adapter `postgres-official-reader-unknown-commit-read-tx-v1.ts` still accepts a *trusted-internal* `verifiedSubjectId` and sets `myeongha.subject_id` as a transaction-local DB GUC. Per M1-28, that GUC **cannot itself authenticate a user**. The Reader observation is HOLD-only and its source SQL does not authorize issuance or release.

## M1-30 source-tree reachability guard

New `scripts/ci/official-reader-minimal-public-route-fence.mjs` enumerates **all currently checked-in Vercel serverless source files** under `api/` (not merely `api/me.ts`), follows relative first-party static imports/re-exports and string-literal `import()`/`require()` recursively using the TypeScript AST, and checks Vercel `vercel.json` rewrite targets against actual `api/` entrypoints.

It must fail on any reachable direct or indirect dependency on these two protected internal implementation modules:

- `apps/api/src/official-reader-unknown-commit-minimal-v1.ts`
- `apps/api/src/postgres-official-reader-unknown-commit-read-tx-v1.ts`

It also fails on unresolvable local/first-party imports, unknown dynamic imports, unverified internal workspace imports and rewrites that point to a nonexistent serverless function. Third-party imports are not recursively audited; dynamic registration and deployed bundle contents are not proven by this scanner.

`scripts/ci/official-reader-minimal-public-route-fence.test.mjs` executes the real repository guard and tests it against temporary controlled fixture trees: legitimate route and rewrite, direct protected import, transitive re-export, dynamically computed import, unresolved internal workspace alias, and invalid rewrite target. This regression is wired into the standard `npm test` command and therefore runs in the regular Commerce CI.

`apps/api/src/official-reader-public-dispatch-m1-30.test.ts` calls the actual `api/me.ts` public dispatch resolver and requires rejection of Reader-like paths, `receiptId`, `verifiedSubjectId`, `subjectId`, `myeongha.subject_id`, invented Reader selector keys, and attempt to route through a reading-history URL. The existing `/api/me` profile target must remain available. These are **route selection** checks, not production HTTP requests.

## Limitations and explicit HOLD

The audit addresses the **checked-in first-party source import and Vercel rewrite graph**, not a deployed function manifest, external proxy, upstream WAF, arbitrary third-party dynamic code, compromised shared database credentials or live HTTP penetration. New route exposure through a packaging mechanism not represented under `api/` or `vercel.json` would require adapting this scanner. It does not attest the real Supabase managed principal, 0860 grantor, hosted REST/Data API permissions or the externally verified Member/Guest credential chain.

No new public Reader route, API permission, DB function grant, migration SQL, Provider payment/refund operation, private D2 Writer or paid Reader activation is introduced. The 2026-10-17 historical 45-source-missing/live-only SeYeon restore discrepancy, approved restore and DR exercise, actual managed Owner policy and 15 Owner/recovery evidence gates remain unapproved.

**Passing M1-30 proves only that the reviewed source-tree public import/rewrite/dispatcher paths cannot currently reach the internal minimal Reader adapter, subject to the static graph's stated limits. It is NOT production release approval. PR remains Draft / HOLD.**
