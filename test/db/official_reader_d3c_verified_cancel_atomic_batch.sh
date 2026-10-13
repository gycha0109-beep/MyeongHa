#!/usr/bin/env bash
set -euo pipefail
# D3c PRIVATE, disposable PostgreSQL: D3b complete locks then original 1080.
# The failed SECOND revocation must roll back the FIRST and all ledger writes.
p() { command psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL D3c: $*" >&2; exit 1; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
bash test/db/official_reader_d3b_verified_impact_lockset_three_session.sh >"$tmp/seed.out" 2>"$tmp/seed.err" || {
 tail -n 100 "$tmp/seed.err" >&2; tail -n 45 "$tmp/seed.out" >&2
 fail "D3b verified impact and 3-session baseline missing"
}
subject='11390000-0000-0000-0000-000000000001'
events=('d3b20000-0000-0000-0000-000000000001' 'd3b20000-0000-0000-0000-000000000002')
grants=()
for intent in 12192300-0000-0000-0000-000000000002 12192300-0000-0000-0000-000000000003; do
 grant="$(p -c "select entitlement_grant_id
 from public.standard_reading_reader_access_grants
 where purchase_intent_id='$intent'::uuid and subject_id='$subject'::uuid")"
 [[ "$grant" =~ ^[0-9a-f-]{36}$ ]] || fail "fixture Grant absent"
 grants+=("$grant")
done
# Original test's two terminal Grants are intentionally inactive. Synthetic
# isolated setup restores ACTIVE for a new NEW (never replayed) provider event.
p >"$tmp/activate.out" 2>&1 <<SQL
update public.entitlement_grants
set status='active',revision=revision+1,
last_effective_at=clock_timestamp(),updated_at=clock_timestamp()
where id in ('${grants[0]}'::uuid,'${grants[1]}'::uuid)
and grant_source_type='purchase' and status='revoked';
SQL
[[ "$(p -c "select count(*) from public.entitlement_grants where
 id in ('${grants[0]}'::uuid,'${grants[1]}'::uuid) and status='active'")" == 2 ]] ||
 fail "isolated Grants not ACTIVE"

if [[ "${grants[0]}" < "${grants[1]}" ]]; then higher=1; else higher=0; fi
# Inputs are deliberately REVERSED for one success run; DB sorts by Grant UUID.
batch_sql() {
  local fault="$1" add0=0 add1=0
  if [[ "$fault" == wrong_second ]]; then
    if (( higher == 0 )); then add0=1; else add1=1; fi
  fi
  cat <<SQL
select result_grant_id,result_entitlement_event_id,result_replayed
from public.internal_apply_official_reader_verified_cancel_batch_v1(
 '$subject'::uuid,
 array['${events[1]}'::uuid,'${events[0]}'::uuid],
 array['${grants[1]}'::uuid,'${grants[0]}'::uuid],
 array[(select revision+$add1 from public.entitlement_grants where id='${grants[1]}'::uuid),
       (select revision+$add0 from public.entitlement_grants where id='${grants[0]}'::uuid)]::bigint[],
 array[(select last_provider_ordering_key from public.entitlement_grants where id='${grants[1]}'::uuid),
       (select last_provider_ordering_key from public.entitlement_grants where id='${grants[0]}'::uuid)]::text[],
 array[clock_timestamp(),clock_timestamp()]::timestamptz[],
 array[(select valid_from from public.entitlement_grants where id='${grants[1]}'::uuid),
       (select valid_from from public.entitlement_grants where id='${grants[0]}'::uuid)]::timestamptz[],
 array[(select valid_until from public.entitlement_grants where id='${grants[1]}'::uuid),
       (select valid_until from public.entitlement_grants where id='${grants[0]}'::uuid)]::timestamptz[],
 array['d3c_verified_full_cancel_2','d3c_verified_full_cancel_1']::text[]
);
SQL
}
revision_before="$(p -c "select string_agg(id::text||':'||revision::text,',' order by id)
 from public.entitlement_grants where id in ('${grants[0]}'::uuid,'${grants[1]}'::uuid)")"
if p >"$tmp/rollback.out" 2>&1 <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
$(batch_sql wrong_second)
commit;
SQL
then fail "stale CAS in second sorted Grant improperly COMMITTED earlier effect"; fi
grep -q 'Full Provider cancellation Grant state and supplied CAS must match' "$tmp/rollback.out" ||
 { cat "$tmp/rollback.out" >&2; fail "wrong rejection reason"; }
[[ "$(p -c "select count(*) from public.entitlement_grants where
 id in ('${grants[0]}'::uuid,'${grants[1]}'::uuid) and status='active'")" == 2 ]] ||
 fail "partial revocation leaked after second CAS failure"
[[ "$(p -c "select string_agg(id::text||':'||revision::text,',' order by id)
 from public.entitlement_grants where id in ('${grants[0]}'::uuid,'${grants[1]}'::uuid)")" == "$revision_before" ]] ||
 fail "first Grant revision did not rollback"
[[ "$(p -c "select count(*) from public.entitlement_events
 where source_provider_event_id in ('${events[0]}'::uuid,'${events[1]}'::uuid)")" == 0 ]] ||
 fail "failed batch left immutable Entitlement Events"
echo "PASS D3c: second sorted Grant CAS failure rolled back first Grant revision and event"

p >"$tmp/commit.out" 2>&1 <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
$(batch_sql correct)
commit;
SQL
count="$(grep -cE '^[0-9a-f-]{36}\|[0-9a-f-]{36}\|f$' "$tmp/commit.out" || true)"
[[ "$count" == 2 ]] || { cat "$tmp/commit.out" >&2; fail "two verified atomic full-revocation effects not returned"; }
[[ "$(p -c "select count(*) from public.entitlement_grants where
 id in ('${grants[0]}'::uuid,'${grants[1]}'::uuid) and status='revoked'")" == 2 ]] ||
 fail "one Grant escaped full atomic revoke"
[[ "$(p -c "select count(*) from public.entitlement_events
 where source_provider_event_id in ('${events[0]}'::uuid,'${events[1]}'::uuid)
 and event_type='revoked' and target_status='revoked'")" == 2 ]] ||
 fail "expected exactly two committed immutable revoke events"
echo "PASS D3c: two independent verified full cancellations atomically COMMIT with two immutable events"

# Replay is explicitly rejected by this narrow active-only batch, not silently
# marked successful. The original 1080 remains the per-event replay authority.
if p >"$tmp/replay.out" 2>&1 <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
$(batch_sql correct)
commit;
SQL
then fail "terminal-Grant batch was replayed as new full revoke"; fi
[[ "$(p -c "select count(*) from public.entitlement_events
 where source_provider_event_id in ('${events[0]}'::uuid,'${events[1]}'::uuid)")" == 2 ]] ||
 fail "duplicate full batch changed the immutable event count"
sig='public.internal_apply_official_reader_verified_cancel_batch_v1(uuid,uuid[],uuid[],bigint[],text[],timestamptz[],timestamptz[],timestamptz[],text[])'
[[ "$(p -c "select count(*) from pg_catalog.pg_proc where oid='$sig'::regprocedure
 and prosecdef=false and provolatile='v'")" == 1 ]] ||
 fail "D3c batch must be private volatile invoker"
[[ "$(p -c "select count(*) from pg_catalog.pg_roles r
 where r.rolname in ('anon','authenticated','service_role',
 'myeongha_api_executor','myeongha_commerce_internal_executor',
 'myeongha_seyeon_chat_runtime_owner')
 and pg_catalog.has_function_privilege(r.rolname,'$sig','EXECUTE')")" == 0 ]] ||
 fail "runtime/commerce role directly executes experimental batch"
echo "PASS D3c: replay denied, ledger unchanged, no runtime/Commerce EXECUTE"
echo "PASS: D3c narrow full verified cancel atomic batch is PRIVATE, not a payment ingress"
