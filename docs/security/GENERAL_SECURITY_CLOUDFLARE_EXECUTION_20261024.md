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

PR #2571 is MERGED into Ops at `322b56dafff65f5d243a4915bc23eaab5cd0a5bb` after CI/Governance/Web/GitGuardian passed. The current main single-Worker configuration needs the same log collection setting, so it is carried forward here without changing routing or enabling any API.

Cloudflare native monitor `fab0d24cd73740f5b2dba97766f78a66` was created through the supported dashboard and independently read back with the official `alerting/v3/policies` API: enabled, exact account and `scriptName=myeongha`, `ACCESS_DENIED`/`RATE_LIMITED` event count query, `zscore_spike`, native defaults 3.5 sigma / 5m recent / 4h baseline, actual execution interval 1m, repeat 1h, existing account-owner email recipient count 1. The query returns aggregate counts only and its preview showed zero for the available window. This is not an organic baseline, live event collection proof, or notification receipt. Source query and provider authority are in `config/security/cloudflare-primary-*`.

The active, separate 「클라우드플레어 워커 정리」 task is restoring Auth/DB/Saju source in PR #2572 after the unified static-only Worker deployment. Its current source includes the two admission activation calls from #2560. This security task does not overwrite that active rollout with an old Ops build. It continues independent monitor setup and will verify the actual primary API/version after that rollout. No further user approval is needed merely because the work is being coordinated through the existing Ops source.

PR #2560 is MERGED into the Ops branch at `e8abb1135b17550f2f4569f2cec920382244cfea`. Exact-head CI run `40130485820`, Governance, Web and GitGuardian passed. This is an Ops source merge, not a main merge or a live deployment claim. A pinned Wrangler 4.151.2 local dry-run compiled the exact merged source: 955.78 KiB uncompressed / 182.97 KiB gzip. The stock Linux-only budget script was not modified or bypassed.

Fresh 2026-10-25 HTTP checks now return 503 `API_NOT_ACTIVATED_ON_PREVIEW` for me and both Saju routes, with health still 200. This differs from the previous Ops/Auth 401/404 behavior and from the reviewed Ops source; a fresh Ops source deployment is needed rather than assuming that the latest platform version contains this PR. No authenticated session was sent into that mismatched version.

The Ops Wrangler configuration now enables Workers Logs for existing application console/security events, with full head sampling and automatic invocation logs disabled. The latter avoids creating a separate request-URL invocation log stream. Numeric rate limits remain exclusively in the DB; this setting does not enable Saju, Auth, or paid plans. Cloudflare native monitor setup and independent provider readback remain required after actual log ingestion is verified. Configuration follows the [official Workers Logs contract](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).

2026-10-25 KST resume: live Worker advanced independently to deployment `58476751-fc92-4de0-9d35-3b91e4347c50`, version `16e4b572-6190-482b-81fe-596bad3c0fe2` (100%). Existing source branch #2420 remains at the source SHA above; no inference that this security change is deployed is made. Binding names now include Saju service origin, but not Saju mode/preview mode or admission activation.

CI run `40104886385` exposed two pre-existing fixture errors, reproduced directly before correction: the supposed route-count corruption set `static.root.n` to its unchanged value 1, and the Face preview test expected no cleanup for an empty invalid string while the existing implementation cleans up every returned string. The fixtures now mutate the count relative to its real value and assert exact cleanup of each invalid candidate. No production validation, evidence acceptance rule, or Face behavior was weakened or changed. Scope expanded only to these mandatory CI failures.

Verification on this branch: 50 direct composition/event/router/Saju/fence tests PASS; TypeScript build PASS; Cloudflare static build PASS (11 HTML entries). Pinned Wrangler 4.151.2 ran the actual local workerd and passed 10 HTTP health/method/query/API-denial/Chat-fence requests without credentials or remote DB access. This proves local import/execution and denial boundaries only. The existing bundle-budget runner requires Linux and rejects Windows before its dry-run; its budget result is not claimed as PASS. Local workerd was stopped after verification.

Cloudflare composition/event changes are locally verified; live admission enforcement and Cloudflare alert delivery are **not verified or deployed**. The existing live Saju routes remain closed. Do not count a 404 or a mocked composition test as a positive quota canary.

The existing [Ops deployment ownership](../ops/CLOUDFLARE_WORKER_DEPLOYMENT_OWNERSHIP.md) restricts this shared Worker to the Ops branch and its guarded deployment command. This security branch must not upload over the live Worker or merge the entire unrelated Ops migration into main. Apply the reviewed security change through Ops, then use its admitted Saju runtime/producer bindings and a version-bound Member/Guest canary before enabling the production-v2 limits. Cloudflare alert transport must be established separately; the Vercel rule cannot substitute for it. Platform default-ACL issue #425 remains external.
