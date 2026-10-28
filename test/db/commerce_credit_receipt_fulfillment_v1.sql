-- Synthetic fixtures for a disposable migrated PostgreSQL database only.
-- No provider calls, real payments or Production fixture writes.
begin;
insert into auth.users(id) values
 ('cfc10000-0000-4000-8000-000000000001'),('cfc10000-0000-4000-8000-000000000002');
insert into public.subjects(id,kind,auth_user_id,status,created_at,updated_at) values
 ('cfc20000-0000-4000-8000-000000000001','member','cfc10000-0000-4000-8000-000000000001','active',now(),now()),
 ('cfc20000-0000-4000-8000-000000000002','member','cfc10000-0000-4000-8000-000000000002','active',now(),now());

create function pg_temp.credit_receipt_fixture(env text) returns uuid language plpgsql as $fixture$
declare
 s uuid:='cfc20000-0000-4000-8000-000000000001';
 pi uuid:=gen_random_uuid();pa uuid:=gen_random_uuid();rid uuid;
 oid uuid:='26100000-0000-4000-8000-000000000003';
 snapshot jsonb;caps jsonb;
begin
 perform set_config('myeongha.subject_id',s::text,true);
 update public.products set enabled=true where product_key='chat_credits_300_v1';
 update public.product_offers set enabled=true where id=oid;
 select jsonb_build_object('productOfferId',po.id::text,'productId',po.product_id::text,
  'platform',po.platform,'provider',po.provider,'externalProductId',po.external_product_id),
  jsonb_build_object('capabilitySetId',pcs.id::text,'definitionVersion',pcs.definition_version,'definitionHash',pcs.definition_hash)
 into snapshot,caps from public.product_offers po join public.product_capability_sets pcs on pcs.id=po.capability_set_id where po.id=oid;
 perform public.cmd_create_purchase_intent_v3(s,pi,oid,null,'fixture-'||pi,'sha256:'||pi,
  snapshot,'sha256:'||pi,caps,'sha256:'||pi);
 perform public.cmd_create_payment_attempt_v1(s,pa,pi,env,'fixture-'||pa,'mha_pa_'||replace(pa::text,'-',''));
 perform public.cmd_transition_payment_attempt_v1(s,pa,'handed_off',null,null);
 select receipt_id into rid from public.cmd_persist_verified_payment_evidence_v1(
  pa,pi,'portone_v2','web',env,'fixture-tx-'||pa,null,null,'myeongha-chat-credits-300-v1','active',
  'hmac-sha256:k1:'||repeat(replace(pi::text,'-',''),2),'fixture-verifier-v1',1900,'KRW',
  '2026-10-28T00:00:00.000Z',null,null,null);
 return rid;
end $fixture$;

create temporary table fulfillment_fixture_receipts(label text primary key,id uuid);
insert into fulfillment_fixture_receipts values
 ('production',pg_temp.credit_receipt_fixture('production')),
 ('rollback',pg_temp.credit_receipt_fixture('production')),
 ('sandbox',pg_temp.credit_receipt_fixture('sandbox'));
-- Close NEW sales after existing purchases. This must not erase paid obligations.
update public.product_offers set enabled=false,display_price_minor=99999
 where id='26100000-0000-4000-8000-000000000003';
update public.products set enabled=false where product_key='chat_credits_300_v1';
commit;
