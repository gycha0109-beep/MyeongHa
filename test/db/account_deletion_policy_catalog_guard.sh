#!/usr/bin/env bash
set -euo pipefail

policy_path="docs/operations/ACCOUNT_DELETION_FINALIZATION_POLICY_CANDIDATE_V1.json"

expected="$(
  node --input-type=module - "$policy_path" <<'NODE'
import { readFile } from 'node:fs/promises';

const policy = JSON.parse(await readFile(process.argv[2], 'utf8'));
const tables = [...new Set(
  policy.commerceRetentionClasses.flatMap((entry) => entry.tables),
)].sort();
process.stdout.write(tables.join('\n'));
NODE
)"

actual="$(
  psql -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
select distinct c.table_name
from information_schema.columns c
where c.table_schema = 'public'
  and c.column_name in ('subject_id', 'resolved_subject_id')
  and (
    c.table_name like 'commerce\_%' escape '\'
    or c.table_name = 'purchase_intents'
    or c.table_name like 'entitlement%'
  )
order by c.table_name;
SQL
)"

if [[ "$actual" != "$expected" ]]; then
  echo "Subject-linked Commerce retention inventory drifted." >&2
  echo "--- policy inventory" >&2
  printf '%s\n' "$expected" >&2
  echo "--- live migrated schema" >&2
  printf '%s\n' "$actual" >&2
  exit 1
fi

count="$(printf '%s\n' "$actual" | sed '/^$/d' | wc -l | tr -d ' ')"
[[ "$count" == "8" ]] || {
  echo "Expected exactly 8 current subject-linked Commerce tables, found $count." >&2
  exit 1
}

echo "Account deletion Commerce retention inventory DB catalog guard PASS: ${count} subject-linked Commerce tables are explicitly classified."
