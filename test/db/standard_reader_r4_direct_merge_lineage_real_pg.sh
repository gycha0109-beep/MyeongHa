#!/usr/bin/env bash
set -euo pipefail
[[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
   "${PGDATABASE:-}" == myeongha_b2_r4_b20_direct_merge ]] || exit 1
p(){ psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail(){ echo "FAIL R4/BIND-20 $*" >&2; exit 1; }
tmp="$(mktemp -d)";trap 'rm -rf "$tmp"' EXIT
guest=11390000-0000-0000-0000-000000000001
member=b2200000-0000-4000-8000-000000000001
other=b2200000-0000-4000-8000-000000000002
reading=12103100-0000-0000-0000-000000000001
# The original immutable Saju Source and verified additional purchase are
# constructed in ONE psql session (temp assertion helpers are session-local).
awk '/^create temp table _v2_additional_result as/{exit} {print}' \
 test/db/official_standard_reading_reader_interpretation.sql >"$tmp/fixture.sql"
awk '/^create temp table _b2_additional_result as/{exit} {print}' \
 test/db/standard_reader_additional_policy_locked_positive.sql >>"$tmp/fixture.sql"
p -f "$tmp/fixture.sql" >"$tmp/setup.out" 2>"$tmp/setup.err" ||
 { tail -n 50 "$tmp/setup.err" >&2; fail 'real verified purchase/Source setup'; }
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
{ cat "$tmp/bind.err" >&2; fail 'guest paid Reader private binder'; }
read_count(){
 local owner="$1" reader="$2"
 p -c "select set_config('myeongha.subject_id','$owner',false);
 select count(*) from public.internal_qry_character_standard_reading_access_v2(
 '$owner'::uuid,'$reader',clock_timestamp()) where reading_id='$reading'::uuid" | tail -n 1
}
[[ "$(read_count "$guest" baekheon)" == 1 ]] ||
 fail 'verified Guest Reader access missing before lineage change'
# A disposable direct canonical lineage fixture, NOT an execution of
# production merge command or proof of protected Guest-session ownership.
p >/dev/null <<SQL
insert into auth.users(id) values
 ('b2210000-0000-4000-8000-000000000001'),
 ('b2210000-0000-4000-8000-000000000002');
insert into public.subjects(
 id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at
) values
 ('$member'::uuid,'member','b2210000-0000-4000-8000-000000000001'::uuid,
 'active',null,clock_timestamp(),clock_timestamp()),
 ('$other'::uuid,'member','b2210000-0000-4000-8000-000000000002'::uuid,
 'active',null,clock_timestamp(),clock_timestamp());
update public.subjects
set status='merged',merged_into_subject_id='$member'::uuid,updated_at=clock_timestamp()
where id='$guest'::uuid and kind='guest' and status='active';
SQL
[[ "$(p -c "select count(*) from public.qry_direct_merged_guest_subjects_v1(
'$member'::uuid) where guest_subject_id='$guest'::uuid")" == 1 ]] ||
 fail 'canonical Member did not resolve directly merged Guest lineage'
[[ "$(p -c "select count(*) from public.qry_direct_merged_guest_subjects_v1(
'$other'::uuid) where guest_subject_id='$guest'::uuid")" == 0 ]] ||
 fail 'unrelated Member forged merged Guest lineage'
[[ "$(read_count "$member" baekheon)" == 1 ]] ||
 fail 'lawful direct lineage did not retain historical paid Reader access'
[[ "$(read_count "$other" baekheon)" == 0 ]] ||
 fail 'unrelated Member inherited Guest Reading'
[[ "$(read_count "$member" seyeon)" == 0 ]] ||
 fail 'Member received a non-purchased Reader'
if p >"$tmp/forged.out" 2>"$tmp/forged.err" <<SQL
begin;
select set_config('myeongha.subject_id','$other',true);
select count(*) from public.internal_qry_character_standard_reading_access_v2(
 '$member'::uuid,'baekheon',clock_timestamp());
commit;
SQL
then fail 'forged transaction Subject read another Member lineage'; fi
grep -Fq 'subject execution context mismatch' "$tmp/forged.err" ||
 { cat "$tmp/forged.err" >&2; fail 'cross-Member read denied for unrelated reason'; }
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
where subject_id='$guest'::uuid and reader_character_id='baekheon'")" == 1 ]] ||
 fail 'historical paid Reader owner reparented or lost'
[[ "$(p -c "select count(*) from public.standard_reading_official_bindings
where subject_id='$guest'::uuid and reading_id='$reading'::uuid")" == 1 ]] ||
 fail 'historical official Source owner rewritten'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
where subject_id='$member'::uuid")" == 0 ]] ||
 fail 'Member lineage projection minted new paid access rows'
echo 'PASS R4/BIND-20 synthetic direct Guest-to-Member lineage reads exact retained Reader/Reading only; forged/cross Member DENY'
