#!/usr/bin/env bash
set -euo pipefail

inventory_path="docs/operations/TRANSITIVE_SUBJECT_DEPENDENCY_GRAPH_V1.json"

expected="$(
  node --input-type=module - "$inventory_path" <<'NODE'
import { readFile } from 'node:fs/promises';
const inventory = JSON.parse(await readFile(process.argv[2], 'utf8'));
const lines = (inventory.edges ?? [])
  .map((edge) => [
    edge.minDepth,
    edge.parentTable,
    edge.childTable,
    edge.constraintName,
    edge.childColumns.join(','),
    edge.parentColumns.join(','),
  ].join('|'))
  .sort();
process.stdout.write(lines.join('\n'));
NODE
)"

actual="$(
  psql -X -qAt -F '|' -v ON_ERROR_STOP=1 <<'SQL'
with recursive
fk_edges as (
  select
    con.oid as constraint_oid,
    con.conname as constraint_name,
    parent.relname as parent_table,
    child.relname as child_table,
    string_agg(child_att.attname, ',' order by child_key.ord) as child_columns,
    string_agg(parent_att.attname, ',' order by parent_key.ord) as parent_columns
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class child on child.oid = con.conrelid
  join pg_catalog.pg_namespace child_ns on child_ns.oid = child.relnamespace
  join pg_catalog.pg_class parent on parent.oid = con.confrelid
  join pg_catalog.pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
  join lateral unnest(con.conkey) with ordinality child_key(attnum, ord) on true
  join lateral unnest(con.confkey) with ordinality parent_key(attnum, ord)
    on parent_key.ord = child_key.ord
  join pg_catalog.pg_attribute child_att
    on child_att.attrelid = child.oid and child_att.attnum = child_key.attnum
  join pg_catalog.pg_attribute parent_att
    on parent_att.attrelid = parent.oid and parent_att.attnum = parent_key.attnum
  where con.contype = 'f'
    and child_ns.nspname = 'public'
    and parent_ns.nspname = 'public'
  group by con.oid, con.conname, parent.relname, child.relname
),
walk as (
  select
    e.constraint_oid,
    e.constraint_name,
    e.parent_table,
    e.child_table,
    e.child_columns,
    e.parent_columns,
    1 as depth,
    array['subjects'::text, e.child_table] as table_path,
    e.child_table = 'subjects' as cycle
  from fk_edges e
  where e.parent_table = 'subjects'

  union all

  select
    e.constraint_oid,
    e.constraint_name,
    e.parent_table,
    e.child_table,
    e.child_columns,
    e.parent_columns,
    w.depth + 1,
    w.table_path || e.child_table,
    e.child_table = any(w.table_path)
  from walk w
  join fk_edges e on e.parent_table = w.child_table
  where not w.cycle
    and w.depth < 20
),
canonical as (
  select
    constraint_oid,
    constraint_name,
    parent_table,
    child_table,
    child_columns,
    parent_columns,
    min(depth) as min_depth
  from walk
  group by
    constraint_oid,
    constraint_name,
    parent_table,
    child_table,
    child_columns,
    parent_columns
)
select
  min_depth,
  parent_table,
  child_table,
  constraint_name,
  child_columns,
  parent_columns
from canonical
order by
  min_depth,
  parent_table,
  child_table,
  constraint_name,
  child_columns,
  parent_columns;
SQL
)"

# The 140-edge inventory is a historical frozen schema snapshot. New signup
# wallet edges are separately governed DELETE, never retained Commerce evidence.
wallet_edges="$(printf '%s\n' "$actual" | awk -F '|' '$3 ~ /^chat_credit_/ { print }' | sort)"
expected_wallet_edges="$(printf '%s\n' \
  '1|subjects|chat_credit_lots_v1|chat_credit_lots_v1_subject_id_fkey|subject_id|id' \
  '2|chat_credit_lots_v1|chat_credit_turn_allocations_v1|chat_credit_turn_allocations_v1_lot_id_fkey|lot_id|id' \
  '2|conversation_threads|chat_credit_turn_reservations_v1|chat_credit_turn_reservations_thread_v1|thread_id,subject_id|id,subject_id' \
  '3|chat_credit_turn_reservations_v1|chat_credit_turn_allocations_v1|chat_credit_turn_allocations_v1_reservation_id_fkey|reservation_id|id' | sort)"
if [[ "$wallet_edges" != "$expected_wallet_edges" ]]; then
  echo 'Production signup wallet FK extension is unexpected or incomplete.' >&2
  echo "$wallet_edges" >&2
  exit 1
fi
actual="$(printf '%s\n' "$actual" | awk -F '|' '$3 !~ /^chat_credit_/' )"
if [[ "$actual" != "$expected" ]]; then
  echo "Transitive Subject dependency graph inventory drifted." >&2
  echo "--- inventory" >&2
  printf '%s\n' "$expected" >&2
  echo "--- live migrated schema reachable FK graph" >&2
  printf '%s\n' "$actual" >&2
  exit 1
fi

edge_count="$(printf '%s\n' "$actual" | sed '/^$/d' | wc -l | tr -d ' ')"
direct_count="$(printf '%s\n' "$actual" | awk -F '|' '$1 == "1" { count += 1 } END { print count + 0 }')"
max_depth="$(printf '%s\n' "$actual" | awk -F '|' 'BEGIN { max = 0 } $1 + 0 > max { max = $1 + 0 } END { print max }')"

[[ "$edge_count" == "140" ]] || {
  echo "Expected exactly 140 current reachable FK edges, found $edge_count." >&2
  exit 1
}

[[ "$direct_count" == "30" ]] || {
  echo "Direct depth-1 edge count must stay consistent with #1063: expected=30 actual=$direct_count." >&2
  exit 1
}

[[ "$max_depth" == "4" ]] || {
  echo "Expected canonical reachable max depth 4, found $max_depth." >&2
  exit 1
}

if (( max_depth >= 20 )); then
  echo "Transitive graph reached recursion safety bound depth=20; review required." >&2
  exit 1
fi

echo "Transitive Subject dependency graph catalog guard PASS: edges=${edge_count} direct_depth1=${direct_count} max_depth=${max_depth}."
