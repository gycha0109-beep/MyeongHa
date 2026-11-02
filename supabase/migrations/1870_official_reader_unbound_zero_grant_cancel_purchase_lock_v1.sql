-- S2 draft: no-Grant verified cancellation and atomic 1760 purchase
-- issuance share one transaction-level purchase lock BEFORE any S1/row lock.
-- No caller-defined Reader/Reading identity. The original Receipt and
-- verified PortOne payment evidence remain mandatory in their own writers.
-- This does NOT permit cancellation of an already-issued unbound Grant.
-- Watchtower-Track: db-authority-core

create or replace function public.internal_acquire_official_reader_purchase_lock_v1(
  p_purchase_intent_id uuid
)
returns void
language plpgsql
volatile
security invoker
set search_path=pg_catalog,public
as $reader_purchase_xact_lock$
begin
  if p_purchase_intent_id is null then
    raise exception using errcode='23514',
      constraint='official_reader_s2_purchase_lock_intent_required',
      message='Stored purchase intent is required for Reader cancellation ordering';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'myeongha:official-reader:purchase-lock:v1:'
        ||p_purchase_intent_id::text,1827::bigint
    )
  );
end
$reader_purchase_xact_lock$;

revoke all on function public.internal_acquire_official_reader_purchase_lock_v1(uuid)
  from public;
do $reader_purchase_lock_acl$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in (
      'anon','authenticated','service_role',
      'myeongha_api_executor','myeongha_commerce_internal_executor',
      'myeongha_seyeon_chat_runtime_owner'
    )
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_acquire_official_reader_purchase_lock_v1(uuid) from %I',
      v_role
    );
  end loop;
end
$reader_purchase_lock_acl$;

create or replace function public.internal_apply_verified_reader_purchase_under_scope_v1(
  p_subject_id uuid,
  p_expected_official_reading_id uuid,
  p_reader_character_id text,
  p_receipt_id uuid,
  p_purchase_intent_id uuid,
  p_capability_item_keys text[],
  p_effective_ats timestamptz[],
  p_target_valid_froms timestamptz[],
  p_target_valid_untils timestamptz[],
  p_reason_codes text[],
  p_proposed_reading_session_id uuid,
  p_proposed_reading_id uuid,
  p_request_hash text,
  p_request_contract_version text,
  p_request_snapshot_jsonb jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=pg_catalog, public
as $reader_purchase_s2$
declare
  v_receipt_subject uuid;
  v_verified_intent uuid;
  v_selected_reader text;
  v_effects jsonb;
  v_access jsonb;
  v_real_reading uuid;
begin
  -- A post-lock committed authority read MUST observe a fresh snapshot.
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using
      errcode='25001',
      constraint='official_reader_s2_read_committed_required',
      message='Official Reader shared-scope purchase requires READ COMMITTED';
  end if;
  if p_subject_id is null or p_expected_official_reading_id is null
     or p_receipt_id is null or p_purchase_intent_id is null
     or p_proposed_reading_session_id is null or p_proposed_reading_id is null
     or p_reader_character_id is null then
    raise exception using
      errcode='23514',
      constraint='official_reader_s2_required_identity',
      message='Official Reader purchase requires complete server-owned identities';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  -- Pre-lock SELECT does not claim ownership or lock any purchase row. It
  -- fixes the candidate scope based on *stored* verified Receipt and Reader
  -- selection, not a request-provided Reader id alone. Both source writers
  -- independently re-check their own current authorities after acquisition.
  select cr.subject_id,cr.purchase_intent_id,prs.reader_character_id
    into v_receipt_subject,v_verified_intent,v_selected_reader
  from public.commerce_receipts cr
  join public.purchase_intents pi
    on pi.id=cr.purchase_intent_id
   and pi.subject_id=cr.subject_id
   and pi.product_offer_id=cr.product_offer_id
  join public.purchase_intent_reader_selections prs
    on prs.purchase_intent_id=cr.purchase_intent_id
  where cr.id=p_receipt_id
    and cr.subject_id=p_subject_id
    and cr.purchase_intent_id=p_purchase_intent_id
    and cr.verification_status='verified'
    and cr.environment='production'
    and pi.status='verified';

  if not found
     or v_receipt_subject is distinct from p_subject_id
     or v_verified_intent is distinct from p_purchase_intent_id
     or v_selected_reader is distinct from p_reader_character_id then
    raise exception using
      errcode='P0001',
      constraint='official_reader_s2_verified_lineage_unavailable',
      message='Verified Reader receipt, purchase and Reader selection unavailable';
  end if;

  -- Serialize verified issuance with a full cancellation BEFORE acquiring S1.
  -- No Purchase/Receipt/Grant row lock may precede this xact advisory lock.
  -- Direct 1220 remains governed by existing S1/Grant authority; a purchase
  -- with ANY already-issued Grant cannot use the no-Grant cancellation branch.
  perform public.internal_acquire_official_reader_purchase_lock_v1(
    p_purchase_intent_id
  );

  -- One reader+official reading scope for BOTH real writer operations. This
  -- lock is acquired BEFORE the existing Receipt/Grant/Purchase/Birth locks.
  perform public.internal_acquire_official_reader_scope_lock_v1(
    p_subject_id,p_expected_official_reading_id,v_selected_reader
  );

  -- The original Reading can be generated only after Grant issuance. Keep
  -- its S1-locked candidate in transaction-local context for the legacy
  -- receipt/Grant writer, which checks the lock itself (never trusts GUC alone).
  perform pg_catalog.set_config(
    'myeongha.reader_pending_reading_id',
    p_expected_official_reading_id::text, true
  );

  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(e) order by e.result_item_key)
    into v_effects
  from public.internal_apply_verified_receipt_capability_effects_v1(
    p_receipt_id,p_capability_item_keys,p_effective_ats,
    p_target_valid_froms,p_target_valid_untils,p_reason_codes
  ) e;

  if v_effects is null or pg_catalog.jsonb_array_length(v_effects)=0 then
    raise exception using
      errcode='P0001',
      constraint='official_reader_s2_grant_effects_missing',
      message='No committed verified capability effects available';
  end if;

  select pg_catalog.to_jsonb(a) into v_access
  from public.cmd_bind_standard_reading_access_v2(
    p_subject_id,p_purchase_intent_id,p_proposed_reading_session_id,
    p_proposed_reading_id,p_request_hash,p_request_contract_version,
    p_request_snapshot_jsonb
  ) a;

  if v_access is null then
    raise exception using
      errcode='P0001',
      constraint='official_reader_s2_bind_result_missing',
      message='Reader bind did not produce an authoritative result';
  end if;

  v_real_reading := (v_access->>'reading_id')::uuid;
  if v_real_reading is distinct from p_expected_official_reading_id
     or v_access->>'reader_character_id' is distinct from v_selected_reader
     or (v_access->>'purchase_intent_id')::uuid
        is distinct from p_purchase_intent_id then
    -- Any Grant mutation above rolls back atomically with this error. A
    -- guessed wrong Reader/Reading lock MUST NEVER commit another scope.
    raise exception using
      errcode='40001',
      constraint='official_reader_s2_scope_changed_during_bind',
      message='Reader bind authority does not match the locked official scope';
  end if;

  return pg_catalog.jsonb_build_object(
    'contractVersion','official-reader-s2-atomic-receipt-bind-v1',
    'capabilityEffects',v_effects,
    'readerAccess',v_access
  );
end
$reader_purchase_s2$;


-- Official Reader S2: authenticated Commerce verifier -> saved provider event
-- -> all matched Reader purchase rights revoked in one real database transaction.
-- This is a DRAFT code path, not a production activation or provider refund API.
-- Only the existing internal Commerce execution role receives EXECUTE. The
-- ordinary API role, Supabase service_role and paid Reader remain excluded.

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

    if exists (
      select 1 from public.commerce_receipts other_cr
      join public.entitlement_grants eg
        on eg.source_receipt_id=other_cr.id
       and eg.subject_id=other_cr.subject_id
      where other_cr.purchase_intent_id=v_receipt.purchase_intent_id
        and other_cr.subject_id=v_receipt.subject_id
    ) or exists (
      select 1 from public.standard_reading_reader_access_grants a
      where a.purchase_intent_id=v_receipt.purchase_intent_id
        and a.subject_id=v_receipt.subject_id
    ) then
      -- Unbound BUT already-issued Grant needs an S2 Commerce lifecycle
      -- design. Do not claim success or silently discard purchase rights.
      raise exception using errcode='P0001',
        constraint='official_reader_portone_cancel_unbound_grant_held',
        message='Unbound Reader purchase with an issued Grant cannot be cancelled without entitlement settlement';
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
    -- No Grant/Event/projection to revoke; still persist verified provider
    -- event and close the canonical Receipt in the SAME transaction.
    v_effects:=pg_catalog.jsonb_build_object(
      'contractVersion','official-reader-s2-no-grant-cancellation-v1',
      'disposition','cancelled_before_grant',
      'scopeCount',0,'grantCount',0
    );
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
'Private PortOne full-cancellation uses purchase xact advisory lock before Reader S1. Zero-Grant unbound receipt cancellation records verified evidence and closes receipt atomically; issued unbound Grant is HELD. Bound Reader still uses existing 1770 revoke; no public paid activation.';

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
'Restricted verified PortOne full cancellation -> Receipt revoke + all Reader Grant effects under ordered S1 scope locks. Must be called only after server-side GET payment status/cancellation verification. No refund API or public Reader capability.';

