#!/usr/bin/env bash
set -euo pipefail
# Synthetic PostgreSQL 17 regression for the actual SQL used by the protected
# isolated restore job. Runs only against CI disposable databases.
# Watchtower-Track: ops
[[ "${CI:-}" == 'true' && "${PGHOST:-}" == 'localhost' &&
   "${PGDATABASE:-}" == myeongha_ci_case_* ]] || {
  echo 'HOLD_SEYEON_RESTORE_TEST: disposable CI PostgreSQL required' >&2
  exit 1
}
version_num="$(psql -X -qAt -v ON_ERROR_STOP=1 -c 'show server_version_num')"
(( version_num >= 170000 && version_num < 180000 ))

# The disposable PostgreSQL 17 cluster also has an isolated 'postgres'
# database. Simulate the Supabase image's unsafe function-creation defaults:
# global PUBLIC plus public-schema grants to anon/authenticated. Then execute
# the exact guarded creator ACL adapter used before schema replay. Never
# touch the CI test case's existing application default privileges.
seeded_defaults="$(PGDATABASE=postgres psql -X -qAt --set ON_ERROR_STOP=1 <<'SQL'
ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
CREATE FUNCTION public.seyeon_restore_default_acl_probe() RETURNS integer
  LANGUAGE sql AS $ SELECT 1 $;
SELECT has_function_privilege(
  'anon', 'public.seyeon_restore_default_acl_probe()'::regprocedure, 'EXECUTE');
DROP FUNCTION public.seyeon_restore_default_acl_probe();
SQL
)"
[[ "$seeded_defaults" == 't' ]] || {
  echo 'FAIL default-ACL regression fixture did not recreate browser exposure' >&2
  exit 1
}

creator_acl_proof="$(PGDATABASE=postgres psql -X -qAt --set ON_ERROR_STOP=1 \
  -f scripts/operations/prepare-postgres-isolated-restore-function-defaults.sql)"
[[ "$creator_acl_proof" == 'PASS_SEYEON_ISOLATED_CREATOR_FUNCTION_DEFAULT_ACL' ]]

restricted_default_probe="$(PGDATABASE=postgres psql -X -qAt --set ON_ERROR_STOP=1 <<'SQL'
CREATE FUNCTION public.seyeon_restore_default_acl_probe() RETURNS integer
  LANGUAGE sql AS $ SELECT 1 $;
SELECT NOT has_function_privilege(
  'anon', 'public.seyeon_restore_default_acl_probe()'::regprocedure, 'EXECUTE')
  AND NOT has_function_privilege(
  'authenticated', 'public.seyeon_restore_default_acl_probe()'::regprocedure, 'EXECUTE');
DROP FUNCTION public.seyeon_restore_default_acl_probe();
SQL
)"
[[ "$restricted_default_probe" == 't' ]] || {
  echo 'FAIL isolated restore creator default still exposed browser function EXECUTE' >&2
  exit 1
}
echo 'PASS_SEYEON_RESTORE_PG17_CREATOR_DEFAULT_ACL_NORMALIZATION'

sql='scripts/operations/seyeon-relationship-isolated-restore-proof.sql'
history='[
  {"version":"1400","name":"relationship_apply_context_v1"},
  {"version":"1410","name":"relationship_event_apply_command_v1"},
  {"version":"1420","name":"relationship_reliability_context_v1"},
  {"version":"1430","name":"relationship_adjustment_commands_v1"},
  {"version":"1440","name":"relationship_projection_rebuild_v1"},
  {"version":"1450","name":"relationship_snapshot_runtime_v1"}
]'
run_proof() {
  psql -X -qAt --set ON_ERROR_STOP=1 -v "seyeon_history_json=$1" -f "$sql"
}
result="$(run_proof "$history")"
[[ "$result" == 'PASS_SEYEON_RESTORED_EARLY_HISTORY_SNAPSHOT_6_FUNCTIONS_11_RLS_6' ]]

expect_rejection() {
  local label="$1" snapshot="$2" expected="$3" output
  if output="$(run_proof "$snapshot" 2>&1)"; then
    echo "FAIL $label unexpectedly accepted" >&2
    exit 1
  fi
  [[ "$output" == *"$expected"* ]] || {
    echo "FAIL $label wrong rejection cause" >&2
    exit 1
  }
  echo "PASS $label: rejected"
}

missing="$(jq -c 'map(select(.version != "1430"))' <<<"$history")"
expect_rejection 'missing version 1430' "$missing" 'backup migration history subset mismatch'
wrong_name="$(jq -c 'map(if .version == "1440" then .name = "unreviewed_rewrite" else . end)' <<<"$history")"
expect_rejection 'wrong version-name binding' "$wrong_name" 'backup migration history subset mismatch'

# Deliberate overload in a disposable test database: exactly 11 real functions
# must exist, not merely a set of 11 names with additional matching signatures.
psql -X -q --set ON_ERROR_STOP=1 -c \
  'CREATE FUNCTION public.relationship_event_json_v1(text) RETURNS text LANGUAGE sql AS $$ SELECT $1 $$;' >/dev/null
expect_rejection 'unexpected overloaded early RPC' "$history" 'restored function catalog missing or overloaded'
psql -X -q --set ON_ERROR_STOP=1 -c \
  'DROP FUNCTION public.relationship_event_json_v1(text);' >/dev/null

# A later explicit GRANT remains a hard failure. Correcting creator
# defaults must NOT launder unsafe explicit RPC access into a fake PASS.
psql -X -q --set ON_ERROR_STOP=1 -c \
  'GRANT EXECUTE ON FUNCTION public.relationship_event_json_v1(uuid) TO anon;' >/dev/null
expect_rejection 'explicit anon function GRANT is never normalized away' \
  "$history" 'restored early function publicly executable'
psql -X -q --set ON_ERROR_STOP=1 -c \
  'REVOKE EXECUTE ON FUNCTION public.relationship_event_json_v1(uuid) FROM anon;' >/dev/null

[[ "$(run_proof "$history")" == 'PASS_SEYEON_RESTORED_EARLY_HISTORY_SNAPSHOT_6_FUNCTIONS_11_RLS_6' ]]
echo 'PASS_SEYEON_RESTORE_PG17_REAL_CATALOG_NEGATIVES'
