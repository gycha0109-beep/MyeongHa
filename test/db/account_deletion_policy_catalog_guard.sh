#!/usr/bin/env bash
set -euo pipefail

policy_path="docs/operations/ACCOUNT_DELETION_FINALIZATION_POLICY_V1.json"

expected="$(
  node --input-type=module - "$policy_path" <<'NODE'
import { readFile } from 'node:fs/promises';

const policy = JSON.parse(await readFile(process.argv[2], 'utf8'));
if (policy.decisionStatus !== 'DECIDED') throw new Error('P0-PR-01 must remain DECIDED');
const baseRetained = policy.commerceRetentionClasses.flatMap((entry) => {
  if (entry.disposition !== 'RETAIN' || entry.retentionPeriod !== 'P5Y') {
    throw new Error('baseline Commerce evidence must remain RETAIN/P5Y');
  }
  return entry.tables;
});
const extensions = policy.postApprovalCommerceExtensions ?? [];
if (extensions.length !== 1 ||
    extensions[0].table !== 'commerce_saju_verified_refund_effects_v1' ||
    extensions[0].classKey !== 'commerce_verified_provider_evidence' ||
    extensions[0].disposition !== 'RETAIN' ||
    extensions[0].retentionPeriod !== 'P5Y') {
  throw new Error('supplemental Saju verified-refund evidence must inherit P5Y');
}
const retained = [...baseRetained, ...extensions.map((entry) => entry.table)];
const directRetained = retained.filter((table) => table !== 'purchase_intent_reader_selections');
const privateMappingsDeleted = [
  'commerce_saju_purchase_origins_v1',
  'commerce_saju_records_v1',
];
const transactionLocalOnly = ['commerce_saju_purchase_admission_context_v1'];
const expected = [
  ...directRetained,
  ...privateMappingsDeleted,
  ...transactionLocalOnly,
].sort();
if (new Set(expected).size !== expected.length) throw new Error('duplicate Commerce classification');
process.stdout.write(expected.join('\n'));
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
  echo "Subject-linked Commerce deletion/retention inventory drifted." >&2
  echo "--- policy classification" >&2
  printf '%s\n' "$expected" >&2
  echo "--- live migrated schema" >&2
  printf '%s\n' "$actual" >&2
  exit 1
fi

count="$(printf '%s\n' "$actual" | sed '/^$/d' | wc -l | tr -d ' ')"
[[ "$count" == "12" ]] || {
  echo "Expected 12 subject-linked Commerce tables (9 retained, 2 deleted mappings, 1 transaction-local), found $count." >&2
  exit 1
}

upgrade_link_table="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select to_regclass('public.commerce_saju_upgrade_receipt_links_v1') is not null")"
[[ "$upgrade_link_table" == "t" ]] || {
  echo "Expected the private Saju upgrade-receipt mapping table to exist." >&2
  exit 1
}

admission_context_count="$(psql -X -qAt -v ON_ERROR_STOP=1 -c 'select count(*) from public.commerce_saju_purchase_admission_context_v1')"
[[ "$admission_context_count" == "0" ]] || {
  echo "Transaction-local Saju admission context leaked $admission_context_count row(s)." >&2
  exit 1
}

echo "Account deletion Commerce catalog guard PASS: 9 direct P5Y evidence tables, 2 private Saju mappings deleted, 1 transaction-local admission context cleared, and verified refund effects retained."
