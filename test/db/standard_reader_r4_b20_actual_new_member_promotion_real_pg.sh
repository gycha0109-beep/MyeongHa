#!/usr/bin/env bash
set -euo pipefail
[[ "$CI" == true && "$PGHOST" == localhost &&
   "$PGDATABASE" == myeongha_b2_r4_b20_actual_promotion ]] || exit 1
p(){ psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail(){ echo "FAIL R4/BIND-20/actual_promotion $*" >&2; exit 1; }
tmp="$(mktemp -d)";trap 'rm -rf "$tmp"' EXIT
guest=11390000-0000-0000-0000-000000000001
reading=12103100-0000-0000-0000-000000000001
auth=b2201000-0000-4000-8000-000000000001
session=b2202000-0000-4000-8000-000000000001
other=b2203000-0000-4000-8000-000000000001
other_session=b2204000-0000-4000-8000-000000000001
# Two real verified purchase-backed official Source and Baekheon Reader Access
# inputs. No synthetic direct Guest->Member status UPDATE is used.
awk '/^create temp table _v2_additional_result as/{exit} {print}' \
 test/db/official_standard_reading_reader_interpretation.sql >"$tmp/setup.sql"
awk '/^create temp table _b2_additional_result as/{exit} {print}' \
 test/db/standard_reader_additional_policy_locked_positive.sql >>"$tmp/setup.sql"
p -f "$tmp/setup.sql" >"$tmp/setup.out" 2>"$tmp/setup.err" ||
 { tail -n 40 "$tmp/setup.err" >&2; fail 'verified purchase fixture'; }
p >"$tmp/bind.out" 2>"$tmp/bind.err" <<SQL ||
begin;
select set_config('myeongha.subject_id','$guest',true);
select * from public.internal_cmd_bind_standard_reader_additional_policy_locked_v1(
 '$guest'::uuid,'b2020000-0000-4000-8000-000000000001'::uuid,
 'b2040000-0000-4000-8000-000000000001'::uuid,
 'b2050000-0000-4000-8000-000000000001'::uuid,
 'sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
 'standard-reading-access-bind-v2',
 '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"b2020000-0000-4000-8000-000000000001"}'::jsonb);
commit;
SQL
{ cat "$tmp/bind.err" >&2; fail 'verified private Baekheon Binder'; }
read_count(){
 local owner="$1" reader="$2"
 p -c "select set_config('myeongha.subject_id','$owner',false);
 select count(*) from public.internal_qry_character_standard_reading_access_v2(
 '$owner'::uuid,'$reader',clock_timestamp()) where reading_id='$reading'::uuid" | tail -n 1
}
[[ "$(read_count "$guest" baekheon)" == 1 ]] || fail 'Guest lacks purchased Reader'
# A REAL (already installed) cmd_promote_guest_runtime_v1:
# Guest -> NEW Member while preserving the exact subject_id, NOT the
# separate OPEN/SRC-24 existing-member merge command.
p >"$tmp/users.out" 2>"$tmp/users.err" <<SQL ||
insert into auth.users(id) values ('$auth'::uuid);
insert into public.guest_sessions(id,subject_id,token_hash,expires_at,created_at)
values ('$session'::uuid,'$guest'::uuid,'b20-real-promotion-proof',
 clock_timestamp()+interval '1 day',clock_timestamp());
insert into public.subjects(id,kind,status,created_at,updated_at)
values ('$other'::uuid,'guest','active',clock_timestamp(),clock_timestamp());
insert into public.guest_sessions(id,subject_id,token_hash,expires_at,created_at)
values ('$other_session'::uuid,'$other'::uuid,'b20-real-promotion-other',
 clock_timestamp()+interval '1 day',clock_timestamp());
SQL
{ cat "$tmp/users.err" >&2; fail 'actual Guest/session preconditions'; }
p >"$tmp/promote.out" 2>"$tmp/promote.err" <<SQL ||
begin;
set local role myeongha_api_executor;
select set_config('myeongha.subject_id','$guest',true);
select subject_kind||'|'||subject_status||'|'||replayed::text
from public.cmd_promote_guest_runtime_v1('$guest'::uuid,'$session'::uuid,'$auth'::uuid);
commit;
SQL
{ cat "$tmp/promote.err" >&2; fail 'actual runtime-owned promotion'; }
grep -Fxq 'member|active|false' "$tmp/promote.out" ||
 { cat "$tmp/promote.out" >&2; fail 'real promotion unexpected result'; }
[[ "$(p -c "select count(*) from public.subjects
 where id='$guest'::uuid and kind='member' and status='active'
 and auth_user_id='$auth'::uuid and merged_into_subject_id is null")" == 1 ]] ||
 fail 'promotion changed original Guest canonical identity'
[[ "$(p -c "select count(*) from public.guest_sessions
 where id='$session'::uuid and consumed_at is not null
 and claimed_by_subject_id='$guest'::uuid")" == 1 ]] ||
 fail 'promotion did not consume exact Guest session'
[[ "$(read_count "$guest" baekheon)" == 1 ]] ||
 fail 'actual same-subject Member promotion lost exact paid Reader'
[[ "$(read_count "$guest" seyeon)" == 0 ]] ||
 fail 'promotion invented unpurchased Reader rights'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
 where subject_id='$guest'::uuid and reader_character_id='baekheon'")" == 1 ]] ||
 fail 'promotion reparented or erased Reader purchase provenance'
[[ "$(p -c "select count(*) from public.standard_reading_official_bindings
 where subject_id='$guest'::uuid and reading_id='$reading'::uuid")" == 1 ]] ||
 fail 'promotion rewrote immutable Official Reading ownership'
p >"$tmp/replay.out" 2>"$tmp/replay.err" <<SQL ||
begin;
set local role myeongha_api_executor;
select set_config('myeongha.subject_id','$guest',true);
select replayed::text from public.cmd_promote_guest_runtime_v1(
 '$guest'::uuid,'$session'::uuid,'$auth'::uuid);
commit;
SQL
{ cat "$tmp/replay.err" >&2; fail 'real command response-loss replay'; }
grep -Fxq true "$tmp/replay.out" || fail 'real promotion replay did not converge'
# A verified auth user ALREADY bound to the member above cannot be claimed
# by another Guest. This is the concrete SRC-24 boundary, NOT an inferred
# implementation of existing-member merge.
if p >"$tmp/existing.out" 2>"$tmp/existing.err" <<SQL
begin;
set local role myeongha_api_executor;
select set_config('myeongha.subject_id','$other',true);
select * from public.cmd_promote_guest_runtime_v1(
 '$other'::uuid,'$other_session'::uuid,'$auth'::uuid);
commit;
SQL
then fail 'same existing Member auth user accepted another Guest promotion'; fi
grep -Fq 'auth identity already belongs to another subject; use guest merge' "$tmp/existing.err" ||
 { cat "$tmp/existing.err" >&2; fail 'existing-Member merge boundary rejected for unrelated cause'; }
[[ "$(p -c "select count(*) from public.subjects
 where id='$other'::uuid and kind='guest' and status='active'
 and auth_user_id is null and merged_into_subject_id is null")" == 1 ]] ||
 fail 'denied existing-member claim mutated other Guest'
[[ "$(p -c "select count(*) from public.guest_sessions
 where id='$other_session'::uuid and consumed_at is null")" == 1 ]] ||
 fail 'denied claim consumed other Guest session'
if p >"$tmp/forged.out" 2>"$tmp/forged.err" <<SQL
begin;
set local role myeongha_api_executor;
select set_config('myeongha.subject_id','$other',true);
select * from public.cmd_promote_guest_runtime_v1(
 '$guest'::uuid,'$session'::uuid,'$auth'::uuid);
commit;
SQL
then fail 'cross-Subject promotion request accepted'; fi
grep -Fq 'subject execution context mismatch' "$tmp/forged.err" ||
 { cat "$tmp/forged.err" >&2; fail 'forged promotion denied for unrelated reason'; }
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants")" == 2 ]] ||
 fail 'real promotion minted or destroyed paid Reader grants'
echo 'PASS R4/BIND-20 actual Guest-to-NEW-Member runtime promotion retains paid Reader/Reading and same Subject; existing-Member merge remains SRC-24 HOLD'
