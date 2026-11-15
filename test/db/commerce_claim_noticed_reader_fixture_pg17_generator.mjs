import {execFileSync} from 'node:child_process';

// Reuse the official B2/B3 Reader fixture. Inject pre-payment notice evidence
// only for exact B2 before its payment status and verified Receipt are written.
const sql=execFileSync(process.execPath,[
 'test/db/commerce_stored_portone_hmac_lineage_pg17_generator.mjs','--fixture',
],{encoding:'utf8',maxBuffer:8*1024*1024});
const anchor=`update public.purchase_intents
set status = 'verified', updated_at = clock_timestamp()
where id in (
  '12192300-0000-0000-0000-000000000002',
  '12192300-0000-0000-0000-000000000003'
);`;
if(sql.split(anchor).length!==2)throw Error('OFFICIAL_B2_B3_NOTICE_PRE_PAYMENT_BOUNDARY_CHANGED');
const notice=String.raw`
-- Test-only server-approved notice, presentation and acknowledgement
-- captured while exact B2 Intent is CREATED and before any verified Receipt.
insert into public.digital_reading_checkout_notice_revisions_v1(
 revision_key,product_id,product_spec_version,
 notice_revision,notice_sha256,
 preview_or_information_revision,preview_or_information_sha256,
 authority_state,approved_at
)
select 'commerce-b2-claim-pg17-notice-v1',offer.product_id,spec.spec_version,
 'commerce-b2-notice-v1',repeat('a',64),
 'commerce-b2-preview-v1',repeat('b',64),
 'approved',clock_timestamp()-interval '1 second'
from public.purchase_intents pi
join public.product_offers offer on offer.id=pi.product_offer_id
join public.standard_reading_product_specs spec on spec.product_id=offer.product_id
where pi.id='12192300-0000-0000-0000-000000000002'::uuid
 and pi.status='created' and spec.purchase_unit_mode='topic_reader_reading';

insert into public.digital_reading_checkout_notice_presentations_v1(
 purchase_intent_id,subject_id,unit_id,product_id,
 reader_character_id,reader_content_bundle_id,product_spec_version,
 revision_key,notice_revision,preview_or_information_revision,
 notice_sha256,preview_or_information_sha256,
 challenge_sha256,presentation_snapshot_sha256
)
select pi.id,pi.subject_id,
 '12192400-0000-4000-8000-000000000002'::uuid,offer.product_id,
 sel.reader_character_id,sel.reader_content_bundle_id,spec.spec_version,
 'commerce-b2-claim-pg17-notice-v1',
 'commerce-b2-notice-v1','commerce-b2-preview-v1',
 repeat('a',64),repeat('b',64),repeat('c',64),repeat('d',64)
from public.purchase_intents pi
join public.product_offers offer on offer.id=pi.product_offer_id
join public.standard_reading_product_specs spec on spec.product_id=offer.product_id
join public.purchase_intent_reader_selections sel
 on sel.purchase_intent_id=pi.id and sel.product_id=offer.product_id
where pi.id='12192300-0000-0000-0000-000000000002'::uuid
 and pi.status='created';

-- The trigger independently stamps both timestamps; do not fake
-- acknowledgedAt or present a browser-supplied challenge as authority.
select pg_catalog.pg_sleep(0.02);
insert into public.digital_reading_checkout_notice_acknowledgments_v1(
 purchase_intent_id,unit_id,subject_id,submitted_challenge_sha256
)
select pres.purchase_intent_id,pres.unit_id,pres.subject_id,pres.challenge_sha256
from public.digital_reading_checkout_notice_presentations_v1 pres
where pres.purchase_intent_id='12192300-0000-0000-0000-000000000002'::uuid;
`;
const withNotice=sql.replace(anchor,notice+'\n'+anchor);
const preBindAnchor=`select pg_temp.assert_v2_true(
  'DB-C1 independent B2 bind reuses one committed official Reading',`;
if(withNotice.split(preBindAnchor).length!==2)
  throw Error('OFFICIAL_B2_UNBOUND_PRE_BIND_GRANT_BOUNDARY_CHANGED');
process.stdout.write(withNotice.replace(preBindAnchor,"\n-- Probe the paid Reader purchase BEFORE its immutable Access bind. The\n-- subtransaction intentionally rolls back all synthetic cancellation changes.\ndo $unbound_replay_probe$\ndeclare\n  v_receipt public.commerce_receipts%rowtype;\n  v_grant uuid;\n  v_revision bigint;\n  v_at timestamptz;\n  v_result jsonb;\n  v_case integer;\n  v_denied integer:=0;\n  v_constraint text;\n  v_rollback boolean:=false;\nbegin\n  select cr.* into strict v_receipt from public.commerce_receipts cr\n   where cr.purchase_intent_id=\n     '12192300-0000-0000-0000-000000000002'::uuid\n     and cr.verification_status='verified';\n  select eg.id,eg.revision into strict v_grant,v_revision\n   from public.entitlement_grants eg\n   where eg.source_receipt_id=v_receipt.id\n     and eg.subject_id=v_receipt.subject_id\n     and eg.grant_source_type='purchase' and eg.status='active';\n  if exists(select 1 from public.standard_reading_reader_access_grants a\n            where a.entitlement_grant_id=v_grant) then\n    raise exception 'UNBOUND_REPLAY_PRE_BIND_GRANT_ALREADY_BOUND';\n  end if;\n  begin\n    v_at:=pg_catalog.clock_timestamp();\n    select public.cmd_apply_verified_portone_reader_full_cancellation_v1(\n      'synthetic-hmac-b2-payment',v_receipt.external_transaction_id,\n      'unbound-b2-exact-replay-probe',v_at,\n      v_receipt.verified_amount_minor,v_receipt.verified_currency,\n      'production','hmac-sha256:k1:'||repeat('c',64),\n      'portone-v2-payment-full-cancel-lookup-v1'\n    ) into strict v_result;\n    if v_result->'revoke'->>'contractVersion' is distinct from\n         'official-reader-s2-unbound-grant-cancellation-v1'\n       or v_result->'revoke'->>'grantCount'<>'1'\n       or v_result->'revoke'->'effects'->0->>'result_replayed'<>'false' then\n      raise exception 'UNBOUND_REPLAY_FIRST_EXACT_REVOKE_FAILED';\n    end if;\n    select public.cmd_apply_verified_portone_reader_full_cancellation_v1(\n      'synthetic-hmac-b2-payment',v_receipt.external_transaction_id,\n      'unbound-b2-exact-replay-probe',v_at,\n      v_receipt.verified_amount_minor,v_receipt.verified_currency,\n      'production','hmac-sha256:k1:'||repeat('c',64),\n      'portone-v2-payment-full-cancel-lookup-v1'\n    ) into strict v_result;\n    if v_result->'revoke'->'effects'->0->>'result_replayed'<>'true' then\n      raise exception 'UNBOUND_REPLAY_IDEMPOTENT_EXACT_EVENT_FAILED';\n    end if;\n    for v_case in 1..2 loop\n      begin\n        if v_case=1 then\n          update public.entitlement_grants\n          set status='active',revision=revision+1,\n              last_effective_at=v_at+interval '1 microsecond',\n              last_provider_ordering_key='synthetic-later-unbound-activation'\n          where id=v_grant and status='revoked';\n        else\n          update public.entitlement_grants\n          set last_provider_ordering_key='synthetic-later-unbound-revoke'\n          where id=v_grant and status='revoked';\n        end if;\n        perform public.cmd_apply_verified_portone_reader_full_cancellation_v1(\n          'synthetic-hmac-b2-payment',v_receipt.external_transaction_id,\n          'unbound-b2-exact-replay-probe',v_at,\n          v_receipt.verified_amount_minor,v_receipt.verified_currency,\n          'production','hmac-sha256:k1:'||repeat('c',64),\n          'portone-v2-payment-full-cancel-lookup-v1'\n        );\n      exception when serialization_failure then\n        get stacked diagnostics v_constraint=constraint_name;\n        if v_constraint='official_reader_unbound_replayed_effect_no_longer_current'\n        then v_denied:=v_denied+1;\n        else raise;\n        end if;\n      end;\n    end loop;\n    if v_denied<>2\n       or (select count(*) from public.entitlement_grants\n           where id=v_grant and status='revoked'\n             and revision=v_revision+1 and last_effective_at=v_at)<>1\n       or (select count(*) from public.entitlement_events\n           where grant_id=v_grant\n             and source_provider_event_id=(\n               select id from public.commerce_provider_events\n               where external_event_id=\n                 'myeongha:portone-v2:full-cancel:v1:unbound-b2-exact-replay-probe'\n             ))<>1 then\n      raise exception 'UNBOUND_REPLAY_SUPERSEDED_GRANT_OR_EVENT_LEAK';\n    end if;\n    raise exception 'UNBOUND_REPLAY_PROBE_FORCE_ROLLBACK';\n  exception when raise_exception then\n    if sqlerrm='UNBOUND_REPLAY_PROBE_FORCE_ROLLBACK' then\n      v_rollback:=true;\n    else raise;\n    end if;\n  end;\n  if not v_rollback\n     or (select count(*) from public.entitlement_grants\n         where id=v_grant and status='active' and revision=v_revision)<>1\n     or (select count(*) from public.commerce_receipts\n         where id=v_receipt.id and verification_status='verified')<>1\n     or exists(\n       select 1 from public.commerce_provider_events\n       where external_event_id=\n         'myeongha:portone-v2:full-cancel:v1:unbound-b2-exact-replay-probe'\n     ) then\n    raise exception 'UNBOUND_REPLAY_PRE_BIND_FIXTURE_NOT_RESTORED';\n  end if;\nend\n$unbound_replay_probe$;\n"+'\n'+preBindAnchor));
