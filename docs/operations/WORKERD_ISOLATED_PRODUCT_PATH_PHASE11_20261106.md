# Phase 11 local Workers product-path smoke

Run the existing GitHub Linux acceptance workflow from `main` after the isolated mode merges.

```sh
gh workflow run postgres-isolated-rls-capacity-acceptance.yml --ref main -f experiment=workerd
```

The smoke uses Wrangler 4.152.0 in local mode and runs the existing calculation handler in `workerd`. Four disposable GoTrue members, a temporary PostgreSQL18 RLS fixture and the pinned Saju host are started by the existing runner. The local Hyperdrive binding is configured with the temporary DB's loopback connection string. The fixture verifies the non-privileged login and targets only the disposable loopback services.

The acceptance artifact requires 12 successful sequential calculations, anonymous 401 with `no-store`, Health 200, and verified cleanup of the local runtimes and Docker project. The artifact includes the Wrangler/workerd versions, source commit, and smoke latency quantiles. The local proof uses a dedicated fixture entrypoint and leaves deployed Worker ingress, hosted Hyperdrive pooling, provider capacity, and Production scaling unverified. [Cloudflare local Hyperdrive configuration](https://developers.cloudflare.com/hyperdrive/configuration/local-development/).

The preliminary Windows prototype used `workerd`, PGlite over the PostgreSQL protocol, a synthetic loopback Auth response and the pinned Saju host. Twelve product calculations succeeded. The main-only Linux mode uses native PostgreSQL18 and actual GoTrue and requires its own successful run.

## 2026-11-06 — Linux request failure and local reproduction

The first GitHub Linux run passed PostgreSQL 18 RLS and Saju build checks, then failed at `workerd_requests`. Artifact `13483731182` has status `BLOCKED_INCOMPLETE` and SHA-256 `1d3cfcf6299b28f55bf30d0d143948d4bc5c547e70bb7db0f4f0d80726ad4a4a`. [GitHub Linux run](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42176584603).

The local Linux Docker reproduction used Wrangler 4.152.0, workerd 1.20261019.1, disposable GoTrue 2.196.0, native PostgreSQL 18 and the pinned Saju source. The fixture had required a literal loopback hostname in the Worker-visible connection string. Wrangler pins the upstream database to loopback and workerd exposes a virtual binding hostname with a PostgreSQL SSL option. The fixture now checks the binding's hostname and permits its local SSL option. The GoTrue fetch also uses manual redirect handling so the existing verifier can reject upstream redirects without following them. [Cloudflare local Hyperdrive configuration](https://developers.cloudflare.com/hyperdrive/configuration/local-development/).

With both corrections, the local Linux run completed 12/12 authenticated calculations, returned anonymous 401 with `no-store` and Health 200, and cleaned up the local runtimes and Docker resources. Local p50/p95/p99 were 166.654/192.324/205.404 ms.

## 2026-11-06 — verified GitHub Linux observation

- GitHub Actions completed successfully on `main` `28150e3992991e15b7b508c4c6210848836ad704`. Local workerd 1.20261019.1 used four disposable GoTrue members, native PostgreSQL 18 with forced RLS, and Saju `9807ce89c08afc61b587560d515a475efd819032`. [GitHub Linux run](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42184314101).
- The 12 sequential authenticated calculations all succeeded. There were zero unavailable and unexpected responses. Successful p50/p95/p99 were 118.339/134.804/138.106 ms. Anonymous denial, Health and runtime/Docker cleanup passed.
- The original 1,125-byte sanitized JSON has raw SHA-256 `19e80a33d2e0b119b89dff74d04a6d0d7b4281593b521f05995139c83f15135c`. [Preserved original JSON](REAL_GOTRUE_PG18_SAJU_WORKERD_LINUX_OBSERVATION_20261106.json), [GitHub artifact 13486618907](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42184314101/artifacts/13486618907).
- The smoke covers the calculation route in a local fixture entrypoint. Sustained/concurrent local workerd traffic, dependency interruption and recovery in workerd, hosted Hyperdrive pooling, production capacity and scaling thresholds need separate evidence.
## 2026-11-06 — official GitHub Linux Saju outage/recovery evidence

- [GitHub Linux #42197099729](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42197099729) **SUCCESS** from `main` `af41b57575536ba39e5b4ff138dcca80252d30fc`, with actual isolated GoTrue/JWT, PostgreSQL18 forced RLS, local Wrangler 4.152.0/workerd 1.20261019.1 and pinned Saju engine.
- Baseline: 12 requested / 12 successful; p50 127.809 ms, p95 141.546 ms, p99 153.991 ms. Saju outage: calculation HTTP 503 and independent Health HTTP 200. Post-restart: four concurrent calculations requested / 4 successful, zero unavailable/unexpected; p50 171.709 ms, p95 176.095 ms, p99 176.259 ms. Anonymous denial, runtime and Docker cleanup confirmed.
- [Exact unmodified 1,414-byte JSON](REAL_GOTRUE_PG18_SAJU_WORKERD_RECOVERY_LINUX_OBSERVATION_20261106.json) SHA-256 `25742bd0be04281f7004ccacf419ca26310f808d2fcfff6abf6331a76fd54a49`; [original GitHub artifact 13492477469](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42197099729/artifacts/13492477469). Independent test pins hash, source SHA, accepted response counts and failure/health isolation.
- This is **not** Production Workers/Hosted Hyperdrive recovery or a representative capacity/SLO claim. Production scaling and full Hosted DR/RPO/RTO acceptance remain explicitly false; [P0 #1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887) remains open.

## Phase 11 opt-in 15-minute workerd overlapping-request observation (not yet Linux-measured)

The existing manual workflow supports a **separate** `experiment=workerd_overlap` after the implementation PR has passed full CI and merged to `main`:

```sh
gh workflow run postgres-isolated-rls-capacity-acceptance.yml --ref main -f experiment=workerd_overlap
```

- Uses the **same pinned local Wrangler 4.152.0**, temporary GoTrue member JWTs, native PostgreSQL18 with forced RLS, and pinned Saju source as the prior 12-request workerd smoke; the Docker network remains disposable and no Hosted credentials are read. The JWT lifetime is bounded at 1,800 seconds to cover the 900-second trial. Saju in this workerd slice is a **local Node HTTP host without a CPU/memory cgroup limit**; do not cross-attribute separate constrained Saju results.
- Schedules 900 fixed 4-request waves (4 requests/second) over 900 seconds, 3,600 offered requests total. The measured window records 200s, 503s, transport failures, non-200/503 unexpected status, skipped slots, successful-only p50/p95/p99 and elapsed time; all attempted and skipped requests must account for exactly 3,600. The concurrent `peak` is **client-side in-flight requests**, *not a measurement of admission inside workerd* or of Hosted Hyperdrive pooling. Unexpected HTTP statuses are rejected; observed 503 or transport failures are retained as failure evidence rather than silently converted to success.
- After the window, the existing Saju stop → product calculation 503 / independent Health 200 → restart → 4 concurrent calculations recovered, anonymous 401, private-response no-store, workerd and Docker cleanup checks still run. The original short `experiment=workerd` remains unchanged.
- An incomplete, failed or unclean run must retain the runner's `BLOCKED_INCOMPLETE` artifact. Only a complete actual Linux run, verified original JSON bytes and checksum, can be used as an isolated measurement. No workerd 15-minute results are claimed until that run succeeds. The local Hyperdrive connection string **bypasses Hosted pooling/caching**, per the [Cloudflare local Hyperdrive contract](https://developers.cloudflare.com/hyperdrive/configuration/local-development/).
- Not a Production Worker throughput/SLO guarantee, Saju constrained CPU ceiling, Hosted connection-pool sizing or Production scaling approval. `productionCapacityProven=false`, `productionScalingThresholdApproved=false`, `drReady=false`, `serviceResumptionAllowed=false`.
