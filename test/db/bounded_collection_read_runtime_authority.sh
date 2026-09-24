#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)

fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

expect_fail() {
  local label="$1"
  local needle="$2"
  local sql="$3"
  local out rc
  set +e
  out=$("${psql_base[@]}" -c "$sql" 2>&1)
  rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    echo "$out" >&2
    fail "$label unexpectedly succeeded"
  fi
  if [[ "$out" != *"$needle"* ]]; then
    echo "$out" >&2
    fail "$label failed for unexpected reason"
  fi
  pass "$label -> $needle"
}

for signature in   "public.qry_chat_thread_stream_v2(uuid,uuid,bigint,integer)"   "public.qry_life_record_ledger_v2(uuid,timestamptz,timestamptz,uuid,integer)"   "public.qry_memory_items_v2(uuid,timestamptz,uuid,integer)"   "public.qry_reading_history_v3(uuid,timestamptz,timestamptz,uuid,integer)"
do
  def=$("${psql_base[@]}" -Atc "select lower(pg_get_functiondef('$signature'::regprocedure));")
  [[ "$def" == *"limit (p_page_size + 1)"* ]] || fail "$signature lost PostgreSQL page_size + 1 bound"
  [[ "$def" == *"p_page_size < 1 or p_page_size > 50"* ]] || fail "$signature lost 1..50 page-size guard"
done
pass "all four growing collection authorities enforce page_size + 1 in PostgreSQL"

chat_first=$("${psql_base[@]}" -Atc "select string_agg(sequence_no::text,',' order by sequence_no) from public.qry_chat_thread_stream_v2(
  '52100000-0000-0000-0000-000000000001',
  '52400000-0000-0000-0000-000000000001',
  0,
  1
);")
[[ "$chat_first" == "1,2" ]] || fail "Chat page-size+1 window mismatch: $chat_first"

chat_next=$("${psql_base[@]}" -Atc "select string_agg(sequence_no::text,',' order by sequence_no) from public.qry_chat_thread_stream_v2(
  '52100000-0000-0000-0000-000000000001',
  '52400000-0000-0000-0000-000000000001',
  1,
  1
);")
[[ "$chat_next" == "2,3" ]] || fail "Chat keyset continuation mismatch: $chat_next"
pass "Chat sequence pages are finite and advance without offset semantics"

life_walk=$("${psql_base[@]}" -At -F '|' <<'SQL'
with
p1 as (
  select *
  from public.qry_life_record_ledger_v2(
    '5f200000-0000-0000-0000-000000000001', null, null, null, 1
  )
  order by confirmed_at desc, created_at desc, life_fact_id asc
  limit 1
),
p2 as (
  select q.*
  from p1
  cross join lateral public.qry_life_record_ledger_v2(
    '5f200000-0000-0000-0000-000000000001',
    p1.confirmed_at,
    p1.created_at,
    p1.life_fact_id,
    1
  ) q
  order by q.confirmed_at desc, q.created_at desc, q.life_fact_id asc
  limit 1
),
p3 as (
  select q.*
  from p2
  cross join lateral public.qry_life_record_ledger_v2(
    '5f200000-0000-0000-0000-000000000001',
    p2.confirmed_at,
    p2.created_at,
    p2.life_fact_id,
    1
  ) q
  order by q.confirmed_at desc, q.created_at desc, q.life_fact_id asc
  limit 1
)
select
  (select life_fact_id::text from p1),
  (select life_fact_id::text from p2),
  (select life_fact_id::text from p3);
SQL
)
[[ "$life_walk" == "5f300000-0000-0000-0000-000000000002|5f300000-0000-0000-0000-000000000003|5f300000-0000-0000-0000-000000000001" ]]   || fail "Life Record keyset walk duplicated/omitted/reordered rows: $life_walk"
pass "Life Record page boundaries preserve deterministic ledger order"

memory_walk=$("${psql_base[@]}" -At -F '|' <<'SQL'
with
p1 as (
  select *
  from public.qry_memory_items_v2(
    '6b200000-0000-0000-0000-000000000001', null, null, 1
  )
  order by created_at desc, memory_item_id desc
  limit 1
),
p2 as (
  select q.*
  from p1
  cross join lateral public.qry_memory_items_v2(
    '6b200000-0000-0000-0000-000000000001',
    p1.created_at,
    p1.memory_item_id,
    1
  ) q
  order by q.created_at desc, q.memory_item_id desc
  limit 1
)
select
  (select memory_item_id::text from p1),
  (select memory_item_id::text from p2);
SQL
)
[[ "$memory_walk" == "6b300000-0000-0000-0000-000000000006|6b300000-0000-0000-0000-000000000001" ]]   || fail "Memory keyset walk duplicated/omitted/reordered rows: $memory_walk"
pass "Memory page boundaries preserve deterministic current-item order"

expect_fail   "Chat page size over maximum"   "chat stream page size must be between 1 and 50"   "select * from public.qry_chat_thread_stream_v2('52100000-0000-0000-0000-000000000001','52400000-0000-0000-0000-000000000001',0,51);"

expect_fail   "Life Record page size over maximum"   "life record page size must be between 1 and 50"   "select * from public.qry_life_record_ledger_v2('5f200000-0000-0000-0000-000000000001',null,null,null,51);"

expect_fail   "Memory page size over maximum"   "memory list page size must be between 1 and 50"   "select * from public.qry_memory_items_v2('6b200000-0000-0000-0000-000000000001',null,null,51);"

expect_fail   "Reading History page size over maximum"   "Reading History page size must be between 1 and 50"   "select * from public.qry_reading_history_v3('00000000-0000-4000-8000-000000000001',null,null,null,51);"

for signature in   "public.qry_chat_thread_stream_v2(uuid,uuid,bigint,integer)"   "public.qry_life_record_ledger_v2(uuid,timestamptz,timestamptz,uuid,integer)"   "public.qry_memory_items_v2(uuid,timestamptz,uuid,integer)"   "public.qry_reading_history_v3(uuid,timestamptz,timestamptz,uuid,integer)"
do
  public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','$signature','EXECUTE') then '1' else '0' end;")
  [[ "$public_exec" == "0" ]] || fail "$signature unexpectedly executable by PUBLIC"
done
pass "bounded collection authorities remain API-mediated"

echo "bounded collection read runtime authority tests passed"
