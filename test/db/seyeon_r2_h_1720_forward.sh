#!/usr/bin/env bash
set -euo pipefail
# R2-H 1720 original SQL in a CI-owned disposable PG17 DB ONLY.
# Watchtower-Track: ops
hold() { echo "HOLD_R2_H_1720_$1" >&2; exit 1; }
pass() { echo "PASS_R2_H_1720_$1"; }
[[ "$GITHUB_ACTIONS" == true && "$DB_SUITE" == postgres17 ]] || hold NOT_CI
[[ "$PGHOST" == localhost && "$PGPORT" == 5432 && "$PGUSER" == postgres ]] || hold NOT_LOCAL_PG17
[[ "$PGDATABASE" =~ ^myeongha_ci_case_[0-9]+$ ]] || hold NOT_DISPOSABLE
[[ "$(psql -X -Atqc 'show server_version_num')" =~ ^17[0-9]{4}$ ]] || hold WRONG_PG_VERSION
[[ "$(psql -X -Atqc 'select current_database()')" == "$PGDATABASE" ]] || hold WRONG_DATABASE
[[ "$(psql -X -Atqc 'select current_user')" == postgres ]] || hold WRONG_ACTOR
[[ "$(git hash-object supabase/migrations/1720_standard_reader_product_scope_read_v1.sql)" == 659df0d5a039d6617de20407ea129aab95fe1201 ]] || hold SOURCE_BLOB_DRIFT
[[ "$(psql -X -Atqc "select to_regrole('myeongha_api_executor') is not null")" == t ]] || hold API_EXECUTOR_MISSING
[[ "$(psql -X -Atqc "select to_regclass('public.standard_reading_product_specs') is not null")" == t ]] || hold PRODUCT_SPEC_SOURCE_MISSING
[[ "$(psql -X -Atqc "select to_regclass('public.products') is not null")" == t ]] || hold PRODUCTS_SOURCE_MISSING
[[ "$(psql -X -Atqc "select to_regprocedure('public.qry_standard_reading_product_scope_v1(uuid,text)') is null")" == t ]] || hold ALREADY_PRESENT

# Before replaying original, test whether "public" is a real role.
# PUBLIC grantee should be checked using ACL, not role-string resolution.
[[ "$(psql -X -Atqc "select to_regrole('public') is null")" == t ]] || hold UNEXPECTED_PUBLIC_ROLE
pass NO_LITERAL_PUBLIC_ROLE
log="$(mktemp)"
trap 'rm -f "$log"' EXIT
# Original 1720 has no own COMMIT. -1 guarantees rollback on error.
if psql -X -q -1 -v ON_ERROR_STOP=1 -f supabase/migrations/1720_standard_reader_product_scope_read_v1.sql > "$log" 2>&1; then
  echo "HOLD_R2_H_1720_ORIGINAL_FORWARD_UNEXPECTEDLY_SUCCEEDED_REVIEW_REQUIRED"
  hold ORIGINAL_PUBLIC_CHECK_UNEXPECTED_SUCCESS
fi
if ! grep -Eqi 'role "public" does not exist' "$log"; then
  echo "HOLD_R2_H_1720_UNEXPECTED_ORIGINAL_SQL_ERROR"
  sed -n '1,15p' "$log"
  exit 1
fi
pass ORIGINAL_FORWARD_ABORTED_ON_PUBLIC_PSEUDOROLE
[[ "$(psql -X -Atqc "select to_regprocedure('public.qry_standard_reading_product_scope_v1(uuid,text)') is null")" == t ]] || hold FAILED_FORWARD_RESIDUE
[[ "$(psql -X -Atqc "select to_regrole('public') is null")" == t ]] || hold UNEXPECTED_PUBLIC_ROLE_CREATED
pass FAILURE_ROLLS_BACK_FUNCTION_AND_ACL
echo "HOLD_R2_H_1720_ORIGINAL_PUBLIC_PRIVILEGE_CHECK_BLOCKS_APPLY ownerSecurityDefinerUnreviewed=true productScopePositiveE2E=false productionWrites=0 readerActivation=false drReady=false"
