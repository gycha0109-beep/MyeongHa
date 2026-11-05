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
process.stdout.write(sql.replace(anchor,notice+'\n'+anchor));
