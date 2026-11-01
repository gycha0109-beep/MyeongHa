import {execFileSync} from 'node:child_process';
const underlying=execFileSync(process.execPath,[
 'test/db/commerce_exact_reader_withdrawal_hold_pg17_generator.mjs',
],{encoding:'utf8'});
if(!underlying.trimEnd().endsWith('rollback;')||
   !underlying.includes('COMMERCE_EXACT_READER_LEGAL_EVIDENCE_HOLD_PG17_PASS'))
 throw Error('READER_DELIVERY_OFFICIAL_FIXTURE_NOT_VERIFIED');
const extra=String.raw`
do $reader_delivery_transport$
declare
 b2 public.standard_reading_reader_access_grants%rowtype;
 b3 public.standard_reading_reader_access_grants%rowtype;
 attempt_id uuid:='12197700-0000-4000-8000-000000000001'::uuid;
 body_id uuid:='12197700-0000-4000-8000-000000000002'::uuid;
 safe_message_id uuid:='12197700-0000-4000-8000-000000000003'::uuid;
 challenge text:='hmac-sha256:k1:'||repeat('a',64);
 wrong_challenge text:='hmac-sha256:k1:'||repeat('b',64);
 prepared record;
 repeated record;
 acknowledged record;
 repeated_ack record;
 rejected boolean;
begin
 select * into strict b2
 from public.standard_reading_reader_access_grants
 where purchase_intent_id='12192300-0000-0000-0000-000000000002'::uuid;
 select * into strict b3
 from public.standard_reading_reader_access_grants
 where purchase_intent_id='12192300-0000-0000-0000-000000000003'::uuid;

 select * into strict prepared
 from public.internal_prepare_reader_delivery_transport_v1(
  attempt_id,b2.purchase_intent_id,b2.subject_id,b2.entitlement_grant_id,
  b2.official_reading_id,b2.reader_character_id,b2.reader_content_bundle_id,
  body_id,safe_message_id,challenge);
 if prepared.delivery_attempt_id is distinct from attempt_id
   or prepared.response_prepared_at is null then
  raise exception 'READER_DELIVERY_PREPARE_NOT_PERSISTED';
 end if;
 select * into strict repeated
 from public.internal_prepare_reader_delivery_transport_v1(
  attempt_id,b2.purchase_intent_id,b2.subject_id,b2.entitlement_grant_id,
  b2.official_reading_id,b2.reader_character_id,b2.reader_content_bundle_id,
  body_id,safe_message_id,challenge);
 if repeated.response_prepared_at is distinct from prepared.response_prepared_at
 then raise exception 'READER_DELIVERY_PREPARE_REPLAY_CHANGED'; end if;

 rejected:=false;
 begin
  perform public.internal_prepare_reader_delivery_transport_v1(
   attempt_id,b3.purchase_intent_id,b3.subject_id,b3.entitlement_grant_id,
   b3.official_reading_id,b3.reader_character_id,b3.reader_content_bundle_id,
   body_id,safe_message_id,challenge);
 exception when check_violation then rejected:=true;
 end;
 if not rejected then
  raise exception 'READER_DELIVERY_CROSS_PURCHASE_ACCEPTED';
 end if;

 rejected:=false;
 begin
  perform public.internal_ack_reader_delivery_transport_v1(
   attempt_id,b2.subject_id,wrong_challenge);
 exception when check_violation then rejected:=true;
 end;
 if not rejected or exists(
  select 1 from public.commerce_reader_delivery_client_acks_v1
  where delivery_attempt_id=attempt_id
 ) then raise exception 'READER_DELIVERY_WRONG_ACK_ACCEPTED'; end if;

 select * into strict acknowledged
 from public.internal_ack_reader_delivery_transport_v1(
  attempt_id,b2.subject_id,challenge);
 select * into strict repeated_ack
 from public.internal_ack_reader_delivery_transport_v1(
  attempt_id,b2.subject_id,challenge);
 if acknowledged.client_acknowledged_at is null
    or repeated_ack.client_acknowledged_at
       is distinct from acknowledged.client_acknowledged_at then
  raise exception 'READER_DELIVERY_ACK_REPLAY_CHANGED';
 end if;
 if (select count(*) from public.commerce_reader_delivery_preparations_v1
     where delivery_attempt_id=attempt_id) <> 1
    or (select count(*) from public.commerce_reader_delivery_client_acks_v1
     where delivery_attempt_id=attempt_id) <> 1 then
  raise exception 'READER_DELIVERY_DUPLICATE_RECEIPT';
 end if;

 raise notice 'PASS exact Reader B2 response preparation and client ACK persisted once, B3 wrong grant denied; not human-read evidence';
end;
$reader_delivery_transport$;
select 'COMMERCE_READER_DELIVERY_TRANSPORT_PG17_PASS' as result;
`;
process.stdout.write(underlying.replace(/\nrollback;\s*$/u,'\n'+extra+'\nrollback;\n'));
