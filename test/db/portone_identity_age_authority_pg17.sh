#!/usr/bin/env bash
set -euo pipefail

# PG17 disposable CI only. Never use Production credentials or an external host.
[[ "${GITHUB_ACTIONS:-}" == true && "${CI:-}" == true &&
   "${DB_SUITE:-}" == postgres17 && "${PGHOST:-}" == localhost &&
   "${PGPORT:-}" == 5432 && "${PGDATABASE:-}" =~ ^myeongha_ci_case_[0-9]+$ ]] || {
  echo HOLD_PORTONE_PG17_DISPOSABLE_CI_ONLY >&2; exit 1;
}
[[ -z "${DATABASE_URL:-}" && -z "${SUPABASE_DB_PASSWORD:-}" &&
   -z "${SUPABASE_PROJECT_ID:-}" ]] || {
  echo HOLD_PORTONE_PG17_PRODUCTION_CREDENTIALS >&2; exit 1;
}
[[ ! -e supabase/migrations/1740_portone_identity_age_authority_v1.sql ]] || {
  echo HOLD_PORTONE_PROPOSAL_MUST_NOT_BE_DEPLOYED >&2; exit 1;
}

q() { psql -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }
fail() { echo "FAIL PORTONE_PG17: $*" >&2; exit 1; }
pass() { echo "PASS PORTONE_PG17: $*"; }
sql_user_a=91000000-0000-4000-8000-000000000001
sql_user_b=91000000-0000-4000-8000-000000000002
sql_subject_a=92000000-0000-4000-8000-000000000001
sql_subject_b=92000000-0000-4000-8000-000000000002

# A fresh disposable case applies the unapplied proposal only locally.
q "do \$ddl\$ begin
  if not exists(select 1 from pg_roles where rolname='myeongha_system_executor') then
    create role myeongha_system_executor nologin;
  end if;
end \$ddl\$;" >/dev/null
psql -X -v ON_ERROR_STOP=1 -f supabase/proposals/1740_portone_identity_age_authority_v1.proposed.sql >/dev/null

[[ "$(q "select count(*) from pg_class where oid in
  ('public.legal_portone_identity_attempts_v1'::regclass,
   'public.legal_portone_verified_age_v1'::regclass)
  and relrowsecurity")" == 2 ]] || fail 'RLS missing'
[[ "$(q "select case when
  has_function_privilege('myeongha_api_executor',
    'public.cmd_issue_legal_portone_identity_v1(uuid)','EXECUTE')
  and has_function_privilege('myeongha_api_executor',
    'public.qry_verified_legal_portone_age_v1(uuid)','EXECUTE')
  and not has_table_privilege('myeongha_api_executor',
    'public.legal_portone_verified_age_v1','SELECT')
  and not has_table_privilege('authenticated',
    'public.legal_portone_identity_attempts_v1','SELECT')
  and not has_function_privilege('authenticated',
    'public.cmd_consume_legal_portone_identity_v1(uuid,text,text)','EXECUTE')
  and not has_function_privilege('service_role',
    'public.internal_purge_expired_legal_portone_attempts_v1(integer)','EXECUTE')
  and has_function_privilege('myeongha_system_executor',
    'public.internal_purge_expired_legal_portone_attempts_v1(integer)','EXECUTE')
then 't' else 'f' end")" == t ]] || fail 'ACL privilege escape'
pass 'RLS and narrow execution ACL'

q "insert into auth.users(id) values ('$sql_user_a'),('$sql_user_b');
insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at)
values ('$sql_subject_a','member','$sql_user_a','active',null,clock_timestamp(),clock_timestamp()),
('$sql_subject_b','member','$sql_user_b','active',null,clock_timestamp(),clock_timestamp());" >/dev/null

as_subject() {
  local user="$1" statement="$2"
  q "begin; set local role myeongha_api_executor;
  select subject_id from public.begin_member_subject_context_v1('$user'::uuid);
  $statement
  commit;"
}
issue() {
  as_subject "$1" "select identity_verification_id from public.cmd_issue_legal_portone_identity_v1('$2'::uuid);" | tail -n 1
}
consume() {
  as_subject "$1" "select public.cmd_consume_legal_portone_identity_v1('$2'::uuid,'$3'::text,'$4'::text);" |
    grep -E '^[tf]$' | tail -n 1
}
age() {
  as_subject "$1" "select coalesce(public.qry_verified_legal_portone_age_v1('$2'::uuid),'NONE');" | tail -n 1
}
attempt_id="$(issue "$sql_user_a" "$sql_subject_a")"
[[ "$attempt_id" =~ ^iv[a-f0-9]{32}$ ]] || fail 'server attempt not generated'
[[ "$(age "$sql_user_a" "$sql_subject_a")" == NONE ]] || fail 'age granted before verification'
[[ "$(consume "$sql_user_a" "$sql_subject_a" "$attempt_id" free_minor)" == t ]] ||
  fail 'valid single use refused'
[[ "$(consume "$sql_user_a" "$sql_subject_a" "$attempt_id" adult)" == f ]] ||
  fail 'consumed attempt was replayable'
[[ "$(age "$sql_user_a" "$sql_subject_a")" == free_minor ]] ||
  fail 'verified age missing or replay overwrote band'
pass 'server issue + exact single use + verified minimal age'

attempt_b="$(issue "$sql_user_b" "$sql_subject_b")"
set +e
as_subject "$sql_user_a" "select public.cmd_consume_legal_portone_identity_v1('$sql_subject_b'::uuid,'$attempt_b','adult');" >/dev/null 2>&1
other_status=$?
set -e
[[ "$other_status" != 0 ]] || fail 'cross-subject consume succeeded'
[[ "$(age "$sql_user_b" "$sql_subject_b")" == NONE ]] ||
  fail 'cross-subject age proof leaked'
pass 'cross-subject authority denied'

# DB-clock expiry, bounded system-worker cleanup and no permanent age loss.
q "update public.legal_portone_identity_attempts_v1 set
  issued_at=clock_timestamp()-interval '30 minutes',
  expires_at=clock_timestamp()-interval '20 minutes'
  where identity_verification_id='$attempt_b';" >/dev/null
[[ "$(consume "$sql_user_b" "$sql_subject_b" "$attempt_b" adult)" == f ]] ||
  fail 'expired attempt was consumed'
purged="$(q "begin; set local role myeongha_system_executor;
 select public.internal_purge_expired_legal_portone_attempts_v1(250); commit;" | tail -n 1)"
[[ "$purged" == 1 ]] || fail 'expired attempt physical cleanup mismatch'
[[ "$(q "select count(*) from public.legal_portone_identity_attempts_v1 where identity_verification_id='$attempt_b'")" == 0 ]] ||
  fail 'physical cleanup left expired attempt'
pass 'DB-clock expiry and system-only physical purge'

# The verified band can be upgraded only after a NEW consumed attempt.
race_id="$(issue "$sql_user_a" "$sql_subject_a")"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
(as_subject "$sql_user_a" "select public.cmd_consume_legal_portone_identity_v1('$sql_subject_a'::uuid,'$race_id','adult');
 select pg_sleep(2);" >"$tmp/first" 2>"$tmp/first.err") &
a=$!
sleep 0.25
(as_subject "$sql_user_a" "select public.cmd_consume_legal_portone_identity_v1('$sql_subject_a'::uuid,'$race_id','adult');" >"$tmp/second" 2>"$tmp/second.err") &
b=$!
wait "$a" || fail "first concurrent consume failed"
wait "$b" || fail "second concurrent consume failed"
[[ "$(grep -Ec '^t$' "$tmp/first" "$tmp/second" | awk -F: '{sum += $NF} END {print sum}')" == 1 ]] ||
  fail 'parallel consume produced multiple winners'
[[ "$(age "$sql_user_a" "$sql_subject_a")" == adult ]] ||
  fail 'atomic adult band not committed'
pass 'two concurrent PG sessions: only one consumes'

# Account deletion anonymizes Subject, so ON DELETE CASCADE alone is insufficient.
q "update public.subjects set status='deletion_pending',updated_at=clock_timestamp()
  where id='$sql_subject_a';" >/dev/null
[[ "$(q "select count(*) from public.legal_portone_verified_age_v1 where subject_id='$sql_subject_a'")" == 0 ]] ||
  fail 'age proof survived deletion transition'
[[ "$(q "select count(*) from public.legal_portone_identity_attempts_v1 where subject_id='$sql_subject_a'")" == 0 ]] ||
  fail 'attempt history survived deletion transition'
pass 'deletion-pending transition deletes both identity authorities'
echo 'PASS PortOne identity PG17 disposable authority smoke complete; no Production migration applied.'
