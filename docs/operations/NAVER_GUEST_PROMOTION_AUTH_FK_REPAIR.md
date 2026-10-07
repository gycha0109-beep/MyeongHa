# Naver OAuth Guest-to-Member repair

## Failure and scope

Naver OAuth and Supabase token exchange succeeded in Production, but
`POST /api/auth/promote-guest` failed with PostgreSQL `42501`. The existing
`cmd_promote_guest_v1` attempted a direct `auth.users.id` lookup under the constrained
`myeongha_guest_promotion_owner`, which has column SELECT but lacks `auth` schema
USAGE. Consequently, the Member subject was never linked and `/api/me` returned 401.

The management `postgres` connection has schema USAGE without grant option, so the
initial single-grant restoration could not take effect. Both guarded attempts
rolled back. The presence of GRANT in migration 0870 does not prove it was ever
successfully applied in the hosted environment; the origin of this mismatch is unknown.

The approved repair changes only the existing SECURITY INVOKER core function.
The API continues independently verifying the Member token and exact Guest bearer.
The existing validated, immediate `subjects_auth_user_fk` verifies identity existence
atomically when binding `auth_user_id`, without direct auth-table reads. Only that
specific FK error maps to the existing `cmd_guest_promote_auth_identity_not_found`
constraint and SQLSTATE 23503; unrelated FK errors propagate.

No role grants, RLS policies, table definitions, function owner/ACLs, account rows,
canonical-owner behavior, Guest-session consumption, or existing-Member merge policy
are changed. The existing runtime wrapper remains unchanged. APK builds are excluded.

## Verification

- `test/db/guest_promotion_auth_fk_authority.sql` reproduces missing auth USAGE and
  tests actual runtime-wrapper/RLS promotion, response-loss replay, nonexistent identity,
  existing Member binding, context mismatch, session-write rollback, and denied direct
  auth/core/table access. All fixture changes roll back.
- The regression runs in the existing PostgreSQL 15 runtime and PostgreSQL 17.6 suites,
  and the core authority suite. PG17 uses the existing fixture that verifies migration
  0860 under its separate managed-principal case; that unrelated migration is skipped
  in the Guest-promotion PG17 case.
- Existing `guest_promotion_concurrency.sh` verifies duplicate requests, different
  identities competing for one Guest, two Guests competing for one identity, expiry,
  consumed-session rejection, exact canonical owner, and unchanged PUBLIC EXECUTE denial.
- Before deployment, confirm the current core owner/ACL and unchanged runtime wrapper,
  review the single migration, and pass the current integration candidate. The migration
  refuses missing/non-invoker core authority or missing/disabled/deferred identity FK.
- After deployment, compare function owner/ACL and wrapper body with preflight; confirm
  no role privilege expansion; retry real Naver login and require promotion 200,
  `/api/me` 200 Member, and persistence after refresh before capturing login completion.

Local PostgreSQL 18.6 verified the targeted regression and existing concurrency tests.
Hosted PostgreSQL 15/17 CI and Production runtime results must be recorded in the PR
and incident evidence; local checks alone do not establish Production success.

## Deployment and rollback

Deploy through the existing Supabase Production migration workflow after merge.
This applies `20261007150457_guest_promotion_auth_fk_validation.sql`; check the dry run
to ensure no unapproved pending migration is included. The DB-only repair needs no
additional Vercel configuration change. The already-enabled Naver flag remains true
for review capture; general Naver approval and resubmission remain external steps.

If rollback is required, restore only the previous `cmd_promote_guest_v1` function body
from migration 0300 in a transaction, preserving owner/ACL. This restores the known
permission failure if auth schema USAGE is still absent. Do not grant broad role
membership, table SELECT, BYPASSRLS, or disable RLS/FK enforcement as a workaround.

Preflight security-advisor findings (six unrelated policy/RLS notices plus existing
Auth configuration notices) are historical baseline for comparison, not fixes included
in this change. The full catalog guard and postdeploy platform-integrity audit remain
required.
