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

# A historical restore/reactivation must never resurrect earlier age evidence.
q "update public.subjects set status='active',updated_at=clock_timestamp()
  where id='$sql_subject_a';" >/dev/null
[[ "$(age "$sql_user_a" "$sql_subject_a")" == NONE ]] ||
  fail 'reactivation exposed stale age proof'
pass 'subject reactivation cannot resurrect deleted age proof'

# A Guest promoted to an existing Member must not transfer an independent,
# potentially different person's verified-age record through the merge.
sql_guest=93000000-0000-4000-8000-000000000003
merge_attempt="iv$(printf 'c%.0s' {1..32})"
merge_proof="iv$(printf 'd%.0s' {1..32})"
q "insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at)
 values('$sql_guest','guest',null,'active',null,clock_timestamp(),clock_timestamp());
 insert into public.legal_portone_identity_attempts_v1
 (identity_verification_id,subject_id,status,issued_at,expires_at)
 values('$merge_attempt','$sql_guest','pending',clock_timestamp(),clock_timestamp()+interval '10 minutes');
 insert into public.legal_portone_verified_age_v1
 (subject_id,age_band,verification_id,verified_at)
 values('$sql_guest','free_minor','$merge_proof',clock_timestamp());" >/dev/null
q "update public.subjects set status='merged',
 merged_into_subject_id='$sql_subject_b',
 updated_at=clock_timestamp() where id='$sql_guest';" >/dev/null
[[ "$(q "select count(*) from public.legal_portone_identity_attempts_v1 where subject_id='$sql_guest'")" == 0 ]] ||
  fail 'merged Guest pending attempt survived merge'
[[ "$(q "select count(*) from public.legal_portone_verified_age_v1 where subject_id='$sql_guest'")" == 0 ]] ||
  fail 'merged Guest age-band survived merge'
[[ "$(age "$sql_user_b" "$sql_subject_b")" == NONE ]] ||
  fail 'Guest age band migrated to another Member without independent provider proof'
pass 'Guest merge invalidates Guest identity and cannot transfer age band'


# The 1741 pre-account proof is proposal-only. Apply solely to local disposable
# PG17 after existing 1740 verified-Subject authority.
psql -X -v ON_ERROR_STOP=1 -f supabase/proposals/1741_portone_preenrollment_age_authority_v1.proposed.sql >/dev/null
binding_a="$(printf 'a%.0s' {1..64})"
binding_b="$(printf 'b%.0s' {1..64})"
pre_issue() {
  q "begin; set local role myeongha_api_executor;
    select identity_verification_id from public.cmd_issue_legal_portone_preenrollment_v1('$1');
    commit;" | grep '^iv' | tail -n 1
}
pre_pending() {
  q "begin; set local role myeongha_api_executor;
    select public.qry_pending_legal_portone_preenrollment_v1('$1','$2');
    commit;" | grep -E '^[tf]$' | tail -n 1
}
pre_verify() {
  q "begin; set local role myeongha_api_executor;
    select public.cmd_verify_legal_portone_preenrollment_v1('$1','$2','$3');
    commit;" | grep -E '^[tf]$' | tail -n 1
}
pre_consume() {
  q "begin; set local role myeongha_api_executor;
    select coalesce(public.cmd_consume_legal_portone_preenrollment_v1('$1'),'NONE');
    commit;" | tail -n 1
}
[[ "$(q "select case when
 not has_table_privilege('authenticated','public.legal_portone_preenrollment_v1','SELECT')
 and not has_table_privilege('myeongha_api_executor','public.legal_portone_preenrollment_v1','SELECT')
 and not has_function_privilege('anon','public.cmd_issue_legal_portone_preenrollment_v1(text)','EXECUTE')
 and not has_function_privilege('service_role','public.cmd_consume_legal_portone_preenrollment_v1(text)','EXECUTE')
 and has_function_privilege('myeongha_api_executor','public.cmd_issue_legal_portone_preenrollment_v1(text)','EXECUTE')
 then 't' else 'f' end")" == t ]] || fail 'preenrollment RLS/ACL escape'
preid="$(pre_issue "$binding_a")"
[[ "$preid" =~ ^iv[a-f0-9]{32}$ ]] || fail 'bad pre-account PortOne identity ID'
[[ "$(pre_pending "$binding_a" "$preid")" == t ]] || fail 'owned pending identity missing'
[[ "$(pre_pending "$binding_b" "$preid")" == f ]] || fail 'cross-browser pending identity visible'
[[ "$(pre_consume "$binding_a")" == NONE ]] || fail 'unverified age proof consumed'
[[ "$(pre_verify "$binding_b" "$preid" adult)" == f ]] || fail 'cross-cookie age accepted'
[[ "$(pre_verify "$binding_a" "$preid" free_minor)" == t ]] || fail 'trusted verified age not recorded'
[[ "$(pre_verify "$binding_a" "$preid" adult)" == f ]] || fail 'verified proof overwritten'
[[ "$(pre_consume "$binding_b")" == NONE ]] || fail 'cross-cookie proof consumed'
[[ "$(pre_consume "$binding_a")" == free_minor ]] || fail 'verified proof not consumed'
[[ "$(pre_consume "$binding_a")" == NONE ]] || fail 'same age proof replayed'
pass 'A1 cookie-bound proof and single-use age authority'

expired_pre="$(pre_issue "$binding_b")"
q "update public.legal_portone_preenrollment_v1 set
 issued_at=clock_timestamp()-interval '30 minutes',
 expires_at=clock_timestamp()-interval '20 minutes'
 where identity_verification_id='$expired_pre';" >/dev/null
[[ "$(pre_pending "$binding_b" "$expired_pre")" == f ]] || fail 'expired proof visible'
[[ "$(pre_verify "$binding_b" "$expired_pre" adult)" == f ]] || fail 'expired proof verified'
[[ "$(pre_consume "$binding_b")" == NONE ]] || fail 'expired proof consumed'
[[ "$(q "begin; set local role myeongha_system_executor;
 select public.internal_purge_legal_portone_preenrollment_v1(250);
 commit;" | grep -E '^[0-9]+$' | tail -n 1)" == 1 ]] || fail 'TTL physical purge count mismatch'
pass 'A1 database-clock TTL and system-worker-only purge'

# Guest Subject, token and age entitlement succeed or roll back as one txn.
binding_c="$(printf 'c%.0s' {1..64})"
preid_c="$(pre_issue "$binding_c")"
[[ "$(pre_verify "$binding_c" "$preid_c" adult)" == t ]] || fail 'Guest verified proof absent'
guest_c=94000000-0000-4000-8000-000000000001
guest_session_c=95000000-0000-4000-8000-000000000001
guest_hash="myeongha-guest-bearer-hmac-sha256-v1:$(printf 'e%.0s' {1..64})"
guest_create() {
  q "begin; set local role myeongha_api_executor;
    select subject_id, guest_session_id, replayed
    from public.cmd_create_verified_guest_session_v1(
      '$2'::uuid,'$3'::uuid,'$4',
      clock_timestamp()+interval '1 day','$1'
    ); commit;"
}
set +e
guest_create "$binding_c" "$guest_c" "$guest_session_c" invalid-token-fingerprint >/dev/null 2>&1
guest_invalid_rc=$?
set -e
[[ "$guest_invalid_rc" != 0 ]] || fail 'invalid Guest token was accepted'
[[ "$(q "select status from public.legal_portone_preenrollment_v1 where identity_verification_id='$preid_c'")" == verified ]] ||
 fail 'failed Guest issuance consumed verified age proof'
[[ "$(q "select count(*) from public.subjects where id='$guest_c'")" == 0 ]] ||
 fail 'failed Guest issuance persisted a Subject'
guest_result="$(guest_create "$binding_c" "$guest_c" "$guest_session_c" "$guest_hash")"
[[ "$guest_result" == *"$guest_c"* ]] || fail 'verified Guest creation did not return Subject'
[[ "$(q "select age_band from public.legal_portone_verified_age_v1 where subject_id='$guest_c'")" == adult ]] ||
 fail 'Guest authority did not write verified adult band'
[[ "$(q "select status from public.legal_portone_preenrollment_v1 where identity_verification_id='$preid_c'")" == consumed ]] ||
 fail 'Guest issuance failed to consume proof'
set +e
guest_create "$binding_c" "94000000-0000-4000-8000-000000000002" "95000000-0000-4000-8000-000000000002" "$guest_hash" >/dev/null 2>&1
guest_replay_rc=$?
set -e
[[ "$guest_replay_rc" != 0 ]] || fail 'Guest proof replayed'
pass 'A1 atomic verified Guest creation and replay refusal'

# The trusted Supabase Auth UUID must exist before a Member can be bound.
binding_d="$(printf 'd%.0s' {1..64})"
preid_d="$(pre_issue "$binding_d")"
[[ "$(pre_verify "$binding_d" "$preid_d" free_minor)" == t ]] || fail 'Member proof was not verified'
member_d=91000000-0000-4000-8000-000000000004
bind_member() {
  q "begin; set local role myeongha_api_executor;
    select subject_id,age_band
    from public.cmd_bind_verified_member_preenrollment_v1('$1'::uuid,'$2');
    commit;"
}
set +e
bind_member "$member_d" "$binding_d" >/dev/null 2>&1
missing_member_rc=$?
set -e
[[ "$missing_member_rc" != 0 ]] || fail 'unknown Supabase UUID minted a Member'
[[ "$(q "select status from public.legal_portone_preenrollment_v1 where identity_verification_id='$preid_d'")" == verified ]] ||
 fail 'failed Member creation consumed proof'
q "insert into auth.users(id) values ('$member_d');" >/dev/null
member_result="$(bind_member "$member_d" "$binding_d")"
[[ "$member_result" == *"free_minor"* ]] || fail 'verified Member creation returned wrong age band'
[[ "$(q "select count(*) from public.subjects s
 join public.legal_portone_verified_age_v1 a on a.subject_id=s.id
 where s.auth_user_id='$member_d' and s.kind='member' and s.status='active'
 and a.verification_id='$preid_d' and a.age_band='free_minor'")" == 1 ]] ||
 fail 'Member and verified age were not committed together'
set +e
bind_member "$member_d" "$binding_d" >/dev/null 2>&1
member_replay_rc=$?
set -e
[[ "$member_replay_rc" != 0 ]] || fail 'same verified proof bound multiple Members'
pass 'A1 atomic Supabase Member creation and replay refusal'

echo 'PASS PortOne identity PG17 disposable authority smoke complete; no Production migration applied.'
