# Production Operations Worklog — Phase 8-A KCP migration source and live ACL

> 2026-11-07 KST | Track: `ops` | Exact investigated `main`: `dba6f436e90e9a83c27137fa218ab5115d048cf4`
> Production project: `cnsfpcdiyofqvhpcegfc` | PostgreSQL 17.6 | Transaction: `READ ONLY`
> Parent roadmap: `docs/operations/PRODUCTION_OPERATIONS_EXIT_ROADMAP_20261107.md`
> Work PR: [#3103](https://github.com/gycha0109-beep/MyeongHa/pull/3103)
> Reproducer: `scripts/operations/production-kcp-version-pair-acl-readonly.sql`

## Completed work units

1. **Exact-main vs applied-ledger SQL source:** Git `20261029012000` vs Production `20261029012948` are exactly identical SQL bytes (7,349 bytes, SHA-256 `b544d06947b31d3d6593ef29e611ac062fe86455caf23ac2f91925b839de86e6`). Version labels and original application authority remain distinct.
2. **Four same-name, different-version pairs:** Git `20261027125500` ↔ applied `20261027043527`, Git `20261027163500` ↔ applied `20261027074247`, Git `20261027185000` ↔ applied `20261027081929`, Git `20261028110500` ↔ applied `20261028011357`. Their applied SQL is byte-for-byte the corresponding Git SQL **except the final 10 UTF-8 bytes** `\n\ncommit;\n` on the repository file. The source-framing hashes are pinned by `test/ops/owner-kcp-sandbox-migration-terminator-parity.test.mjs`.
3. **Live Production authority probe:** Added and successfully executed metadata-only `scripts/operations/production-kcp-version-pair-acl-readonly.sql` on the existing project. Observed migration ledger count **241**, frontier `20261105075227`, and `transaction_read_only=on`. All five named functions currently exist (one current catalog row per name) and are owned by `postgres`; all five use `SECURITY DEFINER` and configure `search_path`. Current effective `EXECUTE`: **0/5** `anon`, **0/5** `authenticated`, **0/5** `service_role`; **0/5** directly granted to `PUBLIC`; **4/5** for `myeongha_api_executor`. The remaining internal credit ACK function is not API-executable.
4. **Private table boundary:** Current `commerce_private.owner_sandbox_receipt_attestation_v1` exists, owned by `postgres`, has RLS enabled and direct SELECT denied to `anon`, `authenticated` and `myeongha_api_executor`.

## What the evidence does not prove

This is a timestamp-limited Production **source/metadata/role-access** observation. It does **not** prove version identity, historical deploy actor/commit, post-creation overwrite absence, full live function body hash parity, all grant/membership edges, complete RLS/DDL restoration in an isolated provider, Hosted Auth/Storage recovery, authoritative privacy replay, or whole-service RPO/RTO. Effective access may change after another deployment. Keep P0 #1887 OPEN, `dr_ready=false`, `serviceResumptionAllowed=false`, Phase 8 BLOCKED.

No raw migration statement/body or user data was persisted as observation; no Production DML/DDL, migration repair, account/canary, secret, network traffic alteration or paid resource provisioning performed.

## Remaining and next

- **Remaining:** All unmatched versions still need defensible source/provenance disposition and full restored schema/role/ACL/provider-ledger parity. This slice alone is not Phase 8 acceptance.
- **Next:** Continue read-only historical wrapper/owner/role-membership comparison for remote-only `20261008090417` and review gaps in the available isolated restore; keep the existing provider-equivalent Hosted target and Production privacy canary approval boundaries intact.
- **CI/merge:** PR #3103 requires exact-head CI success and merge verification; no success/merge can be inferred from an enabled auto-merge flag.

Watchtower-Track: ops
