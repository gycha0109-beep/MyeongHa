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

# P0-PR-01 historical 30-edge inventory is immutable. The new signup-only
# wallet is separately classified DELETE and enforced by the 1730 erasure trigger.
# It is NOT retained Commerce payment evidence.
if ! printf '%s\n' "$actual" | grep -Fxq 'chat_credit_lots_v1|subject_id'; then
  echo "Expected private signup wallet FK and deletion coverage are absent." >&2
  exit 1
fi
# Official Reader S3/S4/S7 and buyer-claim Subject children are governed
# by the separately reviewed deletion/cryptographic-erasure migrations.
# Keep the original approved P0-PR-01 30-edge baseline immutable; fail if
# any of the six new exact Reader edges disappears or an extra edge appears.
reader_subject_children=(
  digital_reading_withdrawal_claims_private_v1
  official_reader_account_deletion_privacy_status_v1
  official_reader_paid_answer_bodies
  official_reader_paid_answer_purge_jobs_v1
  official_reader_paid_delivery_attempts_v1
  official_reader_s3_source_authority_receipts_v1
)
reader_subject_present=0
for table in "${reader_subject_children[@]}"; do
  if printf '%s\n' "$actual" | grep -Fxq "${table}|subject_id"; then
    reader_subject_present=$((reader_subject_present + 1))
  fi
done
if [[ "$reader_subject_present" != 0 &&
      "$reader_subject_present" != "${#reader_subject_children[@]}" ]]; then
  echo 'Incomplete independent Reader deletion graph coverage' >&2
  exit 1
fi
if [[ "$reader_subject_present" != 0 ]]; then
  for table in "${reader_subject_children[@]}"; do
    actual="$(printf '%s\n' "$actual" | grep -Fxv "${table}|subject_id")"
  done
fi
# Shared My Page memory is an independently approved, manually managed owner lane.
# Admit exactly this new Subject FK without mutating frozen P0-PR-01 inventory.
# Its deletion action is separately checked against the PostgreSQL catalog.
shared_memory_edge='subject_shared_memory_items_v1|subject_id'
if ! printf '%s\n' "$actual" | grep -Fxq "$shared_memory_edge"; then
  echo 'Expected Subject-owned shared memory FK is absent.' >&2
  exit 1
fi
shared_memory_cascade="$(psql -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
select count(*)
from pg_catalog.pg_constraint con
join pg_catalog.pg_attribute child_col
  on child_col.attrelid = con.conrelid
  and child_col.attnum = any(con.conkey)
where con.contype = 'f'
  and con.conrelid = 'public.subject_shared_memory_items_v1'::pg_catalog.regclass
  and con.confrelid = 'public.subjects'::pg_catalog.regclass
  and child_col.attname = 'subject_id'
  and pg_catalog.array_length(con.conkey, 1) = 1
  and con.confdeltype = 'c';
SQL
)"
if [[ "$shared_memory_cascade" != '1' ]]; then
  echo 'Subject-owned shared memory must have exactly one ON DELETE CASCADE Subject FK.' >&2
  exit 1
fi
actual="$(printf '%s\n' "$actual" | grep -Fxv "$shared_memory_edge")"
actual="$(printf '%s\n' "$actual" | sed '/^chat_credit_lots_v1|subject_id$/d')"
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
