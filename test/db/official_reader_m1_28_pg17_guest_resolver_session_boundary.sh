#!/usr/bin/env bash
set -euo pipefail

# M1-28: independently authenticated non-superuser API TCP connection plus
# the actual guest subject resolver and the unchanged 1970 read function.
# Entirely disposable PG17 synthetic fixture; NEVER a production credential.
fail() { echo "FAIL_M1_28: $*" >&2; exit 1; }
[[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
   "${PGPORT:-}" == 5432 && "${PGUSER:-}" == postgres &&
   "${PGDATABASE:-}" == myeongha_ci_case_* &&
   -n "${PGPASSWORD:-}" ]] || fail 'Disposable CI-only localhost PG17 required'
[[ -z "${SUPABASE_DB_PASSWORD:-}" &&
   -z "${SUPABASE_PRODUCTION_SESSION_POOLER_HOST:-}" &&
   -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]] || fail 'No Supabase credential access'
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c 'show server_version_num')" =~ ^17[0-9]{4}$ ]] ||
  fail 'PG17 required'
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select current_user || '|' || rolsuper::text from pg_roles where rolname=current_user")" == 'postgres|true' ]] ||
  fail 'Only disposable postgres bootstrap may provision synthetic roles'
command -v openssl >/dev/null || fail 'OpenSSL required for generated CI-only password'

node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditM120SafeStaging } from './scripts/operations/m1-20-safe-staging-preflight.mjs';
const live=JSON.parse(readFileSync('scripts/operations/fixtures/m1-19-20261017-live-migration-history.snapshot.json','utf8'));
const a=auditM120SafeStaging(live);
assert.equal(a.reviewedSourceCount,45);
assert.deepEqual(a.sourceDrift,[]);
assert.deepEqual(a.unreviewedSourceVersions,[]);
assert.deepEqual(a.unknownPredecessors,[]);
assert.equal(a.deployAuthorized,false);
console.log('PASS_M1_28_SOURCE_PIN: pinned 1970 and 45 missing-live source checks');
NODE

owner='myeongha_m128_definer_ci'
login='myeongha_m128_api_login_ci'
subject='11390000-0000-0000-0000-000000000001'
other_subject='a1280000-0000-4000-8000-000000000003'
receipt='12102000-0000-0000-0000-000000000001'
policy='m128_ci_subject_scope'
fn='public.qry_official_reader_unknown_commit_minimal_v1(uuid,uuid)'
good_hash='hmac-sha256:k1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
other_hash='hmac-sha256:k1:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
bogus_hash='hmac-sha256:k1:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
source_tables=(
  commerce_receipts purchase_intents product_offers product_capability_sets
  product_capability_items entitlement_grants entitlement_events
  standard_reading_reader_access_grants outbox_events
  purchase_intent_reader_selections standard_reading_official_bindings
)
umask 077
tmp="$(mktemp -d)"
password="$(openssl rand -hex 24)"
created=false
cleanup() {
  if [[ "$created" == true ]]; then
    psql -X -qAt -v ON_ERROR_STOP=1 -c "alter function $fn owner to postgres;" >/dev/null 2>&1 || true
    psql -X -qAt -v ON_ERROR_STOP=1 -c "drop policy if exists $policy on public.commerce_receipts;" >/dev/null 2>&1 || true
    psql -X -qAt -v ON_ERROR_STOP=1 -c "alter table public.commerce_receipts disable row level security;" >/dev/null 2>&1 || true
    for table in "${source_tables[@]}"; do
      psql -X -qAt -v ON_ERROR_STOP=1 -c "revoke select on public.$table from $owner;" >/dev/null 2>&1 || true
    done
    psql -X -qAt -v ON_ERROR_STOP=1 -c "revoke execute on function public.assert_myeongha_subject_context_v1(uuid) from $owner;" >/dev/null 2>&1 || true
    psql -X -qAt -v ON_ERROR_STOP=1 -c "revoke execute on function public.current_myeongha_subject_id() from $owner;" >/dev/null 2>&1 || true
    psql -X -qAt -v ON_ERROR_STOP=1 -c "drop role if exists $login;" >/dev/null 2>&1 || true
    psql -X -qAt -v ON_ERROR_STOP=1 -c "drop role if exists $owner;" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$tmp"
}
trap cleanup EXIT

# A fixture-verified historical purchase/Receipt must exist; no actual
# payment provider is called by this test.
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
select count(*) from public.commerce_receipts cr
join public.purchase_intents pi on pi.id=cr.purchase_intent_id
  and pi.subject_id=cr.subject_id and pi.status='verified'
where cr.id='$receipt'::uuid and cr.subject_id='$subject'::uuid
  and cr.verification_status='verified' and cr.environment='production'")" == 1 ]] ||
  fail 'Synthetic verified receipt fixture missing'
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
  select relrowsecurity from pg_class where oid='public.commerce_receipts'::regclass")" == f ]] ||
  fail 'Unexpected preexisting receipt RLS policy'

# Two synthetic active guest sessions; the API's real resolver checks these
# records. Hashes are labeled CI-only; NOT actual customer secrets or HMACs.
psql -X -qAt -v ON_ERROR_STOP=1 <<SQL >/dev/null
insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at)
values ('$other_subject'::uuid,'guest',null,'active',null,clock_timestamp(),clock_timestamp());
insert into public.guest_sessions(id,subject_id,token_hash,expires_at,created_at)
values
 ('a1280000-0000-4000-8000-000000000001'::uuid,'$subject'::uuid,'$good_hash',
  clock_timestamp()+interval '1 hour',clock_timestamp()),
 ('a1280000-0000-4000-8000-000000000002'::uuid,'$other_subject'::uuid,'$other_hash',
  clock_timestamp()+interval '1 hour',clock_timestamp());
SQL

psql -X -qAt -v ON_ERROR_STOP=1 -v pw="$password" <<SQL >/dev/null
create role $owner nologin nosuperuser nocreatedb nocreaterole
  noinherit noreplication nobypassrls;
create role $login login nosuperuser nocreatedb nocreaterole
  noinherit noreplication nobypassrls password :'pw';
grant myeongha_api_executor to $login
  with admin false, inherit false, set true;
alter function $fn owner to $owner;
grant execute on function public.assert_myeongha_subject_context_v1(uuid) to $owner;
grant execute on function public.current_myeongha_subject_id() to $owner;
SQL
created=true
for table in "${source_tables[@]}"; do
  psql -X -qAt -v ON_ERROR_STOP=1 -c "grant select on public.$table to $owner;" >/dev/null
done
psql -X -qAt -v ON_ERROR_STOP=1 <<SQL >/dev/null
alter table public.commerce_receipts enable row level security;
create policy $policy on public.commerce_receipts for select to $owner
  using (subject_id = public.current_myeongha_subject_id());
SQL

[[ "$(PGUSER="$login" PGPASSWORD="$password" psql -X -qAt -v ON_ERROR_STOP=1 -c "
select session_user || '|' || current_user || '|' || rolsuper::text || '|' ||
 rolbypassrls::text from pg_catalog.pg_roles where rolname=current_user")" == "$login|$login|false|false" ]] ||
  fail 'Independent authenticated API login identity not restricted'
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
 select count(*) from pg_auth_members m
 join pg_roles u on u.oid=m.member
 join pg_roles g on g.oid=m.roleid
 where u.rolname='$login' and g.rolname='myeongha_api_executor'
 and not m.admin_option and not m.inherit_option and m.set_option")" == 1 ]] ||
  fail 'Synthetic API login must have one SET-only membership'
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
select count(*) from (values
 ('commerce_receipts'),('purchase_intents'),('product_offers'),
 ('product_capability_sets'),('product_capability_items'),
 ('entitlement_grants'),('entitlement_events'),
 ('standard_reading_reader_access_grants'),('outbox_events'),
 ('purchase_intent_reader_selections'),('standard_reading_official_bindings')
) x(name) where has_table_privilege('$owner',to_regclass('public.'||x.name),'SELECT')
and not has_table_privilege('myeongha_api_executor',to_regclass('public.'||x.name),'SELECT')")" == "${#source_tables[@]}" ]] ||
  fail 'Source-table SELECT must belong only to CI definer, not API'
echo 'PASS_M1_28_INDEPENDENT_LOGIN: distinct TCP login, SET-only API and closed private source ACLs'

# Every behavioral assertion below uses the independently authenticated
# non-superuser TCP session. PostgreSQL guest resolver sets transaction-local
# subject context after looking up a CI-only verified hash.
api_guest_read() {
  local hash="$1" request_subject="$2" receipt_id="$3"
  PGUSER="$login" PGPASSWORD="$password" psql -X -qAt \
    -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate <<SQL
begin isolation level read committed read only;
set local role myeongha_api_executor;
select subject_id from public.begin_guest_subject_context_v1('$hash');
select public.qry_official_reader_unknown_commit_minimal_v1(
  '$request_subject'::uuid,'$receipt_id'::uuid);
rollback;
SQL
}
expect_enum() {
  local label="$1" hash="$2" subject_id="$3" receipt_id="$4" expected="$5" actual
  if ! actual="$(api_guest_read "$hash" "$subject_id" "$receipt_id" 2>"$tmp/err")"; then
    fail "$label failed SQL: $(tail -n 2 "$tmp/err" | cut -c 1-150)"
  fi
  [[ "$(tail -n 1 <<<"$actual")" == "$expected" ]] ||
    fail "$label expected $expected got $(tail -n 1 <<<"$actual")"
  echo "PASS_M1_28_ENUM: $label -> $expected"
}
expect_state() {
  local label="$1" state="$2";shift 2
  if "$@" >"$tmp/out" 2>"$tmp/err"; then
    fail "$label succeeded unexpectedly"
  fi
  grep -Eq "ERROR:[[:space:]]+$state([[:space:]]|$)" "$tmp/err" ||
    fail "$label should fail SQLSTATE $state: $(tail -n 2 "$tmp/err" | cut -c 1-140)"
  echo "PASS_M1_28_SQLSTATE: $label -> $state"
}
no_resolver() {
  PGUSER="$login" PGPASSWORD="$password" psql -X -qAt \
    -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate <<SQL
begin read only;
set local role myeongha_api_executor;
select public.qry_official_reader_unknown_commit_minimal_v1(
  '$subject'::uuid,'$receipt'::uuid);
rollback;
SQL
}
unswitched_login() {
  PGUSER="$login" PGPASSWORD="$password" psql -X -qAt \
    -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -c \
    "select public.qry_official_reader_unknown_commit_minimal_v1('$subject'::uuid,'$receipt'::uuid);"
}
expect_state 'unswitched LOGIN has NOINHERIT, cannot execute API RPC' 42501 unswitched_login
expect_state 'API without resolver lacks subject context' 28000 no_resolver
expect_enum 'actual guest resolver own verified receipt' "$good_hash" "$subject" "$receipt" INCOMPLETE_OR_CONFLICTING_AUTHORITY
expect_enum 'actual resolver different guest cannot enumerate receipt' "$other_hash" "$other_subject" "$receipt" SOURCE_UNAVAILABLE
expect_state 'another guest cannot supply original subject parameter' 42501 \
  api_guest_read "$other_hash" "$subject" "$receipt"
expect_state 'unknown verified hash rejected' 28000 \
  api_guest_read "$bogus_hash" "$subject" "$receipt"

# Expired and consumed guest credentials must fail before any Reader read.
psql -X -qAt -v ON_ERROR_STOP=1 -c \
  "update public.guest_sessions set expires_at=clock_timestamp()-interval '1 hour' where token_hash='$other_hash';" >/dev/null
expect_state 'expired verified guest hash rejected' 28000 \
  api_guest_read "$other_hash" "$other_subject" "$receipt"
psql -X -qAt -v ON_ERROR_STOP=1 -c \
  "update public.guest_sessions set consumed_at=clock_timestamp() where token_hash='$good_hash';" >/dev/null
expect_state 'consumed verified guest hash rejected' 28000 \
  api_guest_read "$good_hash" "$subject" "$receipt"
echo 'PASS_M1_28_GUEST_LIFECYCLE: valid, other Subject, unknown, expired and consumed hashes remain distinct'

# Ensure resolver-bound GUC cannot persist into a later transaction on the
# same TCP connection: SET LOCAL role and transaction-local subject both reset.
session_reset="$(PGUSER="$login" PGPASSWORD="$password" psql -X -qAt \
  -v ON_ERROR_STOP=1 <<SQL
begin read only;
set local role myeongha_api_executor;
select subject_id from public.begin_guest_subject_context_v1('$bogus_hash') where false;
rollback;
select coalesce(nullif(current_setting('myeongha.subject_id',true),''),'CLEARED');
SQL
)" || true
# The above intentionally exercises a short-circuit query only; a stronger
# successful resolver reset test uses a fresh unconsumed fixture hash below.
psql -X -qAt -v ON_ERROR_STOP=1 -c \
  "update public.guest_sessions set consumed_at=null where token_hash='$good_hash';" >/dev/null
reset="$(PGUSER="$login" PGPASSWORD="$password" psql -X -qAt \
  -v ON_ERROR_STOP=1 <<SQL
begin read only;
set local role myeongha_api_executor;
select subject_id from public.begin_guest_subject_context_v1('$good_hash');
commit;
select coalesce(nullif(current_setting('myeongha.subject_id',true),''),'CLEARED');
SQL
)"
[[ "$(tail -n 1 <<<"$reset")" == CLEARED ]] ||
  fail 'Resolved Guest subject GUC leaked beyond its transaction on same session'
echo 'PASS_M1_28_TRANSACTION_SCOPING: a successful Guest resolver context is cleared after COMMIT'

# SECURITY GAP explicitly held: PostgreSQL custom GUC is writable by API
# role. A malicious *trusted backend* could bypass the resolver by writing
# the subject GUC directly. No SQL test can authenticate the client here;
# the external authenticated adapter must remain a separate Owner gate.
forged="$(PGUSER="$login" PGPASSWORD="$password" psql -X -qAt \
  -v ON_ERROR_STOP=1 <<SQL
begin isolation level read committed read only;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select public.qry_official_reader_unknown_commit_minimal_v1(
  '$subject'::uuid,'$receipt'::uuid);
rollback;
SQL
)"
[[ "$(tail -n 1 <<<"$forged")" == INCOMPLETE_OR_CONFLICTING_AUTHORITY ]] ||
  fail 'Trusted-backend GUC-authentication gap is not accurately characterized'
echo 'HOLD_M1_28_GUC_NOT_AUTHENTICATION: direct writable API GUC bypasses Guest resolver; only externally authenticated trusted adapter can set context'

bash test/db/official_reader_m1_18_live_cutover_readonly_gate.sh
echo 'PASS_M1_28_DISPOSABLE_PG17: independent Guest resolver and Reader scalar classification, lifecycle and scoped transaction'
echo 'HOLD_M1_28: arbitrary writable GUC is NOT user authentication, no real API verifier/managed Supabase Owner/DR/historical restore/release approval'
