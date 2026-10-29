-- Watchtower-Track: commerce-payment
-- Owner-directed removal of the artificial per-24h sandbox prepare cap.
-- Keep canonical Subject, Owner ACL, sandbox-only SKU, idempotency,
-- locked Subject transaction, immutable amount and zero Production mint.
begin;

create or replace function public.cmd_prepare_owner_portone_sandbox_credit_v1(
  p_subject_id uuid,
  p_purchase_intent_id uuid,
  p_payment_attempt_id uuid,
  p_idempotency_key text,
  p_provider_request_id text
)
returns table(
  purchase_intent_id uuid,
  payment_attempt_id uuid,
  provider_request_id text,
  attempt_status text,
  replayed boolean
)
language plpgsql
security definer
set search_path=pg_catalog,public
set row_security=off
as $function$
#variable_conflict use_column
declare
  v_product_id uuid;
  v_offer_id uuid;
  v_capability_id uuid;
  v_capability_version text;
  v_capability_hash text;
  v_terms_version text;
  v_offer_snapshot jsonb;
  v_capability_snapshot jsonb;
  v_existing_intent uuid;
  v_attempt record;
  v_subject_kind text;
  v_subject_status text;
  v_now timestamptz:=clock_timestamp();
begin
  if p_subject_id is null or p_purchase_intent_id is null
     or p_payment_attempt_id is null then
    raise exception using errcode='23514',
      constraint='owner_kcp_sandbox_ids_required',
      message='Owner sandbox requires valid IDs';
  end if;
  if p_idempotency_key is null
     or p_idempotency_key !~ '^kcp_sbx_[a-f0-9]{32}$'
     or p_provider_request_id is null
     or p_provider_request_id !~ '^mha_pa_[a-f0-9]{32}$' then
    raise exception using errcode='23514',
      constraint='owner_kcp_sandbox_canonical_request_required',
      message='Owner sandbox identifiers must be server-derived';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if not exists(
    select 1 from public.qry_myeongha_owner_admin_access_v1(p_subject_id) owner_acl
    where owner_acl.is_owner_admin and owner_acl.sandbox_checkout_allowed
  ) then
    raise exception using errcode='42501',
      constraint='owner_kcp_sandbox_admin_only',
      message='Owner sandbox capability is not available';
  end if;

  -- Keep Member Subject locking for canonical Owner sandbox authority.
  select s.kind,s.status
    into v_subject_kind,v_subject_status
    from public.subjects s
    where s.id=p_subject_id
    for update;
  if not found or v_subject_kind<>'member' or v_subject_status<>'active' then
    raise exception using errcode='42501',
      constraint='owner_kcp_sandbox_active_member_required',
      message='Owner sandbox requires an active Member';
  end if;
  select pi.id into v_existing_intent
    from public.purchase_intents pi
    where pi.subject_id=p_subject_id
      and pi.idempotency_key=p_idempotency_key;
  select p.id,po.id,po.capability_set_id,
         pcs.definition_version,pcs.definition_hash
    into v_product_id,v_offer_id,v_capability_id,
         v_capability_version,v_capability_hash
  from public.products p
  join public.product_offers po on po.product_id=p.id
  join public.product_capability_sets pcs on pcs.id=po.capability_set_id and pcs.product_id=p.id
  where p.product_key='chat_credits_300_v1'
    and p.product_type='credit'
    and p.enabled=false
    and p.retired_at is null
    and po.enabled=false
    and po.retired_at is null
    and po.platform='web'
    and po.provider='portone_v2'
    and po.external_product_id='myeongha-chat-credits-300-v1'
    and po.currency='KRW'
    and po.display_price_minor=1900;
  if not found or v_capability_id is null or
    not exists(select 1 from public.product_capability_items pci
      where pci.capability_set_id=v_capability_id) then
    raise exception using errcode='P0001',
      constraint='owner_kcp_sandbox_catalog_unavailable',
      message='Exact disabled test-only SKU is unavailable';
  end if;

  select pct.terms_version into v_terms_version
    from public.product_offer_charge_terms pct
    where pct.product_offer_id=v_offer_id
      and pct.retired_at is null
      and pct.amount_minor=1900
      and pct.currency='KRW';
  if v_terms_version is null then
    raise exception using errcode='23514',
      constraint='owner_kcp_sandbox_charge_terms_required',
      message='Pinned exact KRW 1900 charge terms unavailable';
  end if;

  v_offer_snapshot:=pg_catalog.jsonb_build_object(
    'productOfferId',v_offer_id::text,
    'productId',v_product_id::text,
    'platform','web','provider','portone_v2',
    'externalProductId','myeongha-chat-credits-300-v1'
  );
  v_capability_snapshot:=pg_catalog.jsonb_build_object(
    'capabilitySetId',v_capability_id::text,
    'definitionVersion',v_capability_version,
    'definitionHash',v_capability_hash
  );

  if v_existing_intent is null then
    insert into public.purchase_intents(
      id,subject_id,product_offer_id,provider_account_link_id,
      idempotency_key,request_hash,
      offer_snapshot_jsonb,offer_snapshot_hash,
      expected_amount_minor,expected_currency,charge_terms_version,
      capability_set_id,capability_snapshot_jsonb,capability_snapshot_hash,
      status,created_at,updated_at
    ) values(
      p_purchase_intent_id,p_subject_id,v_offer_id,null,
      p_idempotency_key,
      'owner-kcp-sandbox-v1:'||pg_catalog.md5(p_subject_id::text||':'||p_idempotency_key),
      v_offer_snapshot,'owner-kcp-sandbox-v1:'||pg_catalog.md5(v_offer_snapshot::text),
      1900,'KRW',v_terms_version,
      v_capability_id,v_capability_snapshot,
      'owner-kcp-sandbox-v1:'||pg_catalog.md5(v_capability_snapshot::text),
      'created',v_now,v_now
    );
    v_existing_intent:=p_purchase_intent_id;
  else
    if not exists(
      select 1 from public.purchase_intents pi
      where pi.id=v_existing_intent and pi.subject_id=p_subject_id
        and pi.product_offer_id=v_offer_id
        and pi.expected_amount_minor=1900 and pi.expected_currency='KRW'
        and pi.charge_terms_version=v_terms_version
        and pi.offer_snapshot_jsonb=v_offer_snapshot
        and pi.capability_snapshot_jsonb=v_capability_snapshot
        and pi.request_hash='owner-kcp-sandbox-v1:'||
          pg_catalog.md5(p_subject_id::text||':'||p_idempotency_key)
    ) then
      raise exception using errcode='23505',
        constraint='owner_kcp_sandbox_replay_conflict',
        message='Owner sandbox replay authority mismatch';
    end if;
  end if;

  select a.payment_attempt_id,
         a.provider_request_id,
         a.status,
         a.replayed
    into v_attempt
  from public.cmd_create_payment_attempt_v1(
    p_subject_id,p_payment_attempt_id,v_existing_intent,
    'sandbox',p_idempotency_key,p_provider_request_id
  ) a;
  if not found or v_attempt.provider_request_id is distinct from p_provider_request_id then
    raise exception using errcode='23514',
      constraint='owner_kcp_sandbox_attempt_mismatch',
      message='Owner sandbox attempt creation was not authoritative';
  end if;
  return query select v_existing_intent,v_attempt.payment_attempt_id,
    v_attempt.provider_request_id,v_attempt.status,v_attempt.replayed;
end;
$function$;

revoke all on function public.cmd_prepare_owner_portone_sandbox_credit_v1(uuid,uuid,uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.cmd_prepare_owner_portone_sandbox_credit_v1(uuid,uuid,uuid,text,text)
  to myeongha_api_executor;

commit;
