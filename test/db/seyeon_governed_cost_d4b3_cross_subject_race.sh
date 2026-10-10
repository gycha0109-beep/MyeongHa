#!/usr/bin/env bash
set -euo pipefail
# D4B-3: two independent Member Subjects compete for one UTC budget row.
# Synthetic model; disposable DB ONLY. Watchtower-Track: character-memory
[[ "${PGDATABASE:-}" == 'myeongha_seyeon_d4b3_test' ]] || {
  echo 'D4B-3 requires the exact disposable DB' >&2; exit 2;
}
db() { psql -X -qAt -F '|' -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose "$@"; }
tmp="$(mktemp -d)"
a_pid=''
b_pid=''
cleanup() {
  if [[ -p "$tmp/release" ]]; then
    (printf 'release\n' >"$tmp/release") >/dev/null 2>&1 &
    local rp=$!
    sleep 0.05
    kill "$rp" 2>/dev/null || true
  fi
  for child in "$a_pid" "$b_pid"; do
    if [[ -n "$child" ]]; then kill "$child" 2>/dev/null || true; wait "$child" 2>/dev/null || true; fi
  done
  db -c 'drop role if exists myeongha_seyeon_d4_login_ci' >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
bash test/db/chat_attempt_commit_concurrency.sh >"$tmp/fixture.log" 2>&1 || {
  cat "$tmp/fixture.log" >&2; exit 3;
}
db -f test/db/seyeon_governed_cost_d4a_fixture.sql >/dev/null
sa='a0000000-0000-0000-0000-000000000001'
sb='b3000000-0000-4000-8000-000000000001'
ta='a4000000-0000-0000-0000-000000000006'
tb='b3000000-0000-4000-8000-000000000004'
aa='a6000000-0000-0000-0000-000000000006'
ab='b3000000-0000-4000-8000-000000000006'
ca='d4b30000-0000-4000-8000-000000000001'
cb='d4b30000-0000-4000-8000-000000000002'
ca2='d4b30000-0000-4000-8000-000000000003'
cb2='d4b30000-0000-4000-8000-000000000004'
day="$(db -c "select (clock_timestamp() at time zone 'UTC')::date")"
# Member B gets its own Subject, thread and running attempt via real RPCs.
db <<SQL >/dev/null
insert into auth.users(id) values ('00000000-0000-0000-0000-00000000a002') on conflict do nothing;
insert into public.subjects(id,kind,auth_user_id,status,created_at,updated_at)
values ('$sb','member','00000000-0000-0000-0000-00000000a002','active',now(),now());
insert into public.conversation_threads(
  id,subject_id,thread_type,status,title,active_content_release_id,
  active_content_bundle_id,content_revision,next_sequence_no,created_at,updated_at
) values (
  'b3000000-0000-4000-8000-000000000003','$sb',
  'single_character','active','d4b3-other-member',
  'a2000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',0,1,now(),now()
);
insert into public.conversation_thread_characters(
  id,thread_id,character_id,content_bundle_id,role,joined_at
) values (
  'b3000000-0000-4000-8000-000000000005',
  'b3000000-0000-4000-8000-000000000003',
  'chat-commit-char','a1000000-0000-0000-0000-000000000001',
  'primary',now()-interval '1 minute'
);
insert into public.user_character_states(
  id,subject_id,character_id,closeness,trust,friction,
  relationship_stage,policy_version,revision,created_at,updated_at
) values (
  'b3000000-0000-4000-8000-000000000007','$sb',
  'chat-commit-char',10,20,3,'visitor','relationship-policy-v1',0,now(),now()
);
select * from public.cmd_receive_chat_turn_v1(
  '$sb','b3000000-0000-4000-8000-000000000003',
  'd4b3-other-member-client-turn','sha256:v1:d4b3-request','chat-request-v1',
  jsonb_build_object('clientTurnId','d4b3-other-member-client-turn',
    'text','another member question','clientCapability','0.0.1-dev'),
  'a2000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  '$tb','b3000000-0000-4000-8000-000000000008',
  'another member question',null,'sha256:v1:d4b3-message'
);
select * from public.cmd_allocate_chat_turn_attempt_v1('$sb','$tb','$ab','planner-v1');
select public.cmd_mark_chat_turn_context_ready_v1('$sb','$tb','$ab');
insert into public.seyeon_ai_governor_model_policies_v1(
 provider_key,model_key,policy_version,price_version,allowed_purposes,
 context_window_tokens,maximum_input_tokens,maximum_output_tokens,
 maximum_serialized_request_bytes,input_micro_usd_per_million,
 cached_input_micro_usd_per_million,output_micro_usd_per_million,is_active
) values (
 'openai-responses','d4-offline-no-network-model-chat',
 'd4-chat-policy-v1','d4-rate-v1',array['renderer']::text[],
 2000,1200,800,20000,1000000,250000,4000000,true
);
update public.seyeon_ai_governor_daily_budgets_v1
set global_limit_micro_usd=7000,subject_limit_micro_usd=5000
where bucket_utc_date='$day';
SQL
[[ "$(db -c "select state from public.chat_turn_attempts where id='$ab'")" == 'running' ]] || {
  echo 'FAIL B chat attempt is not in running state' >&2; exit 4;
}
admit() {
  local who="$1" call="$2"
  if [[ "$who" == A ]]; then
    cat <<SQL
set session authorization myeongha_seyeon_d4_login_ci;
begin;
set local role myeongha_seyeon_governed_executor;
select subject_id from public.begin_member_subject_context_v1('00000000-0000-0000-0000-00000000a001');
select call_id,ceiling_micro_usd from public.cmd_governed_start_seyeon_ai_call_v1(
 '$sa','$ta','$aa','post_turn','$call','event_extraction',
 'openai-responses','d4-offline-no-network-model','d4-policy-v1','d4-rate-v1',500,800,2500);
SQL
  else
    cat <<SQL
set session authorization myeongha_seyeon_d4_login_ci;
begin;
set local role myeongha_seyeon_governed_executor;
select subject_id from public.begin_member_subject_context_v1('00000000-0000-0000-0000-00000000a002');
select call_id,ceiling_micro_usd from public.cmd_governed_start_seyeon_ai_call_v1(
 '$sb','$tb','$ab','chat','$call','renderer',
 'openai-responses','d4-offline-no-network-model-chat','d4-chat-policy-v1','d4-rate-v1',500,800,2500);
SQL
  fi
}
snapshot() {
 db -c "select
 (select count(*) from public.seyeon_ai_call_cost_events where call_id in ('$ca','$cb','$ca2','$cb2')),
 (select occupied_micro_usd from public.seyeon_ai_governor_daily_budgets_v1 where bucket_utc_date='$day'),
 (select coalesce(sum(governor_effective_micro_usd),0) from public.seyeon_ai_call_cost_events where call_id in ('$ca','$cb','$ca2','$cb2'))"
}
denied() {
 local title="$1" constraint="$2" file="$3"
 if db -f "$file" >"$tmp/$title.log" 2>&1; then
   echo "FAIL $title was admitted" >&2; exit 20;
 fi
 if ! grep -Fq '23514' "$tmp/$title.log" || ! grep -Fq "$constraint" "$tmp/$title.log"; then
   echo "FAIL $title rejected for wrong reason" >&2; cat "$tmp/$title.log" >&2; exit 21;
 fi
}
# A blocks COMMIT at an explicit FIFO; B must queue on the same budget lock.
mkfifo "$tmp/release"
{ echo "set application_name='seyeon_d4b3_A';"; admit A "$ca";
  printf '\\! touch "%s/a-ready"\n\\! cat "%s/release" >/dev/null\ncommit;\n' "$tmp" "$tmp"; } >"$tmp/a.sql"
db -f "$tmp/a.sql" >"$tmp/a.log" 2>&1 &
a_pid=$!
ready=false
for i in $(seq 1 120); do
 if [[ -f "$tmp/a-ready" ]]; then ready=true; break; fi
 if ! kill -0 "$a_pid" 2>/dev/null; then break; fi
 sleep 0.05
done
[[ "$ready" == true ]] || { cat "$tmp/a.log" >&2; exit 5; }
{ echo "set application_name='seyeon_d4b3_B';";
  echo "set statement_timeout='15s';"; admit B "$cb"; echo 'commit;'; } >"$tmp/b.sql"
db -f "$tmp/b.sql" >"$tmp/b-first.log" 2>&1 &
b_pid=$!
blocked=false
for i in $(seq 1 120); do
 count="$(db -c "select count(*) from pg_catalog.pg_stat_activity b
 where b.application_name='seyeon_d4b3_B' and b.wait_event_type='Lock'
 and exists (select 1 from pg_catalog.pg_stat_activity a
 where a.application_name='seyeon_d4b3_A'
 and a.pid=any(pg_catalog.pg_blocking_pids(b.pid)))")"
 if [[ "$count" == 1 ]]; then blocked=true; break; fi
 if ! kill -0 "$b_pid" 2>/dev/null; then break; fi
 sleep 0.05
done
[[ "$blocked" == true ]] || { echo 'FAIL B did not queue behind A' >&2; cat "$tmp/b-first.log" >&2; exit 6; }
[[ "$(snapshot)" == '0|0|0' ]] || { echo "FAIL uncommitted reservation visible: $(snapshot)" >&2; exit 7; }
printf 'release\n' >"$tmp/release"
if ! wait "$a_pid"; then cat "$tmp/a.log" >&2; exit 8; fi
a_pid=''
grep -Fq "$ca|3700" "$tmp/a.log" || { cat "$tmp/a.log" >&2; exit 9; }
# A=3700, B=3700, global cap=7000: B must be rejected AFTER A commits.
if wait "$b_pid"; then echo 'FAIL B overbooked global budget' >&2; exit 10; fi
b_pid=''
grep -Fq '23514' "$tmp/b-first.log" &&
grep -Fq 'seyeon_ai_governor_global_exhausted' "$tmp/b-first.log" || {
 cat "$tmp/b-first.log" >&2; exit 11;
}
[[ "$(snapshot)" == '1|3700|3700' ]] || { echo "FAIL phantom occupancy: $(snapshot)" >&2; exit 12; }
# Raising only the synthetic global cap now allows B, not as A's Subject.
db -c "update public.seyeon_ai_governor_daily_budgets_v1
 set global_limit_micro_usd=9000 where bucket_utc_date='$day'" >/dev/null
db -f "$tmp/b.sql" >"$tmp/b-second.log" 2>&1 || { cat "$tmp/b-second.log" >&2; exit 13; }
grep -Fq "$cb|3700" "$tmp/b-second.log" || { cat "$tmp/b-second.log" >&2; exit 14; }
[[ "$(snapshot)" == '2|7400|7400' ]] || { echo "FAIL global counter or ledger: $(snapshot)" >&2; exit 15; }
attribution="$(db -c "select string_agg(call_id::text||':'||subject_id::text,
 ',' order by call_id) from public.seyeon_ai_call_cost_events where call_id in ('$ca','$cb')")"
[[ "$attribution" == "$ca:$sa,$cb:$sb" ]] || { echo "FAIL cost owner mixed: $attribution" >&2; exit 16; }
# With global headroom restored, a second quote must hit EACH Subject limit.
db -c "update public.seyeon_ai_governor_daily_budgets_v1
 set global_limit_micro_usd=18000 where bucket_utc_date='$day'" >/dev/null
{ admit A "$ca2"; echo 'commit;'; } >"$tmp/a2.sql"
{ admit B "$cb2"; echo 'commit;'; } >"$tmp/b2.sql"
denied a-subject 'seyeon_ai_governor_subject_exhausted' "$tmp/a2.sql"
denied b-subject 'seyeon_ai_governor_subject_exhausted' "$tmp/b2.sql"
[[ "$(snapshot)" == '2|7400|7400' ]] || { echo 'FAIL quota rejection mutated ledger' >&2; exit 17; }
# Two authenticated member sessions cannot reserve the other's canonical
# Subject, even with otherwise eligible turn/attempt values.
sed -e "s/'$sa'/'$sb'/g" -e "s/'$ta'/'$tb'/g" -e "s/'$aa'/'$ab'/g" \
 -e "s/'post_turn'/'chat'/g" -e "s/'event_extraction'/'renderer'/g" \
 "$tmp/a2.sql" >"$tmp/a-foreign.sql"
sed -e "s/'$sb'/'$sa'/g" -e "s/'$tb'/'$ta'/g" -e "s/'$ab'/'$aa'/g" \
 -e "s/'chat'/'post_turn'/g" -e "s/'renderer'/'event_extraction'/g" \
 "$tmp/b2.sql" >"$tmp/b-foreign.sql"
for who in a b; do
 if db -f "$tmp/$who-foreign.sql" >"$tmp/$who-foreign.log" 2>&1; then
   echo "FAIL $who Member reserved other Subject" >&2; exit 18;
 fi
 grep -Fq '42501' "$tmp/$who-foreign.log" || {
   echo "FAIL $who rejection not an authority check" >&2
   cat "$tmp/$who-foreign.log" >&2; exit 19;
 }
done
[[ "$(snapshot)" == '2|7400|7400' ]] || { echo 'FAIL unauthorized mutation' >&2; exit 22; }
echo 'D4B-3 two Member Subjects: global serialization, Subject quotas, ownership and authority PASS'
