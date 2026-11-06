# Phase 11 local Workers product-path smoke

Run the existing GitHub Linux acceptance workflow from `main` after the isolated mode merges.

```sh
gh workflow run postgres-isolated-rls-capacity-acceptance.yml --ref main -f experiment=workerd
```

The smoke uses Wrangler 4.152.0 in local mode and runs the existing calculation handler in `workerd`. Four disposable GoTrue members, a temporary PostgreSQL18 RLS fixture and the pinned Saju host are started by the existing runner. The local Hyperdrive binding is configured with the temporary DB's loopback connection string. The fixture verifies the non-privileged login and targets only the disposable loopback services.

The acceptance artifact requires 12 successful sequential calculations, anonymous 401 with `no-store`, Health 200, and verified cleanup of the local runtimes and Docker project. The artifact includes the Wrangler/workerd versions, source commit, and smoke latency quantiles. The local proof uses a dedicated fixture entrypoint and leaves deployed Worker ingress, hosted Hyperdrive pooling, provider capacity, and Production scaling unverified. [Cloudflare local Hyperdrive configuration](https://developers.cloudflare.com/hyperdrive/configuration/local-development/).

The preliminary Windows prototype used `workerd`, PGlite over the PostgreSQL protocol, a synthetic loopback Auth response and the pinned Saju host. Twelve product calculations succeeded. The main-only Linux mode uses native PostgreSQL18 and actual GoTrue and requires its own successful run.
