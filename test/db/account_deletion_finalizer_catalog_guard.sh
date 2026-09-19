#!/usr/bin/env bash
set -euo pipefail

catalog_file="$(mktemp)"
trap 'rm -f "$catalog_file"' EXIT

psql -X -qAt -v ON_ERROR_STOP=1 >"$catalog_file" <<'SQL'
create temp table _ad_policy(
  table_name text primary key,
  disposition text not null
);

insert into _ad_policy(table_name, disposition) values
  ('ai_execution_groundings','DELETE'),
  ('ai_execution_logs','DELETE'),
  ('birth_profile_revisions','DELETE'),
  ('birth_profiles','DELETE'),
  ('character_unlocks','DELETE'),
  ('chat_turn_attempts','DELETE'),
  ('chat_turns','DELETE'),
  ('commerce_account_links','RETAIN'),
  ('commerce_payment_attempts','RETAIN'),
  ('commerce_provider_events','RETAIN'),
  ('commerce_receipts','RETAIN'),
  ('conversation_messages','DELETE'),
  ('conversation_thread_characters','DELETE'),
  ('conversation_thread_content_transitions','DELETE'),
  ('conversation_threads','DELETE'),
  ('data_deletion_jobs','ANONYMIZE'),
  ('device_installations','DELETE'),
  ('entitlement_events','RETAIN'),
  ('entitlement_grants','RETAIN'),
  ('entitlements','RETAIN'),
  ('episode_progress_events','DELETE'),
  ('guest_sessions','DELETE'),
  ('life_facts','DELETE'),
  ('memory_items','DELETE'),
  ('memory_proposals','DELETE'),
  ('notification_deliveries','DELETE'),
  ('notification_delivery_attempts','DELETE'),
  ('notification_preferences','DELETE'),
  ('notification_settings','DELETE'),
  ('notifications','DELETE'),
  ('profiles','DELETE'),
  ('purchase_intent_reader_selections','RETAIN'),
  ('purchase_intents','RETAIN'),
  ('reading_execution_attempts','DELETE'),
  ('reading_groundings','DELETE'),
  ('reading_refs','DELETE'),
  ('reading_sessions','DELETE'),
  ('readings','DELETE'),
  ('record_access_grants','DELETE'),
  ('relationship_events','DELETE'),
  ('share_artifacts','DELETE'),
  ('subject_merge_actions','ANONYMIZE'),
  ('subject_merge_jobs','ANONYMIZE'),
  ('subjects','ANONYMIZE'),
  ('target_person_profiles','DELETE'),
  ('user_character_states','DELETE'),
  ('user_episode_progress','DELETE'),
  ('world_events','DELETE');

do $$
declare
  v_missing text;
begin
  select string_agg(p.table_name, ',' order by p.table_name)
    into v_missing
  from _ad_policy p
  left join pg_catalog.pg_class c
    on c.relname = p.table_name
   and c.relnamespace = 'public'::pg_catalog.regnamespace
   and c.relkind in ('r','p')
  where c.oid is null;

  if v_missing is not null then
    raise exception 'account deletion policy tables missing from migrated catalog: %', v_missing;
  end if;

  if (select count(*) from _ad_policy where disposition='DELETE') <> 35
     or (select count(*) from _ad_policy where disposition='ANONYMIZE') <> 4
     or (select count(*) from _ad_policy where disposition='RETAIN') <> 9
     or (select count(*) from _ad_policy) <> 48 then
    raise exception 'account deletion policy cardinality drifted';
  end if;
end
$$;

with recursive
fk as (
  select
    con.conname,
    parent.relname as parent_table,
    child.relname as child_table,
    con.confdeltype,
    pg_catalog.pg_get_constraintdef(con.oid, true) as constraint_def
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class child on child.oid = con.conrelid
  join pg_catalog.pg_class parent on parent.oid = con.confrelid
  where con.contype = 'f'
    and child.relnamespace = 'public'::pg_catalog.regnamespace
    and parent.relnamespace = 'public'::pg_catalog.regnamespace
    and exists (select 1 from _ad_policy p where p.table_name = child.relname)
    and exists (select 1 from _ad_policy p where p.table_name = parent.relname)
),
delete_fk as (
  select f.*
  from fk f
  join _ad_policy p_parent on p_parent.table_name=f.parent_table and p_parent.disposition='DELETE'
  join _ad_policy p_child on p_child.table_name=f.child_table and p_child.disposition='DELETE'
),
reach(start_table, current_table) as (
  select parent_table, child_table from delete_fk
  union
  select r.start_table, f.child_table
  from reach r
  join delete_fk f on f.parent_table = r.current_table
),
cycle_fk as (
  select distinct f.conname, f.parent_table, f.child_table
  from delete_fk f
  where f.parent_table = f.child_table
     or exists (
       select 1 from reach r
       where r.start_table = f.child_table
         and r.current_table = f.parent_table
     )
),
delete_triggers as (
  select
    c.relname as table_name,
    t.tgname as trigger_name,
    pg_catalog.pg_get_triggerdef(t.oid, true) as trigger_def
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid=t.tgrelid
  join _ad_policy p on p.table_name=c.relname and p.disposition='DELETE'
  where c.relnamespace='public'::pg_catalog.regnamespace
    and not t.tgisinternal
    and (t.tgtype & 8) = 8
),
anon_columns as (
  select
    c.relname as table_name,
    a.attnum,
    a.attname,
    a.attnotnull,
    pg_catalog.format_type(a.atttypid,a.atttypmod) as data_type
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid=a.attrelid
  join _ad_policy p on p.table_name=c.relname and p.disposition='ANONYMIZE'
  where c.relnamespace='public'::pg_catalog.regnamespace
    and a.attnum > 0
    and not a.attisdropped
),
detach_shape as (
  select
    a.attnotnull,
    pg_catalog.pg_get_constraintdef(con.oid, true) as constraint_def
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid=a.attrelid
  join pg_catalog.pg_constraint con
    on con.conrelid=c.oid
   and con.conname='subject_merge_jobs_session_guest_fk'
  where c.relnamespace='public'::pg_catalog.regnamespace
    and c.relname='subject_merge_jobs'
    and a.attname='guest_session_id'
)
select line
from (
  select 10 as section, p.table_name as k1, '' as k2,
         'POLICY|'||p.disposition||'|'||p.table_name as line
  from _ad_policy p

  union all

  select 20, f.parent_table, f.conname,
         'FK|'||f.conname||'|'||f.parent_table||'|'||f.child_table||'|'||
         f.confdeltype::text||'|'||f.constraint_def
  from fk f

  union all

  select 30, t.table_name, t.trigger_name,
         'DELETE_TRIGGER|'||t.table_name||'|'||t.trigger_name||'|'||t.trigger_def
  from delete_triggers t

  union all

  select 40, c.parent_table, c.conname,
         'DELETE_CYCLE|'||c.conname||'|'||c.parent_table||'|'||c.child_table
  from cycle_fk c

  union all

  select 50, a.table_name, lpad(a.attnum::text,5,'0'),
         'ANON_COLUMN|'||a.table_name||'|'||a.attname||'|'||
         case when a.attnotnull then 'NOT_NULL' else 'NULLABLE' end||'|'||a.data_type
  from anon_columns a

  union all

  select 60, 'subject_merge_jobs', 'guest_session_id',
         'DETACH_SHAPE|subject_merge_jobs|guest_session_id|'||
         case when d.attnotnull then 'NOT_NULL' else 'NULLABLE' end||'|'||d.constraint_def
  from detach_shape d
) x
order by section, k1, k2, line;
SQL

actual="$(sha256sum "$catalog_file" | awk '{print $1}')"
expected="9d833aa0b580dd90d0744586d33ae5bb6587dafb01d640d8edc2abac0bc92324"

echo "Account deletion finalizer catalog digest: $actual"

echo "DELETE-trigger blockers:"
grep '^DELETE_TRIGGER|' "$catalog_file" || true

echo "DELETE-subgraph cycle edges:"
grep '^DELETE_CYCLE|' "$catalog_file" || true

echo "Guest-session detach shape:"
grep '^DETACH_SHAPE|' "$catalog_file" || true

delete_trigger_count="$(grep -c '^DELETE_TRIGGER|' "$catalog_file" || true)"
delete_cycle_count="$(grep -c '^DELETE_CYCLE|' "$catalog_file" || true)"
detach_shape_count="$(grep -c '^DETACH_SHAPE|' "$catalog_file" || true)"

if [[ "$delete_trigger_count" != "6" ]]; then
  echo "FAIL expected 6 DELETE-trigger catalog rows, found $delete_trigger_count" >&2
  exit 1
fi
if [[ "$delete_cycle_count" != "19" ]]; then
  echo "FAIL expected 19 DELETE-subgraph cycle edges, found $delete_cycle_count" >&2
  exit 1
fi
if [[ "$detach_shape_count" != "1" ]] || ! grep -q '^DETACH_SHAPE|subject_merge_jobs|guest_session_id|NOT_NULL|' "$catalog_file"; then
  echo "FAIL guest-session detach shape drifted" >&2
  exit 1
fi

if [[ "$actual" != "$expected" ]]; then
  echo "FAIL account deletion finalizer catalog digest mismatch expected=$expected actual=$actual" >&2
  exit 1
fi

echo "PASS account deletion finalizer catalog guard"
