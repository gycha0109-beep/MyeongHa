#!/usr/bin/env bash
set -euo pipefail

inventory_path="docs/operations/SUBJECT_OWNED_DATA_GRAPH_INVENTORY_V1.json"

expected="$(
  node --input-type=module - "$inventory_path" <<'NODE'
import { readFile } from 'node:fs/promises';
const inventory = JSON.parse(await readFile(process.argv[2], 'utf8'));
const refs = inventory.references ?? [];
const lines = refs
  .map((entry) => `${entry.table}|${entry.column}`)
  .sort();
process.stdout.write(lines.join('\n'));
NODE
)"

actual="$(
  psql -X -qAt -F '|' -v ON_ERROR_STOP=1 <<'SQL'
select distinct
  src.relname as table_name,
  src_col.attname as column_name
from pg_catalog.pg_constraint con
join pg_catalog.pg_class src on src.oid = con.conrelid
join pg_catalog.pg_namespace src_ns on src_ns.oid = src.relnamespace
join pg_catalog.pg_class dst on dst.oid = con.confrelid
join pg_catalog.pg_namespace dst_ns on dst_ns.oid = dst.relnamespace
join lateral unnest(con.conkey) with ordinality src_key(attnum, ord) on true
join lateral unnest(con.confkey) with ordinality dst_key(attnum, ord)
  on dst_key.ord = src_key.ord
join pg_catalog.pg_attribute src_col
  on src_col.attrelid = src.oid and src_col.attnum = src_key.attnum
join pg_catalog.pg_attribute dst_col
  on dst_col.attrelid = dst.oid and dst_col.attnum = dst_key.attnum
where con.contype = 'f'
  and src_ns.nspname = 'public'
  and dst_ns.nspname = 'public'
  and dst.relname = 'subjects'
  and dst_col.attname = 'id'
order by 1, 2;
SQL
)"

if [[ "$actual" != "$expected" ]]; then
  echo "Subject-owned data graph inventory drifted." >&2
  echo "--- inventory" >&2
  printf '%s\n' "$expected" >&2
  echo "--- live migrated schema direct subject FKs" >&2
  printf '%s\n' "$actual" >&2
  exit 1
fi

count="$(printf '%s\n' "$actual" | sed '/^$/d' | wc -l | tr -d ' ')"
[[ "$count" == "30" ]] || {
  echo "Expected exactly 30 current direct subject FK mappings, found $count." >&2
  exit 1
}
echo "Subject-owned data graph catalog guard PASS: ${count} direct subject FK mappings are classified."
