-- S5 PRIVATE historical initial Reading Scope pin. No runtime EXECUTE.
-- Watchtower-Track: applizing
create table public.standard_reader_initial_purchase_scope_pins_v1 (
 receipt_id uuid primary key references public.commerce_receipts(id),
 purchase_intent_id uuid not null references public.purchase_intents(id),
 subject_id uuid not null references public.subjects(id),
 product_id uuid not null references public.products(id),
 source_birth_revision_id uuid not null references public.birth_profile_revisions(id),
 entitlement_grant_id uuid not null unique references public.entitlement_grants(id),
 approved_policy_revision text not null,
 scope_identity text not null,
 captured_at timestamptz not null default pg_catalog.clock_timestamp(),
 constraint standard_s5_revision_check check (
  approved_policy_revision=pg_catalog.btrim(approved_policy_revision)
  and pg_catalog.length(approved_policy_revision) between 1 and 256),
 constraint standard_s5_scope_check check (
  pg_catalog.length(scope_identity) between 10 and 4096)
);
alter table public.standard_reader_initial_purchase_scope_pins_v1 enable row level security;
revoke all on public.standard_reader_initial_purchase_scope_pins_v1
 from public,anon,authenticated,service_role;

create function public.tr_standard_reader_initial_scope_pin_immutable_v1()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,public
as $s5_immutable$
begin
 raise exception using errcode='23514',
  constraint='standard_s5_initial_scope_pin_immutable',
  message='Initial purchase scope pins are append-only';
end
$s5_immutable$;
create trigger tr_standard_reader_initial_scope_pin_immutable_v1
before update or delete on public.standard_reader_initial_purchase_scope_pins_v1
for each row execute function public.tr_standard_reader_initial_scope_pin_immutable_v1();
revoke all on function public.tr_standard_reader_initial_scope_pin_immutable_v1() from public;

-- New issuance entry: S4 exact receipt/Grant effects and immutable historical
-- pin succeed/fail as ONE transaction. S4 remains dormant and ungranted.
create function public.internal_issue_initial_reader_receipt_with_scope_pin_v1(
 p_receipt_id uuid, p_capability_item_keys text[],
 p_effective_ats timestamptz[],p_target_valid_froms timestamptz[],
 p_target_valid_untils timestamptz[],p_reason_codes text[]
)
returns table (
 result_item_key text,result_grant_id uuid,result_entitlement_event_id uuid,
 result_projection_id uuid,result_grant_revision bigint,
 result_projection_revision bigint,result_projection_changed boolean,
 result_outbox_event_id uuid,result_replayed boolean
)
language plpgsql volatile security invoker
set search_path=pg_catalog,public
as $s5_issue$
declare
 v_subject uuid;
 v_intent uuid;
 v_scope record;
 v_grant_count integer;
 v_grant uuid;
 v_rule_count integer;
 v_revision text;
begin
 if p_receipt_id is null then
  raise exception using errcode='23514',
   constraint='standard_s5_initial_receipt_required',
   message='Verified initial purchase Receipt is required';
 end if;
 select cr.subject_id,cr.purchase_intent_id into v_subject,v_intent
 from public.commerce_receipts cr
 where cr.id=p_receipt_id and cr.verification_status='verified'
   and cr.environment='production';
 if v_subject is null or v_intent is null then
  raise exception using errcode='P0001',
   constraint='standard_s5_verified_receipt_required',
   message='Verified production Reader Receipt lineage is required';
 end if;
 -- S4 takes the initial scope -> Product lock before Commerce row locks;
 -- locks remain held by this same transaction for the pin.
 return query select * from public.internal_apply_initial_official_reader_receipt_locked_v1(
  p_receipt_id,p_capability_item_keys,p_effective_ats,
  p_target_valid_froms,p_target_valid_untils,p_reason_codes
 );
 select * into strict v_scope
 from public.internal_qry_official_reader_initial_scope_candidate_v1(
  v_subject,v_intent
 );
 select count(*)::integer,(array_agg(eg.id))[1]
   into v_grant_count,v_grant
 from public.entitlement_grants eg
 join public.commerce_receipts cr on cr.id=eg.source_receipt_id
   and cr.subject_id=eg.subject_id
 where eg.source_receipt_id=p_receipt_id and eg.subject_id=v_subject
   and eg.grant_source_type='purchase' and cr.purchase_intent_id=v_intent
   and cr.verification_status='verified' and cr.environment='production';
 if v_grant_count<>1 or v_grant is null then
  raise exception using errcode='P0001',
   constraint='standard_s5_exact_initial_grant_required',
   message='One exact purchase-backed Grant required to pin initial scope';
 end if;
 select count(*)::integer,(array_agg(rule.approved_policy_revision))[1]
   into v_rule_count,v_revision
 from public.standard_reading_product_specs spec
 cross join lateral public.qry_standard_reader_approved_rule_v1(
  v_scope.product_id,spec.spec_version,spec.saju_domain,
  pg_catalog.clock_timestamp()
 ) rule
 where spec.product_id=v_scope.product_id and spec.retired_at is null
   and rule.policy_kind='standard_all_readers' and rule.target_reader_id is null;
 if v_rule_count<>1 or v_revision is null then
  raise exception using errcode='P0001',
   constraint='standard_s5_approved_initial_policy_required',
   message='One current approved Standard Product revision must be pinned';
 end if;
 insert into public.standard_reader_initial_purchase_scope_pins_v1(
   receipt_id,purchase_intent_id,subject_id,product_id,
   source_birth_revision_id,entitlement_grant_id,
   approved_policy_revision,scope_identity
 ) values (
   p_receipt_id,v_intent,v_subject,v_scope.product_id,
   v_scope.source_birth_revision_id,v_grant,v_revision,v_scope.scope_identity
 ) on conflict (receipt_id) do nothing;
 if not exists (
  select 1 from public.standard_reader_initial_purchase_scope_pins_v1 pin
  where pin.receipt_id=p_receipt_id and pin.purchase_intent_id=v_intent
    and pin.subject_id=v_subject and pin.product_id=v_scope.product_id
    and pin.source_birth_revision_id=v_scope.source_birth_revision_id
    and pin.entitlement_grant_id=v_grant
    and pin.approved_policy_revision=v_revision
    and pin.scope_identity=v_scope.scope_identity
 ) then
  raise exception using errcode='23505',
   constraint='standard_s5_immutable_scope_pin_conflict',
   message='Initial Receipt already has another immutable scope pin';
 end if;
end
$s5_issue$;
revoke all on function public.internal_issue_initial_reader_receipt_with_scope_pin_v1(
 uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[]
) from public,anon,authenticated,service_role;

-- This preflight ONLY obtains historical initial-scope lock for a verified
-- Provider cancellation, even if Birth/Offer/Spec has since changed.
-- It does not change Grant status or approve a live refund effect.
create function public.internal_acquire_initial_receipt_scope_pin_for_revoke_v1(
 p_provider_event_id uuid,p_grant_id uuid
) returns table(
 subject_id uuid,receipt_id uuid,product_id uuid,
 immutable_scope_identity text,source_birth_revision_id uuid,
 approved_policy_revision text
)
language plpgsql volatile security invoker
set search_path=pg_catalog,public
as $s5_refund$
declare
 v_before public.standard_reader_initial_purchase_scope_pins_v1%rowtype;
 v_after public.standard_reader_initial_purchase_scope_pins_v1%rowtype;
begin
 if p_provider_event_id is null or p_grant_id is null then
  raise exception using errcode='23514',
   constraint='standard_s5_revoke_identity_required',
   message='Verified Provider event and Grant required';
 end if;
 if pg_catalog.current_setting('transaction_isolation')<>'read committed' then
  raise exception using errcode='25001',
   constraint='standard_s5_revoke_isolation_required',
   message='Pinned scope revoke preflight requires READ COMMITTED';
 end if;
 select pin.* into strict v_before
 from public.commerce_provider_events pe
 join public.commerce_receipts cr on cr.id=pe.resolved_receipt_id
   and cr.subject_id=pe.resolved_subject_id
   and cr.environment='production'
   and cr.verification_status in ('verified','revoked')
   and cr.provider=pe.provider
 join public.entitlement_grants eg on eg.id=p_grant_id
   and eg.source_receipt_id=cr.id and eg.subject_id=cr.subject_id
   and eg.grant_source_type='purchase'
 join public.standard_reader_initial_purchase_scope_pins_v1 pin
   on pin.receipt_id=cr.id and pin.purchase_intent_id=cr.purchase_intent_id
   and pin.entitlement_grant_id=eg.id and pin.subject_id=eg.subject_id
 where pe.id=p_provider_event_id and pe.status in ('verified','processed')
   and pe.environment='production' and pe.resolution_source_type='receipt'
   and pe.event_type='payment.cancelled'
   and (pe.external_transaction_id is null or
        pe.external_transaction_id=cr.external_transaction_id);
 perform public.assert_myeongha_subject_context_v1(v_before.subject_id);
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended(v_before.scope_identity,1830::bigint));
 select pin.* into strict v_after
 from public.standard_reader_initial_purchase_scope_pins_v1 pin
 join public.entitlement_grants eg on eg.id=pin.entitlement_grant_id
   and eg.source_receipt_id=pin.receipt_id
   and eg.subject_id=pin.subject_id
 join public.commerce_provider_events pe on pe.id=p_provider_event_id
   and pe.resolved_receipt_id=pin.receipt_id
   and pe.resolved_subject_id=pin.subject_id
   and pe.event_type='payment.cancelled'
 where pin.receipt_id=v_before.receipt_id and pin.entitlement_grant_id=p_grant_id;
 if v_after.scope_identity is distinct from v_before.scope_identity or
    v_after.subject_id is distinct from v_before.subject_id or
    v_after.product_id is distinct from v_before.product_id then
  raise exception using errcode='40001',
   constraint='standard_s5_initial_scope_drift',
   message='Pinned purchase-time scope changed after transaction lock';
 end if;
 return query select v_after.subject_id,v_after.receipt_id,v_after.product_id,
  v_after.scope_identity,v_after.source_birth_revision_id,
  v_after.approved_policy_revision;
exception when no_data_found then
 raise exception using errcode='P0001',
   constraint='standard_s5_verified_pinned_revoke_required',
   message='Verified cancellation lacks an exact purchased initial Reader scope';
end
$s5_refund$;
revoke all on function public.internal_acquire_initial_receipt_scope_pin_for_revoke_v1(uuid,uuid)
 from public,anon,authenticated,service_role;
do $s5_roles$
declare r text;
begin
 for r in select rolname from pg_catalog.pg_roles where rolname in
 ('myeongha_api_executor','myeongha_commerce_internal_executor',
  'myeongha_seyeon_chat_runtime_owner')
 loop
  execute pg_catalog.format(
   'revoke all on function public.internal_issue_initial_reader_receipt_with_scope_pin_v1(uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[]) from %I',r);
  execute pg_catalog.format(
   'revoke all on function public.internal_acquire_initial_receipt_scope_pin_for_revoke_v1(uuid,uuid) from %I',r);
 end loop;
end
$s5_roles$;
