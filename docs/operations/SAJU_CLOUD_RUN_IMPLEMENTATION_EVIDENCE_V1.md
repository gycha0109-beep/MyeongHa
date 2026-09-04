# Saju Cloud Run Implementation Evidence v1

> Recorded: 2026-09-04 KST  
> Architecture authority: `docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md`  
> Hosting decision: `docs/architecture/SAJU_PRODUCTION_HOSTING_DECISION_V1.md`  
> Evidence scope: repository implementation and CI only; no live Google Cloud provisioning claim

## 1. Current verdict

```text
Hosting provider decision        CLOSED
Repository deployment contract  MERGED
Saju merged main                 4072f9dd34a51fe3062f0cff9de25f57d3963533
Pull request                     gycha0109-beep/Saju#247
Live Google Cloud resources      NOT VERIFIED
Saju production activation       BLOCKED
MyeongHa production binding      NOT COMPLETE
```

The Saju repository now contains the guarded Cloud Run deployment contract on `main`. This evidence does not assert that a Google Cloud project, Artifact Registry, Workload Identity Federation, Secret Manager secrets, Cloud Run service, production URL, or traffic promotion exists.

## 2. Merged implementation

Saju PR `#247`, `ci(ops): prepare guarded Cloud Run production deployment`, was squash-merged with exact expected PR head verification.

Merged Saju main SHA:

```text
4072f9dd34a51fe3062f0cff9de25f57d3963533
```

Merged files:

- `.github/workflows/production-cloud-run.yml`
- `scripts/verify-production-calculation-service.mjs`
- `docs/production-cloud-run-deployment.md`
- `.gitignore` credential-file exclusion
- `.dockerignore` credential-file exclusion

The workflow is manual `workflow_dispatch` only. Merging the workflow does not deploy or mutate Google Cloud resources.

## 3. Deployment safety controls implemented

The merged workflow requires and verifies:

- exact 40-character Saju source SHA;
- requested SHA equals current Saju `main` before cloud candidate creation;
- a second current-main check before traffic promotion;
- Node 24 repository verification via `npm run check`;
- `linux/amd64` OCI build;
- non-root container user verification;
- local `/healthz` and authenticated calculation smoke before cloud actions;
- GitHub OIDC to Google Workload Identity Federation rather than stored cloud keys;
- Google Secret Manager numeric secret-version bindings;
- Artifact Registry image identity resolved to an exact `sha256` digest;
- Cloud Run no-traffic tagged candidate revision;
- startup and liveness probes on `/healthz`;
- synthetic positive/negative authentication smoke on the candidate;
- `promote=false` by default;
- explicit 100% traffic migration only after candidate verification;
- post-promotion synthetic smoke when promotion is requested;
- no Bearer credential value in workflow summary/output;
- `gha-creds-*.json` excluded from Git and Docker build context.

GitHub Actions used by the production workflow are pinned to exact commit SHAs, and Google Cloud SDK is pinned to version `583.0.0`.

## 4. CI evidence

PR-head SHA:

```text
b6c45d46285e6007e97d4445eaafb7e42a2700ab
```

Verified PR checks before merge:

| check | result |
|---|---|
| `Production Calculation Container` | PASS |
| `CI` | PASS |
| `PIE Prospective Shadow` | PASS |

The general CI verification included repository lint/typecheck/tests/build; the observed test run completed with 574 passing test files and 3934 passing tests.

Post-merge on Saju main `4072f9dd34a51fe3062f0cff9de25f57d3963533`:

- `Production Calculation Container` push run: PASS.
- general `CI` push run: running at the time this evidence record was first created; it must not be marked PASS until GitHub reports a completed successful conclusion.

## 5. Source-governance evidence

As of this record:

```text
Saju main protected: false
Saju repository rulesets: 0
```

This remains `P1-DEP-02` from the production operations architecture. The production deployment workflow partially compensates at artifact-promotion time through exact-current-main rechecks, but that is not equivalent to repository branch protection.

The available GitHub connector exposes protection/ruleset reads but no branch-protection/ruleset write action, so this record does not claim that source governance has been remediated.

## 6. Production activation blockers

The following evidence is still required before Saju production activation can be closed:

- billing-enabled Google Cloud project and required APIs;
- Artifact Registry repository;
- repository-scoped Workload Identity Federation provider;
- least-privilege deployer/runtime service accounts and IAM;
- protected `production-saju` GitHub environment or equivalent deployment approval boundary;
- Secret Manager active/optional previous service Bearer versions;
- bootstrapped Cloud Run service with intended public invocation/network policy;
- finite initial CPU, memory, concurrency and max-instance values;
- exact-digest no-traffic candidate deployment;
- candidate positive/negative smoke;
- explicit traffic promotion;
- canonical Cloud Run production origin;
- MyeongHa `MYEONGHA_SAJU_SERVICE_ORIGIN` and `MYEONGHA_SAJU_SERVICE_BEARER` binding;
- authenticated MyeongHa -> Saju production E2E;
- cold-start/latency baseline;
- rollback drill;
- runtime monitoring and actionable alerting.

## 7. Non-claims

This evidence does not support any of the following statements:

```text
Saju Production Active
Production Infrastructure Complete
Highly Available
Scalable
Disaster Recovery Ready
Zero-Downtime Deployment
Automatic Failover
```
