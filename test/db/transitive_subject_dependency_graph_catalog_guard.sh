#!/usr/bin/env bash
set -euo pipefail

inventory_path="docs/operations/TRANSITIVE_SUBJECT_DEPENDENCY_GRAPH_V1.json"
private_overlay_path="docs/operations/OFFICIAL_READER_PRIVATE_TRANSITIVE_SUBJECT_FK_OVERLAY_V1.json"

expected="$(
  node --input-type=module - "$inventory_path" "$private_overlay_path" <<'NODE'
import { readFile } from 'node:fs/promises';
const inventory = JSON.parse(await readFile(process.argv[2], 'utf8'));
const overlay = JSON.parse(await readFile(process.argv[3], 'utf8'));
if (inventory.schema !== 'myeongha-transitive-subject-dependency-graph-v1' ||
    inventory.edges?.length !== 140 ||
    overlay.schema !== 'myeongha-official-reader-private-transitive-subject-fk-overlay-v1' ||
    overlay.graphAuthority !== 'SCHEMA_DISCOVERED_POLICY_NEUTRAL' ||
    overlay.policyAuthority !== 'NONE_PENDING_PRIVACY_OWNER' ||
    overlay.publicReleaseAuthorized !== false ||
    overlay.executionAuthorized !== false ||
    overlay.edges?.length !== 18) {
  throw new Error('Subject FK historical graph or private Reader overlay invalid');
}
const expectedPrivateNames = new Set([
  'official_reader_account_deletion_privacy_status_v1',
  'official_reader_paid_answer_bodies',
  'official_reader_paid_answer_purge_jobs_v1',
  'official_reader_paid_delivery_attempts_v1',
  'official_reader_s3_source_authority_receipts_v1',
]);
const depths = { 1: 5, 2: 4, 3: 8, 4: 1 };
for (const edge of overlay.edges) {
  if (edge.scope !== 'OFFICIAL_READER_PRIVATE' ||
      edge.disposition !== 'UNDECIDED' ||
      edge.executionAuthorized !== false ||
      !expectedPrivateNames.has(edge.childTable) ||
      !Number.isInteger(edge.minDepth) ||
      !Array.isArray(edge.childColumns) ||
      !Array.isArray(edge.parentColumns) ||
      edge.childColumns.length !== edge.parentColumns.length ||
      edge.childColumns.length === 0 ||
      !depths[edge.minDepth]) {
    throw new Error('Unapproved Reader graph overlay contains unknown or elevated edge');
  }
  depths[edge.minDepth]--;
}
if (Object.values(depths).some(value => value !== 0)) {
  throw new Error('Reader graph overlay depth inventory mismatch');
}
const edges = [...inventory.edges, ...overlay.edges];
const lines = edges
  .map((edge) => [
    edge.minDepth,
    edge.parentTable,
    edge.childTable,
    edge.constraintName,
    edge.childColumns.join(','),
    edge.parentColumns.join(','),
  ].join('|'))
  .sort();
if (new Set(lines).size !== 158) throw new Error('Reader graph catalog has duplicate/missing edges');
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

[[ "$edge_count" == "158" ]] || {
  echo "Expected 140 historical plus 18 private Reader FK edges, found $edge_count." >&2
  exit 1
}

[[ "$direct_count" == "35" ]] || {
  echo "Direct depth-1 edges must match 30 historical plus 5 Reader private edges: actual=$direct_count." >&2
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
