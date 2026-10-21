-- S4 private last-Grant deletion for one exact Official Reading x Reader scope.
-- Do not call from an HTTP request, auto-enable on cancellation, or deploy to
-- Production until Privacy Ledger/key-erase/restore acceptance.
-- Keep existing Commerce purchase receipts/chargebacks/refund evidence.
-- Watchtower-Track: db-authority-core

create or replace function public.internal_purge_official_reader_paid_answers_without_grant_v1(
  p_subject_id uuid,
  p_official_reading_id uuid,
  p_reader_character_id text
)
returns table (
  erased_row_count bigint
)
language plpgsql
volatile
security definer
set search_path=pg_catalog,public
as $paid_answer_last_grant_purge$
declare
  v_scope_state text;
  v_current_bundle_count bigint;
  v_count bigint;
begin
  if p_subject_id is null or p_official_reading_id is null
     or p_reader_character_id is null
     or pg_catalog.btrim(p_reader_character_id)='' then
    raise exception using errcode='23514',
      constraint='official_reader_s4_last_grant_purge_scope_required',
      message='Reader paid-answer purge requires an exact scope';
  end if;

  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25001',
      constraint='official_reader_s4_last_grant_purge_read_committed',
      message='Reader paid-answer purge requires READ COMMITTED';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  -- This helper obtains the same transaction advisory lock as verified
  -- Commerce purchase issuance, Reader binding, revocation and S6 read.
  -- NEVER decide deletion eligibility from pre-lock Grant history.
  select q.scope_state,q.active_bundle_count
  into v_scope_state,v_current_bundle_count
  from public.internal_qry_official_reader_locked_bundle_scope_v1(
    p_subject_id,p_official_reading_id,p_reader_character_id
  ) q;

  if not found or v_scope_state is distinct from 'no_active_grant'
     or v_current_bundle_count<>0 then
    raise exception using errcode='P0001',
      constraint='official_reader_s4_sibling_or_ambiguous_grant_alive',
      message='Reader paid-answer deletion cannot erase a currently entitled scope';
  end if;

  -- A last-second independent verified purchase must not be misclassified
  -- by aggregation. This check intentionally includes every content Bundle
  -- and only current, verified purchase Grants for the same Reader/Reading.
  if exists (
    select 1
    from public.standard_reading_reader_access_grants a
    join public.entitlement_grants g
      on g.id=a.entitlement_grant_id and g.subject_id=a.subject_id
    join public.commerce_receipts cr
      on cr.id=g.source_receipt_id and cr.subject_id=g.subject_id
    where a.subject_id=p_subject_id
      and a.official_reading_id=p_official_reading_id
      and a.reader_character_id=p_reader_character_id
      and g.grant_source_type='purchase'
      and g.status='active'
      and g.valid_from<=pg_catalog.clock_timestamp()
      and (g.valid_until is null or pg_catalog.clock_timestamp()<g.valid_until)
      and cr.verification_status='verified'
      and cr.environment='production'
  ) then
    raise exception using errcode='P0001',
      constraint='official_reader_s4_current_grant_still_exists',
      message='Reader paid-answer deletion cannot bypass a valid sibling purchase';
  end if;

  -- The ordinary Chat safe marker survives a refund; WITHOUT the protected
  -- row the marker provides no content and cannot re-enable a revoked Grant.
  -- Access to this function stays denied until an outside-backup Privacy
  -- Ledger has durably recorded deletion and the key owner can shred keys.
  delete from public.official_reader_paid_answer_bodies b
  where b.subject_id=p_subject_id
    and b.official_reading_id=p_official_reading_id
    and b.reader_character_id=p_reader_character_id;

  get diagnostics v_count=row_count;

  if exists (
    select 1 from public.official_reader_paid_answer_bodies b
    where b.subject_id=p_subject_id
      and b.official_reading_id=p_official_reading_id
      and b.reader_character_id=p_reader_character_id
  ) then
    raise exception using errcode='P0001',
      constraint='official_reader_s4_last_grant_purge_incomplete',
      message='Reader paid-answer purge left protected content in its exact scope';
  end if;

  return query select v_count;
end
$paid_answer_last_grant_purge$;

revoke all on function public.internal_purge_official_reader_paid_answers_without_grant_v1(uuid,uuid,text)
from public;

do $paid_answer_last_grant_purge_acl$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in (
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor',
      'myeongha_seyeon_chat_runtime_owner','myeongha_system_executor'
    )
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_purge_official_reader_paid_answers_without_grant_v1(uuid,uuid,text) from %I',
      v_role
    );
  end loop;
end
$paid_answer_last_grant_purge_acl$;

comment on function public.internal_purge_official_reader_paid_answers_without_grant_v1(uuid,uuid,text) is
'Private S4 physical deletion after exact Reader scope lock and zero current independent purchase Grants across all Bundles. Refund events, safe Chat markers and retained Commerce evidence are unchanged. No EXECUTE granted; outside-backup ledger and key shred still required.';
