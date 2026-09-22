# MyeongHa main branch protection evidence

This document records the first repository-level enforcement proof for the MyeongHa production source branch.

- ruleset: `main-production-guard-v1`
- ruleset id: `23850762`
- target: `refs/heads/main`
- enforcement: active
- bypass actors: none
- pull request required: yes
- required approving reviews: 0
- required checks:
  - `CI Verify`
  - `Web PR Verify`
  - `Governance Verify`
- required checks must be current with the target branch: yes
- branch deletion blocked: yes
- force push blocked: yes
- linear history required: yes

## Negative canary

PR #1238 intentionally forced the root typecheck path to fail.

Observed result:

- `CI Verify`: failure
- `Web PR Verify`: success
- `Governance Verify`: success
- PR merge state: blocked
- PR was closed without merge

The negative canary proves that a red required check prevents merge into `main`.

## Positive canary

This documentation-only PR is the positive canary. It must pass all required checks and merge through the active ruleset before this evidence is considered complete.
