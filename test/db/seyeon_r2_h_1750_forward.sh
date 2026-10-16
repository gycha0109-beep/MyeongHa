#!/usr/bin/env bash
set -euo pipefail
# Watchtower-Track: ops; disposable PG17 ONLY.
hold() { echo "HOLD_R2_H_1750_$1" >&2; exit 1; }
[[ "$GITHUB_ACTIONS" == true && "$DB_SUITE" == postgres17 && "$PGHOST" == localhost && "$PGPORT" == 5432 && "$PGUSER" == postgres && "$PGDATABASE" =~ ^myeongha_ci_case_[0-9]+$ ]] || hold NOT_DISPOSABLE
[[ "$(psql -X -Atqc 'show server_version_num')" =~ ^17[0-9]{4}$ ]] || hold NOT_PG17
[[ "$(git hash-object supabase/migrations/1520_account_deletion_finalizer_relationship_runtime_sync.sql)" == 9cab84727c33d2ffb6985119b22ec284c9ed025a ]] || hold ORIGINAL_1520_DRIFT
[[ "$(git hash-object supabase/migrations/1530_character_reading_artifact_durable_commit_v1.sql)" == 0b369d4955c935992e5243dcb4c2ec87c722a876 ]] || hold ORIGINAL_1530_DRIFT
before="$(mktemp)"
after="$(mktemp)"
trap 'rm -f "$before" "$after"' EXIT
psql -X -q -1 -v ON_ERROR_STOP=1 -f supabase/migrations/1520_account_deletion_finalizer_relationship_runtime_sync.sql >/dev/null || hold 1520_APPLY_FAILED
psql -X -q -1 -v ON_ERROR_STOP=1 -f supabase/migrations/1530_character_reading_artifact_durable_commit_v1.sql >/dev/null || hold 1530_APPLY_FAILED
psql -X -qAt -v ON_ERROR_STOP=1 -f scripts/operations/seyeon-r2-h-1530-catalog-readonly.sql > "$before"
[[ "$(psql -X -Atqc "select count(*) from pg_auth_members where roleid='myeongha_character_reading_artifact_runtime_owner'::regrole and member=current_user::regrole")" == 1 ]] || hold ORIGINAL_MEMBERSHIP_NOT_REPRODUCED
echo PASS_R2_H_1750_ORIGINAL_CREATOR_MEMBERSHIP_REPRODUCED
psql -X -q -v ON_ERROR_STOP=1 -f test/db/fixtures/1750_character_artifact_creator_membership_cleanup_v1.proposed.sql >/dev/null || hold PROPOSAL_APPLY_FAILED
psql -X -qAt -v ON_ERROR_STOP=1 -f scripts/operations/seyeon-r2-h-1530-catalog-readonly.sql > "$after"
node --input-type=module - "$before" "$after" <<'JS'
import {readFileSync} from 'node:fs';
const [a,b]=process.argv.slice(2).map(p=>JSON.parse(readFileSync(p,'utf8').trim()));
// The disposable migration creator is postgres (superuser): pg_has_role MEMBER
// remains true after REVOKE even with pg_auth_members direct edge absent.
if(a.creatorRoleMembership!==true||b.creatorRoleMembership!==true)
 throw Error('EXPECTED_SUPERUSER_MEMBERSHIP_SEMANTICS_CHANGED');
for(const key of Object.keys(a)){
 if(JSON.stringify(a[key])!==JSON.stringify(b[key]))throw Error('UNEXPECTED_CATALOG_DRIFT_'+key);
}
if(b.tableCount!==1||b.tableRls!==true||b.writerOwnedByNarrowRole!==true
 ||b.writerSecurityDefiner!==true||b.ownerRoleLeastPrivilege!==true
 ||b.ownerRoleSchemaCreate!==false||b.apiWriterExecute!==true
 ||b.anonWriterExecute!==false||b.authenticatedWriterExecute!==false
 ||b.serviceWriterExecute!==false||b.apiTableDml!==false
 ||b.authorizedForProduction!==false||b.drReady!==false)
 throw Error('ACCESS_CONTROL_BASELINE_FAILED');
console.log('PASS_R2_H_1750_DIRECT_MEMBERSHIP_ONLY_REMOVED_CATALOG_PRESERVED');
JS
[[ "$(psql -X -Atqc "select count(*) from pg_auth_members where roleid='myeongha_character_reading_artifact_runtime_owner'::regrole and member=current_user::regrole")" == 0 ]] || hold ROLE_MEMBERSHIP_RETAINED
if psql -X -q -v ON_ERROR_STOP=1 -f test/db/fixtures/1750_character_artifact_creator_membership_cleanup_v1.proposed.sql >/dev/null 2>&1; then
 hold REAPPLY_ALLOWED
fi
[[ "$(psql -X -Atqc "select count(*) from pg_auth_members where roleid='myeongha_character_reading_artifact_runtime_owner'::regrole and member=current_user::regrole")" == 0 ]] || hold REAPPLY_DRIFT
echo PASS_R2_H_1750_REAPPLY_FAIL_CLOSED

# Dedicated non-superuser grantor probe: PostgreSQL 17 REVOKE is scoped
# by membership grantor. An ADMIN OPTION actor is not automatically authorized
# to revoke a membership that postgres granted. Prove the existing 1750
# candidate FAILS CLOSED in this topology, not that it removed effective access.
# This is disposable PG17 only; no actual Production creator attribution.
actor=myeongha_r2_h_1750_synthetic_creator
psql -X -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL' || hold SYNTHETIC_CREATOR_BOOTSTRAP_FAILED
create role myeongha_r2_h_1750_synthetic_creator
  nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
grant myeongha_character_reading_artifact_runtime_owner
  to myeongha_r2_h_1750_synthetic_creator with admin option;
set role myeongha_r2_h_1750_synthetic_creator;
do $pre$
begin
 if current_user <> 'myeongha_r2_h_1750_synthetic_creator'
   or (select rolsuper or rolcreaterole or rolcanlogin
       from pg_catalog.pg_roles where rolname=current_user)
   or not exists (
      select 1 from pg_catalog.pg_auth_members
      where roleid='myeongha_character_reading_artifact_runtime_owner'::regrole
        and member=current_user::regrole)
   or not pg_catalog.pg_has_role(
      current_user,'myeongha_character_reading_artifact_runtime_owner','MEMBER')
 then
  raise exception 'HOLD_R2_H_1750_NON_SUPERUSER_PRECONDITION_FAILED';
 end if;
end
$pre$;
reset role;
SQL
non_superuser_error="$(mktemp)"
trap 'rm -f "$before" "$after" "$non_superuser_error"' EXIT
# The grantor of this edge is postgres, not synthetic creator. PostgreSQL may
# report a WARNING for its attempted REVOKE; the proposal's postcondition must
# reject any surviving direct edge and rollback all changes.
if psql -X -q -v ON_ERROR_STOP=1 \
    -c "set role $actor" \
    -f test/db/fixtures/1750_character_artifact_creator_membership_cleanup_v1.proposed.sql \
    >/dev/null 2>"$non_superuser_error"; then
  hold NON_SUPERUSER_GRANTOR_BYPASS_UNEXPECTED
fi
grep -Fq 'HOLD_R2_H_1750_CREATOR_MEMBERSHIP_RETAINED' "$non_superuser_error" ||
  hold NON_SUPERUSER_WRONG_FAILURE_REASON
# The failed transaction must not silently remove the original grant.
[[ "$(psql -X -Atqc "select count(*) from pg_auth_members where roleid='myeongha_character_reading_artifact_runtime_owner'::regrole and member='$actor'::regrole")" == 1 ]] ||
  hold NON_SUPERUSER_GRANTOR_EDGE_CHANGED
[[ "$(psql -X -Atqc "select pg_has_role('$actor','myeongha_character_reading_artifact_runtime_owner','MEMBER')")" == t ]] ||
  hold NON_SUPERUSER_EFFECTIVE_ACCESS_CHANGED
echo HOLD_R2_H_1750_NON_SUPERUSER_GRANTOR_DEPENDENCY_REPRODUCED
# Clean up solely under the original grantor (CI postgres) in this disposable
# DB; cleanup itself is NOT part of the proposed 1750 SQL.
psql -X -q -v ON_ERROR_STOP=1 -c "revoke myeongha_character_reading_artifact_runtime_owner from $actor" \
    -c "drop role $actor" >/dev/null || hold SYNTHETIC_CREATOR_CLEANUP_FAILED
[[ "$(psql -X -Atqc "select count(*) from pg_roles where rolname='$actor'")" == 0 ]] ||
  hold SYNTHETIC_CREATOR_RETAINED
synthetic_after="$(mktemp)"
trap 'rm -f "$before" "$after" "$non_superuser_error" "$synthetic_after"' EXIT
psql -X -qAt -v ON_ERROR_STOP=1 \
  -f scripts/operations/seyeon-r2-h-1530-catalog-readonly.sql > "$synthetic_after"
cmp -s "$after" "$synthetic_after" || hold SYNTHETIC_CATALOG_BASELINE_DRIFT
echo PASS_R2_H_1750_NON_SUPERUSER_REVOKE_FAIL_CLOSED_AND_SYNTHETIC_CREATOR_CLEANED

echo "HOLD_R2_H_1750_OWNER_APPROVAL_REQUIRED authorizedForProduction=false drReady=false productionWrites=0"
