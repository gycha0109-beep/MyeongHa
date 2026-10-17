#!/usr/bin/env bash
set -euo pipefail

# M1-23: Actual EXECUTE and SELECT privilege probes under SET LOCAL ROLE in a
# disposable PostgreSQL 17 source-tree replay. A stock service superuser starts
# each connection solely to SET ROLE. Current execution identity is then
# a NON-SUPERUSER runtime role, in a READ ONLY transaction.
# No live data, Provider calls, Writer side effects, or production access.
fail() { echo "FAIL_M1_23: $*" >&2; exit 1; }
[[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
  "${PGUSER:-}" == postgres &&
  "${PGDATABASE:-}" == myeongha_ci_case_* ]] ||
  fail 'Disposable CI postgres17 database required'
[[ -z "${SUPABASE_DB_PASSWORD:-}" &&
  -z "${SUPABASE_PRODUCTION_SESSION_POOLER_HOST:-}" ]] ||
  fail 'Production connection settings forbidden'
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c 'show server_version_num')" =~ ^17[0-9]{4}$ ]] ||
  fail 'PG17 is required'
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select rolsuper from pg_roles where rolname=current_user")" == t ]] ||
  fail 'Only disposable PG17 fixture bootstrap may SET ROLE'

roles=(
  anon authenticated service_role
  myeongha_api_executor myeongha_commerce_internal_executor
  myeongha_seyeon_chat_runtime_owner
)
for actor in "${roles[@]}"; do
  privilege="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
    select (not rolsuper and not rolbypassrls)
    from pg_catalog.pg_roles where rolname='$actor'")" ||
    fail "Could not inspect $actor fixture actor"
  [[ "$privilege" == t ]] || fail "$actor missing or unexpectedly privileged"
  # SET LOCAL ROLE affects current_user; session_user remains a stock CI
  # superuser. This does NOT emulate a Supabase managed migration principal.
  identity="$(psql -X -qAt -v ON_ERROR_STOP=1 <<SQL
begin read only;
set local role $actor;
select current_user || '|' ||
  (select rolsuper::text from pg_catalog.pg_roles where rolname=current_user) ||
  '|' || (select rolbypassrls::text from pg_catalog.pg_roles where rolname=current_user) ||
  '|' || current_setting('transaction_read_only');
rollback;
SQL
)" || fail "$actor SET LOCAL ROLE failed"
  [[ "$identity" == "$actor|false|false|on" ||
     "$identity" == "$actor|f|f|on" ]] ||
    fail "$actor did not execute as a non-superuser read-only role: $identity"
done
echo 'PASS_M1_23_ROLE_CONTEXT: all six runtime roles are non-superuser, no BYPASSRLS, in READ ONLY SET LOCAL ROLE sessions'

# The only allowed API call should reach the function's NULL-input
# validation, returning SQLSTATE 23514. That is proof of callable EXECUTE,
# not an authorization to read real receipts or to use an untrusted subject.
api_read='select public.qry_official_reader_unknown_commit_minimal_v1(null::uuid,null::uuid);'
issuer='select * from public.internal_apply_official_reader_unified_receipt_v1(null::uuid,null::text[],null::timestamptz[],null::timestamptz[],null::timestamptz[],null::text[]);'
binder='select * from public.internal_cmd_bind_official_reader_unified_v1(null::uuid,null::uuid,null::uuid,null::uuid,null::text,null::text,null::jsonb);'
tmp="$(mktemp -d)"
chmod 700 "$tmp"
trap 'rm -rf -- "$tmp"' EXIT
expect_sqlstate() {
  local label="$1" actor="$2" statement="$3" wanted="$4"
  if psql -X -qAt -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate \
    >"$tmp/out" 2>"$tmp/err" <<SQL
begin read only;
set local role $actor;
$statement
rollback;
SQL
  then fail "$label unexpectedly succeeded"; fi
  # VERBOSITY=sqlstate prevents any accidental dependence on localized error
  # wording: permission_denied=42501 vs input_check_violation=23514.
  if ! grep -Eq "ERROR:[[:space:]]+$wanted([[:space:]]|$)" "$tmp/err"; then
    fail "$label expected SQLSTATE $wanted, got $(tail -n 2 "$tmp/err" | tr '\n' ' ' | cut -c 1-160)"
  fi
  echo "PASS_M1_23_SQLSTATE: $label -> $wanted"
}
expect_sqlstate 'API minimal read reaches NULL guard' myeongha_api_executor \
  "$api_read" 23514

for actor in "${roles[@]}"; do
  if [[ "$actor" != myeongha_api_executor ]]; then
    expect_sqlstate "$actor denied minimal read" "$actor" "$api_read" 42501
  fi
  expect_sqlstate "$actor denied private D2 issuer" "$actor" "$issuer" 42501
  expect_sqlstate "$actor denied private D2 binder" "$actor" "$binder" 42501
done

# Real SQL execution under API identity must NOT be able to SELECT any of
# these five source tables, regardless of the WHERE or LIMIT clause.
for table in commerce_receipts entitlement_grants entitlement_events \
  standard_reading_reader_access_grants outbox_events; do
  expect_sqlstate "API denied raw $table SELECT" myeongha_api_executor \
    "select * from public.$table limit 0;" 42501
done

# The M1-18 gate observes ACL state unchanged before/after the READ ONLY probes;
# it also performs four rollbacked deliberately unsafe GRANT simulations.
bash test/db/official_reader_m1_18_live_cutover_readonly_gate.sh
echo 'PASS_M1_23_DISPOSABLE_PG17: function-call and raw source-table ACL enforced for non-superuser current_user'
echo 'HOLD_M1_23: SET LOCAL ROLE is not independent login, production owner/role grantor parity, historical SeYeon restore, approved DR or live Reader cutover'
