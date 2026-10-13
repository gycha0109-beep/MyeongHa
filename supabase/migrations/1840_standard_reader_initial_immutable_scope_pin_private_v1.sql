-- CAP-B2/S5 immutable first-Reading purchase scope: purchase-time authority.
-- Watchtower-Track: applizing
-- Only private verified Receipt issuer writes pin. Provider refund must use
-- saved scope identity even if current birth revision, offer or Product retired.
-- This is NOT a new user-facing Reading/Grant/public role.

create table if not exists public.standard_reader_initial_purchase_scope_pins_v1 (
  purchase_intent_id uuid primary key
    references public.purchase_intents(id),
  -- Historical purchase ownership is validated against Receipt/Intent by
  -- the private issuer/provider Writer. No direct Subject FK: the account
  -- deletion FK graph is owned by Privacy and must remain unchanged.
  subject_id uuid not null,
  source_receipt_id uuid not null unique
    references public.commerce_receipts(id),
  product_id uuid not null
    references public.products(id),
  -- Historical revision UUID is a provenance token, not an active FK to
  -- birth_profile_revisions (which account deletion must be able to DELETE).
  source_birth_revision_id uuid not null,
  initial_scope_identity text not null,
  pinned_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint std_reader_s5_scope_key_not_empty
    check (pg_catalog.length(pg_catalog.btrim(initial_scope_identity)) > 0)
);

-- Insert-only authority. No UPDATE/DELETE can silently rewrite historical
-- purchase identity after refund, Birth profile change, or policy retirement.
create or replace function public.tr_standard_reader_initial_scope_pin_immutable_v1()
returns trigger
language plpgsql security invoker
set search_path=pg_catalog,public
as $s5_pin_immutable$
begin
  raise exception using errcode='23514',
    constraint='std_reader_s5_pin_append_only',
    message='Initial Reader purchase scope pins are immutable';
end
$s5_pin_immutable$;

create trigger tr_standard_reader_initial_scope_pin_no_update_v1
before update or delete on public.standard_reader_initial_purchase_scope_pins_v1
for each row execute function public.tr_standard_reader_initial_scope_pin_immutable_v1();

revoke all on table public.standard_reader_initial_purchase_scope_pins_v1 from public;
revoke all on function public.tr_standard_reader_initial_scope_pin_immutable_v1() from public;

-- Extend the existing private S4 issuer (new forward-only function version).
-- Existing 1830 migration remains untouched.
create or replace function public.internal_apply_initial_official_reader_receipt_locked_v1(
  p_receipt_id uuid,
  p_capability_item_keys text[],
  p_effective_ats timestamptz[],
  p_target_valid_froms timestamptz[],
  p_target_valid_untils timestamptz[],
  p_reason_codes text[]
)
returns table (
  result_item_key text,
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
as $s4_initial_issuer$
declare
  v_subject uuid;
  v_intent uuid;
  v_initial record;
  v_after record;
begin
  if p_receipt_id is null then
    raise exception using errcode='23514',
      constraint='standard_s4_initial_receipt_required',
      message='One verified initial Standard Reader receipt is required';
  end if;
  select cr.subject_id,cr.purchase_intent_id
    into v_subject,v_intent
  from public.commerce_receipts cr
  where cr.id=p_receipt_id
    and cr.verification_status='verified'
    and cr.environment='production';
  if v_subject is null or v_intent is null then
    raise exception using errcode='P0001',
      constraint='standard_s4_initial_receipt_lineage_unavailable',
      message='Verified initial Reader purchase Receipt is unavailable';
  end if;
  select * into strict v_initial
  from public.internal_acquire_official_reader_initial_purchase_lock_v1(
    v_subject,v_intent
  );
  perform public.internal_acquire_standard_reader_product_policy_lock_v1(
    v_initial.product_id
  );
  -- Never use a pre-wait snapshot as authorization.
  select * into strict v_after
  from public.internal_qry_official_reader_initial_scope_candidate_v1(
    v_subject,v_intent
  );
  if v_after.scope_identity is distinct from v_initial.scope_identity
     or v_after.product_id is distinct from v_initial.product_id then
    raise exception using errcode='40001',
      constraint='standard_s4_initial_receipt_scope_drift',
      message='Verified initial Reader receipt scope changed before issuance';
  end if;
  -- The scope is pinned BEFORE original Commerce issuance, under the same
  -- initial advisory lock. Failed issuance rolls back the pin atomically.
  insert into public.standard_reader_initial_purchase_scope_pins_v1(
    purchase_intent_id,subject_id,source_receipt_id,product_id,
    source_birth_revision_id,initial_scope_identity
  ) values (
    v_intent,v_subject,p_receipt_id,v_initial.product_id,
    v_initial.source_birth_revision_id,v_initial.scope_identity
  )
  on conflict (purchase_intent_id) do nothing;
  if not exists (
    select 1 from public.standard_reader_initial_purchase_scope_pins_v1 pin
    where pin.purchase_intent_id=v_intent and pin.subject_id=v_subject
      and pin.source_receipt_id=p_receipt_id
      and pin.product_id=v_initial.product_id
      and pin.source_birth_revision_id=v_initial.source_birth_revision_id
      and pin.initial_scope_identity=v_initial.scope_identity
  ) then
    raise exception using errcode='23505',
      constraint='standard_s5_initial_scope_pin_conflict',
      message='Initial purchase scope pin conflicts with previously issued immutable receipt';
  end if;
  return query
  select * from public.internal_apply_verified_receipt_capability_effects_v1(
    p_receipt_id,p_capability_item_keys,p_effective_ats,
    p_target_valid_froms,p_target_valid_untils,p_reason_codes
  );
  select * into strict v_after
  from public.internal_qry_official_reader_initial_scope_candidate_v1(
    v_subject,v_intent
  );
  if v_after.scope_identity is distinct from v_initial.scope_identity
     or v_after.product_id is distinct from v_initial.product_id then
    raise exception using errcode='40001',
      constraint='standard_s4_initial_receipt_scope_drift',
      message='Verified initial Reader receipt scope changed after issuance';
  end if;
end
$s4_initial_issuer$;

revoke all on function public.internal_apply_initial_official_reader_receipt_locked_v1(
 uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[]
) from public;

do $s5_pin_acl$
declare r text;
begin
 for r in select rolname from pg_catalog.pg_roles where rolname in
 ('anon','authenticated','service_role','myeongha_api_executor',
  'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner')
 loop
  execute pg_catalog.format(
   'revoke all on table public.standard_reader_initial_purchase_scope_pins_v1 from %I',r
  );
  execute pg_catalog.format(
   'revoke all on function public.internal_apply_initial_official_reader_receipt_locked_v1(uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[]) from %I',r
  );
 end loop;
end
$s5_pin_acl$;

comment on table public.standard_reader_initial_purchase_scope_pins_v1
 is 'S5 private immutable verified initial purchase -> DB-derived first Reading lock identity. No raw birth input, public read, provider identity overrides, or entitlement grants.';
