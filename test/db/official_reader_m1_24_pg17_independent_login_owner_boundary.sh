#!/usr/bin/env bash
set -euo pipefail

# M1-24: real TCP sessions authenticated as independent CI-only non-superuser
# login roles; no privileged session_user may perform the test's SQL probes.
# Each login is allowed to SET ROLE to exactly ONE reviewed runtime identity,
# with NOINHERIT / ADMIN FALSE, never elevated to postgres or an Owner.
# Fixture bootstrap is done by postgres superuser on disposable PG17 only.
fail() { echo "FAIL_M1_24: $*" >&2; exit 1; }
[[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
  "${PGPORT:-}" == 5432 && "${PGUSER:-}" == postgres &&
  "${PGDATABASE:-}" == myeongha_ci_case_* &&
  -n "${PGPASSWORD:-}" ]] ||
  fail 'Disposable CI-only PG17 connection required'
[[ -z "${SUPABASE_DB_PASSWORD:-}" &&
  -z "${SUPABASE_PRODUCTION_SESSION_POOLER_HOST:-}" &&
  -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]] ||
  fail 'Production/Supabase credential settings forbidden'
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c 'show server_version_num')" =~ ^17[0-9]{4}$ ]] ||
  fail 'PostgreSQL 17 required'
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select rolname || '|' || rolsuper from pg_roles where rolname=current_user")" == "postgres|true" ]] ||
  fail 'Only a disposable postgres bootstrap is allowed'
command -v openssl >/dev/null || fail 'openssl is required for disposable credentials'
umask 077
tmp="$(mktemp -d)"
test_password="$(openssl rand -hex 24)"
login_roles=()
cleanup() {
  local login
  for login in "${login_roles[@]}"; do
    psql -X -qAt -v ON_ERROR_STOP=1 -c "drop role if exists $login;" >/dev/null 2>&1 || true
  done
  rm -rf -- "$tmp"
}
trap cleanup EXIT

roles=(
  anon authenticated service_role
  myeongha_api_executor myeongha_commerce_internal_executor
  myeongha_seyeon_chat_runtime_owner
)
for i in "${!roles[@]}"; do
  actor="${roles[$i]}"
  login="myeongha_m124_login_$i"
  [[ "$actor" =~ ^[a-z_]+$ && "$login" =~ ^[a-z0-9_]+$ ]] ||
    fail 'Unsafe test role identifier'
  [[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
    select not rolsuper and not rolbypassrls and not rolcanlogin
    from pg_catalog.pg_roles where rolname='$actor'")" == t ]] ||
    fail "Unexpected runtime role attributes for $actor"
  # The test's membership exists ONLY in this disposable postgres cluster.
  # A separate LOGIN is actually authenticated over TCP, unlike M1-23
  # SET LOCAL ROLE executed by session_user=postgres.
  psql -X -qAt -v ON_ERROR_STOP=1 -v pw="$test_password" >/dev/null <<SQL
create role $login login nosuperuser nocreatedb nocreaterole noinherit
  noreplication nobypassrls password :'pw';
grant $actor to $login with admin false, inherit false, set true;
SQL
  login_roles+=("$login")

  membership="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
    select count(*) from pg_catalog.pg_auth_members m
    join pg_catalog.pg_roles grp on grp.oid=m.roleid
    join pg_catalog.pg_roles usr on usr.oid=m.member
    where usr.rolname='$login' and grp.rolname='$actor'
      and not m.admin_option and not m.inherit_option and m.set_option")"
  [[ "$membership" == 1 ]] || fail "$login membership is not SET-only"
  actual="$(PGUSER="$login" PGPASSWORD="$test_password" psql -X -qAt \
    -v ON_ERROR_STOP=1 -c "select session_user || '|' || current_user || '|' ||
      (select rolsuper::text from pg_catalog.pg_roles where rolname=current_user) || '|' ||
      (select rolbypassrls::text from pg_catalog.pg_roles where rolname=current_user)")" ||
    fail "Independent TCP login failed for $login"
  [[ "$actual" == "$login|$login|false|false" ]] ||
    fail "Independent TCP connection did not authenticate as $login ($actual)"
  changed="$(PGUSER="$login" PGPASSWORD="$test_password" psql -X -qAt \
    -v ON_ERROR_STOP=1 <<SQL
begin read only;
set local role $actor;
select session_user || '|' || current_user || '|' ||
  (select rolsuper::text from pg_catalog.pg_roles where rolname=current_user) || '|' ||
  (select rolbypassrls::text from pg_catalog.pg_roles where rolname=current_user) || '|' ||
  current_setting('transaction_read_only');
rollback;
SQL
)" || fail "$actor cannot be adopted through limited membership"
  [[ "$changed" == "$login|$actor|false|false|on" ]] ||
    fail "$actor identity lacks restricted independent login semantics ($changed)"
done
echo 'PASS_M1_24_INDEPENDENT_TCP_LOGIN: six distinct non-superuser LOGIN sessions + SET-only membership, NOINHERIT and NOBYPASSRLS'

# The API Reader function is owned by the source-tree fixture bootstrap
# superuser (not necessarily production's managed Owner). Record the actual
# non-parity as a HOLD; do not reassign Owner to the synthetic app login.
owner="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
  select pg_catalog.pg_get_userbyid(proowner)
  from pg_catalog.pg_proc where oid=
   'public.qry_official_reader_unknown_commit_minimal_v1(uuid,uuid)'::regprocedure")"
[[ "$owner" == postgres ]] ||
  fail "Unexpected fixture source replay Owner; expected postgres, got $owner"
echo 'HOLD_M1_24_MANAGED_OWNER_NOT_EQUIVALENT: candidate 1970 function Owner is CI postgres, not independently attested Supabase managed Owner'

api_read='select public.qry_official_reader_unknown_commit_minimal_v1(null::uuid,null::uuid);'
issuer='select * from public.internal_apply_official_reader_unified_receipt_v1(null::uuid,null::text[],null::timestamptz[],null::timestamptz[],null::timestamptz[],null::text[]);'
binder='select * from public.internal_cmd_bind_official_reader_unified_v1(null::uuid,null::uuid,null::uuid,null::uuid,null::text,null::text,null::jsonb);'

# All checks below use PGPASSWORD through independent TCP LOGIN. SQLSTATE
# strings are stable; localized PostgreSQL message text is not.
expect_sqlstate() {
  local label="$1" login="$2" actor="$3" sql="$4" expected="$5" mode="${6:-read}"
  local txn='begin read only;'
  if [[ "$mode" == rollback_ddl ]]; then txn='begin;'; fi
  if PGUSER="$login" PGPASSWORD="$test_password" psql -X -qAt \
      -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate >"$tmp/out" 2>"$tmp/err" <<SQL
$txn
set local role $actor;
$sql
rollback;
SQL
  then fail "$label unexpectedly succeeded"; fi
  if ! grep -Eq "ERROR:[[:space:]]+$expected([[:space:]]|$)" "$tmp/err"; then
    fail "$label expected SQLSTATE $expected; got $(tail -n 2 "$tmp/err" | tr '\n' ' ' | cut -c 1-180)"
  fi
  echo "PASS_M1_24_SQLSTATE: $label -> $expected"
}
# Before SET ROLE, the login inherits NO grants from its single membership.
if PGUSER=myeongha_m124_login_3 PGPASSWORD="$test_password" psql -X -qAt \
  -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate >"$tmp/out" 2>"$tmp/err" \
  -c "$api_read"; then
  fail 'Unswitched synthetic LOGIN inherited the API read privilege'
fi
grep -Eq 'ERROR:[[:space:]]+42501([[:space:]]|$)' "$tmp/err" ||
  fail 'Unswitched synthetic LOGIN did not receive permission denied'
echo 'PASS_M1_24_NOINHERIT: independent LOGIN cannot execute API-only read without explicit SET ROLE'

for i in "${!roles[@]}"; do
  actor="${roles[$i]}"
  login="myeongha_m124_login_$i"
  if [[ "$actor" == myeongha_api_executor ]]; then
    expect_sqlstate "independent API login reaches read-only NULL guard" \
      "$login" "$actor" "$api_read" 23514
  else
    expect_sqlstate "$actor cannot call API minimal read" \
      "$login" "$actor" "$api_read" 42501
  fi
  expect_sqlstate "$actor cannot call private D2 issuer" \
    "$login" "$actor" "$issuer" 42501
  expect_sqlstate "$actor cannot call private D2 binder" \
    "$login" "$actor" "$binder" 42501
  # The synthetic session must not use the underlying CI superuser even if a
  # user tries to change role again, or perform privileged SQL on the source.
  expect_sqlstate "$actor cannot SET ROLE postgres" \
    "$login" "$actor" 'set role postgres;' 42501
  expect_sqlstate "$actor cannot CREATE ROLE" \
    "$login" "$actor" 'create role myeongha_m124_forbidden_role nologin;' 42501 rollback_ddl
  expect_sqlstate "$actor cannot GRANT public minimal-read EXECUTE" \
    "$login" "$actor" 'grant execute on function public.qry_official_reader_unknown_commit_minimal_v1(uuid,uuid) to public;' 42501 rollback_ddl
  # Do not probe "OWNER TO postgres": existing function Owner is postgres
  # in this fixture, and PostgreSQL can treat a same-owner request as a no-op.
  # A *different* synthetic-login target forces an actual ownership transfer
  # attempt, which a restricted runtime identity must fail with 42501.
  expect_sqlstate "$actor cannot transfer minimal-read Owner to its login" \
    "$login" "$actor" "alter function public.qry_official_reader_unknown_commit_minimal_v1(uuid,uuid) owner to $login;" 42501 rollback_ddl
done

for table in commerce_receipts entitlement_grants entitlement_events \
  standard_reading_reader_access_grants outbox_events; do
  expect_sqlstate "independent API login denied raw $table SELECT" \
    myeongha_m124_login_3 myeongha_api_executor \
    "select * from public.$table limit 0;" 42501
done

# Catalog must still be exact, even after intentionally rejected permission
# escalation attempts. The four M1-18 regression GRANTs are rolled back.
bash test/db/official_reader_m1_18_live_cutover_readonly_gate.sh
echo 'PASS_M1_24_DISPOSABLE_PG17: independent authenticated logins, restricted role SQL and OWNER/escalation denial'
echo 'HOLD_M1_24: simulation is NOT actual Supabase managed non-superuser migration owner, SeYeon restoration, history, independent production role secrets, restored data, DR or Owner approval'
