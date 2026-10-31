// Watchtower-Track: commerce-payment
// PRIVATE OFFLINE OPERATIONS ONLY. Product/Legal/merchant activation remains HOLD.
// Counts verified production Reading payments missing valid pre-checkout notices.
// No identifiers, card data, interpretation text, HTTP endpoint or mutations.
export const COMMERCE_PAID_READING_NOTICE_AUDIT_SQL_V1 = `
with paid as (
 select receipt.id, receipt.subject_id, receipt.purchase_intent_id,
        offer.product_id, receipt.verified_at,
        spec.spec_version,
        selection.reader_character_id,
        selection.reader_content_bundle_id
 from public.commerce_receipts receipt
 join public.purchase_intents intent
   on intent.id=receipt.purchase_intent_id and intent.subject_id=receipt.subject_id
   and intent.product_offer_id=receipt.product_offer_id
 join public.product_offers offer on offer.id=intent.product_offer_id
 join public.products product
   on product.id=offer.product_id and product.product_type='reading'
 join public.standard_reading_product_specs spec
   on spec.product_id=product.id and spec.purchase_unit_mode='topic_reader_reading'
 left join public.purchase_intent_reader_selections selection
   on selection.purchase_intent_id=intent.id and selection.product_id=product.id
 where receipt.provider='portone_v2' and receipt.platform='web'
   and receipt.environment='production'
   and receipt.verification_status='verified'
), checked as (
 select paid.*,
        exists(
          select 1 from public.digital_reading_checkout_notice_presentations_v1 presentation
          where presentation.purchase_intent_id=paid.purchase_intent_id
            and presentation.subject_id=paid.subject_id
            and presentation.product_id=paid.product_id
            and presentation.product_spec_version=paid.spec_version
            and presentation.reader_character_id=paid.reader_character_id
            and presentation.reader_content_bundle_id=paid.reader_content_bundle_id
            and presentation.server_presented_at < paid.verified_at
        ) as has_presentation,
        exists(
          select 1 from public.digital_reading_checkout_notice_presentations_v1 presentation
          join public.digital_reading_checkout_notice_acknowledgments_v1 ack
            on ack.purchase_intent_id=presentation.purchase_intent_id
            and ack.unit_id=presentation.unit_id
            and ack.subject_id=presentation.subject_id
            and ack.submitted_challenge_sha256=presentation.challenge_sha256
          join public.digital_reading_checkout_notice_revisions_v1 revision
            on revision.revision_key=presentation.revision_key
            and revision.product_id=presentation.product_id
            and revision.product_spec_version=presentation.product_spec_version
            and revision.authority_state='approved'
            and revision.approved_at<=presentation.server_presented_at
            and revision.notice_sha256=presentation.notice_sha256
            and revision.preview_or_information_sha256=presentation.preview_or_information_sha256
          where presentation.purchase_intent_id=paid.purchase_intent_id
            and presentation.subject_id=paid.subject_id
            and presentation.product_id=paid.product_id
            and presentation.product_spec_version=paid.spec_version
            and presentation.reader_character_id=paid.reader_character_id
            and presentation.reader_content_bundle_id=paid.reader_content_bundle_id
            and ack.acknowledged=true
            and presentation.server_presented_at<ack.server_acknowledged_at
            and ack.server_acknowledged_at<paid.verified_at
        ) as has_approved_acknowledgment
 from paid
)
select
 (select count(*)::text from checked) as "productionVerifiedReadingReceipts",
 (select count(*)::text from checked
   where reader_character_id is null or reader_content_bundle_id is null)
    as "missingPinnedReaderSelection",
 (select count(*)::text from checked where not has_presentation)
    as "missingPrecheckoutNoticePresentation",
 (select count(*)::text from checked
   where has_presentation and not has_approved_acknowledgment)
    as "missingOrInvalidNoticeAcknowledgment"
`.trim();

const FIELDS=Object.freeze([
 'productionVerifiedReadingReceipts',
 'missingPinnedReaderSelection',
 'missingPrecheckoutNoticePresentation',
 'missingOrInvalidNoticeAcknowledgment',
]);
const FINDINGS=Object.freeze(FIELDS.slice(1));

/** Requires the governed full-visibility, read-only PostgreSQL operations role.
 * Empty data never proves Legal clearance, provider settlement or user delivery.
 * Existing production, even without active sale, remains observable.
 */
export async function inspectPaidReadingNoticeEvidenceReadOnlyV1(client){
 let began=false;
 try{
  await client.query('begin isolation level repeatable read read only');
  began=true;
  await client.query("set local statement_timeout='10000ms'");
  const authority=await client.query(`select
    current_setting('transaction_read_only')='on' as "readOnly",
    (rolsuper or rolbypassrls) as "completeVisibility"
    from pg_catalog.pg_roles where rolname=current_user`);
  if(authority.rows.length!==1||authority.rows[0].readOnly!==true||
     authority.rows[0].completeVisibility!==true)
   throw Error('READING_NOTICE_AUDIT_AUTHORITY_REQUIRED');
  const response=await client.query(COMMERCE_PAID_READING_NOTICE_AUDIT_SQL_V1);
  const row=response.rows[0];
  if(response.rows.length!==1||!row||FIELDS.some(key=>
      typeof row[key]!=='string'||!/^(?:0|[1-9][0-9]*)$/u.test(row[key])))
   throw Error('INVALID_READING_NOTICE_AUDIT_RESULT');
  const counts=Object.freeze(Object.fromEntries(FIELDS.map(key=>[key,row[key]])));
  return Object.freeze({
    schemaVersion:'commerce-paid-reading-notice-audit-v1',
    status:FINDINGS.some(key=>counts[key]!=='0')?'review_candidates':'observed',
    counts,legalReleaseApproved:false,refundDenialAuthorized:false,
    providerReconciled:false,consumerDeliveryProven:false,
    pspCallsPerformed:false,writesPerformed:false,
  });
 }finally{
  if(began)await client.query('rollback');
 }
}
