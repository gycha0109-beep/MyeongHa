#!/usr/bin/env bash
set -euo pipefail
# Disposable PostgreSQL only. Approved reviewer rows are synthesized only by
# the DB test owner; NO production reviewer-provisioning interface exists.
p() { command psql -X -v ON_ERROR_STOP=1 -At "$@"; }
die() { echo "FAIL reviewed full cancel bridge: $*" >&2; exit 1; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
MHA_PURCHASE_MATCH_SEED_ONLY=1 bash \
  test/db/official_reader_cancel_purchase_match_private.sh \
  >"$tmp/seed.out" 2>"$tmp/seed.err" || {
    tail -n 55 "$tmp/seed.err" >&2
    die "original exact paid source/one active Grant fixture failed"
  }
approval='18800000-0000-0000-0000-000000000001'
subject='11390000-0000-0000-0000-000000000001'
receipt='12192000-0000-0000-0000-000000000002'
event='18700001-0000-0000-0000-000000000001'
grant="$(p -c "select g.id from public.entitlement_grants g
 where g.source_receipt_id='$receipt'::uuid and g.subject_id='$subject'::uuid
 and grant_source_type='purchase'")"
obs="$(p -c "select id from public.official_reader_portone_cancel_observation_shadow_v1
 where webhook_id='wh-reader-b2'")"
[[ "$grant" =~ ^[0-9a-f-]{36}$ && "$obs" =~ ^[0-9a-f-]{36}$ ]] ||
 die "verified source IDs missing"
call() {
cat <<SQL
select result_grant_id::text||':'||
 result_entitlement_event_id::text||':'||result_replayed::text
from public.internal_apply_reviewed_official_reader_full_cancel_private_v1(
 '$approval'::uuid);
SQL
}
if p >"$tmp/no-review.out" 2>&1 <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
$(call)
commit;
SQL
then die "full refund cancellation authorized without independent approval"; fi
grep -q 'No independent Commerce/Legal review' "$tmp/no-review.out" ||
 die "unapproved operation failed for wrong reason"
[[ "$(p -c "select status from public.entitlement_grants where id='$grant'")" == 'active' ]] ||
 die "no-review path touched paid access"

p <<SQL >/dev/null
insert into public.official_reader_cancel_review_approvals_private_v1(
  id,source_observation_id,verified_provider_event_id,verified_receipt_id,
  approved_grant_id,source_fingerprint,
  provider_rechecked_at,commerce_reviewer_id,commerce_approved_at,
  legal_reviewer_id,legal_approved_at,approval_status
)
select '$approval'::uuid,'$obs'::uuid,'$event'::uuid,'$receipt'::uuid,
 '$grant'::uuid,s.source_evidence_fingerprint,
 s.provider_status_changed_at,
 '18800000-0000-0000-0000-000000000002'::uuid,pg_catalog.clock_timestamp(),
 '18800000-0000-0000-0000-000000000003'::uuid,pg_catalog.clock_timestamp(),
 'approved'
from public.official_reader_portone_cancel_observation_shadow_v1 s
where s.id='$obs'::uuid;
SQL
[[ "$(p -c "select count(*) from public.official_reader_cancel_review_approvals_private_v1")" == 1 ]] ||
 die "offline synthetic dual approval absent"

if p >"$tmp/wrong-subject.out" 2>&1 <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id',
 'ffffffff-ffff-ffff-ffff-ffffffffffff',true);
$(call)
commit;
SQL
then die "wrong owner allowed access effect"; fi
[[ "$(p -c "select status from public.entitlement_grants where id='$grant'")" == 'active' ]] ||
 die "wrong subject mutated Grant"
echo "PASS reviewed bridge: no approval / wrong subject reject, unchanged Grant"

# Transactional dry-run rollback. Even after the entire private batch returns
# one new event, ROLLBACK must leave no grant/Event/projection effect.
before="$(p -c "select revision from public.entitlement_grants where id='$grant'")"
p >"$tmp/rollback.out" 2>&1 <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
$(call)
rollback;
SQL
grep -Eq '^[0-9a-f-]{36}:[0-9a-f-]{36}:false$' "$tmp/rollback.out" ||
 { cat "$tmp/rollback.out" >&2; die "approved source did not trigger 1850 private batch"; }
[[ "$(p -c "select status||':'||revision::text from public.entitlement_grants
 where id='$grant'")" == "active:$before" ]] ||
 die "full cancellation dry-run leaked Grant state"
[[ "$(p -c "select count(*) from public.entitlement_events
 where source_provider_event_id='$event'::uuid")" == 0 ]] ||
 die "ROLLBACK leaked immutable Entitlement Event"
echo "PASS reviewed bridge: exact source + separate review enters 1850, rollback leaves no changes"

# Real COMMIT only in disposable test database (not production).
p >"$tmp/commit.out" 2>&1 <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
$(call)
commit;
SQL
[[ "$(grep -cE '^[0-9a-f-]{36}:[0-9a-f-]{36}:false$' "$tmp/commit.out")" == 1 ]] ||
 { cat "$tmp/commit.out" >&2; die "expected exactly one atomic revoke"; }
[[ "$(p -c "select status from public.entitlement_grants where id='$grant'")" == revoked ]] ||
 die "approved commit failed to revoke exact Grant"
[[ "$(p -c "select count(*) from public.entitlement_events
 where source_provider_event_id='$event'::uuid
 and event_type='revoked' and target_status='revoked'")" == 1 ]] ||
 die "approved commit did not append exactly one immutable revocation event"
if p >"$tmp/replay.out" 2>&1 <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
$(call)
commit;
SQL
then die "replayed approved source permitted duplicate revocation"; fi
[[ "$(p -c "select count(*) from public.entitlement_events
 where source_provider_event_id='$event'::uuid")" == 1 ]] ||
 die "duplicate invocation changed cancellation event count"
echo "PASS reviewed bridge: exact one-Grant atomic COMMIT + replay denied"

if p >"$tmp/rewrite.out" 2>&1 <<SQL
update public.official_reader_cancel_review_approvals_private_v1
set approved_grant_id='ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid where id='$approval';
SQL
then die "an immutable independent approval was changed"; fi
sig='public.internal_apply_reviewed_official_reader_full_cancel_private_v1(uuid)'
[[ "$(p -c "select count(*) from pg_catalog.pg_proc
 where oid='$sig'::regprocedure and not prosecdef and provolatile='v'")" == 1 ]] ||
 die "reviewed revoke must be invoker/volatile"
[[ "$(p -c "select count(*) from pg_catalog.pg_roles r
 where r.rolname in ('anon','authenticated','service_role',
 'myeongha_api_executor','myeongha_commerce_internal_executor',
 'myeongha_seyeon_chat_runtime_owner')
 and pg_catalog.has_function_privilege(r.rolname,'$sig','EXECUTE')")" == 0 ]] ||
 die "runtime role can execute experimental paid revoke"
[[ "$(p -c "select count(*) from pg_catalog.pg_roles r
 where r.rolname in ('anon','authenticated','service_role',
 'myeongha_api_executor','myeongha_commerce_internal_executor',
 'myeongha_seyeon_chat_runtime_owner')
 and pg_catalog.has_table_privilege(r.rolname,
 'public.official_reader_cancel_review_approvals_private_v1','INSERT')")" == 0 ]] ||
 die "runtime role can self-approve paid cancellation"
[[ "$(p -c "select relrowsecurity::integer from pg_catalog.pg_class
 where oid='public.official_reader_cancel_review_approvals_private_v1'::regclass")" == 1 ]] ||
 die "review approval table not RLS-protected"
echo "PASS reviewed bridge: approval immutable, no app/Commerce access or approval injection"
