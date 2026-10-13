-- OFFLINE PRIVATE: independently reviewed full PortOne cancellation ->
-- exact Source/Receipt/Grant -> existing 1850 all-or-nothing revoke.
-- A signed callback, verified event, or shadow row alone cannot authorize.
-- The approval row is intentionally unprovisioned in Production and no
-- runtime/API/Commerce role can INSERT approvals or EXECUTE this bridge.
-- This staged entrypoint is NOT a production integration.

create table public.official_reader_cancel_review_approvals_private_v1 (
  id uuid primary key,
  source_observation_id uuid not null
    references public.official_reader_portone_cancel_observation_shadow_v1(id),
  verified_provider_event_id uuid not null references public.commerce_provider_events(id),
  verified_receipt_id uuid not null references public.commerce_receipts(id),
  approved_grant_id uuid not null references public.entitlement_grants(id),
  approved_subject_id uuid not null references public.subjects(id),
  source_fingerprint text not null check (source_fingerprint ~ '^sha256:v1:[0-9a-f]{64}$'),
  provider_rechecked_at timestamptz not null,
  commerce_reviewer_id uuid not null,
  commerce_approved_at timestamptz not null,
  legal_reviewer_id uuid not null,
  legal_approved_at timestamptz not null,
  approval_status text not null check (approval_status='approved'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint official_reader_cancel_review_distinct_reviewers
    check (commerce_reviewer_id<>legal_reviewer_id),
  constraint official_reader_cancel_review_unique_observation
    unique (source_observation_id),
  constraint official_reader_cancel_review_unique_event
    unique (verified_provider_event_id),
  constraint official_reader_cancel_review_unique_grant
    unique (approved_grant_id)
);

create or replace function public.tr_official_reader_cancel_review_immutable_private_v1()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public
as $cancel_approval_immutable$
begin
  raise exception using errcode='55000',
    message='Approved Official Reader cancellation review is immutable';
end
$cancel_approval_immutable$;
create trigger official_reader_cancel_review_immutable_private_v1
  before update or delete on public.official_reader_cancel_review_approvals_private_v1
  for each row execute function public.tr_official_reader_cancel_review_immutable_private_v1();

alter table public.official_reader_cancel_review_approvals_private_v1 enable row level security;
revoke all on table public.official_reader_cancel_review_approvals_private_v1 from public;

create or replace function public.internal_apply_reviewed_official_reader_full_cancel_private_v1(
  p_approval_id uuid
)
returns table(
  result_grant_id uuid,
  result_entitlement_event_id uuid,
  result_projection_id uuid,
  result_grant_revision bigint,
  result_projection_revision bigint,
  result_projection_changed boolean,
  result_outbox_event_id uuid,
  result_replayed boolean
)
language plpgsql volatile security invoker
set search_path = pg_catalog, public
as $reviewed_cancel$
declare
  v_approval public.official_reader_cancel_review_approvals_private_v1%rowtype;
  v_source public.official_reader_portone_cancel_observation_shadow_v1%rowtype;
  v_check record;
  v_grant public.entitlement_grants%rowtype;
  v_event public.commerce_provider_events%rowtype;
  v_returned integer;
begin
  if p_approval_id is null
     or pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25001',
      message='Approved full cancellation requires a complete ID and READ COMMITTED';
  end if;

  select * into v_approval
    from public.official_reader_cancel_review_approvals_private_v1
    where id=p_approval_id;
  if not found or v_approval.approval_status<>'approved' then
    raise exception using errcode='P0001',
      message='No independent Commerce/Legal review approval for this cancellation';
  end if;
  perform public.assert_myeongha_subject_context_v1(v_approval.approved_subject_id);

  select * into strict v_source
  from public.official_reader_portone_cancel_observation_shadow_v1 s
  where s.id=v_approval.source_observation_id;

  -- Same lock as 1860's observation recorder. No newer/tied event can be
  -- recorded for this provider transaction until the grant COMMIT/ROLLBACK.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'myeongha:d3e2:portone_v2:'||v_source.payment_id||':'||v_source.transaction_id,0
  ));

  -- Read the source again after waiting for the producer lock; prevent stale
  -- approved evidence and deny a new or ambiguous provider observation.
  select * into strict v_source
  from public.official_reader_portone_cancel_observation_shadow_v1 s
  where s.id=v_approval.source_observation_id;
  if v_source.source_evidence_fingerprint is distinct from v_approval.source_fingerprint
     or v_source.source_disposition<>'full_candidate'
     or v_source.event_type<>'Transaction.Cancelled'
     or v_source.shadow_classification<>'observed'
     or v_source.paid_amount_minor<>v_source.cancelled_amount_minor
     or v_approval.provider_rechecked_at<v_source.provider_status_changed_at
     or v_approval.commerce_approved_at<v_approval.provider_rechecked_at
     or v_approval.legal_approved_at<v_approval.provider_rechecked_at then
    raise exception using errcode='P0001',
      message='Full cancellation requires fresh independent provider and policy review';
  end if;

  -- This is the narrow 1 Grant bridge. Wider multi-Grant receipt scope
  -- requires separate approved complete-set expansion before applying 1850.
  select * into strict v_check
    from public.internal_qry_official_reader_cancel_purchase_match_v1(
      v_approval.source_observation_id,
      v_approval.verified_provider_event_id,
      v_approval.approved_grant_id
    );
  if v_check.match_state<>'review_candidate'
     or v_check.matched_subject_id is distinct from v_approval.approved_subject_id
     or v_check.matched_receipt_id is distinct from v_approval.verified_receipt_id
     or v_check.matched_grant_id is distinct from v_approval.approved_grant_id then
    raise exception using errcode='P0001',
      message='Independent provider cancellation does not match this exact paid Reader purchase';
  end if;

  select * into strict v_event
  from public.commerce_provider_events
  where id=v_approval.verified_provider_event_id;
  select * into strict v_grant
  from public.entitlement_grants
  where id=v_approval.approved_grant_id;
  if v_event.status<>'verified' or v_grant.status<>'active'
     or v_grant.subject_id<>v_approval.approved_subject_id then
    raise exception using errcode='P0001',
      message='Approved source or Grant state changed';
  end if;

  -- 1850 reacquires source-derived complete Product L0 then Reader L1,
  -- verifies revisions/order in the same transaction, and changes every
  -- entitlement ledger/projection/outbox together or none.
  return query
    select q.result_grant_id,q.result_entitlement_event_id,q.result_projection_id,
           q.result_grant_revision,q.result_projection_revision,
           q.result_projection_changed,q.result_outbox_event_id,q.result_replayed
    from public.internal_apply_official_reader_verified_cancel_batch_v1(
      v_approval.approved_subject_id,
      array[v_approval.verified_provider_event_id],
      array[v_approval.approved_grant_id],
      array[v_grant.revision],
      array[v_grant.last_provider_ordering_key],
      array[pg_catalog.clock_timestamp()],
      array[v_grant.valid_from],
      array[v_grant.valid_until],
      array['verified_full_provider_cancel_reviewed_v1']::text[]
    ) q;
  get diagnostics v_returned = row_count;
  if v_returned<>1 then
    raise exception using errcode='40001',
      message='Full cancellation did not produce one atomic Grant effect';
  end if;
end
$reviewed_cancel$;

revoke all on function public.internal_apply_reviewed_official_reader_full_cancel_private_v1(uuid)
  from public;
revoke all on function public.tr_official_reader_cancel_review_immutable_private_v1()
  from public;

-- Explicitly keep existing direct event/Grant writers outside ALL current
-- application actors. Only the DB owner can exercise the offline fixture;
-- no roles for payment webhook, public client or Commerce runtime are created.
do $reviewed_cancel_acl$
declare r text;
begin
  for r in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner')
  loop
    execute pg_catalog.format(
      'revoke all on table public.official_reader_cancel_review_approvals_private_v1 from %I',r
    );
    execute pg_catalog.format(
      'revoke all on function public.internal_apply_reviewed_official_reader_full_cancel_private_v1(uuid) from %I',r
    );
    execute pg_catalog.format(
      'revoke all on function public.internal_apply_entitlement_effect_v1(text,uuid,uuid,text,bigint,text,text,timestamptz,text,timestamptz,timestamptz,text) from %I',r
    );
  end loop;
end
$reviewed_cancel_acl$;
comment on table public.official_reader_cancel_review_approvals_private_v1
  is 'Staged offline immutable dual Commerce/Legal review evidence, NOT provisioned in production. No runtime insert.';
comment on function public.internal_apply_reviewed_official_reader_full_cancel_private_v1(uuid)
  is 'Offline only: independent review + exact payment/Receipt/Grant source -> 1850 atomic full cancellation. No provider ingress or actor grant.';
