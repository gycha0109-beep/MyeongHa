#!/usr/bin/env bash
set -euo pipefail

inventory_path="docs/operations/SUBJECT_OWNED_DATA_GRAPH_INVENTORY_V1.json"
private_overlay_path="docs/operations/OFFICIAL_READER_PRIVATE_SUBJECT_FK_OVERLAY_V1.json"

expected="$(
  node --input-type=module - "$inventory_path" "$private_overlay_path" <<'NODE'
import { readFile } from 'node:fs/promises';
const inventory = JSON.parse(await readFile(process.argv[2], 'utf8'));
const overlay = JSON.parse(await readFile(process.argv[3], 'utf8'));
if (inventory.schema !== 'myeongha-subject-owned-data-graph-inventory-v1' ||
    inventory.references?.length !== 30 ||
    overlay.schema !== 'myeongha-official-reader-private-subject-fk-overlay-v1' ||
    overlay.policyAuthority !== 'NONE_PENDING_PRIVACY_OWNER' ||
    overlay.publicReleaseAuthorized !== false ||
    overlay.references?.length !== 5 ||
    overlay.references.some((entry) =>
      entry.column !== 'subject_id' ||
      entry.disposition !== 'UNDECIDED' ||
      entry.scope !== 'OFFICIAL_READER_PRIVATE' ||
      entry.executionAuthorized !== false)) {
  throw new Error('Subject FK inventory overlay cannot promote Privacy authority');
}
const expectedPrivate = [
  'official_reader_account_deletion_privacy_status_v1',
  'official_reader_paid_answer_bodies',
  'official_reader_paid_answer_purge_jobs_v1',
  'official_reader_paid_delivery_attempts_v1',
  'official_reader_s3_source_authority_receipts_v1',
].sort();
const privateTables = overlay.references.map((entry) => entry.table).sort();
if (JSON.stringify(privateTables) !== JSON.stringify(expectedPrivate)) {
  throw new Error('Official Reader private direct Subject FK inventory is incomplete or broadened');
}
const refs = [...inventory.references, ...overlay.references];
const lines = refs.map((entry) => `${entry.table}|${entry.column}`).sort();
if (new Set(lines).size !== 35) {
  throw new Error('Subject FK inventory contains duplicate or missing references');
}
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
[[ "$count" == "35" ]] || {
  echo "Expected exactly 30 historical plus 5 private Reader direct subject FK mappings, found $count." >&2
  exit 1
}
echo "Subject-owned data graph catalog guard PASS: ${count} direct subject FK mappings are classified."
