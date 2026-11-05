# Operations Phase 11 — disposable real GoTrue → PostgreSQL18 → Saju product request chain

> Track: `ops` | Implementation status: **CODE ONLY / real Linux observation NOT YET RUN** (2026-11-05 KST)
>
> Approved authority: [Production Operations Architecture §38 Phase 10–12](../architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md).
> Do not promote isolated observations to Production readiness.

## Actual components and authority boundary

Existing `postgres-isolated-rls-capacity-acceptance.yml` manual, `main`-only workflow (GitHub Ubuntu26.04) retains its previous local RLS/pool proof and appends a **separate** three-dependency experiment without new workflows or Production secrets.

1. Start a disposable isolated Docker network containing **actual GoTrue v2.196.0** backed by a separate **PostgreSQL 15 auth-only database**. Only GoTrue is published on an ephemeral **127.0.0.1** host port. Containers, network and database volume are deleted after each run.
2. Create four random `example.invalid` local synthetic accounts through real GoTrue `/signup`, verify each user with GoTrue `/user` using the issued signed JWT, and map those UUIDs to **four test-only subjects**.
3. Use the existing real **temporary PostgreSQL18** startup, non-superuser and non-BYPASSRLS executor, enforced row ownership, subject-local transactions and actual DB queries with a 2-connection pool. No Hosted/Production connection is available.
4. Checkout the pinned public Saju source `9807ce89c08afc61b587560d515a475efd819032`, build it on the ephemeral runner, and launch its **actual production calculation host** bound to local loopback with a test bearer. The real current-subject calculation API and existing Member identity verifier/Saju adapter run as a Node test HTTP gateway, **not inside Cloudflare Workers runtime**.
5. Measure 12 sequential requests and 32 requests with 8 client workers distributed across the four synthetic identities. Capture HTTP 200/503/error counts, successful p50/p95/p99, actual PostgreSQL18 acquire/query p95, pool max/peak, authenticated and anonymous behavior, Saju calculation invocations, independent Health and no-store/non-reflection.
6. Independently validate the JSON output and embed its main SHA in a 14-day identifier-free GitHub artifact. Missing proof, runtime setup failure, unsigned/bad identity, invalid engine behavior or incomplete cleanup leave `BLOCKED_INCOMPLETE`. Never print synthetic emails, IDs, passwords or JWTs in the proof.

**Reuse:** Existing isolated Postgres18 functions, GoTrue `scripts/local/saju-bridge-auth-init.sql` and pinned Saju host are reused. The existing administrator `myeongha-admin` Worker and its Production Reader/Audit Hyperdrive credentials are deliberately excluded, since load tests must not target live administrator/Hosted data.

## What this experiment does not prove

- Cloudflare runtime behavior, its network routing/limits, remote TLS, real Hosted Supabase Auth or the Customer Worker deployment itself.
- Saju service CPU/memory isolation **within this combined run**; previous standalone Docker cgroup Saju results remain separate evidence.
- Real diverse user traffic, Production pool size, stable 5/15-minute sustained app capacity, automatic scaling thresholds or service-resumption approval.
- Production Auth, DB, customer data, payments, secrets, migration actions or Hosted DR.

Until genuine measured evidence exists, all `productionCapacityProven=false`, `productionScalingThresholdApproved=false`, `drReady=false`, `serviceResumptionAllowed=false`, `outputContainsIdentifiers=false`. Phase 8 and [P0 #1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887) remain blocked.

## Next required validation

1. Complete PR CI/integration and merge.
2. Dispatch the **existing** manual `postgres-isolated-rls-capacity-acceptance.yml` on current `main`. This command is never allowed on PR head or Production.
3. Inspect artifact `isolated-real-product-chain-phase11-<run-id>`: validate result, source hashes, real JWT verification, actual PG18 query timing and engine invocation, then save original sanitized bytes and SHA-256 in ops documentation.
4. If successful, the remaining Phase 11 gap is a representative controlled 5/15-minute Worker-runtime/Saju resource-cgroup combined capacity measurement. Phase 12 may derive a review threshold from controlled observations but never invent Production scale targets.

Watchtower-Track: ops
