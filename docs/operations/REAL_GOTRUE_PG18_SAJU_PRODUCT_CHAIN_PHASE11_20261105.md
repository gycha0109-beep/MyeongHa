# Operations Phase 11 — disposable real GoTrue → PostgreSQL18 → Saju product request chain

> Track: `ops` | **Short real Linux observation verified** (2026-11-05 KST)
>
> Approved authority: [Production Operations Architecture §38 Phase 10–12](../architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md).
> Do not promote isolated observations to Production readiness.

## Verified Linux baseline and contention

[Run #41979084279](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41979084279) succeeded at `main` `429b82e6eace9963d39bb97bf6d642e9516d4d26` after the member-mapping fix merged in [#3021](https://github.com/gycha0109-beep/MyeongHa/pull/3021). The [original 1,336-byte JSON](REAL_GOTRUE_PG18_SAJU_LINUX_OBSERVATION_20261105.json) from [artifact 13393376541](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41979084279/artifacts/13393376541) has raw SHA-256 `cbb0ae2a1c7f9a3b36cd6a23fa0899c32ede31eb946867cf1fd00eec4c9d30ed`.

| Scenario | 200 | 503 | Other | Successful p50 / p95 / p99 (ms) |
| --- | ---: | ---: | ---: | ---: |
| Sequential, 12 requests | 12 | 0 | 0 | 110.083 / 127.595 / 137.235 |
| Concurrency 8, 32 requests | 18 | 14 | 0 | 196.154 / 254.166 / 255.515 |

The pool peaked at its two-connection limit. Successful acquisition p95 was 108.871 ms and SQL p95 was 81.742 ms in a fixture that includes an 80 ms SQL delay. The Node gateway made 44 authenticated GoTrue calls and 30 calculation calls. Anonymous access was rejected and Health stayed available. The job succeeded through the runner's Docker cleanup guard. The JSON contains no member identifiers, tokens or request bodies.

The test used a Node gateway, a disposable PostgreSQL RLS fixture and an unconstrained pinned Saju host. Sustained load, Saju cgroup limits, per-failure attribution, post-pressure calculation recovery and Cloudflare Workers runtime behavior still need evidence. Production capacity and scaling thresholds remain unapproved.

## Actual components and authority boundary

Existing `postgres-isolated-rls-capacity-acceptance.yml` manual, `main`-only workflow (GitHub Ubuntu26.04) retains its previous local RLS/pool proof and appends a **separate** three-dependency experiment without new workflows or Production secrets.

1. Start a disposable isolated Docker network containing **actual GoTrue v2.196.0** backed by a separate **PostgreSQL 15 auth-only database**. Only GoTrue is published on an ephemeral **127.0.0.1** host port. Containers, network and database volume are deleted after each run.
2. Create four random `example.invalid` local synthetic accounts through real GoTrue `/signup`, verify each user with GoTrue `/user` using the issued signed JWT, and map those UUIDs to **four test-only subjects**.
3. Use the existing real **temporary PostgreSQL18** startup, non-superuser and non-BYPASSRLS executor, enforced row ownership, subject-local transactions and actual DB queries with a 2-connection pool. No Hosted/Production connection is available.
4. Checkout the pinned public Saju source `9807ce89c08afc61b587560d515a475efd819032`, build it on the ephemeral runner, and launch its **actual production calculation host** bound to local loopback with a test bearer. The real current-subject calculation API and existing Member identity verifier/Saju adapter run as a Node test HTTP gateway, **not inside Cloudflare Workers runtime**.
5. Measure 12 sequential requests and 32 requests with 8 client workers distributed across the four synthetic identities. Capture HTTP 200/503/error counts, successful p50/p95/p99, actual PostgreSQL18 acquire/query p95, pool max/peak, authenticated and anonymous behavior, Saju calculation invocations, independent Health and no-store/non-reflection.
6. Independently validate the JSON output and embed its main SHA in a 14-day identifier-free GitHub artifact. Missing proof, runtime setup failure, unsigned/bad identity, invalid engine behavior or incomplete cleanup leave `BLOCKED_INCOMPLETE`. Never print synthetic emails, IDs, passwords or JWTs in the proof.

**Reuse:** Existing isolated Postgres18 functions, GoTrue `scripts/local/saju-bridge-auth-init.sql` and pinned Saju host are reused. The existing administrator `myeongha-admin` Worker and its Production Reader/Audit Hyperdrive credentials are deliberately excluded, since load tests must not target live administrator/Hosted data.

## Optional 15-minute overlap trial

The manual Linux workflow also offers `experiment=overlap` for a distinct 15-minute concurrent trial. Each one-second wave schedules four synthetic members together, up to 3,600 slots. A late or full wave is skipped as a group. The runner records both client in-flight counts and arrivals that reach four concurrent calculations at the Node gateway, plus short-ramp database acquisition failures at concurrency 1/2/4/8. It uses the same constrained Saju cgroup, recovery check and resource cleanup as `sustained`.

```sh
gh workflow run postgres-isolated-rls-capacity-acceptance.yml --ref main -f experiment=overlap
```

Use this option after its source is merged. Its overlapping-request result requires a successful Linux run with the new mode.

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

## First actual main-only Linux attempt: RED, health transport not established (2026-11-05 KST)

- [GitHub Actions #41959169370](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41959169370), source SHA `e022e4c9078d3d468354a3d29d289b4699fc6544`, **FAILURE**. Previous actual PostgreSQL18 RLS/pool/product fixture step PASS, pinned Saju source checkout/build PASS; temporary Docker Auth PostgreSQL15 reported Healthy and GoTrue container reported Started, but the runner's 127.0.0.1 `/health` probe did not succeed within its 60-second bound. **No real GoTrue member / actual integrated Saju performance observations exist from this run.** New product artifact `13384148817` was `BLOCKED_INCOMPLETE` and must not be treated as PASS.
- **Targeted correction in this fix PR (still unverified):** The Auth PostgreSQL container remains attached **only** to a private `internal:true` Docker network without published ports. GoTrue now additionally joins a separate project-owned bridge with a published `127.0.0.1` port; this follows the Docker documented hybrid network separation and permits the host test client to connect without admitting external hosts. Neither Worker nor Hosted/Production connection is introduced.
- The fail-closed health check now emits only Docker GoTrue's coarse lifecycle state and a local-only internal health boolean when host loopback remains unreachable, rather than any container logs, credentials or personal identifiers. After PR CI/integration and merge, rerun the **existing** main-only manual workflow to distinguish network transport issues from GoTrue startup issues based on actual Linux evidence.
- No 8th-phase recovery, production-capacity, scaling or DR acceptance claim was changed; all production safety gates stay false.

## Second actual main-only Linux attempt: RED, private Vitest failure (2026-11-05 KST)

- [GitHub Actions #41968120105](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41968120105) at exact `main` `deb8fa3888455b13984a0ae014bc285c0eebf58d` **FAILURE**. The earlier actual temporary PG18 RLS/pool/product-synthetic section completed successfully, and the pinned real Saju source/build succeeded. GoTrue Docker Auth DB and the revised two-network container started; **loopback HTTP health progressed past its former failure**. The new actual three-dependency Vitest command failed before any valid integrated measurements could be published.
- **Proof boundary:** artifact `isolated-real-product-chain-phase11-41968120105` ID `13389150012` contains `BLOCKED_INCOMPLETE`; there are no trustworthy normal/contended real Auth+PG18+Saju latency or throughput values from this run. The private Vitest output was deleted with the disposable scratch directory and intentionally not echoed because it can contain transient JWTs, synthetic identities and SQL error detail. The precise failing test substage is therefore **not yet known**, not asserted to be any particular code defect.
- **Targeted diagnostic change:** the existing main-only runner now emits only one of the explicitly enumerated safe test stages (member signup, PG18 startup, RLS binding, Saju start, API setup, baseline, contention, anonymous/health, proof write). Raw Vitest output, tokens, UUIDs and SQL messages remain unpublished; a missing stage is explicitly classified as a test-harness/import issue. On failure the artifact is still `BLOCKED_INCOMPLETE` and all ephemeral Docker containers, private database and test files must be removed.
- **Next:** complete this PR's normal and integration CI, merge, then rerun the existing manual test on `main` exactly once. Fix the newly identifiable failing substage using the sanitized result; **do not** infer that real three-service capacity has been measured.

## Linux diagnostic run: isolated member-to-subject SQL rejected (2026-11-05 KST)

[Run #41972622365](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41972622365) at main `8f7ab1b73510733960c760ecd92e0a02f88c1079` passed the separate PostgreSQL18 proof and pinned Saju build. The three-dependency step passed disposable GoTrue member registration and stopped at `subject_rls_map`. Artifact `13390187818` reports `BLOCKED_INCOMPLETE`; its JSON SHA-256 is `1d3cfcf6299b28f55bf30d0d143948d4bc5c547e70bb7db0f4f0d80726ad4a4a`. It contains no combined latency or capacity result.

The disposable fixture's PL/pgSQL function had unmatched body delimiters. An independent PostgreSQL 18.6 engine check reproduced SQLSTATE `42601` with the original statement and confirmed that the corrected function maps a synthetic member, limits the executor to one owner row under RLS, and denies an unmapped member with `28000`. After this fix is merged, dispatch the same Linux workflow to validate the complete path.
