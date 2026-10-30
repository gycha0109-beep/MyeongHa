# Phase 13 — Main-commit production operations acceptance evidence

Source: `docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md` §33, §38 Phase 13.

The executable `scripts/operations/inspect-main-operations-acceptance.mjs` gathers **actual GitHub evidence at an exact 40-character commit SHA**, rather than treating a successful PR CI or a generic deployed marker as acceptance of Production operations.

## Use

```sh
GH_TOKEN=<read-only GitHub token> node scripts/operations/inspect-main-operations-acceptance.mjs --sha <full-main-commit-sha>
```

The same script supports `GITHUB_TOKEN` in GitHub Actions. It **only** performs GET requests on the fixed MyeongHa repository and never changes a run, issue, branch, deployment, DB, provider or resource. Access tokens are not printed in error or evidence output.

It pins each observed CI, Governance, Web Browser Smoke and Supabase Production run to `head_sha == requestedSha`, `head_branch == main` and `event == push`. It uses the latest run per workflow so an old green run does not conceal a newer RED, cancellation, or pending run. The exact selected run IDs and links are part of the output.

For the Supabase Production workflow, a green workflow is **not** interpreted as a successful SQL deployment: the script additionally looks up its `deploy-migrations` job and reports `SUCCESS`, `SKIPPED`, `FAILURE` or `NOT_OBSERVED` independently. `sourceIsCurrentMain` also distinguishes a successfully checked historical merge SHA from a newer current main.

The §33 fourteen-point Production acceptance list is included with **observed only** evidence; it does not automatically turn local CI/browser tests into live liveness, authenticated synthetic smoke, metric visibility, Saju compatibility, provider deployment state or rollback proof. The command emits `acceptanceDecision=NOT_EVALUATED_BY_COLLECTOR`; no extra promotion or DR gate is installed.

## Practical next execution

After merging, invoke the collector for the verified merge SHA and attach its identifier-free output to the operations record. When specific production smoke, hosting and rollback evidence exists, it can be recorded explicitly in its respective workstream; the collector deliberately never guesses those results.

This closes the **read-only exact-commit CI/deployment-workflow evidence inventory implementation** portion of Phase 13, not all of Production operational acceptance. No production changes or external provider resources are requested by this step.

Watchtower-Track: ops
