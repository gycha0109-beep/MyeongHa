-- Watchtower-Track: security
-- Receipt-based HTTP barrier. No new subject-linked table; default CLOSED.
begin;

create function seyeon_private.pending_positive_delivery_v1(
  p_subject_id uuid,p_memory_id uuid default null,p_grant_id uuid default null
) returns boolean language sql stable security definer
set search_path=pg_catalog,public set row_security=off
as $pending$
  select exists(select 1 from public.chat_turn_attempts a
    where a.subject_id=p_subject_id
      and a.seyeon_positive_delivery_issued_at is not null
      and a.seyeon_positive_delivery_received_at is null
      and (p_memory_id is null or
        a.seyeon_personal_source_pin_jsonb->'positiveProof'->>'recordId'=p_memory_id::text)
      and (p_grant_id is null or
        a.seyeon_personal_source_pin_jsonb->'positiveProof'->>'originalGrantId'=p_grant_id::text));
$pending$;

-- Every destructive/invalidating path must respect durable pending issuance.
-- This includes legacy RPCs and deletion workers, not only the new HTTP route.
create function seyeon_private.guard_positive_delivery_source_v1()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public set row_security=off
as $source_guard$
declare v_subject uuid; v_memory uuid; v_grant uuid;
begin
  if tg_table_name='record_access_grants' then
    if tg_op='UPDATE' and old.seyeon_revoke_requested_at is not null and
       new.seyeon_revoke_requested_at is distinct from old.seyeon_revoke_requested_at then
      raise exception using errcode='23514',constraint='seyeon_revoke_intent_immutable',
        message='Withdrawal intent cannot be reset';
    end if;
    if tg_op='UPDATE' and
       (to_jsonb(new)-'seyeon_revoke_requested_at')=(to_jsonb(old)-'seyeon_revoke_requested_at') then
      return new;
    end if;
    v_subject:=old.subject_id; v_grant:=old.id;
  elsif tg_table_name='memory_items' then
    if tg_op='UPDATE' and new.revoked_at is not distinct from old.revoked_at
       and new.content_jsonb is not distinct from old.content_jsonb
       and new.subject_id is not distinct from old.subject_id
       and new.memory_type is not distinct from old.memory_type
       and new.schema_version is not distinct from old.schema_version
       and new.source_kind is not distinct from old.source_kind then return new; end if;
    v_subject:=old.subject_id; v_memory:=old.id;
  elsif tg_table_name='subjects' then
    if tg_op='UPDATE' and new.kind is not distinct from old.kind
       and new.status is not distinct from old.status
       and new.merged_into_subject_id is not distinct from old.merged_into_subject_id
       and new.auth_user_id is not distinct from old.auth_user_id then return new; end if;
    v_subject:=old.id;
  else raise exception 'Unexpected positive source guard table'; end if;

  perform 1 from public.subjects where id=v_subject for update;
  if seyeon_private.pending_positive_delivery_v1(v_subject,v_memory,v_grant) then
    raise exception using errcode='55000',constraint='seyeon_positive_delivery_receipt_pending',
      message='Source invalidation requires receipt of the already-issued response';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end
$source_guard$;
create trigger tr_seyeon_positive_delivery_grant_guard_v1
before update or delete on public.record_access_grants
for each row execute function seyeon_private.guard_positive_delivery_source_v1();
create trigger tr_seyeon_positive_delivery_memory_guard_v1
before update or delete on public.memory_items
for each row execute function seyeon_private.guard_positive_delivery_source_v1();
create trigger tr_seyeon_positive_delivery_subject_guard_v1
before update or delete on public.subjects
for each row execute function seyeon_private.guard_positive_delivery_source_v1();

create function seyeon_private.guard_positive_delivery_receipt_v1()
returns trigger language plpgsql
set search_path=pg_catalog,public
as $receipt_guard$
begin
  if tg_op='DELETE' then
    if old.seyeon_positive_delivery_issued_at is not null
       and old.seyeon_positive_delivery_received_at is null then
      raise exception using errcode='55000',constraint='seyeon_positive_delivery_receipt_pending',
        message='Unconfirmed issuance cannot be deleted';
    end if;
    return old;
  end if;
  if old.seyeon_positive_delivery_issued_at is not null
     and old.seyeon_positive_delivery_received_at is null and
     (to_jsonb(new)-array['seyeon_positive_delivery_receipt_hash',
       'seyeon_positive_delivery_issued_at','seyeon_positive_delivery_received_at'])
       is distinct from
     (to_jsonb(old)-array['seyeon_positive_delivery_receipt_hash',
       'seyeon_positive_delivery_issued_at','seyeon_positive_delivery_received_at']) then
    raise exception using errcode='55000',constraint='seyeon_positive_delivery_receipt_pending',
      message='Unconfirmed response provenance cannot be invalidated';
  end if;
  if old.seyeon_positive_delivery_issued_at is not null and
     (new.seyeon_positive_delivery_receipt_hash is distinct from old.seyeon_positive_delivery_receipt_hash
      or new.seyeon_positive_delivery_issued_at is distinct from old.seyeon_positive_delivery_issued_at
      or (old.seyeon_positive_delivery_received_at is not null and
          new.seyeon_positive_delivery_received_at is distinct from old.seyeon_positive_delivery_received_at)
      or new.subject_id is distinct from old.subject_id
      or new.turn_id is distinct from old.turn_id
      or new.seyeon_personal_source_pin_jsonb is distinct from old.seyeon_personal_source_pin_jsonb) then
    raise exception using errcode='23514',constraint='seyeon_positive_delivery_receipt_immutable',
      message='Delivery receipt identity is immutable';
  end if;
  if (new.seyeon_positive_delivery_receipt_hash is distinct from old.seyeon_positive_delivery_receipt_hash
      or new.seyeon_positive_delivery_issued_at is distinct from old.seyeon_positive_delivery_issued_at
      or new.seyeon_positive_delivery_received_at is distinct from old.seyeon_positive_delivery_received_at)
     and current_user<>'postgres' then
    raise exception using errcode='42501',constraint='seyeon_positive_delivery_receipt_owner_only',
      message='Only receipt owner commands may change delivery state';
  end if;
  return new;
end
$receipt_guard$;
create trigger tr_seyeon_positive_delivery_attempt_guard_v1
before update or delete on public.chat_turn_attempts
for each row execute function seyeon_private.guard_positive_delivery_receipt_v1();

create function seyeon_private.cmd_request_seyeon_memory_revoke_v1(
  p_subject_id uuid,p_memory_id uuid
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public set row_security=off
as $request_revoke$
declare v_result record;
begin
  perform seyeon_private.lock_memory_subject_v1(p_subject_id);
  perform 1 from public.memory_items
    where id=p_memory_id and subject_id=p_subject_id for update;
  if not found then raise exception using errcode='42501',
    constraint='seyeon_revoke_owned_memory_required',message='Owned Memory required'; end if;

  update public.record_access_grants
  set seyeon_revoke_requested_at=coalesce(seyeon_revoke_requested_at,clock_timestamp())
  where subject_id=p_subject_id and memory_item_id=p_memory_id
    and grantee_character_id='seyeon' and revoked_at is null;
  if seyeon_private.pending_positive_delivery_v1(p_subject_id,p_memory_id,null) then
    return jsonb_build_object('status','pending','memoryItemId',p_memory_id,
      'characterId','seyeon','newUseBlocked',true);
  end if;
  select * into strict v_result from seyeon_private.cmd_revoke_seyeon_memory_grant_v1(
    p_subject_id,p_memory_id);
  return jsonb_build_object('status','committed','memoryItemId',v_result.memory_item_id,
    'characterId','seyeon','revokedGrantCount',v_result.revoked_grant_count,
    'replayed',v_result.replayed);
end
$request_revoke$;

-- The one-use 256-bit capability proves receipt of the complete JSON payload.
-- It grants NO source read, model use, replay, new delivery or new withdrawal.
-- No fresh login is required: logout/account deletion must not make a durable
-- in-flight response permanently impossible to acknowledge.
create function seyeon_private.cmd_ack_seyeon_positive_reply_v1(
  p_attempt_id uuid,p_proof text
) returns boolean language plpgsql security definer
set search_path=pg_catalog,public set row_security=off
as $ack$
declare v_subject uuid; v_memory uuid; v_grant uuid; v_attempt record;
begin
  if p_attempt_id is null or p_proof is null or p_proof !~ '^[a-f0-9]{64}$' then return false; end if;
  select a.subject_id into v_subject from public.chat_turn_attempts a
    where a.id=p_attempt_id
      and a.seyeon_positive_delivery_receipt_hash=sha256(convert_to(p_proof,'UTF8'));
  if not found then return false; end if;
  perform 1 from public.subjects where id=v_subject for update;
  select a.* into v_attempt from public.chat_turn_attempts a
    where a.id=p_attempt_id and a.subject_id=v_subject
      and a.seyeon_positive_delivery_receipt_hash=sha256(convert_to(p_proof,'UTF8'))
    for update;
  if not found or v_attempt.seyeon_positive_delivery_issued_at is null then return false; end if;
  if v_attempt.seyeon_positive_delivery_received_at is not null then return true; end if;
  update public.chat_turn_attempts
    set seyeon_positive_delivery_received_at=clock_timestamp() where id=p_attempt_id;
  update public.chat_turns set state='delivered',delivered_at=clock_timestamp(),
    revision=revision+1,updated_at=clock_timestamp()
    where id=v_attempt.turn_id and subject_id=v_subject and state='committed'
      and committed_attempt_id=p_attempt_id and delivered_at is null;
  if not found then raise exception using errcode='23514',
    constraint='seyeon_positive_delivery_original_turn_required',
    message='Receipt must complete its original committed Turn'; end if;

  v_memory:=(v_attempt.seyeon_personal_source_pin_jsonb->'positiveProof'->>'recordId')::uuid;
  v_grant:=(v_attempt.seyeon_personal_source_pin_jsonb->'positiveProof'->>'originalGrantId')::uuid;
  if exists(select 1 from public.record_access_grants g where g.id=v_grant
      and g.subject_id=v_subject and g.memory_item_id=v_memory
      and g.seyeon_revoke_requested_at is not null and g.revoked_at is null)
     and not seyeon_private.pending_positive_delivery_v1(v_subject,v_memory,null) then
    perform set_config('myeongha.subject_id',v_subject::text,true);
    perform seyeon_private.cmd_revoke_seyeon_memory_grant_v1(v_subject,v_memory);
  end if;
  return true;
end
$ack$;

revoke all on function seyeon_private.pending_positive_delivery_v1(uuid,uuid,uuid),
  seyeon_private.guard_positive_delivery_source_v1(),
  seyeon_private.guard_positive_delivery_receipt_v1(),
  seyeon_private.cmd_request_seyeon_memory_revoke_v1(uuid,uuid),
  seyeon_private.cmd_ack_seyeon_positive_reply_v1(uuid,text)
  from public,anon,authenticated,service_role,myeongha_api_executor;
-- Issue, receipt and withdrawal EXECUTE are granted only by the reviewed
-- activation manifest after target runtime/race/rollback verification.
commit;
