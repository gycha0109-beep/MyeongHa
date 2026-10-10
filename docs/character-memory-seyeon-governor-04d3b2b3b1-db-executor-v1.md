# D3B2B-3B1 — dormant Governed-only PostgreSQL executor

Watchtower-Track: character-memory

## 변경 범위
- `1630_seyeon_governed_execution_role_v1.sql` creates `myeongha_seyeon_governed_executor` with NOLOGIN / NOINHERIT / NOBYPASSRLS.
- `USAGE public` + exact member/guest Subject resolvers + Subject assertion/current Subject + governed Start/Settle are its only explicit grants.
- Legacy Start/Settle/Record, the two internal helpers, raw cost ledger, daily budget and model rate-card tables remain inaccessible.
- No membership links to `myeongha_api_executor` or `myeongha_seyeon_cost_meter_owner` are introduced; they are tested as forbidden.
- Existing `myeongha_api_executor` role and its OFF-compatible grants are unchanged.

## PostgreSQL verification
- `test/db/seyeon_governed_execution_role_v1.sql` checks role shape, membership, 12 exact function contracts, direct table access denial.
- It switches to the new role and actually attempts three legacy RPC calls and cost table SELECT; each must fail for insufficient privilege.
- It verifies a governed-only role can atomically reserve, settle and replay a provider cost without duplicate budget debit, using offline committed Subject fixture.
- Every test row/policy is rolled back. No paid AI calls or Production activation.

## This is NOT a completed credential isolation
- The role is NOLOGIN: there is still **no separate governed-only database LOGIN credential**, no isolated connection pool, and no Proof that a real Production DB session cannot `SET ROLE myeongha_api_executor`.
- CI executes `SET LOCAL ROLE` under a privileged test harness; this proves effective SQL ACLs only, not service credential non-escalation.
- 3B2 must establish a distinct least-privilege connection principal without membership in common/legacy execution roles, with exact session_user/current_user assertions on two independent DB connections.
- 3C must route ENFORCE Chat and Post-turn cost Start/Settle through that isolated governed-only pool and fail closed before provider dispatch; OFF stays on its current runner.
- 3D REVOKE of legacy RPC on the common API executor remains separate, pending safe retirement of OFF / in-flight calls, owner authorization and rollback readiness.
- D4 independent DB concurrency/deletion/crash, D5 production operations, G4/G5/G6 remain HOLD.

## Explicit prohibitions
- No Production ENFORCE, no real paid OpenAI calls, no operator rate/budget seeding, no common executor privilege revocation, and no new browser/public access.