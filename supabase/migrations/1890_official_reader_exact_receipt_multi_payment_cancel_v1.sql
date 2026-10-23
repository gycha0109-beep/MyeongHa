-- S2 exact original PortOne payment attempt + Receipt-specific cancellation.
-- One purchase may contain independently verified Receipt/Grant lineages.
-- Never treat a sibling payment request as proof for a different transaction;
-- never revoke sibling Grant during verified cancellation of this Receipt.
-- Private forward-only Writer replacement (1880), no operational DB apply.
-- Watchtower-Track: db-authority-core

create or replace function public.cmd_apply_verified_portone_reader_full_cancellation_v1(
  p_payment_id text,
  p_transaction_id text,
  p_cancellation_id text,
  p_cancelled_at timestamptz,
  p_verified_amount_minor bigint,
  p_verified_currency text,
  p_environment text,
  p_evidence_fingerprint text,
  p_verifier_revision text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=pg_catalog,public
as $portone_reader_cancel_s2$
declare
  v_receipt public.commerce_receipts%rowtype;
  v_event public.commerce_provider_events%rowtype;
  v_scope record;
  v_scope_count integer:=0;
  v_unbound_grant public.entitlement_grants%rowtype;
  v_unbound_grant_count integer:=0;
  v_unbound_effects jsonb:='[]'::jsonb;
  v_unbound_effect jsonb;
  v_existing_event boolean;
  v_event_key text;
  v_effects jsonb;
  v_now timestamptz:=clock_timestamp();
  v_payload jsonb;
begin
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25001',
      constraint='official_reader_portone_cancel_read_committed_required',
      message='PortOne cancellation requires READ COMMITTED transaction';
  end if;
  -- Current 1770 is deliberately production-receipt-only. No sandbox-to-
  -- production conversion, no caller-controlled scope, no partial cancellation.
  if p_environment is distinct from 'production'
     or p_payment_id is null or p_payment_id='' or length(p_payment_id)>512
     or p_transaction_id is null or p_transaction_id='' or length(p_transaction_id)>512
     or p_cancellation_id is null or p_cancellation_id='' or length(p_cancellation_id)>512
     or p_cancelled_at is null or p_cancelled_at>v_now
     or p_verified_amount_minor is null or p_verified_amount_minor<=0
     or p_verified_currency is null or p_verified_currency !~ '^[A-Z]{3}$'
     or p_evidence_fingerprint is null
     or p_evidence_fingerprint !~ '^hmac-sha256:k1:[0-9a-f]{64}$'
     or p_verifier_revision is null or btrim(p_verifier_revision)=''
     or length(p_verifier_revision)>256 then
    raise exception using errcode='23514',
      constraint='official_reader_portone_cancel_verified_input_invalid',
      message='PortOne verified full-cancellation evidence is invalid';
  end if;

  -- The live verifier checks the PortOne GET response independently of the
  -- authenticated webhook; this command additionally pins the canonical
  -- receipt, amount, currency, original order and provider transaction.
  -- This preliminary read MUST NOT acquire a Receipt/Grant row lock.
  select cr.* into v_receipt
  from public.commerce_receipts cr
  where cr.provider='portone_v2'
    and cr.environment=p_environment
    and cr.external_transaction_id=p_transaction_id
    and cr.verified_amount_minor=p_verified_amount_minor
    and cr.verified_currency=p_verified_currency
    and cr.verification_status in ('verified','revoked')
    and exists (
      select 1 from public.commerce_payment_attempts a
      where a.purchase_intent_id=cr.purchase_intent_id
        and a.subject_id=cr.subject_id
        and a.provider=cr.provider
        and a.environment=cr.environment
        and a.provider_request_id=p_payment_id
        -- The same purchase can have multiple attempts/Receipts. A request
        -- identifier for sibling Receipt B must never authorize cancelling A.
        and a.provider_transaction_id=p_transaction_id
        and a.product_offer_id=cr.product_offer_id
    );
  if not found then
    raise exception using errcode='P0001',
      constraint='official_reader_portone_cancel_receipt_unavailable',
      message='PortOne cancellation is not linked to an original verified Receipt';
  end if;

  -- Existing Commerce purchases without a stored Reader selection are not
  -- Reader transactions. Leave their current lifecycle path unchanged: do not
  -- revoke, mutate Receipt or force ordinary Commerce webhook retries.
  if not exists (
    select 1 from public.purchase_intent_reader_selections prs
    where prs.purchase_intent_id=v_receipt.purchase_intent_id
  ) then
    return pg_catalog.jsonb_build_object(
      'contractVersion','portone-reader-full-cancellation-v1',
      'disposition','unrelated_commerce'
    );
  end if;

  -- A pre-bind cancellation has no official Reading scope to synchronize
  -- against. Serialize it with the SAME purchase-level xact advisory lock as
  -- the combined 1760 writer, before any S1/row lock. This also guarantees
  -- the access scope discovery below sees a completed combined transaction.
  perform public.internal_acquire_official_reader_purchase_lock_v1(
    v_receipt.purchase_intent_id
  );

  -- Do not rely on caller Subject or Reader identifiers; all scopes derive
  -- solely from stored Reader access bindings and the original Receipt.
  perform pg_catalog.set_config('myeongha.subject_id',v_receipt.subject_id::text,true);
  for v_scope in
    select distinct a.subject_id,a.official_reading_id,a.reader_character_id
    from public.entitlement_grants eg
    join public.standard_reading_reader_access_grants a
      on a.entitlement_grant_id=eg.id and a.subject_id=eg.subject_id
    where eg.source_receipt_id=v_receipt.id
      and eg.subject_id=v_receipt.subject_id
      and eg.grant_source_type='purchase'
      and a.official_reading_id is not null
      and a.reader_character_id is not null
    order by a.subject_id,a.official_reading_id,a.reader_character_id
  loop
    perform public.internal_acquire_official_reader_scope_lock_v1(
      v_scope.subject_id,v_scope.official_reading_id,v_scope.reader_character_id
    );
    v_scope_count:=v_scope_count+1;
  end loop;
  if v_scope_count=0 then
    -- No Reader S1 scope exists. Only a purchase with ZERO issued Grants from
    -- ANY Receipt of this Purchase can be cancelled without touching
    -- Commerce Entitlement effects. Lock the original Receipt FIRST: direct
    -- legacy 1080/1090 receipt issuance also locks it before Grant INSERT,
    -- so an in-flight issuance cannot become an invisible phantom.
    select cr.* into v_receipt
    from public.commerce_receipts cr
    where cr.id=v_receipt.id
      and cr.provider='portone_v2'
      and cr.environment='production'
      and cr.external_transaction_id=p_transaction_id
      and cr.verified_amount_minor=p_verified_amount_minor
      and cr.verified_currency=p_verified_currency
      and cr.verification_status in ('verified','revoked')
    for update;
    if not found then
      raise exception using errcode='P0001',
        constraint='official_reader_portone_cancel_unbound_receipt_changed',
        message='Unbound Reader cancellation Receipt changed during locking';
    end if;

    -- Other verified Receipts of this purchase can have independently
    -- paid Grants. Do NOT revoke them with this receipt's verified event.
    -- The direct 1080/1090 writer locks its OWN Receipt; this command holds
    -- exactly v_receipt and processes only Grants source_receipt_id=v_receipt.
    -- Cross-receipt effect or access remains unavailable by design.
    -- Lock every exact purchase Grant in deterministic id order. A concurrent
    -- direct legacy 1220 bind locks its selected Grant before inserting an
    -- immutable Reader Access; re-check absence only AFTER these locks.
    -- Existing Receipt FOR UPDATE prevents concurrent direct 1080/1090
    -- issuance from inserting a new Grant behind this check.
    for v_unbound_grant in
      select eg.*
      from public.entitlement_grants eg
      where eg.source_receipt_id=v_receipt.id
        and eg.subject_id=v_receipt.subject_id
        and eg.grant_source_type='purchase'
      order by eg.id
      for update
    loop
      v_unbound_grant_count:=v_unbound_grant_count+1;
    end loop;
    if exists (
      select 1 from public.standard_reading_reader_access_grants a
      where a.purchase_intent_id=v_receipt.purchase_intent_id
        and a.subject_id=v_receipt.subject_id
    ) then
      -- A direct 1220 binder may have committed while we waited for its
      -- Grant row. Do NOT acquire its S1 lock after Receipt/Grant row locks:
      -- fail this transaction and let the verifier retry the bound route.
      raise exception using errcode='40001',
        constraint='official_reader_portone_cancel_bound_during_unbound_lock',
        message='Reader binding completed during cancellation lock wait; retry under its bound scope';
    end if;
  end if;

  -- Re-validate source AFTER locking. 1780 never mutates another Product.
  select cr.* into strict v_receipt
  from public.commerce_receipts cr
  where cr.id=v_receipt.id
    and cr.provider='portone_v2'
    and cr.environment='production'
    and cr.external_transaction_id=p_transaction_id
    and cr.verified_amount_minor=p_verified_amount_minor
    and cr.verified_currency=p_verified_currency
    and cr.verification_status in ('verified','revoked');

  v_event_key:='myeongha:portone-v2:full-cancel:v1:'||p_cancellation_id;
  v_payload:=pg_catalog.jsonb_build_object(
    'schemaVersion','portone-full-cancel-verified-v1',
    'paymentId',p_payment_id,
    'transactionId',p_transaction_id,
    'cancellationId',p_cancellation_id,
    'environment',p_environment,
    'verifiedAmountMinor',p_verified_amount_minor,
    'verifiedCurrency',p_verified_currency,
    'evidenceFingerprint',p_evidence_fingerprint,
    'verifierRevision',p_verifier_revision
  );

  select pe.* into v_event
  from public.commerce_provider_events pe
  where pe.provider='portone_v2' and pe.external_event_id=v_event_key;
  if found then
    if v_event.resolved_receipt_id is distinct from v_receipt.id
       or v_event.resolved_subject_id is distinct from v_receipt.subject_id
       or v_event.external_transaction_id is distinct from p_transaction_id
       or v_event.provider_occurred_at is distinct from p_cancelled_at
       or v_event.payload_fingerprint is distinct from p_evidence_fingerprint
       or v_event.event_type is distinct from 'Transaction.Cancelled'
       or v_event.status not in ('verified','processed') then
      raise exception using errcode='23505',
        constraint='official_reader_portone_cancel_replay_conflict',
        message='PortOne full cancellation replay conflicts with persisted evidence';
    end if;
  else
    insert into public.commerce_provider_events(
      id,provider,external_event_id,event_type,external_transaction_id,
      resolved_subject_id,resolution_source_type,resolved_receipt_id,
      payload_fingerprint,provider_occurred_at,provider_ordering_key,
      verified_payload_jsonb,status,received_at,environment,verifier_revision
    ) values(
      pg_catalog.gen_random_uuid(),'portone_v2',v_event_key,'Transaction.Cancelled',
      p_transaction_id,v_receipt.subject_id,'receipt',v_receipt.id,
      p_evidence_fingerprint,p_cancelled_at,
      'portone-v2-fullcancel:'||pg_catalog.to_char(p_cancelled_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      v_payload,'verified',v_now,'production',p_verifier_revision
    ) returning * into v_event;
  end if;

  -- Existing private 1770 owns the exact Grant/Event/projection/outbox change.
  -- Any error rolls back the new provider event and all entitlement mutations.
  if v_scope_count=0 then
    if v_unbound_grant_count=0 then
      v_effects:=pg_catalog.jsonb_build_object(
        'contractVersion','official-reader-s2-no-grant-cancellation-v1',
        'disposition','cancelled_before_grant',
        'scopeCount',0,'grantCount',0
      );
    else
      -- Scope-less Grant may be revoked only after all rows are locked and
      -- proven unbound. Existing 1080 remains the ONLY writer of Grant,
      -- EntitlementEvent, projection and outbox; its 1880 prelock guard
      -- verifies this context AND the real held purchase advisory lock.
      perform pg_catalog.set_config(
        'myeongha.reader_unbound_cancel_receipt_id',v_receipt.id::text,true
      );
      for v_unbound_grant in
        select eg.*
        from public.entitlement_grants eg
        where eg.source_receipt_id=v_receipt.id
          and eg.subject_id=v_receipt.subject_id
          and eg.grant_source_type='purchase'
        order by eg.id
      loop
        select exists (
          select 1 from public.entitlement_events ee
          where ee.grant_id=v_unbound_grant.id
            and ee.source_provider_event_id=v_event.id
            and ee.event_type='revoked'
        ) into v_existing_event;
        if v_unbound_grant.last_effective_at is not null
           and v_event.provider_occurred_at<=v_unbound_grant.last_effective_at
           and not v_existing_event then
          raise exception using errcode='40001',
            constraint='official_reader_portone_cancel_unbound_stale_provider_event',
            message='Unbound Reader cancellation is older than Grant lifecycle';
        end if;
        select pg_catalog.to_jsonb(e) into strict v_unbound_effect
        from public.internal_apply_entitlement_effect_v1(
          'provider_event',v_event.id,v_unbound_grant.id,null,
          v_unbound_grant.revision,v_unbound_grant.last_provider_ordering_key,
          'revoked',v_event.provider_occurred_at,'revoked',
          v_unbound_grant.valid_from,v_unbound_grant.valid_until,
          'verified_provider_full_cancellation'
        ) e;
        v_unbound_effects:=v_unbound_effects
          ||pg_catalog.jsonb_build_array(v_unbound_effect);
      end loop;
      perform pg_catalog.set_config(
        'myeongha.reader_unbound_cancel_receipt_id','',true
      );
      v_effects:=pg_catalog.jsonb_build_object(
        'contractVersion','official-reader-s2-unbound-grant-cancellation-v1',
        'disposition','cancelled_before_binding',
        'scopeCount',0,'grantCount',v_unbound_grant_count,
        'effects',v_unbound_effects
      );
    end if;
  else
    v_effects:=public.internal_dispatch_verified_official_reader_revoke_event_v1(v_event.id);
  end if;
  update public.commerce_receipts cr
  set verification_status='revoked'
  where cr.id=v_receipt.id and cr.verification_status='verified';

  return pg_catalog.jsonb_build_object(
    'contractVersion','portone-reader-full-cancellation-v1',
    'receiptId',v_receipt.id,
    'providerEventId',v_event.id,
    'revoke',v_effects
  );
end
$portone_reader_cancel_s2$;


comment on function public.cmd_apply_verified_portone_reader_full_cancellation_v1(
  text,text,text,timestamptz,bigint,text,text,text,text
) is
'Reader verified PortOne full-cancel binds payment attempt request AND transaction identity; applies Grant/Event/projection changes exclusively to verified original Receipt, leaving sibling Receipt Grants unchanged even with same purchase. Purchase and original Receipt/Grant locks protect unbound cancellation. No paid Reader activation.';

revoke all on function public.cmd_apply_verified_portone_reader_full_cancellation_v1(
  text,text,text,timestamptz,bigint,text,text,text,text
) from public;

do $portone_cancel_acl$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role',
      'myeongha_api_executor','myeongha_seyeon_chat_runtime_owner',
      'myeongha_commerce_internal_executor')
  loop
    execute pg_catalog.format(
      'revoke all on function public.cmd_apply_verified_portone_reader_full_cancellation_v1(text,text,text,timestamptz,bigint,text,text,text,text) from %I',
      v_role
    );
  end loop;
end
$portone_cancel_acl$;

-- Existing trusted Commerce internal API transaction role ONLY. SECURITY DEFINER
-- executes all private 1770/1080 writers without exposing them to that role.
grant execute on function public.cmd_apply_verified_portone_reader_full_cancellation_v1(
  text,text,text,timestamptz,bigint,text,text,text,text
) to myeongha_commerce_internal_executor;

comment on function public.cmd_apply_verified_portone_reader_full_cancellation_v1(
  text,text,text,timestamptz,bigint,text,text,text,text
) is
'Restricted verified PortOne full cancellation: exact original payment request plus transaction and Receipt source Grant effects only; sibling receipts survive. Must follow server-side GET cancellation verification. No refund API or public Reader capability.';

