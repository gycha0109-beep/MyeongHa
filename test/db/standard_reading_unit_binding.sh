#!/usr/bin/env bash
set -euo pipefail

psql -X -v ON_ERROR_STOP=1 -f test/db/standard_reading_unit_binding.sql

REQUEST_HASH_4='sha256:v1:5555555555555555555555555555555555555555555555555555555555555555'
SNAPSHOT_4='{"schemaVersion":"standard-reading-unit-request-v1","purchaseIntentId":"11392300-0000-0000-0000-000000000004"}'

tmp1=$(mktemp)
tmp2=$(mktemp)
cleanup() {
  rm -f "$tmp1" "$tmp2"
}
trap cleanup EXIT

(
  psql -X -v ON_ERROR_STOP=1 -At -F '|' >"$tmp1" <<SQL
begin;
select pg_catalog.set_config(
  'myeongha.subject_id',
  '11390000-0000-0000-0000-000000000001',
  true
);
select result.reading_id, result.replayed
from public.cmd_bind_standard_reading_unit_v1(
  '11390000-0000-0000-0000-000000000001',
  '11392300-0000-0000-0000-000000000004',
  '11603000-0000-0000-0000-000000000004',
  '11603100-0000-0000-0000-000000000004',
  '$REQUEST_HASH_4',
  'standard-reading-unit-request-v1',
  '$SNAPSHOT_4'::jsonb
) result;
select pg_sleep(0.4);
commit;
SQL
) &
pid1=$!

sleep 0.08

(
  psql -X -v ON_ERROR_STOP=1 -At -F '|' >"$tmp2" <<SQL
begin;
select pg_catalog.set_config(
  'myeongha.subject_id',
  '11390000-0000-0000-0000-000000000001',
  true
);
select result.reading_id, result.replayed
from public.cmd_bind_standard_reading_unit_v1(
  '11390000-0000-0000-0000-000000000001',
  '11392300-0000-0000-0000-000000000004',
  '11603000-0000-0000-0000-000000000005',
  '11603100-0000-0000-0000-000000000005',
  '$REQUEST_HASH_4',
  'standard-reading-unit-request-v1',
  '$SNAPSHOT_4'::jsonb
) result;
commit;
SQL
) &
pid2=$!

wait "$pid1"
wait "$pid2"

out1=$(grep -E '^11603100-' "$tmp1" | tail -n 1)
out2=$(grep -E '^11603100-' "$tmp2" | tail -n 1)

if [[ -z "$out1" || -z "$out2" ]]; then
  cat "$tmp1" >&2
  cat "$tmp2" >&2
  echo 'FAIL concurrent bind workers did not both return a Reading result' >&2
  exit 1
fi

reading1=$(printf '%s' "$out1" | cut -d '|' -f 1)
reading2=$(printf '%s' "$out2" | cut -d '|' -f 1)

if [[ "$reading1" != "$reading2" ]]; then
  echo "FAIL concurrent workers created different Readings: $out1 / $out2" >&2
  exit 1
fi

binding_count=$(psql -X -v ON_ERROR_STOP=1 -Atc "
  select count(*)
  from public.standard_reading_unit_bindings
  where purchase_intent_id='11392300-0000-0000-0000-000000000004';
")
reading_count=$(psql -X -v ON_ERROR_STOP=1 -Atc "
  select count(*)
  from public.readings
  where request_idempotency_key=
    'standard-reading-unit:11392300-0000-0000-0000-000000000004';
")

[[ "$binding_count" == '1' ]] || {
  echo "FAIL concurrent bind created $binding_count bindings" >&2
  exit 1
}
[[ "$reading_count" == '1' ]] || {
  echo "FAIL concurrent bind created $reading_count logical Readings" >&2
  exit 1
}

echo "PASS concurrent same-unit retries serialize to one Reading: $out1 / $out2"
echo 'Standard Reading unit binding authority tests passed'
