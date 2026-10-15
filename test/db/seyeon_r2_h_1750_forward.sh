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
echo "HOLD_R2_H_1750_OWNER_APPROVAL_REQUIRED authorizedForProduction=false drReady=false productionWrites=0"
