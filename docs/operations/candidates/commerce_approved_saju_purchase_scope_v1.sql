-- Private scope persistence for the November 6 Saju catalog. Apply only to an
-- isolated review database. The existing atomic purchase command must call this
-- before commit; this candidate creates no Offer, intent, payment or grant.

create function commerce_saju_private.approved_offer_v1(p_offer_id text)
returns table(amount_minor bigint, fields text[], counterpart_order text)
language sql immutable strict security invoker
set search_path = pg_catalog
as $function$
  select approved.amount_minor, approved.fields, approved.counterpart_order
  from (values
    ('career', 9900::bigint, array['career'], null::text),
    ('business', 9900, array['business'], null),
    ('wealth', 9900, array['wealth'], null),
    ('relationship', 9900, array['relationship'], null),
    ('year', 7900, array['year'], null),
    ('month', 4900, array['month'], null),
    ('first-counterpart', 12900, array['compatibility'], 'first'),
    ('additional-counterpart', 9900, array['compatibility'], 'additional'),
    ('relationship-plus-first', 19900, array['relationship','compatibility'], 'first'),
    ('career-economy', 24900, array['career','business','wealth'], null),
    ('basic', 29900, array['career','business','wealth','relationship'], null),
    ('basic-year', 35800, array['career','business','wealth','relationship','year'], null),
    ('basic-month', 33800, array['career','business','wealth','relationship','month'], null),
    ('basic-year-month', 39700, array['career','business','wealth','relationship','year','month'], null)
  ) approved(offer_id, amount_minor, fields, counterpart_order)
  where approved.offer_id = p_offer_id
$function$;

-- Caller must be inside the scoped purchase transaction. An eventual writer
-- must establish live release / target-use authority and reserve the comparison
-- order under the Record lock before calling this persistence function.
create function commerce_saju_private.bind_approved_purchase_scope_v1(
  p_subject_id uuid,
  p_purchase_intent_id uuid,
  p_admission_text text,
  p_admission_hash text
)
returns jsonb
language plpgsql security invoker
set search_path = pg_catalog
as $function$
declare
  v_admission jsonb;
  v_existing commerce_saju_private.approved_purchase_scope_v1%rowtype;
  v_origin public.commerce_saju_purchase_origins_v1%rowtype;
  v_intent public.purchase_intents%rowtype;
  v_record public.commerce_saju_records_v1%rowtype;
  v_offer record;
  v_actual_fields text[];
  v_keys jsonb;
  v_reference timestamptz;
  v_local_reference timestamp;
  v_target_id uuid;
  v_target_revision uuid;
  v_target jsonb;
  v_scope text;
  v_request_text text;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if not exists (
    select 1 from public.subjects
    where id = p_subject_id and kind = 'member' and status = 'active' and auth_user_id is not null
  ) then
    raise exception using errcode = '42501', message = 'Active member required for approved Saju purchase scope';
  end if;
  if p_admission_text is null or octet_length(p_admission_text) > 8192
     or p_admission_hash is distinct from 'sha256:v1:' ||
       encode(sha256(convert_to(p_admission_text, 'UTF8')), 'hex') then
    raise exception using errcode = '23514', message = 'Approved Saju admission hash mismatch';
  end if;
  v_admission := p_admission_text::jsonb;
  if jsonb_typeof(v_admission) is distinct from 'object'
     or v_admission->>'policy' is distinct from 'approved-saju-2026-11-06'
     or v_admission - array['policy','approvedOfferId','subjectId','sajuRecordId','birthRevisionId',
       'productOfferId','capabilitySetId','currency','amountMinor','components',
       'periodReferenceDateTime','counterpart'] <> '{}'::jsonb
     or v_admission->>'subjectId' is distinct from p_subject_id::text then
    raise exception using errcode = '23514', message = 'Approved Saju admission subject or policy mismatch';
  end if;

  select * into strict v_origin from public.commerce_saju_purchase_origins_v1
    where purchase_intent_id = p_purchase_intent_id and subject_id = p_subject_id;
  select * into strict v_record from public.commerce_saju_records_v1
    where id = v_origin.saju_record_id and subject_id = p_subject_id for update;
  select * into strict v_intent from public.purchase_intents
    where id = p_purchase_intent_id and subject_id = p_subject_id for update;
  select * into v_existing from commerce_saju_private.approved_purchase_scope_v1
    where purchase_intent_id = p_purchase_intent_id;
  if found then
    if v_existing.admission_hash is distinct from p_admission_hash
       or v_existing.admission is distinct from v_admission then
      raise exception using errcode = '23505', message = 'Approved Saju admission replay changed scope';
    end if;
    return v_existing.component_scope_keys;
  end if;

  select * into strict v_offer from commerce_saju_private.approved_offer_v1(v_admission->>'approvedOfferId');
  -- Canonical key order and original-only fields mirror createPurchaseIntentV3.
  -- All interpolated values are a validated digest or database UUID.
  v_request_text := format(
    '{"approvedAdmissionHash":"%s","birthRevisionId":"%s","productOfferId":"%s","purchaseKind":"original","sajuRecordId":"%s","sourceReceiptIds":[]}',
    p_admission_hash, v_origin.birth_revision_id, v_intent.product_offer_id, v_record.id);
  if v_origin.purchase_kind <> 'original' or v_intent.status not in ('created','pending')
     or v_origin.approved_admission_hash is distinct from p_admission_hash
     or v_intent.request_hash is distinct from 'sha256:v1:' ||
       encode(sha256(convert_to(v_request_text, 'UTF8')), 'hex')
     or v_origin.birth_revision_id is distinct from v_record.birth_revision_id
     or v_admission->>'sajuRecordId' is distinct from v_record.id::text
     or v_admission->>'birthRevisionId' is distinct from v_origin.birth_revision_id::text
     or v_admission->>'productOfferId' is distinct from v_intent.product_offer_id::text
     or v_admission->>'capabilitySetId' is distinct from v_intent.capability_set_id::text
     or v_admission->>'amountMinor' is distinct from v_offer.amount_minor::text
     or v_intent.expected_amount_minor is distinct from v_offer.amount_minor
     or v_admission->>'currency' is distinct from 'KRW' or v_intent.expected_currency is distinct from 'KRW'
     or v_intent.offer_snapshot_jsonb->>'platform' is distinct from 'web'
     or v_intent.offer_snapshot_jsonb->>'provider' is distinct from 'portone_v2'
     or not exists (
       select 1 from public.birth_profiles birth
       where birth.subject_id = p_subject_id and birth.profile_kind = 'self'
         and birth.archived_at is null and birth.current_revision_id = v_origin.birth_revision_id
       for share
     )
     or not exists (
       select 1 from public.product_offers offer
       join public.products product on product.id = offer.product_id
       join public.product_offer_charge_terms terms on terms.product_offer_id = offer.id
       where offer.id = v_intent.product_offer_id and offer.capability_set_id = v_intent.capability_set_id
         and offer.provider = 'portone_v2' and offer.platform = 'web' and offer.enabled and product.enabled
         and terms.terms_version = v_intent.charge_terms_version
         and terms.retired_at is null and terms.amount_minor = v_offer.amount_minor and terms.currency = 'KRW'
       for share of offer, product, terms
     ) then
    raise exception using errcode = '23514', message = 'Approved Saju admission does not match purchase terms';
  end if;

  select array_agg(item_key order by item_key) into v_actual_fields
  from public.product_capability_items where capability_set_id = v_intent.capability_set_id
    and scope_mode = 'saju_record' and fixed_scope_key is null
    and entitlement_key = public.internal_commerce_saju_entitlement_key_v1(item_key);
  if v_actual_fields is distinct from (select array_agg(field order by field) from unnest(v_offer.fields) as field)
     or (select count(*) from public.product_capability_items where capability_set_id = v_intent.capability_set_id)
        <> cardinality(v_offer.fields)
     or jsonb_typeof(v_admission->'components') is distinct from 'array' then
    raise exception using errcode = '23514', message = 'Approved Saju capability set mismatch';
  end if;
  select array_agg(entry->>'component' order by entry->>'component') into v_actual_fields
  from jsonb_array_elements(v_admission->'components') as entry
  where case when jsonb_typeof(entry) = 'object'
    then entry - array['component','authority','releaseRef'] = '{}'::jsonb else false end
    and entry->>'authority' = 'official_fulfillment'
    and jsonb_typeof(entry->'releaseRef') = 'string'
    and length(entry->>'releaseRef') between 1 and 200
    and entry->>'releaseRef' = btrim(entry->>'releaseRef');
  if v_actual_fields is distinct from (select array_agg(field order by field) from unnest(v_offer.fields) as field)
     or jsonb_array_length(v_admission->'components') <> cardinality(v_offer.fields) then
    raise exception using errcode = '23514', message = 'Approved Saju fulfillment coverage mismatch';
  end if;

  if v_offer.fields && array['year','month'] then
    if coalesce(v_admission->>'periodReferenceDateTime', '') !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$' then
      raise exception using errcode = '23514', message = 'Approved Saju period reference missing';
    end if;
    v_reference := (v_admission->>'periodReferenceDateTime')::timestamptz;
    if to_char(timezone('UTC', v_reference), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        is distinct from v_admission->>'periodReferenceDateTime' then
      raise exception using errcode = '23514', message = 'Approved Saju period reference is not canonical';
    end if;
    v_local_reference := timezone('Asia/Seoul', v_reference);
    if ('year' = any(v_offer.fields) and date_trunc('year', v_local_reference)
          <> date_trunc('year', timezone('Asia/Seoul', v_intent.created_at)))
       or ('month' = any(v_offer.fields) and date_trunc('month', v_local_reference)
          <> date_trunc('month', timezone('Asia/Seoul', v_intent.created_at))) then
      raise exception using errcode = '23514', message = 'Approved Saju period changed before intent creation';
    end if;
  elsif v_admission ? 'periodReferenceDateTime' then
    raise exception using errcode = '23514', message = 'Unexpected approved Saju period';
  end if;

  v_target := v_admission->'counterpart';
  if v_offer.counterpart_order is not null then
    v_target_id := (v_target->>'targetPersonId')::uuid;
    v_target_revision := (v_target->>'targetBirthRevisionId')::uuid;
    if jsonb_typeof(v_target) is distinct from 'object'
       or v_target - array['targetPersonId','targetBirthRevisionId','order','useApprovalRef'] <> '{}'::jsonb
       or v_target->>'order' is distinct from v_offer.counterpart_order
       or coalesce(length(btrim(v_target->>'useApprovalRef')), 0) not between 1 and 200
       or not exists (
         select 1 from public.target_person_profiles target
         join public.birth_profiles birth on birth.id = target.birth_profile_id
           and birth.subject_id = target.subject_id
         where target.id = v_target_id and target.subject_id = p_subject_id and target.deleted_at is null
           and birth.archived_at is null and birth.profile_kind = 'target'
           and birth.current_revision_id = v_target_revision
         for share of target, birth
       ) then
      raise exception using errcode = '23514', message = 'Approved Saju counterpart scope unavailable';
    end if;
  elsif v_admission ? 'counterpart' then
    raise exception using errcode = '23514', message = 'Unexpected approved Saju counterpart';
  end if;

  v_scope := 'saju-record:' || v_record.entitlement_scope_id::text;
  select jsonb_object_agg(field, case field
    when 'year' then v_scope || ':annual:' || to_char(v_local_reference, 'YYYY')
    when 'month' then v_scope || ':monthly:' || to_char(v_local_reference, 'YYYY-MM')
    when 'compatibility' then v_scope || ':counterpart:' || encode(
      sha256(convert_to(v_scope || ':' || v_target_id::text || ':' || v_target_revision::text, 'UTF8')), 'hex')
    else v_scope end) into v_keys
  from unnest(v_offer.fields) as field;
  insert into commerce_saju_private.approved_purchase_scope_v1
    (purchase_intent_id, admission_hash, admission, component_scope_keys)
  values (p_purchase_intent_id, p_admission_hash, v_admission, v_keys);
  return v_keys;
end
$function$;

revoke all on all functions in schema commerce_saju_private from public, anon, authenticated, service_role;
