# General Security — Cloudflare primary correction

Watchtower-Track: security

The user clarified that Cloudflare is the primary server. Vercel deployment or alert evidence must not establish completion for Cloudflare. Existing main runtime documentation and the static-preview Worker are not the live Ops Worker source.

## Actual target and source

- Account: `410d3f82ed3ccc66609a2b698803859b`; Worker: `myeongha`.
- Origin: `https://myeongha.gycha0109.workers.dev`.
- Source: Ops PR #2420, `feat/ops/cloudflare-authdb-clean-snapshot-20261021@3eb2089a82f285434739ed44659b1637b8a7f575`.
- Live deployment: `1017687e-19e9-4994-ae18-4486171f27e2`, version `bcd7ecb4-aad1-4bc3-9129-e37e1d3f4efd` (100%).
- Fresh no-credential HTTP checks: health 200; me 401; calculation and preview-reading POST 404; all no-store.
- Binding metadata contains Auth/DB settings but no Saju calculation/preview activation or Saju producer credential binding. No secret values were read.

## Implementation

The two actual Ops Saju adapters now pass the existing server-only admission release switch to the existing Production runtimes. The switch parser is byte-identical to main's parser from PR #2556; no second numeric policy or normalization path is introduced. PostgreSQL remains the numeric authority. Each request still owns and closes its subject pool. Malformed activation fails closed; 429/Retry-After/no-store are preserved.

The actual Ops Worker now wraps recognized API routes with the existing security-event emitter, using the existing router's static route IDs. This closes the direct Cloudflare consumer gap for 401/403/429/5xx without logging paths, queries, headers, bodies, or credentials. Routing and Se-yeon fences remain inside the existing handler; this change grants no positive Se-yeon capability. Scope was extended to this direct consumer because #1527 requires event coverage on the primary server.

## Correction of earlier Vercel work

- Main PR #2556 merged shared DB/runtime/release code at `9d2aac82b708688006ece056a6126017be343173`; exact-head integration run `40103136461` passed all 11 jobs.
- Production Supabase applied four scoped migrations; main reconciliation run `40103765922` verified exact SQL digests and post-deploy platform integrity without SQL replay.
- Restricted counter cleanup run `40103892692` passed verified TLS/worker authority and deleted 0 expired counters.
- The newly created Vercel staged deployment was not promoted. `--skip-domain` unexpectedly assigned the auxiliary `myeongha-johnny-self.vercel.app` alias. It was restored to deployment `dpl_4CXrnKcX1VaUZn9Bjnn5r9FKXeJu`; the staged deployment's authoritative alias list was then empty. The canonical `myeongha.vercel.app` alias was never reassigned by this rollout.
- Canary-v2 DB policies were disabled after the target correction. No admission policy is currently enabled; no Guest fixture was created and no authenticated canary was executed.
- Vercel API 4xx rule `ar_01a16e32-e6de-75fb-88b8-434e5ae0a8b5` exists as auxiliary-provider coverage only. It provides no Cloudflare alert evidence.

## Current completion boundary

Verification on this branch: 50 direct composition/event/router/Saju/fence tests PASS; TypeScript build PASS; Cloudflare static build PASS (11 HTML entries). Pinned Wrangler 4.151.2 ran the actual local workerd and passed 10 HTTP health/method/query/API-denial/Chat-fence requests without credentials or remote DB access. This proves local import/execution and denial boundaries only. The existing bundle-budget runner requires Linux and rejects Windows before its dry-run; its budget result is not claimed as PASS. Local workerd was stopped after verification.

Cloudflare composition/event changes are locally verified; live admission enforcement and Cloudflare alert delivery are **not verified or deployed**. The existing live Saju routes remain closed. Do not count a 404 or a mocked composition test as a positive quota canary.

The existing [Ops deployment ownership](../ops/CLOUDFLARE_WORKER_DEPLOYMENT_OWNERSHIP.md) restricts this shared Worker to the Ops branch and its guarded deployment command. This security branch must not upload over the live Worker or merge the entire unrelated Ops migration into main. Apply the reviewed security change through Ops, then use its admitted Saju runtime/producer bindings and a version-bound Member/Guest canary before enabling the production-v2 limits. Cloudflare alert transport must be established separately; the Vercel rule cannot substitute for it. Platform default-ACL issue #425 remains external.
