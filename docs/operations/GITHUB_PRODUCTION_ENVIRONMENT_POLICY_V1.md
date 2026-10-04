# GitHub Production Environment Policy v1

Status: repository contract implemented; live control-plane evidence required before closure.

Watchtower-Track: ops

## Authority boundary

Production GitHub Actions jobs that consume Production credentials MUST bind to the GitHub Environment named `production`.

The repository-side workflow contract is necessary but not sufficient. The live GitHub Environment MUST independently restrict which Git ref may enter the Production environment.

## Required live control-plane policy

Configure `Settings → Environments → production` with this policy:

- Deployment branches and tags: **Selected branches and tags**
- Allowed branch: **main**
- Allowed tags: **none**
- Required reviewers: **none while MyeongHa is effectively single-operator**
- Wait timer: **none**
- Administrator bypass: **prevent bypass when the repository/account plan exposes that control**

Do not broaden the deployment branch rule to feature branches, pull-request refs, wildcards, or tags.

Required-reviewer policy is intentionally separate from source provenance. A self-review-only approval does not create an independent security boundary.

## Secret scope audit

Production secret values MUST NOT be printed, copied into evidence, or regenerated merely to inspect scope.

Audit only secret names and whether each credential is repository-scoped or `production` Environment-scoped. Moving or deleting an existing credential is a separate change and requires a safe replacement/rollback plan.

## Non-mutating canary

Workflow: `.github/workflows/production-environment-policy-probe.yml`

The probe:
- is `workflow_dispatch` only;
- has only `contents: read`;
- binds to `environment: production`;
- consumes no GitHub secrets or environment variables;
- performs no network, database, Supabase, Vercel, deployment, artifact, or repository mutation.

Dispatch input:

`confirm = PROBE_PRODUCTION_ENVIRONMENT`

### Negative canary

Dispatch the probe with a non-main feature branch as the workflow ref.

Expected result: the `production` Environment rejects the deployment because the ref is not an allowed deployment branch. The probe step MUST NOT execute.

Record the workflow run ID and GitHub's branch/environment rejection evidence.

### Positive canary

Dispatch the same probe from `main`.

Expected result: the Environment admits the job and the probe completes successfully.

Record the workflow run ID and exact main SHA.

## Closure evidence

This policy is complete only when all are true:

1. repository Governance verifies the probe contract;
2. the live `production` Environment is confirmed main-only;
3. a feature-branch probe is blocked before its step executes;
4. a main probe succeeds;
5. no Production system or credential value is touched by either probe.
