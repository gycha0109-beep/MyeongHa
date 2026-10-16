# M1-01 — Payment completion → Verified Receipt / Reader issuance boundary

> Date: 2026-10-16 KST
> Track: `commerce`
> Based on stacked roadmap PR #2163 and M0-01 PR #2165; no rebase/merge of parent Drafts.
> Authority: verified provider evidence ≠ Entitlement Grant ≠ Reader binding ≠ paid T2 disclosure.

## Concrete source readback

| Stage | Actual source / SQL | Role / transaction | Outcome |
| --- | --- | --- | --- |
| Provider ingress | `commerce-provider-payment-completion-orchestration.ts` | Authenticated webhook ingress; calls internal Commerce transaction for context | No caller-supplied subject identity |
| Provider facts | `commerce-payment-verification-execution.ts` | Server lookup **between** two distinct DB transactions | Payment facts checked against pinned DB context |
| Persist verified Receipt/Event | `commerce-verified-payment-evidence-persistence.ts` → `1050` | `SET LOCAL ROLE myeongha_commerce_internal_executor` → `cmd_persist_verified_payment_evidence_v1` | Only Attempt / Intent / Receipt / Provider Event, replay returns canonical IDs |
| Original internal fulfillment | `1090` → `1080` | No call from provider completion TS | Existing primitive, not integrated issuance |
| D2 scope-locked issuance/bind | Draft `1820`: `internal_apply_official_reader_unified_receipt_v1`, `internal_cmd_bind_official_reader_unified_v1` | SQL draft explicitly **REVOKEs EXECUTE** from `myeongha_commerce_internal_executor`, `myeongha_api_executor` and public/service roles | Isolated D2, **not** a runtime entrypoint |
| Paid T2 | `official-reader-held-t1-t2-preflight-v1.ts` | Separate subject transactions; held-only | No positive disclosure or protected body commit |

`1050` explicitly grants its persistence function to the Commerce internal executor; it explicitly states **no entitlement effect**. D2's private invoker ACL and D1 Product L0 → Reading×Reader L1 lock ordering are established in stacked Draft source, not deployed/runtime-authorized facts.

## New executable regression

`apps/api/src/commerce-provider-payment-completion-m1-boundary.test.ts` invokes the **actual provider completion orchestration**, with an in-memory PostgreSQL client that refuses any unexpected SQL. It verifies:

1. Two internal-role DB transactions, with server verification outside both.
2. Canonical Receipt/Event metadata is persisted and returned without calling 1080/1090/1220/1820.
3. Replayed evidence is **not** an entitlement or Reader access grant.
4. Authentication failure prevents DB/provider work.
5. Provider request mismatch prevents persistence.
6. Persistence conflict rolls back the write transaction; no Reader issuance attempted.

This is an **offline synthetic caller-contract test**, not a PostgreSQL integration race, live role-catalog inspection, or a demonstration of successful D2 invocation.

## Residual G-01 / next executable slice

- **Not closed:** No authorized runtime caller may yet turn persisted Receipt into D2-issued purchased Grant and Reader binding. A successful verification response alone is **not** a purchase-completed-with-access response.
- **M1-02:** In an isolated PG15/17 fixture, use a real `1050`-persisted verified Receipt and test a *private* D2 transaction through an explicitly owned, limited test execution identity. Show complete pinned capability set, Reader selection, exact Grant and bind, replay, failure rollback, and legacy direct-path EXECUTE denial. Reuse existing D2 positive fixture and D3 race tests rather than reimplementing them.
- **Owner gate:** The runtime executor/ACL choice, production-equivalent transaction integration, saleable Offer/Charge Terms, final paid T2 and legal/Privacy release remain unapproved. **Do not** grant runtime EXECUTE or mount a route to make this test pass.
- **Tests:** Vitest CI must be checked at the exact new PR head. PG15/17 tests have not been executed by this slice; do not mark them PASS.

No migrations, production DB mutation, external PortOne call, actual charge/refund, entitlement mutation, paid Reader disclosure, deployment, or merge.